import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { platformUsers, friendships, posts, postLikes, postComments, dmConversations, dmMessages } from "@workspace/db";
import { eq, or, and, desc, ne, sql, inArray } from "drizzle-orm";

const router: IRouter = Router();

const ROBLOX_USERS_API = "https://users.roblox.com";
const ROBLOX_THUMBNAILS_API = "https://thumbnails.roblox.com";
const ROBLOX_GROUPS_API = "https://groups.roblox.com";

async function fetchRobloxProfile(robloxUserId: number) {
  const [resp, thumbResp] = await Promise.allSettled([
    fetch(`${ROBLOX_USERS_API}/v1/users/${robloxUserId}`),
    fetch(`${ROBLOX_THUMBNAILS_API}/v1/users/avatar-headshot?userIds=${robloxUserId}&size=150x150&format=Png&isCircular=false`),
  ]);
  if (resp.status !== "fulfilled" || !resp.value.ok) return null;
  const userData = await resp.value.json() as { id: number; name: string; displayName: string };
  let avatarUrl: string | null = null;
  if (thumbResp.status === "fulfilled" && thumbResp.value.ok) {
    const td = await thumbResp.value.json() as { data: Array<{ imageUrl: string }> };
    avatarUrl = td.data?.[0]?.imageUrl || null;
  }
  return { name: userData.name, displayName: userData.displayName, avatarUrl };
}

const AVATAR_REFRESH_MS = 10 * 60 * 1000;
const refreshingUsers = new Set<number>();

function refreshStaleAvatars(users: Array<typeof platformUsers.$inferSelect>) {
  const stale = users.filter(u => {
    if (refreshingUsers.has(u.id)) return false;
    const age = Date.now() - (u.updatedAt?.getTime() || 0);
    return age > AVATAR_REFRESH_MS;
  });
  if (stale.length === 0) return;
  const batch = stale.slice(0, 20);
  for (const u of batch) refreshingUsers.add(u.id);

  (async () => {
    try {
      const ids = batch.map(u => u.robloxUserId);
      const thumbResp = await fetch(
        `${ROBLOX_THUMBNAILS_API}/v1/users/avatar-headshot?userIds=${ids.join(",")}&size=150x150&format=Png&isCircular=false`
      );
      if (!thumbResp.ok) {
        for (const u of batch) {
          await db.update(platformUsers).set({ updatedAt: new Date() }).where(eq(platformUsers.id, u.id));
        }
        return;
      }
      const td = await thumbResp.json() as { data: Array<{ targetId: number; imageUrl: string; state: string }> };
      const responseMap = new Map((td.data || []).map(e => [e.targetId, e]));
      for (const user of batch) {
        const entry = responseMap.get(user.robloxUserId);
        if (entry?.state === "Completed" && entry.imageUrl && entry.imageUrl !== user.avatarUrl) {
          await db.update(platformUsers).set({ avatarUrl: entry.imageUrl, updatedAt: new Date() }).where(eq(platformUsers.id, user.id));
        } else {
          await db.update(platformUsers).set({ updatedAt: new Date() }).where(eq(platformUsers.id, user.id));
        }
      }
    } catch {} finally {
      for (const u of batch) refreshingUsers.delete(u.id);
    }
  })();
}

async function getOrCreatePlatformUser(robloxUserId: number, cookie: string) {
  let user = await db.query.platformUsers.findFirst({
    where: eq(platformUsers.robloxUserId, robloxUserId),
  });

  if (!user) {
    const profile = await fetchRobloxProfile(robloxUserId);
    if (!profile) return null;
    [user] = await db.insert(platformUsers).values({
      robloxUserId,
      robloxUsername: profile.name,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      bio: "",
    }).returning();
  } else {
    const age = Date.now() - (user.updatedAt?.getTime() || 0);
    if (age > AVATAR_REFRESH_MS && !refreshingUsers.has(user.id)) {
      refreshingUsers.add(user.id);
      fetchRobloxProfile(robloxUserId).then(async (profile) => {
        try {
          if (profile) {
            const updates: any = { updatedAt: new Date() };
            if (profile.avatarUrl && profile.avatarUrl !== user!.avatarUrl) updates.avatarUrl = profile.avatarUrl;
            if (profile.displayName !== user!.displayName) updates.displayName = profile.displayName;
            if (profile.name !== user!.robloxUsername) updates.robloxUsername = profile.name;
            await db.update(platformUsers).set(updates).where(eq(platformUsers.id, user!.id));
          } else {
            await db.update(platformUsers).set({ updatedAt: new Date() }).where(eq(platformUsers.id, user!.id));
          }
        } catch {} finally { refreshingUsers.delete(user!.id); }
      }).catch(() => { refreshingUsers.delete(user!.id); });
    }
  }
  return user;
}

