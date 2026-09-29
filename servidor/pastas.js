// Rotas do Solta. O banco usa SQL com parâmetros separados dos dados.
import { folder, folderAccess, identity, passwordHash, requireAccount, member, safeFolder } from "./acesso.js";
import { ApiError, handle, json, readJson, sameOrigin, storage } from "./banco.js";
export async function GET(request) {
    return handle(async () => {
        const who = await identity(request);
        const id = new URL(request.url).searchParams.get("id");
        if (id) {
            const row = await folder(id);
            let locked = false;
            try {
                await folderAccess(request, row, who);
            }
            catch (e) {
                if (e instanceof ApiError && e.status === 423)
                    locked = true;
                else
                    throw e;
            }
            return json({ ...safeFolder(row, who), locked });
        }
        const { results } = await storage().db.prepare("SELECT * FROM folders WHERE access = 'public' OR owner_id = ? OR (access = 'group' AND group_id IN (SELECT group_id FROM members WHERE user_id = ?)) ORDER BY created_at DESC LIMIT 200").bind(who.userId, who.userId).all();
        return json({ folders: results.map(row => safeFolder(row, who)) });
    });
}
export async function POST(request) {
    return handle(async () => {
        sameOrigin(request);
        const who = await identity(request);
        requireAccount(who);
        const body = await readJson(request);
        if (!body || typeof body.name !== "string" || !body.name.trim() || body.name.length > 100 || !["public", "private", "group"].includes(body.access))
            throw new ApiError(400, "Informe o nome e a privacidade da pasta.");
        if (body.access === "group") {
            if (typeof body.groupId !== "string")
                throw new ApiError(400, "Selecione um grupo.");
            await member(body.groupId, who);
        }
        if (body.password && (typeof body.password !== "string" || body.password.length < 6 || body.password.length > 128))
            throw new ApiError(400, "A senha deve ter entre 6 e 128 caracteres.");
        const id = crypto.randomUUID();
        await storage().db.prepare("INSERT INTO folders (id, name, owner_id, access, group_id, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, body.name.trim(), who.userId, body.access, body.access === "group" ? body.groupId : null, body.password ? await passwordHash(body.password) : null, Date.now()).run();
        return json({ id }, 201);
    });
}
