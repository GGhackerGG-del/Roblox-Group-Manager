import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useVoiceCall } from "@/hooks/useVoiceCall";
import { useAuth } from "@/contexts/AuthContext";
import { robloxHeadshot } from "@/lib/roblox";
import CallOverlay from "@/components/CallOverlay";
import ScreenPicker from "@/components/ScreenPicker";

type VoiceCallReturn = ReturnType<typeof useVoiceCall>;

const VoiceCallContext = createContext<VoiceCallReturn | null>(null);

export function useVoiceCallContext(): VoiceCallReturn {
  const ctx = useContext(VoiceCallContext);
  if (!ctx) throw new Error("useVoiceCallContext must be used within VoiceCallProvider");
  return ctx;
}

export function VoiceCallProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  const robloxUserId = profile?.id ?? null;

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName || profile.name || "User");
    setAvatarUrl(robloxHeadshot(profile.id));
  }, [profile]);

  const voiceCall = useVoiceCall(robloxUserId, displayName, avatarUrl);

  return (
    <VoiceCallContext.Provider value={voiceCall}>
      {children}
      <CallOverlay
        callActive={voiceCall.callActive}
        callConnecting={voiceCall.callConnecting}
        callMuted={voiceCall.callMuted}
        callDeafened={voiceCall.callDeafened}
        callTimer={voiceCall.callTimer}
        videoEnabled={voiceCall.videoEnabled}
        screenSharing={voiceCall.screenSharing}
        remoteVideoEnabled={voiceCall.remoteVideoEnabled}
        remoteScreenSharing={voiceCall.remoteScreenSharing}
        remoteStreamActive={voiceCall.remoteStreamActive}
        incomingCall={voiceCall.incomingCall}
        peerName={voiceCall.callPeer?.name || ""}
        peerAvatar={voiceCall.callPeer?.avatar || ""}
        myName={displayName}
        myAvatar={avatarUrl}
        onAccept={voiceCall.acceptCall}
        onReject={voiceCall.rejectCall}
        onEndCall={() => voiceCall.endCall()}
        onToggleMute={voiceCall.toggleMute}
        onToggleDeafen={voiceCall.toggleDeafen}
        onToggleVideo={voiceCall.toggleVideo}
        onToggleScreenShare={voiceCall.toggleScreenShare}
        localVideoRef={voiceCall.localVideoRef}
        remoteVideoRef={voiceCall.remoteVideoRef}
        screenVideoRef={voiceCall.screenVideoRef}
        localScreenVideoRef={voiceCall.localScreenVideoRef}
        localScreenStream={voiceCall.screenStreamRef}
        remoteScreenStream={voiceCall.remoteScreenStreamRef}
      />
      <ScreenPicker
        open={voiceCall.showScreenPicker}
        onSelect={(sourceId) => voiceCall.startScreenStream(sourceId)}
        onClose={voiceCall.dismissScreenPicker}
      />
      {voiceCall.callError && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] bg-destructive/90 text-destructive-foreground px-5 py-3 rounded-xl shadow-2xl text-sm font-medium animate-in fade-in slide-in-from-top-2 duration-300 flex items-center gap-2">
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {voiceCall.callError}
        </div>
      )}
    </VoiceCallContext.Provider>
  );
}
