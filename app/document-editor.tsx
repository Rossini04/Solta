"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import { Bold, Italic, Heading1, List, ListOrdered, Undo2, Redo2, Link2, Check, CloudOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, post } from "@/lib/client-api";
import { toast } from "sonner";
import { ScreenRoom, Peer } from "./screen-room";
function from64(value: string) { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
function to64(value: Uint8Array) { let text = ""; for (let i = 0; i < value.length; i += 8192) text += String.fromCharCode(...value.subarray(i, i + 8192)); return btoa(text); }
type SyncState = { name: string; groupId: string; revision: number; state?: string; peers: Peer[] };
export function DocumentEditor({ id }: { id: string }) {
  const ydoc = useMemo(() => new Y.Doc(), []), [peerId] = useState(() => crypto.randomUUID());
  const [info, setInfo] = useState<SyncState | null>(null), [ready, setReady] = useState(false), [error, setError] = useState(""), [status, setStatus] = useState("Conectando…"), [dirty, setDirty] = useState(false);
  const revision = useRef(-1), pending = useRef<Uint8Array[]>([]), saving = useRef(false), mounted = useRef(true);
  const editor = useEditor({ immediatelyRender: false, extensions: [StarterKit.configure({ undoRedo: false }), Collaboration.configure({ document: ydoc })], editable: false, editorProps: { attributes: { class: "collaborative-page", "aria-label": "Conteúdo do documento compartilhado", spellcheck: "true" } } }, [ydoc]);
  const flush = useCallback(async () => {
    if (saving.current || !pending.current.length) return; saving.current = true; setStatus("Salvando…"); const updates = pending.current.splice(0); const update = Y.mergeUpdates(updates);
    try { const result = await post<{ revision: number; state: string }>(`/api/documents/${id}`, { update: to64(update) }); Y.applyUpdate(ydoc, from64(result.state), "remote"); revision.current = Math.max(revision.current, result.revision); if (mounted.current) { setError(""); setStatus(pending.current.length ? "Salvando…" : "Todas as alterações salvas"); setDirty(pending.current.length > 0); } }
    catch (e) { pending.current.unshift(...updates); if (mounted.current) { setError((e as Error).message); setStatus("Alterações ainda não salvas"); setDirty(true); } } finally { saving.current = false; }
  }, [id, ydoc]);
  useEffect(() => {
    mounted.current = true; let polling = false, lastEdit = 0;
    const onUpdate = (update: Uint8Array, origin: unknown) => { if (origin === "remote") return; pending.current.push(update); lastEdit = Date.now(); setDirty(true); setStatus("Salvando…"); };
    ydoc.on("update", onUpdate);
    const poll = async () => { if (polling) return; polling = true; try { const state = await api<SyncState>(`/api/documents/${id}?revision=${revision.current}`); if (!mounted.current) return; if (state.state) Y.applyUpdate(ydoc, from64(state.state), "remote"); revision.current = Math.max(revision.current, state.revision); setInfo(state); setReady(true); editor?.setEditable(true); if (!pending.current.length && !saving.current) { setStatus("Todas as alterações salvas"); setError(""); } } catch (e) { if (mounted.current) { setError((e as Error).message); setStatus("Sem conexão com o documento"); } } finally { polling = false; } };
    void poll(); const timer = setInterval(() => { if (Date.now() - lastEdit > 500) void flush(); void poll(); }, 1500);
    const warn = (e: BeforeUnloadEvent) => { if (pending.current.length || saving.current) { e.preventDefault(); e.returnValue = ""; } }; window.addEventListener("beforeunload", warn);
    return () => { mounted.current = false; clearInterval(timer); ydoc.off("update", onUpdate); window.removeEventListener("beforeunload", warn); };
  }, [editor, flush, id, ydoc]);
  async function copy() { try { await navigator.clipboard.writeText(location.href); toast.success("Link copiado. Somente membros do grupo podem abrir."); } catch { toast.error("Copie o endereço do navegador para compartilhar."); } }
  const toolbar = [{ label: "Negrito", icon: Bold, action: () => editor?.chain().focus().toggleBold().run() }, { label: "Itálico", icon: Italic, action: () => editor?.chain().focus().toggleItalic().run() }, { label: "Título", icon: Heading1, action: () => editor?.chain().focus().toggleHeading({ level: 1 }).run() }, { label: "Lista", icon: List, action: () => editor?.chain().focus().toggleBulletList().run() }, { label: "Lista numerada", icon: ListOrdered, action: () => editor?.chain().focus().toggleOrderedList().run() }, { label: "Desfazer", icon: Undo2, action: () => editor?.chain().focus().undo().run() }, { label: "Refazer", icon: Redo2, action: () => editor?.chain().focus().redo().run() }];
  return <main className="editor-shell"><div className="document-heading"><div><a className="back-link" href={info ? `/grupos/${info.groupId}` : "/grupos"}>← Voltar ao grupo</a><h1>{info?.name ?? "Documento compartilhado"}</h1><span className={`save-status ${error ? "has-error" : ""}`}>{error ? <CloudOff size={14} /> : dirty ? <Loader2 className="spin" size={14} /> : <Check size={14} />}{status}</span></div><div className="document-members"><div className="avatar-stack">{info?.peers.map(peer => <span key={peer.peer_id} title={peer.name}>{peer.name.charAt(0).toUpperCase()}</span>)}</div><span>{info?.peers.length ?? 0} online</span><Button variant="outline" onClick={copy}><Link2 />Copiar link</Button></div></div>
    {error && <div className="editor-error" role="alert">{error}{!ready && <a target="_top" href={`/signin-with-chatgpt?return_to=${encodeURIComponent(`/documentos/${id}`)}`}>Entrar com ChatGPT</a>}{dirty && <Button variant="outline" onClick={flush}>Tentar salvar</Button>}</div>}
    <div className="editor-workspace"><section className="document-surface"><div className="editor-toolbar" role="toolbar" aria-label="Formatação do documento">{toolbar.map(({ label, icon: Icon, action }) => <Button key={label} variant="ghost" size="icon" title={label} aria-label={label} onClick={action} disabled={!ready}><Icon size={18} /></Button>)}<span>Documento colaborativo</span></div>{!ready ? <Skeleton className="h-96 m-6" /> : <EditorContent editor={editor} />}{ready && <div className="editor-bottom-note">As alterações são sincronizadas automaticamente com o grupo. Não feche a página enquanto houver alterações não salvas.</div>}</section><ScreenRoom documentId={id} peerId={peerId} peers={info?.peers ?? []} ready={ready} /></div></main>;
}
