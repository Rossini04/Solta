"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Upload, ArrowDownToLine, Link2, Plus, X, File, FileArchive, FileImage, FileVideo, FileAudio, Check, Loader2, Globe2, ArrowRight, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { CHUNK_SIZE, MAX_FILE_SIZE, PublicFile, formatSize } from "@/lib/files";
import { api, RequestError, Session } from "@/lib/client-api";
import { FileActions } from "./file-actions";

type UploadItem = { key: string; file: globalThis.File; status: "queued" | "uploading" | "finishing" | "done" | "error" | "cancelled"; progress: number; sent: number; id?: string; token?: string; nextPart: number; error?: string };
function sendChunk(url: string, blob: Blob, token: string, signal: AbortSignal, progress: (n: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest(); xhr.open("PUT", url); xhr.timeout = 180000;
    xhr.setRequestHeader("Authorization", `Bearer ${token}`); xhr.setRequestHeader("Content-Type", "application/octet-stream");
    const abort = () => xhr.abort(); signal.addEventListener("abort", abort, { once: true });
    const clean = () => signal.removeEventListener("abort", abort);
    xhr.upload.onprogress = e => progress(e.loaded);
    xhr.onload = () => { clean(); if (xhr.status >= 200 && xhr.status < 300) resolve(); else { let message = "O envio falhou. Tente novamente."; try { message = JSON.parse(xhr.responseText).error || message; } catch {} reject(new RequestError(message, xhr.status)); } };
    xhr.onerror = () => { clean(); reject(new RequestError("Conexão interrompida. Tente continuar o envio.")); };
    xhr.ontimeout = () => { clean(); reject(new RequestError("A conexão demorou demais. Tente continuar o envio.")); };
    xhr.onabort = () => { clean(); reject(new DOMException("Envio cancelado", "AbortError")); };
    if (signal.aborted) { clean(); reject(new DOMException("Envio cancelado", "AbortError")); return; } xhr.send(blob);
  });
}
function FileGlyph({ name, mime = "", large = false }: { name: string; mime?: string; large?: boolean }) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const kind = mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : /zip|rar|7z|gz|tar/.test(ext) ? "archive" : "file";
  const Icon = { image: FileImage, video: FileVideo, audio: FileAudio, archive: FileArchive, file: File }[kind];
  return <span className={`file-glyph ${kind} ${large ? "large" : ""}`}><Icon size={large ? 36 : 23} strokeWidth={1.6} /></span>;
}
async function copyLink(id: string) {
  const url = `${window.location.origin}/f/${id}`;
  try { await navigator.clipboard.writeText(url); toast.success("Link copiado! Pode compartilhar."); }
  catch { toast.error("Não foi possível copiar automaticamente. Abra o arquivo e copie o endereço do navegador."); }
}

