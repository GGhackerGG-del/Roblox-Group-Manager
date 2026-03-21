import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { forumTopics, forumReplies, topicVotes, groupSubscriptions, platformUsers, posts, postComments } from "@workspace/db";
import { eq, and, desc, sql, inArray, count } from "drizzle-orm";

const router: IRouter = Router();

async function getMyUser(req: any) {
  const robloxUserId = req.session.robloxUserId;
  if (!robloxUserId) return null;
  return db.query.platformUsers.findFirst({ where: eq(platformUsers.robloxUserId, robloxUserId) });
}

router.get("/forum/topics", async (req, res): Promise<void> => {
  const category = String(req.query.category || "suggestions");
  const page = parseInt(String(req.query.page || "1"), 10);
  const limit = 20;
  const offset = (page - 1) * limit;

  const topics = await db.query.forumTopics.findMany({
    where: eq(forumTopics.category, category),
    orderBy: [desc(forumTopics.isPinned), desc(forumTopics.lastActivityAt)],
    limit,
    offset,
  });

  const authorIds = [...new Set(topics.map(t => t.authorId))];
  let authorMap: Record<number, typeof platformUsers.$inferSelect> = {};
  if (authorIds.length > 0) {
    const authors = await db.query.platformUsers.findMany({ where: inArray(platformUsers.id, authorIds) });
    authorMap = Object.fromEntries(authors.map(a => [a.id, a]));
  }

  const myUser = await getMyUser(req);
  let myVotes: Record<number, number> = {};
  if (myUser && topics.length > 0) {
    const votes = await db.query.topicVotes.findMany({
      where: and(eq(topicVotes.userId, myUser.id), inArray(topicVotes.topicId, topics.map(t => t.id))),
    });
    myVotes = Object.fromEntries(votes.map(v => [v.topicId, v.value]));
  }

  res.json({
    topics: topics.map(t => ({ ...t, author: authorMap[t.authorId], myVote: myVotes[t.id] || 0 })),
    page,
    hasMore: topics.length === limit,
  });
});

router.get("/forum/topics/:topicId", async (req, res): Promise<void> => {
  const topicId = parseInt(req.params.topicId, 10);
  const topic = await db.query.forumTopics.findFirst({ where: eq(forumTopics.id, topicId) });
  if (!topic) { res.status(404).json({ error: "Topic not found" }); return; }

  const author = await db.query.platformUsers.findFirst({ where: eq(platformUsers.id, topic.authorId) });

  const replies = await db.query.forumReplies.findMany({
    where: eq(forumReplies.topicId, topicId),
    orderBy: [desc(forumReplies.isAnswer), desc(forumReplies.createdAt)],
    limit: 100,
  });

  const replyAuthorIds = [...new Set(replies.map(r => r.authorId))];
  let replyAuthorMap: Record<number, typeof platformUsers.$inferSelect> = {};
  if (replyAuthorIds.length > 0) {
    const authors = await db.query.platformUsers.findMany({ where: inArray(platformUsers.id, replyAuthorIds) });
    replyAuthorMap = Object.fromEntries(authors.map(a => [a.id, a]));
  }

  const myUser = await getMyUser(req);
  let myVote = 0;
  if (myUser) {
    const vote = await db.query.topicVotes.findFirst({
      where: and(eq(topicVotes.topicId, topicId), eq(topicVotes.userId, myUser.id)),
    });
    if (vote) myVote = vote.value;
  }

  res.json({
    topic: { ...topic, author, myVote },
    replies: replies.map(r => ({ ...r, author: replyAuthorMap[r.authorId] })),
  });
});

router.post("/forum/topics", async (req, res): Promise<void> => {
  const myUser = await getMyUser(req);
  if (!myUser) { res.status(401).json({ error: "Not authenticated" }); return; }

  const { title, content, category } = req.body as { title: string; content: string; category: string };
  if (!title?.trim() || !content?.trim()) { res.status(400).json({ error: "Title and content required" }); return; }

  const validCategories = ["suggestions", "offtopic", "qa"];
  const cat = validCategories.includes(category) ? category : "suggestions";

  const [topic] = await db.insert(forumTopics).values({
    authorId: myUser.id,
    title: title.trim(),
    content: content.trim(),
    category: cat,
  }).returning();

  res.json({ topic: { ...topic, author: myUser, myVote: 0 } });
});

