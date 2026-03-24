import { Router, type IRouter } from "express";

const router: IRouter = Router();

const CATALOG_API = "https://catalog.roblox.com";
const THUMBNAILS_API = "https://thumbnails.roblox.com";
const ASSET_DELIVERY_API = "https://assetdelivery.roblox.com";
const UPLOAD_API = "https://apis.roblox.com/assets/user-auth/v1/assets";
const OPERATIONS_API = "https://apis.roblox.com/assets/user-auth/v1/operations";
const ITEM_CONFIG_API = "https://itemconfiguration.roblox.com";

const _cache = new Map<string, { data: unknown; ts: number }>();
const SEARCH_CACHE_TTL = 30 * 60_000;
const GROUP_CACHE_TTL = 15 * 60_000;

function cacheGet<T>(k: string, ttl = SEARCH_CACHE_TTL): T | null {
  const e = _cache.get(k);
  if (!e) return null;
  if (Date.now() - e.ts > ttl) { _cache.delete(k); return null; }
  return e.data as T;
}
function cacheSet(k: string, v: unknown) { _cache.set(k, { data: v, ts: Date.now() }); }

let _lastRobloxRequest = 0;
const MIN_REQUEST_GAP = 400;

async function throttledFetch(url: string, init?: RequestInit): Promise<Response> {
  const now = Date.now();
  const wait = MIN_REQUEST_GAP - (now - _lastRobloxRequest);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  _lastRobloxRequest = Date.now();
  return fetch(url, init);
}

async function getRobloxCsrf(cookie: string): Promise<string> {
  try {
    const hdrs: Record<string, string> = {
      "Cookie": `.ROBLOSECURITY=${cookie}`,
      "Content-Length": "0",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Referer": "https://www.roblox.com/",
      "Origin": "https://www.roblox.com",
    };
    const r1 = await fetch("https://auth.roblox.com/v2/logout", { method: "POST", headers: hdrs });
    const token = r1.headers.get("x-csrf-token");
    if (token) return token;
    const r1b = await fetch("https://auth.roblox.com/", { method: "POST", headers: hdrs });
    return r1b.headers.get("x-csrf-token") || "";
  } catch (err) {
    console.error("[Clothing] CSRF error:", err);
    return "";
  }
}

function robloxHeaders(cookie: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    "Cookie": `.ROBLOSECURITY=${cookie}`,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Referer": "https://www.roblox.com/",
    "Origin": "https://www.roblox.com",
    ...extra,
  };
}

type DetailItem = { id: number; name: string; assetType: number; price: number | null; lowestPrice?: number | null; creatorName: string; description?: string };

async function fetchItemDetails(ids: number[], cookie: string): Promise<Map<number, DetailItem>> {
  const map = new Map<number, DetailItem>();
  if (!ids.length) return map;

  const csrf = await getRobloxCsrf(cookie);

  for (let i = 0; i < ids.length; i += 120) {
    const batch = ids.slice(i, i + 120);

    let success = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 2000 * attempt));

      try {
        const hdrs: Record<string, string> = {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Cookie": `.ROBLOSECURITY=${cookie}`,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        };
        if (csrf) hdrs["X-CSRF-TOKEN"] = csrf;

        const resp = await throttledFetch(`${CATALOG_API}/v1/catalog/items/details`, {
          method: "POST",
          headers: hdrs,
          body: JSON.stringify({ items: batch.map(id => ({ itemType: "Asset", id })) }),
        });

        if (resp.status === 403) {
          const newCsrf = resp.headers.get("x-csrf-token");
          if (newCsrf) {
            hdrs["X-CSRF-TOKEN"] = newCsrf;
            const retry = await throttledFetch(`${CATALOG_API}/v1/catalog/items/details`, {
              method: "POST",
              headers: hdrs,
              body: JSON.stringify({ items: batch.map(id => ({ itemType: "Asset", id })) }),
            });
            if (retry.ok) {
              const dd = await retry.json() as { data: DetailItem[] };
              for (const d of (dd.data || [])) map.set(d.id, d);
              success = true;
              break;
            }
          }
          console.log(`[Clothing] Details API 403, CSRF retry failed for batch starting ${batch[0]}`);
          continue;
        }

        if (resp.status === 429) {
          console.log(`[Clothing] Details API rate limited (attempt ${attempt + 1}), waiting...`);
          await new Promise(r => setTimeout(r, 5000 * (attempt + 1)));
          continue;
        }

        if (resp.ok) {
          const dd = await resp.json() as { data: DetailItem[] };
          for (const d of (dd.data || [])) map.set(d.id, d);
          success = true;
          break;
        } else {
          const text = await resp.text().catch(() => "");
          console.log(`[Clothing] Details API status=${resp.status} body=${text.slice(0, 200)} for batch starting ${batch[0]}`);
        }
      } catch (e) {
        console.error(`[Clothing] Details fetch error (attempt ${attempt + 1}):`, e);
      }
    }

    if (!success) {
      console.log(`[Clothing] Bulk API failed for batch starting ${batch[0]}, trying economy fallback...`);
      await fetchItemDetailsEconomyFallback(batch, cookie, map);
    }

    if (i + 120 < ids.length) await new Promise(r => setTimeout(r, 800));
  }
  return map;
}

