import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer } from "http";

interface ConnectedUser {
  ws: WebSocket;
  userId: number;
  displayName: string;
}

const users = new Map<number, ConnectedUser>();

export function setupSignaling(server: HttpServer) {
  const wss = new WebSocketServer({ server, path: "/ws/signaling" });

  wss.on("connection", (ws) => {
    let currentUserId: number | null = null;

    ws.on("message", (raw) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      switch (msg.type) {
        case "register": {
          currentUserId = msg.userId;
          users.set(msg.userId, { ws, userId: msg.userId, displayName: msg.displayName || "User" });
          console.log(`[Signaling] User ${msg.userId} (${msg.displayName}) connected. Online: ${users.size}`);
          break;
        }

        case "call-offer": {
          const target = users.get(msg.targetUserId);
          if (target && target.ws.readyState === WebSocket.OPEN) {
            target.ws.send(JSON.stringify({
              type: "incoming-call",
              callerId: msg.callerId,
              callerName: msg.callerName,
              callerAvatar: msg.callerAvatar,
              offer: msg.offer,
            }));
          } else {
            ws.send(JSON.stringify({ type: "call-unavailable", targetUserId: msg.targetUserId }));
          }
          break;
        }

        case "call-answer": {
          const caller = users.get(msg.callerId);
          if (caller && caller.ws.readyState === WebSocket.OPEN) {
            caller.ws.send(JSON.stringify({
              type: "call-accepted",
              answererId: msg.answererId,
              answer: msg.answer,
            }));
          }
          break;
        }

        case "call-reject": {
          const caller = users.get(msg.callerId);
          if (caller && caller.ws.readyState === WebSocket.OPEN) {
            caller.ws.send(JSON.stringify({
              type: "call-rejected",
              rejecterId: msg.rejecterId,
            }));
          }
          break;
        }

        case "call-end": {
          const peer = users.get(msg.targetUserId);
          if (peer && peer.ws.readyState === WebSocket.OPEN) {
            peer.ws.send(JSON.stringify({
              type: "call-ended",
              userId: msg.userId,
            }));
          }
          break;
        }

        case "ice-candidate": {
          const peer = users.get(msg.targetUserId);
          if (peer && peer.ws.readyState === WebSocket.OPEN) {
            peer.ws.send(JSON.stringify({
              type: "ice-candidate",
              candidate: msg.candidate,
              fromUserId: msg.fromUserId,
            }));
          }
          break;
        }

        default:
          break;
      }
    });

    ws.on("close", () => {
      if (currentUserId !== null) {
        const existing = users.get(currentUserId);
        if (existing && existing.ws === ws) {
          users.delete(currentUserId);
          console.log(`[Signaling] User ${currentUserId} disconnected. Online: ${users.size}`);
        }
      }
    });

    ws.on("error", () => {
      if (currentUserId !== null) {
        const existing = users.get(currentUserId);
        if (existing && existing.ws === ws) {
          users.delete(currentUserId);
        }
      }
    });
  });

  console.log("[Signaling] WebSocket signaling server ready on /ws/signaling");
}