router.post("/social/register", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  const robloxUserId = req.session.robloxUserId;
  if (!cookie || !robloxUserId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const user = await getOrCreatePlatformUser(robloxUserId, cookie);
  if (!user) { res.status(500).json({ error: "Failed to create user profile." }); return; }
  res.json(user);
});

router.get("/social/me", async (req, res): Promise<void> => {
  const robloxUserId = req.session.robloxUserId;
  if (!robloxUserId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const cookie = req.session.robloxCookie!;
  const user = await getOrCreatePlatformUser(robloxUserId, cookie);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json(user);
});

router.patch("/social/me", async (req, res): Promise<void> => {
  const robloxUserId = req.session.robloxUserId;
  if (!robloxUserId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const user = await db.query.platformUsers.findFirst({ where: eq(platformUsers.robloxUserId, robloxUserId) });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const VALID_FRAMES = ["none","golden_crown","sakura","ice_crystal","fire_blaze","neon_green","purple_galaxy","rainbow","rose_garden","silver_steel","midnight_blue","emerald","blood_red","pastel_dream","sunset","diamond","toxic"];
  const { bio, avatarFrame } = req.body as { bio?: string; avatarFrame?: string };
  const updates: any = { updatedAt: new Date() };
  if (bio !== undefined) updates.bio = bio;
  if (avatarFrame !== undefined) {
    if (!VALID_FRAMES.includes(avatarFrame)) { res.status(400).json({ error: "Invalid frame" }); return; }
    updates.avatarFrame = avatarFrame;
  }
  const [updated] = await db.update(platformUsers).set(updates).where(eq(platformUsers.id, user.id)).returning();
  res.json(updated);
});

router.get("/social/users", async (req, res): Promise<void> => {
  const robloxUserId = req.session.robloxUserId;
  const page = parseInt(String(req.query.page || "1"), 10);
  const search = String(req.query.search || "").toLowerCase().trim();
  const limit = 50;
  const offset = (page - 1) * limit;

  const allUsers = await db.query.platformUsers.findMany({
    orderBy: [desc(platformUsers.createdAt)],
    limit,
    offset,
  });

  refreshStaleAvatars(allUsers);

  const myUser = robloxUserId ? await db.query.platformUsers.findFirst({ where: eq(platformUsers.robloxUserId, robloxUserId) }) : null;

  let friendshipMap: Record<number, { status: string; isRequester: boolean; id: number }> = {};
  if (myUser) {
    const fships = await db.query.friendships.findMany({
      where: or(eq(friendships.requesterId, myUser.id), eq(friendships.addresseeId, myUser.id)),
    });
    for (const f of fships) {
      const otherId = f.requesterId === myUser.id ? f.addresseeId : f.requesterId;
      friendshipMap[otherId] = { status: f.status, isRequester: f.requesterId === myUser.id, id: f.id };
    }
  }

  let usersWithMeta = allUsers.map(u => ({
    ...u,
    friendship: myUser && u.id !== myUser.id ? (friendshipMap[u.id] || null) : null,
    isMe: myUser ? u.id === myUser.id : false,
  }));

  // Apply search filter
  if (search) {
    usersWithMeta = usersWithMeta.filter(u =>
      u.displayName.toLowerCase().includes(search) ||
      u.robloxUsername.toLowerCase().includes(search) ||
      (u.bio || "").toLowerCase().includes(search)
    );
  }

  res.json({ users: usersWithMeta, page, hasMore: allUsers.length === limit, myUserId: myUser?.id || null });
});

router.get("/social/users/search", async (req, res): Promise<void> => {
  const q = String(req.query.q || "").trim();
  if (!q) { res.json([]); return; }
  const qLower = q.toLowerCase();

  const results = await db.query.platformUsers.findMany({
    where: or(
      sql`lower(${platformUsers.robloxUsername}) LIKE ${'%' + qLower + '%'}`,
      sql`lower(${platformUsers.displayName}) LIKE ${'%' + qLower + '%'}`
    ),
    limit: 20,
  });

  res.json(results);
});

router.get("/social/users/:userId", async (req, res): Promise<void> => {
  const userId = parseInt(req.params.userId, 10);
  const user = await db.query.platformUsers.findFirst({ where: eq(platformUsers.id, userId) });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const userPosts = await db.query.posts.findMany({
    where: eq(posts.authorId, userId),
    orderBy: [desc(posts.createdAt)],
    limit: 10,
  });

  const robloxUserId = req.session.robloxUserId;
  const myUser = robloxUserId ? await db.query.platformUsers.findFirst({ where: eq(platformUsers.robloxUserId, robloxUserId) }) : null;
  let friendship = null;
  if (myUser) {
    friendship = await db.query.friendships.findFirst({
      where: or(
        and(eq(friendships.requesterId, myUser.id), eq(friendships.addresseeId, userId)),
        and(eq(friendships.requesterId, userId), eq(friendships.addresseeId, myUser.id))
      ),
    });
  }

  let groups: Array<{ id: number; name: string; memberCount: number; thumbnailUrl: string | null }> = [];
  try {
    const groupsResp = await fetch(`${ROBLOX_GROUPS_API}/v1/users/${user.robloxUserId}/groups/roles`);
    if (groupsResp.ok) {
      const gd = await groupsResp.json() as { data: Array<{ group: { id: number; name: string; memberCount: number }; role: { rank: number } }> };
      const owned = gd.data.filter(g => g.role.rank >= 254).slice(0, 6);
      const ids = owned.map(g => g.group.id).join(",");
      const thumbMap: Record<number, string> = {};
      if (ids) {
        try {
          const tr = await fetch(`https://thumbnails.roblox.com/v1/groups/icons?groupIds=${ids}&size=150x150&format=Png&isCircular=false`);
          if (tr.ok) {
            const td = await tr.json() as { data: Array<{ targetId: number; imageUrl: string }> };
            td.data.forEach(t => { thumbMap[t.targetId] = t.imageUrl; });
          }
        } catch {}
      }
      groups = owned.map(g => ({ id: g.group.id, name: g.group.name, memberCount: g.group.memberCount, thumbnailUrl: thumbMap[g.group.id] || null }));
    }
  } catch {}

  res.json({ user, posts: userPosts, groups, friendship: friendship || null });
});

router.post("/social/friends/request", async (req, res): Promise<void> => {
  const robloxUserId = req.session.robloxUserId;
  if (!robloxUserId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const cookie = req.session.robloxCookie!;
  const myUser = await getOrCreatePlatformUser(robloxUserId, cookie);
  if (!myUser) { res.status(500).json({ error: "Failed" }); return; }

  const { targetUserId } = req.body as { targetUserId: number };
  if (!targetUserId || targetUserId === myUser.id) { res.status(400).json({ error: "Invalid target" }); return; }

  const existing = await db.query.friendships.findFirst({
    where: or(
      and(eq(friendships.requesterId, myUser.id), eq(friendships.addresseeId, targetUserId)),
      and(eq(friendships.requesterId, targetUserId), eq(friendships.addresseeId, myUser.id))
    ),
  });
  if (existing) { res.status(409).json({ error: "Friend request already exists", friendship: existing }); return; }

  const [friendship] = await db.insert(friendships).values({ requesterId: myUser.id, addresseeId: targetUserId, status: "pending" }).returning();
  res.json({ friendship });
});

router.put("/social/friends/:friendshipId", async (req, res): Promise<void> => {
  const robloxUserId = req.session.robloxUserId;
  if (!robloxUserId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const myUser = await db.query.platformUsers.findFirst({ where: eq(platformUsers.robloxUserId, robloxUserId) });
  if (!myUser) { res.status(404).json({ error: "User not found" }); return; }

  const friendshipId = parseInt(req.params.friendshipId, 10);
  const { action } = req.body as { action: "accept" | "reject" };

  const friendship = await db.query.friendships.findFirst({ where: eq(friendships.id, friendshipId) });
  if (!friendship || friendship.addresseeId !== myUser.id) { res.status(403).json({ error: "Not authorized" }); return; }

  const newStatus = action === "accept" ? "accepted" : "rejected";
  const [updated] = await db.update(friendships).set({ status: newStatus, updatedAt: new Date() }).where(eq(friendships.id, friendshipId)).returning();
  res.json({ friendship: updated });
});

router.delete("/social/friends/:friendshipId", async (req, res): Promise<void> => {
  const robloxUserId = req.session.robloxUserId;
  if (!robloxUserId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const myUser = await db.query.platformUsers.findFirst({ where: eq(platformUsers.robloxUserId, robloxUserId) });
  if (!myUser) { res.status(404).json({ error: "User not found" }); return; }

  const friendshipId = parseInt(req.params.friendshipId, 10);
  const friendship = await db.query.friendships.findFirst({ where: eq(friendships.id, friendshipId) });
  if (!friendship || (friendship.requesterId !== myUser.id && friendship.addresseeId !== myUser.id)) {
    res.status(403).json({ error: "Not authorized" }); return;
  }

  await db.delete(friendships).where(eq(friendships.id, friendshipId));
  res.json({ success: true });
});

router.get("/social/friends", async (req, res): Promise<void> => {
  const robloxUserId = req.session.robloxUserId;
  if (!robloxUserId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const myUser = await db.query.platformUsers.findFirst({ where: eq(platformUsers.robloxUserId, robloxUserId) });
  if (!myUser) { res.json({ friends: [], pending: [] }); return; }

  const allFriendships = await db.query.friendships.findMany({
    where: or(eq(friendships.requesterId, myUser.id), eq(friendships.addresseeId, myUser.id)),
    orderBy: [desc(friendships.createdAt)],
  });

  const accepted = allFriendships.filter(f => f.status === "accepted");
  const pending = allFriendships.filter(f => f.status === "pending" && f.addresseeId === myUser.id);
  const sent = allFriendships.filter(f => f.status === "pending" && f.requesterId === myUser.id);

  const allUserIds = [...new Set([
    ...accepted.map(f => f.requesterId === myUser.id ? f.addresseeId : f.requesterId),
    ...pending.map(f => f.requesterId),
    ...sent.map(f => f.addresseeId),
  ])];

  let userMap: Record<number, typeof platformUsers.$inferSelect> = {};
  if (allUserIds.length > 0) {
    const users = await db.query.platformUsers.findMany({ where: inArray(platformUsers.id, allUserIds) });
    userMap = Object.fromEntries(users.map(u => [u.id, u]));
  }

  res.json({
    friends: accepted.map(f => {
      const otherId = f.requesterId === myUser.id ? f.addresseeId : f.requesterId;
      return { friendship: f, user: userMap[otherId] };
    }),
    pending: pending.map(f => ({ friendship: f, user: userMap[f.requesterId] })),
    sent: sent.map(f => ({ friendship: f, user: userMap[f.addresseeId] })),
  });
});

router.get("/social/feed", async (req, res): Promise<void> => {
  const page = parseInt(String(req.query.page || "1"), 10);
  const limit = 20;
  const offset = (page - 1) * limit;

  const allPosts = await db.query.posts.findMany({
    orderBy: [desc(posts.createdAt)],
    limit,
    offset,
  });

  const authorIds = [...new Set(allPosts.map(p => p.authorId))];
  let authorMap: Record<number, typeof platformUsers.$inferSelect> = {};
  if (authorIds.length > 0) {
    const authors = await db.query.platformUsers.findMany({ where: inArray(platformUsers.id, authorIds) });
    authorMap = Object.fromEntries(authors.map(a => [a.id, a]));
  }

  const robloxUserId = req.session.robloxUserId;
  const myUser = robloxUserId ? await db.query.platformUsers.findFirst({ where: eq(platformUsers.robloxUserId, robloxUserId) }) : null;

  let likedPostIds = new Set<number>();
  if (myUser && allPosts.length > 0) {
    const postIds = allPosts.map(p => p.id);
    const likes = await db.query.postLikes.findMany({
      where: and(eq(postLikes.userId, myUser.id), inArray(postLikes.postId, postIds)),
    });
    likedPostIds = new Set(likes.map(l => l.postId));
  }

  res.json({
    posts: allPosts.map(p => ({
      ...p,
      author: authorMap[p.authorId],
      isLiked: likedPostIds.has(p.id),
    })),
    page,
    hasMore: allPosts.length === limit,
  });
});

router.post("/social/posts", async (req, res): Promise<void> => {
  const robloxUserId = req.session.robloxUserId;
  if (!robloxUserId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const cookie = req.session.robloxCookie!;
  const myUser = await getOrCreatePlatformUser(robloxUserId, cookie);
  if (!myUser) { res.status(500).json({ error: "Failed" }); return; }

  const { content, imageUrl } = req.body as { content: string; imageUrl?: string };
  if (!content?.trim()) { res.status(400).json({ error: "Content is required" }); return; }

  const [post] = await db.insert(posts).values({ authorId: myUser.id, content: content.trim(), imageUrl: imageUrl || null }).returning();
  res.json({ post: { ...post, author: myUser, isLiked: false } });
});

router.delete("/social/posts/:postId", async (req, res): Promise<void> => {
  const robloxUserId = req.session.robloxUserId;
  if (!robloxUserId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const myUser = await db.query.platformUsers.findFirst({ where: eq(platformUsers.robloxUserId, robloxUserId) });
  if (!myUser) { res.status(404).json({ error: "Not found" }); return; }

  const postId = parseInt(req.params.postId, 10);
  const post = await db.query.posts.findFirst({ where: eq(posts.id, postId) });
  if (!post || post.authorId !== myUser.id) { res.status(403).json({ error: "Not authorized" }); return; }

  await db.delete(posts).where(eq(posts.id, postId));
  res.json({ success: true });
});

router.post("/social/posts/:postId/like", async (req, res): Promise<void> => {
  const robloxUserId = req.session.robloxUserId;
  if (!robloxUserId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const cookie = req.session.robloxCookie!;
  const myUser = await getOrCreatePlatformUser(robloxUserId, cookie);
  if (!myUser) { res.status(500).json({ error: "Failed" }); return; }

  const postId = parseInt(req.params.postId, 10);
  const existing = await db.query.postLikes.findFirst({
    where: and(eq(postLikes.postId, postId), eq(postLikes.userId, myUser.id)),
  });

  if (existing) {
    await db.delete(postLikes).where(eq(postLikes.id, existing.id));
    await db.update(posts).set({ likesCount: sql`${posts.likesCount} - 1` }).where(eq(posts.id, postId));
    res.json({ liked: false });
  } else {
    await db.insert(postLikes).values({ postId, userId: myUser.id });
    await db.update(posts).set({ likesCount: sql`${posts.likesCount} + 1` }).where(eq(posts.id, postId));
    res.json({ liked: true });
  }
});

router.get("/social/posts/:postId/comments", async (req, res): Promise<void> => {
  const postId = parseInt(req.params.postId, 10);
  const comments = await db.query.postComments.findMany({
    where: eq(postComments.postId, postId),
    orderBy: [desc(postComments.createdAt)],
    limit: 50,
  });

  const authorIds = [...new Set(comments.map(c => c.authorId))];
  let authorMap: Record<number, typeof platformUsers.$inferSelect> = {};
  if (authorIds.length > 0) {
    const authors = await db.query.platformUsers.findMany({ where: inArray(platformUsers.id, authorIds) });
    authorMap = Object.fromEntries(authors.map(a => [a.id, a]));
  }

  res.json({ comments: comments.map(c => ({ ...c, author: authorMap[c.authorId] })) });
});

router.post("/social/posts/:postId/comments", async (req, res): Promise<void> => {
  const robloxUserId = req.session.robloxUserId;
  if (!robloxUserId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const cookie = req.session.robloxCookie!;
  const myUser = await getOrCreatePlatformUser(robloxUserId, cookie);
  if (!myUser) { res.status(500).json({ error: "Failed" }); return; }

  const postId = parseInt(req.params.postId, 10);
  const { content } = req.body as { content: string };
  if (!content?.trim()) { res.status(400).json({ error: "Content required" }); return; }

  const [comment] = await db.insert(postComments).values({ postId, authorId: myUser.id, content: content.trim() }).returning();
  await db.update(posts).set({ commentsCount: sql`${posts.commentsCount} + 1` }).where(eq(posts.id, postId));
  res.json({ comment: { ...comment, author: myUser } });
});

router.get("/social/unread-count", async (req, res): Promise<void> => {
  const robloxUserId = req.session.robloxUserId;
  if (!robloxUserId) { res.json({ count: 0, people: 0 }); return; }
  const myUser = await db.query.platformUsers.findFirst({ where: eq(platformUsers.robloxUserId, robloxUserId) });
  if (!myUser) { res.json({ count: 0, people: 0 }); return; }

  const result = await db
    .select({
      count: sql<number>`count(*)`,
      people: sql<number>`count(distinct case when ${dmConversations.user1Id} = ${myUser.id} then ${dmConversations.user2Id} else ${dmConversations.user1Id} end)`,
    })
    .from(dmMessages)
    .innerJoin(dmConversations, eq(dmMessages.conversationId, dmConversations.id))
    .where(
      and(
        or(eq(dmConversations.user1Id, myUser.id), eq(dmConversations.user2Id, myUser.id)),
        eq(dmMessages.isRead, false),
        ne(dmMessages.senderId, myUser.id)
      )
    );
  res.json({ count: Number(result[0]?.count ?? 0), people: Number(result[0]?.people ?? 0) });
});

router.get("/social/messages", async (req, res): Promise<void> => {
  const robloxUserId = req.session.robloxUserId;
  if (!robloxUserId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const myUser = await db.query.platformUsers.findFirst({ where: eq(platformUsers.robloxUserId, robloxUserId) });
  if (!myUser) { res.json({ conversations: [] }); return; }

  const convos = await db.query.dmConversations.findMany({
    where: or(eq(dmConversations.user1Id, myUser.id), eq(dmConversations.user2Id, myUser.id)),
    orderBy: [desc(dmConversations.lastMessageAt)],
  });

  const otherIds = convos.map(c => c.user1Id === myUser.id ? c.user2Id : c.user1Id);
  let otherMap: Record<number, typeof platformUsers.$inferSelect> = {};
  if (otherIds.length > 0) {
    const others = await db.query.platformUsers.findMany({ where: inArray(platformUsers.id, otherIds) });
    refreshStaleAvatars(others);
    otherMap = Object.fromEntries(others.map(u => [u.id, u]));
  }

  const convoIds = convos.map(c => c.id);
  const lastMessages: Record<number, typeof dmMessages.$inferSelect> = {};
  for (const convoId of convoIds) {
    const msgs = await db.query.dmMessages.findMany({
      where: eq(dmMessages.conversationId, convoId),
      orderBy: [desc(dmMessages.createdAt)],
      limit: 1,
    });
    if (msgs[0]) lastMessages[convoId] = msgs[0];
  }

  const unreadCounts: Record<number, number> = {};
  for (const convoId of convoIds) {
    const count = await db.$count(dmMessages, and(eq(dmMessages.conversationId, convoId), eq(dmMessages.isRead, false), ne(dmMessages.senderId, myUser.id)));
    unreadCounts[convoId] = count;
  }

  res.json({
    conversations: convos.map(c => {
      const otherId = c.user1Id === myUser.id ? c.user2Id : c.user1Id;
      return {
        conversation: c,
        otherUser: otherMap[otherId],
        lastMessage: lastMessages[c.id] || null,
        unreadCount: unreadCounts[c.id] || 0,
      };
    }),
  });
});

router.get("/social/messages/:userId", async (req, res): Promise<void> => {
  const robloxUserId = req.session.robloxUserId;
  if (!robloxUserId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const myUser = await db.query.platformUsers.findFirst({ where: eq(platformUsers.robloxUserId, robloxUserId) });
  if (!myUser) { res.status(404).json({ error: "Not found" }); return; }

  const otherUserId = parseInt(req.params.userId, 10);
  const otherUser = await db.query.platformUsers.findFirst({ where: eq(platformUsers.id, otherUserId) });
  if (!otherUser) { res.status(404).json({ error: "User not found" }); return; }

  let convo = await db.query.dmConversations.findFirst({
    where: or(
      and(eq(dmConversations.user1Id, myUser.id), eq(dmConversations.user2Id, otherUserId)),
      and(eq(dmConversations.user1Id, otherUserId), eq(dmConversations.user2Id, myUser.id)),
    ),
  });

  if (!convo) {
    [convo] = await db.insert(dmConversations).values({ user1Id: myUser.id, user2Id: otherUserId }).returning();
  }

  const msgs = await db.query.dmMessages.findMany({
    where: eq(dmMessages.conversationId, convo.id),
    orderBy: [desc(dmMessages.createdAt)],
    limit: 100,
  });

  await db.update(dmMessages).set({ isRead: true }).where(
    and(eq(dmMessages.conversationId, convo.id), eq(dmMessages.isRead, false), ne(dmMessages.senderId, myUser.id))
  );

  res.json({ conversation: convo, messages: msgs.reverse(), otherUser });
});

router.post("/social/messages/:userId", async (req, res): Promise<void> => {
  const robloxUserId = req.session.robloxUserId;
  if (!robloxUserId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const cookie = req.session.robloxCookie!;
  const myUser = await getOrCreatePlatformUser(robloxUserId, cookie);
  if (!myUser) { res.status(500).json({ error: "Failed" }); return; }

  const otherUserId = parseInt(req.params.userId, 10);
  const { content, imageUrl } = req.body as { content: string; imageUrl?: string };
  if (!content?.trim() && !imageUrl) { res.status(400).json({ error: "Content required" }); return; }
  if (imageUrl && !imageUrl.startsWith("[attachments:") && !imageUrl.startsWith("data:")) { res.status(400).json({ error: "Invalid attachment format" }); return; }
  if (imageUrl && imageUrl.length > 10 * 1024 * 1024) { res.status(400).json({ error: "Attachment too large" }); return; }

  let convo = await db.query.dmConversations.findFirst({
    where: or(
      and(eq(dmConversations.user1Id, myUser.id), eq(dmConversations.user2Id, otherUserId)),
      and(eq(dmConversations.user1Id, otherUserId), eq(dmConversations.user2Id, myUser.id)),
    ),
  });

  if (!convo) {
    [convo] = await db.insert(dmConversations).values({ user1Id: myUser.id, user2Id: otherUserId }).returning();
  }

  const now = new Date();
  await db.update(dmConversations).set({ lastMessageAt: now }).where(eq(dmConversations.id, convo.id));

  const [msg] = await db.insert(dmMessages).values({
    conversationId: convo.id,
    senderId: myUser.id,
    content: (content || "").trim(),
    ...(imageUrl ? { imageUrl } : {}),
  }).returning();

  res.json({ message: msg });
});

router.delete("/social/messages/:msgId", async (req, res): Promise<void> => {
  const robloxUserId = req.session.robloxUserId;
  if (!robloxUserId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const cookie = req.session.robloxCookie!;
  const myUser = await getOrCreatePlatformUser(robloxUserId, cookie);
  if (!myUser) { res.status(500).json({ error: "Failed" }); return; }

  const msgId = parseInt(req.params.msgId, 10);
  if (isNaN(msgId)) { res.status(400).json({ error: "Invalid message ID" }); return; }

  const msg = await db.query.dmMessages.findFirst({ where: eq(dmMessages.id, msgId) });
  if (!msg) { res.status(404).json({ error: "Message not found" }); return; }
  if (msg.senderId !== myUser.id) { res.status(403).json({ error: "Can only delete your own messages" }); return; }

  await db.update(dmMessages).set({ isDeleted: true }).where(eq(dmMessages.id, msgId));
  res.json({ ok: true });
});

export default router;