async function fetchItemDetailsEconomyFallback(ids: number[], cookie: string, map: Map<number, DetailItem>): Promise<void> {
  const missing = ids.filter(id => !map.has(id));
  if (!missing.length) return;

  for (const id of missing) {
    try {
      const resp = await throttledFetch(`https://economy.roblox.com/v2/assets/${id}/details`, {
        headers: robloxHeaders(cookie),
      });
      if (resp.ok) {
        const d = await resp.json() as {
          AssetId: number;
          Name: string;
          AssetTypeId: number;
          PriceInRobux: number | null;
          IsForSale: boolean;
          Creator?: { Name: string };
        };
        map.set(id, {
          id: d.AssetId,
          name: d.Name || `Asset ${id}`,
          assetType: d.AssetTypeId || 11,
          price: d.IsForSale ? d.PriceInRobux : null,
          creatorName: d.Creator?.Name || "",
        });
      }
    } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
}

async function fetchThumbnails(ids: number[]): Promise<Record<number, string | null>> {
  const map: Record<number, string | null> = {};
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    try {
      const r = await throttledFetch(`${THUMBNAILS_API}/v1/assets?assetIds=${batch.join(",")}&size=420x420&format=Png&isCircular=false`);
      if (r.ok) {
        const d = await r.json() as { data: Array<{ targetId: number; imageUrl: string; state: string }> };
        d.data.forEach(t => {
          if (t.state === "Completed" && t.imageUrl) map[t.targetId] = t.imageUrl;
        });
      } else if (r.status === 429) {
        console.log(`[Clothing] Thumbnails rate limited on batch ${i / 100 + 1}, skipping remaining...`);
        break;
      }
    } catch (e) {
      console.error("[Clothing] Thumbnail fetch error:", e);
    }
  }
  return map;
}

