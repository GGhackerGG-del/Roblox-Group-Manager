import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Mic, MicOff, PhoneOff, Volume2, VolumeX,
  Maximize2, Minimize2, ChevronDown, Users,
  Monitor, MonitorOff, Phone, X,
} from "lucide-react";
import type { GroupCallRing } from "@/hooks/useGroupCall";

interface GroupCallPeerDisplay {
  userId: number;
  displayName: string;
  avatarUrl: string;
  screenStream: MediaStream | null;
  screenSharing: boolean;
}

interface GroupCallOverlayProps {
  active: boolean;
  groupChatId: number | null;
  groupName: string;
  muted: boolean;
  deafened: boolean;
  screenSharing: boolean;
  timer: number;
  peers: Map<number, GroupCallPeerDisplay>;
  myName: string;
  myAvatar: string;
  localScreenVideoRef: React.RefObject<HTMLVideoElement | null>;
  incomingRing: GroupCallRing | null;
  onLeave: () => void;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onToggleScreenShare: () => void;
  onAcceptRing: (groupChatId: number) => void;
  onDismissRing: () => void;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
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

function PeerScreenVideo({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && stream) {
      ref.current.srcObject = stream;
    }
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      className="w-full h-full object-contain bg-black rounded-lg"
    />
  );
}

