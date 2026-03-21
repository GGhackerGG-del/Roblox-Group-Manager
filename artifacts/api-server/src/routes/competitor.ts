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

async function batchFetchThumbnails(ids: number[]): Promise<Record<number, string | null>> {
  const map: Record<number, string | null> = {};
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    try {
      const resp = await fetch(
        `${ROBLOX_THUMBNAILS_API}/v1/assets?assetIds=${batch.join(",")}&size=150x150&format=Png&isCircular=false`
      );
      if (resp.ok) {
        const data = await resp.json() as { data: Array<{ targetId: number; imageUrl: string }> };
        for (const t of data.data || []) {
          map[t.targetId] = t.imageUrl || null;
        }
      }
    } catch {}
    if (i + 100 < ids.length) await new Promise(r => setTimeout(r, 200));
  }
  return map;
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
    const MAX_PAGES = 50;
    let retryCount = 0;
    const MAX_RETRIES = 5;

    while (pages < MAX_PAGES) {
      const url = new URL(`${ROBLOX_CATALOG_API}/v1/search/items`);
      url.searchParams.set("category", "3");
      url.searchParams.set("creatorType", "2");
      url.searchParams.set("creatorTargetId", String(groupId));
      url.searchParams.set("limit", "30");
      url.searchParams.set("sortType", "3");
      if (cursor) url.searchParams.set("cursor", cursor);

      const catalogResp = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
      });

      if (!catalogResp.ok) {
        if (catalogResp.status === 429 && retryCount < MAX_RETRIES) {
          retryCount++;
          await new Promise(r => setTimeout(r, 2000 * retryCount));
          continue;
        }
        break;
      }
      retryCount = 0;

      const catalogData = await catalogResp.json() as {
        nextPageCursor: string | null;
        data: CatalogItem[];
      };

      if (catalogData.data) {
        const items = catalogData.data.filter(i =>
          !i.assetType || i.assetType === 2 || i.assetType === 11 || i.assetType === 12
        );
        allItems.push(...items);
      }

      cursor = catalogData.nextPageCursor;
      if (!cursor) break;
      pages++;
      await new Promise(r => setTimeout(r, 300));
    }

    console.log(`[Competitor] Group ${groupId}: ${allItems.length} items across ${pages + 1} pages`);

    const totalClothing = allItems.length;
    const prices = allItems.map(i => i.price ?? i.lowestPrice ?? 0);
    const pricedItems = allItems.filter(i => (i.price ?? i.lowestPrice ?? 0) > 0);
    const freeItems = allItems.filter(i => (i.price ?? i.lowestPrice ?? 0) === 0);

    const avgPrice = pricedItems.length > 0
      ? Math.round(pricedItems.reduce((s, i) => s + (i.price ?? i.lowestPrice ?? 0), 0) / pricedItems.length)
      : 0;

    const sortedPrices = prices.filter(p => p > 0).sort((a, b) => a - b);
    const medianPrice = sortedPrices.length > 0
      ? sortedPrices[Math.floor(sortedPrices.length / 2)]
      : 0;
    const minPrice = sortedPrices.length > 0 ? sortedPrices[0] : 0;
    const maxPrice = sortedPrices.length > 0 ? sortedPrices[sortedPrices.length - 1] : 0;

    const shirts = allItems.filter(i => i.assetType === 11).length;
    const pants = allItems.filter(i => i.assetType === 12).length;
    const tshirts = allItems.filter(i => i.assetType === 2).length;

    const totalFavorites = allItems.reduce((s, i) => s + (i.favoriteCount || 0), 0);
    const avgFavorites = totalClothing > 0 ? Math.round(totalFavorites / totalClothing) : 0;

    const priceRanges = {
      free: freeItems.length,
      under10: pricedItems.filter(i => (i.price ?? i.lowestPrice ?? 0) < 10).length,
      r10to50: pricedItems.filter(i => { const p = i.price ?? i.lowestPrice ?? 0; return p >= 10 && p <= 50; }).length,
      r51to100: pricedItems.filter(i => { const p = i.price ?? i.lowestPrice ?? 0; return p > 50 && p <= 100; }).length,
      r101to500: pricedItems.filter(i => { const p = i.price ?? i.lowestPrice ?? 0; return p > 100 && p <= 500; }).length,
      over500: pricedItems.filter(i => (i.price ?? i.lowestPrice ?? 0) > 500).length,
    };

    const thumbIds = allItems.map(i => i.id);
    const thumbMap = await batchFetchThumbnails(thumbIds);

    const clothingItems = allItems
      .sort((a, b) => (b.favoriteCount || 0) - (a.favoriteCount || 0))
      .map(i => ({
        id: i.id,
        name: i.name,
        price: i.price ?? i.lowestPrice,
        favorites: i.favoriteCount || 0,
        type: i.assetType === 11 ? "Shirt" : i.assetType === 12 ? "Pants" : i.assetType === 2 ? "T-Shirt" : "Other",
        thumbnailUrl: thumbMap[i.id] || null,
      }));

    const truncated = pages >= MAX_PAGES - 1 && cursor !== null;

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
        medianPrice,
        minPrice,
        maxPrice,
        shirts,
        pants,
        tshirts,
        paidCount: pricedItems.length,
        freeCount: freeItems.length,
        totalFavorites,
        avgFavorites,
        priceRanges,
        topItems: clothingItems.slice(0, 15),
        allItems: clothingItems,
        truncated,
        pagesFetched: pages + 1,
      },
    });
  } catch (err) {
    console.error("[Competitor] Analysis error:", err);
    res.status(500).json({ error: "Failed to analyze competitor." });
  }
});

export default router;
