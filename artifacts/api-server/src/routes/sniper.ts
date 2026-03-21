import { Router, type IRouter } from "express";

const router: IRouter = Router();

const ROBLOX_CATALOG_API = "https://catalog.roblox.com";
const ROBLOX_ECONOMY_API = "https://economy.roblox.com";

interface LimitedItem {
  id: number;
  name: string;
  price: number | null;
  lowestResalePrice: number | null;
  favoriteCount: number;
  creatorName: string;
  collectibleItemId: string | null;
  assetType: number;
  premium?: number;
  potentialProfit?: number;
}

let cachedItems: LimitedItem[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function fetchLimitedItems(): Promise<LimitedItem[]> {
  if (cachedItems && Date.now() - cacheTime < CACHE_TTL) {
    return cachedItems;
  }

  const allItems: LimitedItem[] = [];
  let cursor: string | null = null;
  let pages = 0;

  while (pages < 5) {
    const url = new URL(`${ROBLOX_CATALOG_API}/v1/search/items/details`);
    url.searchParams.set("Category", "2");
    url.searchParams.set("Subcategory", "2");
    url.searchParams.set("SortType", "2");
    url.searchParams.set("SortAggregation", "5");
    url.searchParams.set("Limit", "30");
    if (cursor) url.searchParams.set("Cursor", cursor);

    const resp = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });

    if (!resp.ok) {
      if (resp.status === 429) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      break;
    }

    const data = await resp.json() as {
      nextPageCursor: string | null;
      data: Array<{
        id: number;
        name: string;
        price: number | null;
        lowestPrice: number | null;
        lowestResalePrice: number | null;
        favoriteCount: number;
        creatorName: string;
        creatorType: string;
        collectibleItemId: string | null;
        assetType: number;
        totalQuantity: number;
        unitsAvailableForConsumption: number;
      }>;
    };

    if (data.data) {
      for (const item of data.data) {
        allItems.push({
          id: item.id,
          name: item.name,
          price: item.price ?? item.lowestPrice,
          lowestResalePrice: item.lowestResalePrice,
          favoriteCount: item.favoriteCount || 0,
          creatorName: item.creatorName || "Unknown",
          collectibleItemId: item.collectibleItemId,
          assetType: item.assetType,
        });
      }
    }

    cursor = data.nextPageCursor;
    if (!cursor) break;
    pages++;
    await new Promise(r => setTimeout(r, 500));
  }

  if (allItems.length > 0) {
    cachedItems = allItems;
    cacheTime = Date.now();
  }

  return allItems;
}

router.get("/sniper/items", async (_req, res): Promise<void> => {
  try {
    const allItems = await fetchLimitedItems();

    const items = allItems
      .filter(i => (i.price ?? 0) > 0 || (i.lowestResalePrice ?? 0) > 0)
      .sort((a, b) => (b.favoriteCount || 0) - (a.favoriteCount || 0))
      .slice(0, 200);

    res.json({ items, total: allItems.length });
  } catch (err) {
    console.error("[Sniper] Fetch error:", err);
    res.status(502).json({ error: "Failed to fetch limited items data." });
  }
});

router.get("/sniper/deals", async (req, res): Promise<void> => {
  try {
    const allItems = await fetchLimitedItems();
    const maxPrice = parseInt(String(req.query.maxPrice || "50000"), 10);
    const minFavorites = parseInt(String(req.query.minFavorites || "0"), 10);

    const deals = allItems
      .filter(i => {
        const price = i.price ?? i.lowestResalePrice ?? 0;
        if (price <= 0 || price > maxPrice) return false;
        if (i.favoriteCount < minFavorites) return false;
        if (i.lowestResalePrice && i.price && i.lowestResalePrice < i.price) {
          return true;
        }
        return i.favoriteCount > 100;
      })
      .sort((a, b) => {
        const aResale = a.lowestResalePrice ?? a.price ?? 0;
        const aPrice = a.price ?? 0;
        const bResale = b.lowestResalePrice ?? b.price ?? 0;
        const bPrice = b.price ?? 0;
        const aDiscount = aPrice > 0 && aResale > 0 ? (aPrice - aResale) / aPrice : 0;
        const bDiscount = bPrice > 0 && bResale > 0 ? (bPrice - bResale) / bPrice : 0;
        return bDiscount - aDiscount;
      })
      .slice(0, 50)
      .map(i => {
        const resale = i.lowestResalePrice ?? i.price ?? 0;
        const price = i.price ?? 0;
        return {
          ...i,
          discount: price > 0 && resale > 0 && resale < price ? Math.round((1 - resale / price) * 100) : 0,
          resalePrice: resale,
        };
      });

    res.json({ deals, total: deals.length });
  } catch (err) {
    console.error("[Sniper] Deals error:", err);
    res.status(502).json({ error: "Failed to find deals." });
  }
});

export default router;
