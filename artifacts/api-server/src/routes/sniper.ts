import { Router, type IRouter } from "express";

const router: IRouter = Router();

const ROLIMONS_API = "https://www.rolimons.com/itemapi/itemdetails";
const THUMBNAILS_API = "https://thumbnails.roblox.com";
const ECONOMY_API = "https://economy.roblox.com";
const CATALOG_API = "https://catalog.roblox.com";

interface LimitedItem {
  id: number;
  name: string;
  acronym: string;
  rap: number;
  value: number;
  demand: number;
  trend: number;
  projected: number;
  hyped: number;
  rare: number;
  thumbnailUrl?: string | null;
}

let cachedItems: LimitedItem[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60_000;

const thumbnailCache = new Map<number, string>();
let thumbCacheTime = 0;
const THUMB_CACHE_TTL = 30 * 60_000;

async function fetchRolimonsItems(): Promise<LimitedItem[]> {
  if (cachedItems && Date.now() - cacheTime < CACHE_TTL) return cachedItems;

  console.log("[Sniper] Fetching from Rolimons...");
  const resp = await fetch(ROLIMONS_API, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept": "application/json",
      "Referer": "https://www.rolimons.com/",
    },
  });

  if (!resp.ok) throw new Error(`Rolimons API returned ${resp.status}`);

  const data = await resp.json() as {
    success: boolean;
    items: Record<string, [string, string, number, number, number, number, number, number, number, number]>;
  };

  if (!data.success || !data.items) throw new Error("Invalid Rolimons response");

  const items: LimitedItem[] = Object.entries(data.items).map(([id, arr]) => {
    const numId = parseInt(id, 10);
    return {
      id: numId,
      name: arr[0],
      acronym: arr[1],
      rap: arr[2],
      value: arr[3],
      demand: arr[5],
      trend: arr[6],
      projected: arr[7],
      hyped: arr[8],
      rare: arr[9],
      thumbnailUrl: thumbnailCache.get(numId) || null,
    };
  });

  console.log(`[Sniper] Got ${items.length} items from Rolimons`);
  cachedItems = items;
  cacheTime = Date.now();
  return items;
}

async function addThumbnails(items: LimitedItem[]): Promise<void> {
  if (Date.now() - thumbCacheTime > THUMB_CACHE_TTL) {
    thumbnailCache.clear();
    thumbCacheTime = Date.now();
  }

  const needThumb = items.filter(i => !i.thumbnailUrl && !thumbnailCache.has(i.id)).slice(0, 200);
  if (!needThumb.length) {
    for (const item of items) {
      if (!item.thumbnailUrl && thumbnailCache.has(item.id)) {
        item.thumbnailUrl = thumbnailCache.get(item.id)!;
      }
    }
    return;
  }

  for (let i = 0; i < needThumb.length; i += 100) {
    const batch = needThumb.slice(i, i + 100);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(`${THUMBNAILS_API}/v1/assets?assetIds=${batch.map(b => b.id).join(",")}&size=420x420&format=Png&isCircular=false`);
        if (r.ok) {
          const d = await r.json() as { data: Array<{ targetId: number; imageUrl: string; state: string }> };
          for (const t of d.data) {
            if (t.state === "Completed" && t.imageUrl) {
              thumbnailCache.set(t.targetId, t.imageUrl);
            }
          }
          break;
        } else if (r.status === 429) {
          console.log(`[Sniper] Thumbnail API rate limited (attempt ${attempt + 1}), waiting...`);
          await new Promise(resolve => setTimeout(resolve, 4000 * (attempt + 1)));
          continue;
        } else {
          console.log(`[Sniper] Thumbnail API status=${r.status}`);
          break;
        }
      } catch (e) {
        console.error("[Sniper] Thumbnail fetch error:", e);
        break;
      }
    }
  }

  for (const item of items) {
    if (!item.thumbnailUrl && thumbnailCache.has(item.id)) {
      item.thumbnailUrl = thumbnailCache.get(item.id)!;
    }
  }
}

router.get("/sniper/items", async (_req, res): Promise<void> => {
  try {
    const search = String(_req.query.search || "").trim().toLowerCase();
    let items = await fetchRolimonsItems();

    if (search) {
      items = items.filter(i =>
        i.name.toLowerCase().includes(search) ||
        i.acronym.toLowerCase().includes(search) ||
        String(i.id).includes(search)
      );
    }

    const sorted = [...items].sort((a, b) => b.rap - a.rap);
    const page = sorted.slice(0, 200);
    await addThumbnails(page);

    res.json({ items: page, total: items.length });
  } catch (err) {
    console.error("[Sniper] Error:", err);
    res.status(502).json({ error: "Failed to fetch limited items." });
  }
});

router.get("/sniper/deals", async (_req, res): Promise<void> => {
  try {
    const items = await fetchRolimonsItems();
    const projected = items.filter(i => i.projected === 1 && i.value > 0 && i.rap > 0);
    const undervalued = items.filter(i => i.rap > 0 && i.value > 0 && i.value > i.rap * 1.2);

    const deals = [...new Map([...projected, ...undervalued].map(i => [i.id, i])).values()]
      .sort((a, b) => {
        const aRatio = a.value / (a.rap || 1);
        const bRatio = b.value / (b.rap || 1);
        return bRatio - aRatio;
      })
      .slice(0, 100);

    await addThumbnails(deals);

    res.json({
      items: deals.map(d => ({
        ...d,
        dealPercent: d.rap > 0 ? Math.round(((d.value - d.rap) / d.rap) * 100) : 0,
      })),
    });
  } catch (err) {
    console.error("[Sniper] Deals error:", err);
    res.status(502).json({ error: "Failed to fetch deals." });
  }
});

