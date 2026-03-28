import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  platformUsers, groupWorkspaces, workspaceMembers, groupChats, groupChatMembers,
  groupChatMessages, collaborationProjects, collaborationTasks,
  reputationEndorsements, marketplaceListings, marketplaceLikes,
} from "@workspace/db";
import { eq, and, desc, or, inArray, count, sql } from "drizzle-orm";

const router: IRouter = Router();

async function getMyUser(req: { session: { robloxUserId?: number } }) {
  const robloxUserId = req.session.robloxUserId;
  if (!robloxUserId) return null;
  return db.query.platformUsers.findFirst({ where: eq(platformUsers.robloxUserId, robloxUserId) });
}

// ── Team / Workspace ─────────────────────────────────────────────────────────

router.get("/community/workspaces", async (req, res): Promise<void> => {
  const me = await getMyUser(req);
  if (!me) { res.status(401).json({ error: "Not authenticated" }); return; }

  const memberships = await db.query.workspaceMembers.findMany({
    where: and(eq(workspaceMembers.userId, me.id), eq(workspaceMembers.status, "active")),
  });
  if (!memberships.length) { res.json({ workspaces: [] }); return; }

  const wsIds = memberships.map(m => m.workspaceId);
  const wsList = await db.query.groupWorkspaces.findMany({ where: inArray(groupWorkspaces.id, wsIds) });

  const memberCounts = await db.select({
    workspaceId: workspaceMembers.workspaceId,
    total: count(workspaceMembers.id),
  }).from(workspaceMembers)
    .where(and(inArray(workspaceMembers.workspaceId, wsIds), eq(workspaceMembers.status, "active")))
    .groupBy(workspaceMembers.workspaceId);

  const countMap = Object.fromEntries(memberCounts.map(c => [c.workspaceId, c.total]));

  res.json({
    workspaces: wsList.map(ws => ({
      ...ws,
      myRole: memberships.find(m => m.workspaceId === ws.id)?.role || "member",
      memberCount: countMap[ws.id] || 1,
    })),
  });
});

router.post("/community/workspaces", async (req, res): Promise<void> => {
  const me = await getMyUser(req);
  if (!me) { res.status(401).json({ error: "Not authenticated" }); return; }
  const { robloxGroupId, groupName, groupThumbnailUrl, description } = req.body as {
    robloxGroupId?: number; groupName?: string; groupThumbnailUrl?: string; description?: string;
  };
  if (!robloxGroupId || !groupName) { res.status(400).json({ error: "robloxGroupId and groupName required" }); return; }

  const existing = await db.query.groupWorkspaces.findFirst({ where: eq(groupWorkspaces.robloxGroupId, robloxGroupId) });
  if (existing) { res.status(409).json({ error: "Workspace already exists for this group" }); return; }

  const [ws] = await db.insert(groupWorkspaces).values({
    robloxGroupId, groupName, groupThumbnailUrl: groupThumbnailUrl || null, ownerId: me.id,
    description: description || "",
  }).returning();

  await db.insert(workspaceMembers).values({
    workspaceId: ws.id, userId: me.id, role: "owner", status: "active",
  });

  res.json({ workspace: { ...ws, myRole: "owner", memberCount: 1 } });
});

router.get("/community/workspaces/:id/members", async (req, res): Promise<void> => {
  const me = await getMyUser(req);
  if (!me) { res.status(401).json({ error: "Not authenticated" }); return; }
  const wsId = parseInt(req.params.id);

  const myMembership = await db.query.workspaceMembers.findFirst({
    where: and(eq(workspaceMembers.workspaceId, wsId), eq(workspaceMembers.userId, me.id), eq(workspaceMembers.status, "active")),
  });
  if (!myMembership) { res.status(403).json({ error: "Not a member" }); return; }

  const members = await db.query.workspaceMembers.findMany({ where: eq(workspaceMembers.workspaceId, wsId) });
  const userIds = members.map(m => m.userId);
  const users = userIds.length ? await db.query.platformUsers.findMany({ where: inArray(platformUsers.id, userIds) }) : [];
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));

  res.json({ members: members.map(m => ({ ...m, user: userMap[m.userId] })) });
});

