import { Router, type IRouter } from "express";

const router: IRouter = Router();

const CATALOG_API = "https://catalog.roblox.com";
const THUMBNAILS_API = "https://thumbnails.roblox.com";
const ASSET_DELIVERY_API = "https://assetdelivery.roblox.com";
const ITEM_CONFIG_API = "https://itemconfiguration.roblox.com";

const _cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 5 * 60_000;
function cacheGet<T>(k: string): T | null {
  const e = _cache.get(k);
  if (!e) return null;
  if (Date.now() - e.ts > CACHE_TTL) { _cache.delete(k); return null; }
  return e.data as T;
}
function cacheSet(k: string, v: unknown) { _cache.set(k, { data: v, ts: Date.now() }); }

async function getRobloxCsrf(cookie: string): Promise<string> {
  try {
    const r1 = await fetch("https://auth.roblox.com/", {
      method: "POST",
      headers: {
        "Cookie": `.ROBLOSECURITY=${cookie}`,
        "Content-Length": "0",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    const token = r1.headers.get("x-csrf-token");
    if (!token) return "";
    const r2 = await fetch("https://auth.roblox.com/", {
      method: "POST",
      headers: {
        "Cookie": `.ROBLOSECURITY=${cookie}`,
        "X-CSRF-TOKEN": token,
        "Content-Length": "0",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    return r2.headers.get("x-csrf-token") || token;
  } catch {
    return "";
  }
}

function robloxHeaders(cookie: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    "Cookie": `.ROBLOSECURITY=${cookie}`,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json",
    ...extra,
  };
}

router.get("/clothing/search", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  if (!cookie) { res.status(401).json({ error: "No active Roblox session." }); return; }

  const keyword = String(req.query.keyword || "").trim();
  if (!keyword) { res.status(400).json({ error: "Keyword required." }); return; }

  const validSubcategories = ["ClassicShirts", "ClassicPants"];
  const subcategory = validSubcategories.includes(String(req.query.subcategory)) ? String(req.query.subcategory) : "ClassicShirts";
  const sortType = Math.max(0, Math.min(parseInt(String(req.query.sortType || "0"), 10) || 0, 5));
  const sortAggregation = Math.max(0, Math.min(parseInt(String(req.query.sortAggregation || "0"), 10) || 0, 5));
  const rawMin = parseInt(String(req.query.minPrice || ""), 10);
  const rawMax = parseInt(String(req.query.maxPrice || ""), 10);
  const minPrice = !isNaN(rawMin) && rawMin >= 0 ? String(rawMin) : "";
  const maxPrice = !isNaN(rawMax) && rawMax >= 0 ? String(rawMax) : "";
  const limit = Math.max(1, Math.min(parseInt(String(req.query.limit || "120"), 10) || 120, 120));

  const ck = `clothing_search_${keyword}_${subcategory}_${sortType}_${sortAggregation}_${minPrice}_${maxPrice}`;
  const cached = cacheGet<unknown>(ck);
  if (cached) { res.json(cached); return; }

  const kw = encodeURIComponent(keyword);
  let url = `${CATALOG_API}/v1/search/items?category=Clothing&keyword=${kw}&limit=${limit}&salesTypeFilter=1&subcategory=${encodeURIComponent(subcategory)}`;
  if (sortType) url += `&sortType=${sortType}`;
  if (sortAggregation) url += `&sortAggregation=${sortAggregation}`;
  if (minPrice) url += `&minPrice=${minPrice}`;
  if (maxPrice) url += `&maxPrice=${maxPrice}`;

  console.log(`[Clothing] Search: ${url.slice(0, 200)}`);

  try {
    let resp = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!resp.ok) {
      resp = await fetch(url, { headers: robloxHeaders(cookie) });
    }
    if (resp.status === 429) {
      res.status(429).json({ error: "Roblox rate limit. Wait 30 seconds." });
      return;
    }
    if (!resp.ok) {
      res.status(502).json({ error: `Catalog API error (${resp.status})` });
      return;
    }

    const raw = await resp.json() as { data: Array<{ id: number; itemType: string; assetType?: number }> };
    const ids = (raw.data || []).map(i => i.id);

    if (ids.length === 0) {
      const payload = { items: [] };
      cacheSet(ck, payload);
      res.json(payload);
      return;
    }

    type DetailItem = { id: number; name: string; assetType: number; price: number | null; creatorName: string };
    const detailMap = new Map<number, DetailItem>();

    const detailResp = await fetch(`${CATALOG_API}/v1/catalog/items/details`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ items: ids.map(id => ({ itemType: "Asset", id })) }),
    });
    if (detailResp.ok) {
      const dd = await detailResp.json() as { data: DetailItem[] };
      for (const d of (dd.data || [])) detailMap.set(d.id, d);
    }

    const thumbMap: Record<number, string | null> = {};
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100);
      try {
        const tr = await fetch(`${THUMBNAILS_API}/v1/assets?assetIds=${batch.join(",")}&size=420x420&format=Png&isCircular=false`);
        if (tr.ok) {
          const td = await tr.json() as { data: Array<{ targetId: number; imageUrl: string }> };
          td.data.forEach(t => { thumbMap[t.targetId] = t.imageUrl; });
        }
      } catch {}
    }

    const items = ids.map(id => {
      const d = detailMap.get(id);
      return {
        id,
        name: d?.name || `Item ${id}`,
        assetType: d?.assetType === 12 ? "Pants" : "Shirt",
        assetTypeId: d?.assetType || 11,
        price: d?.price ?? null,
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

  const ck = `group_clothing_${groupId}`;
  const cached = cacheGet<unknown>(ck);
  if (cached) { res.json(cached); return; }

  try {
    type CI = { id: number; name: string; itemType: string; assetType: number; price: number | null; creatorName: string };
    const all: CI[] = [];
    let cursor: string | null = null;
    let pages = 0;

    while (pages < 30) {
      const url = `${CATALOG_API}/v1/search/items?category=Clothing&creatorType=Group&creatorTargetId=${groupId}&limit=120${cursor ? `&cursor=${cursor}` : ""}`;
      const resp = await fetch(url, { headers: robloxHeaders(cookie) });
      if (!resp.ok) break;

      const data = await resp.json() as { data: CI[]; nextPageCursor?: string };
      const items = (data.data || []).filter(i => !i.assetType || i.assetType === 11 || i.assetType === 12);
      all.push(...items);
      cursor = data.nextPageCursor || null;
      if (!cursor) break;
      pages++;
      await new Promise(r => setTimeout(r, 300));
    }

    const thumbMap: Record<number, string | null> = {};
    const allIds = all.map(i => i.id);
    for (let i = 0; i < allIds.length; i += 100) {
      const batch = allIds.slice(i, i + 100);
      try {
        const tr = await fetch(`${THUMBNAILS_API}/v1/assets?assetIds=${batch.join(",")}&size=420x420&format=Png&isCircular=false`);
        if (tr.ok) {
          const td = await tr.json() as { data: Array<{ targetId: number; imageUrl: string }> };
          td.data.forEach(t => { thumbMap[t.targetId] = t.imageUrl; });
        }
      } catch {}
    }

    const items = all.map(item => ({
      id: item.id,
      name: item.name,
      assetType: item.assetType === 12 ? "Pants" : "Shirt",
      assetTypeId: item.assetType || 11,
      price: item.price,
      thumbnailUrl: thumbMap[item.id] || null,
    }));

    const payload = { items };
    cacheSet(ck, payload);
    res.json(payload);
  } catch (err) {
    console.error("[Clothing] Group items error:", err);
    res.status(502).json({ error: "Failed to fetch group clothing." });
  }
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
    let assetName = `Item_${itemId}`;
    let assetTypeId = 11;
    try {
      const dr = await fetch(`${CATALOG_API}/v1/catalog/items/details`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ items: [{ itemType: "Asset", id: itemId }] }),
      });
      if (dr.ok) {
        const dd = await dr.json() as { data: Array<{ name: string; assetType: number }> };
        assetName = dd.data?.[0]?.name || assetName;
        assetTypeId = dd.data?.[0]?.assetType || assetTypeId;
      }
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
  const uploadUrl = `${ITEM_CONFIG_API}/v1/avatar-assets/${assetTypeNum}/upload`;

  const csrf = await getRobloxCsrf(cookie);
  if (!csrf) { res.status(400).json({ error: "Failed to get CSRF. Session may have expired." }); return; }

  const imgBuf = Buffer.from(imageBase64, "base64");

  const configJson = JSON.stringify({
    name: name.trim(),
    description: (description || "Uploaded via Limited.Ink").trim(),
    creatorTargetId: String(groupId),
    creatorType: "Group",
  });

  const boundary = "----LimitedInk" + Date.now();
  let body = "";
  body += `--${boundary}\r\n`;
  body += `Content-Disposition: form-data; name="config"; filename="config.json"\r\n`;
  body += `Content-Type: application/json\r\n\r\n`;
  body += configJson + "\r\n";

  const bodyStart = Buffer.from(body, "utf-8");
  const mediaHeader = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="media"; filename="clothing.png"\r\nContent-Type: image/png\r\n\r\n`,
    "utf-8"
  );
  const bodyEnd = Buffer.from(`\r\n--${boundary}--\r\n`, "utf-8");

  const fullBody = Buffer.concat([bodyStart, mediaHeader, imgBuf, bodyEnd]);

  console.log(`[Clothing] Uploading ${isPants ? "pants" : "shirt"} "${name}" to group ${groupId}...`);

  try {
    const uploadResp = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Cookie": `.ROBLOSECURITY=${cookie}`,
        "X-CSRF-TOKEN": csrf,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      body: fullBody,
    });

    const text = await uploadResp.text();
    console.log(`[Clothing] Upload status=${uploadResp.status} body=${text.slice(0, 300)}`);

    if (!uploadResp.ok) {
      let msg = `Upload failed (${uploadResp.status})`;
      try {
        const e = JSON.parse(text) as { message?: string; errors?: Array<{ message: string; code: number }> };
        if (e.errors?.[0]) {
          const code = e.errors[0].code;
          if (code === 1) msg = "Roblox upload requires 10 R$ — check balance.";
          else if (code === 7) msg = "Invalid template image. Make sure it's a valid clothing PNG.";
          else if (code === 9) msg = "No permission to upload to this group.";
          else msg = e.errors[0].message || msg;
        } else if (e.message) msg = e.message;
      } catch {}
      res.status(400).json({ error: msg });
      return;
    }

    let parsed: { assetId?: number } = {};
    try { parsed = JSON.parse(text); } catch {}
    const assetId = parsed.assetId;

    if (!assetId) {
      res.status(502).json({ error: "Upload succeeded but no asset ID returned." });
      return;
    }

    console.log(`[Clothing] Uploaded assetId=${assetId}, setting price=${price || 5}...`);

    const salePrice = Math.max(price || 5, 5);
    let releaseOk = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 2000 * attempt));

      const currentCsrf = attempt === 0 ? csrf : await getRobloxCsrf(cookie);
      const releaseResp = await fetch(`${ITEM_CONFIG_API}/v1/assets/${assetId}/release`, {
        method: "POST",
        headers: {
          "Cookie": `.ROBLOSECURITY=${cookie}`,
          "X-CSRF-TOKEN": currentCsrf,
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        body: JSON.stringify({
          price: salePrice,
          priceConfiguration: { priceInRobux: salePrice },
          saleStatus: "OnSale",
        }),
      });

      if (releaseResp.ok) {
        releaseOk = true;
        console.log(`[Clothing] Released assetId=${assetId} at ${salePrice} R$`);
        break;
      }
      console.log(`[Clothing] Release attempt ${attempt + 1} failed: ${releaseResp.status}`);
    }

    res.json({
      assetId,
      released: releaseOk,
      price: releaseOk ? salePrice : null,
      message: releaseOk
        ? `Uploaded and listed at ${salePrice} R$`
        : `Uploaded (ID: ${assetId}) but failed to set price. You can set it manually.`,
    });
  } catch (err) {
    console.error("[Clothing] Upload error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Upload failed" });
  }
});

export default router;