router.get("/sniper/live/:assetId", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  if (!cookie) { res.status(401).json({ error: "No active Roblox session." }); return; }

  const assetId = parseInt(req.params.assetId, 10);
  if (isNaN(assetId)) { res.status(400).json({ error: "Invalid asset ID." }); return; }

  const rHeaders = {
    "Cookie": `.ROBLOSECURITY=${cookie}`,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
  };

  try {
    let productId: number | null = null;
    let price: number | null = null;
    let sellerId: number | null = null;
    let userAssetId: number | null = null;

    const [economyResp, resellersResp] = await Promise.all([
      fetch(`${ECONOMY_API}/v2/assets/${assetId}/details`, { headers: rHeaders }),
      fetch(`${ECONOMY_API}/v1/assets/${assetId}/resellers?limit=1&sortOrder=Asc`, { headers: rHeaders }),
    ]);

    if (economyResp.ok) {
      const eData = await economyResp.json() as {
        ProductId?: number;
        PriceInRobux?: number | null;
        IsForSale?: boolean;
      };
      productId = eData.ProductId || null;
      if (eData.IsForSale && eData.PriceInRobux) {
        price = eData.PriceInRobux;
      }
    }

    if (resellersResp.ok) {
      const rData = await resellersResp.json() as {
        data?: Array<{
          userAssetId: number;
          price: number;
          seller: { id: number; name?: string };
        }>;
      };
      if (rData.data?.[0]) {
        const reseller = rData.data[0];
        price = reseller.price;
        sellerId = reseller.seller.id;
        userAssetId = reseller.userAssetId;
      }
    }

    res.json({
      assetId,
      price,
      sellerId,
      userAssetId,
      productId,
      available: price !== null && productId !== null,
    });
  } catch (err) {
    console.error("[Sniper] Live error:", err);
    res.status(502).json({ error: "Failed to fetch live price." });
  }
});

router.post("/sniper/buy", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  if (!cookie) { res.status(401).json({ error: "No active Roblox session." }); return; }

  const { assetId, maxPrice } = req.body as { assetId?: number; maxPrice?: number };
  if (!assetId || !maxPrice) {
    res.status(400).json({ error: "assetId and maxPrice required." }); return;
  }

  const rHeaders = {
    "Cookie": `.ROBLOSECURITY=${cookie}`,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
  };

  try {
    const [economyResp, resellersResp] = await Promise.all([
      fetch(`${ECONOMY_API}/v2/assets/${assetId}/details`, { headers: rHeaders }),
      fetch(`${ECONOMY_API}/v1/assets/${assetId}/resellers?limit=1&sortOrder=Asc`, { headers: rHeaders }),
    ]);

    let productId: number | null = null;
    let livePrice: number | null = null;
    let sellerId = 0;
    let userAssetId = 0;

    if (economyResp.ok) {
      const eData = await economyResp.json() as { ProductId?: number };
      productId = eData.ProductId || null;
    }

    if (resellersResp.ok) {
      const rData = await resellersResp.json() as { data?: Array<{ userAssetId: number; price: number; seller: { id: number } }> };
      if (rData.data?.[0]) {
        livePrice = rData.data[0].price;
        sellerId = rData.data[0].seller.id;
        userAssetId = rData.data[0].userAssetId;
      }
    }

    if (!livePrice || !productId) {
      res.status(400).json({ error: "Item not currently available for purchase." }); return;
    }
    if (livePrice > maxPrice) {
      res.status(400).json({ error: `Live price (${livePrice} R$) exceeds your max (${maxPrice} R$). Purchase blocked.` }); return;
    }

    const csrfResp = await fetch("https://auth.roblox.com/v2/logout", {
      method: "POST",
      headers: {
        "Cookie": `.ROBLOSECURITY=${cookie}`,
        "Content-Length": "0",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    const csrf = csrfResp.headers.get("x-csrf-token");
    if (!csrf) { res.status(400).json({ error: "CSRF failed." }); return; }

    const buyResp = await fetch(`https://economy.roblox.com/v1/purchases/products/${productId}`, {
      method: "POST",
      headers: {
        "Cookie": `.ROBLOSECURITY=${cookie}`,
        "X-CSRF-TOKEN": csrf,
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      body: JSON.stringify({
        expectedCurrency: 1,
        expectedPrice: livePrice,
        expectedSellerId: sellerId,
        userAssetId,
      }),
    });

    const text = await buyResp.text();
    console.log(`[Sniper] Buy status=${buyResp.status} body=${text.slice(0, 200)}`);

    if (buyResp.ok) {
      res.json({ success: true, message: `Purchased for ${livePrice} R$` });
    } else {
      let msg = "Purchase failed";
      try {
        const e = JSON.parse(text);
        msg = e.errorModel?.message || e.message || msg;
      } catch {}
      res.status(400).json({ error: msg });
    }
  } catch (err) {
    console.error("[Sniper] Buy error:", err);
    res.status(500).json({ error: "Purchase failed." });
  }
});

export default router;