router.delete("/forum/topics/:topicId", async (req, res): Promise<void> => {
  const myUser = await getMyUser(req);
  if (!myUser) { res.status(401).json({ error: "Not authenticated" }); return; }

  const topicId = parseInt(req.params.topicId, 10);
  const topic = await db.query.forumTopics.findFirst({ where: eq(forumTopics.id, topicId) });
  if (!topic || topic.authorId !== myUser.id) { res.status(403).json({ error: "Not authorized" }); return; }

  await db.delete(forumTopics).where(eq(forumTopics.id, topicId));
  res.json({ success: true });
});

router.post("/forum/topics/:topicId/vote", async (req, res): Promise<void> => {
  const myUser = await getMyUser(req);
  if (!myUser) { res.status(401).json({ error: "Not authenticated" }); return; }

  const topicId = parseInt(req.params.topicId, 10);
  const { value } = req.body as { value: number };
  const v = value === 1 ? 1 : value === -1 ? -1 : 0;

  const existing = await db.query.topicVotes.findFirst({
    where: and(eq(topicVotes.topicId, topicId), eq(topicVotes.userId, myUser.id)),
  });

  if (existing) {
    if (v === 0) {
      await db.delete(topicVotes).where(eq(topicVotes.id, existing.id));
      if (existing.value === 1) await db.update(forumTopics).set({ votesUp: sql`${forumTopics.votesUp} - 1` }).where(eq(forumTopics.id, topicId));
      else await db.update(forumTopics).set({ votesDown: sql`${forumTopics.votesDown} - 1` }).where(eq(forumTopics.id, topicId));
    } else if (existing.value !== v) {
      await db.update(topicVotes).set({ value: v }).where(eq(topicVotes.id, existing.id));
      if (v === 1) {
        await db.update(forumTopics).set({ votesUp: sql`${forumTopics.votesUp} + 1`, votesDown: sql`${forumTopics.votesDown} - 1` }).where(eq(forumTopics.id, topicId));
      } else {
        await db.update(forumTopics).set({ votesUp: sql`${forumTopics.votesUp} - 1`, votesDown: sql`${forumTopics.votesDown} + 1` }).where(eq(forumTopics.id, topicId));
      }
    }
  } else if (v !== 0) {
    await db.insert(topicVotes).values({ topicId, userId: myUser.id, value: v });
    if (v === 1) await db.update(forumTopics).set({ votesUp: sql`${forumTopics.votesUp} + 1` }).where(eq(forumTopics.id, topicId));
    else await db.update(forumTopics).set({ votesDown: sql`${forumTopics.votesDown} + 1` }).where(eq(forumTopics.id, topicId));
  }

  const updated = await db.query.forumTopics.findFirst({ where: eq(forumTopics.id, topicId) });
  res.json({ votesUp: updated?.votesUp ?? 0, votesDown: updated?.votesDown ?? 0, myVote: v });
});

router.post("/forum/topics/:topicId/replies", async (req, res): Promise<void> => {
  const myUser = await getMyUser(req);
  if (!myUser) { res.status(401).json({ error: "Not authenticated" }); return; }

  const topicId = parseInt(req.params.topicId, 10);
  const topic = await db.query.forumTopics.findFirst({ where: eq(forumTopics.id, topicId) });
  if (!topic) { res.status(404).json({ error: "Topic not found" }); return; }
  if (topic.isClosed) { res.status(403).json({ error: "Topic is closed" }); return; }

  const { content } = req.body as { content: string };
  if (!content?.trim()) { res.status(400).json({ error: "Content required" }); return; }

  const [reply] = await db.insert(forumReplies).values({
    topicId,
    authorId: myUser.id,
    content: content.trim(),
  }).returning();

  await db.update(forumTopics).set({
    repliesCount: sql`${forumTopics.repliesCount} + 1`,
    lastActivityAt: new Date(),
  }).where(eq(forumTopics.id, topicId));

  res.json({ reply: { ...reply, author: myUser } });
});

router.post("/forum/topics/:topicId/replies/:replyId/answer", async (req, res): Promise<void> => {
  const myUser = await getMyUser(req);
  if (!myUser) { res.status(401).json({ error: "Not authenticated" }); return; }

  const topicId = parseInt(req.params.topicId, 10);
  const replyId = parseInt(req.params.replyId, 10);

  const topic = await db.query.forumTopics.findFirst({ where: eq(forumTopics.id, topicId) });
  if (!topic || topic.authorId !== myUser.id) { res.status(403).json({ error: "Only topic author can mark answers" }); return; }

  await db.update(forumReplies).set({ isAnswer: false }).where(eq(forumReplies.topicId, topicId));
  await db.update(forumReplies).set({ isAnswer: true }).where(and(eq(forumReplies.id, replyId), eq(forumReplies.topicId, topicId)));

  res.json({ success: true });
});

