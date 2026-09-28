import { env } from "cloudflare:workers";
import { CHUNK_SIZE } from "./files";
export type StoredFile = { id: string; name: string; size: number; mime: string; created_at: number; status: string; upload_id: string; token_hash: string; owner_id: string | null; owner_session: string | null; ip_hash: string | null; folder_id: string | null };
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export function storage() {
  if (!env.DB || !env.BUCKET) throw new ApiError(503, "O armazenamento está indisponível. Tente novamente em instantes.");
  return { db: env.DB, bucket: env.BUCKET };
}
export function json(value: unknown, status = 200) { return Response.json(value, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }); }
export async function handle(action: () => Promise<Response>) {
  try { return await action(); } catch (error) {
    if (error instanceof ApiError) return json({ error: error.message }, error.status);
    console.error("File storage operation failed", error);
    return json({ error: "Não foi possível concluir agora. Tente novamente." }, 503);
  }
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") throw new ApiError(403, "Envio não autorizado nesta origem.");
}
export async function hash(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), x => x.toString(16).padStart(2, "0")).join("");
}
export async function readJson(request: Request, limit = 4096) {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new ApiError(415, "Formato de solicitação inválido.");
  const bytes = await readLimited(request, limit);
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new ApiError(400, "Solicitação inválida."); }
}
export async function readLimited(request: Request, max: number) {
  if (!request.body) throw new ApiError(400, "Conteúdo ausente.");
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > max) { await reader.cancel(); throw new ApiError(413, "O conteúdo excede o tamanho permitido."); } chunks.push(value); } } finally { reader.releaseLock(); }
  const result = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; } return result;
}
export async function getFile(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new ApiError(404, "Arquivo não encontrado.");
  const row = await storage().db.prepare("SELECT * FROM files WHERE id = ?").bind(id).first<StoredFile>();
  if (!row) throw new ApiError(404, "Arquivo não encontrado."); return row;
}
export async function ownedUpload(request: Request, id: string) {
  sameOrigin(request); const row = await getFile(id);
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (token.length > 100 || await hash(token) !== row.token_hash) throw new ApiError(403, "Este envio pertence a outra sessão.");
  if (row.created_at < Date.now() - 24 * 60 * 60 * 1000 && row.status !== "ready") throw new ApiError(410, "Este envio expirou. Selecione o arquivo novamente.");
  return row;
}
export function publicFile(row: StoredFile) { return { id: row.id, name: row.name, size: row.size, mime: row.mime, created_at: row.created_at, folder_id: row.folder_id }; }
export function expectedPartSize(fileSize: number, number: number) { return Math.min(CHUNK_SIZE, fileSize - (number - 1) * CHUNK_SIZE); }
