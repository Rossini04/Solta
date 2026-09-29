import { api, post, escape, size, date, message, copy } from './api.js';
import { uploadCard, bindUpload, storageMeter, fileList, fileRow, bindFileActions } from './arquivos.js';
import { foldersPage, folderPage, groupsPage, groupPage, moderationPage } from './biblioteca.js';
import { infoPage } from './paginas.js';

const app = document.querySelector('#app');
const path = location.pathname.replace(/\/$/, '') || '/';
let session = { user: null, admin: false, storage: { used: 0, limit: 10000000000 } };

export async function refreshSession() {
  session = await api('/api/session');
  const account = document.querySelector('#account');
  account.innerHTML = session.user
    ? `<span class="account-name">${escape(session.user.name)}</span>${session.admin ? '<a href="/moderacao">Moderação</a>' : ''}<button id="logout">Sair</button>`
    : '<a class="button" href="/entrar">Entrar</a>';
  const logout = document.querySelector('#logout');
  if (logout) logout.onclick = async () => { try { await post('/api/auth/logout'); location.assign('/'); } catch (error) { message(error.message); } };
  return session;
}

async function home(mine = false) {
  if (mine && !session.user) return accountRequired();
  app.innerHTML = `<div class="section-heading"><div><div class="eyebrow">${mine ? 'Seu espaço' : 'Compartilhe com um link'}</div><h1>${mine ? 'Meus arquivos' : 'Arquivos grandes. Sem complicação.'}</h1><p>${mine ? 'Gerencie seus 10 GB e libere espaço quando precisar.' : 'Envie, copie o link e compartilhe.'}</p></div></div>
    <div class="workspace-grid">${uploadCard(session)}<aside class="capacity-card"><div class="eyebrow">Espaço por conta</div><div class="capacity-number">10<span>GB</span></div><p>Para guardar seus arquivos.</p><hr><ol><li>Entre na sua conta.</li><li>Envie e copie o link.</li><li>Compartilhe com quem quiser.</li></ol><small>Arquivos públicos ficam disponíveis por até 15 dias.</small></aside></div>
    ${session.uploadInterval ? `<p class="notice">Um novo envio a cada ${session.uploadInterval / 3600000} horas.${session.nextUploadAt ? ` Próximo envio: ${date(session.nextUploadAt)}.` : ''}</p>` : ''}
    <section class="section"><div class="row between"><h2>${mine ? 'Tudo que ocupa seu espaço' : 'Arquivos públicos'}</h2><button id="refresh">Atualizar</button></div><div id="file-list" class="file-list"></div><div class="row"><button id="more" hidden>Carregar mais</button></div></section>`;
  let offset = 0;
  const list = app.querySelector('#file-list');
  async function refresh(append = false) {
    if (!append) offset = 0;
    try { app.querySelector('#more').hidden = !await fileList(list, `${mine ? 'mine=1&' : ''}offset=${offset}`, append, async () => { await refresh(); await refreshMeters(); }); }
    catch (error) { list.innerHTML = `<div class="empty error">${escape(error.message)}</div>`; }
  }
  async function refreshMeters() {
    await refreshSession();
    const meter = app.querySelector('.storage-meter');
    if (meter) meter.outerHTML = storageMeter(session);
  }
  app.querySelector('#refresh').onclick = () => refresh();
  app.querySelector('#more').onclick = () => { offset += 40; void refresh(true); };
  bindUpload(session, { onComplete: async () => { await refresh(); await refreshMeters(); } });
  await refresh();
}

export function accountRequired() {
  app.innerHTML = '<section class="card auth-card"><h1>Entre na sua conta</h1><p>Use sua conta para enviar arquivos, organizar pastas e participar de grupos.</p><a class="button primary" href="/entrar">Entrar ou criar conta</a></section>';
}

