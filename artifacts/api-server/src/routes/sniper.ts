import { Router, type IRouter } from "express";

const router: IRouter = Router();

const ROLIMONS_API = "https://www.rolimons.com/itemapi/itemdetails";

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

    const items = filtered
      .sort((a, b) => b.rap - a.rap)
      .slice(0, 500)
      .map(i => ({
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
      }));

    res.json({ items, total: allItems.length });
  } catch (err) {
    console.error("[Sniper] Fetch error:", err);
    res.status(502).json({ error: "Failed to fetch limited items from Rolimons." });
  }
});

router.get("/sniper/deals", async (req, res): Promise<void> => {
  try {
    const allItems = await fetchRolimonsItems();
    const maxRap = parseInt(String(req.query.maxRap || "1000000"), 10);
    const minDemand = parseInt(String(req.query.minDemand || "-1"), 10);
    const maxPricePercent = parseInt(String(req.query.maxPricePercent || "100"), 10);

    const deals = allItems
      .filter(i => {
        if (i.value <= 0 || i.rap <= 0) return false;
        if (i.rap > maxRap) return false;
        if (i.demand < minDemand) return false;
        if (i.value >= i.rap) return false;
        const valuePercent = Math.round((i.value / i.rap) * 100);
        if (valuePercent > maxPricePercent) return false;
        return true;
      })
      .sort((a, b) => {
        const aDiff = (a.rap - a.value) / a.rap;
        const bDiff = (b.rap - b.value) / b.rap;
        return bDiff - aDiff;
      })
      .slice(0, 100)
      .map(i => ({
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
        discount: Math.round(((i.rap - i.value) / i.rap) * 100),
        priceDiff: Math.round(((i.value - i.rap) / i.rap) * 100),
      }));

    res.json({ deals, total: deals.length });
  } catch (err) {
    console.error("[Sniper] Deals error:", err);
    res.status(502).json({ error: "Failed to find deals from Rolimons." });
  }
});

export default router;
