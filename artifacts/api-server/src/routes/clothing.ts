import { Router, type IRouter } from "express";

const router: IRouter = Router();

const CATALOG_API = "https://catalog.roblox.com";
const THUMBNAILS_API = "https://thumbnails.roblox.com";
const ASSET_DELIVERY_API = "https://assetdelivery.roblox.com";
const ITEM_CONFIG_API = "https://itemconfiguration.roblox.com";

const _cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 10 * 60_000;
function cacheGet<T>(k: string): T | null {
  const e = _cache.get(k);
  if (!e) return null;
  if (Date.now() - e.ts > CACHE_TTL) { _cache.delete(k); return null; }
  return e.data as T;
}
function cacheSet(k: string, v: unknown) { _cache.set(k, { data: v, ts: Date.now() }); }

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
  for (let i = 0; i < ids.length; i += 120) {
    const batch = ids.slice(i, i + 120);
    try {
      const resp = await fetch(`${CATALOG_API}/v1/catalog/items/details`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Cookie": `.ROBLOSECURITY=${cookie}`,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        body: JSON.stringify({ items: batch.map(id => ({ itemType: "Asset", id })) }),
      });
      if (resp.ok) {
        const dd = await resp.json() as { data: DetailItem[] };
        for (const d of (dd.data || [])) map.set(d.id, d);
      } else {
        console.log(`[Clothing] Details API status=${resp.status} for batch starting ${batch[0]}`);
      }
    } catch (e) {
      console.error("[Clothing] Details fetch error:", e);
    }
    if (i + 120 < ids.length) await new Promise(r => setTimeout(r, 500));
  }
  return map;
}

async function fetchThumbnails(ids: number[]): Promise<Record<number, string | null>> {
  const map: Record<number, string | null> = {};
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    try {
      const r = await fetch(`${THUMBNAILS_API}/v1/assets?assetIds=${batch.join(",")}&size=420x420&format=Png&isCircular=false`);
      if (r.ok) {
        const d = await r.json() as { data: Array<{ targetId: number; imageUrl: string }> };
        d.data.forEach(t => { map[t.targetId] = t.imageUrl; });
      }
    } catch {}
  }
  return map;
}

router.get("/clothing/search", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  if (!cookie) { res.status(401).json({ error: "No active Roblox session." }); return; }

  const keyword = String(req.query.keyword || "").trim();
  if (!keyword) { res.status(400).json({ error: "Keyword required." }); return; }

  const validSub = ["ClassicShirts", "ClassicPants"];
  const subcategory = validSub.includes(String(req.query.subcategory)) ? String(req.query.subcategory) : "ClassicShirts";
  const sortType = Math.max(0, Math.min(parseInt(String(req.query.sortType || "0"), 10) || 0, 5));
  const sortAggregation = Math.max(0, Math.min(parseInt(String(req.query.sortAggregation || "0"), 10) || 0, 5));
  const rawMin = parseInt(String(req.query.minPrice || ""), 10);
  const rawMax = parseInt(String(req.query.maxPrice || ""), 10);
  const minPrice = !isNaN(rawMin) && rawMin >= 0 ? String(rawMin) : "";
  const maxPrice = !isNaN(rawMax) && rawMax >= 0 ? String(rawMax) : "";
  const limit = Math.max(1, Math.min(parseInt(String(req.query.limit || "120"), 10) || 120, 120));
  const creatorId = String(req.query.creatorId || "").trim();

  const ck = `cs_${keyword}_${subcategory}_${sortType}_${sortAggregation}_${minPrice}_${maxPrice}_${creatorId}`;
  const cached = cacheGet<unknown>(ck);
  if (cached) { res.json(cached); return; }

  const kw = encodeURIComponent(keyword);
  let url = `${CATALOG_API}/v1/search/items?category=Clothing&keyword=${kw}&limit=${limit}&salesTypeFilter=1&subcategory=${encodeURIComponent(subcategory)}`;
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

  try {
    let resp = await fetch(url, { headers: robloxHeaders(cookie) });
    if (resp.status === 429) {
      await new Promise(r => setTimeout(r, 5000));
      resp = await fetch(url, { headers: robloxHeaders(cookie) });
    }
    if (resp.status === 429) {
      res.status(429).json({ error: "Roblox rate limit. Wait a minute and try again." });
      return;
    }
    if (!resp.ok) {
      res.status(502).json({ error: `Catalog API error (${resp.status})` });
      return;
    }

    const raw = await resp.json() as { data: Array<{ id: number }> };
    const ids = (raw.data || []).map(i => i.id);

    if (ids.length === 0) {
      const payload = { items: [] };
      cacheSet(ck, payload);
      res.json(payload);
      return;
    }

    const detailMap = await fetchItemDetails(ids, cookie);
    const thumbMap = await fetchThumbnails(ids);

    const items = ids.map(id => {
      const d = detailMap.get(id);
      return {
        id,
        name: d?.name || `Asset ${id}`,
        assetType: d?.assetType === 12 ? "Pants" : "Shirt",
        assetTypeId: d?.assetType || 11,
        price: d?.price ?? d?.lowestPrice ?? null,
        creatorName: d?.creatorName || "",
        thumbnailUrl: thumbMap[id] || null,
      };
    });

    const payload = { items };
    cacheSet(ck, payload);
    res.json(payload);
  } catch (err) {
    console.error("[Clothing] Search error:", err);
    res.status(502).json({ error: "Failed to search catalog." });
  }
});