router.post("/community/workspaces/:id/invite", async (req, res): Promise<void> => {
  const me = await getMyUser(req);
  if (!me) { res.status(401).json({ error: "Not authenticated" }); return; }
  const wsId = parseInt(req.params.id);
  const { targetUserId } = req.body as { targetUserId?: number };
  if (!targetUserId) { res.status(400).json({ error: "targetUserId required" }); return; }

  const myMembership = await db.query.workspaceMembers.findFirst({
    where: and(eq(workspaceMembers.workspaceId, wsId), eq(workspaceMembers.userId, me.id)),
  });
  if (!myMembership || !["owner", "admin"].includes(myMembership.role)) {
    res.status(403).json({ error: "Only owner/admin can invite" }); return;
  }

  const exists = await db.query.workspaceMembers.findFirst({
    where: and(eq(workspaceMembers.workspaceId, wsId), eq(workspaceMembers.userId, targetUserId)),
  });
  if (exists) { res.status(409).json({ error: "Already a member or pending" }); return; }

  await db.insert(workspaceMembers).values({
    workspaceId: wsId, userId: targetUserId, role: "member", status: "pending", invitedBy: me.id,
  });
  res.json({ ok: true });
});

router.post("/community/workspaces/:id/members/:memberId/role", async (req, res): Promise<void> => {
  const me = await getMyUser(req);
  if (!me) { res.status(401).json({ error: "Not authenticated" }); return; }
  const wsId = parseInt(req.params.id);
  const memberId = parseInt(req.params.memberId);
  const { role } = req.body as { role?: string };

  const myM = await db.query.workspaceMembers.findFirst({
    where: and(eq(workspaceMembers.workspaceId, wsId), eq(workspaceMembers.userId, me.id)),
  });
  if (!myM || myM.role !== "owner") { res.status(403).json({ error: "Only owner can change roles" }); return; }

  await db.update(workspaceMembers).set({ role: role || "member" })
    .where(and(eq(workspaceMembers.workspaceId, wsId), eq(workspaceMembers.id, memberId)));
  res.json({ ok: true });
});

router.delete("/community/workspaces/:id/members/:memberId", async (req, res): Promise<void> => {
  const me = await getMyUser(req);
  if (!me) { res.status(401).json({ error: "Not authenticated" }); return; }
  const wsId = parseInt(req.params.id);
  const memberId = parseInt(req.params.memberId);

  const myM = await db.query.workspaceMembers.findFirst({
    where: and(eq(workspaceMembers.workspaceId, wsId), eq(workspaceMembers.userId, me.id)),
  });
  if (!myM || !["owner", "admin"].includes(myM.role)) {
    res.status(403).json({ error: "Insufficient permissions" }); return;
  }
  await db.delete(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, wsId), eq(workspaceMembers.id, memberId)));
  res.json({ ok: true });
});

router.post("/community/workspaces/invite/:id/accept", async (req, res): Promise<void> => {
  const me = await getMyUser(req);
  if (!me) { res.status(401).json({ error: "Not authenticated" }); return; }
  await db.update(workspaceMembers).set({ status: "active" })
    .where(and(eq(workspaceMembers.id, parseInt(req.params.id)), eq(workspaceMembers.userId, me.id)));
  res.json({ ok: true });
});

// ── Group Chats ───────────────────────────────────────────────────────────────

