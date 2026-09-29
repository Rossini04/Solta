// Rotas do Solta. O banco usa SQL com parâmetros separados dos dados.
import { documentAccess, uuid } from "./acesso-documentos.js";
import { ApiError, handle, json, readJson, sameOrigin, storage } from "./banco.js";
export async function POST(request, context) {
    return handle(async () => {
        sameOrigin(request);
        const { who, doc } = await documentAccess(request, (await context.params).id);
        const body = await readJson(request);
        if (!uuid(body?.peerId) || typeof body.sharing !== "boolean")
            throw new ApiError(400, "Sessão inválida.");
        const result = await storage().db.prepare("INSERT INTO presence (document_id, peer_id, user_id, name, sharing, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(document_id, peer_id) DO UPDATE SET name = excluded.name, sharing = excluded.sharing, updated_at = excluded.updated_at WHERE presence.user_id = excluded.user_id RETURNING peer_id").bind(doc.id, body.peerId, who.userId, who.name, Number(body.sharing), body.leave ? 0 : Date.now()).first();
        if (!result)
            throw new ApiError(403, "Esta sessão pertence a outra pessoa.");
        return json({ present: true });
    });
}