router.get("/clothing/group/:groupId/items", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  if (!cookie) { res.status(401).json({ error: "No active Roblox session." }); return; }

  const groupId = parseInt(req.params.groupId, 10);
  if (isNaN(groupId)) { res.status(400).json({ error: "Invalid group ID." }); return; }

  const searchQuery = String(req.query.search || "").trim().toLowerCase();

  const ck = `gc_${groupId}`;
  let allItems = cacheGet<Array<{ id: number; name: string; assetType: string; assetTypeId: number; price: number | null; thumbnailUrl: string | null }>>(ck);

  if (!allItems) {
    try {
      const rawIds: number[] = [];
      let cursor: string | null = null;
      let pages = 0;

      while (pages < 30) {
        const url = `${CATALOG_API}/v1/search/items?category=Clothing&creatorType=Group&creatorTargetId=${groupId}&limit=120&salesTypeFilter=1${cursor ? `&cursor=${cursor}` : ""}`;
        const resp = await fetch(url, { headers: robloxHeaders(cookie) });
        if (!resp.ok) break;

        const data = await resp.json() as { data: Array<{ id: number }>; nextPageCursor?: string };
        rawIds.push(...(data.data || []).map(i => i.id));
        cursor = data.nextPageCursor || null;
        if (!cursor) break;
        pages++;
        await new Promise(r => setTimeout(r, 400));
      }

      const detailMap = await fetchItemDetails(rawIds, cookie);
      const thumbMap = await fetchThumbnails(rawIds);

      allItems = rawIds.map(id => {
        const d = detailMap.get(id);
        return {
          id,
          name: d?.name || `Asset ${id}`,
          assetType: (d?.assetType ?? 11) === 12 ? "Pants" : "Shirt",
          assetTypeId: d?.assetType || 11,
          price: d?.price ?? d?.lowestPrice ?? null,
          thumbnailUrl: thumbMap[id] || null,
        };
      });

      cacheSet(ck, allItems);
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

    const xmlResp = await fetch(`${ASSET_DELIVERY_API}/v1/asset/?id=${itemId}`, { headers: robloxHeaders(cookie) });
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
        const tr = await fetch(`${ASSET_DELIVERY_API}/v1/asset/?id=${textureId}`, { headers: robloxHeaders(cookie) });
        if (tr.ok) texBuf = await tr.arrayBuffer();
      }

      if (!texBuf) {
        const fb = await fetch(`https://assetdelivery.roblox.com/v2/asset?id=${itemId}`, { headers: robloxHeaders(cookie) });
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

router.post("/clothing/upload", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  if (!cookie) { res.status(401).json({ error: "No active Roblox session." }); return; }

  const { imageBase64, name, description, groupId, clothingType, price } = req.body as {
    imageBase64?: string;
    name?: string;
    description?: string;
    groupId?: number;
    clothingType?: string;
    price?: number;
  };

  if (!imageBase64) { res.status(400).json({ error: "Image required." }); return; }
  if (!name || !name.trim()) { res.status(400).json({ error: "Name required." }); return; }
  if (!groupId || typeof groupId !== "number" || groupId <= 0) { res.status(400).json({ error: "Valid group ID required." }); return; }
  const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
  if (imageBase64.length > MAX_IMAGE_SIZE * 1.37) { res.status(400).json({ error: "Image too large (max 10MB)." }); return; }

  const isPants = clothingType === "Pants" || clothingType === "pants";
  const assetTypeNum = isPants ? 12 : 11;

  const csrf = await getRobloxCsrf(cookie);
  if (!csrf) { res.status(400).json({ error: "Failed to get CSRF. Session may have expired." }); return; }

  const imgBuf = Buffer.from(imageBase64, "base64");

  console.log(`[Clothing] Uploading ${isPants ? "pants" : "shirt"} "${name}" to group ${groupId}...`);

  const uploadEndpoints = [
    `${ITEM_CONFIG_API}/v1/avatar-assets/${assetTypeNum}/upload`,
    `${ITEM_CONFIG_API}/v2/avatar-assets/${assetTypeNum}/upload`,
    `https://data.roblox.com/Data/Upload.ashx?type=${isPants ? "Pants" : "Shirt"}&assetTypeId=${assetTypeNum}&name=${encodeURIComponent(name.trim())}&description=${encodeURIComponent((description || "Uploaded via Limited.Ink").trim())}&groupId=${groupId}&ispublic=True&allowComments=False`,
  ];

  try {
    let uploadOk = false;
    let assetId: number | null = null;
    let lastError = "Upload failed";

    for (const endpoint of uploadEndpoints) {
      let uploadResp: Response;
      if (endpoint.includes("Data/Upload.ashx")) {
        uploadResp = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Cookie": `.ROBLOSECURITY=${cookie}`,
            "X-CSRF-TOKEN": csrf,
            "Content-Type": "application/octet-stream",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://www.roblox.com/",
          },
          body: imgBuf,
        });

        const text = await uploadResp.text();
        console.log(`[Clothing] Upload (legacy) status=${uploadResp.status} body=${text.slice(0, 300)}`);

        if (uploadResp.ok) {
          const id = parseInt(text.trim(), 10);
          if (!isNaN(id) && id > 0) {
            assetId = id;
            uploadOk = true;
            break;
          }
        }
      } else {
        const configJson = JSON.stringify({
          name: name.trim(),
          description: (description || "Uploaded via Limited.Ink").trim(),
          creatorTargetId: groupId,
          creatorType: "Group",
        });

        const boundary = "----LimitedInk" + Date.now();
        const parts: Buffer[] = [];
        parts.push(Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="config"\r\nContent-Type: application/json\r\n\r\n${configJson}\r\n`
        ));
        parts.push(Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="media"; filename="clothing.png"\r\nContent-Type: image/png\r\n\r\n`
        ));
        parts.push(imgBuf);
        parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
        const fullBody = Buffer.concat(parts);

        uploadResp = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Cookie": `.ROBLOSECURITY=${cookie}`,
            "X-CSRF-TOKEN": csrf,
            "Content-Type": `multipart/form-data; boundary=${boundary}`,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://www.roblox.com/",
          },
          body: fullBody,
        });

        const text = await uploadResp.text();
        console.log(`[Clothing] Upload (${endpoint.includes("v2") ? "v2" : "v1"}) status=${uploadResp.status} body=${text.slice(0, 300)}`);

        if (uploadResp.ok) {
          try {
            const parsed = JSON.parse(text) as { assetId?: number };
            if (parsed.assetId) {
              assetId = parsed.assetId;
              uploadOk = true;
              break;
            }
          } catch {}
        }

        if (!uploadResp.ok) {
          try {
            const e = JSON.parse(text) as { message?: string; errors?: Array<{ message: string; code: number }> };
            if (e.errors?.[0]) {
              const code = e.errors[0].code;
              if (code === 1) { lastError = "Roblox upload requires 10 R$ — check balance."; break; }
              else if (code === 7) { lastError = "Invalid template image. Make sure it's a valid clothing PNG."; break; }
              else if (code === 9) { lastError = "No permission to upload to this group."; break; }
              else lastError = e.errors[0].message || lastError;
            } else if (e.message) lastError = e.message;
          } catch {}
          continue;
        }
      }
    }

    if (!uploadOk || !assetId) {
      res.status(400).json({ error: lastError });
      return;
    }

    console.log(`[Clothing] Uploaded assetId=${assetId}, setting price=${price || 5}...`);

    const salePrice = Math.max(price || 5, 5);
    let releaseOk = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 3000));
      const currentCsrf = attempt === 0 ? csrf : await getRobloxCsrf(cookie);
      try {
        const releaseResp = await fetch(`${ITEM_CONFIG_API}/v1/assets/${assetId}/release`, {
          method: "POST",
          headers: {
            "Cookie": `.ROBLOSECURITY=${cookie}`,
            "X-CSRF-TOKEN": currentCsrf,
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://www.roblox.com/",
          },
          body: JSON.stringify({
            price: salePrice,
            priceConfiguration: { priceInRobux: salePrice },
            saleStatus: "OnSale",
          }),
        });
        if (releaseResp.ok) {
          releaseOk = true;
          break;
        }
        console.log(`[Clothing] Release attempt ${attempt + 1} failed: ${releaseResp.status}`);
      } catch {}
    }

    res.json({
      assetId,
      released: releaseOk,
      price: releaseOk ? salePrice : null,
      message: releaseOk
        ? `Uploaded and listed at ${salePrice} R$`
        : `Uploaded (ID: ${assetId}) but failed to set price. You can set it manually on Roblox.`,
    });
  } catch (err) {
    console.error("[Clothing] Upload error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Upload failed" });
  }
});

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

  const results: Array<{ id: number; name: string; b64: string | null; error?: string }> = [];

  for (const itemId of itemIds) {
    try {
      let assetName = `Asset_${itemId}`;
      try {
        const dMap = await fetchItemDetails([itemId], cookie);
        const d = dMap.get(itemId);
        if (d) assetName = d.name;
      } catch {}

      const xmlResp = await fetch(`${ASSET_DELIVERY_API}/v1/asset/?id=${itemId}`, { headers: robloxHeaders(cookie) });
      if (!xmlResp.ok) {
        results.push({ id: itemId, name: assetName, b64: null, error: `Fetch failed (${xmlResp.status})` });
        continue;
      }

      const ct = xmlResp.headers.get("content-type") || "";
      let texBuf: ArrayBuffer | null = null;

      if (ct.includes("image")) {
        texBuf = await xmlResp.arrayBuffer();
      } else {
        const xml = await xmlResp.text();
        const m = xml.match(/rbxassetid:\/\/(\d+)/i) || xml.match(/<url>https?:\/\/[^<]*\/(\d+)[^<]*<\/url>/i);
        if (m) {
          const texId = parseInt(m[1], 10);
          const tr = await fetch(`${ASSET_DELIVERY_API}/v1/asset/?id=${texId}`, { headers: robloxHeaders(cookie) });
          if (tr.ok) texBuf = await tr.arrayBuffer();
        }
      }

      if (texBuf) {
        results.push({ id: itemId, name: assetName, b64: Buffer.from(texBuf).toString("base64") });
      } else {
        results.push({ id: itemId, name: assetName, b64: null, error: "Could not extract texture" });
      }
    } catch {
      results.push({ id: itemId, name: `Asset_${itemId}`, b64: null, error: "Download failed" });
    }
    await new Promise(r => setTimeout(r, 300));
  }

  res.json({ results });
});

export default router;
