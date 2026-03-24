import { Router, type IRouter } from "express";
import { globalRobloxFetch } from "../lib/robloxThrottle.js";

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
  catalogPrice?: number | null;
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
        const r = await globalRobloxFetch(`${THUMBNAILS_API}/v1/assets?assetIds=${batch.map(b => b.id).join(",")}&size=420x420&format=Png&isCircular=false`, undefined, "low");
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

const catalogPriceCache = new Map<number, number | null>();
let catalogPriceCacheTime = 0;
const CATALOG_PRICE_CACHE_TTL = 10 * 60_000;

async function getRobloxCsrf(cookie: string): Promise<string> {
  try {
    const r = await fetch("https://auth.roblox.com/v1/authentication-ticket", {
      method: "POST",
      headers: {
        "Cookie": `.ROBLOSECURITY=${cookie}`,
        "Content-Length": "0",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://www.roblox.com/",
      },
    });
    return r.headers.get("x-csrf-token") || "";
  } catch {
    return "";
  }
}

async function addCatalogPrices(items: LimitedItem[], cookie?: string): Promise<void> {
  if (Date.now() - catalogPriceCacheTime > CATALOG_PRICE_CACHE_TTL) {
    catalogPriceCache.clear();
    catalogPriceCacheTime = Date.now();
  }

  const needPrice = items.filter(i => i.catalogPrice === undefined && !catalogPriceCache.has(i.id));

  if (needPrice.length && cookie) {
    const csrf = await getRobloxCsrf(cookie);

    for (let b = 0; b < needPrice.length; b += 120) {
      const batch = needPrice.slice(b, b + 120);
      try {
        const hdrs: Record<string, string> = {
          "Cookie": `.ROBLOSECURITY=${cookie}`,
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "application/json",
        };
        if (csrf) hdrs["X-CSRF-TOKEN"] = csrf;

        let resp = await globalRobloxFetch(`${CATALOG_API}/v1/catalog/items/details`, {
          method: "POST",
          headers: hdrs,
          body: JSON.stringify({ items: batch.map(i => ({ itemType: "Asset", id: i.id })) }),
        }, "low");

        if (resp.status === 403) {
          const newCsrf = resp.headers.get("x-csrf-token");
          if (newCsrf) {
            hdrs["X-CSRF-TOKEN"] = newCsrf;
            resp = await globalRobloxFetch(`${CATALOG_API}/v1/catalog/items/details`, {
              method: "POST",
              headers: hdrs,
              body: JSON.stringify({ items: batch.map(i => ({ itemType: "Asset", id: i.id })) }),
            }, "low");
          }
        }

        if (resp.ok) {
          const data = await resp.json() as { data: Array<{ id: number; price?: number | null; lowestPrice?: number | null; lowestResalePrice?: number | null }> };
          const returnedIds = new Set<number>();
          for (const d of (data.data || [])) {
            const p = d.lowestResalePrice ?? d.lowestPrice ?? d.price ?? null;
            catalogPriceCache.set(d.id, p);
            returnedIds.add(d.id);
          }
          for (const bi of batch) {
            if (!returnedIds.has(bi.id)) catalogPriceCache.set(bi.id, null);
          }
        } else {
          console.log(`[Sniper] Catalog price API status=${resp.status}`);
          for (const bi of batch) catalogPriceCache.set(bi.id, null);
        }
      } catch (e) {
        console.error("[Sniper] Catalog price fetch error:", e);
        for (const bi of batch) catalogPriceCache.set(bi.id, null);
      }
    }
  }

  for (const item of items) {
    if (catalogPriceCache.has(item.id)) {
      item.catalogPrice = catalogPriceCache.get(item.id) ?? null;
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
    const offset = Math.max(0, parseInt(String(_req.query.offset || "0")) || 0);
    const limit = Math.min(200, Math.max(1, parseInt(String(_req.query.limit || "200")) || 200));
    const page = sorted.slice(offset, offset + limit);
    await addThumbnails(page);

    const cookie = _req.session.robloxCookie;
    if (cookie) {
      await addCatalogPrices(page, cookie);
    }

    res.json({ items: page, total: items.length, offset, limit, hasMore: offset + limit < items.length });
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

    const cookie = _req.session.robloxCookie;
    if (cookie) {
      await addCatalogPrices(deals, cookie);
    }

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

    const csrf = await getRobloxCsrf(cookie);
    const catalogHeaders: Record<string, string> = { ...rHeaders, "Content-Type": "application/json" };
    if (csrf) catalogHeaders["X-CSRF-TOKEN"] = csrf;

    const [economyResp, resellersResp, catalogResp] = await Promise.all([
      fetch(`${ECONOMY_API}/v2/assets/${assetId}/details`, { headers: rHeaders }),
      fetch(`${ECONOMY_API}/v1/assets/${assetId}/resellers?limit=1&sortOrder=Asc`, { headers: rHeaders }),
      fetch(`https://catalog.roblox.com/v1/catalog/items/details`, {
        method: "POST",
        headers: catalogHeaders,
        body: JSON.stringify({ items: [{ itemType: "Asset", id: assetId }] }),
      }).catch(() => null),
    ]);

    if (economyResp.ok) {
      const eData = await economyResp.json() as {
        ProductId?: number;
        PriceInRobux?: number | null;
        IsForSale?: boolean;
        IsLimited?: boolean;
        IsLimitedUnique?: boolean;
        LowestSellerData?: { SellerId?: number; LowestPrice?: number };
      };
      productId = eData.ProductId || null;
      if (eData.PriceInRobux != null && eData.PriceInRobux > 0) {
        price = eData.PriceInRobux;
      }
      if (!price && eData.LowestSellerData?.LowestPrice) {
        price = eData.LowestSellerData.LowestPrice;
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
        if (!price || reseller.price < price) {
          price = reseller.price;
        }
        sellerId = reseller.seller.id;
        userAssetId = reseller.userAssetId;
      }
    }

    if (!price && catalogResp?.ok) {
      try {
        const cData = await catalogResp.json() as { data?: Array<{ price?: number; lowestPrice?: number; lowestResalePrice?: number }> };
        const item = cData.data?.[0];
        if (item) {
          price = item.lowestResalePrice ?? item.lowestPrice ?? item.price ?? null;
        }
      } catch {}
    }

    res.json({
      assetId,
      price,
      sellerId,
      userAssetId,
      productId,
      available: price !== null,
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

    const csrfResp = await fetch("https://auth.roblox.com/v1/authentication-ticket", {
      method: "POST",
      headers: {
        "Cookie": `.ROBLOSECURITY=${cookie}`,
        "Content-Length": "0",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://www.roblox.com/",
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

router.get("/sniper/rap-history/:assetId", async (req, res): Promise<void> => {
  const assetId = parseInt(req.params.assetId, 10);
  if (isNaN(assetId)) { res.status(400).json({ error: "Invalid asset ID." }); return; }

  const cookie = req.session.robloxCookie;
  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
  };
  if (cookie) headers["Cookie"] = `.ROBLOSECURITY=${cookie}`;

  try {
    const [resaleResp, detailsResp] = await Promise.all([
      fetch(`${ECONOMY_API}/v1/assets/${assetId}/resale-data`, { headers }),
      fetch(`${ECONOMY_API}/v2/assets/${assetId}/details`, { headers }),
    ]);

    let resaleData: {
      assetStock?: number; sales?: number; numberRemaining?: number;
      recentAveragePrice?: number; originalPrice?: number;
      priceDataPoints?: Array<{ value: number; date: string }>;
      volumeDataPoints?: Array<{ value: number; date: string }>;
    } = {};

    let details: { Name?: string; IsLimited?: boolean; IsLimitedUnique?: boolean } = {};

    if (resaleResp.ok) resaleData = await resaleResp.json();
    if (detailsResp.ok) details = await detailsResp.json();

    const item = (await fetchRolimonsItems()).find(i => i.id === assetId);
    if (item && !item.thumbnailUrl) await addThumbnails([item]);

    res.json({
      assetId,
      name: details.Name || item?.name || `Item #${assetId}`,
      rap: item?.rap || resaleData.recentAveragePrice || 0,
      value: item?.value || 0,
      thumbnailUrl: item?.thumbnailUrl || null,
      priceDataPoints: resaleData.priceDataPoints || [],
      volumeDataPoints: resaleData.volumeDataPoints || [],
      recentAveragePrice: resaleData.recentAveragePrice || 0,
      assetStock: resaleData.assetStock,
      numberRemaining: resaleData.numberRemaining,
      originalPrice: resaleData.originalPrice,
    });
  } catch (err) {
    console.error("[Sniper] RAP history error:", err);
    res.status(502).json({ error: "Failed to fetch RAP history." });
  }
});

router.get("/sniper/item/:assetId", async (req, res): Promise<void> => {
  const assetId = parseInt(req.params.assetId, 10);
  if (isNaN(assetId)) { res.status(400).json({ error: "Invalid asset ID." }); return; }
  try {
    const items = await fetchRolimonsItems();
    const item = items.find(i => i.id === assetId);
    if (!item) { res.status(404).json({ error: "Item not found in Rolimons database." }); return; }
    if (!item.thumbnailUrl) await addThumbnails([item]);
    res.json({ item });
  } catch (err) {
    res.status(502).json({ error: "Failed to fetch item." });
  }
});

router.get("/sniper/underprice", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  if (!cookie) { res.status(401).json({ error: "Roblox session required to check catalog prices." }); return; }
  try {
    const all = await fetchRolimonsItems();
    const candidates = [...all]
      .filter(i => i.rap > 200 && i.demand >= 0)
      .sort((a, b) => b.rap - a.rap)
      .slice(0, 600);

    await addCatalogPrices(candidates, cookie);

    const underprice = candidates
      .filter(i => i.catalogPrice != null && i.catalogPrice > 0 && i.rap > 0 && i.catalogPrice < i.rap * 0.88)
      .sort((a, b) => (1 - b.catalogPrice! / b.rap) - (1 - a.catalogPrice! / a.rap))
      .slice(0, 60);

    await addThumbnails(underprice);

    res.json({
      items: underprice.map(i => ({
        ...i,
        discount: Math.round((1 - i.catalogPrice! / i.rap) * 100),
      })),
    });
  } catch (err) {
    console.error("[Sniper] Underprice error:", err);
    res.status(502).json({ error: "Failed to fetch underprice items." });
  }
});

export default router;
