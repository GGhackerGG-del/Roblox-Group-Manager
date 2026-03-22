import { Router, type IRouter } from "express";

const router: IRouter = Router();

const ROLIMONS_API = "https://www.rolimons.com/itemapi/itemdetails";
const THUMBNAILS_API = "https://thumbnails.roblox.com";

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
const CACHE_TTL = 3 * 60_000;

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

  const items: LimitedItem[] = Object.entries(data.items).map(([id, arr]) => ({
    id: parseInt(id, 10),
    name: arr[0],
    acronym: arr[1],
    rap: arr[2],
    value: arr[3],
    demand: arr[5],
    trend: arr[6],
    projected: arr[7],
    hyped: arr[8],
    rare: arr[9],
  }));

  console.log(`[Sniper] Got ${items.length} items from Rolimons`);
  cachedItems = items;
  cacheTime = Date.now();
  return items;
}

async function addThumbnails(items: LimitedItem[]): Promise<void> {
  const needThumb = items.filter(i => !i.thumbnailUrl).slice(0, 200);
  if (!needThumb.length) return;

  for (let i = 0; i < needThumb.length; i += 100) {
    const batch = needThumb.slice(i, i + 100);
    try {
      const r = await fetch(`${THUMBNAILS_API}/v1/assets?assetIds=${batch.map(b => b.id).join(",")}&size=420x420&format=Png&isCircular=false`);
      if (r.ok) {
        const d = await r.json() as { data: Array<{ targetId: number; imageUrl: string }> };
        const map = new Map(d.data.map(t => [t.targetId, t.imageUrl]));
        for (const item of batch) {
          if (map.has(item.id)) item.thumbnailUrl = map.get(item.id)!;
        }
      }
    } catch {}
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

  try {
    const pageResp = await fetch(`https://www.roblox.com/catalog/${assetId}`, {
      headers: {
        "Cookie": `.ROBLOSECURITY=${cookie}`,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html",
      },
    });

    if (!pageResp.ok) {
      res.status(502).json({ error: `Catalog page fetch failed (${pageResp.status})` });
      return;
    }

    const html = await pageResp.text();

    const priceMatch = html.match(/data-expected-price="(\d+)"/);
    const sellerMatch = html.match(/data-expected-seller-id="(\d+)"/);
    const uaMatch = html.match(/data-lowest-private-sale-userasset-id="(\d+)"/);
    const prodMatch = html.match(/data-product-id="(\d+)"/);

    const price = priceMatch ? parseInt(priceMatch[1], 10) : null;
    const sellerId = sellerMatch ? parseInt(sellerMatch[1], 10) : null;
    const userAssetId = uaMatch ? parseInt(uaMatch[1], 10) : null;
    const productId = prodMatch ? parseInt(prodMatch[1], 10) : null;

    res.json({ assetId, price, sellerId, userAssetId, productId, available: price !== null && productId !== null });
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

  try {
    const pageResp = await fetch(`https://www.roblox.com/catalog/${assetId}`, {
      headers: {
        "Cookie": `.ROBLOSECURITY=${cookie}`,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html",
      },
    });
    if (!pageResp.ok) { res.status(502).json({ error: "Could not verify item listing." }); return; }

    const html = await pageResp.text();
    const priceMatch = html.match(/data-expected-price="(\d+)"/);
    const sellerMatch = html.match(/data-expected-seller-id="(\d+)"/);
    const uaMatch = html.match(/data-lowest-private-sale-userasset-id="(\d+)"/);
    const prodMatch = html.match(/data-product-id="(\d+)"/);

    const livePrice = priceMatch ? parseInt(priceMatch[1], 10) : null;
    const productId = prodMatch ? parseInt(prodMatch[1], 10) : null;
    const sellerId = sellerMatch ? parseInt(sellerMatch[1], 10) : 0;
    const userAssetId = uaMatch ? parseInt(uaMatch[1], 10) : 0;

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