router.get("/clothing/search", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  if (!cookie) { res.status(401).json({ error: "No active Roblox session." }); return; }

  const keyword = String(req.query.keyword || "").trim();
  const creatorId = String(req.query.creatorId || "").trim();

  if (!keyword && !creatorId) { res.status(400).json({ error: "Keyword or Group ID required." }); return; }

  const validSub = ["ClassicShirts", "ClassicPants"];
  const subcategory = validSub.includes(String(req.query.subcategory)) ? String(req.query.subcategory) : "ClassicShirts";
  const sortType = Math.max(0, Math.min(parseInt(String(req.query.sortType || "0"), 10) || 0, 5));
  const sortAggregation = Math.max(0, Math.min(parseInt(String(req.query.sortAggregation || "0"), 10) || 0, 5));
  const rawMin = parseInt(String(req.query.minPrice || ""), 10);
  const rawMax = parseInt(String(req.query.maxPrice || ""), 10);
  const minPrice = !isNaN(rawMin) && rawMin >= 0 ? String(rawMin) : "";
  const maxPrice = !isNaN(rawMax) && rawMax >= 0 ? String(rawMax) : "";
  const limit = 30;
  const cursor = String(req.query.cursor || "").trim();

  const ck = `cs_${keyword}_${subcategory}_${sortType}_${sortAggregation}_${minPrice}_${maxPrice}_${creatorId}_${cursor}`;
  const cached = cacheGet<unknown>(ck);
  if (cached) { res.json(cached); return; }

  let url = `${CATALOG_API}/v1/search/items/details?category=Clothing&limit=${limit}&subcategory=${encodeURIComponent(subcategory)}`;
  if (keyword) url += `&keyword=${encodeURIComponent(keyword)}`;
  if (sortType) url += `&sortType=${sortType}`;
  if (sortAggregation) url += `&sortAggregation=${sortAggregation}`;
  if (minPrice) url += `&minPrice=${minPrice}`;
  if (maxPrice) url += `&maxPrice=${maxPrice}`;
  if (creatorId) {
    const cid = parseInt(creatorId, 10);
    if (!isNaN(cid) && cid > 0) {
      url += `&creatorType=Group&creatorTargetId=${cid}`;
    }
  }
  if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;

  try {
    console.log(`[Clothing] Search URL: ${url}`);
    let resp = await throttledFetch(url, { headers: robloxHeaders(cookie) });

    if (resp.status === 429) {
      await new Promise(r => setTimeout(r, 2000));
      resp = await throttledFetch(url, { headers: robloxHeaders(cookie) });
    }
    if (resp.status === 429) {
      await new Promise(r => setTimeout(r, 4000));
      resp = await throttledFetch(url, { headers: robloxHeaders(cookie) });
    }
    if (resp.status === 429) {
      res.status(429).json({ error: "Roblox rate limit. Please try again in a few seconds." });
      return;
    }
    if (!resp.ok) {
      const errBody = await resp.text().catch(() => "");
      console.error(`[Clothing] Search API error status=${resp.status} body=${errBody.slice(0, 300)}`);

      if (!keyword && creatorId) {
        console.log("[Clothing] Retrying search with salesTypeFilter=1...");
        const retryUrl = url + "&salesTypeFilter=1";
        const retryResp = await throttledFetch(retryUrl, { headers: robloxHeaders(cookie) });
        if (retryResp.ok) {
          resp = retryResp;
        } else {
          res.status(502).json({ error: `Catalog API error (${resp.status})` });
          return;
        }
      } else {
        res.status(502).json({ error: `Catalog API error (${resp.status})` });
        return;
      }
    }

    type CatalogDetailItem = {
      id: number;
      name?: string;
      assetType?: number;
      price?: number | null;
      lowestPrice?: number | null;
      creatorName?: string;
      creatorType?: string;
    };
    const raw = await resp.json() as { data: CatalogDetailItem[]; nextPageCursor?: string };
    const dataItems = raw.data || [];
    const nextCursor = raw.nextPageCursor || null;

    if (dataItems.length === 0) {
      const payload = { items: [], nextCursor: null };
      cacheSet(ck, payload);
      res.json(payload);
      return;
    }

    const ids = dataItems.map(i => i.id);
    const thumbMap = await fetchThumbnails(ids);

    const items = dataItems.map(d => ({
      id: d.id,
      name: d.name || `Asset ${d.id}`,
      assetType: d.assetType === 12 ? "Pants" : "Shirt",
      assetTypeId: d.assetType || 11,
      price: d.price ?? d.lowestPrice ?? null,
      creatorName: d.creatorName || "",
      thumbnailUrl: thumbMap[d.id] || null,
    }));

    const payload = { items, nextCursor };
    cacheSet(ck, payload);
    res.json(payload);
  } catch (err) {
    console.error("[Clothing] Search error:", err);
    res.status(502).json({ error: "Failed to search catalog." });
  }
});

async function fetchGroupItemsViaItemConfig(groupId: number, cookie: string): Promise<Array<{ id: number; name?: string; assetType?: number; price?: number | null }>> {
  const items: Array<{ id: number; name?: string; assetType?: number; price?: number | null }> = [];

  async function fetchAssetType(assetType: string, assetTypeId: number) {
    let cursor: string | null = null;
    let pages = 0;
    let retries = 0;
    while (pages < 50) {
      const url = `${ITEM_CONFIG_API}/v1/creations/get-assets?assetType=${assetType}&groupId=${groupId}&limit=100${cursor ? `&cursor=${cursor}` : ""}`;
      const resp = await throttledFetch(url, { headers: robloxHeaders(cookie) });

      if (resp.status === 429) {
        if (retries < 5) {
          retries++;
          console.log(`[Clothing] ItemConfig ${assetType} rate limited, retry ${retries}...`);
          await new Promise(r => setTimeout(r, 3000 * retries));
          continue;
        }
        console.log(`[Clothing] ItemConfig ${assetType} rate limited, giving up after ${retries} retries`);
        break;
      }

      if (!resp.ok) {
        console.log(`[Clothing] ItemConfig ${assetType} API status=${resp.status}`);
        break;
      }

      retries = 0;
      const data = await resp.json() as { data: Array<{ assetId: number; name: string }>; nextPageCursor?: string };
      for (const item of data.data || []) {
        items.push({ id: item.assetId, name: item.name, assetType: assetTypeId, price: null });
      }
      console.log(`[Clothing] ItemConfig ${assetType} page ${pages + 1}: got ${data.data?.length || 0} items (total so far: ${items.length})`);
      cursor = data.nextPageCursor || null;
      if (!cursor) break;
      pages++;
      await new Promise(r => setTimeout(r, 500));
    }
  }

  try {
    await fetchAssetType("Shirt", 11);
    await fetchAssetType("Pants", 12);
    await fetchAssetType("TShirt", 2);
    console.log(`[Clothing] ItemConfig total: ${items.length} items for group ${groupId}`);
  } catch (err) {
    console.error("[Clothing] ItemConfig error:", err);
  }
  return items;
}

