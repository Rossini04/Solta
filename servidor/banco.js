import { env } from 'cloudflare:workers';
import { CHUNK_SIZE, UPLOAD_LIFETIME, positiveNumber } from './limites.js';

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Cada operação paga passa pelo contador mensal antes de chamar o R2.
async function storageOperation(kind) {
  const month = new Date().toISOString().slice(0, 7);
  const limit = positiveNumber(env[`R2_MONTHLY_${kind}_LIMIT`], kind === 'A' ? 100000 : 500000);
  const end = new Date();
  end.setUTCMonth(end.getUTCMonth() + 1, 1);
  end.setUTCHours(0, 0, 0, 0);
  const allowed = await env.DB.prepare(`
    INSERT INTO upload_limits (key, count, expires) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET count = count + 1 WHERE count < ? RETURNING count
  `).bind(`r2:${kind}:${month}`, end.getTime(), limit).first();
  if (!allowed) throw new ApiError(503, 'A franquia mensal do site foi atingida. Tente no próximo mês.');
}
function multipart(upload) {
  return {
    uploadId: upload.uploadId,
    async uploadPart(number, bytes) { await storageOperation('A'); return upload.uploadPart(number, bytes); },
    async complete(parts) { await storageOperation('A'); return upload.complete(parts); },
    abort() { return upload.abort(); },
  };
}
export function storage() {
  if (!env.DB || !env.BUCKET) throw new ApiError(503, 'O armazenamento está indisponível.');
  return {
    db: env.DB,
    bucket: {
      async createMultipartUpload(key, options) { await storageOperation('A'); return multipart(await env.BUCKET.createMultipartUpload(key, options)); },
      resumeMultipartUpload(key, id) { return multipart(env.BUCKET.resumeMultipartUpload(key, id)); },
      async head(key) { await storageOperation('B'); return env.BUCKET.head(key); },
      async get(key, options) { await storageOperation('B'); return env.BUCKET.get(key, options); },
      // A exclusão funciona mesmo depois de a franquia mensal acabar.
      delete(key) { return env.BUCKET.delete(key); },
    },
  };
}
export function json(value, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
export async function handle(action) {
  try { return await action(); }
  catch (error) {
    if (error instanceof ApiError) return json({ error: error.message }, error.status);
    console.error('Não foi possível concluir a operação:', error.message);
    return json({ error: 'Não foi possível concluir agora. Tente novamente.' }, 503);
  }
}
export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new ApiError(403, 'Solicitação não autorizada nesta origem.');
  }
}
export async function hash(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
}
export async function readJson(request, limit = 4096) {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new ApiError(415, 'Formato inválido.');
  const bytes = await readLimited(request, limit);
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new ApiError(400, 'Solicitação inválida.'); }
}
export async function readLimited(request, max) {
  if (!request.body) throw new ApiError(400, 'Conteúdo ausente.');
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) { await reader.cancel(); throw new ApiError(413, 'O conteúdo excede o tamanho permitido.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}
export async function getFile(id) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new ApiError(404, 'Arquivo não encontrado.');
  const row = await storage().db.prepare('SELECT * FROM files WHERE id = ?').bind(id).first();
  if (!row) throw new ApiError(404, 'Arquivo não encontrado.');
  return row;
}
export function availableFile(file) {
  if (file.status !== 'ready') throw new ApiError(404, 'Arquivo não encontrado.');
  if (file.expires_at && file.expires_at <= Date.now()) throw new ApiError(410, 'Este arquivo expirou após 15 dias.');
}
export async function ownedUpload(request, id, userId) {
  sameOrigin(request);
  const row = await getFile(id);
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  if (!userId || row.owner_id !== userId || token.length > 100 || await hash(token) !== row.token_hash) throw new ApiError(403, 'Este envio pertence a outra conta.');
  if (row.created_at < Date.now() - UPLOAD_LIFETIME && row.status !== 'ready') throw new ApiError(410, 'Este envio expirou. Selecione o arquivo novamente.');
  return row;
}
export function publicFile(row) {
  return { id: row.id, name: row.name, size: row.size, mime: row.mime, created_at: row.created_at, folder_id: row.folder_id, expires_at: row.expires_at, status: row.status };
}
export function expectedPartSize(fileSize, number) { return Math.min(CHUNK_SIZE, fileSize - (number - 1) * CHUNK_SIZE); }
