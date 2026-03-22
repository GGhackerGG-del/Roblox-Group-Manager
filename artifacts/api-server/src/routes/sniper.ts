import { Router, type IRouter } from "express";

const router: IRouter = Router();

const ROLIMONS_API = "https://www.rolimons.com/itemapi/itemdetails";
const ROLIMONS_DEALS_API = "https://www.rolimons.com/dealapi/dealitems";
const ROBLOX_THUMBNAILS_API = "https://thumbnails.roblox.com";

const bestPriceCache: Record<number, { price: number; ts: number }> = {};
const BEST_PRICE_TTL = 5 * 60_000;

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
        const data = await resp.json() as { data: Array<{ targetId: number; imageUrl: string; state: string }> };
        for (const t of data.data || []) {
          if (t.state === "Completed" && t.imageUrl) {
            map[t.targetId] = t.imageUrl;
          }
        }
      }
    } catch {}
    if (i + 100 < ids.length) await new Promise(r => setTimeout(r, 150));
  }

  const missing = ids.filter(id => !map[id]);
  if (missing.length > 0 && missing.length <= 200) {
    for (let i = 0; i < missing.length; i += 100) {
      const batch = missing.slice(i, i + 100);
      try {
        const resp = await fetch(
          `${ROBLOX_THUMBNAILS_API}/v1/assets?assetIds=${batch.join(",")}&size=420x420&format=Png&isCircular=false`
        );
        if (resp.ok) {
          const data = await resp.json() as { data: Array<{ targetId: number; imageUrl: string; state: string }> };
          for (const t of data.data || []) {
            if (t.state === "Completed" && t.imageUrl && !map[t.targetId]) {
              map[t.targetId] = t.imageUrl;
            }
          }
        }
      } catch {}
      if (i + 100 < missing.length) await new Promise(r => setTimeout(r, 150));
    }
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
    const minRap = parseInt(String(req.query.minRap || "0"), 10);
    const maxRap = parseInt(String(req.query.maxRap || "0"), 10);
    const minDemand = parseInt(String(req.query.minDemand || "-2"), 10);
    const sortBy = String(req.query.sortBy || "rap");

    let filtered = allItems.filter(i => i.value > 0 && i.rap > 0);

    if (search) {
      filtered = filtered.filter(i =>
        i.name.toLowerCase().includes(search) || i.acronym.toLowerCase().includes(search)
      );
    }

    if (minRap > 0) filtered = filtered.filter(i => i.rap >= minRap);
    if (maxRap > 0) filtered = filtered.filter(i => i.rap <= maxRap);
    if (minDemand > -2) filtered = filtered.filter(i => i.demand >= minDemand);

    let sorted: RolimonsItem[];
    switch (sortBy) {
      case "value": sorted = filtered.sort((a, b) => b.value - a.value); break;
      case "demand": sorted = filtered.sort((a, b) => b.demand - a.demand); break;
      case "name": sorted = filtered.sort((a, b) => a.name.localeCompare(b.name)); break;
      default: sorted = filtered.sort((a, b) => b.rap - a.rap); break;
    }

    sorted = sorted.slice(0, 200);

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
    let dealSource = "empty";
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
        dealSource = "rolimons_deals";
      }
    }

    if (dealsFromApi.length === 0) {
      console.log("[Sniper] Rolimons deals API returned no results, fetching real prices from catalog...");
      const allItems = await fetchRolimonsItems();
      const candidates = allItems
        .filter(i => i.rap > 0 && i.value > 0 && i.value < i.rap && i.demand >= 0)
        .sort((a, b) => {
          const aDeal = (a.rap - a.value) / a.rap;
          const bDeal = (b.rap - b.value) / b.rap;
          return bDeal - aDeal;
        })
        .slice(0, 100);

      const priceMap = new Map<number, number>();
      try {
        const itemBodies = candidates.map(i => ({ itemType: "Asset", id: i.id }));
        const detailsResp = await fetch("https://catalog.roblox.com/v1/catalog/items/details", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({ items: itemBodies }),
        });
        if (detailsResp.ok) {
          const detailsData = await detailsResp.json() as {
            data: Array<{ id: number; lowestPrice?: number; price?: number }>;
          };
          for (const item of detailsData.data || []) {
            if (item.lowestPrice && item.lowestPrice > 0) {
              priceMap.set(item.id, item.lowestPrice);
            }
          }
          console.log(`[Sniper] Got real prices for ${priceMap.size} items from catalog details`);
        }
      } catch (err) {
        console.log("[Sniper] Failed to fetch catalog details:", err);
      }

      const withPrices = candidates.filter(i => priceMap.has(i.id) && (priceMap.get(i.id) || 0) < i.rap);
      const withoutPrices = candidates.filter(i => !priceMap.has(i.id));

      const combined = [
        ...withPrices.map(i => ({
          ...i,
          realPrice: priceMap.get(i.id)!,
          usesRealPrice: true,
        })),
        ...withoutPrices.slice(0, Math.max(0, 50 - withPrices.length)).map(i => ({
          ...i,
          realPrice: i.value,
          usesRealPrice: false,
        })),
      ];

      dealSource = priceMap.size > 0 ? "catalog_prices" : "rolimons_value";
      console.log(`[Sniper] ${withPrices.length} items with real prices, ${combined.length - withPrices.length} with estimated values`);

      const ids = combined.map(i => i.id);
      const thumbMap = await batchFetchThumbnails(ids);

      dealsFromApi = combined.map(i => ({
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
        discount: Math.round(((i.rap - i.realPrice) / i.rap) * 100),
        priceDiff: Math.round(((i.realPrice - i.rap) / i.rap) * 100),
        thumbnailUrl: thumbMap[i.id] || null,
        listedPrice: i.realPrice,
      }));

      dealsFromApi = dealsFromApi.filter(d => d.discount > 0);
      dealsFromApi.sort((a, b) => b.discount - a.discount);
    }

    res.json({ deals: dealsFromApi, total: dealsFromApi.length, source: dealSource });
  } catch (err) {
    console.error("[Sniper] Deals error:", err);
    res.status(502).json({ error: "Failed to find deals from Rolimons." });
  }
});

