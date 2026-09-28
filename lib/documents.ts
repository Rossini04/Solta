import { identity, member } from "./access";
import { ApiError, storage } from "./storage";
export type DocumentRecord = { id: string; group_id: string; name: string; owner_id: string; state: string; revision: number; created_at: number; updated_at: number };
export async function documentAccess(request: Request, id: string) { const who = await identity(request); const doc = await storage().db.prepare("SELECT * FROM documents WHERE id = ?").bind(id).first<DocumentRecord>(); if (!doc) throw new ApiError(404, "Documento não encontrado."); await member(doc.group_id, who); return { who, doc }; }
export function uuid(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9-]{36}$/.test(value); }
export function fromBase64(value: string) { if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new ApiError(400, "Atualização inválida."); try { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); } catch { throw new ApiError(400, "Atualização inválida."); } }
export function toBase64(bytes: Uint8Array) { let s = ""; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(s); }
