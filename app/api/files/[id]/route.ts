import { canDelete, identity } from "@/lib/access";
import { ApiError, getFile, handle, json, sameOrigin, storage } from "@/lib/storage";
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) { return handle(async () => {
  sameOrigin(request); const row = await getFile((await context.params).id); const who = await identity(request);
  if (!canDelete(row, who)) throw new ApiError(403, "Somente quem enviou o arquivo pode excluí-lo. Para envios sem conta, use o mesmo navegador e conexão.");
  if (!["ready", "deleted"].includes(row.status)) throw new ApiError(409, "Cancele o envio antes de excluir.");
  const { db, bucket } = storage(); await db.prepare("UPDATE files SET status = 'deleted' WHERE id = ?").bind(row.id).run(); await bucket.delete(`files/${row.id}`);
  await db.prepare("UPDATE reports SET status = 'removed' WHERE file_id = ? AND status = 'open'").bind(row.id).run(); return json({ deleted: true });
}); }
