"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { MonitorUp, MonitorOff, Monitor, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { api, post } from "@/lib/client-api";
export type Peer = { peer_id: string; name: string; sharing: number };
type Signal = { type: "offer" | "answer" | "candidate" | "stop"; description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
function Video({ stream, local = false, name }: { stream: MediaStream; local?: boolean; name: string }) {
  const ref = useRef<HTMLVideoElement>(null); useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]);
  return <div className="screen-video"><video ref={ref} autoPlay playsInline muted={local} controls={!local} /><div><span>{local ? "Sua tela" : name}</span><Button variant="ghost" size="icon" aria-label="Ampliar tela" onClick={() => ref.current?.requestFullscreen().catch(() => toast.error("Não foi possível ampliar a tela."))}><Maximize2 size={15} /></Button></div></div>;
}
export function ScreenRoom({ documentId, peerId, peers, ready }: { documentId: string; peerId: string; peers: Peer[]; ready: boolean }) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null), [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({}), [error, setError] = useState("");
  const streamRef = useRef<MediaStream | null>(null), peersRef = useRef(peers), connections = useRef(new Map<string, RTCPeerConnection>()), candidates = useRef(new Map<string, RTCIceCandidateInit[]>()), sent = useRef(new Set<string>()), lastSignal = useRef(0), active = useRef(true);
  peersRef.current = peers;
  const signal = useCallback((receiver: string, payload: Signal) => post(`/api/documents/${documentId}/signals`, { sender: peerId, receiver, payload }), [documentId, peerId]);
  const heartbeat = useCallback((sharing = Boolean(streamRef.current), leave = false) => post(`/api/documents/${documentId}/presence`, { peerId, sharing, leave }), [documentId, peerId]);
  const closePeer = useCallback((id: string) => { connections.current.get(id)?.close(); connections.current.delete(id); candidates.current.delete(id); sent.current.delete(id); setRemoteStreams(prev => { const next = { ...prev }; delete next[id]; return next; }); }, []);
  const connection = useCallback((id: string) => {
    let pc = connections.current.get(id); if (pc) return pc;
    pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun.cloudflare.com:3478" }] });
    connections.current.set(id, pc);
    if (streamRef.current) for (const track of streamRef.current.getTracks()) pc.addTrack(track, streamRef.current);
    pc.onicecandidate = e => { if (e.candidate) void signal(id, { type: "candidate", candidate: e.candidate.toJSON() }).catch(() => {}); };
    pc.ontrack = e => { const stream = e.streams[0] ?? new MediaStream([e.track]); if (active.current) setRemoteStreams(prev => ({ ...prev, [id]: stream })); };
    pc.onconnectionstatechange = () => { if (pc?.connectionState === "failed") { setError("Não foi possível conectar a tela nesta rede. Tente outra conexão; redes restritas podem precisar de um servidor de retransmissão."); closePeer(id); } };
    return pc;
  }, [signal, closePeer]);
  const stop = useCallback(async () => {
    const stream = streamRef.current; streamRef.current = null; stream?.getTracks().forEach(t => t.stop()); setLocalStream(null);
    await Promise.allSettled(peersRef.current.filter(p => p.peer_id !== peerId).map(p => signal(p.peer_id, { type: "stop" })));
    for (const id of [...connections.current.keys()]) closePeer(id); await heartbeat(false).catch(() => {});
  }, [closePeer, heartbeat, peerId, signal]);
  const share = async () => {
    setError(""); if (!navigator.mediaDevices?.getDisplayMedia) { setError("Este navegador não permite compartilhar tela. Abra o site no Chrome ou Edge em um computador."); return; }
    try { const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15, max: 24 } }, audio: false });
      streamRef.current = stream; setLocalStream(stream); stream.getVideoTracks()[0].onended = () => void stop();
      for (const id of [...connections.current.keys()]) closePeer(id); await heartbeat(true);
    } catch (e) { if ((e as Error).name !== "NotAllowedError") setError("Não foi possível iniciar o compartilhamento de tela."); if (streamRef.current) void stop(); }
  };
  useEffect(() => {
    if (!ready) return; active.current = true; let processing = false;
    const tick = async () => {
      if (processing) return; processing = true;
      try {
        await heartbeat(); const result = await api<{ signals: { seq: number; sender: string; payload: string }[] }>(`/api/documents/${documentId}/signals?peer=${peerId}&after=${lastSignal.current}`);
        for (const event of result.signals) {
          try { const message = JSON.parse(event.payload) as Signal;
            if (message.type === "stop") { closePeer(event.sender); continue; }
            const pc = connection(event.sender);
            if (message.type === "offer" && message.description) {
              if (pc.signalingState !== "stable") { if (peerId < event.sender) continue; await pc.setLocalDescription({ type: "rollback" }); }
              await pc.setRemoteDescription(message.description); for (const ice of candidates.current.get(event.sender) ?? []) await pc.addIceCandidate(ice); candidates.current.delete(event.sender);
              await pc.setLocalDescription(await pc.createAnswer()); await signal(event.sender, { type: "answer", description: pc.localDescription!.toJSON() });
            } else if (message.type === "answer" && message.description && pc.signalingState === "have-local-offer") { await pc.setRemoteDescription(message.description); for (const ice of candidates.current.get(event.sender) ?? []) await pc.addIceCandidate(ice); candidates.current.delete(event.sender); }
            else if (message.type === "candidate" && message.candidate) { if (pc.remoteDescription) await pc.addIceCandidate(message.candidate); else candidates.current.set(event.sender, [...(candidates.current.get(event.sender) ?? []), message.candidate]); }
          } catch { setError("A conexão de tela foi interrompida. Pare o compartilhamento e tente novamente."); }
          finally { lastSignal.current = Math.max(lastSignal.current, event.seq); }
        }
        if (streamRef.current) for (const peer of peersRef.current) { if (peer.peer_id === peerId || sent.current.has(peer.peer_id)) continue; sent.current.add(peer.peer_id); try { const pc = connection(peer.peer_id); if (pc.signalingState === "stable") { await pc.setLocalDescription(await pc.createOffer()); await signal(peer.peer_id, { type: "offer", description: pc.localDescription!.toJSON() }); } } catch { sent.current.delete(peer.peer_id); } }
        for (const id of connections.current.keys()) if (!peersRef.current.some(p => p.peer_id === id)) closePeer(id);
      } catch { /* Document connection status is displayed by the editor. */ } finally { processing = false; }
    };
    void tick(); const timer = setInterval(() => void tick(), 2500);
    return () => { active.current = false; clearInterval(timer); streamRef.current?.getTracks().forEach(t => { t.onended = null; t.stop(); }); streamRef.current = null; for (const pc of connections.current.values()) pc.close(); connections.current.clear(); void heartbeat(false, true).catch(() => {}); };
  }, [ready, heartbeat, documentId, peerId, connection, closePeer, signal]);
  return <aside className="screen-panel"><div className="screen-heading"><Monitor size={18} /><h2>Tela ao vivo</h2></div><p>Mostre uma janela ou aba para as pessoas deste documento.</p><Button className={localStream ? "stop-screen" : "primary-button"} disabled={!ready} onClick={() => localStream ? void stop() : void share()}>{localStream ? <><MonitorOff />Parar compartilhamento</> : <><MonitorUp />Compartilhar tela</>}</Button>{error && <p className="inline-error" role="alert">{error}</p>}
    {localStream && <Video stream={localStream} local name="Você" />}{Object.entries(remoteStreams).map(([id, stream]) => <Video key={id} stream={stream} name={peers.find(p => p.peer_id === id)?.name ?? "Participante"} />)}
    {!localStream && Object.keys(remoteStreams).length === 0 && <div className="screen-empty"><Monitor size={35} strokeWidth={1.3} /><span>Nenhuma tela compartilhada</span></div>}<small>Você escolhe o que mostrar e pode parar a qualquer momento. O site não grava a tela.</small>
  </aside>;
}