router.get("/clothing/group/:groupId/items", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  if (!cookie) { res.status(401).json({ error: "No active Roblox session." }); return; }

  const groupId = parseInt(req.params.groupId, 10);
  if (isNaN(groupId)) { res.status(400).json({ error: "Invalid group ID." }); return; }

  const searchQuery = String(req.query.search || "").trim().toLowerCase();

  const ck = `gc_${groupId}`;
  let allItems = cacheGet<Array<{ id: number; name: string; assetType: string; assetTypeId: number; price: number | null; thumbnailUrl: string | null }>>(ck, GROUP_CACHE_TTL);

  if (!allItems) {
    try {
      type GroupDetailItem = { id: number; name?: string; assetType?: number; price?: number | null; lowestPrice?: number | null; creatorName?: string };

      console.log(`[Clothing] Fetching all items for group ${groupId} via ItemConfig API...`);
      const rawItems: GroupDetailItem[] = [];
      const itemConfigItems = await fetchGroupItemsViaItemConfig(groupId, cookie);
      console.log(`[Clothing] ItemConfig API returned ${itemConfigItems.length} items for group ${groupId}`);
      rawItems.push(...itemConfigItems);

      if (rawItems.length === 0) {
        console.log("[Clothing] ItemConfig empty, trying Catalog API...");
        let cursor: string | null = null;
        let pages = 0;
        let retries = 0;

        while (pages < 30) {
          const url = `${CATALOG_API}/v1/search/items/details?category=Clothing&creatorType=Group&creatorTargetId=${groupId}&limit=30${cursor ? `&cursor=${cursor}` : ""}`;
          let resp = await throttledFetch(url, { headers: robloxHeaders(cookie) });

          if (resp.status === 429) {
            if (retries < 5) {
              retries++;
              console.log(`[Clothing] Group search rate limited, retry ${retries}...`);
              await new Promise(r => setTimeout(r, 4000 * retries));
              continue;
            }
            break;
          }

          if (!resp.ok) {
            const errBody = await resp.text().catch(() => "");
            console.error(`[Clothing] Group items API error status=${resp.status} body=${errBody.slice(0, 300)}`);
            break;
          }

          retries = 0;
          const data = await resp.json() as { data: GroupDetailItem[]; nextPageCursor?: string };
          rawItems.push(...(data.data || []));
          cursor = data.nextPageCursor || null;
          if (!cursor) break;
          pages++;
          await new Promise(r => setTimeout(r, 1000));
        }
      }

      const THUMB_LIMIT = 200;
      const thumbIds = rawItems.slice(0, THUMB_LIMIT).map(i => i.id);
      const thumbMap = await fetchThumbnails(thumbIds);

      allItems = rawItems.map(d => ({
        id: d.id,
        name: d.name || `Asset ${d.id}`,
        assetType: d.assetType === 12 ? "Pants" : d.assetType === 2 ? "TShirt" : "Shirt",
        assetTypeId: d.assetType || 11,
        price: d.price ?? d.lowestPrice ?? null,
        thumbnailUrl: thumbMap[d.id] || null,
      }));

      if (allItems.length > 0) {
        cacheSet(ck, allItems);
      }
      console.log(`[Clothing] Group ${groupId}: found ${allItems.length} total items`);
    } catch (err) {
      console.error("[Clothing] Group items error:", err);
      res.status(502).json({ error: "Failed to fetch group clothing." });
      return;
    }
  }

  let filtered = allItems;
  if (searchQuery) {
    filtered = allItems.filter(i =>
      i.name.toLowerCase().includes(searchQuery) ||
      String(i.id).includes(searchQuery)
    );
  }

  res.json({ items: filtered, total: allItems.length });
});

const ALLOWED_ASSET_HOSTS = ["roblox.com", "rbxcdn.com", "rbxtrk.com", "robloxcdn.com"];
function isAllowedAssetUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return ALLOWED_ASSET_HOSTS.some(d => h === d || h.endsWith(`.${d}`));
  } catch { return false; }
}