router.get("/community/group-chats", async (req, res): Promise<void> => {
  const me = await getMyUser(req);
  if (!me) { res.status(401).json({ error: "Not authenticated" }); return; }

  try {
    const robloxUserId = String(me.robloxUserId);
    const rolesResp = await fetch(`https://groups.roblox.com/v1/users/${robloxUserId}/groups/roles`);
    if (rolesResp.ok) {
      const rolesData = await rolesResp.json() as { data: Array<{ group: { id: number; name: string }; role: { rank: number } }> };
      const ownedGroups = rolesData.data.filter(g => g.role.rank >= 254);
      for (const g of ownedGroups) {
        const tag = `[roblox-group:${g.group.id}]`;
        const existing = await db.query.groupChats.findFirst({ where: sql`${groupChats.name} LIKE ${tag + '%'}` });
        if (!existing) {
          const [chat] = await db.insert(groupChats).values({ name: `${tag} ${g.group.name}`, createdById: me.id, avatarColor: "#000000" }).returning();
          await db.insert(groupChatMembers).values({ chatId: chat.id, userId: me.id, role: "admin" });
        } else {
          const membership = await db.query.groupChatMembers.findFirst({
            where: and(eq(groupChatMembers.chatId, existing.id), eq(groupChatMembers.userId, me.id)),
          });
          if (!membership) {
            await db.insert(groupChatMembers).values({ chatId: existing.id, userId: me.id, role: "admin" });
          }
        }
      }
    }
  } catch {}

  const memberships = await db.query.groupChatMembers.findMany({ where: eq(groupChatMembers.userId, me.id) });
  if (!memberships.length) { res.json({ chats: [] }); return; }

  const chatIds = memberships.map(m => m.chatId);
  const chats = await db.query.groupChats.findMany({
    where: inArray(groupChats.id, chatIds),
    orderBy: [desc(groupChats.lastMessageAt)],
  });

  const memberCounts = await db.select({ chatId: groupChatMembers.chatId, total: count() })
    .from(groupChatMembers).where(inArray(groupChatMembers.chatId, chatIds)).groupBy(groupChatMembers.chatId);
  const countMap = Object.fromEntries(memberCounts.map(c => [c.chatId, c.total]));

  const lastMsgs = await db.select().from(groupChatMessages)
    .where(inArray(groupChatMessages.chatId, chatIds))
    .orderBy(desc(groupChatMessages.createdAt))
    .limit(chatIds.length * 5);
  const lastMsgMap: Record<number, typeof groupChatMessages.$inferSelect> = {};
  for (const m of lastMsgs) {
    if (!lastMsgMap[m.chatId]) lastMsgMap[m.chatId] = m;
  }

  const enriched = chats.map(c => {
    const robloxGroupMatch = c.name.match(/^\[roblox-group:(\d+)\]\s*/);
    const robloxGroupId = robloxGroupMatch ? parseInt(robloxGroupMatch[1]) : null;
    const displayName = robloxGroupMatch ? c.name.replace(robloxGroupMatch[0], '') : c.name;
    const lastMsg = lastMsgMap[c.id] || null;
    const safeLastMsg = lastMsg && lastMsg.isDeleted ? { ...lastMsg, content: "" } : lastMsg;
    return { ...c, name: displayName, robloxGroupId, memberCount: countMap[c.id] || 0, lastMessage: safeLastMsg, groupThumbnailUrl: null as string | null };
  });

  const robloxGroupIds = enriched.filter(c => c.robloxGroupId).map(c => c.robloxGroupId!);
  if (robloxGroupIds.length > 0) {
    try {
      const thumbResp = await fetch(`https://thumbnails.roblox.com/v1/groups/icons?groupIds=${robloxGroupIds.join(",")}&size=150x150&format=Png&isCircular=false`);
      if (thumbResp.ok) {
        const thumbData = await thumbResp.json() as { data?: Array<{ targetId?: number; imageUrl?: string }> };
        const thumbMap: Record<number, string> = {};
        for (const t of thumbData.data || []) { if (t.targetId && t.imageUrl) thumbMap[t.targetId] = t.imageUrl; }
        for (const c of enriched) { if (c.robloxGroupId && thumbMap[c.robloxGroupId]) c.groupThumbnailUrl = thumbMap[c.robloxGroupId]; }
      }
    } catch {}
  }

  res.json({ chats: enriched });
});

router.post("/community/group-chats", async (req, res): Promise<void> => {
  const me = await getMyUser(req);
  if (!me) { res.status(401).json({ error: "Not authenticated" }); return; }
  const { name, memberIds, avatarColor } = req.body as { name?: string; memberIds?: number[]; avatarColor?: string };
  if (!name || !memberIds || memberIds.length < 2) {
    res.status(400).json({ error: "name and at least 2 other memberIds required" }); return;
  }
  const [chat] = await db.insert(groupChats).values({
    name, createdById: me.id, avatarColor: avatarColor || "#6366f1",
  }).returning();

  const allMemberIds = [me.id, ...memberIds.filter(id => id !== me.id)];
  await db.insert(groupChatMembers).values(allMemberIds.map((uid, i) => ({
    chatId: chat.id, userId: uid, role: i === 0 ? "admin" : "member",
  })));

  res.json({ chat: { ...chat, memberCount: allMemberIds.length } });
});

router.get("/community/group-chats/:id/messages", async (req, res): Promise<void> => {
  const me = await getMyUser(req);
  if (!me) { res.status(401).json({ error: "Not authenticated" }); return; }
  const chatId = parseInt(req.params.id);

  const membership = await db.query.groupChatMembers.findFirst({
    where: and(eq(groupChatMembers.chatId, chatId), eq(groupChatMembers.userId, me.id)),
  });
  if (!membership) { res.status(403).json({ error: "Not a member" }); return; }

  const messages = await db.query.groupChatMessages.findMany({
    where: eq(groupChatMessages.chatId, chatId),
    orderBy: [desc(groupChatMessages.createdAt)],
    limit: 60,
  });
  const senderIds = [...new Set(messages.map(m => m.senderId))];
  const senders = senderIds.length ? await db.query.platformUsers.findMany({ where: inArray(platformUsers.id, senderIds) }) : [];
  const senderMap = Object.fromEntries(senders.map(s => [s.id, s]));

  res.json({ messages: messages.reverse().map(m => ({ ...m, content: m.isDeleted ? "" : m.content, sender: senderMap[m.senderId] })) });
});

