import { CHUNK_SIZE } from "@/lib/files";
import { ApiError, expectedPartSize, handle, json, ownedUpload, publicFile, readLimited, storage } from "@/lib/storage";
type Context = { params: Promise<{ id: string }> };
export async function PUT(request: Request, context: Context) { return handle(async () => {
  const row = await ownedUpload(request, (await context.params).id);
  if (row.status !== "uploading") throw new ApiError(409, "Este envio já foi finalizado.");
  const number = Number(new URL(request.url).searchParams.get("part"));
  if (!Number.isInteger(number) || number < 1 || number > Math.ceil(row.size / CHUNK_SIZE)) throw new ApiError(400, "Parte inválida.");
  const expected = expectedPartSize(row.size, number); const bytes = await readLimited(request, expected);
  if (bytes.byteLength !== expected) throw new ApiError(400, "Parte incompleta. Tente novamente.");
  const { db, bucket } = storage();
  const part = await bucket.resumeMultipartUpload(`files/${row.id}`, row.upload_id).uploadPart(number, bytes);
  await db.prepare("INSERT INTO parts (file_id, number, etag, size) VALUES (?, ?, ?, ?) ON CONFLICT(file_id, number) DO UPDATE SET etag = excluded.etag, size = excluded.size").bind(row.id, number, part.etag, bytes.byteLength).run();
  return json({ partNumber: part.partNumber });
}); }
export async function POST(request: Request, context: Context) { return handle(async () => {
  const row = await ownedUpload(request, (await context.params).id); const { db, bucket } = storage();
  if (row.status === "ready") return json(publicFile(row));
  if (row.status !== "uploading") throw new ApiError(409, "Envio cancelado.");
  const { results } = await db.prepare("SELECT number, etag, size FROM parts WHERE file_id = ? ORDER BY number").bind(row.id).all<{ number: number; etag: string; size: number }>();
  if (results.length !== Math.ceil(row.size / CHUNK_SIZE) || results.some((part, i) => part.number !== i + 1 || part.size !== expectedPartSize(row.size, i + 1))) throw new ApiError(400, "Faltam partes do arquivo. Continue o envio.");
  let object = await bucket.head(`files/${row.id}`);
  if (!object) object = await bucket.resumeMultipartUpload(`files/${row.id}`, row.upload_id).complete(results.map(p => ({ partNumber: p.number, etag: p.etag })));
  if (object.size !== row.size) { await bucket.delete(`files/${row.id}`); throw new ApiError(409, "O tamanho recebido não corresponde ao arquivo."); }
  await db.batch([db.prepare("UPDATE files SET status = 'ready' WHERE id = ? AND status = 'uploading'").bind(row.id), db.prepare("DELETE FROM parts WHERE file_id = ?").bind(row.id)]);
  return json(publicFile(row));
}); }
export async function DELETE(request: Request, context: Context) { return handle(async () => {
  const row = await ownedUpload(request, (await context.params).id); const { db, bucket } = storage();
  if (row.status === "ready") throw new ApiError(409, "O arquivo já foi publicado.");
  await bucket.resumeMultipartUpload(`files/${row.id}`, row.upload_id).abort();
  await db.batch([db.prepare("DELETE FROM files WHERE id = ? AND status = 'uploading'").bind(row.id), db.prepare("DELETE FROM cooldowns WHERE file_id = ?").bind(row.id)]);
  return json({ cancelled: true });
}); }
