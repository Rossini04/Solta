import { env } from 'cloudflare:workers';
import { MAX_FILE_SIZE, USER_STORAGE_LIMIT, CHUNK_SIZE, PUBLIC_RETENTION, positiveNumber } from './limites.js';
import { ApiError, storage, json, hash, readJson, readLimited, getFile, availableFile, publicFile, ownedUpload, expectedPartSize } from './banco.js';
import { identity, requireAccount, folder, folderAccess, fileAccess, canDelete, rateLimit } from './acesso.js';

export async function session(request) {
  const who = await identity(request);
  const { db } = storage();
  const space = who.userId && await db.prepare('SELECT bytes FROM storage_usage WHERE id = ?').bind(who.userId).first();
  const cooldown = who.userId && await db.prepare('SELECT next_at FROM cooldowns WHERE ip = ?').bind(who.userId).first();
  return json({ user: who.userId ? { id: who.userId, name: who.name } : null, admin: who.admin,
    storage: { used: space?.bytes ?? 0, limit: USER_STORAGE_LIMIT },
    nextUploadAt: cooldown?.next_at > Date.now() ? cooldown.next_at : 0,
    uploadInterval: Math.max(0, Number(env.UPLOAD_INTERVAL_MS) || 0) });
}
export async function listFiles(request) {
  const who = await identity(request);
  const url = new URL(request.url);
  const id = url.searchParams.get('id'), folderId = url.searchParams.get('folder'), mine = url.searchParams.get('mine') === '1';
  if (id) {
    const row = await getFile(id);
    availableFile(row);
    try { await fileAccess(request, row, who); }
    catch (error) { if (error.status === 423) return json({ error: error.message, folderId: row.folder_id }, 423); throw error; }
    return json({ ...publicFile(row), canDelete: canDelete(row, who) });
  }
  const offset = Number(url.searchParams.get('offset') ?? 0);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw new ApiError(400, 'Página inválida.');
  if (mine) requireAccount(who);
  if (folderId) await folderAccess(request, await folder(folderId), who);
  let condition = "status = 'ready' AND (expires_at IS NULL OR expires_at > ?)", values = [Date.now()];
  if (mine) { condition = "owner_id = ? AND status != 'deleted'"; values = [who.userId]; }
  else if (folderId) { condition += ' AND folder_id = ?'; values.push(folderId); }
  else { condition += ' AND folder_id IS NULL'; }
  const { results } = await storage().db.prepare(`SELECT * FROM files WHERE ${condition} ORDER BY created_at DESC, id DESC LIMIT 41 OFFSET ?`).bind(...values, offset).all();
  return json({ files: results.slice(0, 40).map(row => ({ ...publicFile(row), canDelete: canDelete(row, who) })), hasMore: results.length > 40 });
}
export async function createUpload(request) {
  const who = await identity(request);
  requireAccount(who);
  const body = await readJson(request);
  if (!body || typeof body.name !== 'string' || !body.name.trim() || body.name.length > 240 || /[\x00-\x1f\x7f/\\]/.test(body.name)) throw new ApiError(400, 'Use um nome de arquivo válido, com até 240 caracteres.');
  if (!Number.isSafeInteger(body.size) || body.size <= 0 || body.size > MAX_FILE_SIZE) throw new ApiError(400, 'Escolha um arquivo maior que 0 B e de até 10 GB.');
  let folderId = null, publicUpload = true;
  if (body.folderId) {
    if (typeof body.folderId !== 'string') throw new ApiError(400, 'Pasta inválida.');
    const destination = await folder(body.folderId);
    await folderAccess(request, destination, who, true);
    folderId = destination.id;
    publicUpload = destination.access === 'public';
  }
  await rateLimit(`upload:${who.userId}`, 60, 3600000);
  const { db, bucket } = storage();
  const id = crypto.randomUUID(), token = crypto.randomUUID() + crypto.randomUUID(), now = Date.now();
  const interval = Math.max(0, Number(env.UPLOAD_INTERVAL_MS) || 0);
  if (interval) {
    const reservation = await db.prepare(`INSERT INTO cooldowns (ip, file_id, next_at) VALUES (?, ?, ?)
      ON CONFLICT(ip) DO UPDATE SET file_id = excluded.file_id, next_at = excluded.next_at WHERE next_at <= ? RETURNING next_at`).bind(who.userId, id, now + interval, now).first();
    if (!reservation) throw new ApiError(429, 'Aguarde o intervalo entre envios indicado em Meus arquivos.');
  }
  const globalLimit = positiveNumber(env.SITE_STORAGE_LIMIT_BYTES, 50000000000);
  let reserved = false, upload;
  try {
    // A consulta e os gatilhos rodam numa transação: concorrência não fura a cota.
    const row = await db.prepare(`
      INSERT INTO files (id, name, size, mime, created_at, status, upload_id, token_hash, owner_id, owner_session, ip_hash, folder_id, public_upload)
      SELECT ?, ?, ?, ?, ?, 'uploading', '', ?, ?, NULL, ?, ?, ?
      WHERE (SELECT bytes FROM storage_usage WHERE id = 'global') + ? <= ?
        AND (SELECT files FROM storage_usage WHERE id = 'global') < 5000
        AND COALESCE((SELECT bytes FROM storage_usage WHERE id = ?), 0) + ? <= ?
      RETURNING id
    `).bind(id, body.name.trim(), body.size, typeof body.mime === 'string' ? body.mime.slice(0, 150) : 'application/octet-stream', now,
      await hash(token), who.userId, who.ip, folderId, Number(publicUpload), body.size, globalLimit, who.userId, body.size, USER_STORAGE_LIMIT).first();
    if (!row) {
      const usage = await db.prepare('SELECT bytes FROM storage_usage WHERE id = ?').bind(who.userId).first();
      if ((usage?.bytes ?? 0) + body.size > USER_STORAGE_LIMIT) throw new ApiError(413, 'Seu espaço de 10 GB não comporta este arquivo. Exclua arquivos em Meus arquivos para liberar espaço.');
      throw new ApiError(507, 'O armazenamento total do site está cheio. Tente depois que houver espaço disponível.');
    }
    reserved = true;
    upload = await bucket.createMultipartUpload(`files/${id}`, { httpMetadata: { contentType: 'application/octet-stream' } });
    await db.prepare('UPDATE files SET upload_id = ? WHERE id = ?').bind(upload.uploadId, id).run();
  } catch (error) {
    if (upload) await upload.abort().catch(() => {});
    if (reserved) await db.prepare("UPDATE files SET status = 'deleted' WHERE id = ?").bind(id).run();
    await db.prepare('DELETE FROM cooldowns WHERE file_id = ?').bind(id).run();
    throw error;
  }
  return json({ id, token, chunkSize: CHUNK_SIZE, nextUploadAt: interval ? now + interval : 0 }, 201);
}
export async function uploadPart(request, id) {
  const who = await identity(request);
  const row = await ownedUpload(request, id, who.userId);
  if (row.status !== 'uploading' || !row.upload_id) throw new ApiError(409, 'Este envio já foi finalizado ou cancelado.');
  const number = Number(new URL(request.url).searchParams.get('part'));
  if (!Number.isInteger(number) || number < 1 || number > Math.ceil(row.size / CHUNK_SIZE)) throw new ApiError(400, 'Parte inválida.');
  const size = expectedPartSize(row.size, number), bytes = await readLimited(request, size);
  if (bytes.byteLength !== size) throw new ApiError(400, 'Parte incompleta. Tente novamente.');
  const { db, bucket } = storage();
  const part = await bucket.resumeMultipartUpload(`files/${id}`, row.upload_id).uploadPart(number, bytes);
  await db.prepare(`INSERT INTO parts (file_id, number, etag, size) VALUES (?, ?, ?, ?)
    ON CONFLICT(file_id, number) DO UPDATE SET etag = excluded.etag, size = excluded.size`).bind(id, number, part.etag, bytes.byteLength).run();
  return json({ partNumber: number });
}
export async function completeUpload(request, id) {
  const who = await identity(request), row = await ownedUpload(request, id, who.userId);
  if (row.status === 'ready') return json(publicFile(row));
  if (row.status !== 'uploading') throw new ApiError(409, 'Envio indisponível.');
  const { db, bucket } = storage();
  const { results } = await db.prepare('SELECT number, etag, size FROM parts WHERE file_id = ? ORDER BY number').bind(id).all();
  if (results.length !== Math.ceil(row.size / CHUNK_SIZE) || results.some((part, i) => part.number !== i + 1 || part.size !== expectedPartSize(row.size, i + 1))) throw new ApiError(400, 'Faltam partes do arquivo. Continue o envio.');
  let object = await bucket.head(`files/${id}`);
  if (!object) object = await bucket.resumeMultipartUpload(`files/${id}`, row.upload_id).complete(results.map(part => ({ partNumber: part.number, etag: part.etag })));
  if (object.size !== row.size) throw new ApiError(409, 'O tamanho recebido não corresponde ao arquivo.');
  const completed = Date.now(), expires = row.public_upload ? completed + PUBLIC_RETENTION : null;
  const result = await db.prepare("UPDATE files SET status = 'ready', expires_at = ?, completed_at = ? WHERE id = ? AND status = 'uploading'").bind(expires, completed, id).run();
  if (result.meta.changes !== 1) {
    const current = await getFile(id);
    if (current.status !== 'ready') { await bucket.delete(`files/${id}`); throw new ApiError(409, 'O envio foi cancelado.'); }
    return json(publicFile(current));
  }
  await db.prepare('DELETE FROM parts WHERE file_id = ?').bind(id).run();
  return json(publicFile({ ...row, status: 'ready', expires_at: expires }));
}
export async function removeStoredFile(row) {
  const { db, bucket } = storage();
  await db.prepare("UPDATE files SET status = 'deleting' WHERE id = ? AND status != 'deleted'").bind(row.id).run();
  if (row.upload_id && row.status !== 'ready') {
    try { await bucket.resumeMultipartUpload(`files/${row.id}`, row.upload_id).abort(); }
    catch (error) { if (!/not found|does not exist|NoSuchUpload|10024/i.test(String(error.message))) throw error; }
  }
  await bucket.delete(`files/${row.id}`);
  // O espaço só volta depois de os bytes terem sido excluídos.
  await db.batch([
    db.prepare("UPDATE files SET status = 'deleted' WHERE id = ?").bind(row.id),
    db.prepare('DELETE FROM parts WHERE file_id = ?').bind(row.id),
    db.prepare("UPDATE reports SET status = 'removed' WHERE file_id = ? AND status = 'open'").bind(row.id),
    ...(!row.completed_at ? [db.prepare('DELETE FROM cooldowns WHERE file_id = ?').bind(row.id)] : []),
  ]);
}
export async function deleteFile(request, id) {
  const who = await identity(request), row = await getFile(id);
  if (!canDelete(row, who)) throw new ApiError(403, 'Somente o dono ou a administração pode excluir este arquivo.');
  if (row.status !== 'deleted') await removeStoredFile(row);
  return json({ deleted: true });
}
