import { useRef, useState, useCallback, useEffect } from "react";
import {
  startOutgoingRing, stopOutgoingRing,
  startIncomingRing, stopIncomingRing,
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

const CALL_TIMEOUT_MS = 30_000;

export interface IncomingCall {
  callerId: number;
  callerName: string;
  callerAvatar: string;
  offer: RTCSessionDescriptionInit;
}

export interface CallPeerInfo {
  userId: number;
  name: string;
  avatar: string;
}

export interface VoiceCallState {
  connected: boolean;
  callActive: boolean;
  callConnecting: boolean;
  callMuted: boolean;
  callDeafened: boolean;
  callTimer: number;
  incomingCall: IncomingCall | null;
  remoteStreamActive: boolean;
  videoEnabled: boolean;
  screenSharing: boolean;
  remoteVideoEnabled: boolean;
  remoteScreenSharing: boolean;
  callPeer: CallPeerInfo | null;
}

export function useVoiceCall(myUserId: number | null, myDisplayName: string, myAvatar: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callTargetRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);
  const videoSenderRef = useRef<RTCRtpSender | null>(null);
  const screenSenderRef = useRef<RTCRtpSender | null>(null);
  const renegotiatingRef = useRef(false);

  const [state, setState] = useState<VoiceCallState>({
    connected: false,
    callActive: false,
    callConnecting: false,
    callMuted: false,
    callDeafened: false,
    callTimer: 0,
    incomingCall: null,
    remoteStreamActive: false,
    videoEnabled: false,
    screenSharing: false,
    remoteVideoEnabled: false,
    remoteScreenSharing: false,
    callPeer: null,
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  const cleanupCall = useCallback((playEndSound = true) => {
    stopAllSounds();
    if (playEndSound && (stateRef.current.callActive || stateRef.current.callConnecting)) {
      playCallEnded();
    }
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    localVideoStreamRef.current?.getTracks().forEach(t => t.stop());
    localVideoStreamRef.current = null;
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current = null;
    videoSenderRef.current = null;
    screenSenderRef.current = null;
    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause();
      remoteAudioRef.current.srcObject = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
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
      callDeafened: false,
      callTimer: 0,
      incomingCall: null,
      remoteStreamActive: false,
      videoEnabled: false,
      screenSharing: false,
      remoteVideoEnabled: false,
      remoteScreenSharing: false,
      callPeer: null,
    }));
  }, []);

  const sendWs = useCallback((msg: any): boolean => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }, []);

  const handleRemoteTrack = useCallback((e: RTCTrackEvent) => {
    const stream = e.streams[0];
    if (!stream) return;

    if (e.track.kind === "audio") {
      if (!remoteAudioRef.current) {
        remoteAudioRef.current = new Audio();
        remoteAudioRef.current.autoplay = true;
      }
      remoteAudioRef.current.srcObject = stream;
      remoteAudioRef.current.play().catch(() => {});
      setState(s => ({ ...s, remoteStreamActive: true }));
    } else if (e.track.kind === "video") {
      const trackLabel = e.track.label?.toLowerCase() || "";
      const isScreen = trackLabel.includes("screen") || trackLabel.includes("monitor") || trackLabel.includes("window") || trackLabel.includes("display") || trackLabel.includes("tab");

      if (isScreen) {
        if (screenVideoRef.current) {
          screenVideoRef.current.srcObject = stream;
          screenVideoRef.current.play().catch(() => {});
        }
        setState(s => ({ ...s, remoteScreenSharing: true }));
        e.track.onended = () => {
          setState(s => ({ ...s, remoteScreenSharing: false }));
        };
      } else {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
          remoteVideoRef.current.play().catch(() => {});
        }
        setState(s => ({ ...s, remoteVideoEnabled: true }));
        e.track.onended = () => {
          setState(s => ({ ...s, remoteVideoEnabled: false }));
        };
      }
    }
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

    pc.ontrack = handleRemoteTrack;

    pc.onnegotiationneeded = async () => {
      if (renegotiatingRef.current) return;
      if (!stateRef.current.callActive) return;
      renegotiatingRef.current = true;
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendWs({
          type: "renegotiate-offer",
          targetUserId: callTargetRef.current,
          fromUserId: myUserId,
          offer,
        });
      } catch {
      } finally {
        renegotiatingRef.current = false;
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        cleanupCall();
      }
    };

    return pc;
  }, [myUserId, sendWs, cleanupCall, handleRemoteTrack]);

  const getLocalStream = useCallback(async () => {
    const micId = localStorage.getItem("limitedink_mic_id");
    const constraints: MediaStreamConstraints = {
      audio: micId ? { deviceId: { exact: micId } } : true,
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    localStreamRef.current = stream;
    return stream;
  }, []);

  const startCall = useCallback(async (targetUserId: number, peerName?: string, peerAvatar?: string) => {
    if (stateRef.current.callActive || stateRef.current.callConnecting) return;
    if (!stateRef.current.connected) return;
    setState(s => ({ ...s, callConnecting: true, callPeer: { userId: targetUserId, name: peerName || "User", avatar: peerAvatar || "" } }));
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

      startOutgoingRing();

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
    stopIncomingRing();
    try { (window as any).electronAPI?.focusWindow?.(); } catch {}
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

      playCallConnected();

      setState(s => ({
        ...s,
        callActive: true,
        callConnecting: false,
        callTimer: 0,
        incomingCall: null,
        callPeer: { userId: incoming.callerId, name: incoming.callerName, avatar: incoming.callerAvatar },
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
    stopIncomingRing();
    try { (window as any).electronAPI?.focusWindow?.(); } catch {}
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
      const willMute = !stateRef.current.callMuted;
      localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !willMute; });
      willMute ? playMute() : playUnmute();
      setState(s => ({ ...s, callMuted: willMute }));
    }
  }, []);

  const toggleDeafen = useCallback(() => {
    if (remoteAudioRef.current) {
      const willDeafen = !stateRef.current.callDeafened;
      remoteAudioRef.current.muted = willDeafen;
      willDeafen ? playDeafen() : playUndeafen();
      setState(s => ({ ...s, callDeafened: willDeafen }));
    }
  }, []);

  const toggleVideo = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || !stateRef.current.callActive) return;

    if (stateRef.current.videoEnabled) {
      localVideoStreamRef.current?.getTracks().forEach(t => t.stop());
      localVideoStreamRef.current = null;
      if (videoSenderRef.current) {
        pc.removeTrack(videoSenderRef.current);
        videoSenderRef.current = null;
      }
      setState(s => ({ ...s, videoEnabled: false }));
      sendWs({ type: "track-state", targetUserId: callTargetRef.current, fromUserId: myUserId, track: "video", enabled: false });
    } else {
      try {
        const camId = localStorage.getItem("limitedink_cam_id");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: camId ? { deviceId: { exact: camId } } : { width: 640, height: 480 },
        });
        localVideoStreamRef.current = stream;
        const videoTrack = stream.getVideoTracks()[0];

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.play().catch(() => {});
        }

        const sender = pc.addTrack(videoTrack, stream);
        videoSenderRef.current = sender;

        setState(s => ({ ...s, videoEnabled: true }));
        sendWs({ type: "track-state", targetUserId: callTargetRef.current, fromUserId: myUserId, track: "video", enabled: true });
      } catch {
      }
    }
  }, [sendWs, myUserId]);

  const toggleScreenShare = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || !stateRef.current.callActive) return;

    if (stateRef.current.screenSharing) {
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
      if (screenSenderRef.current) {
        pc.removeTrack(screenSenderRef.current);
        screenSenderRef.current = null;
      }
      setState(s => ({ ...s, screenSharing: false }));
      sendWs({ type: "track-state", targetUserId: callTargetRef.current, fromUserId: myUserId, track: "screen", enabled: false });
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { width: 1920, height: 1080 },
          audio: false,
        });
        screenStreamRef.current = stream;
        const screenTrack = stream.getVideoTracks()[0];

        screenTrack.onended = () => {
          screenStreamRef.current = null;
          if (screenSenderRef.current && pcRef.current) {
            pcRef.current.removeTrack(screenSenderRef.current);
            screenSenderRef.current = null;
          }
          setState(s => ({ ...s, screenSharing: false }));
          sendWs({ type: "track-state", targetUserId: callTargetRef.current, fromUserId: myUserId, track: "screen", enabled: false });
        };

        if (screenVideoRef.current) {
          screenVideoRef.current.srcObject = stream;
        }

        const sender = pc.addTrack(screenTrack, stream);
        screenSenderRef.current = sender;

        setState(s => ({ ...s, screenSharing: true }));
        sendWs({ type: "track-state", targetUserId: callTargetRef.current, fromUserId: myUserId, track: "screen", enabled: true });
      } catch {
      }
    }
  }, [sendWs, myUserId]);

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
            startIncomingRing();
            setState(s => ({
              ...s,
              incomingCall: {
                callerId: msg.callerId,
                callerName: msg.callerName,
                callerAvatar: msg.callerAvatar,
                offer: msg.offer,
              },
            }));
            try {
              const ea = (window as any).electronAPI;
              if (ea?.showCallNotification) {
                ea.showCallNotification(msg.callerName || "Unknown", msg.callerAvatar);
              } else if ("Notification" in window && Notification.permission === "granted") {
                new Notification("Incoming Call", {
                  body: `${msg.callerName || "Someone"} is calling you`,
                  icon: msg.callerAvatar || undefined,
                  requireInteraction: true,
                });
              } else if ("Notification" in window && Notification.permission === "default") {
                Notification.requestPermission().then(p => {
                  if (p === "granted") {
                    new Notification("Incoming Call", {
                      body: `${msg.callerName || "Someone"} is calling you`,
                      icon: msg.callerAvatar || undefined,
                      requireInteraction: true,
                    });
                  }
                });
              }
            } catch {}
          } else {
            sendWs({ type: "call-reject", callerId: msg.callerId, rejecterId: myUserId });
          }
          break;

        case "call-accepted":
          stopOutgoingRing();
          if (callTimeoutRef.current) {
            clearTimeout(callTimeoutRef.current);
            callTimeoutRef.current = null;
          }
          if (pcRef.current) {
            pcRef.current.setRemoteDescription(new RTCSessionDescription(msg.answer))
              .then(() => {
                playCallConnected();
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

        case "renegotiate-offer":
          if (pcRef.current) {
            (async () => {
              try {
                const pc = pcRef.current!;
                await pc.setRemoteDescription(new RTCSessionDescription(msg.offer));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                sendWs({
                  type: "renegotiate-answer",
                  targetUserId: msg.fromUserId,
                  fromUserId: myUserId,
                  answer,
                });
              } catch {}
            })();
          }
          break;

        case "renegotiate-answer":
          if (pcRef.current) {
            pcRef.current.setRemoteDescription(new RTCSessionDescription(msg.answer)).catch(() => {});
          }
          break;

        case "track-state":
          if (msg.track === "video") {
            setState(s => ({ ...s, remoteVideoEnabled: msg.enabled }));
          } else if (msg.track === "screen") {
            setState(s => ({ ...s, remoteScreenSharing: msg.enabled }));
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
      stopAllSounds();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
      wsRef.current?.close();
      cleanupCall(false);
    };
  }, [connectWs, cleanupCall]);

  return {
    ...state,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleDeafen,
    toggleVideo,
    toggleScreenShare,
    localVideoRef,
    remoteVideoRef,
    screenVideoRef,
    localVideoStreamRef,
    screenStreamRef,
  };
}
