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
  showScreenPicker: boolean;
  callPeer: CallPeerInfo | null;
  callError: string | null;
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
  const remoteScreenStreamRef = useRef<MediaStream | null>(null);
  const myUserIdRef = useRef(myUserId);
  myUserIdRef.current = myUserId;
  const myDisplayNameRef = useRef(myDisplayName);
  myDisplayNameRef.current = myDisplayName;
  const myAvatarRef = useRef(myAvatar);
  myAvatarRef.current = myAvatar;

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
    showScreenPicker: false,
    callPeer: null,
    callError: null,
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
    remoteScreenStreamRef.current = null;
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
      showScreenPicker: false,
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

  const assignScreenStream = useCallback((stream: MediaStream | null) => {
    remoteScreenStreamRef.current = stream;
    const tryAssign = () => {
      if (screenVideoRef.current && stream) {
        screenVideoRef.current.srcObject = stream;
        screenVideoRef.current.play().catch(() => {});
      }
    };
    tryAssign();
    setTimeout(tryAssign, 50);
    setTimeout(tryAssign, 200);
    setTimeout(tryAssign, 600);
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
      const isScreenFromLabel = trackLabel.includes("screen") || trackLabel.includes("monitor") || trackLabel.includes("window") || trackLabel.includes("display") || trackLabel.includes("tab");
      const isScreenFromSignaling = stateRef.current.remoteScreenSharing;
      const isScreen = isScreenFromLabel || (isScreenFromSignaling && !remoteScreenStreamRef.current);

      if (isScreen) {
        assignScreenStream(stream);
        setState(s => ({ ...s, remoteScreenSharing: true }));
        e.track.onended = () => {
          remoteScreenStreamRef.current = null;
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
  }, [assignScreenStream]);

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
          fromUserId: myUserIdRef.current,
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
          fromUserId: myUserIdRef.current,
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
  }, [sendWs, cleanupCall, handleRemoteTrack]);

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
    if (!stateRef.current.connected) {
      setState(s => ({ ...s, callError: "Not connected to server. Try again in a moment." }));
      setTimeout(() => setState(s => ({ ...s, callError: null })), 4000);
      return;
    }
    setState(s => ({ ...s, callConnecting: true, callError: null, callPeer: { userId: targetUserId, name: peerName || "User", avatar: peerAvatar || "" } }));
    callTargetRef.current = targetUserId;

    try {
      const stream = await getLocalStream();
      const pc = setupPeerConnection(stream);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sent = sendWs({
        type: "call-offer",
        targetUserId,
        callerId: myUserIdRef.current,
        callerName: myDisplayNameRef.current,
        callerAvatar: myAvatarRef.current,
        offer,
      });

      if (!sent) {
        cleanupCall();
        setState(s => ({ ...s, callError: "Connection lost. Reconnecting..." }));
        setTimeout(() => setState(s => ({ ...s, callError: null })), 4000);
        return;
      }

      startOutgoingRing();

      callTimeoutRef.current = setTimeout(() => {
        if (stateRef.current.callConnecting && !stateRef.current.callActive) {
          cleanupCall();
          setState(s => ({ ...s, callError: "No answer" }));
          setTimeout(() => setState(s => ({ ...s, callError: null })), 4000);
        }
      }, CALL_TIMEOUT_MS);
    } catch (err: any) {
      cleanupCall();
      const msg = err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError"
        ? "Microphone access denied. Allow microphone in browser/app settings."
        : err?.name === "NotFoundError"
        ? "No microphone found. Connect a microphone and try again."
        : "Failed to start call. Check your microphone.";
      setState(s => ({ ...s, callError: msg }));
      setTimeout(() => setState(s => ({ ...s, callError: null })), 5000);
    }
  }, [sendWs, getLocalStream, setupPeerConnection, cleanupCall]);

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
        answererId: myUserIdRef.current,
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
  }, [sendWs, getLocalStream, setupPeerConnection, cleanupCall]);

  const rejectCall = useCallback(() => {
    const incoming = stateRef.current.incomingCall;
    if (!incoming) return;
    stopIncomingRing();
    try { (window as any).electronAPI?.focusWindow?.(); } catch {}
    sendWs({ type: "call-reject", callerId: incoming.callerId, rejecterId: myUserIdRef.current });
    setState(s => ({ ...s, incomingCall: null }));
  }, [sendWs]);

  const endCall = useCallback(() => {
    if (callTargetRef.current !== null) {
      sendWs({ type: "call-end", targetUserId: callTargetRef.current, userId: myUserIdRef.current });
    }
    const timer = stateRef.current.callTimer;
    cleanupCall();
    return timer;
  }, [sendWs, cleanupCall]);

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
      sendWs({ type: "track-state", targetUserId: callTargetRef.current, fromUserId: myUserIdRef.current, track: "video", enabled: false });
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
        sendWs({ type: "track-state", targetUserId: callTargetRef.current, fromUserId: myUserIdRef.current, track: "video", enabled: true });
      } catch {
      }
    }
  }, [sendWs]);

  const startScreenStream = useCallback(async (sourceId?: string) => {
    const pc = pcRef.current;
    if (!pc) return;

    try {
      let stream: MediaStream;
      const ea = (window as any).electronAPI;

      if (ea?.isElectron && sourceId) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: "desktop",
              chromeMediaSourceId: sourceId,
              maxWidth: 1920,
              maxHeight: 1080,
            },
          } as any,
        });
      } else {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: { width: 1920, height: 1080 },
          audio: false,
        });
      }

      screenStreamRef.current = stream;
      const screenTrack = stream.getVideoTracks()[0];

      screenTrack.onended = () => {
        screenStreamRef.current = null;
        if (screenSenderRef.current && pcRef.current) {
          pcRef.current.removeTrack(screenSenderRef.current);
          screenSenderRef.current = null;
        }
        setState(s => ({ ...s, screenSharing: false }));
        sendWs({ type: "track-state", targetUserId: callTargetRef.current, fromUserId: myUserIdRef.current, track: "screen", enabled: false });
      };

      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = stream;
      }

      const sender = pc.addTrack(screenTrack, stream);
      screenSenderRef.current = sender;

      setState(s => ({ ...s, screenSharing: true, showScreenPicker: false }));
      sendWs({ type: "track-state", targetUserId: callTargetRef.current, fromUserId: myUserIdRef.current, track: "screen", enabled: true });
    } catch {
      setState(s => ({ ...s, showScreenPicker: false }));
    }
  }, [sendWs]);

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
      sendWs({ type: "track-state", targetUserId: callTargetRef.current, fromUserId: myUserIdRef.current, track: "screen", enabled: false });
    } else {
      const ea = (window as any).electronAPI;
      if (ea?.getDesktopSources) {
        setState(s => ({ ...s, showScreenPicker: true }));
      } else {
        startScreenStream();
      }
    }
  }, [sendWs, startScreenStream]);

  const connectWs = useCallback(() => {
    const uid = myUserIdRef.current;
    if (!uid || unmountedRef.current) return;
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    const wsUrl = `${protocol}//${window.location.host}${base}/ws/signaling`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setState(s => ({ ...s, connected: true }));
      ws.send(JSON.stringify({ type: "register", userId: uid, displayName: myDisplayNameRef.current }));
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
            sendWs({ type: "call-reject", callerId: msg.callerId, rejecterId: myUserIdRef.current });
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
          setState(s => ({ ...s, callError: "Call declined" }));
          setTimeout(() => setState(s => ({ ...s, callError: null })), 4000);
          break;

        case "call-unavailable":
          cleanupCall();
          setState(s => ({ ...s, callError: "User is offline" }));
          setTimeout(() => setState(s => ({ ...s, callError: null })), 4000);
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
                  fromUserId: myUserIdRef.current,
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
            if (!msg.enabled) {
              remoteScreenStreamRef.current = null;
            }
            setState(s => ({ ...s, remoteScreenSharing: msg.enabled }));
          }
          break;
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      setState(s => ({ ...s, connected: false }));
      if (!unmountedRef.current) {
        reconnectTimerRef.current = setTimeout(() => connectWs(), 3000);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [sendWs, cleanupCall]);

  useEffect(() => {
    unmountedRef.current = false;
    if (myUserId) connectWs();
    return () => {
      unmountedRef.current = true;
      stopAllSounds();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
      wsRef.current?.close();
      wsRef.current = null;
      cleanupCall(false);
    };
  }, [myUserId, connectWs, cleanupCall]);

  const dismissScreenPicker = useCallback(() => {
    setState(s => ({ ...s, showScreenPicker: false }));
  }, []);

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
    startScreenStream,
    dismissScreenPicker,
    localVideoRef,
    remoteVideoRef,
    screenVideoRef,
    localVideoStreamRef,
    screenStreamRef,
    remoteScreenStreamRef,
  };
}
