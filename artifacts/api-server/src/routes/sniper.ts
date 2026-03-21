import { Router, type IRouter } from "express";

const router: IRouter = Router();

const ROLIMONS_API = "https://www.rolimons.com/itemapi/itemdetails";
const ROLIMONS_DEALS_API = "https://www.rolimons.com/dealapi/dealitems";
const ROBLOX_THUMBNAILS_API = "https://thumbnails.roblox.com";

interface RolimonsItem {
  id: number;
  name: string;
  acronym: string;
  rap: number;
  value: number;
  defaultValue: number;
  demand: number;
  trend: number;
  projected: number;
  hyped: number;
  rare: number;
}

let cachedItems: RolimonsItem[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 3 * 60 * 1000;

async function fetchRolimonsItems(): Promise<RolimonsItem[]> {
  if (cachedItems && Date.now() - cacheTime < CACHE_TTL) {
    return cachedItems;
  }

  console.log("[Sniper] Fetching from Rolimons...");
  const resp = await fetch(ROLIMONS_API, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "application/json",
      "Referer": "https://www.rolimons.com/",
    },
  });

  if (!resp.ok) {
    console.error("[Sniper] Rolimons API error:", resp.status);
    throw new Error(`Rolimons API returned ${resp.status}`);
  }

  const data = await resp.json() as {
    success: boolean;
    item_count: number;
    items: Record<string, [
      string,  // 0: name
      string,  // 1: acronym
      number,  // 2: rap
      number,  // 3: value
      number,  // 4: default value
      number,  // 5: demand (-1=terrible, 0=low, 1=normal, 2=high, 3=amazing)
      number,  // 6: trend (-1=lowering, 0=unstable, 1=stable, 2=raising, 3=fluctuating)
      number,  // 7: projected (0=no, 1=yes)
      number,  // 8: hyped (0=no, 1=yes)
      number,  // 9: rare (0=no, 1=yes)
    ]>;
  };

  if (!data.success || !data.items) {
    throw new Error("Rolimons returned invalid data");
  }

  const items: RolimonsItem[] = [];
  for (const [idStr, arr] of Object.entries(data.items)) {
    items.push({
      id: parseInt(idStr, 10),
      name: arr[0],
      acronym: arr[1],
      rap: arr[2],
      value: arr[3],
      defaultValue: arr[4],
      demand: arr[5],
      trend: arr[6],
      projected: arr[7],
      hyped: arr[8],
      rare: arr[9],
    });
  }

  console.log(`[Sniper] Got ${items.length} items from Rolimons`);
  cachedItems = items;
  cacheTime = Date.now();
  return items;
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
    if (i + 100 < ids.length) await new Promise(r => setTimeout(r, 150));
  }
  return map;
}

function getDemandLabel(d: number): string {
  switch (d) {
    case -1: return "Terrible";
    case 0: return "Low";
    case 1: return "Normal";
    case 2: return "High";
    case 3: return "Amazing";
    default: return "Unknown";
  }
}

function getTrendLabel(t: number): string {
  switch (t) {
    case -1: return "Lowering";
    case 0: return "Unstable";
    case 1: return "Stable";
    case 2: return "Raising";
    case 3: return "Fluctuating";
    default: return "Unknown";
  }
}