router.post("/community/group-chats/:id/messages", async (req, res): Promise<void> => {
  const me = await getMyUser(req);
  if (!me) { res.status(401).json({ error: "Not authenticated" }); return; }
  const chatId = parseInt(req.params.id);
  const { content, imageUrl } = req.body as { content?: string; imageUrl?: string };
  if (!content?.trim() && !imageUrl) { res.status(400).json({ error: "content required" }); return; }
  if (imageUrl && !imageUrl.startsWith("[attachments:") && !imageUrl.startsWith("data:")) { res.status(400).json({ error: "Invalid attachment format" }); return; }
  if (imageUrl && imageUrl.length > 10 * 1024 * 1024) { res.status(400).json({ error: "Attachment too large" }); return; }

  const membership = await db.query.groupChatMembers.findFirst({
    where: and(eq(groupChatMembers.chatId, chatId), eq(groupChatMembers.userId, me.id)),
  });
  if (!membership) { res.status(403).json({ error: "Not a member" }); return; }

  const [msg] = await db.insert(groupChatMessages).values({ chatId, senderId: me.id, content: (content || "").trim(), ...(imageUrl ? { imageUrl } : {}) }).returning();
  await db.update(groupChats).set({ lastMessageAt: new Date() }).where(eq(groupChats.id, chatId));

  res.json({ message: { ...msg, sender: me } });
});

router.delete("/community/group-chats/:chatId/messages/:msgId", async (req, res): Promise<void> => {
  const me = await getMyUser(req);
  if (!me) { res.status(401).json({ error: "Not authenticated" }); return; }
  const chatId = parseInt(req.params.chatId);
  const msgId = parseInt(req.params.msgId);

  const membership = await db.query.groupChatMembers.findFirst({
    where: and(eq(groupChatMembers.chatId, chatId), eq(groupChatMembers.userId, me.id)),
  });
  if (!membership) { res.status(403).json({ error: "Not a member" }); return; }

  const msg = await db.query.groupChatMessages.findFirst({ where: eq(groupChatMessages.id, msgId) });
  if (!msg || msg.chatId !== chatId) { res.status(404).json({ error: "Message not found" }); return; }
  if (msg.senderId !== me.id && membership.role !== "admin") { res.status(403).json({ error: "Cannot delete others' messages" }); return; }

  await db.update(groupChatMessages).set({ isDeleted: true }).where(eq(groupChatMessages.id, msgId));
  res.json({ ok: true });
});

router.get("/community/group-chats/:id/members", async (req, res): Promise<void> => {
  const me = await getMyUser(req);
  if (!me) { res.status(401).json({ error: "Not authenticated" }); return; }
  const chatId = parseInt(req.params.id);
  const members = await db.query.groupChatMembers.findMany({ where: eq(groupChatMembers.chatId, chatId) });
  const userIds = members.map(m => m.userId);
  const users = userIds.length ? await db.query.platformUsers.findMany({ where: inArray(platformUsers.id, userIds) }) : [];
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));
  res.json({ members: members.map(m => ({ ...m, user: userMap[m.userId] })) });
});

router.post("/community/group-chats/:id/members", async (req, res): Promise<void> => {
  const me = await getMyUser(req);
  if (!me) { res.status(401).json({ error: "Not authenticated" }); return; }
  const chatId = parseInt(req.params.id);
  const { targetUserId } = req.body as { targetUserId?: number };
  if (!targetUserId) { res.status(400).json({ error: "targetUserId required" }); return; }
  const myM = await db.query.groupChatMembers.findFirst({
    where: and(eq(groupChatMembers.chatId, chatId), eq(groupChatMembers.userId, me.id)),
  });
  if (!myM) { res.status(403).json({ error: "Not a member" }); return; }
  const exists = await db.query.groupChatMembers.findFirst({
    where: and(eq(groupChatMembers.chatId, chatId), eq(groupChatMembers.userId, targetUserId)),
  });
  if (exists) { res.status(409).json({ error: "Already a member" }); return; }
  await db.insert(groupChatMembers).values({ chatId, userId: targetUserId, role: "member" });
  res.json({ ok: true });
});

