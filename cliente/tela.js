import { api, post } from './api.js';

// WebRTC leva o vídeo de um participante ao outro. O servidor só troca os sinais.
export function screenRoom(documentId, app) {
  const peerId = crypto.randomUUID();
  const connections = new Map(), candidates = new Map(), sent = new Set(), remote = new Map();
  const button = app.querySelector('#share-screen'), errorBox = app.querySelector('#screen-error'), screens = app.querySelector('#screens');
  let peers = [], local = null, cursor = 0, running = false, closed = false, lastHeartbeat = 0;
  const signal = (receiver, payload) => post(`/api/documents/${documentId}/signals`, { sender: peerId, receiver, payload });
  const heartbeat = (leave = false) => post(`/api/documents/${documentId}/presence`, { peerId, sharing: Boolean(local), leave });

  function render() {
    screens.replaceChildren();
    const streams = [...(local ? [['local', local]] : []), ...remote.entries()];
    if (!streams.length) {
      const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'Nenhuma tela compartilhada'; screens.append(empty);
    }
    for (const [id, stream] of streams) {
      const box = document.createElement('div'), video = document.createElement('video'), label = document.createElement('div');
      box.className = 'screen-video';
      video.autoplay = true; video.playsInline = true; video.muted = id === 'local'; video.controls = id !== 'local'; video.srcObject = stream;
      label.textContent = id === 'local' ? 'Sua tela' : peers.find(peer => peer.peer_id === id)?.name ?? 'Participante';
      box.append(video, label); screens.append(box);
    }
    button.textContent = local ? 'Parar compartilhamento' : 'Compartilhar tela';
  }
  function closePeer(id) {
    connections.get(id)?.close(); connections.delete(id); candidates.delete(id); sent.delete(id); remote.delete(id); render();
  }
  function connection(id) {
    if (connections.has(id)) return connections.get(id);
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }, { urls: 'stun:stun.l.google.com:19302' }] });
    connections.set(id, pc);
    if (local) for (const track of local.getTracks()) pc.addTrack(track, local);
    pc.onicecandidate = event => { if (event.candidate) signal(id, { type: 'candidate', candidate: event.candidate.toJSON() }).catch(() => {}); };
    pc.ontrack = event => { remote.set(id, event.streams[0] ?? new MediaStream([event.track])); render(); };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') { errorBox.textContent = 'Não foi possível conectar a tela nesta rede. Pare e tente novamente em outra conexão.'; closePeer(id); }
    };
    return pc;
  }
  async function stop() {
    const previous = local; local = null;
    previous?.getTracks().forEach(track => { track.onended = null; track.stop(); });
    await Promise.allSettled(peers.filter(peer => peer.peer_id !== peerId).map(peer => signal(peer.peer_id, { type: 'stop' })));
    for (const id of [...connections.keys()]) closePeer(id);
    await heartbeat().catch(() => {}); render();
  }
  button.onclick = async () => {
    errorBox.textContent = '';
    if (local) { await stop(); return; }
    if (!navigator.mediaDevices?.getDisplayMedia) { errorBox.textContent = 'Use um navegador de computador que permita compartilhar tela.'; return; }
    button.disabled = true;
    try {
      local = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15, max: 24 } }, audio: false });
      local.getVideoTracks()[0].onended = () => void stop();
      for (const id of [...connections.keys()]) closePeer(id);
      await heartbeat(); render();
    } catch (error) {
      if (local) await stop();
      if (error.name !== 'NotAllowedError') errorBox.textContent = 'Não foi possível iniciar o compartilhamento.';
    } finally { button.disabled = false; }
  };
  async function flushCandidates(id, pc) {
    for (const candidate of candidates.get(id) ?? []) await pc.addIceCandidate(candidate);
    candidates.delete(id);
  }
  async function tick() {
    if (closed || running) return;
    running = true;
    try {
      if (Date.now() - lastHeartbeat > 8000) { await heartbeat(); lastHeartbeat = Date.now(); }
      if (local || peers.some(peer => peer.sharing)) {
        const result = await api(`/api/documents/${documentId}/signals?peer=${peerId}&after=${cursor}`);
        for (const event of result.signals) {
          try {
            const payload = JSON.parse(event.payload);
            if (payload.type === 'stop') { closePeer(event.sender); continue; }
            const pc = connection(event.sender);
            if (payload.type === 'offer' && payload.description) {
              if (pc.signalingState !== 'stable') {
                if (peerId < event.sender) continue;
                await pc.setLocalDescription({ type: 'rollback' });
              }
              await pc.setRemoteDescription(payload.description); await flushCandidates(event.sender, pc);
              await pc.setLocalDescription(await pc.createAnswer());
              await signal(event.sender, { type: 'answer', description: pc.localDescription.toJSON() });
            } else if (payload.type === 'answer' && payload.description && pc.signalingState === 'have-local-offer') {
              await pc.setRemoteDescription(payload.description); await flushCandidates(event.sender, pc);
            } else if (payload.type === 'candidate' && payload.candidate) {
              if (pc.remoteDescription) await pc.addIceCandidate(payload.candidate);
              else candidates.set(event.sender, [...(candidates.get(event.sender) ?? []), payload.candidate]);
            }
          } catch { errorBox.textContent = 'A conexão de tela foi interrompida. Pare o compartilhamento e tente novamente.'; }
          finally { cursor = Math.max(cursor, event.seq); }
        }
      }
      if (local) for (const peer of peers) {
        if (peer.peer_id === peerId || sent.has(peer.peer_id)) continue;
        const pc = connection(peer.peer_id);
        if (pc.signalingState !== 'stable') continue;
        sent.add(peer.peer_id);
        try { await pc.setLocalDescription(await pc.createOffer()); await signal(peer.peer_id, { type: 'offer', description: pc.localDescription.toJSON() }); }
        catch { sent.delete(peer.peer_id); }
      }
      for (const id of [...connections.keys()]) if (!peers.some(peer => peer.peer_id === id)) closePeer(id);
    } catch (error) { errorBox.textContent = error.message; }
    finally { running = false; }
  }
  render(); void tick();
  const timer = setInterval(tick, 2500);
  return {
    setPeers(value) {
      peers = value;
      for (const id of remote.keys()) if (!peers.some(peer => peer.peer_id === id && peer.sharing)) { remote.delete(id); render(); }
    },
    close() {
      closed = true; clearInterval(timer);
      local?.getTracks().forEach(track => { track.onended = null; track.stop(); }); local = null;
      for (const pc of connections.values()) pc.close();
      post(`/api/documents/${documentId}/presence`, { peerId, sharing: false, leave: true }).catch(() => {});
    },
  };
}
