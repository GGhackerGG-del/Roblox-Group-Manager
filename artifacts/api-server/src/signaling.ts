import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer } from "http";
import { db } from "@workspace/db";
import { platformUsers } from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";

interface ConnectedSocket {
  ws: WebSocket;
  userId: number;
  displayName: string;
  avatarUrl?: string;
}

const sockets = new Set<ConnectedSocket>();
const lastSeenCache = new Map<number, Date>();

const groupCallRooms = new Map<number, Set<number>>();
const groupCallSocketMap = new Map<WebSocket, number>();

export function getGroupCallParticipants(groupChatId: number): number[] {
  const room = groupCallRooms.get(groupChatId);
  return room ? [...room] : [];
}

function joinGroupCall(groupChatId: number, userId: number, ws: WebSocket): number[] {
  let room = groupCallRooms.get(groupChatId);
  if (!room) {
    room = new Set();
    groupCallRooms.set(groupChatId, room);
  }
  const existing = [...room].filter(id => id !== userId);
  room.add(userId);
  groupCallSocketMap.set(ws, groupChatId);
  return existing;
}

function leaveGroupCall(groupChatId: number, userId: number, ws: WebSocket): boolean {
  const room = groupCallRooms.get(groupChatId);
  if (!room) return false;
  groupCallSocketMap.delete(ws);
  const hasOtherSocket = [...sockets].some(s => s.userId === userId && s.ws !== ws && groupCallSocketMap.get(s.ws) === groupChatId);
  if (!hasOtherSocket) {
    room.delete(userId);
    if (room.size === 0) groupCallRooms.delete(groupChatId);
    return true;
  }
  return false;
}

function leaveAllGroupCallsForSocket(userId: number, ws: WebSocket) {
  const gid = groupCallSocketMap.get(ws);
  groupCallSocketMap.delete(ws);
  if (gid === undefined) return;
  const room = groupCallRooms.get(gid);
  if (!room || !room.has(userId)) return;
  const hasOtherSocket = [...sockets].some(s => s.userId === userId && s.ws !== ws && groupCallSocketMap.get(s.ws) === gid);
  if (!hasOtherSocket) {
    room.delete(userId);
    for (const peerId of room) {
      sendToUser(peerId, JSON.stringify({ type: "group-call-peer-left", groupChatId: gid, userId }));
    }
    if (room.size === 0) groupCallRooms.delete(gid);
  }
}

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

export function isUserOnline(userId: number): boolean {
  return userSockets(userId).length > 0;
}

export function getOnlineUserIds(): number[] {
  return [...uniqueOnlineUserIds()];
}

export async function getLastSeenForUsers(userIds: number[]): Promise<Map<number, Date | null>> {
  const result = new Map<number, Date | null>();
  if (userIds.length === 0) return result;

  for (const id of userIds) {
    if (isUserOnline(id)) {
      result.set(id, null);
      continue;
    }
    const cached = lastSeenCache.get(id);
    if (cached) {
      result.set(id, cached);
    }
  }

  const uncached = userIds.filter(id => !result.has(id));
  if (uncached.length > 0) {
    try {
      const rows = await db
        .select({ robloxUserId: platformUsers.robloxUserId, lastSeen: platformUsers.lastSeen })
        .from(platformUsers)
        .where(inArray(platformUsers.robloxUserId, uncached));
      for (const row of rows) {
        const ls = row.lastSeen || null;
        result.set(row.robloxUserId, ls);
        if (ls) lastSeenCache.set(row.robloxUserId, ls);
      }
    } catch (e) {
      console.error("[Signaling] Failed to fetch lastSeen:", e);
    }
  }

  return result;
}

function updateLastSeen(userId: number) {
  const now = new Date();
  lastSeenCache.set(userId, now);
  db.update(platformUsers)
    .set({ lastSeen: now })
    .where(eq(platformUsers.robloxUserId, userId))
    .catch(e => console.error("[Signaling] Failed to update lastSeen:", e));
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
          sendToUser(msg.targetUserId, payload);
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

        case "group-call-join": {
          if (!currentEntry) break;
          const gid = msg.groupChatId as number;
          const existingPeers = joinGroupCall(gid, currentEntry.userId, ws);
          ws.send(JSON.stringify({
            type: "group-call-peers",
            groupChatId: gid,
            peers: existingPeers,
          }));
          for (const peerId of existingPeers) {
            sendToUser(peerId, JSON.stringify({
              type: "group-call-peer-joined",
              groupChatId: gid,
              userId: currentEntry.userId,
              displayName: currentEntry.displayName,
              avatarUrl: currentEntry.avatarUrl,
            }));
          }
          break;
        }

        case "group-call-leave": {
          if (!currentEntry) break;
          const gid = msg.groupChatId as number;
          const didLeave = leaveGroupCall(gid, currentEntry.userId, ws);
          if (didLeave) {
            const room = groupCallRooms.get(gid);
            if (room) {
              for (const peerId of room) {
                sendToUser(peerId, JSON.stringify({
                  type: "group-call-peer-left",
                  groupChatId: gid,
                  userId: currentEntry.userId,
                }));
              }
            }
          }
          break;
        }

        case "group-call-offer": {
          if (!currentEntry) break;
          sendToUser(msg.targetUserId, JSON.stringify({
            type: "group-call-offer",
            groupChatId: msg.groupChatId,
            offer: msg.offer,
            fromUserId: currentEntry.userId,
            fromDisplayName: currentEntry.displayName,
            fromAvatarUrl: currentEntry.avatarUrl,
          }));
          break;
        }

        case "group-call-answer": {
          if (!currentEntry) break;
          sendToUser(msg.targetUserId, JSON.stringify({
            type: "group-call-answer",
            groupChatId: msg.groupChatId,
            answer: msg.answer,
            fromUserId: currentEntry.userId,
          }));
          break;
        }

        case "group-ice-candidate": {
          if (!currentEntry) break;
          sendToUser(msg.targetUserId, JSON.stringify({
            type: "group-ice-candidate",
            groupChatId: msg.groupChatId,
            candidate: msg.candidate,
            fromUserId: currentEntry.userId,
          }));
          break;
        }

        case "group-call-participants": {
          if (!currentEntry) break;
          const participants = getGroupCallParticipants(msg.groupChatId);
          ws.send(JSON.stringify({
            type: "group-call-participants",
            groupChatId: msg.groupChatId,
            participants,
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
        leaveAllGroupCallsForSocket(userId, ws);
        sockets.delete(currentEntry);
        currentEntry = null;
        const stillOnline = userSockets(userId).length > 0;
        if (!stillOnline) {
          console.log(`[Signaling] User ${userId} disconnected. Online: ${uniqueOnlineUserIds().size}`);
          updateLastSeen(userId);
          broadcastPresence("user-offline", userId, displayName, avatarUrl);
        }
      }
    };

    ws.on("close", removeSocket);
    ws.on("error", removeSocket);
  });

  console.log("[Signaling] WebSocket signaling server ready on /ws/signaling");
}
