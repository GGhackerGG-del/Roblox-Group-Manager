import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer } from "http";

interface ConnectedSocket {
  ws: WebSocket;
  userId: number;
  displayName: string;
  avatarUrl?: string;
}

const sockets = new Set<ConnectedSocket>();

function userSockets(userId: number): ConnectedSocket[] {
  return [...sockets].filter(s => s.userId === userId);
}

function uniqueOnlineUserIds(): Set<number> {
  const ids = new Set<number>();
  for (const s of sockets) ids.add(s.userId);
  return ids;
}

export function getOnlineUsers(): { userId: number; displayName: string; avatarUrl?: string }[] {
  const seen = new Map<number, { userId: number; displayName: string; avatarUrl?: string }>();
  for (const s of sockets) {
    if (!seen.has(s.userId)) {
      seen.set(s.userId, { userId: s.userId, displayName: s.displayName, avatarUrl: s.avatarUrl });
    }
  }
  return [...seen.values()];
}

function broadcastPresence(type: "user-online" | "user-offline", userId: number, displayName: string, avatarUrl?: string) {
  const payload = JSON.stringify({ type, userId, displayName, avatarUrl });
  for (const s of sockets) {
    if (s.ws.readyState === WebSocket.OPEN) {
      s.ws.send(payload);
    }
  }
}

function sendToUser(userId: number, payload: string): boolean {
  let sent = false;
  for (const s of sockets) {
    if (s.userId === userId && s.ws.readyState === WebSocket.OPEN) {
      s.ws.send(payload);
      sent = true;
    }
  }
  return sent;
}

export function setupSignaling(server: HttpServer) {
  const wss = new WebSocketServer({ server, path: "/ws/signaling" });

  wss.on("connection", (ws) => {
    let currentEntry: ConnectedSocket | null = null;

    ws.on("message", (raw) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      switch (msg.type) {
        case "register": {
          const displayName = msg.displayName || "User";
          const avatarUrl = msg.avatarUrl || undefined;
          if (currentEntry) {
            sockets.delete(currentEntry);
          }
          currentEntry = { ws, userId: msg.userId, displayName, avatarUrl };
          const wasOnline = userSockets(msg.userId).length > 0;
          sockets.add(currentEntry);
          console.log(`[Signaling] User ${msg.userId} (${displayName}) connected. Online: ${uniqueOnlineUserIds().size}`);
          if (!wasOnline) {
            broadcastPresence("user-online", msg.userId, displayName, avatarUrl);
          }
          break;
        }

        case "get-online-users": {
          const list = getOnlineUsers();
          ws.send(JSON.stringify({ type: "online-users", users: list }));
          break;
        }

        case "call-offer": {
          if (!currentEntry) break;
          const payload = JSON.stringify({
            type: "incoming-call",
            callerId: currentEntry.userId,
            callerName: currentEntry.displayName,
            callerAvatar: msg.callerAvatar,
            offer: msg.offer,
          });
          const sent = sendToUser(msg.targetUserId, payload);
          if (!sent) {
            ws.send(JSON.stringify({ type: "call-unavailable", targetUserId: msg.targetUserId }));
          }
          break;
        }

        case "call-answer": {
          if (!currentEntry) break;
          sendToUser(msg.callerId, JSON.stringify({
            type: "call-accepted",
            answererId: currentEntry.userId,
            answer: msg.answer,
          }));
          break;
        }

        case "call-reject": {
          if (!currentEntry) break;
          sendToUser(msg.callerId, JSON.stringify({
            type: "call-rejected",
            rejecterId: currentEntry.userId,
          }));
          break;
        }

        case "call-end": {
          if (!currentEntry) break;
          sendToUser(msg.targetUserId, JSON.stringify({
            type: "call-ended",
            userId: currentEntry.userId,
          }));
          break;
        }

        case "ice-candidate": {
          if (!currentEntry) break;
          sendToUser(msg.targetUserId, JSON.stringify({
            type: "ice-candidate",
            candidate: msg.candidate,
            fromUserId: currentEntry.userId,
          }));
          break;
        }

        case "renegotiate-offer": {
          if (!currentEntry) break;
          sendToUser(msg.targetUserId, JSON.stringify({
            type: "renegotiate-offer",
            offer: msg.offer,
            fromUserId: currentEntry.userId,
          }));
          break;
        }

        case "renegotiate-answer": {
          if (!currentEntry) break;
          sendToUser(msg.targetUserId, JSON.stringify({
            type: "renegotiate-answer",
            answer: msg.answer,
            fromUserId: currentEntry.userId,
          }));
          break;
        }

        case "track-state": {
          if (!currentEntry) break;
          sendToUser(msg.targetUserId, JSON.stringify({
            type: "track-state",
            track: msg.track,
            enabled: msg.enabled,
            fromUserId: currentEntry.userId,
          }));
          break;
        }

        default:
          break;
      }
    });

    const removeSocket = () => {
      if (currentEntry) {
        const { userId, displayName, avatarUrl } = currentEntry;
        sockets.delete(currentEntry);
        currentEntry = null;
        const stillOnline = userSockets(userId).length > 0;
        if (!stillOnline) {
          console.log(`[Signaling] User ${userId} disconnected. Online: ${uniqueOnlineUserIds().size}`);
          broadcastPresence("user-offline", userId, displayName, avatarUrl);
        }
      }
    };

    ws.on("close", removeSocket);
    ws.on("error", removeSocket);
  });

  console.log("[Signaling] WebSocket signaling server ready on /ws/signaling");
}
