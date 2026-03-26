import { motion, AnimatePresence } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Mic, MicOff, PhoneOff, Video, VideoOff,
  Monitor, MonitorOff, Volume2, VolumeX,
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

function ControlButton({
  onClick,
  active,
  danger,
  icon: Icon,
  label,
}: {
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  icon: typeof Mic;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        onClick={onClick}
        className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 ${
          danger
            ? "bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/30"
            : active
              ? "bg-white/20 hover:bg-white/30 backdrop-blur-sm"
              : "bg-[#36393f] hover:bg-[#40444b]"
        }`}
      >
        <Icon className="w-5 h-5 text-white" />
      </button>
      <span className="text-[10px] text-white/50 font-medium">{label}</span>
    </div>
  );
}

export default function CallOverlay(props: CallOverlayProps) {
  const { t } = useLanguage();

  const showCallPanel = props.callActive || props.callConnecting;
  const showIncoming = !!props.incomingCall && !props.callActive && !props.callConnecting;

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
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-[9998] bg-[#1a1b1e] flex flex-col"
          >
            <div className="flex-1 flex items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-[#5865f2]/5 via-transparent to-[#57f287]/5" />

              {props.remoteScreenSharing && (
                <div className="absolute inset-4 rounded-xl overflow-hidden bg-black/50 border border-white/10">
                  <video
                    ref={props.screenVideoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm rounded-lg px-3 py-1.5 flex items-center gap-2">
                    <Monitor className="w-3.5 h-3.5 text-green-400" />
                    <span className="text-xs text-white/80 font-medium">{props.peerName}</span>
                  </div>
                </div>
              )}

              {!props.remoteScreenSharing && (
                <div className="flex flex-col items-center gap-6 relative z-10">
                  {props.remoteVideoEnabled ? (
                    <div className="w-[480px] h-[360px] rounded-2xl overflow-hidden bg-black border border-white/10 shadow-2xl">
                      <video
                        ref={props.remoteVideoRef}
                        autoPlay
                        playsInline
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-4">
                      <div className={`relative ${props.callConnecting ? "animate-bounce" : ""}`}>
                        <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-[#5865f2]/30 shadow-2xl shadow-[#5865f2]/20">
                          <img src={props.peerAvatar} alt="" className="w-full h-full object-cover" />
                        </div>
                        {props.callConnecting && <PulsingRing />}
                        {props.callActive && props.remoteStreamActive && (
                          <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-green-500 border-4 border-[#1a1b1e] flex items-center justify-center">
                            <Volume2 className="w-3.5 h-3.5 text-white" />
                          </div>
                        )}
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-xl text-white">{props.peerName}</p>
                        <p className="text-sm text-white/40 mt-1">
                          {props.callConnecting
                            ? t("com.calling")
                            : formatTime(props.callTimer)
                          }
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {props.videoEnabled && (
                <div className="absolute bottom-24 right-6 w-[200px] h-[150px] rounded-xl overflow-hidden bg-black border border-white/20 shadow-xl z-20 group">
                  <video
                    ref={props.localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover mirror"
                    style={{ transform: "scaleX(-1)" }}
                  />
                  <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm rounded-md px-2 py-0.5">
                    <span className="text-[10px] text-white/70 font-medium">{props.myName}</span>
                  </div>
                </div>
              )}

              {props.remoteScreenSharing && props.remoteVideoEnabled && (
                <div className="absolute top-6 right-6 w-[200px] h-[150px] rounded-xl overflow-hidden bg-black border border-white/20 shadow-xl z-20">
                  <video
                    ref={props.remoteVideoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm rounded-md px-2 py-0.5">
                    <span className="text-[10px] text-white/70 font-medium">{props.peerName}</span>
                  </div>
                </div>
              )}

              {props.screenSharing && !props.remoteScreenSharing && (
                <div className="absolute top-6 left-6 bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2 flex items-center gap-2 z-20">
                  <Monitor className="w-4 h-4 text-green-400" />
                  <span className="text-xs text-white/80 font-medium">{t("com.screenSharing")}</span>
                </div>
              )}
            </div>

            <div className="bg-[#292b2f] border-t border-white/5 px-6 py-4">
              <div className="flex items-center justify-center gap-4">
                <ControlButton
                  onClick={props.onToggleMute}
                  active={!props.callMuted}
                  icon={props.callMuted ? MicOff : Mic}
                  label={props.callMuted ? t("com.unmute") : t("com.mute")}
                />
                <ControlButton
                  onClick={props.onToggleDeafen}
                  active={!props.callDeafened}
                  icon={props.callDeafened ? VolumeX : Volume2}
                  label={props.callDeafened ? t("com.undeafen") : t("com.deafen")}
                />
                <ControlButton
                  onClick={props.onToggleVideo}
                  active={props.videoEnabled}
                  icon={props.videoEnabled ? Video : VideoOff}
                  label={props.videoEnabled ? t("com.videoOff") : t("com.videoOn")}
                />
                <ControlButton
                  onClick={props.onToggleScreenShare}
                  active={props.screenSharing}
                  icon={props.screenSharing ? MonitorOff : Monitor}
                  label={props.screenSharing ? t("com.stopShare") : t("com.shareScreen")}
                />
                <ControlButton
                  onClick={props.onEndCall}
                  danger
                  icon={PhoneOff}
                  label={t("com.endCall")}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