router.get("/sniper/items", async (req, res): Promise<void> => {
  try {
    const allItems = await fetchRolimonsItems();
    const search = String(req.query.search || "").toLowerCase().trim();

    let filtered = allItems.filter(i => i.value > 0 && i.rap > 0);

    if (search) {
      filtered = filtered.filter(i =>
        i.name.toLowerCase().includes(search) || i.acronym.toLowerCase().includes(search)
      );
    }

    const sorted = filtered
      .sort((a, b) => b.rap - a.rap)
      .slice(0, 200);

    const thumbIds = sorted.map(i => i.id);
    const thumbMap = await batchFetchThumbnails(thumbIds);

    const items = sorted.map(i => ({
      id: i.id,
      name: i.name,
      acronym: i.acronym,
      rap: i.rap,
      value: i.value,
      demand: i.demand,
      demandLabel: getDemandLabel(i.demand),
      trend: i.trend,
      trendLabel: getTrendLabel(i.trend),
      projected: i.projected === 1,
      hyped: i.hyped === 1,
      rare: i.rare === 1,
      priceDiff: i.value > 0 && i.rap > 0 ? Math.round(((i.value - i.rap) / i.rap) * 100) : 0,
      thumbnailUrl: thumbMap[i.id] || null,
    }));

    res.json({ items, total: allItems.length });
  } catch (err) {
    console.error("[Sniper] Fetch error:", err);
    res.status(502).json({ error: "Failed to fetch limited items from Rolimons." });
  }
});

router.get("/sniper/deals", async (req, res): Promise<void> => {
  try {
    console.log("[Sniper] Fetching Rolimons deals...");
    const dealsResp = await fetch(ROLIMONS_DEALS_API, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Referer": "https://www.rolimons.com/deals",
      },
    });

    let dealsFromApi: Array<{
      id: number;
      name: string;
      acronym: string;
      rap: number;
      value: number;
      demand: number;
      demandLabel: string;
      trend: number;
      trendLabel: string;
      projected: boolean;
      hyped: boolean;
      rare: boolean;
      discount: number;
      priceDiff: number;
      thumbnailUrl: string | null;
      listedPrice?: number;
    }> = [];

    if (dealsResp.ok) {
      const dealsData = await dealsResp.json() as {
        success?: boolean;
        items?: Array<[
          number,  // 0: item id
          number,  // 1: listed price
          number,  // 2: rap
          number,  // 3: value
          number,  // 4: demand
          number,  // 5: trend
        ]>;
      };

      const allItems = await fetchRolimonsItems();
      const itemMap = new Map(allItems.map(i => [i.id, i]));

      if (dealsData.items && dealsData.items.length > 0) {
        console.log(`[Sniper] Got ${dealsData.items.length} deals from Rolimons deals API`);

        const dealIds = dealsData.items.map(d => d[0]);
        const thumbMap = await batchFetchThumbnails(dealIds);

        for (const deal of dealsData.items) {
          const itemId = deal[0];
          const listedPrice = deal[1];
          const rap = deal[2];
          const value = deal[3];
          const demand = deal[4];
          const trend = deal[5];

          const fullItem = itemMap.get(itemId);
          const name = fullItem?.name || `Item #${itemId}`;
          const acronym = fullItem?.acronym || "";

          if (rap <= 0 || listedPrice <= 0) continue;

          const discount = Math.round(((rap - listedPrice) / rap) * 100);

          dealsFromApi.push({
            id: itemId,
            name,
            acronym,
            rap,
            value,
            demand,
            demandLabel: getDemandLabel(demand),
            trend,
            trendLabel: getTrendLabel(trend),
            projected: fullItem?.projected === 1,
            hyped: fullItem?.hyped === 1,
            rare: fullItem?.rare === 1,
            discount: Math.max(0, discount),
            priceDiff: Math.round(((value - rap) / rap) * 100),
            thumbnailUrl: thumbMap[itemId] || null,
            listedPrice,
          });
        }

        dealsFromApi = dealsFromApi.filter(d => d.discount > 0);
        dealsFromApi.sort((a, b) => b.discount - a.discount);
      }
    }

    if (dealsFromApi.length === 0) {
      console.log("[Sniper] Rolimons deals API returned no results");
    }

    const source = dealsFromApi.length > 0 && dealsFromApi[0].listedPrice != null ? "rolimons_deals" : "value_filter";
    res.json({ deals: dealsFromApi, total: dealsFromApi.length, source });
  } catch (err) {
    console.error("[Sniper] Deals error:", err);
    res.status(502).json({ error: "Failed to find deals from Rolimons." });
  }
});

export default router;
