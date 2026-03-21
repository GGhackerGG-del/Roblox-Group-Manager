import { Router, type IRouter } from "express";

const router: IRouter = Router();

const ROBLOX_GROUPS_API = "https://groups.roblox.com";
const ROBLOX_CATALOG_API = "https://catalog.roblox.com";
const ROBLOX_THUMBNAILS_API = "https://thumbnails.roblox.com";

async function fetchRoblox(url: string, cookie: string): Promise<Response> {
  return fetch(url, {
    redirect: "follow",
    headers: {
      Cookie: `.ROBLOSECURITY=${cookie}`,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Accept: "application/json",
    },
  });
}

router.get("/competitor/analyze/:groupId", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  if (!cookie) {
    res.status(401).json({ error: "No active Roblox session." });
    return;
  }

  const rawId = Array.isArray(req.params.groupId) ? req.params.groupId[0] : req.params.groupId;
  const groupId = parseInt(rawId, 10);
  if (isNaN(groupId)) {
    res.status(400).json({ error: "Invalid group ID." });
    return;
  }

  try {
    const [groupResp, thumbResp] = await Promise.allSettled([
      fetch(`${ROBLOX_GROUPS_API}/v1/groups/${groupId}`),
      fetch(`${ROBLOX_THUMBNAILS_API}/v1/groups/icons?groupIds=${groupId}&size=150x150&format=Png&isCircular=false`),
    ]);

    if (groupResp.status !== "fulfilled" || !groupResp.value.ok) {
      res.status(404).json({ error: "Group not found." });
      return;
    }

    const groupData = await groupResp.value.json() as {
      id: number; name: string; description: string;
      memberCount: number; owner?: { userId: number; username: string; displayName: string };
      created: string; publicEntryAllowed: boolean;
    };

    let thumbnailUrl: string | null = null;
    if (thumbResp.status === "fulfilled" && thumbResp.value.ok) {
      const d = await thumbResp.value.json() as { data: Array<{ imageUrl: string }> };
      thumbnailUrl = d.data?.[0]?.imageUrl || null;
    }

    const clothingResp = await fetchRoblox(
      `${ROBLOX_CATALOG_API}/v1/search/items?category=3&creatorType=2&creatorTargetId=${groupId}&limit=60&sortType=3`,
      cookie
    );

    let totalClothing = 0;
    let avgPrice = 0;
    let topItems: Array<{ id: number; name: string; price: number | null }> = [];

    if (clothingResp.ok) {
      const data = await clothingResp.json() as {
        data: Array<{ id: number; name: string; price: number | null; favoriteCount?: number }>;
      };
      const items = data.data || [];
      totalClothing = items.length;

      const priced = items.filter(i => i.price != null && i.price > 0);
      avgPrice = priced.length > 0
        ? Math.round(priced.reduce((s, i) => s + (i.price || 0), 0) / priced.length)
        : 0;

      topItems = items
        .sort((a, b) => (b.favoriteCount || 0) - (a.favoriteCount || 0))
        .slice(0, 10)
        .map(i => ({ id: i.id, name: i.name, price: i.price }));
    }

    res.json({
      group: {
        id: groupData.id,
        name: groupData.name,
        description: groupData.description,
        memberCount: groupData.memberCount,
        owner: groupData.owner,
        created: groupData.created,
        publicEntryAllowed: groupData.publicEntryAllowed,
        thumbnailUrl,
      },
      clothing: {
        totalCount: totalClothing,
        averagePrice: avgPrice,
        topItems,
      },
    });
  } catch (err) {
    console.error("[Competitor] Analysis error:", err);
    res.status(500).json({ error: "Failed to analyze competitor." });
  }
});

export default router;
