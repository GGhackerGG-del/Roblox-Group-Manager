import { createContext, useContext, type ReactNode } from "react";
import { usePresence, type OnlineUser, type UserPresenceStatus } from "@/hooks/usePresence";

interface PresenceContextValue {
  onlineUsers: OnlineUser[];
  totalOnline: number;
  isOnline: (userId: number) => boolean;
  getLastSeen: (userId: number) => string | null;
  fetchPresenceFor: (userIds: number[]) => Promise<void>;
  presenceMap: Record<number, UserPresenceStatus>;
}

const PresenceContext = createContext<PresenceContextValue | null>(null);

export function PresenceProvider({ children }: { children: ReactNode }) {
  const presence = usePresence();
  return (
    <PresenceContext.Provider value={presence}>
      {children}
    </PresenceContext.Provider>
  );
}

export function usePresenceContext(): PresenceContextValue {
  const ctx = useContext(PresenceContext);
  if (!ctx) {
    return {
      onlineUsers: [],
      totalOnline: 0,
      isOnline: () => false,
      getLastSeen: () => null,
      fetchPresenceFor: async () => {},
      presenceMap: {},
    };
  }
  return ctx;
}