function IncomingGroupCallRing({
  ring,
  groupName,
  onAccept,
  onDismiss,
}: {
  ring: GroupCallRing;
  groupName: string;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
      className="fixed top-4 right-4 z-[10000] w-[320px] bg-[#1e1f22] rounded-xl border border-white/10 shadow-2xl overflow-hidden"
    >
      <div className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
            <Users className="w-5 h-5 text-green-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-white truncate">Group Call</div>
            <div className="text-xs text-white/50 truncate">
              {ring.callerName} started a call{ring.participants > 1 ? ` · ${ring.participants} in call` : ""}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onDismiss}
            className="flex-1 h-9 rounded-lg bg-[#2b2d31] hover:bg-[#3b3d44] flex items-center justify-center gap-2 transition-colors"
          >
            <X className="w-4 h-4 text-white/60" />
            <span className="text-sm text-white/60">Dismiss</span>
          </button>
          <button
            onClick={onAccept}
            className="flex-1 h-9 rounded-lg bg-green-500 hover:bg-green-600 flex items-center justify-center gap-2 transition-colors"
          >
            <Phone className="w-4 h-4 text-white" />
            <span className="text-sm text-white font-medium">Join</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export default function GroupCallOverlay(props: GroupCallOverlayProps) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);

  const peerList = [...props.peers.values()];
  const participantCount = peerList.length + 1;
  const screenSharingPeer = peerList.find(p => p.screenSharing && p.screenStream);

  useEffect(() => {
    if (props.screenSharing || screenSharingPeer) {
      setExpanded(true);
    }
  }, [props.screenSharing, screenSharingPeer]);

  return (
    <>
      <AnimatePresence>
        {props.incomingRing && !props.active && (
          <IncomingGroupCallRing
            ring={props.incomingRing}
            groupName={props.groupName}
            onAccept={() => props.onAcceptRing(props.incomingRing!.groupChatId)}
            onDismiss={props.onDismissRing}
          />
        )}
      </AnimatePresence>

      {!props.active && null}
      {props.active && (
        <>
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[9997] bg-black/80 backdrop-blur-sm"
                onClick={() => setExpanded(false)}
              />
            )}
          </AnimatePresence>

          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ opacity: 0, y: 40, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 40, scale: 0.95 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="fixed bottom-[72px] left-1/2 -translate-x-1/2 z-[9998] w-[600px] max-w-[90vw] bg-[#1e1f22] rounded-xl border border-white/10 shadow-2xl overflow-hidden"
              >
                <div className="p-4 border-b border-white/5 flex items-center gap-2">
                  <Users className="w-4 h-4 text-green-400" />
                  <span className="text-sm font-medium text-white">{props.groupName}</span>
                  <span className="text-xs text-white/40 ml-auto">{formatTime(props.timer)}</span>
                </div>

                {(props.screenSharing || screenSharingPeer) && (
                  <div className="p-3 border-b border-white/5">
                    <div className="text-[11px] text-white/50 mb-2 flex items-center gap-1.5">
                      <Monitor className="w-3.5 h-3.5" />
                      {props.screenSharing
                        ? "You are sharing your screen"
                        : `${screenSharingPeer?.displayName || "Someone"} is sharing their screen`}
                    </div>
                    <div className="w-full aspect-video bg-black rounded-lg overflow-hidden">
                      {props.screenSharing ? (
                        <video
                          ref={props.localScreenVideoRef as any}
                          autoPlay
                          playsInline
                          muted
                          className="w-full h-full object-contain"
                        />
                      ) : screenSharingPeer?.screenStream ? (
                        <PeerScreenVideo stream={screenSharingPeer.screenStream} />
                      ) : null}
                    </div>
                  </div>
                )}

                <div className={`p-4 grid gap-3 ${participantCount <= 4 ? "grid-cols-2" : "grid-cols-3"}`}>
                  <div className="flex flex-col items-center gap-2 p-3 rounded-xl bg-[#2b2d31]">
                    <div className="relative">
                      <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-green-400/50">
                        <img src={props.myAvatar} alt="" className="w-full h-full object-cover" />
                      </div>
                      {props.muted && (
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center border-2 border-[#2b2d31]">
                          <MicOff className="w-2.5 h-2.5 text-white" />
                        </div>
                      )}
                    </div>
                    <span className="text-[11px] text-white/70 truncate max-w-full">{props.myName}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] text-green-400">{t("com.you")}</span>
                      {props.screenSharing && <Monitor className="w-3 h-3 text-blue-400" />}
                    </div>
                  </div>

                  {peerList.map(peer => (
                    <div key={peer.userId} className="flex flex-col items-center gap-2 p-3 rounded-xl bg-[#2b2d31]">
                      <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-[#5865f2]/40">
                        {peer.avatarUrl ? (
                          <img src={peer.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-[#5865f2] flex items-center justify-center text-white font-bold text-lg">
                            {(peer.displayName || "?").charAt(0)}
                          </div>
                        )}
                      </div>
                      <span className="text-[11px] text-white/70 truncate max-w-full">{peer.displayName || `User ${peer.userId}`}</span>
                      {peer.screenSharing && (
                        <div className="flex items-center gap-1">
                          <Monitor className="w-3 h-3 text-blue-400" />
                          <span className="text-[9px] text-blue-400">Sharing</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

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
                    <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                      <Users className="w-4 h-4 text-green-400" />
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-[#232428]" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[13px] font-medium text-white truncate max-w-[120px]">{props.groupName}</span>
                    <span className="text-[11px] text-white/40">
                      {participantCount} {t("com.inCall")} · {formatTime(props.timer)}
                    </span>
                  </div>
                </div>

                <div className="w-px h-8 bg-white/[0.06]" />

                <div className="flex items-center gap-1.5">
                  <CtrlBtn
                    onClick={props.onToggleMute}
                    active={!props.muted}
                    icon={props.muted ? MicOff : Mic}
                    tooltip={props.muted ? t("com.unmute") : t("com.mute")}
                  />
                  <CtrlBtn
                    onClick={props.onToggleDeafen}
                    active={!props.deafened}
                    icon={props.deafened ? VolumeX : Volume2}
                    tooltip={props.deafened ? t("com.undeafen") : t("com.deafen")}
                  />
                  <CtrlBtn
                    onClick={props.onToggleScreenShare}
                    active={props.screenSharing}
                    icon={props.screenSharing ? MonitorOff : Monitor}
                    tooltip={props.screenSharing ? "Stop sharing" : "Share screen"}
                  />
                  <CtrlBtn
                    onClick={() => setExpanded(e => !e)}
                    active={expanded}
                    icon={expanded ? Minimize2 : Maximize2}
                    tooltip={expanded ? t("com.exitFullscreen") : t("com.fullscreen")}
                  />
                </div>

                <div className="w-px h-8 bg-white/[0.06]" />

                <button
                  onClick={props.onLeave}
                  className="h-8 px-4 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors"
                >
                  <PhoneOff className="w-[18px] h-[18px] text-white" />
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </>
  );
}