router.get("/clothing/:itemId/template", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  if (!cookie) { res.status(401).json({ error: "No active Roblox session." }); return; }

  const itemId = parseInt(req.params.itemId, 10);
  if (isNaN(itemId) || itemId <= 0) { res.status(400).json({ error: "Invalid item ID." }); return; }

  try {
    let assetName = `Asset_${itemId}`;
    let assetTypeId = 11;
    try {
      const dMap = await fetchItemDetails([itemId], cookie);
      const d = dMap.get(itemId);
      if (d) { assetName = d.name; assetTypeId = d.assetType; }
    } catch {}

    async function fetchRetry(url: string, init?: RequestInit, retries = 3): Promise<Response> {
      for (let attempt = 0; attempt < retries; attempt++) {
        const resp = await throttledFetch(url, init);
        if (resp.status === 429) {
          const delay = 2000 * (attempt + 1);
          console.log(`[Clothing] Template rate limited (attempt ${attempt + 1}), waiting ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        return resp;
      }
      return throttledFetch(url, init);
    }

    const xmlResp = await fetchRetry(`${ASSET_DELIVERY_API}/v1/asset/?id=${itemId}`, { headers: robloxHeaders(cookie) });
    if (!xmlResp.ok) { res.status(502).json({ error: `Asset fetch failed (${xmlResp.status})` }); return; }

    const ct = xmlResp.headers.get("content-type") || "";
    let texBuf: ArrayBuffer | null = null;
    let textureId: number | null = null;

    if (ct.includes("image")) {
      texBuf = await xmlResp.arrayBuffer();
    } else {
      const xml = await xmlResp.text();
      const m = xml.match(/rbxassetid:\/\/(\d+)/i)
        || xml.match(/<url>https?:\/\/[^<]*\/(\d+)[^<]*<\/url>/i)
        || xml.match(/assetid="(\d+)"/i);
      if (m) textureId = parseInt(m[1], 10);

      if (textureId) {
        const tr = await fetchRetry(`${ASSET_DELIVERY_API}/v1/asset/?id=${textureId}`, { headers: robloxHeaders(cookie) });
        if (tr.ok) texBuf = await tr.arrayBuffer();
      }

      if (!texBuf) {
        const fb = await fetchRetry(`https://assetdelivery.roblox.com/v2/asset?id=${itemId}`, { headers: robloxHeaders(cookie) });
        if (fb.ok) {
          const fbd = await fb.json() as { locations?: Array<{ location: string }> };
          const loc = fbd.locations?.[0]?.location;
          if (loc && isAllowedAssetUrl(loc)) {
            const ir = await fetch(loc);
            if (ir.ok) texBuf = await ir.arrayBuffer();
          }
        }
      }
    }

    if (!texBuf) { res.status(502).json({ error: "Could not extract texture." }); return; }

    const b64 = Buffer.from(texBuf).toString("base64");
    const clothingType = assetTypeId === 12 ? "Pants" : "Shirt";
    res.json({ b64, name: assetName, clothingType, originalId: itemId, textureId });
  } catch (err) {
    console.error("[Clothing] Template error:", err);
    res.status(502).json({ error: "Failed to extract clothing template." });
  }
});

async function pollOperation(operationId: string, cookie: string, csrf: string): Promise<{ done: boolean; assetId?: number; error?: string }> {
  const maxAttempts = 40;
  let delay = 1500;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(r => setTimeout(r, delay));
    try {
      const resp = await fetch(`${OPERATIONS_API}/${operationId}`, {
        headers: {
          "Cookie": `.ROBLOSECURITY=${cookie}`,
          "X-CSRF-TOKEN": csrf,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json",
          "Origin": "https://create.roblox.com",
          "Referer": "https://create.roblox.com/",
        },
      });

      if (resp.status === 429) {
        console.log(`[Clothing] Poll rate limited, backing off...`);
        delay = Math.min(delay * 2, 10000);
        continue;
      }

      if (resp.status >= 500) {
        console.log(`[Clothing] Poll server error ${resp.status}, retrying...`);
        delay = Math.min(delay + 1000, 8000);
        continue;
      }

      if (!resp.ok) {
        console.log(`[Clothing] Poll operation status=${resp.status}`);
        continue;
      }

      delay = 2000;

      const data = await resp.json() as {
        done?: boolean;
        response?: { assetId?: number | string };
        error?: { message?: string };
      };

      if (data.done) {
        if (data.response?.assetId) {
          return { done: true, assetId: typeof data.response.assetId === "string" ? parseInt(data.response.assetId, 10) : data.response.assetId };
        }
        if (data.error?.message) {
          return { done: true, error: data.error.message };
        }
        return { done: true, error: "Operation completed but no asset ID returned" };
      }
    } catch (e) {
      console.error(`[Clothing] Poll error (attempt ${attempt + 1}):`, e);
      delay = Math.min(delay + 500, 8000);
    }
  }
  return { done: false, error: "Upload timed out — check Roblox Creator Dashboard for pending uploads" };
}

