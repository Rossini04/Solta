import { api, post, escape, size, date, message, copy, modal } from './api.js';

export function storageMeter(session) {
  if (!session.user) return '';
  return `<div class="storage-meter"><span>${size(session.storage.used)} de 10 GB ocupados</span><progress max="${session.storage.limit}" value="${session.storage.used}" aria-label="Espaço ocupado"></progress><small>Exclua arquivos para liberar espaço. Envios em andamento também contam.</small></div>`;
}
export function uploadCard(session, folderId = null, publicFolder = true) {
  return `<section class="card" aria-label="Enviar arquivo"><h2>Novo arquivo</h2>
    <div class="drop-zone" id="drop-zone"><span class="upload-symbol" aria-hidden="true">↑</span><h2>Solte seu arquivo aqui</h2><p>Ou escolha um arquivo do seu computador.</p>
    ${session.user ? '<button class="primary" id="choose-file">Escolher arquivo</button><input id="file-input" type="file" hidden>' : '<a class="button primary" href="/entrar">Entrar para enviar</a>'}</div>
    <p class="muted"><small>${publicFolder ? 'Arquivos nesta área podem ser compartilhados por link e expiram em 15 dias.' : 'O acesso segue as permissões da pasta. O arquivo ocupa espaço até ser excluído.'}</small></p>
    <div id="upload-queue" class="queue" aria-live="polite"></div>${storageMeter(session)}</section>`;
}

export function bindUpload(session, { folderId = null, onComplete = () => {} } = {}) {
  const input = document.querySelector('#file-input');
  if (!input) return;
  const drop = document.querySelector('#drop-zone'), queue = document.querySelector('#upload-queue');
  const chooser = document.querySelector('#choose-file');
  let busy = false, chosen, transfer, upload, uploaded = 0, cancelRequested = false;
  chooser.onclick = () => input.click();
  input.onchange = () => select(input.files[0]);
  drop.ondragover = event => { event.preventDefault(); drop.classList.add('dragging'); };
  drop.ondragleave = () => drop.classList.remove('dragging');
  drop.ondrop = event => { event.preventDefault(); drop.classList.remove('dragging'); if (event.dataTransfer.files.length > 1) message('Envie um arquivo por vez.'); select(event.dataTransfer.files[0]); };
  function select(file) {
    if (busy || !file) return;
    if (upload) { message('Cancele ou termine o envio atual antes de escolher outro.'); return; }
    if (!file.size || file.size > 10000000000) { message('Escolha um arquivo entre 1 B e 10 GB.'); return; }
    chosen = file; uploaded = 0;
    queue.innerHTML = `<strong>${escape(file.name)}</strong><p class="muted">${size(file.size)}</p><progress value="0" max="100" aria-label="Progresso do envio"></progress><p id="upload-status">Pronto para enviar.</p><div class="row"><button class="primary" id="send">Enviar arquivo</button><button id="cancel">Cancelar</button></div>`;
    queue.querySelector('#send').onclick = send;
    queue.querySelector('#cancel').onclick = cancel;
  }
  const warn = event => { if (busy || upload) { event.preventDefault(); event.returnValue = ''; } };
  window.addEventListener('beforeunload', warn);
  function progress(value) { queue.querySelector('progress').value = value; }
  function status(text) { queue.querySelector('#upload-status').textContent = text; }
  function putPart(bytes, number) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      transfer = xhr;
      xhr.open('PUT', `/api/uploads/${upload.id}?part=${number}`);
      xhr.timeout = 180000;
      xhr.setRequestHeader('Authorization', `Bearer ${upload.token}`);
      xhr.upload.onprogress = event => progress(Math.min(99, (uploaded + event.loaded) / chosen.size * 100));
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else { let error; try { error = JSON.parse(xhr.responseText).error; } catch {} reject(new Error(error || 'O envio falhou. Tente novamente.')); }
      };
      xhr.onerror = () => reject(new Error('A conexão caiu. Tente continuar o envio.'));
      xhr.ontimeout = () => reject(new Error('A conexão demorou demais. Tente continuar o envio.'));
      xhr.onabort = () => reject(new Error('Envio interrompido.'));
      xhr.send(bytes);
    });
  }
  async function send() {
    if (busy || !chosen) return;
    busy = true; cancelRequested = false; chooser.disabled = true;
    const sendButton = queue.querySelector('#send');
    sendButton.disabled = true;
    try {
      status('Preparando envio…');
      if (!upload) upload = await post('/api/files', { name: chosen.name, size: chosen.size, mime: chosen.type, folderId });
      if (cancelRequested) return;
      for (let start = uploaded; start < chosen.size; start += upload.chunkSize) {
        if (cancelRequested) return;
        const part = Math.floor(start / upload.chunkSize) + 1;
        status(`Enviando ${size(uploaded)} de ${size(chosen.size)}…`);
        await putPart(chosen.slice(start, start + upload.chunkSize), part);
        uploaded = Math.min(start + upload.chunkSize, chosen.size);
      }
      if (cancelRequested) return;
      status('Finalizando…');
      const file = await api(`/api/uploads/${upload.id}`, { method: 'POST', headers: { Authorization: `Bearer ${upload.token}` } });
      upload = null; progress(100); status('Arquivo enviado.');
      queue.innerHTML = `<div class="notice">Arquivo enviado. <a href="/f/${file.id}">Abrir e compartilhar</a></div>`;
      await onComplete();
    } catch (error) {
      if (!cancelRequested) { status(error.message); sendButton.textContent = 'Tentar continuar'; }
    } finally {
      busy = false; chooser.disabled = false; sendButton.disabled = false;
      if (cancelRequested) await cancel();
    }
  }
  async function cancel() {
    cancelRequested = true;
    transfer?.abort();
    if (busy) { status('Cancelando…'); return; }
    try {
      if (upload) await api(`/api/uploads/${upload.id}`, { method: 'DELETE' });
      upload = null; chosen = null; uploaded = 0; queue.innerHTML = ''; input.value = '';
      message('Envio cancelado. O espaço foi liberado.');
      await onComplete();
    } catch (error) { status(`${error.message} Você também pode excluir o envio em Meus arquivos.`); }
  }
}

