import { Router, type IRouter } from "express";
import { db, featuredGroups } from "@workspace/db";
import { desc, gte, eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/featured-groups", async (_req, res): Promise<void> => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const groups = await db
    .select({
      groupId: featuredGroups.groupId,
      name: featuredGroups.name,
      memberCount: featuredGroups.memberCount,
      thumbnailUrl: featuredGroups.thumbnailUrl,
      lastActiveAt: featuredGroups.lastActiveAt,
    })
    .from(featuredGroups)
    .where(gte(featuredGroups.lastActiveAt, thirtyDaysAgo))
    .orderBy(desc(featuredGroups.lastActiveAt))
    .limit(12);

  res.json({ groups });
});

router.get("/featured-groups/:groupId", async (req, res): Promise<void> => {
  const groupId = parseInt(req.params.groupId, 10);
  if (isNaN(groupId)) { res.status(400).json({ error: "Invalid group ID" }); return; }

  const [dbGroup] = await db
    .select()
    .from(featuredGroups)
    .where(eq(featuredGroups.groupId, groupId))
    .limit(1);

  if (!dbGroup) { res.status(404).json({ error: "Group not found" }); return; }

  try {
    const [groupResp, ownerResp] = await Promise.all([
      fetch(`https://groups.roblox.com/v1/groups/${groupId}`),
      dbGroup.ownerUserId
        ? fetch(`https://users.roblox.com/v1/users/${dbGroup.ownerUserId}`)
        : Promise.resolve(null),
    ]);

    const groupData = groupResp.ok ? await groupResp.json() as Record<string, unknown> : null;
    const ownerData = ownerResp && ownerResp.ok ? await ownerResp.json() as Record<string, unknown> : null;

    let ownerAvatar: string | null = null;
    if (dbGroup.ownerUserId) {
      try {
        const avatarResp = await fetch(
          `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${dbGroup.ownerUserId}&size=150x150&format=Png`
        );
        if (avatarResp.ok) {
          const avatarData = await avatarResp.json() as { data?: { imageUrl?: string }[] };
          ownerAvatar = avatarData.data?.[0]?.imageUrl || null;
        }
      } catch {}
    }

    res.json({
      groupId: dbGroup.groupId,
      name: dbGroup.name,
      memberCount: dbGroup.memberCount,
      thumbnailUrl: dbGroup.thumbnailUrl,
      lastActiveAt: dbGroup.lastActiveAt,
      description: (groupData as Record<string, unknown>)?.description || "",
      owner: ownerData ? {
        id: dbGroup.ownerUserId,
        name: (ownerData as Record<string, unknown>).name || "Unknown",
        displayName: (ownerData as Record<string, unknown>).displayName || (ownerData as Record<string, unknown>).name || "Unknown",
        avatar: ownerAvatar,
      } : null,
      created: (groupData as Record<string, unknown>)?.created || null,
      publicEntryAllowed: (groupData as Record<string, unknown>)?.publicEntryAllowed ?? null,
    });
  } catch {
    res.json({
      groupId: dbGroup.groupId,
      name: dbGroup.name,
      memberCount: dbGroup.memberCount,
      thumbnailUrl: dbGroup.thumbnailUrl,
      lastActiveAt: dbGroup.lastActiveAt,
      description: "",
      owner: null,
      created: null,
      publicEntryAllowed: null,
    });
  }
});

export default router;
