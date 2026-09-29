import { ApiError, hash, storage } from "./banco.js";
export function cookieValue(request, key) { return request.headers.get("cookie")?.split(";").map(v => v.trim()).find(v => v.startsWith(key + "="))?.slice(key.length + 1) ?? ""; }
export function cookie(request, key, value, age) { return `${key}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`; }
export async function identity(request) {
    // A identidade vem de uma sessão aleatória no banco, não de cabeçalhos de usuário.
    const sessionToken = cookieValue(request, 'solta_session');
    const user = /^[a-f0-9-]{72}$/.test(sessionToken)
        ? await storage().db.prepare('SELECT u.id, u.username, u.admin FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires > ?').bind(await hash(sessionToken), Date.now()).first()
        : null;
    let token = cookieValue(request, "solta_device");
    let newCookie;
    if (!/^[a-f0-9-]{72}$/.test(token)) {
        token = crypto.randomUUID() + crypto.randomUUID();
        newCookie = cookie(request, "solta_device", token, 31536000);
    }
    // The trusted edge supplies this header. Loopback development uses a fixed local IP.
    const host = new URL(request.url).hostname;
    const ip = request.headers.get("cf-connecting-ip") ?? (["127.0.0.1", "localhost"].includes(host) ? "local-preview" : null);
    if (!ip)
        throw new ApiError(503, "Não foi possível verificar sua conexão. Tente novamente.");
    return { userId: user?.id ?? null, name: user?.username ?? 'Visitante', session: await hash(token), ip: await hash(`solta:${ip}`), cookie: newCookie, admin: Boolean(user?.admin) };
}
export function identifyResponse(response, who) { if (who.cookie)
    response.headers.append("Set-Cookie", who.cookie); return response; }
export function requireAccount(who) { if (!who.userId)
    throw new ApiError(401, "Entre com sua conta para acessar pastas e grupos."); }
export async function member(groupId, who) { requireAccount(who); const row = await storage().db.prepare("SELECT user_id FROM members WHERE group_id = ? AND user_id = ?").bind(groupId, who.userId).first(); if (!row)
    throw new ApiError(403, "Você não participa deste grupo."); }
export async function folder(id) { const row = await storage().db.prepare("SELECT * FROM folders WHERE id = ?").bind(id).first(); if (!row)
    throw new ApiError(404, "Pasta não encontrada."); return row; }
export async function folderAccess(request, row, who, write = false) {
    if (who.userId === row.owner_id || who.admin)
        return;
    if (row.access === "private")
        throw new ApiError(403, "Esta pasta é privada.");
    if (row.access === "group") {
        if (!row.group_id)
            throw new ApiError(403, "Grupo indisponível.");
        await member(row.group_id, who);
    }
    else if (write)
        throw new ApiError(403, "Somente o dono pode enviar arquivos para esta pasta.");
    if (row.password_hash) {
        const token = cookieValue(request, `solta_folder_${row.id}`);
        const grant = token && await storage().db.prepare("SELECT expires FROM folder_sessions WHERE folder_id = ? AND session = ? AND expires > ?").bind(row.id, await hash(token), Date.now()).first();
        if (!grant)
            throw new ApiError(423, "Esta pasta está protegida por senha.");
    }
}
export async function fileAccess(request, file, who) { if (file.folder_id)
    await folderAccess(request, await folder(file.folder_id), who); }
export function canDelete(file, who) { return who.admin || Boolean(file.owner_id && file.owner_id === who.userId); }
export function safeFolder(row, who) { return { id: row.id, name: row.name, access: row.access, group_id: row.group_id, protected: Boolean(row.password_hash), owner: row.owner_id === who.userId, created_at: row.created_at }; }
export async function passwordHash(password, salt) {
    const saltValue = salt ?? crypto.randomUUID();
    const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bytes = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: new TextEncoder().encode(saltValue), iterations: 100000, hash: "SHA-256" }, material, 256));
    return `${saltValue}:${Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("")}`;
}
export async function verifyPassword(password, expected) { const actual = await passwordHash(password, expected.split(":")[0]); let different = actual.length ^ expected.length; for (let i = 0; i < actual.length; i++)
    different |= actual.charCodeAt(i) ^ (expected.charCodeAt(i) || 0); return different === 0; }
export async function rateLimit(key, maximum, window) {
    const now = Date.now();
    const { db } = storage();
    const result = await db.prepare("INSERT INTO upload_limits (key, count, expires) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = CASE WHEN expires <= ? THEN 1 ELSE count + 1 END, expires = CASE WHEN expires <= ? THEN ? ELSE expires END RETURNING count").bind(key, now + window, now, now, now + window).first();
    if (result && result.count > maximum)
        throw new ApiError(429, "Muitas tentativas. Aguarde alguns minutos e tente novamente.");
}
