import { identity, member } from "./acesso.js";
import { ApiError, storage } from "./banco.js";
export async function documentAccess(request, id) { const who = await identity(request); const doc = await storage().db.prepare("SELECT * FROM documents WHERE id = ?").bind(id).first(); if (!doc)
    throw new ApiError(404, "Documento não encontrado."); await member(doc.group_id, who); return { who, doc }; }
export function uuid(value) { return typeof value === "string" && /^[a-f0-9-]{36}$/.test(value); }
export function fromBase64(value) { if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value))
    throw new ApiError(400, "Atualização inválida."); try {
    return Uint8Array.from(atob(value), c => c.charCodeAt(0));
}
catch {
    throw new ApiError(400, "Atualização inválida.");
} }
export function toBase64(bytes) { let s = ""; for (let i = 0; i < bytes.length; i += 8192)
    s += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(s); }