router.post("/clothing/upload", async (req, res): Promise<void> => {
  const mainCookie = req.session.robloxCookie;
  if (!mainCookie) { res.status(401).json({ error: "No active Roblox session." }); return; }

  const { imageBase64, name, description, groupId, clothingType, price, altIndex } = req.body as {
    imageBase64?: string;
    name?: string;
    description?: string;
    groupId?: number;
    clothingType?: string;
    price?: number;
    altIndex?: number;
  };

  let cookie = mainCookie;
  if (altIndex !== undefined && altIndex !== null) {
    if (!Number.isInteger(altIndex) || altIndex < 0) {
      res.status(400).json({ error: "Invalid altIndex." }); return;
    }
    const alt = req.session.altAccounts?.[altIndex];
    if (!alt) { res.status(400).json({ error: "Alt account not found." }); return; }
    cookie = alt.cookie;
  }

  if (!imageBase64) { res.status(400).json({ error: "Image required." }); return; }
  if (!name || !name.trim()) { res.status(400).json({ error: "Name required." }); return; }
  if (!groupId || typeof groupId !== "number" || groupId <= 0) { res.status(400).json({ error: "Valid group ID required." }); return; }
  const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
  if (imageBase64.length > MAX_IMAGE_SIZE * 1.37) { res.status(400).json({ error: "Image too large (max 10MB)." }); return; }

  const isPants = clothingType === "Pants" || clothingType === "pants";
  const assetTypeName = isPants ? "Pants" : "Shirt";

  const csrf = await getRobloxCsrf(cookie);
  if (!csrf) { res.status(400).json({ error: "Failed to get CSRF. Session may have expired." }); return; }

  const imgBuf = Buffer.from(imageBase64, "base64");

  console.log(`[Clothing] Uploading ${assetTypeName} "${name}" to group ${groupId} via Open Cloud API...`);

  try {
    const requestJson = JSON.stringify({
      displayName: name.trim(),
      description: (description || "Uploaded via Limited.Ink").trim(),
      assetType: assetTypeName,
      creationContext: {
        expectedPrice: 10,
        creator: {
          groupId: groupId,
        },
      },
    });

    const boundary = "----LimitedInk" + Date.now();
    const parts: Buffer[] = [];

    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="fileContent"; filename="clothing.png"\r\nContent-Type: image/png\r\n\r\n`
    ));
    parts.push(imgBuf);
    parts.push(Buffer.from(`\r\n`));

    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="request"\r\nContent-Type: application/json\r\n\r\n${requestJson}\r\n`
    ));
    parts.push(Buffer.from(`--${boundary}--\r\n`));
    const fullBody = Buffer.concat(parts);

    const uploadResp = await fetch(UPLOAD_API, {
      method: "POST",
      headers: {
        "Cookie": `.ROBLOSECURITY=${cookie}`,
        "X-CSRF-TOKEN": csrf,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Origin": "https://create.roblox.com",
        "Referer": "https://create.roblox.com/",
      },
      body: fullBody,
    });

    const text = await uploadResp.text();
    console.log(`[Clothing] Upload response status=${uploadResp.status} body=${text.slice(0, 500)}`);

    if (uploadResp.status === 403 || uploadResp.status === 401) {
      res.status(401).json({ error: "Authentication failed. Check your Roblox cookie." });
      return;
    }

    if (uploadResp.status === 429) {
      res.status(429).json({ error: "Rate limited by Roblox. Wait a moment and try again." });
      return;
    }

    if (!uploadResp.ok) {
      let errMsg = `Upload failed (${uploadResp.status})`;
      try {
        const e = JSON.parse(text) as { message?: string; errors?: Array<{ message: string; code: number }> };
        if (e.message) errMsg = e.message;
        if (e.errors?.[0]?.message) errMsg = e.errors[0].message;
      } catch {}
      res.status(400).json({ error: errMsg });
      return;
    }

    let parsed: { operationId?: string; path?: string; done?: boolean; response?: { assetId?: number | string } };
    try {
      parsed = JSON.parse(text);
    } catch {
      res.status(502).json({ error: "Invalid response from Roblox upload API." });
      return;
    }

    if (parsed.done && parsed.response?.assetId) {
      const assetId = typeof parsed.response.assetId === "string" ? parseInt(parsed.response.assetId, 10) : parsed.response.assetId;
      console.log(`[Clothing] Instant upload success, assetId=${assetId}`);
      const salePrice = Math.max(price || 5, 5);
      const releaseOk = await setPrice(assetId, salePrice, cookie, csrf, groupId, name?.trim(), (description || "Uploaded via Limited.Ink").trim());
      res.json({
        assetId,
        released: releaseOk,
        price: releaseOk ? salePrice : null,
        message: releaseOk
          ? `Uploaded and listed at ${salePrice} R$`
          : `Uploaded (ID: ${assetId}) but failed to set price. You can set it manually on Roblox.`,
      });
      return;
    }

    const opId = parsed.operationId || parsed.path?.split("/").pop();
    if (!opId) {
      res.status(502).json({ error: "No operation ID returned from upload." });
      return;
    }

    console.log(`[Clothing] Got operationId=${opId}, polling...`);
    const result = await pollOperation(opId, cookie, csrf);

    if (!result.done) {
      res.status(504).json({ error: result.error || "Upload timed out." });
      return;
    }

    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }

    const assetId = result.assetId!;
    console.log(`[Clothing] Upload complete, assetId=${assetId}, setting price...`);

    const releaseOk = await setPrice(assetId, Math.max(price || 5, 5), cookie, csrf, groupId, name?.trim(), (description || "Uploaded via Limited.Ink").trim());

    res.json({
      assetId,
      released: releaseOk,
      price: releaseOk ? Math.max(price || 5, 5) : null,
      message: releaseOk
        ? `Uploaded and listed at ${Math.max(price || 5, 5)} R$`
        : `Uploaded (ID: ${assetId}) but failed to set price. You can set it manually on Roblox.`,
    });
  } catch (err) {
    console.error("[Clothing] Upload error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Upload failed" });
  }
});

