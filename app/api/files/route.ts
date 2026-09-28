import { MAX_FILE_SIZE, CHUNK_SIZE, UPLOAD_INTERVAL } from "@/lib/files";
import { ApiError, getFile, handle, hash, json, publicFile, readJson, sameOrigin, storage, StoredFile } from "@/lib/storage";
import { canDelete, fileAccess, folder, folderAccess, identity, identifyResponse } from "@/lib/access";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return handle(async () => {
  const who = await identity(request); const url = new URL(request.url); const id = url.searchParams.get("id"); const folderId = url.searchParams.get("folder");
  if (id) { const row = await getFile(id); if (row.status !== "ready") throw new ApiError(404, "Arquivo não encontrado."); try { await fileAccess(request, row, who); } catch (e) { if (e instanceof ApiError && e.status === 423) return json({ error: e.message, folderId: row.folder_id }, 423); throw e; } return json({ ...publicFile(row), canDelete: canDelete(row, who) }); }
  const offset = Number(url.searchParams.get("offset") ?? "0");
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw new ApiError(400, "Página inválida.");
  if (folderId) await folderAccess(request, await folder(folderId), who);
  const query = folderId ? "SELECT * FROM files WHERE status = 'ready' AND folder_id = ? ORDER BY created_at DESC, id DESC LIMIT 41 OFFSET ?" : "SELECT * FROM files WHERE status = 'ready' AND folder_id IS NULL ORDER BY created_at DESC, id DESC LIMIT 41 OFFSET ?";
  const statement = storage().db.prepare(query); const { results } = await (folderId ? statement.bind(folderId, offset) : statement.bind(offset)).all<StoredFile>();
  return json({ files: results.slice(0, 40).map(row => ({ ...publicFile(row), canDelete: canDelete(row, who) })), hasMore: results.length > 40 });
}); }
export async function POST(request: Request) { return handle(async () => {
  sameOrigin(request); const who = await identity(request); const body = await readJson(request);
  if (!body || typeof body.name !== "string" || !body.name.trim() || body.name.length > 240 || /[\x00-\x1f\x7f/\\]/.test(body.name)) throw new ApiError(400, "Use um nome de arquivo válido, com até 240 caracteres.");
  if (!Number.isSafeInteger(body.size) || body.size <= 0 || body.size > MAX_FILE_SIZE) throw new ApiError(400, "Escolha um arquivo maior que 0 B e de até 10 GB.");
  let folderId: string | null = null; if (body.folderId) { if (typeof body.folderId !== "string") throw new ApiError(400, "Pasta inválida."); await folderAccess(request, await folder(body.folderId), who, true); folderId = body.folderId; }
  const { db, bucket } = storage(); const id = crypto.randomUUID(), token = crypto.randomUUID() + crypto.randomUUID(), now = Date.now();
  const reservation = await db.prepare("INSERT INTO cooldowns (ip, file_id, next_at) VALUES (?, ?, ?) ON CONFLICT(ip) DO UPDATE SET file_id = excluded.file_id, next_at = excluded.next_at WHERE next_at <= ? RETURNING next_at").bind(who.ip, id, now + UPLOAD_INTERVAL, now).first();
  if (!reservation) { const limit = await db.prepare("SELECT next_at FROM cooldowns WHERE ip = ?").bind(who.ip).first<{ next_at: number }>(); return identifyResponse(json({ error: "Esta conexão já iniciou um envio. É permitido um arquivo a cada 2 horas. Cancelar um envio incompleto libera a tentativa.", nextUploadAt: limit?.next_at }, 429), who); }
  let upload: R2MultipartUpload | undefined;
  try { upload = await bucket.createMultipartUpload(`files/${id}`, { httpMetadata: { contentType: "application/octet-stream" } }); await db.prepare("INSERT INTO files (id, name, size, mime, created_at, status, upload_id, token_hash, owner_id, owner_session, ip_hash, folder_id) VALUES (?, ?, ?, ?, ?, 'uploading', ?, ?, ?, ?, ?, ?)").bind(id, body.name.trim(), body.size, typeof body.mime === "string" ? body.mime.slice(0, 150) : "application/octet-stream", now, upload.uploadId, await hash(token), who.userId, who.session, who.ip, folderId).run(); }
  catch (error) { if (upload) await upload.abort().catch(() => {}); await db.prepare("DELETE FROM cooldowns WHERE ip = ? AND file_id = ?").bind(who.ip, id).run(); throw error; }
  return identifyResponse(json({ id, token, chunkSize: CHUNK_SIZE, nextUploadAt: now + UPLOAD_INTERVAL }, 201), who);
}); }
