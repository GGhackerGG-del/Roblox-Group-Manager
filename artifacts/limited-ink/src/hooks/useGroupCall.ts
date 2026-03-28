import { useRef, useState, useCallback, useEffect } from "react";
import {
  playCallConnected, playCallEnded,
  playMute, playUnmute,
  playDeafen, playUndeafen,
  stopAllSounds,
} from "@/lib/callSounds";

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export interface GroupCallPeer {
  userId: number;
  displayName: string;
  avatarUrl: string;
  pc: RTCPeerConnection;
  audioStream: MediaStream | null;
  speaking: boolean;
}

export interface GroupCallState {
  active: boolean;
  groupChatId: number | null;
  muted: boolean;
  deafened: boolean;
  timer: number;
  peers: Map<number, GroupCallPeer>;
  error: string | null;
}

export function useGroupCall(myUserId: number | null, myDisplayName: string, myAvatar: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<number, GroupCallPeer>>(new Map());
  const audioElementsRef = useRef<Map<number, HTMLAudioElement>>(new Map());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unmountedRef = useRef(false);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const groupChatIdRef = useRef<number | null>(null);

  const [state, setState] = useState<GroupCallState>({
    active: false,
    groupChatId: null,
    muted: false,
    deafened: false,
    timer: 0,
    peers: new Map(),
    error: null,
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  const syncPeersToState = useCallback(() => {
    setState(s => ({ ...s, peers: new Map(peersRef.current) }));
  }, []);

  const sendWs = useCallback((msg: any): boolean => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }, []);

  const getLocalStream = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;
    const micId = localStorage.getItem("limitedink_mic_id");
    const constraints: MediaStreamConstraints = {
      audio: micId ? { deviceId: { exact: micId } } : true,
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    localStreamRef.current = stream;
    return stream;
  }, []);

  const cleanupCall = useCallback(() => {
    stopAllSounds();
    if (stateRef.current.active) playCallEnded();

    for (const [, peer] of peersRef.current) {
      peer.pc.close();
    }
    peersRef.current.clear();

    for (const [, el] of audioElementsRef.current) {
      el.pause();
      el.srcObject = null;
    }
    audioElementsRef.current.clear();

    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;

    const gid = groupChatIdRef.current;
    if (gid !== null) {
      sendWs({ type: "group-call-leave", groupChatId: gid });
    }
    groupChatIdRef.current = null;

    setState(s => ({
      ...s,
      active: false,
      groupChatId: null,
      muted: false,
      deafened: false,
      timer: 0,
      peers: new Map(),
    }));
  }, [sendWs]);

  const createPeerConnection = useCallback((peerId: number, peerDisplayName: string, peerAvatarUrl: string) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current!));
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        sendWs({
          type: "group-ice-candidate",
          targetUserId: peerId,
          groupChatId: groupChatIdRef.current,
          candidate: e.candidate,
        });
      }
    };

    pc.ontrack = (e) => {
      const stream = e.streams[0];
      if (!stream || e.track.kind !== "audio") return;

      let audioEl = audioElementsRef.current.get(peerId);
      if (!audioEl) {
        audioEl = new Audio();
        audioEl.autoplay = true;
        audioElementsRef.current.set(peerId, audioEl);
      }
      audioEl.srcObject = stream;
      audioEl.play().catch(() => {});

      const peer = peersRef.current.get(peerId);
      if (peer) {
        peer.audioStream = stream;
        syncPeersToState();
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        removePeer(peerId);
      }
    };

    const peer: GroupCallPeer = {
      userId: peerId,
      displayName: peerDisplayName,
      avatarUrl: peerAvatarUrl,
      pc,
      audioStream: null,
      speaking: false,
    };
    peersRef.current.set(peerId, peer);
    syncPeersToState();

    return pc;
  }, [sendWs, syncPeersToState]);

  const removePeer = useCallback((peerId: number) => {
    const peer = peersRef.current.get(peerId);
    if (peer) {
      peer.pc.close();
      peersRef.current.delete(peerId);
    }
    const audioEl = audioElementsRef.current.get(peerId);
    if (audioEl) {
      audioEl.pause();
      audioEl.srcObject = null;
      audioElementsRef.current.delete(peerId);
    }
    syncPeersToState();
  }, [syncPeersToState]);

  const handleMessage = useCallback(async (msg: any) => {
    if (!msg.type?.startsWith("group-")) return;

    switch (msg.type) {
      case "group-call-peers": {
        for (const peerId of msg.peers) {
          if (peerId === myUserId) continue;
          try {
            const stream = await getLocalStream();
            const pc = createPeerConnection(peerId, "", "");
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            sendWs({
              type: "group-call-offer",
              targetUserId: peerId,
              groupChatId: msg.groupChatId,
              offer,
            });
          } catch {}
        }
        break;
      }

      case "group-call-peer-joined": {
        break;
      }

      case "group-call-peer-left": {
        removePeer(msg.userId);
        if (peersRef.current.size === 0 && stateRef.current.active) {
        }
        break;
      }

      case "group-call-offer": {
        try {
          const stream = await getLocalStream();
          const pc = createPeerConnection(msg.fromUserId, msg.fromDisplayName || "", msg.fromAvatarUrl || "");
          await pc.setRemoteDescription(new RTCSessionDescription(msg.offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendWs({
            type: "group-call-answer",
            targetUserId: msg.fromUserId,
            groupChatId: msg.groupChatId,
            answer,
          });

          if (!stateRef.current.active) {
            playCallConnected();
            setState(s => ({ ...s, active: true, groupChatId: msg.groupChatId, timer: 0 }));
            groupChatIdRef.current = msg.groupChatId;
            if (!timerRef.current) {
              timerRef.current = setInterval(() => {
                setState(s => ({ ...s, timer: s.timer + 1 }));
              }, 1000);
            }
          }
        } catch {}
        break;
      }

      case "group-call-answer": {
        const peer = peersRef.current.get(msg.fromUserId);
        if (peer) {
          await peer.pc.setRemoteDescription(new RTCSessionDescription(msg.answer)).catch(() => {});
        }
        break;
      }

      case "group-ice-candidate": {
        const peer = peersRef.current.get(msg.fromUserId);
        if (peer && msg.candidate) {
          peer.pc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(() => {});
        }
        break;
      }

      case "group-call-participants": {
        break;
      }
    }
  }, [myUserId, sendWs, getLocalStream, createPeerConnection, removePeer]);

  const connectWs = useCallback(() => {
    if (!myUserId || unmountedRef.current) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    const wsUrl = `${protocol}//${window.location.host}${base}/ws/signaling`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "register", userId: myUserId, displayName: myDisplayName }));
      if (stateRef.current.active && groupChatIdRef.current !== null) {
        ws.send(JSON.stringify({ type: "group-call-join", groupChatId: groupChatIdRef.current }));
      }
    };

    ws.onmessage = (event) => {
      let msg: any;
      try { msg = JSON.parse(event.data); } catch { return; }
      handleMessage(msg);
    };

    ws.onclose = () => {
      if (!unmountedRef.current) {
        reconnectRef.current = setTimeout(() => connectWs(), 3000);
      }
    };

    ws.onerror = () => ws.close();
  }, [myUserId, myDisplayName, handleMessage]);

  useEffect(() => {
    unmountedRef.current = false;
    connectWs();
    return () => {
      unmountedRef.current = true;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (stateRef.current.active) cleanupCall();
      wsRef.current?.close();
    };
  }, [connectWs]);

  const joinCall = useCallback(async (groupChatId: number) => {
    if (stateRef.current.active) return;

    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      setState(s => ({ ...s, error: "Not connected to server" }));
      setTimeout(() => setState(s => ({ ...s, error: null })), 5000);
      return;
    }

    try {
      await getLocalStream();
      groupChatIdRef.current = groupChatId;
      setState(s => ({ ...s, active: true, groupChatId, timer: 0, error: null }));
      playCallConnected();

      sendWs({ type: "group-call-join", groupChatId });

      timerRef.current = setInterval(() => {
        setState(s => ({ ...s, timer: s.timer + 1 }));
      }, 1000);
    } catch (err: any) {
      const msg = err?.name === "NotAllowedError"
        ? "Microphone access denied"
        : err?.name === "NotFoundError"
        ? "No microphone found"
        : "Failed to start call";
      setState(s => ({ ...s, error: msg }));
      setTimeout(() => setState(s => ({ ...s, error: null })), 5000);
    }
  }, [sendWs, getLocalStream]);

  const leaveCall = useCallback(() => {
    cleanupCall();
  }, [cleanupCall]);

  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const willMute = !stateRef.current.muted;
      localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !willMute; });
      willMute ? playMute() : playUnmute();
      setState(s => ({ ...s, muted: willMute }));
    }
  }, []);

  const toggleDeafen = useCallback(() => {
    const willDeafen = !stateRef.current.deafened;
    for (const [, el] of audioElementsRef.current) {
      el.muted = willDeafen;
    }
    willDeafen ? playDeafen() : playUndeafen();
    setState(s => ({ ...s, deafened: willDeafen }));
  }, []);

  const getParticipants = useCallback((groupChatId: number) => {
    sendWs({ type: "group-call-participants", groupChatId });
  }, [sendWs]);

  return {
    ...state,
    joinCall,
    leaveCall,
    toggleMute,
    toggleDeafen,
    getParticipants,
  };
}
