export async function api(url, options = {}) {
  const response = await fetch(url, { ...options, signal: options.signal ?? AbortSignal.timeout(45000) });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(value.error || 'Não foi possível concluir. Tente novamente.');
    error.status = response.status;
    error.folderId = value.folderId;
    throw error;
  }
  return value;
}
export function post(url, data) {
  return api(url, { method: 'POST', ...(data === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }) });
}
// Dados enviados por pessoas sempre entram como texto, nunca como HTML executável.
export function escape(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
export function size(bytes) {
  if (bytes < 1000) return `${bytes} B`;
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1000)), 3);
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(bytes / 1000 ** i)} ${['B', 'KB', 'MB', 'GB'][i]}`;
}
export function date(value) { return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); }
let messageTimer;
export function message(text) {
  const box = document.querySelector('#message');
  box.textContent = text;
  box.hidden = false;
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => { box.hidden = true; }, 6000);
}
export async function copy(text) {
  try { await navigator.clipboard.writeText(text); message('Link copiado.'); }
  catch { message('Não foi possível copiar. Use o endereço no navegador.'); }
}
export function modal(title, html, submit) {
  const dialog = document.querySelector('#modal');
  dialog.innerHTML = `<h2 id="modal-title">${escape(title)}</h2><form>${html}<p class="form-error error" role="alert"></p><div class="row"><button class="primary" type="submit">Confirmar</button><button type="button" data-close>Cancelar</button></div></form>`;
  dialog.querySelector('[data-close]').onclick = () => dialog.close();
  dialog.querySelector('form').onsubmit = async event => {
    event.preventDefault();
    const button = dialog.querySelector('[type=submit]');
    button.disabled = true;
    try { await submit(Object.fromEntries(new FormData(event.target))); dialog.close(); }
    catch (error) { dialog.querySelector('.form-error').textContent = error.message; }
    finally { button.disabled = false; }
  };
  dialog.showModal();
}
