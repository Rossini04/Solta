import { api, post, escape, date, message, copy, modal } from './api.js';
import { uploadCard, bindUpload, fileList } from './arquivos.js';

const accessNames = { public: 'Pública', private: 'Privada', group: 'Do grupo' };
function heading(title, text, action = '') {
  return `<div class="section-heading"><div><h1>${escape(title)}</h1><p>${escape(text)}</p></div>${action}</div>`;
}
function folderCard(folder) {
  return `<a class="card resource-card" href="/pastas/${folder.id}"><span class="file-icon" aria-hidden="true">▱</span><strong>${escape(folder.name)}</strong><small>${accessNames[folder.access]}${folder.protected ? ' · Com senha' : ''}${folder.owner ? ' · Sua pasta' : ''}</small></a>`;
}
async function createFolder(groups, after, selected = '') {
  modal('Nova pasta', `<label>Nome<input name="name" required maxlength="100"></label><label>Acesso<select name="access"><option value="public">Pública</option><option value="private">Só eu</option>${groups.length ? '<option value="group">Membros do grupo</option>' : ''}</select></label>
    ${groups.length ? `<label>Grupo (usado em “Membros do grupo”)<select name="groupId">${groups.map(group => `<option value="${group.id}" ${group.id === selected ? 'selected' : ''}>${escape(group.name)}</option>`).join('')}</select></label>` : ''}
    <label>Senha opcional<input name="password" type="password" minlength="6" maxlength="128" autocomplete="new-password"></label><small>Arquivos públicos expiram em 15 dias. Os demais permanecem até você excluir e também ocupam sua cota.</small>`, async data => {
      const result = await post('/api/folders', data); await after(result.id);
    });
}
export async function foldersPage(app, session) {
  const result = await api('/api/folders');
  app.innerHTML = heading('Pastas', 'Organize arquivos e escolha quem pode acessar.', session.user ? '<button class="primary" id="new-folder">Nova pasta</button>' : '<a class="button primary" href="/entrar">Entrar para criar pasta</a>')
    + `<div class="resource-grid">${result.folders.map(folderCard).join('')}</div>`
    + (!result.folders.length ? '<div class="card empty">Nenhuma pasta disponível.</div>' : '');
  if (session.user) app.querySelector('#new-folder').onclick = async () => {
    try { const groups = await api('/api/groups'); await createFolder(groups.groups, id => location.assign(`/pastas/${id}`)); }
    catch (error) { message(error.message); }
  };
}
export async function folderPage(app, session, id) {
  const folder = await api(`/api/folders?id=${id}`);
  app.innerHTML = `<a class="back" href="/pastas">← Todas as pastas</a>` + heading(folder.name, `${accessNames[folder.access]}${folder.protected ? ' · Protegida por senha' : ''}`, '<button id="copy-folder">Copiar link</button>');
  app.querySelector('#copy-folder').onclick = () => copy(location.href);
  if (folder.locked) {
    app.insertAdjacentHTML('beforeend', '<section class="card auth-card"><h2>Digite a senha da pasta</h2><form><label>Senha<input name="password" type="password" required maxlength="128"></label><p class="error" role="alert"></p><button class="primary">Abrir pasta</button></form></section>');
    app.querySelector('form').onsubmit = async event => {
      event.preventDefault();
      try { await post(`/api/folders/${id}/unlock`, Object.fromEntries(new FormData(event.target))); await folderPage(app, session, id); }
      catch (error) { app.querySelector('.error').textContent = error.message; }
    };
    return;
  }
  if (session.user && (folder.owner || folder.access === 'group' || session.admin)) app.insertAdjacentHTML('beforeend', uploadCard(session, id, folder.access === 'public'));
  app.insertAdjacentHTML('beforeend', '<section class="section"><h2>Arquivos da pasta</h2><div class="file-list" id="folder-files"></div><button id="more" hidden>Carregar mais</button></section>');
  let offset = 0;
  async function refresh(append = false) {
    if (!append) offset = 0;
    app.querySelector('#more').hidden = !await fileList(app.querySelector('#folder-files'), `folder=${id}&offset=${offset}`, append, () => refresh());
  }
  app.querySelector('#more').onclick = () => { offset += 40; refresh(true).catch(error => message(error.message)); };
  bindUpload(session, { folderId: id, onComplete: () => refresh() });
  await refresh();
}
export async function groupsPage(app, session) {
  if (!session.user) return false;
  const result = await api('/api/groups');
  app.innerHTML = heading('Seus grupos', 'Junte as pessoas, os arquivos e os documentos.', '<button class="primary" id="new-group">Criar grupo</button>')
    + `<div class="resource-grid">${result.groups.map(group => `<a class="card resource-card" href="/grupos/${group.id}"><span class="file-icon" aria-hidden="true">◎</span><strong>${escape(group.name)}</strong><small>${group.member_count} participante(s)</small></a>`).join('')}</div>`
    + (!result.groups.length ? '<div class="card empty">Você ainda não participa de grupos.</div>' : '')
    + '<section class="card section"><h2>Recebeu um convite?</h2><form id="join-group"><label>Código do convite<input name="invite" required maxlength="100"></label><p class="form-error error" role="alert"></p><button>Entrar no grupo</button></form></section>';
  app.querySelector('#new-group').onclick = () => modal('Criar grupo', '<label>Nome do grupo<input name="name" required maxlength="100"></label>', async data => { const group = await post('/api/groups', data); location.assign(`/grupos/${group.id}`); });
  app.querySelector('#join-group').onsubmit = async event => {
    event.preventDefault();
    try { const group = await post('/api/groups', Object.fromEntries(new FormData(event.target))); location.assign(`/grupos/${group.id}`); }
    catch (error) { app.querySelector('.form-error').textContent = error.message; }
  };
  return true;
}
export async function groupPage(app, id) {
  const [result, docs, folderResult] = await Promise.all([api(`/api/groups?id=${id}`), api(`/api/documents?group=${id}`), api('/api/folders')]);
  const group = result.group;
  const folders = folderResult.folders.filter(folder => folder.group_id === id);
  app.innerHTML = '<a class="back" href="/grupos">← Meus grupos</a>' + heading(group.name, 'Editem documentos juntos e compartilhem a tela.', '<button id="invite">Copiar convite</button>')
    + `<section class="card"><h2>Participantes</h2>${result.members.map(person => `<span class="member-chip">${escape(person.name)}</span>`).join('')}</section>`
    + `<section class="section"><div class="row between"><h2>Documentos</h2><button class="primary" id="new-document">Novo documento</button></div><div class="resource-grid">${docs.documents.map(doc => `<a class="card resource-card" href="/documentos/${doc.id}"><span class="file-icon">▤</span><strong>${escape(doc.name)}</strong><small>Atualizado em ${date(doc.updated_at)}</small></a>`).join('')}</div>${!docs.documents.length ? '<div class="empty">Crie o primeiro documento do grupo.</div>' : ''}</section>`
    + `<section class="section"><div class="row between"><h2>Pastas do grupo</h2><button id="new-folder">Nova pasta</button></div><div class="resource-grid">${folders.map(folderCard).join('')}</div></section>`;
  app.querySelector('#invite').onclick = () => copy(group.invite);
  app.querySelector('#new-document').onclick = () => modal('Novo documento', '<label>Nome<input name="name" required maxlength="100"></label>', async data => {
    const doc = await post('/api/documents', { ...data, groupId: id }); location.assign(`/documentos/${doc.id}`);
  });
  app.querySelector('#new-folder').onclick = () => createFolder([group], folder => location.assign(`/pastas/${folder}`), id);
}
export async function moderationPage(app) {
  const { reports } = await api('/api/reports');
  app.innerHTML = heading('Moderação', 'Analise as denúncias e remova arquivos quando necessário.', '<button id="cleanup">Limpar arquivos expirados</button>')
    + reports.map(report => `<section class="card section"><h2>${escape(report.name || 'Arquivo removido')}</h2><p><strong>${escape(report.reason)}</strong></p><p>${escape(report.details)}</p><small>${date(report.created_at)}</small><div class="row"><a class="button" href="/f/${report.file_id}">Ver arquivo</a><button class="danger" data-remove="${report.file_id}">Remover arquivo</button><button data-dismiss="${report.id}">Arquivar denúncia</button></div></section>`).join('')
    + (!reports.length ? '<div class="card empty">Nenhuma denúncia pendente.</div>' : '');
  app.querySelectorAll('[data-remove]').forEach(button => { button.onclick = () => modal('Remover arquivo denunciado', '<p>A exclusão remove o arquivo para todas as pessoas.</p>', async () => { await api(`/api/files/${button.dataset.remove}`, { method: 'DELETE' }); await moderationPage(app); }); });
  app.querySelectorAll('[data-dismiss]').forEach(button => { button.onclick = async () => { try { await api('/api/reports', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: button.dataset.dismiss }) }); await moderationPage(app); } catch (error) { message(error.message); } }; });
  app.querySelector('#cleanup').onclick = async () => { try { const result = await post('/api/admin/cleanup'); message(`${result.removed} arquivo(s) removido(s).`); } catch (error) { message(error.message); } };
}