async function getRobloxCsrfSniper(cookie: string): Promise<string | null> {
  try {
    const resp = await fetch("https://auth.roblox.com/v2/logout", {
      method: "POST",
      headers: {
        "Cookie": `.ROBLOSECURITY=${cookie}`,
        "Content-Length": "0",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    const token = resp.headers.get("x-csrf-token");
    return token || null;
  } catch {
    return null;
  }
}

router.get("/sniper/live/:assetId", async (req, res): Promise<void> => {
  const assetId = parseInt(req.params.assetId, 10);
  if (isNaN(assetId) || assetId <= 0) {
    res.status(400).json({ error: "Invalid asset ID" });
    return;
  }

  try {
    const allItems = await fetchRolimonsItems();
    const rolimonsItem = allItems.find(i => i.id === assetId);

    let lowestPrice: number | null = null;
    let itemName = rolimonsItem?.name || `Item #${assetId}`;

    try {
      const detailsResp = await fetch("https://catalog.roblox.com/v1/catalog/items/details", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ items: [{ itemType: "Asset", id: assetId }] }),
      });
      if (detailsResp.ok) {
        const details = await detailsResp.json() as { data: Array<{ id: number; name?: string; lowestPrice?: number; price?: number }> };
        const item = details.data?.[0];
        if (item) {
          if (item.name) itemName = item.name;
          lowestPrice = item.lowestPrice ?? item.price ?? null;
        }
      }
    } catch {}

    const thumbMap = await batchFetchThumbnails([assetId]);

    res.json({
      assetId,
      name: itemName,
      rap: rolimonsItem?.rap || 0,
      value: rolimonsItem?.value || 0,
      demand: rolimonsItem?.demand ?? null,
      demandLabel: rolimonsItem ? getDemandLabel(rolimonsItem.demand) : "Unknown",
      trend: rolimonsItem?.trend ?? 0,
      trendLabel: rolimonsItem ? getTrendLabel(rolimonsItem.trend) : "Unknown",
      lowestPrice,
      thumbnailUrl: thumbMap[assetId] || null,
    });
  } catch (err) {
    console.error("[Sniper] Live price error:", err);
    res.status(500).json({ error: "Failed to fetch item data" });
  }
});