export function fileRow(file) {
  const ready = file.status === 'ready' && (!file.expires_at || file.expires_at > Date.now());
  const state = file.status === 'uploading' ? 'Envio incompleto' : file.status === 'deleting' ? 'Exclusão pendente' : file.expires_at && file.expires_at <= Date.now() ? 'Expirado; aguardando limpeza' : file.expires_at ? `Expira em ${date(file.expires_at)}` : 'Até você excluir';
  return `<div class="file-row"><div class="file-info"><span class="file-icon" aria-hidden="true">▤</span><div><strong>${ready ? `<a href="/f/${file.id}">${escape(file.name)}</a>` : escape(file.name)}</strong><small>${size(file.size)} · ${state}</small></div></div><div class="file-actions">
    ${ready ? `<a class="button" href="/api/download/${file.id}">Baixar</a><button data-copy="${file.id}">Link</button>` : ''}
    ${file.canDelete ? `<button class="danger" data-delete="${file.id}" data-name="${escape(file.name)}">Excluir</button>` : ready ? `<button data-report="${file.id}">Denunciar</button>` : ''}</div></div>`;
}
export async function fileList(element, query = '', append = false, onChange = () => {}) {
  const result = await api(`/api/files?${query}`);
  if (!append) element.innerHTML = '';
  element.insertAdjacentHTML('beforeend', result.files.map(fileRow).join(''));
  if (!element.children.length) element.innerHTML = '<div class="empty"><strong>Nenhum arquivo aqui ainda.</strong>Os arquivos enviados aparecerão nesta lista.</div>';
  bindFileActions(element, onChange);
  return result.hasMore;
}
export function bindFileActions(element, onChange) {
  element.querySelectorAll('[data-copy]').forEach(button => { button.onclick = () => copy(`${location.origin}/f/${button.dataset.copy}`); });
  element.querySelectorAll('[data-delete]').forEach(button => {
    button.onclick = () => modal('Excluir arquivo', `<p>Excluir <strong>${escape(button.dataset.name)}</strong>? O espaço será liberado após a exclusão.</p>`, async () => {
      await api(`/api/files/${button.dataset.delete}`, { method: 'DELETE' });
      message('Arquivo excluído.'); await onChange();
    });
  });
  element.querySelectorAll('[data-report]').forEach(button => {
    button.onclick = () => modal('Denunciar arquivo', '<label>Motivo<select name="reason"><option>Conteúdo ilegal</option><option>Arquivo malicioso</option><option>Direitos autorais</option><option>Dados pessoais</option><option>Outro motivo</option></select></label><label>Detalhes<textarea name="details" maxlength="2000"></textarea></label>', async data => {
      await post('/api/reports', { fileId: button.dataset.report, ...data }); message('Denúncia enviada para análise.');
    });
  });
}
