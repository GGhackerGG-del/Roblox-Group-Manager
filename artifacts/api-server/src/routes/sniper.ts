import { Router, type IRouter } from "express";

const router: IRouter = Router();

const ROLIMONS_API = "https://www.rolimons.com/api";

interface LimitedItem {
  id: number;
  name: string;
  acronym: string;
  rap: number;
  value: number;
  demand: number;
  trend: string;
  projected: number;
  hyped: number;
  rare: number;
}

const demandLabels: Record<number, string> = {
  [-1]: "Unassigned",
  0: "Terrible",
  1: "Low",
  2: "Normal",
  3: "High",
  4: "Amazing",
};

const trendLabels: Record<number, string> = {
  [-1]: "Unassigned",
  0: "Lowering",
  1: "Unstable",
  2: "Stable",
  3: "Raising",
  4: "Fluctuating",
};

let cachedItems: LimitedItem[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function fetchLimitedItems(): Promise<LimitedItem[]> {
  if (cachedItems && Date.now() - cacheTime < CACHE_TTL) {
    return cachedItems;
  }

  const resp = await fetch(`${ROLIMONS_API}/items`, {
    headers: { "User-Agent": "LimitedInk/1.0" },
  });

  if (!resp.ok) {
    throw new Error(`Rolimons API returned ${resp.status}`);
  }

  const data = await resp.json() as {
    items: Record<string, [string, string, number, number, number, number, number, number, number]>;
  };

  const items: LimitedItem[] = [];
  for (const [id, values] of Object.entries(data.items)) {
    const [name, acronym, rap, value, demand, trend, projected, hyped, rare] = values;
    items.push({
      id: parseInt(id, 10),
      name,
      acronym,
      rap,
      value: value || rap,
      demand,
      trend: trendLabels[trend] || "Unknown",
      projected,
      hyped,
      rare,
    });
  }

  cachedItems = items;
  cacheTime = Date.now();
  return items;
}

router.get("/sniper/items", async (_req, res): Promise<void> => {
  try {
    const allItems = await fetchLimitedItems();

    const topItems = allItems
      .filter(i => i.rap > 0 && i.value > 0)
      .sort((a, b) => b.rap - a.rap)
      .slice(0, 200);

    res.json({ items: topItems, total: allItems.length });
  } catch (err) {
    console.error("[Sniper] Fetch error:", err);
    res.status(502).json({ error: "Failed to fetch limited items data." });
  }
});

router.get("/sniper/deals", async (req, res): Promise<void> => {
  try {
    const allItems = await fetchLimitedItems();
    const minPremium = parseFloat(String(req.query.minPremium || "10"));
    const minRap = parseInt(String(req.query.minRap || "1000"), 10);
    const minDemand = parseInt(String(req.query.minDemand || "2"), 10);

    const deals = allItems
      .filter(i => {
        if (i.rap < minRap || i.value <= 0 || i.rap <= 0) return false;
        if (i.demand < minDemand) return false;
        const premiumPct = ((i.value / i.rap) - 1) * 100;
        return premiumPct >= minPremium;
      })
      .sort((a, b) => (b.value / b.rap) - (a.value / a.rap))
      .slice(0, 50)
      .map(i => ({
        ...i,
        premium: Math.round((i.value / i.rap - 1) * 100),
        potentialProfit: i.value - i.rap,
      }));

    res.json({ deals, total: deals.length });
  } catch (err) {
    console.error("[Sniper] Deals error:", err);
    res.status(502).json({ error: "Failed to find deals." });
  }
});

export default router;
