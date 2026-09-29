import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import * as Y from 'yjs';
import { api, post, escape, copy } from './api.js';
import { screenRoom } from './tela.js';

function from64(value) { return Uint8Array.from(atob(value), char => char.charCodeAt(0)); }
function to64(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}

export async function documentPage(app, id) {
  const initial = await api(`/api/documents/${id}`);
  app.innerHTML = `<div class="section-heading"><div><a class="back" href="/grupos/${initial.groupId}">← Voltar ao grupo</a><h1>${escape(initial.name)}</h1><span id="save-status" class="save-status">Conectando…</span></div><div class="row"><span id="people"></span><button id="copy-document">Copiar link</button></div></div>
    <p id="editor-error" class="error" role="alert"></p><div class="editor-workspace"><section class="card document-surface"><div class="editor-toolbar" role="toolbar" aria-label="Formatação do documento"></div><div id="document-content"></div></section>
    <aside class="card screen-panel"><h2>Tela ao vivo</h2><p class="muted">Mostre uma janela ou aba para as pessoas deste documento.</p><button class="primary" id="share-screen">Compartilhar tela</button><p id="screen-error" class="error" role="alert"></p><div id="screens"></div><small>Você escolhe o que mostrar e pode parar a qualquer momento. O site não grava a tela.</small></aside></div>`;
  app.querySelector('#copy-document').onclick = () => copy(location.href);
  const status = app.querySelector('#save-status'), errorBox = app.querySelector('#editor-error');
  const ydoc = new Y.Doc();
  if (initial.state) Y.applyUpdate(ydoc, from64(initial.state), 'remote');
  let revision = initial.revision, saving = false, polling = false, closed = false, lastEdit = 0;
  const pending = [];
  const editor = new Editor({
    element: app.querySelector('#document-content'),
    extensions: [StarterKit.configure({ undoRedo: false }), Collaboration.configure({ document: ydoc })],
    editorProps: { attributes: { class: 'collaborative-page', 'aria-label': 'Conteúdo do documento compartilhado', spellcheck: 'true' } },
  });
  const actions = [
    ['Negrito', 'N', () => editor.chain().focus().toggleBold().run()],
    ['Itálico', 'I', () => editor.chain().focus().toggleItalic().run()],
    ['Título', 'H1', () => editor.chain().focus().toggleHeading({ level: 1 }).run()],
    ['Lista', '•', () => editor.chain().focus().toggleBulletList().run()],
    ['Lista numerada', '1.', () => editor.chain().focus().toggleOrderedList().run()],
    ['Desfazer', '↶', () => editor.chain().focus().undo().run()],
    ['Refazer', '↷', () => editor.chain().focus().redo().run()],
  ];
  for (const [label, text, action] of actions) {
    const button = document.createElement('button');
    button.textContent = text; button.title = label; button.setAttribute('aria-label', label); button.onclick = action;
    app.querySelector('.editor-toolbar').append(button);
  }
  // Só as mudanças locais entram na fila. Yjs combina edições concorrentes.
  ydoc.on('update', (update, origin) => {
    if (origin === 'remote') return;
    pending.push(update); lastEdit = Date.now(); status.textContent = 'Alterações ainda não salvas…';
  });
  async function save() {
    if (saving || !pending.length || closed) return;
    saving = true;
    const updates = pending.splice(0);
    status.textContent = 'Salvando…';
    try {
      const saved = await post(`/api/documents/${id}`, { update: to64(Y.mergeUpdates(updates)) });
      Y.applyUpdate(ydoc, from64(saved.state), 'remote');
      revision = Math.max(revision, saved.revision);
      errorBox.textContent = '';
      status.textContent = pending.length ? 'Salvando…' : 'Todas as alterações salvas';
    } catch (error) {
      pending.unshift(...updates);
      errorBox.textContent = `${error.message} Mantenha esta página aberta para tentar novamente.`;
      status.textContent = 'Alterações ainda não salvas';
    } finally { saving = false; }
  }
  const room = screenRoom(id, app);
  function people(peers) {
    room.setPeers(peers);
    app.querySelector('#people').textContent = `${peers.length} online`;
  }
  async function poll() {
    if (polling || closed || document.hidden) return;
    polling = true;
    try {
      const current = await api(`/api/documents/${id}?revision=${revision}`);
      if (closed) return;
      if (current.state) Y.applyUpdate(ydoc, from64(current.state), 'remote');
      revision = Math.max(revision, current.revision);
      people(current.peers);
      if (!pending.length && !saving) { status.textContent = 'Todas as alterações salvas'; errorBox.textContent = ''; }
    } catch (error) { errorBox.textContent = error.message; status.textContent = 'Sem conexão com o documento'; }
    finally { polling = false; }
  }
  people(initial.peers);
  status.textContent = 'Todas as alterações salvas';
  const saveTimer = setInterval(() => { if (Date.now() - lastEdit > 700) void save(); }, 1000);
  const pollTimer = setInterval(poll, 3000);
  window.addEventListener('beforeunload', event => { if (pending.length || saving) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('pagehide', () => { closed = true; clearInterval(saveTimer); clearInterval(pollTimer); room.close(); editor.destroy(); ydoc.destroy(); }, { once: true });
}