router.get("/forum/leaderboard", async (req, res): Promise<void> => {
  const topPosters = await db
    .select({
      userId: posts.authorId,
      postCount: count(posts.id),
    })
    .from(posts)
    .groupBy(posts.authorId)
    .orderBy(desc(count(posts.id)))
    .limit(20);

  const topHelpers = await db
    .select({
      userId: forumReplies.authorId,
      replyCount: count(forumReplies.id),
    })
    .from(forumReplies)
    .groupBy(forumReplies.authorId)
    .orderBy(desc(count(forumReplies.id)))
    .limit(20);

  const topContributors = await db
    .select({
      userId: forumTopics.authorId,
      topicCount: count(forumTopics.id),
    })
    .from(forumTopics)
    .where(eq(forumTopics.category, "suggestions"))
    .groupBy(forumTopics.authorId)
    .orderBy(desc(count(forumTopics.id)))
    .limit(20);

  const allIds = [...new Set([
    ...topPosters.map(p => p.userId),
    ...topHelpers.map(h => h.userId),
    ...topContributors.map(c => c.userId),
  ])];

  let userMap: Record<number, typeof platformUsers.$inferSelect> = {};
  if (allIds.length > 0) {
    const users = await db.query.platformUsers.findMany({ where: inArray(platformUsers.id, allIds) });
    userMap = Object.fromEntries(users.map(u => [u.id, u]));
  }

  res.json({
    topPosters: topPosters.map(p => ({ user: userMap[p.userId], count: Number(p.postCount) })),
    topHelpers: topHelpers.map(h => ({ user: userMap[h.userId], count: Number(h.replyCount) })),
    topContributors: topContributors.map(c => ({ user: userMap[c.userId], count: Number(c.topicCount) })),
  });
});

router.get("/forum/subscriptions", async (req, res): Promise<void> => {
  const myUser = await getMyUser(req);
  if (!myUser) { res.status(401).json({ error: "Not authenticated" }); return; }

  const subs = await db.query.groupSubscriptions.findMany({
    where: eq(groupSubscriptions.userId, myUser.id),
    orderBy: [desc(groupSubscriptions.createdAt)],
  });

  res.json({ subscriptions: subs });
});

router.post("/forum/subscriptions", async (req, res): Promise<void> => {
  const myUser = await getMyUser(req);
  if (!myUser) { res.status(401).json({ error: "Not authenticated" }); return; }

  const { robloxGroupId, groupName, groupThumbnailUrl } = req.body as {
    robloxGroupId: number;
    groupName: string;
    groupThumbnailUrl?: string;
  };
  if (!robloxGroupId || !groupName) { res.status(400).json({ error: "Group ID and name required" }); return; }

  const existing = await db.query.groupSubscriptions.findFirst({
    where: and(eq(groupSubscriptions.userId, myUser.id), eq(groupSubscriptions.robloxGroupId, robloxGroupId)),
  });
  if (existing) { res.status(409).json({ error: "Already subscribed" }); return; }

  const [sub] = await db.insert(groupSubscriptions).values({
    userId: myUser.id,
    robloxGroupId,
    groupName,
    groupThumbnailUrl: groupThumbnailUrl || null,
  }).returning();

  res.json({ subscription: sub });
});

router.delete("/forum/subscriptions/:subId", async (req, res): Promise<void> => {
  const myUser = await getMyUser(req);
  if (!myUser) { res.status(401).json({ error: "Not authenticated" }); return; }

  const subId = parseInt(req.params.subId, 10);
  const sub = await db.query.groupSubscriptions.findFirst({ where: eq(groupSubscriptions.id, subId) });
  if (!sub || sub.userId !== myUser.id) { res.status(403).json({ error: "Not authorized" }); return; }

  await db.delete(groupSubscriptions).where(eq(groupSubscriptions.id, subId));
  res.json({ success: true });
});

router.get("/forum/subscriptions/check/:groupId", async (req, res): Promise<void> => {
  const myUser = await getMyUser(req);
  if (!myUser) { res.json({ subscribed: false }); return; }

  const groupId = parseInt(req.params.groupId, 10);
  const sub = await db.query.groupSubscriptions.findFirst({
    where: and(eq(groupSubscriptions.userId, myUser.id), eq(groupSubscriptions.robloxGroupId, groupId)),
  });

  res.json({ subscribed: !!sub, subscription: sub || null });
});

export default router;
