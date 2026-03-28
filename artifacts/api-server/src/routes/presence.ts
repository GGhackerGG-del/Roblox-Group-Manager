import { Router, type IRouter } from "express";
import { getOnlineUsers, getOnlineUserIds, getLastSeenForUsers } from "../signaling.js";

const router: IRouter = Router();

router.get("/presence/online", (_req, res): void => {
  const users = getOnlineUsers();
  res.json({ users, count: users.length });
});

router.post("/presence/status", async (req, res): Promise<void> => {
  const { userIds } = req.body as { userIds?: number[] };
  if (!Array.isArray(userIds) || userIds.length === 0) {
    res.status(400).json({ error: "userIds array required" });
    return;
  }
  const capped = userIds.slice(0, 100);
  const onlineSet = new Set(getOnlineUserIds());
  const lastSeenMap = await getLastSeenForUsers(capped.filter(id => !onlineSet.has(id)));
  const statuses: Record<number, { online: boolean; lastSeen: string | null }> = {};
  for (const id of capped) {
    if (onlineSet.has(id)) {
      statuses[id] = { online: true, lastSeen: null };
    } else {
      const ls = lastSeenMap.get(id);
      statuses[id] = { online: false, lastSeen: ls ? ls.toISOString() : null };
    }
  }
  res.json({ statuses });
});

export default router;
