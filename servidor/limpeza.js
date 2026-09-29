import { storage } from './banco.js';
import { removeStoredFile } from './arquivos.js';
import { UPLOAD_LIFETIME } from './limites.js';

// A Cloudflare chama esta função a cada cinco minutos.
// Downloads vencidos já são bloqueados imediatamente pela API.
export async function cleanup() {
  const { db } = storage();
  const now = Date.now();
  const { results } = await db.prepare(`SELECT * FROM files
    WHERE (status = 'ready' AND expires_at <= ?)
      OR (status = 'uploading' AND created_at <= ?)
      OR status = 'deleting'
    LIMIT 10`).bind(now, now - UPLOAD_LIFETIME).all();
  let removed = 0;
  for (const row of results) {
    try { await removeStoredFile(row); removed++; }
    catch (error) { console.error('Limpeza será tentada novamente:', row.id, error.message); }
  }
  // Apaga registros temporários em lotes para respeitar os limites do plano gratuito.
  await db.batch([
    db.prepare('DELETE FROM sessions WHERE token_hash IN (SELECT token_hash FROM sessions WHERE expires <= ? LIMIT 300)').bind(now),
    db.prepare('DELETE FROM upload_limits WHERE key IN (SELECT key FROM upload_limits WHERE expires <= ? LIMIT 300)').bind(now),
    db.prepare('DELETE FROM folder_sessions WHERE rowid IN (SELECT rowid FROM folder_sessions WHERE expires <= ? LIMIT 300)').bind(now),
    db.prepare('DELETE FROM signals WHERE seq IN (SELECT seq FROM signals WHERE created_at <= ? LIMIT 300)').bind(now - 120000),
    db.prepare('DELETE FROM presence WHERE rowid IN (SELECT rowid FROM presence WHERE updated_at <= ? LIMIT 300)').bind(now - 120000),
  ]);
  return { removed };
}
