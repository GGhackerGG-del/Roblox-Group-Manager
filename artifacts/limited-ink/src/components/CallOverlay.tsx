import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Mic, MicOff, PhoneOff, Video, VideoOff,
  Monitor, MonitorOff, Volume2, VolumeX,
  Maximize2, Minimize2, ChevronDown, ChevronUp,
} from "lucide-react";

interface CallOverlayProps {
  callActive: boolean;
  callConnecting: boolean;
  callMuted: boolean;
  callDeafened: boolean;
  callTimer: number;
  videoEnabled: boolean;
  screenSharing: boolean;
  remoteVideoEnabled: boolean;
  remoteScreenSharing: boolean;
  remoteStreamActive: boolean;
  incomingCall: {
    callerId: number;
    callerName: string;
    callerAvatar: string;
  } | null;
  peerName: string;
  peerAvatar: string;
  myName: string;
  myAvatar: string;
  onAccept: () => void;
  onReject: () => void;
  onEndCall: () => void;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare: () => void;
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  remoteVideoRef: React.RefObject<HTMLVideoElement | null>;
  screenVideoRef: React.RefObject<HTMLVideoElement | null>;
  localScreenVideoRef: React.RefObject<HTMLVideoElement | null>;
  localScreenStream?: React.RefObject<MediaStream | null>;
  remoteScreenStream?: React.RefObject<MediaStream | null>;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function PulsingRing() {
  return (
    <div className="absolute inset-0 rounded-full">
      <div className="absolute inset-0 rounded-full border-2 border-green-400 animate-ping opacity-30" />
      <div className="absolute inset-[-4px] rounded-full border-2 border-green-400 animate-ping opacity-20" style={{ animationDelay: "0.3s" }} />
      <div className="absolute inset-[-8px] rounded-full border border-green-400 animate-ping opacity-10" style={{ animationDelay: "0.6s" }} />
    </div>
  );
}

function CtrlBtn({
  onClick,
  active,
  danger,
  icon: Icon,
  tooltip,
}: {
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  icon: typeof Mic;
  tooltip: string;
}) {
  return (
    <button
      onClick={onClick}
      title={tooltip}
      className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-150 ${
        danger
          ? "bg-red-500 hover:bg-red-600"
          : active
            ? "bg-[#3b3d44] hover:bg-[#43464e]"
            : "bg-[#2b2d31] hover:bg-[#3b3d44]"
      }`}
    >
      <Icon className={`w-[18px] h-[18px] ${danger ? "text-white" : active ? "text-white" : "text-[#b5bac1]"}`} />
    </button>
  );
}

export default function CallOverlay(props: CallOverlayProps) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const fullscreenRef = useRef<HTMLDivElement>(null);
  const prevScreenSharing = useRef(false);

  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) setFullscreen(false);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!fullscreen) {
      setExpanded(true);
      setFullscreen(true);
      setTimeout(() => {
        fullscreenRef.current?.requestFullscreen?.().catch(() => {});
      }, 50);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setFullscreen(false);
    }
  };

  useEffect(() => {
    if (props.remoteScreenSharing && !prevScreenSharing.current) {
      setExpanded(true);
    }
    prevScreenSharing.current = props.remoteScreenSharing;
  }, [props.remoteScreenSharing]);

  const prevLocalScreenSharing = useRef(false);
  useEffect(() => {
    if (props.screenSharing && !prevLocalScreenSharing.current) {
      setExpanded(true);
    }
    prevLocalScreenSharing.current = props.screenSharing;
  }, [props.screenSharing]);

  useEffect(() => {
    if (expanded && props.remoteScreenSharing && props.screenVideoRef.current && props.remoteScreenStream?.current) {
      props.screenVideoRef.current.srcObject = props.remoteScreenStream.current;
      props.screenVideoRef.current.play().catch(() => {});
    }
  }, [expanded, props.remoteScreenSharing]);

  useEffect(() => {
    if (expanded && props.screenSharing && props.localScreenVideoRef.current && props.localScreenStream?.current) {
      props.localScreenVideoRef.current.srcObject = props.localScreenStream.current;
      props.localScreenVideoRef.current.play().catch(() => {});
    }
  }, [expanded, props.screenSharing]);

  const showCallPanel = props.callActive || props.callConnecting;
  const showIncoming = !!props.incomingCall && !props.callActive && !props.callConnecting;
  const hasVideo = props.videoEnabled || props.remoteVideoEnabled || props.remoteScreenSharing || props.screenSharing;

  return (
    <>
      <AnimatePresence>
        {showIncoming && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: -30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -30 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          >
            <div className="w-[340px] bg-[#1e1f22] rounded-2xl shadow-2xl overflow-hidden border border-white/5">
              <div className="bg-gradient-to-b from-[#5865f2]/30 to-transparent p-8 flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="w-24 h-24 rounded-full overflow-hidden border-3 border-green-400/50 shadow-xl shadow-green-400/20">
                    <img src={props.incomingCall!.callerAvatar} alt="" className="w-full h-full object-cover" />
                  </div>
                  <PulsingRing />
                </div>
                <div className="text-center">
                  <p className="font-bold text-lg text-white">{props.incomingCall!.callerName}</p>
                  <p className="text-sm text-white/50 mt-1 flex items-center gap-1.5 justify-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    {t("com.incomingCall")}
                  </p>
                </div>
              </div>
              <div className="p-6 flex justify-center gap-8">
                <div className="flex flex-col items-center gap-2">
                  <button
                    onClick={props.onReject}
                    className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-all duration-200 shadow-lg shadow-red-500/30 hover:scale-105"
                  >
                    <PhoneOff className="w-6 h-6 text-white" />
                  </button>
                  <span className="text-xs text-white/40">{t("com.endCall")}</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <button
                    onClick={props.onAccept}
                    className="w-14 h-14 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center transition-all duration-200 shadow-lg shadow-green-500/30 animate-pulse hover:scale-105"
                  >
                    <PhoneOff className="w-6 h-6 text-white rotate-[135deg]" />
                  </button>
                  <span className="text-xs text-white/40">{t("com.voiceCall")}</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCallPanel && (
          <>
            {expanded && (hasVideo) && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="fixed inset-0 z-[9997] bg-black/80 backdrop-blur-sm"
                onClick={() => setExpanded(false)}
              />
            )}

            {expanded && (hasVideo) && (
              <motion.div
                ref={fullscreenRef}
                initial={{ opacity: 0, y: 40, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 40, scale: 0.95 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className={
                  fullscreen
                    ? "fixed inset-0 z-[9998] bg-black flex flex-col"
                    : "fixed bottom-[72px] left-1/2 -translate-x-1/2 z-[9998] w-[700px] max-w-[90vw] bg-[#1e1f22] rounded-xl border border-white/10 shadow-2xl overflow-hidden"
                }
              >
                <div className={`relative w-full bg-black ${fullscreen ? "flex-1" : "aspect-video"}`}>
                  {props.remoteScreenSharing && (
                    <video
                      ref={props.screenVideoRef}
                      autoPlay
                      playsInline
                      className="w-full h-full object-contain"
                    />
                  )}

                  {!props.remoteScreenSharing && props.screenSharing && (
                    <video
                      ref={props.localScreenVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-contain"
                    />
                  )}

                  {!props.remoteScreenSharing && !props.screenSharing && props.remoteVideoEnabled && (
                    <video
                      ref={props.remoteVideoRef}
                      autoPlay
                      playsInline
                      className="w-full h-full object-cover"
                    />
                  )}

                  {!props.remoteScreenSharing && !props.screenSharing && !props.remoteVideoEnabled && (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className={`rounded-full overflow-hidden border-2 border-[#5865f2]/40 ${fullscreen ? "w-32 h-32" : "w-20 h-20"}`}>
                          <img src={props.peerAvatar} alt="" className="w-full h-full object-cover" />
                        </div>
                        <p className={`text-white/70 font-medium ${fullscreen ? "text-lg" : "text-sm"}`}>{props.peerName}</p>
                        {fullscreen && (
                          <span className="text-white/40 text-sm">{props.callConnecting ? t("com.calling") : formatTime(props.callTimer)}</span>
                        )}
                      </div>
                    </div>
                  )}

                  {props.videoEnabled && (
                    <div className={`absolute bottom-3 right-3 rounded-lg overflow-hidden bg-black border border-white/20 shadow-lg ${fullscreen ? "w-[240px] h-[180px]" : "w-[160px] h-[120px]"}`}>
                      <video
                        ref={props.localVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                        style={{ transform: "scaleX(-1)" }}
                      />
                      <div className="absolute bottom-1.5 left-1.5 bg-black/60 backdrop-blur-sm rounded px-1.5 py-0.5">
                        <span className="text-[9px] text-white/70">{props.myName}</span>
                      </div>
                    </div>
                  )}

                  {props.remoteScreenSharing && props.remoteVideoEnabled && (
                    <div className={`absolute top-3 right-3 rounded-lg overflow-hidden bg-black border border-white/20 shadow-lg ${fullscreen ? "w-[240px] h-[180px]" : "w-[160px] h-[120px]"}`}>
                      <video
                        ref={props.remoteVideoRef}
                        autoPlay
                        playsInline
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute bottom-1.5 left-1.5 bg-black/60 backdrop-blur-sm rounded px-1.5 py-0.5">
                        <span className="text-[9px] text-white/70">{props.peerName}</span>
                      </div>
                    </div>
                  )}

                  {props.screenSharing && (
                    <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                      <Monitor className="w-3.5 h-3.5 text-green-400" />
                      <span className="text-[11px] text-white/80 font-medium">{t("com.screenSharing")}</span>
                    </div>
                  )}

                  {!fullscreen && (
                    <button
                      onClick={toggleFullscreen}
                      className={`absolute top-3 bg-black/60 hover:bg-black/80 text-white rounded-lg p-2 transition-colors z-10 ${props.screenSharing || props.remoteScreenSharing ? "right-3" : "right-3"}`}
                      title={t("com.fullscreen")}
                    >
                      <Maximize2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {fullscreen && (
                  <div className="flex items-center justify-center gap-3 py-4 bg-[#232428]">
                    <CtrlBtn onClick={props.onToggleMute} active={!props.callMuted} icon={props.callMuted ? MicOff : Mic} tooltip={props.callMuted ? t("com.unmute") : t("com.mute")} />
                    <CtrlBtn onClick={props.onToggleDeafen} active={!props.callDeafened} icon={props.callDeafened ? VolumeX : Volume2} tooltip={props.callDeafened ? t("com.undeafen") : t("com.deafen")} />
                    <CtrlBtn onClick={props.onToggleVideo} active={props.videoEnabled} icon={props.videoEnabled ? Video : VideoOff} tooltip={props.videoEnabled ? t("com.videoOff") : t("com.videoOn")} />
                    <CtrlBtn onClick={props.onToggleScreenShare} active={props.screenSharing} icon={props.screenSharing ? MonitorOff : Monitor} tooltip={props.screenSharing ? t("com.stopShare") : t("com.shareScreen")} />
                    <CtrlBtn onClick={toggleFullscreen} active={false} icon={Minimize2} tooltip={t("com.exitFullscreen")} />
                    <div className="w-px h-8 bg-white/[0.06] mx-1" />
                    <button onClick={props.onEndCall} className="h-9 px-5 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors">
                      <PhoneOff className="w-[18px] h-[18px] text-white" />
                    </button>
                  </div>
                )}
              </motion.div>
            )}

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 30 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9998]"
            >
              <div className="bg-[#232428] rounded-2xl shadow-2xl border border-white/[0.06] overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex items-center gap-2.5 mr-1">
                    <div className="relative">
                      <div className="w-8 h-8 rounded-full overflow-hidden border border-white/10">
                        <img src={props.peerAvatar} alt="" className="w-full h-full object-cover" />
                      </div>
                      {props.callActive && props.remoteStreamActive && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-[#232428]" />
                      )}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[13px] font-medium text-white truncate max-w-[120px]">{props.peerName}</span>
                      <span className="text-[11px] text-white/40">
                        {props.callConnecting ? t("com.calling") : formatTime(props.callTimer)}
                      </span>
                    </div>
                  </div>

                  <div className="w-px h-8 bg-white/[0.06]" />

                  <div className="flex items-center gap-1.5">
                    <CtrlBtn
                      onClick={props.onToggleMute}
                      active={!props.callMuted}
                      icon={props.callMuted ? MicOff : Mic}
                      tooltip={props.callMuted ? t("com.unmute") : t("com.mute")}
                    />
                    <CtrlBtn
                      onClick={props.onToggleDeafen}
                      active={!props.callDeafened}
                      icon={props.callDeafened ? VolumeX : Volume2}
                      tooltip={props.callDeafened ? t("com.undeafen") : t("com.deafen")}
                    />
                    <CtrlBtn
                      onClick={props.onToggleVideo}
                      active={props.videoEnabled}
                      icon={props.videoEnabled ? Video : VideoOff}
                      tooltip={props.videoEnabled ? t("com.videoOff") : t("com.videoOn")}
                    />
                    <CtrlBtn
                      onClick={props.onToggleScreenShare}
                      active={props.screenSharing}
                      icon={props.screenSharing ? MonitorOff : Monitor}
                      tooltip={props.screenSharing ? t("com.stopShare") : t("com.shareScreen")}
                    />

                    {hasVideo && (
                      <CtrlBtn
                        onClick={() => setExpanded(e => !e)}
                        active={expanded}
                        icon={expanded ? Minimize2 : Maximize2}
                        tooltip={expanded ? t("com.exitFullscreen") : t("com.fullscreen")}
                      />
                    )}
                  </div>

                  <div className="w-px h-8 bg-white/[0.06]" />

                  <button
                    onClick={props.onEndCall}
                    className="h-8 px-4 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors"
                  >
                    <PhoneOff className="w-[18px] h-[18px] text-white" />
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