router.delete("/community/group-chats/:id/members/:memberId", async (req, res): Promise<void> => {
  const me = await getMyUser(req);
  if (!me) { res.status(401).json({ error: "Not authenticated" }); return; }
  const chatId = parseInt(req.params.id);
  const memberId = parseInt(req.params.memberId);
  const myM = await db.query.groupChatMembers.findFirst({
    where: and(eq(groupChatMembers.chatId, chatId), eq(groupChatMembers.userId, me.id)),
  });
  if (!myM) { res.status(403).json({ error: "Not a member" }); return; }
  const target = await db.query.groupChatMembers.findFirst({
    where: and(eq(groupChatMembers.chatId, chatId), eq(groupChatMembers.userId, memberId)),
  });
  if (!target) { res.status(404).json({ error: "Member not found" }); return; }
  if (memberId === me.id) {
    if (myM.role === "admin") {
      const otherAdmins = await db.query.groupChatMembers.findMany({
        where: and(eq(groupChatMembers.chatId, chatId), eq(groupChatMembers.role, "admin")),
      });
      if (otherAdmins.length <= 1) { res.status(400).json({ error: "Cannot leave: you are the only admin" }); return; }
    }
    await db.delete(groupChatMembers).where(and(eq(groupChatMembers.chatId, chatId), eq(groupChatMembers.userId, me.id)));
    res.json({ ok: true, left: true });
    return;
  }
  if (!["admin", "moderator"].includes(myM.role)) { res.status(403).json({ error: "Only admin/moderator can remove members" }); return; }
  if (target.role === "admin") { res.status(403).json({ error: "Cannot remove an admin" }); return; }
  if (target.role === "moderator" && myM.role !== "admin") { res.status(403).json({ error: "Only admin can remove a moderator" }); return; }
  await db.delete(groupChatMembers).where(and(eq(groupChatMembers.chatId, chatId), eq(groupChatMembers.userId, memberId)));
  res.json({ ok: true });
});

router.patch("/community/group-chats/:id/members/:memberId/role", async (req, res): Promise<void> => {
  const me = await getMyUser(req);
  if (!me) { res.status(401).json({ error: "Not authenticated" }); return; }
  const chatId = parseInt(req.params.id);
  const memberId = parseInt(req.params.memberId);
  const { role } = req.body as { role?: string };
  if (!role || !["admin", "moderator", "member"].includes(role)) { res.status(400).json({ error: "Invalid role" }); return; }
  const myM = await db.query.groupChatMembers.findFirst({
    where: and(eq(groupChatMembers.chatId, chatId), eq(groupChatMembers.userId, me.id)),
  });
  if (!myM || myM.role !== "admin") { res.status(403).json({ error: "Only admin can change roles" }); return; }
  if (memberId === me.id) { res.status(400).json({ error: "Cannot change your own role" }); return; }
  await db.update(groupChatMembers).set({ role }).where(and(eq(groupChatMembers.chatId, chatId), eq(groupChatMembers.userId, memberId)));
  res.json({ ok: true });
});

// ── Roblox Group Chat (auto-created) ──────────────────────────────────────────

router.post("/community/roblox-group-chat", async (req, res): Promise<void> => {
  const me = await getMyUser(req);
  if (!me) { res.status(401).json({ error: "Not authenticated" }); return; }
  const { groupId, groupName } = req.body as { groupId?: number; groupName?: string };
  if (!groupId || !groupName) { res.status(400).json({ error: "groupId and groupName required" }); return; }

  const robloxUserId = String(me.robloxUserId);
  try {
    const rolesResp = await fetch(`https://groups.roblox.com/v1/users/${robloxUserId}/groups/roles`);
    if (rolesResp.ok) {
      const rolesData = await rolesResp.json() as { data: Array<{ group: { id: number }; role: { rank: number } }> };
      const membership = rolesData.data.find(g => g.group.id === groupId);
      if (!membership || membership.role.rank !== 255) {
        res.status(403).json({ error: "You must be the owner of this Roblox group" });
        return;
      }
    } else {
      res.status(502).json({ error: "Could not verify group ownership" });
      return;
    }
  } catch {
    res.status(502).json({ error: "Could not verify group ownership" });
    return;
  }

  let groupThumbnailUrl: string | undefined;
  try {
    const thumbResp = await fetch(`https://thumbnails.roblox.com/v1/groups/icons?groupIds=${groupId}&size=150x150&format=Png&isCircular=false`);
    if (thumbResp.ok) {
      const thumbData = await thumbResp.json() as { data?: Array<{ imageUrl?: string }> };
      groupThumbnailUrl = thumbData.data?.[0]?.imageUrl || undefined;
    }
  } catch {}

  const tag = `[roblox-group:${groupId}]`;
  const existing = await db.query.groupChats.findFirst({
    where: sql`${groupChats.name} LIKE ${tag + '%'}`,
  });

  if (existing) {
    const membership = await db.query.groupChatMembers.findFirst({
      where: and(eq(groupChatMembers.chatId, existing.id), eq(groupChatMembers.userId, me.id)),
    });
    if (!membership) {
      await db.insert(groupChatMembers).values({ chatId: existing.id, userId: me.id, role: "admin" });
    }
    const memberCount = await db.select({ total: count() }).from(groupChatMembers).where(eq(groupChatMembers.chatId, existing.id));
    res.json({ chat: { ...existing, name: existing.name.replace(tag, '').trim(), robloxGroupId: groupId, groupThumbnailUrl, memberCount: memberCount[0]?.total || 0 } });
    return;
  }

  const [chat] = await db.insert(groupChats).values({
    name: `${tag} ${groupName}`,
    createdById: me.id,
    avatarColor: "#000000",
  }).returning();

  await db.insert(groupChatMembers).values({ chatId: chat.id, userId: me.id, role: "admin" });

  res.json({ chat: { ...chat, name: groupName, robloxGroupId: groupId, groupThumbnailUrl, memberCount: 1 } });
});

