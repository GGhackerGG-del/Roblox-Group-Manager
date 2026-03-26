import { useRef, useState, useCallback, useEffect } from "react";

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

const CALL_TIMEOUT_MS = 30_000;

export interface IncomingCall {
  callerId: number;
  callerName: string;
  callerAvatar: string;
  offer: RTCSessionDescriptionInit;
}

export interface VoiceCallState {
  connected: boolean;
  callActive: boolean;
  callConnecting: boolean;
  callMuted: boolean;
  callTimer: number;
  incomingCall: IncomingCall | null;
  remoteStreamActive: boolean;
}

export function useVoiceCall(myUserId: number | null, myDisplayName: string, myAvatar: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callTargetRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  const [state, setState] = useState<VoiceCallState>({
    connected: false,
    callActive: false,
    callConnecting: false,
    callMuted: false,
    callTimer: 0,
    incomingCall: null,
    remoteStreamActive: false,
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  const cleanupCall = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    if (callTimerRef.current) clearInterval(callTimerRef.current);
    callTimerRef.current = null;
    if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
    callTimeoutRef.current = null;
    callTargetRef.current = null;
    setState(s => ({
      ...s,
      callActive: false,
      callConnecting: false,
      callMuted: false,
      callTimer: 0,
      incomingCall: null,
      remoteStreamActive: false,
    }));
  }, []);

  const sendWs = useCallback((msg: any): boolean => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }, []);

  const setupPeerConnection = useCallback((stream: MediaStream) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    pc.onicecandidate = (e) => {
      if (e.candidate && callTargetRef.current !== null) {
        sendWs({
          type: "ice-candidate",
          candidate: e.candidate,
          targetUserId: callTargetRef.current,
          fromUserId: myUserId,
        });
      }
    };

    pc.ontrack = (e) => {
      if (!remoteAudioRef.current) {
        remoteAudioRef.current = new Audio();
        remoteAudioRef.current.autoplay = true;
      }
      remoteAudioRef.current.srcObject = e.streams[0];
      remoteAudioRef.current.play().catch(() => {});
      setState(s => ({ ...s, remoteStreamActive: true }));
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        cleanupCall();
      }
    };

    return pc;
  }, [myUserId, sendWs, cleanupCall]);

  const getLocalStream = useCallback(async () => {
    const micId = localStorage.getItem("limitedink_mic_id");
    const constraints: MediaStreamConstraints = {
      audio: micId ? { deviceId: { exact: micId } } : true,
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    localStreamRef.current = stream;
    return stream;
  }, []);

  const startCall = useCallback(async (targetUserId: number) => {
    if (stateRef.current.callActive || stateRef.current.callConnecting) return;
    if (!stateRef.current.connected) return;
    setState(s => ({ ...s, callConnecting: true }));
    callTargetRef.current = targetUserId;

    try {
      const stream = await getLocalStream();
      const pc = setupPeerConnection(stream);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sent = sendWs({
        type: "call-offer",
        targetUserId,
        callerId: myUserId,
        callerName: myDisplayName,
        callerAvatar: myAvatar,
        offer,
      });

      if (!sent) {
        cleanupCall();
        return;
      }

      callTimeoutRef.current = setTimeout(() => {
        if (stateRef.current.callConnecting && !stateRef.current.callActive) {
          cleanupCall();
        }
      }, CALL_TIMEOUT_MS);
    } catch {
      cleanupCall();
    }
  }, [myUserId, myDisplayName, myAvatar, sendWs, getLocalStream, setupPeerConnection, cleanupCall]);

  const acceptCall = useCallback(async () => {
    const incoming = stateRef.current.incomingCall;
    if (!incoming) return;
    callTargetRef.current = incoming.callerId;

    try {
      const stream = await getLocalStream();
      const pc = setupPeerConnection(stream);
      await pc.setRemoteDescription(new RTCSessionDescription(incoming.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      const sent = sendWs({
        type: "call-answer",
        callerId: incoming.callerId,
        answererId: myUserId,
        answer,
      });

      if (!sent) {
        cleanupCall();
        return;
      }

      setState(s => ({
        ...s,
        callActive: true,
        callConnecting: false,
        callTimer: 0,
        incomingCall: null,
      }));
      callTimerRef.current = setInterval(() => {
        setState(s => ({ ...s, callTimer: s.callTimer + 1 }));
      }, 1000);
    } catch {
      cleanupCall();
    }
  }, [myUserId, sendWs, getLocalStream, setupPeerConnection, cleanupCall]);

  const rejectCall = useCallback(() => {
    const incoming = stateRef.current.incomingCall;
    if (!incoming) return;
    sendWs({ type: "call-reject", callerId: incoming.callerId, rejecterId: myUserId });
    setState(s => ({ ...s, incomingCall: null }));
  }, [myUserId, sendWs]);

  const endCall = useCallback(() => {
    if (callTargetRef.current !== null) {
      sendWs({ type: "call-end", targetUserId: callTargetRef.current, userId: myUserId });
    }
    const timer = stateRef.current.callTimer;
    cleanupCall();
    return timer;
  }, [myUserId, sendWs, cleanupCall]);

  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
      setState(s => ({ ...s, callMuted: !s.callMuted }));
    }
  }, []);

  const connectWs = useCallback(() => {
    if (!myUserId || unmountedRef.current) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    const wsUrl = `${protocol}//${window.location.host}${base}/ws/signaling`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setState(s => ({ ...s, connected: true }));
      ws.send(JSON.stringify({ type: "register", userId: myUserId, displayName: myDisplayName }));
    };

    ws.onmessage = (event) => {
      let msg: any;
      try { msg = JSON.parse(event.data); } catch { return; }

      switch (msg.type) {
        case "incoming-call":
          if (!stateRef.current.callActive && !stateRef.current.callConnecting) {
            setState(s => ({
              ...s,
              incomingCall: {
                callerId: msg.callerId,
                callerName: msg.callerName,
                callerAvatar: msg.callerAvatar,
                offer: msg.offer,
              },
            }));
          } else {
            sendWs({ type: "call-reject", callerId: msg.callerId, rejecterId: myUserId });
          }
          break;

        case "call-accepted":
          if (callTimeoutRef.current) {
            clearTimeout(callTimeoutRef.current);
            callTimeoutRef.current = null;
          }
          if (pcRef.current) {
            pcRef.current.setRemoteDescription(new RTCSessionDescription(msg.answer))
              .then(() => {
                setState(s => ({ ...s, callActive: true, callConnecting: false, callTimer: 0 }));
                callTimerRef.current = setInterval(() => {
                  setState(s => ({ ...s, callTimer: s.callTimer + 1 }));
                }, 1000);
              })
              .catch(() => cleanupCall());
          }
          break;

        case "call-rejected":
          cleanupCall();
          break;

        case "call-unavailable":
          cleanupCall();
          break;

        case "call-ended":
          cleanupCall();
          break;

        case "ice-candidate":
          if (pcRef.current && msg.candidate) {
            pcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(() => {});
          }
          break;
      }
    };

    ws.onclose = () => {
      setState(s => ({ ...s, connected: false }));
      if (!unmountedRef.current) {
        reconnectTimerRef.current = setTimeout(() => connectWs(), 3000);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [myUserId, myDisplayName, sendWs, cleanupCall]);

  useEffect(() => {
    unmountedRef.current = false;
    connectWs();
    return () => {
      unmountedRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
      wsRef.current?.close();
      cleanupCall();
    };
  }, [connectWs, cleanupCall]);

  return {
    ...state,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
  };
}
