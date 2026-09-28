import { cookie, folder, identity, member, rateLimit, verifyPassword } from "@/lib/access";
import { ApiError, handle, hash, json, readJson, sameOrigin, storage } from "@/lib/storage";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return handle(async () => {
  sameOrigin(request); const who = await identity(request); const row = await folder((await context.params).id);
  if (row.access === "private" && row.owner_id !== who.userId) throw new ApiError(403, "Pasta privada.");
  if (row.access === "group" && row.group_id) await member(row.group_id, who);
  const body = await readJson(request); await rateLimit(`password:${who.ip}:${row.id}`, 10, 600000);
  if (!row.password_hash || typeof body?.password !== "string" || body.password.length > 128 || !(await verifyPassword(body.password, row.password_hash))) throw new ApiError(403, "Senha incorreta.");
  const token = crypto.randomUUID() + crypto.randomUUID(); await storage().db.prepare("INSERT INTO folder_sessions (folder_id, session, expires) VALUES (?, ?, ?)").bind(row.id, await hash(token), Date.now() + 36000000).run();
  const response = json({ unlocked: true }); response.headers.append("Set-Cookie", cookie(request, `solta_folder_${row.id}`, token, 36000)); return response;
}); }