export function FileHub({ fileId, folderId, folderName, canUpload = true }: { fileId?: string; folderId?: string; folderName?: string; canUpload?: boolean }) {
  const [session, setSession] = useState<Session | null>(null), [clock, setClock] = useState(Date.now()), [lockedFolder, setLockedFolder] = useState("");
  const loadSession = useCallback(() => api<Session>("/api/session").then(setSession).catch(() => {}), []);
  useEffect(() => { void loadSession(); const timer = setInterval(() => setClock(Date.now()), 30000); return () => clearInterval(timer); }, [loadSession]);
  const [files, setFiles] = useState<PublicFile[]>([]); const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState(""); const [hasMore, setHasMore] = useState(false);
  const [shared, setShared] = useState<PublicFile | null>(null);
  const [items, setItems] = useState<UploadItem[]>([]); const [busy, setBusy] = useState(false); const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null); const controller = useRef<AbortController | null>(null); const locked = useRef(false);
  const queueRef = useRef(items); queueRef.current = items;
  const patch = (key: string, change: Partial<UploadItem>) => setItems(prev => prev.map(item => item.key === key ? { ...item, ...change } : item));
  const loadFiles = useCallback(async (offset = 0) => {
    setLoading(true); setListError("");
    try { const value = await api<{ files: PublicFile[]; hasMore: boolean }>(`/api/files?offset=${offset}${folderId ? `&folder=${encodeURIComponent(folderId)}` : ""}`); setFiles(prev => offset ? [...prev, ...value.files.filter((f: PublicFile) => !prev.some(p => p.id === f.id))] : value.files); setHasMore(value.hasMore); return value.files; }
    catch (error) { setListError(error instanceof Error ? error.message : "Não foi possível carregar os arquivos."); throw error; }
    finally { setLoading(false); }
  }, [folderId]);
  useEffect(() => {
    if (fileId) { api<PublicFile>(`/api/files?id=${encodeURIComponent(fileId)}`).then(setShared).catch(e => { setListError(e.message); if (e.folderId) setLockedFolder(e.folderId); }).finally(() => setLoading(false)); }
    else void loadFiles().catch(() => {});
  }, [fileId, folderId, loadFiles]);
  useEffect(() => {
    if (!busy) return; const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", prevent); return () => window.removeEventListener("beforeunload", prevent);
  }, [busy]);
  useEffect(() => {
    if (fileId || folderId) return;
    type Tool = { name: string; title: string; description: string; inputSchema: object; annotations: object; execute: (input: unknown) => Promise<unknown> };
    const modelContext = (document as Document & { modelContext?: { registerTool: (tool: Tool, options: { signal: AbortSignal }) => unknown } }).modelContext;
    if (!modelContext?.registerTool) return; const lifecycle = new AbortController();
    try { void Promise.resolve(modelContext.registerTool({ name: "refresh_public_files", title: "Atualizar arquivos públicos", description: "Atualiza a lista visível dos arquivos públicos e retorna os primeiros 40 arquivos e seus links.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, async execute(value) { if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length) throw new Error("Esperado um objeto vazio."); const result = await loadFiles(); return { files: result.map(f => ({ ...f, url: `${location.origin}/f/${f.id}` })) }; } }, { signal: lifecycle.signal })).catch(() => {}); } catch {}
    return () => lifecycle.abort();
  }, [fileId, folderId, loadFiles]);

  function addFiles(selected: FileList | globalThis.File[]) {
    const accepted: UploadItem[] = [];
    if (Array.from(selected).length > 1) toast.info("Selecione um arquivo por envio. O intervalo entre envios é de 2 horas.");
    if (queueRef.current.some(i => ["queued", "error", "uploading", "finishing"].includes(i.status))) { toast.info("Conclua ou remova o arquivo atual primeiro."); return; }
    for (const file of Array.from(selected).slice(0, 1)) {
      if (file.size <= 0 || file.size > MAX_FILE_SIZE) { toast.error(`${file.name}: escolha um arquivo de até 10 GB, maior que 0 B.`); continue; }
      if (file.name.length > 240) { toast.error(`${file.name.slice(0, 40)}: encurte o nome para até 240 caracteres.`); continue; }
      if (queueRef.current.some(i => i.file.name === file.name && i.file.size === file.size && i.file.lastModified === file.lastModified && i.status !== "cancelled")) continue;
      accepted.push({ key: crypto.randomUUID(), file, status: "queued", progress: 0, sent: 0, nextPart: 1 });
    }
    setItems(prev => [...prev, ...accepted]);
  }
  async function startUploads() {
    if (locked.current) return; locked.current = true; setBusy(true);
    const pending = queueRef.current.filter(i => i.status === "queued" || i.status === "error");
    for (const item of pending) {
      const ac = new AbortController(); controller.current = ac;
      let id = item.id, token = item.token; let part = item.nextPart;
      patch(item.key, { status: "uploading", error: undefined });
      try {
        if (!id || !token) { const value = await api<{ id: string; token: string; nextUploadAt: number }>("/api/files", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: item.file.name, size: item.file.size, mime: item.file.type, folderId }) }); id = value.id; token = value.token; patch(item.key, { id, token }); void loadSession(); }
        if (ac.signal.aborted) throw new DOMException("Envio cancelado", "AbortError");
        for (; part <= Math.ceil(item.file.size / CHUNK_SIZE); part++) {
          const start = (part - 1) * CHUNK_SIZE; const chunk = item.file.slice(start, start + CHUNK_SIZE);
          for (let attempt = 0; ; attempt++) {
            try { await sendChunk(`/api/uploads/${id}?part=${part}`, chunk, token!, ac.signal, sent => patch(item.key, { progress: Math.min(99, (start + sent) / item.file.size * 100), sent: start + sent })); break; }
            catch (e) { if (!(e instanceof RequestError) || (e.status > 0 && e.status < 500) || attempt >= 2 || ac.signal.aborted) throw e; await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); }
          }
          patch(item.key, { nextPart: part + 1, sent: Math.min(part * CHUNK_SIZE, item.file.size) });
        }
        patch(item.key, { status: "finishing" });
        await api(`/api/uploads/${id}`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
        patch(item.key, { status: "done", progress: 100 }); toast.success(`${item.file.name} está pronto para compartilhar.`);
        await loadFiles().catch(() => {});
      } catch (error) {
        if (ac.signal.aborted) {
          patch(item.key, { status: "cancelled", error: undefined });
          if (id && token) await api(`/api/uploads/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
        } else { const message = error instanceof Error ? error.message : "O envio falhou."; patch(item.key, { status: "error", error: message, ...(error instanceof RequestError && error.status === 410 ? { id: undefined, token: undefined, nextPart: 1, progress: 0, sent: 0 } : {}) }); }
      }
    }
    controller.current = null; locked.current = false; setBusy(false); void loadSession();
  }
  const remaining = items.filter(i => i.status === "queued" || i.status === "error").length;
  const cooldown = Boolean(session && session.nextUploadAt > clock);
  const cooldownText = session?.nextUploadAt ? new Date(session.nextUploadAt).toLocaleTimeString("pt-BR", {hour:"2-digit",minute:"2-digit"}) : "";
  return <>
    <main className="main-shell">
      {fileId ? <section className="shared-section"><a className="back-link" href="/">← Voltar aos arquivos</a>
        {loading ? <Skeleton className="h-72 w-full rounded-3xl" /> : shared ? <div className="shared-card"><span className="eyebrow">PRONTO PARA BAIXAR</span><FileGlyph name={shared.name} mime={shared.mime} large /><h1>{shared.name}</h1><p>{formatSize(shared.size)} <span>·</span> Enviado em {new Date(shared.created_at).toLocaleDateString("pt-BR")}</p><div className="shared-actions"><FileActions file={shared} onDeleted={() => { setShared(null); setListError("Arquivo excluído."); }} /><Button asChild className="primary-button"><a href={`/api/download/${shared.id}`} download><ArrowDownToLine /> Baixar arquivo</a></Button><Button variant="outline" className="secondary-button" onClick={() => copyLink(shared.id)}><Link2 /> Copiar link</Button></div><p className="shared-note"><Globe2 size={16} /> {shared.folder_id ? "Este arquivo segue as permissões da pasta." : "Este arquivo é público e foi enviado por um visitante."}</p></div> : <div className="error-box"><AlertCircle /><h1>Arquivo indisponível</h1><p>{listError}</p>{lockedFolder && <a className="unlock-link" href={`/pastas/${lockedFolder}`}>Abrir pasta e informar a senha</a>}<Button variant="outline" onClick={() => location.reload()}>Tentar novamente</Button></div>}
      </section> : <>
      <section id="enviar" className="upload-section">
        {folderId && <a className="back-link" href="/pastas">← Todas as pastas</a>}
        <div className="section-heading"><div><span className="eyebrow">ENVIE. COMPARTILHE. BAIXE.</span><h1>{folderName ?? "Seu arquivo, a um link de distância"}<span>.</span></h1><p>{folderId ? "Arquivos organizados, com o acesso definido para esta pasta." : "Um arquivo de até 10 GB a cada 2 horas, por conexão."}</p></div>{!folderId && <span className="no-account"><Check size={15} /> Sem cadastro</span>}</div>
        {canUpload && <div className="workspace-grid">
          <div className="upload-card">
            <div className="card-topline"><span><Upload size={17} /> Novo envio</span><span>01 / 03</span></div>
            <div className={`drop-zone ${dragging ? "dragging" : ""}`} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }} onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}>
              <span className="upload-icon"><Upload size={31} strokeWidth={1.6} /></span><h2>{dragging ? "Pode soltar!" : "Solte seus arquivos aqui"}</h2><p>ou selecione direto do seu dispositivo</p>
              <Button className="primary-button" disabled={cooldown || !session} onClick={() => input.current?.click()}><Plus size={18} /> Escolher arquivos</Button>
              <input ref={input} className="sr-only" type="file" aria-label="Selecionar arquivos para envio" onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
              <span className="drop-caption">{cooldown ? `Novo envio disponível às ${cooldownText}` : "Qualquer formato · Até 10 GB por arquivo"}</span>
            </div>
            {items.length > 0 && <div className="upload-queue" aria-live="polite">{items.map(item => <div key={item.key} className="queue-item">
              <FileGlyph name={item.file.name} mime={item.file.type} /><div className="queue-content"><strong title={item.file.name}>{item.file.name}</strong><span>{item.status === "done" ? "Enviado • link disponível" : item.status === "cancelled" ? "Envio cancelado" : item.status === "finishing" ? "Preparando seu link…" : item.status === "uploading" ? `${formatSize(item.sent)} de ${formatSize(item.file.size)} · ${Math.floor(item.progress)}%` : formatSize(item.file.size)}</span>
              {(item.status === "uploading" || item.status === "finishing") && <Progress value={item.progress} aria-label={`Progresso de ${item.file.name}`} className="upload-progress" />}
              {item.error && <p className="inline-error">{item.error}</p>}</div>
              {item.status === "done" ? <Button variant="ghost" size="icon" aria-label={`Copiar link de ${item.file.name}`} onClick={() => copyLink(item.id!)}><Link2 /></Button> : item.status === "uploading" ? <Button variant="ghost" size="icon" aria-label={`Cancelar envio de ${item.file.name}`} onClick={() => controller.current?.abort()}><X /></Button> : item.status === "finishing" ? <Loader2 className="spin" size={18} /> : !busy ? <Button variant="ghost" size="icon" aria-label={`Remover ${item.file.name} da fila`} onClick={async () => { if (item.id && item.token && item.status === "error") { try { await api(`/api/uploads/${item.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${item.token}` } }); } catch (e) { toast.error((e as Error).message); return; } } setItems(prev => prev.filter(i => i.key !== item.key)); void loadSession(); }}><X /></Button> : null}
            </div>)}
            {(remaining > 0 || busy) && <Button className="primary-button send-button" disabled={busy || !session || (cooldown && !items.some(i => i.status === "error" && i.id))} onClick={startUploads}>{busy ? <><Loader2 className="spin" /> Enviando arquivos…</> : <><ArrowUpRight /> {items.some(i => i.status === "error") ? "Continuar envio" : `Enviar ${remaining} ${remaining === 1 ? "arquivo" : "arquivos"}`}</>}</Button>}
            {busy && <p className="keep-open">Mantenha esta página aberta até o envio terminar.</p>}</div>}
            <div className="public-notice"><Globe2 size={17} /><p>{folderId ? "Os arquivos seguem as permissões desta pasta." : "Os arquivos enviados aqui ficam públicos. Você pode excluir seus próprios envios."}</p></div>
          </div>
          <aside className="guide-card"><div className="capacity-top"><span>ARQUIVO GRANDE?<br />PODE MANDAR.</span><ArrowUpRight size={26} strokeWidth={1.4} /></div><div className="capacity-number">10<span>GB</span></div><p className="capacity-label">por arquivo, a cada 2 horas.</p><div className="guide-steps"><div><span>01</span><p>Escolha o arquivo</p><Upload size={16} /></div><div><span>02</span><p>Copie o link</p><Link2 size={16} /></div><div><span>03</span><p>Compartilhe por aí</p><ArrowUpRight size={16} /></div></div><div className="guide-footer">Do seu computador<br />para quem você quiser.</div></aside>
        </div>}
      </section>
      <section id="arquivos" className="files-section"><div className="files-heading"><div><span className="eyebrow">{folderId ? "NESTA PASTA" : "DISPONÍVEIS PARA TODO MUNDO"}</span><h2>{folderId ? "Arquivos da pasta" : "Arquivos públicos"} <span className="count-badge">{files.length}{hasMore ? "+" : ""}</span></h2></div><Button variant="outline" className="refresh-button" aria-label="Atualizar arquivos públicos" disabled={loading} onClick={() => void loadFiles().catch(() => {})}><RefreshCw size={15} className={loading ? "spin" : ""} /><span>Atualizar</span></Button></div>
        <div className="file-list">{listError ? <div className="error-box" role="alert"><AlertCircle /><p>{listError}</p><Button variant="outline" onClick={() => void loadFiles().catch(() => {})}>Tentar novamente</Button></div> : loading && files.length === 0 ? <div className="loading-list" aria-label="Carregando arquivos"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div> : files.length === 0 ? <Empty className="empty-files"><span className="empty-icon"><File size={25} strokeWidth={1.4} /></span><EmptyHeader><EmptyTitle>A primeira entrega pode ser sua.</EmptyTitle><EmptyDescription>Os arquivos enviados aparecem aqui, prontos para baixar e compartilhar.</EmptyDescription></EmptyHeader><a href="#enviar">Enviar meu primeiro arquivo <ArrowRight size={16} /></a></Empty> : <Table className="files-table"><TableHeader><TableRow><TableHead>Arquivo</TableHead><TableHead className="size-cell">Tamanho</TableHead><TableHead className="date-cell">Enviado em</TableHead><TableHead className="actions-heading">Download e link</TableHead></TableRow></TableHeader><TableBody>{files.map(file => <TableRow key={file.id}><TableCell><a className="file-name" href={`/f/${file.id}`}><FileGlyph name={file.name} mime={file.mime} /><span title={file.name}>{file.name}<small>{file.name.split(".").pop()?.toUpperCase().slice(0, 12) || "ARQUIVO"}<span className="mobile-size"> · {formatSize(file.size)}</span></small></span></a></TableCell><TableCell className="size-cell">{formatSize(file.size)}</TableCell><TableCell className="date-cell">{new Date(file.created_at).toLocaleDateString("pt-BR")}</TableCell><TableCell><div className="file-actions"><FileActions file={file} onDeleted={() => void loadFiles().catch(() => {})} /><Button variant="ghost" size="icon" aria-label={`Copiar link de ${file.name}`} title="Copiar link" onClick={() => copyLink(file.id)}><Link2 /></Button><Button asChild variant="secondary" className="download-button"><a href={`/api/download/${file.id}`} download aria-label={`Baixar ${file.name}`}><ArrowDownToLine /><span>Baixar</span></a></Button></div></TableCell></TableRow>)}</TableBody></Table>}
        {hasMore && <div className="load-more"><Button variant="outline" disabled={loading} onClick={() => void loadFiles(files.length).catch(() => {})}>{loading ? "Carregando…" : "Carregar mais arquivos"}</Button></div>}</div>
      </section></>}
      <footer className="site-footer"><span className="footer-logo">solta.</span><p>Um arquivo. Um link. Pode compartilhar.</p><span>Arquivos, pastas e trabalho em grupo.</span></footer>
    </main></>;
}