// ── Collaboration ─────────────────────────────────────────────────────────────

router.get("/community/workspaces/:wsId/projects", async (req, res): Promise<void> => {
  const me = await getMyUser(req);
  if (!me) { res.status(401).json({ error: "Not authenticated" }); return; }
  const wsId = parseInt(req.params.wsId);
  const myM = await db.query.workspaceMembers.findFirst({
    where: and(eq(workspaceMembers.workspaceId, wsId), eq(workspaceMembers.userId, me.id), eq(workspaceMembers.status, "active")),
  });
  if (!myM) { res.status(403).json({ error: "Not a member" }); return; }
  const projects = await db.query.collaborationProjects.findMany({
    where: eq(collaborationProjects.workspaceId, wsId),
    orderBy: [desc(collaborationProjects.createdAt)],
  });
  res.json({ projects });
});

router.post("/community/workspaces/:wsId/projects", async (req, res): Promise<void> => {
  const me = await getMyUser(req);
  if (!me) { res.status(401).json({ error: "Not authenticated" }); return; }
  const wsId = parseInt(req.params.wsId);
  const { title, description } = req.body as { title?: string; description?: string };
  if (!title) { res.status(400).json({ error: "title required" }); return; }
  const myM = await db.query.workspaceMembers.findFirst({
    where: and(eq(workspaceMembers.workspaceId, wsId), eq(workspaceMembers.userId, me.id), eq(workspaceMembers.status, "active")),
  });
  if (!myM) { res.status(403).json({ error: "Not a member" }); return; }
  const [project] = await db.insert(collaborationProjects).values({
    workspaceId: wsId, title, description: description || "", createdById: me.id,
  }).returning();
  res.json({ project });
});

router.get("/community/projects/:projectId/tasks", async (req, res): Promise<void> => {
  const me = await getMyUser(req);
  if (!me) { res.status(401).json({ error: "Not authenticated" }); return; }
  const projectId = parseInt(req.params.projectId);
  const project = await db.query.collaborationProjects.findFirst({ where: eq(collaborationProjects.id, projectId) });
  if (!project) { res.status(404).json({ error: "Not found" }); return; }
  const myM = await db.query.workspaceMembers.findFirst({
    where: and(eq(workspaceMembers.workspaceId, project.workspaceId), eq(workspaceMembers.userId, me.id), eq(workspaceMembers.status, "active")),
  });
  if (!myM) { res.status(403).json({ error: "Not a member" }); return; }
  const tasks = await db.query.collaborationTasks.findMany({
    where: eq(collaborationTasks.projectId, projectId),
    orderBy: [desc(collaborationTasks.createdAt)],
  });
  const assigneeIds = [...new Set(tasks.map(t => t.assignedToId).filter(Boolean) as number[])];
  const assignees = assigneeIds.length ? await db.query.platformUsers.findMany({ where: inArray(platformUsers.id, assigneeIds) }) : [];
  const assigneeMap = Object.fromEntries(assignees.map(a => [a.id, a]));
  res.json({ tasks: tasks.map(t => ({ ...t, assignee: t.assignedToId ? assigneeMap[t.assignedToId] : null })) });
});

router.post("/community/projects/:projectId/tasks", async (req, res): Promise<void> => {
  const me = await getMyUser(req);
  if (!me) { res.status(401).json({ error: "Not authenticated" }); return; }
  const projectId = parseInt(req.params.projectId);
  const { title, description, assignedToId, priority, dueAt } = req.body as {
    title?: string; description?: string; assignedToId?: number; priority?: string; dueAt?: string;
  };
  if (!title) { res.status(400).json({ error: "title required" }); return; }
  const [task] = await db.insert(collaborationTasks).values({
    projectId, title, description: description || "", assignedToId: assignedToId || null,
    priority: priority || "medium", createdById: me.id,
    dueAt: dueAt ? new Date(dueAt) : null,
  }).returning();
  res.json({ task });
});

