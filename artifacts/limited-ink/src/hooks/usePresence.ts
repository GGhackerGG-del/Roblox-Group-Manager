import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { robloxHeadshot } from "@/lib/roblox";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface OnlineUser {
  userId: number;
  displayName: string;
  avatarUrl?: string;
}

export function usePresence() {
  const { profile } = useAuth();
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);
  const wsConnectedRef = useRef(false);
  const profileIdRef = useRef<number | undefined>();

  const connect = useCallback(() => {
    const pid = profileIdRef.current;
    if (!pid) return;
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}${BASE}/ws/signaling`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current || profileIdRef.current !== pid) {
        ws.close();
        return;
      }
      ws.send(JSON.stringify({
        type: "register",
        userId: pid,
        displayName: profile?.displayName || profile?.name || "User",
        avatarUrl: robloxHeadshot(pid),
      }));
      ws.send(JSON.stringify({ type: "get-online-users" }));
      wsConnectedRef.current = true;
    };

    ws.onmessage = (e) => {
      if (!mountedRef.current) return;
      let msg: any;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }

      switch (msg.type) {
        case "online-users":
          setOnlineUsers(msg.users || []);
          break;
        case "user-online":
          setOnlineUsers(prev => {
            if (prev.some(u => u.userId === msg.userId)) return prev;
            return [...prev, { userId: msg.userId, displayName: msg.displayName, avatarUrl: msg.avatarUrl }];
          });
          break;
        case "user-offline":
          setOnlineUsers(prev => prev.filter(u => u.userId !== msg.userId));
          break;
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      wsConnectedRef.current = false;
      if (mountedRef.current && profileIdRef.current === pid) {
        reconnectTimer.current = setTimeout(connect, 5000);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [profile?.displayName, profile?.name]);

  useEffect(() => {
    mountedRef.current = true;
    profileIdRef.current = profile?.id;
    wsConnectedRef.current = false;

    if (!profile?.id) {
      setOnlineUsers([]);
      return;
    }

    connect();

    return () => {
      mountedRef.current = false;
      profileIdRef.current = undefined;
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      wsConnectedRef.current = false;
    };
  }, [profile?.id, connect]);

  const otherUsers = onlineUsers.filter(u => u.userId !== profile?.id);

  return { onlineUsers: otherUsers, totalOnline: onlineUsers.length };
}