async function getRobloxUserId(cookie: string): Promise<number | null> {
  try {
    const resp = await fetch("https://users.roblox.com/v1/users/authenticated", {
      headers: {
        Cookie: `.ROBLOSECURITY=${cookie}`,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    if (resp.ok) {
      const data = await resp.json() as { id: number };
      return data.id;
    }
  } catch {}
  return null;
}

async function setPrice(assetId: number, salePrice: number, cookie: string, csrf: string, groupId: number, itemName?: string, itemDesc?: string): Promise<boolean> {
  const userId = await getRobloxUserId(cookie);
  if (!userId) {
    console.log(`[Clothing] Could not get Roblox userId for publishing`);
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 3000 * attempt));
    const currentCsrf = attempt === 0 ? csrf : await getRobloxCsrf(cookie);

    const hdrs: Record<string, string> = {
      "Cookie": `.ROBLOSECURITY=${cookie}`,
      "X-CSRF-TOKEN": currentCsrf,
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Referer": "https://create.roblox.com/",
      "Origin": "https://create.roblox.com",
    };

    const idempotencyToken = crypto.randomUUID();

    const collectiblesBody = JSON.stringify({
      targetId: assetId,
      targetType: 0,
      creatorGroupId: groupId,
      publisherUserId: userId || 0,
      priceInRobux: salePrice,
      agreedPublishingFee: 10,
      publishingType: 2,
      isFree: false,
      isRentalOptIn: false,
      quantity: 0,
      quantityLimitPerUser: 0,
      resaleRestriction: 2,
      saleLocationConfiguration: { saleLocationType: 1, places: [] },
      optOutFromRegionalPricing: false,
      priceOffset: 0,
      name: itemName || "",
      description: itemDesc || "",
      idempotencyToken,
    });

    try {
      console.log(`[Clothing] Publishing via /v1/collectibles: assetId=${assetId} price=${salePrice} group=${groupId} user=${userId}`);
      const releaseResp = await fetch(`${ITEM_CONFIG_API}/v1/collectibles`, {
        method: "POST",
        headers: hdrs,
        body: collectiblesBody,
      });

      if (releaseResp.ok) {
        console.log(`[Clothing] Publish success for asset ${assetId} at ${salePrice} R$`);
        return true;
      }

      const respText = await releaseResp.text().catch(() => "");
      console.log(`[Clothing] Publish attempt ${attempt + 1} failed: status=${releaseResp.status} body=${respText.slice(0, 300)}`);

      if (releaseResp.status === 403) {
        const newCsrf = releaseResp.headers.get("x-csrf-token");
        if (newCsrf) {
          hdrs["X-CSRF-TOKEN"] = newCsrf;
          const retry = await fetch(`${ITEM_CONFIG_API}/v1/collectibles`, {
            method: "POST",
            headers: { ...hdrs, "X-CSRF-TOKEN": newCsrf },
            body: collectiblesBody,
          });
          if (retry.ok) {
            console.log(`[Clothing] Publish success on CSRF retry for asset ${assetId}`);
            return true;
          }
          const retryText = await retry.text().catch(() => "");
          console.log(`[Clothing] Publish CSRF retry failed: status=${retry.status} body=${retryText.slice(0, 300)}`);
        }
      }

      if (releaseResp.status === 429) {
        console.log("[Clothing] Publish rate limited, waiting longer...");
        await new Promise(r => setTimeout(r, 5000 * (attempt + 1)));
      }
    } catch (err) {
      console.error(`[Clothing] Publish error attempt ${attempt + 1}:`, err);
    }
  }
  return false;
}

router.post("/clothing/bulk-download", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  if (!cookie) { res.status(401).json({ error: "No active Roblox session." }); return; }

  const { itemIds } = req.body as { itemIds?: number[] };
  if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
    res.status(400).json({ error: "Item IDs required." }); return;
  }
  if (itemIds.length > 50) {
    res.status(400).json({ error: "Max 50 items per batch." }); return;
  }

  let nameMap = new Map<number, string>();
  try {
    const dMap = await fetchItemDetails(itemIds, cookie);
    for (const [id, d] of dMap) nameMap.set(id, d.name);
  } catch {}

  async function fetchWithRetry(url: string, init?: RequestInit, retries = 4): Promise<Response> {
    for (let attempt = 0; attempt < retries; attempt++) {
      const resp = await throttledFetch(url, init);
      if (resp.status === 429) {
        const delay = 3000 * (attempt + 1);
        console.log(`[Clothing] Bulk download rate limited (attempt ${attempt + 1}), waiting ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      return resp;
    }
    return throttledFetch(url, init);
  }

  const archiver = (await import("archiver")).default;
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="clothing_${Date.now()}.zip"`);

  const archive = archiver("zip", { zlib: { level: 5 } });
  archive.pipe(res);

  let downloaded = 0;
  let failed = 0;

  for (const itemId of itemIds) {
    const assetName = nameMap.get(itemId) || `Asset_${itemId}`;
    const safeName = assetName.replace(/[^a-z0-9_. -]/gi, "_");
    try {
      const xmlResp = await fetchWithRetry(`${ASSET_DELIVERY_API}/v1/asset/?id=${itemId}`, { headers: robloxHeaders(cookie) });
      if (!xmlResp.ok) { failed++; continue; }

      const ct = xmlResp.headers.get("content-type") || "";
      let texBuf: ArrayBuffer | null = null;

      if (ct.includes("image")) {
        texBuf = await xmlResp.arrayBuffer();
      } else {
        const xml = await xmlResp.text();
        const m = xml.match(/rbxassetid:\/\/(\d+)/i) || xml.match(/<url>https?:\/\/[^<]*\/(\d+)[^<]*<\/url>/i);
        if (m) {
          const texId = parseInt(m[1], 10);
          const tr = await fetchWithRetry(`${ASSET_DELIVERY_API}/v1/asset/?id=${texId}`, { headers: robloxHeaders(cookie) });
          if (tr.ok) texBuf = await tr.arrayBuffer();
        }
      }

      if (!texBuf) {
        const fb = await fetchWithRetry(`https://assetdelivery.roblox.com/v2/asset?id=${itemId}`, { headers: robloxHeaders(cookie) });
        if (fb.ok) {
          const fbd = await fb.json() as { locations?: Array<{ location: string }> };
          const loc = fbd.locations?.[0]?.location;
          if (loc && isAllowedAssetUrl(loc)) {
            const ir = await fetch(loc);
            if (ir.ok) texBuf = await ir.arrayBuffer();
          }
        }
      }

      if (texBuf) {
        archive.append(Buffer.from(texBuf), { name: `${safeName}_${itemId}.png` });
        downloaded++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`[Clothing] Bulk download ZIP: ${downloaded} ok, ${failed} failed out of ${itemIds.length}`);
  await archive.finalize();
});

export default router;