function authPage(mode) {
  const register = mode === 'register', recover = mode === 'recover';
  const title = register ? 'Crie sua conta' : recover ? 'Recuperar acesso' : 'Entre no Solta';
  app.innerHTML = `<section class="card auth-card"><h1>${title}</h1><p class="muted">${register ? 'Guarde até 10 GB e compartilhe seus arquivos.' : recover ? 'Use o código que você guardou ao criar sua conta.' : 'Seus arquivos, pastas e grupos em um só lugar.'}</p>
    <form id="auth-form"><label>Nome de usuário<input name="username" autocomplete="username" required minlength="3" maxlength="32" pattern="[a-zA-Z0-9_]{3,32}" autocapitalize="none" spellcheck="false"></label>
    ${recover ? '<label>Código de recuperação<input name="recoveryCode" required maxlength="100" autocomplete="off"></label>' : ''}
    <label>${recover ? 'Nova senha' : 'Senha'}<input name="password" type="password" autocomplete="${register || recover ? 'new-password' : 'current-password'}" required minlength="10" maxlength="128"></label>
    ${register ? '<small>Use pelo menos 10 caracteres. Seu código de recuperação será mostrado depois do cadastro.</small>' : ''}
    <p class="form-error error" role="alert"></p><button class="primary" type="submit">${register ? 'Criar conta' : recover ? 'Redefinir senha' : 'Entrar'}</button></form>
    <div class="auth-tabs">${register || recover ? '<a href="/entrar">Já tenho conta</a>' : '<a href="/cadastro">Criar conta</a><a href="/recuperar">Esqueci a senha</a>'}</div></section>`;
  app.querySelector('form').onsubmit = async event => {
    event.preventDefault();
    const form = event.target, button = form.querySelector('button');
    button.disabled = true;
    try {
      const result = await post(`/api/auth/${mode}`, Object.fromEntries(new FormData(form)));
      if (result.recoveryCode) {
        await refreshSession();
        app.innerHTML = `<section class="card auth-card"><h1>Guarde este código</h1><p>Ele permite recuperar sua conta se você esquecer a senha. Salve em um lugar seguro: não será mostrado novamente.</p><code class="recovery-code">${escape(result.recoveryCode)}</code><p></p><div class="row"><button id="copy-code">Copiar código</button><a class="button primary" href="/meus-arquivos">Guardei, continuar</a></div></section>`;
        app.querySelector('#copy-code').onclick = async () => { try { await navigator.clipboard.writeText(result.recoveryCode); message('Código copiado. Guarde em um lugar seguro.'); } catch { message('Selecione o código e copie manualmente.'); } };
      } else location.assign('/meus-arquivos');
    } catch (error) { form.querySelector('.form-error').textContent = error.message; button.disabled = false; }
  };
}

async function sharedFile(id) {
  try {
    const file = await api(`/api/files?id=${id}`);
    app.innerHTML = `<a class="back" href="/">← Arquivos públicos</a><section class="card shared"><div class="eyebrow">Arquivo compartilhado</div><h1>${escape(file.name)}</h1><p class="muted">${size(file.size)} · ${file.expires_at ? `Disponível até ${date(file.expires_at)}` : 'Disponível conforme as permissões da pasta'}</p><div id="shared-actions">${fileRow(file)}</div></section>`;
    bindFileActions(app, () => { location.assign('/meus-arquivos'); });
  } catch (error) {
    if (error.folderId) {
      app.innerHTML = `<section class="card auth-card"><h1>Pasta protegida</h1><p>Digite a senha da pasta para abrir este arquivo.</p><form><label>Senha<input name="password" type="password" required maxlength="128"></label><p class="error" role="alert"></p><button class="primary">Abrir arquivo</button></form></section>`;
      app.querySelector('form').onsubmit = async event => {
        event.preventDefault();
        try { await post(`/api/folders/${error.folderId}/unlock`, Object.fromEntries(new FormData(event.target))); await sharedFile(id); }
        catch (failure) { app.querySelector('.error').textContent = failure.message; }
      };
    } else throw error;
  }
}

async function start() {
  document.querySelectorAll('nav a').forEach(link => { if (link.getAttribute('href') === path) link.setAttribute('aria-current', 'page'); });
  try { await refreshSession(); } catch (error) { message(error.message); }
  if (path === '/' || path === '/meus-arquivos') return home(path !== '/');
  if (path === '/entrar') return authPage('login');
  if (path === '/cadastro') return authPage('register');
  if (path === '/recuperar') return authPage('recover');
  const file = /^\/f\/([a-f0-9-]+)$/.exec(path);
  if (file) return sharedFile(file[1]);
  if (path === '/pastas') return foldersPage(app, session);
  if (path === '/grupos') { if (!session.user) return accountRequired(); return groupsPage(app, session); }
  if (path === '/moderacao') { if (!session.user) return accountRequired(); return moderationPage(app); }
  if (path === '/sobre' || path === '/privacidade') return infoPage(app, path === '/privacidade');
  const folder = /^\/pastas\/([a-f0-9-]+)$/.exec(path);
  if (folder) return folderPage(app, session, folder[1]);
  const group = /^\/grupos\/([a-f0-9-]+)$/.exec(path);
  if (group) return groupPage(app, group[1]);
  const documentMatch = /^\/documentos\/([a-f0-9-]+)$/.exec(path);
  if (documentMatch) { const { documentPage } = await import('./editor.js'); return documentPage(app, documentMatch[1]); }
  app.innerHTML = '<section class="card"><h1>Página não encontrada</h1><a href="/">Voltar aos arquivos</a></section>';
}
start().catch(error => { app.innerHTML = `<section class="card"><h1>Não foi possível abrir esta página</h1><p class="error">${escape(error.message)}</p><a class="button" href="/">Voltar aos arquivos</a></section>`; });