router.patch("/community/tasks/:taskId", async (req, res): Promise<void> => {
  const me = await getMyUser(req);
  if (!me) { res.status(401).json({ error: "Not authenticated" }); return; }
  const { status, assignedToId, priority } = req.body as { status?: string; assignedToId?: number; priority?: string };
  const updates: Record<string, string | number | null> = {};
  if (status) updates.status = status;
  if (assignedToId !== undefined) updates.assignedToId = assignedToId;
  if (priority) updates.priority = priority;
  await db.update(collaborationTasks).set(updates).where(eq(collaborationTasks.id, parseInt(req.params.taskId)));
  res.json({ ok: true });
});

// ── Reputation ────────────────────────────────────────────────────────────────

const SKILLS = ["designer", "developer", "manager", "marketer", "seller", "creative", "general"] as const;

router.get("/community/reputation/:userId", async (req, res): Promise<void> => {
  const userId = parseInt(req.params.userId);
  const endorsements = await db.query.reputationEndorsements.findMany({
    where: eq(reputationEndorsements.toUserId, userId),
    orderBy: [desc(reputationEndorsements.createdAt)],
  });
  const fromIds = [...new Set(endorsements.map(e => e.fromUserId))];
  const fromUsers = fromIds.length ? await db.query.platformUsers.findMany({ where: inArray(platformUsers.id, fromIds) }) : [];
  const fromMap = Object.fromEntries(fromUsers.map(u => [u.id, u]));
  const bySkill = Object.fromEntries(SKILLS.map(s => [s, endorsements.filter(e => e.skill === s).length]));
  const total = endorsements.length;
  res.json({ total, bySkill, endorsements: endorsements.slice(0, 20).map(e => ({ ...e, from: fromMap[e.fromUserId] })) });
});

router.post("/community/reputation/endorse", async (req, res): Promise<void> => {
  const me = await getMyUser(req);
  if (!me) { res.status(401).json({ error: "Not authenticated" }); return; }
  const { toUserId, skill, message } = req.body as { toUserId?: number; skill?: string; message?: string };
  if (!toUserId || !skill) { res.status(400).json({ error: "toUserId and skill required" }); return; }
  if (toUserId === me.id) { res.status(400).json({ error: "Cannot endorse yourself" }); return; }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayCount = await db.select({ n: count() }).from(reputationEndorsements)
    .where(and(eq(reputationEndorsements.fromUserId, me.id), sql`${reputationEndorsements.createdAt} >= ${today}`));
  if ((todayCount[0]?.n || 0) >= 5) {
    res.status(429).json({ error: "Daily endorsement limit (5) reached" }); return;
  }

  const existing = await db.query.reputationEndorsements.findFirst({
    where: and(
      eq(reputationEndorsements.fromUserId, me.id),
      eq(reputationEndorsements.toUserId, toUserId),
      eq(reputationEndorsements.skill, skill),
    ),
  });
  if (existing) { res.status(409).json({ error: "Already endorsed this skill" }); return; }

  const [endorsement] = await db.insert(reputationEndorsements).values({
    fromUserId: me.id, toUserId, skill, message: message?.slice(0, 200) || "",
  }).returning();
  res.json({ endorsement });
});

// ── Marketplace ───────────────────────────────────────────────────────────────

const MARKETPLACE_CATEGORIES = ["template", "design", "shader", "avatar", "plugin", "asset", "script"];

router.get("/community/marketplace", async (req, res): Promise<void> => {
  const me = await getMyUser(req);
  const { category, sort } = req.query as { category?: string; sort?: string };

  const where = category && MARKETPLACE_CATEGORIES.includes(category)
    ? and(eq(marketplaceListings.isActive, true), eq(marketplaceListings.category, category))
    : eq(marketplaceListings.isActive, true);

  const listings = await db.query.marketplaceListings.findMany({
    where,
    orderBy: sort === "popular"
      ? [desc(marketplaceListings.downloadCount)]
      : sort === "likes"
        ? [desc(marketplaceListings.likesCount)]
        : [desc(marketplaceListings.createdAt)],
    limit: 40,
  });

  const sellerIds = [...new Set(listings.map(l => l.sellerId))];
  const sellers = sellerIds.length ? await db.query.platformUsers.findMany({ where: inArray(platformUsers.id, sellerIds) }) : [];
  const sellerMap = Object.fromEntries(sellers.map(s => [s.id, s]));

  let likedIds = new Set<number>();
  if (me) {
    const likes = await db.query.marketplaceLikes.findMany({ where: eq(marketplaceLikes.userId, me.id) });
    likedIds = new Set(likes.map(l => l.listingId));
  }

  res.json({
    listings: listings.map(l => ({
      ...l,
      seller: sellerMap[l.sellerId],
      isLiked: likedIds.has(l.id),
    })),
  });
});

