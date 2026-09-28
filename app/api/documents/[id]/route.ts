import * as Y from "yjs";
import { documentAccess, DocumentRecord, fromBase64, toBase64 } from "@/lib/documents";
import { ApiError, handle, json, readJson, sameOrigin, storage } from "@/lib/storage";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) { return handle(async () => { const { doc } = await documentAccess(request, (await context.params).id); const revision = Number(new URL(request.url).searchParams.get("revision") ?? -1); const peers = await storage().db.prepare("SELECT peer_id, name, sharing FROM presence WHERE document_id = ? AND updated_at > ?").bind(doc.id, Date.now() - 20000).all(); return json({ id: doc.id, name: doc.name, groupId: doc.group_id, revision: doc.revision, ...(revision !== doc.revision ? { state: doc.state } : {}), peers: peers.results }); }); }
export async function POST(request: Request, context: Context) { return handle(async () => {
  sameOrigin(request); const { doc: initial } = await documentAccess(request, (await context.params).id); const body = await readJson(request, 750000);
  if (typeof body?.update !== "string" || body.update.length > 700000) throw new ApiError(400, "Atualização muito grande. Divida o conteúdo em documentos menores.");
  const update = fromBase64(body.update); const { db } = storage();
  for (let attempt = 0; attempt < 8; attempt++) {
    const doc = attempt === 0 ? initial : await db.prepare("SELECT * FROM documents WHERE id = ?").bind(initial.id).first<DocumentRecord>(); if (!doc) throw new ApiError(404, "Documento não encontrado.");
    const ydoc = new Y.Doc(); let state: string;
    try { if (doc.state) Y.applyUpdate(ydoc, fromBase64(doc.state)); Y.applyUpdate(ydoc, update); if (ydoc.getXmlFragment("default").toString().length > 200000) throw new ApiError(413, "O documento atingiu o limite de 200 mil caracteres."); state = toBase64(Y.encodeStateAsUpdate(ydoc)); if (state.length > 1200000) throw new ApiError(413, "O documento está muito grande. Crie outro documento para continuar."); }
    catch (e) { if (e instanceof ApiError) throw e; throw new ApiError(400, "Não foi possível ler essa atualização."); } finally { ydoc.destroy(); }
    const saved = await db.prepare("UPDATE documents SET state = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?").bind(state, Date.now(), doc.id, doc.revision).run(); if (saved.meta.changes === 1) return json({ revision: doc.revision + 1, state });
  }
  throw new ApiError(409, "O documento está sendo atualizado. Tente novamente.");
}); }
