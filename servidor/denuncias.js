// Rotas do Solta. O banco usa SQL com parâmetros separados dos dados.
import { fileAccess, identity, rateLimit } from "./acesso.js";
import { ApiError, getFile, handle, json, readJson, sameOrigin, storage, availableFile } from "./banco.js";
export async function GET(request) { return handle(async () => { const who = await identity(request); if (!who.admin)
    throw new ApiError(403, "Área restrita à administração."); const result = await storage().db.prepare("SELECT r.id, r.file_id, r.reason, r.details, r.created_at, r.status, f.name, f.status AS file_status FROM reports r LEFT JOIN files f ON f.id = r.file_id WHERE r.status = 'open' ORDER BY r.created_at LIMIT 100").all(); return json({ reports: result.results }); }); }
export async function POST(request) {
    return handle(async () => {
        sameOrigin(request);
        const who = await identity(request);
        const body = await readJson(request);
        if (!body || typeof body.fileId !== "string" || !["Conteúdo ilegal", "Arquivo malicioso", "Direitos autorais", "Dados pessoais", "Outro motivo"].includes(body.reason) || typeof body.details !== "string" || body.details.length > 2000)
            throw new ApiError(400, "Informe um motivo válido e uma descrição de até 2.000 caracteres.");
        const file = await getFile(body.fileId);
        availableFile(file);
        await fileAccess(request, file, who);
        await rateLimit(`report:${who.ip}`, 10, 3600000);
        const duplicate = await storage().db.prepare("SELECT id FROM reports WHERE file_id = ? AND reporter = ? AND status = 'open'").bind(file.id, who.ip).first();
        if (duplicate)
            return json({ received: true });
        await storage().db.prepare("INSERT INTO reports (id, file_id, reason, details, reporter, created_at, status) VALUES (?, ?, ?, ?, ?, ?, 'open')").bind(crypto.randomUUID(), file.id, body.reason, body.details.trim(), who.ip, Date.now()).run();
        return json({ received: true }, 201);
    });
}
export async function PATCH(request) { return handle(async () => { sameOrigin(request); const who = await identity(request); if (!who.admin)
    throw new ApiError(403, "Área restrita à administração."); const body = await readJson(request); if (typeof body?.id !== "string")
    throw new ApiError(400, "Denúncia inválida."); await storage().db.prepare("UPDATE reports SET status = 'dismissed' WHERE id = ?").bind(body.id).run(); return json({ resolved: true }); }); }
