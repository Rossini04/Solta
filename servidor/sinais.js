// Rotas do Solta. O banco usa SQL com parâmetros separados dos dados.
import { documentAccess, uuid } from "./acesso-documentos.js";
import { ApiError, handle, json, readJson, sameOrigin, storage } from "./banco.js";
import { rateLimit } from "./acesso.js";
async function ownPeer(doc, peer, user) { const row = await storage().db.prepare("SELECT peer_id FROM presence WHERE document_id = ? AND peer_id = ? AND user_id = ? AND updated_at > ?").bind(doc, peer, user, Date.now() - 30000).first(); if (!row)
    throw new ApiError(403, "Sessão expirada. Entre novamente no documento."); }
export async function GET(request, context) { return handle(async () => { const { who, doc } = await documentAccess(request, (await context.params).id); const url = new URL(request.url), peer = url.searchParams.get("peer"), after = Number(url.searchParams.get("after") ?? 0); if (!uuid(peer) || !Number.isSafeInteger(after) || after < 0)
    throw new ApiError(400, "Sessão inválida."); await ownPeer(doc.id, peer, who.userId); const rows = await storage().db.prepare("SELECT seq, sender, payload FROM signals WHERE document_id = ? AND receiver = ? AND seq > ? AND created_at > ? ORDER BY seq LIMIT 100").bind(doc.id, peer, after, Date.now() - 60000).all(); return json({ signals: rows.results }); }); }
export async function POST(request, context) {
    return handle(async () => {
        sameOrigin(request);
        const { who, doc } = await documentAccess(request, (await context.params).id);
        const body = await readJson(request, 40000);
        if (!uuid(body?.sender) || !uuid(body?.receiver) || !body.payload || !["offer", "answer", "candidate", "stop"].includes(body.payload.type))
            throw new ApiError(400, "Sinal inválido.");
        await ownPeer(doc.id, body.sender, who.userId);
        const receiver = await storage().db.prepare("SELECT peer_id FROM presence WHERE document_id = ? AND peer_id = ? AND updated_at > ?").bind(doc.id, body.receiver, Date.now() - 30000).first();
        if (!receiver)
            throw new ApiError(404, "A pessoa saiu da sala.");
        await rateLimit(`signal:${who.userId}`, 500, 60000);
        await storage().db.batch([storage().db.prepare("INSERT INTO signals (document_id, sender, receiver, payload, created_at) VALUES (?, ?, ?, ?, ?)").bind(doc.id, body.sender, body.receiver, JSON.stringify(body.payload), Date.now()), storage().db.prepare("DELETE FROM signals WHERE document_id = ? AND created_at < ?").bind(doc.id, Date.now() - 120000)]);
        return json({ sent: true });
    });
}