router.post("/community/marketplace", async (req, res): Promise<void> => {
  const me = await getMyUser(req);
  if (!me) { res.status(401).json({ error: "Not authenticated" }); return; }
  const { title, description, category, previewUrl, downloadUrl, price, tags } = req.body as {
    title?: string; description?: string; category?: string; previewUrl?: string;
    downloadUrl?: string; price?: number; tags?: string[];
  };
  if (!title || !description) { res.status(400).json({ error: "title and description required" }); return; }
  const [listing] = await db.insert(marketplaceListings).values({
    sellerId: me.id, title, description, category: category || "template",
    previewUrl: previewUrl || null, downloadUrl: downloadUrl || null,
    price: price || 0, tagsJson: JSON.stringify(tags || []),
  }).returning();
  res.json({ listing: { ...listing, seller: me, isLiked: false } });
});

router.post("/community/marketplace/:id/like", async (req, res): Promise<void> => {
  const me = await getMyUser(req);
  if (!me) { res.status(401).json({ error: "Not authenticated" }); return; }
  const listingId = parseInt(req.params.id);
  const existing = await db.query.marketplaceLikes.findFirst({
    where: and(eq(marketplaceLikes.listingId, listingId), eq(marketplaceLikes.userId, me.id)),
  });
  if (existing) {
    await db.delete(marketplaceLikes).where(eq(marketplaceLikes.id, existing.id));
    await db.update(marketplaceListings).set({ likesCount: sql`${marketplaceListings.likesCount} - 1` }).where(eq(marketplaceListings.id, listingId));
    res.json({ liked: false });
  } else {
    await db.insert(marketplaceLikes).values({ listingId, userId: me.id });
    await db.update(marketplaceListings).set({ likesCount: sql`${marketplaceListings.likesCount} + 1` }).where(eq(marketplaceListings.id, listingId));
    res.json({ liked: true });
  }
});

router.post("/community/marketplace/:id/download", async (req, res): Promise<void> => {
  const me = await getMyUser(req);
  if (!me) { res.status(401).json({ error: "Not authenticated" }); return; }
  const listingId = parseInt(req.params.id);
  const listing = await db.query.marketplaceListings.findFirst({ where: eq(marketplaceListings.id, listingId) });
  if (!listing) { res.status(404).json({ error: "Not found" }); return; }
  await db.update(marketplaceListings).set({ downloadCount: sql`${marketplaceListings.downloadCount} + 1` }).where(eq(marketplaceListings.id, listingId));
  res.json({ downloadUrl: listing.downloadUrl });
});

router.delete("/community/marketplace/:id", async (req, res): Promise<void> => {
  const me = await getMyUser(req);
  if (!me) { res.status(401).json({ error: "Not authenticated" }); return; }
  const listing = await db.query.marketplaceListings.findFirst({ where: eq(marketplaceListings.id, parseInt(req.params.id)) });
  if (!listing || listing.sellerId !== me.id) { res.status(403).json({ error: "Not your listing" }); return; }
  await db.update(marketplaceListings).set({ isActive: false }).where(eq(marketplaceListings.id, listing.id));
  res.json({ ok: true });
});

// Pending invites for current user
router.get("/community/invites", async (req, res): Promise<void> => {
  const me = await getMyUser(req);
  if (!me) { res.status(401).json({ error: "Not authenticated" }); return; }
  const pendingMemberships = await db.query.workspaceMembers.findMany({
    where: and(eq(workspaceMembers.userId, me.id), eq(workspaceMembers.status, "pending")),
  });
  if (!pendingMemberships.length) { res.json({ invites: [] }); return; }
  const wsIds = pendingMemberships.map(m => m.workspaceId);
  const wsList = await db.query.groupWorkspaces.findMany({ where: inArray(groupWorkspaces.id, wsIds) });
  const wsMap = Object.fromEntries(wsList.map(w => [w.id, w]));
  res.json({ invites: pendingMemberships.map(m => ({ ...m, workspace: wsMap[m.workspaceId] })) });
});

export default router;
