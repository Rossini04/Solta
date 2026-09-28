import { identity, identifyResponse } from "@/lib/access";
import { handle, json, storage } from "@/lib/storage";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return handle(async () => { const who = await identity(request); const row = await storage().db.prepare("SELECT next_at FROM cooldowns WHERE ip = ?").bind(who.ip).first<{ next_at: number }>(); return identifyResponse(json({ user: who.userId ? { id: who.userId, name: who.name } : null, admin: who.admin, nextUploadAt: row && row.next_at > Date.now() ? row.next_at : 0 }), who); }); }