router.post("/sniper/buy", async (req, res): Promise<void> => {
  const cookie = req.session?.robloxCookie;
  if (!cookie) {
    res.status(401).json({ error: "Not connected to Roblox. Please connect your account in Settings." });
    return;
  }

  const assetId = typeof req.body.assetId === "number" ? req.body.assetId : parseInt(String(req.body.assetId), 10);
  const maxPrice = typeof req.body.maxPrice === "number" ? req.body.maxPrice : null;

  if (isNaN(assetId) || assetId <= 0) {
    res.status(400).json({ error: "Invalid asset ID" });
    return;
  }

  try {
    console.log(`[Sniper] Fetching lowest seller for asset ${assetId}...`);
    const sellersResp = await fetch(
      `https://economy.roblox.com/v1/assets/${assetId}/lowest-sale-sellers`,
      {
        headers: {
          "Cookie": `.ROBLOSECURITY=${cookie}`,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "application/json",
        },
      }
    );

    if (!sellersResp.ok) {
      const text = await sellersResp.text();
      console.error(`[Sniper] Sellers API error ${sellersResp.status}: ${text.slice(0, 200)}`);
      res.status(400).json({ error: `Failed to get sellers (${sellersResp.status})` });
      return;
    }

    const sellersData = await sellersResp.json() as {
      data?: Array<{
        seller?: { id: number };
        price?: number;
        product_id?: number;
        user_asset_id?: number;
      }>;
    };

    const seller = sellersData.data?.[0];
    if (!seller) {
      res.status(404).json({ error: "No sellers available for this item" });
      return;
    }

    const price = seller.price ?? 0;
    const productId = seller.product_id;
    const sellerId = seller.seller?.id;
    const userAssetId = seller.user_asset_id;

    if (!productId || !sellerId || !userAssetId) {
      res.status(400).json({ error: "Incomplete seller data from Roblox" });
      return;
    }

    if (maxPrice !== null && price > maxPrice) {
      res.status(400).json({ error: `Current price ${price} R$ exceeds your target ${maxPrice} R$`, price });
      return;
    }

    const csrf = await getRobloxCsrfSniper(cookie);
    if (!csrf) {
      res.status(400).json({ error: "Failed to get CSRF token. Your Roblox session may have expired." });
      return;
    }

    console.log(`[Sniper] Buying asset ${assetId} for ${price} R$ from seller ${sellerId}...`);
    const buyResp = await fetch(
      `https://economy.roblox.com/v1/purchases/products/${productId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cookie": `.ROBLOSECURITY=${cookie}`,
          "X-CSRF-TOKEN": csrf,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          expectedCurrency: 1,
          expectedPrice: price,
          expectedSellerId: sellerId,
          userAssetId: userAssetId,
        }),
      }
    );

    const buyText = await buyResp.text();
    let buyData: Record<string, unknown> = {};
    try { buyData = JSON.parse(buyText); } catch {}

    if (!buyResp.ok) {
      console.error(`[Sniper] Buy failed ${buyResp.status}: ${buyText.slice(0, 300)}`);
      const msg = (buyData.message as string) || (buyData.errorMessage as string) || `Purchase failed (${buyResp.status})`;
      res.status(400).json({ error: msg, data: buyData });
      return;
    }

    console.log(`[Sniper] Successfully purchased asset ${assetId} for ${price} R$`);
    res.json({ success: true, price, assetId, message: `Purchased for ${price} R$` });
  } catch (err) {
    console.error("[Sniper] Buy error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Buy failed" });
  }
});

export default router;
