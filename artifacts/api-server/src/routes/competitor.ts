import { Router, type IRouter } from "express";

const router: IRouter = Router();

const ROBLOX_GROUPS_API = "https://groups.roblox.com";
const ROBLOX_CATALOG_API = "https://catalog.roblox.com";
const ROBLOX_THUMBNAILS_API = "https://thumbnails.roblox.com";

interface CatalogItem {
  id: number;
  name: string;
  description: string;
  price: number | null;
  lowestPrice: number | null;
  favoriteCount: number;
  assetType: number;
  creatorName: string;
  itemType: string;
}

router.get("/competitor/analyze/:groupId", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.groupId) ? req.params.groupId[0] : req.params.groupId;
  const groupId = parseInt(rawId, 10);
  if (isNaN(groupId)) {
    res.status(400).json({ error: "Invalid group ID." });
    return;
  }

  try {
    const [groupResp, thumbResp] = await Promise.allSettled([
      fetch(`${ROBLOX_GROUPS_API}/v1/groups/${groupId}`, {
        headers: { Accept: "application/json" },
      }),
      fetch(`${ROBLOX_THUMBNAILS_API}/v1/groups/icons?groupIds=${groupId}&size=150x150&format=Png&isCircular=false`, {
        headers: { Accept: "application/json" },
      }),
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

    const allItems: CatalogItem[] = [];
    let cursor: string | null = null;
    let pages = 0;

    while (pages < 3) {
      const url = new URL(`${ROBLOX_CATALOG_API}/v1/search/items/details`);
      url.searchParams.set("Category", "3");
      url.searchParams.set("CreatorType", "Group");
      url.searchParams.set("CreatorTargetId", String(groupId));
      url.searchParams.set("Limit", "30");
      url.searchParams.set("SortType", "3");
      if (cursor) url.searchParams.set("Cursor", cursor);

      const catalogResp = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
      });

      if (!catalogResp.ok) break;

      const catalogData = await catalogResp.json() as {
        nextPageCursor: string | null;
        data: CatalogItem[];
      };

      if (catalogData.data) {
        allItems.push(...catalogData.data);
      }

      cursor = catalogData.nextPageCursor;
      if (!cursor) break;
      pages++;
    }

    const totalClothing = allItems.length;
    const priced = allItems.filter(i => (i.price ?? i.lowestPrice ?? 0) > 0);
    const avgPrice = priced.length > 0
      ? Math.round(priced.reduce((s, i) => s + (i.price ?? i.lowestPrice ?? 0), 0) / priced.length)
      : 0;

    const topItems = allItems
      .sort((a, b) => (b.favoriteCount || 0) - (a.favoriteCount || 0))
      .slice(0, 15)
      .map(i => ({
        id: i.id,
        name: i.name,
        price: i.price ?? i.lowestPrice,
        favorites: i.favoriteCount || 0,
        type: i.assetType === 11 ? "Shirt" : i.assetType === 12 ? "Pants" : i.assetType === 2 ? "T-Shirt" : "Other",
      }));

    const shirts = allItems.filter(i => i.assetType === 11).length;
    const pants = allItems.filter(i => i.assetType === 12).length;
    const tshirts = allItems.filter(i => i.assetType === 2).length;

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
        shirts,
        pants,
        tshirts,
        topItems,
      },
    });
  } catch (err) {
    console.error("[Competitor] Analysis error:", err);
    res.status(500).json({ error: "Failed to analyze competitor." });
  }
});

export default router;
