import { Router, type IRouter } from "express";
import { RobloxAuthBody } from "@workspace/api-zod";
import { db, featuredGroups } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

// ── Simple in-memory cache (TTL = 3 min) ─────────────────────────────────────
const _cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

function cacheGet<T>(key: string): T | null {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) { _cache.delete(key); return null; }
  return entry.data as T;
}
function cacheSet(key: string, data: unknown) { _cache.set(key, { data, ts: Date.now() }); }

// Retry a Roblox fetch with backoff on 429
async function fetchRobloxWithRetry(url: string, cookie: string, retries = 2): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    const resp = await fetchRoblox(url, cookie);
    if (resp.status !== 429) return resp;
    if (i < retries) await new Promise(r => setTimeout(r, 2000 * (i + 1)));
  }
  return fetchRoblox(url, cookie);
}

const ROBLOX_USERS_API = "https://users.roblox.com";
const ROBLOX_GROUPS_API = "https://groups.roblox.com";
const ROBLOX_THUMBNAILS_API = "https://thumbnails.roblox.com";
const ROBLOX_ECONOMY_API = "https://economy.roblox.com";
const ROBLOX_CATALOG_API = "https://catalog.roblox.com";
const ROBLOX_FRIENDS_API = "https://friends.roblox.com";
const ROBLOX_BADGES_API = "https://badges.roblox.com";
const ROBLOX_ASSET_DELIVERY_API = "https://assetdelivery.roblox.com";

async function fetchRoblox(url: string, cookie: string, options: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...options,
    redirect: "follow",
    headers: {
      Cookie: `.ROBLOSECURITY=${cookie}`,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://www.roblox.com/",
      "Origin": "https://www.roblox.com",
      ...(options.headers || {}),
    },
  });
}

async function getRobloxCsrfToken(cookie: string): Promise<string | null> {
  try {
    const resp = await fetch("https://auth.roblox.com/v2/logout", {
      method: "POST",
      headers: {
        Cookie: `.ROBLOSECURITY=${cookie}`,
        "Content-Length": "0",
      },
    });
    return resp.headers.get("x-csrf-token");
  } catch {
    return null;
  }
}

async function fetchRobloxPost(url: string, cookie: string, body?: string): Promise<Response> {
  const csrfToken = await getRobloxCsrfToken(cookie);
  return fetch(url, {
    method: "POST",
    headers: {
      Cookie: `.ROBLOSECURITY=${cookie}`,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Content-Type": "application/json",
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
    },
    body,
  });
}

function extractRbxAssetId(xml: string): number | null {
  const match = xml.match(/rbxassetid:\/\/(\d+)/i);
  if (match) return parseInt(match[1], 10);
  const urlMatch = xml.match(/<url>https?:\/\/[^<]*\/(\d+)[^<]*<\/url>/i);
  if (urlMatch) return parseInt(urlMatch[1], 10);
  const assetMatch = xml.match(/assetid="(\d+)"/i);
  if (assetMatch) return parseInt(assetMatch[1], 10);
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────────────────────────────────────

router.post("/roblox/auth", async (req, res): Promise<void> => {
  const parsed = RobloxAuthBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { cookie } = parsed.data;

  const userResp = await fetchRoblox(`${ROBLOX_USERS_API}/v1/users/authenticated`, cookie);
  if (!userResp.ok) {
    res.status(401).json({ error: "Invalid or expired Roblox cookie." });
    return;
  }

  const userData = await userResp.json() as { id: number; name: string; displayName: string; description: string };

  let avatarUrl: string | null = null;
  try {
    const thumbResp = await fetch(
      `${ROBLOX_THUMBNAILS_API}/v1/users/avatar-headshot?userIds=${userData.id}&size=150x150&format=Png&isCircular=false`
    );
    if (thumbResp.ok) {
      const thumbData = await thumbResp.json() as { data: Array<{ imageUrl: string }> };
      avatarUrl = thumbData.data?.[0]?.imageUrl || null;
    }
  } catch {
    // ignore
  }

  req.session.robloxCookie = cookie;
  req.session.robloxUserId = userData.id;
  req.session.robloxProfile = {
    id: userData.id,
    name: userData.name,
    displayName: userData.displayName,
    description: userData.description || "",
    avatarUrl,
  };

  res.json(req.session.robloxProfile);
});

// ─────────────────────────────────────────────────────────────────────────────
// ME — lightweight session check / profile restore
// Returns the current Roblox profile if a server-side session exists.
// Used by the frontend on page load to auto-restore session without re-login.
// ─────────────────────────────────────────────────────────────────────────────

router.get("/roblox/me", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  const userId = req.session.robloxUserId;
  if (!cookie || !userId) {
    res.status(401).json({ error: "No active Roblox session." });
    return;
  }

  // Return the cached profile or re-fetch lightweight data
  if (req.session.robloxProfile) {
    res.json(req.session.robloxProfile);
    return;
  }

  try {
    const [userResp, avatarResp] = await Promise.allSettled([
      fetchRoblox(`${ROBLOX_USERS_API}/v1/users/${userId}`, cookie),
      fetch(`${ROBLOX_THUMBNAILS_API}/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`),
    ]);

    const userData = userResp.status === "fulfilled" && userResp.value.ok
      ? await userResp.value.json() as { id: number; name: string; displayName: string; description: string }
      : null;

    if (!userData) {
      res.status(401).json({ error: "Roblox session expired. Please sign in again." });
      return;
    }

    let avatarUrl: string | null = null;
    if (avatarResp.status === "fulfilled" && avatarResp.value.ok) {
      const d = await avatarResp.value.json() as { data: Array<{ imageUrl: string }> };
      avatarUrl = d.data?.[0]?.imageUrl || null;
    }

    const profile = { id: userData.id, name: userData.name, displayName: userData.displayName, description: userData.description || "", avatarUrl };
    req.session.robloxProfile = profile;
    res.json(profile);
  } catch {
    res.status(500).json({ error: "Failed to fetch profile." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// EXTENDED PROFILE
// ─────────────────────────────────────────────────────────────────────────────

router.get("/roblox/profile", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  const userId = req.session.robloxUserId;
  if (!cookie || !userId) {
    res.status(401).json({ error: "No active Roblox session." });
    return;
  }

  const [userResp, friendsResp, followersResp, followingResp, avatarResp] = await Promise.allSettled([
    fetchRoblox(`${ROBLOX_USERS_API}/v1/users/${userId}`, cookie),
    fetch(`${ROBLOX_FRIENDS_API}/v1/users/${userId}/friends/count`),
    fetch(`${ROBLOX_FRIENDS_API}/v1/users/${userId}/followers/count`),
    fetch(`${ROBLOX_FRIENDS_API}/v1/users/${userId}/followings/count`),
    fetch(`${ROBLOX_THUMBNAILS_API}/v1/users/avatar-headshot?userIds=${userId}&size=420x420&format=Png&isCircular=false`),
  ]);

  if (userResp.status !== "fulfilled" || !userResp.value.ok) {
    res.status(401).json({ error: "Failed to load profile." });
    return;
  }

  const userData = await userResp.value.json() as {
    id: number;
    name: string;
    displayName: string;
    description: string;
    created: string;
    isBanned: boolean;
    hasVerifiedBadge: boolean;
  };

  let friendsCount = 0;
  let followersCount = 0;
  let followingCount = 0;
  let avatarUrl: string | null = null;

  if (friendsResp.status === "fulfilled" && friendsResp.value.ok) {
    const d = await friendsResp.value.json() as { count: number };
    friendsCount = d.count;
  }
  if (followersResp.status === "fulfilled" && followersResp.value.ok) {
    const d = await followersResp.value.json() as { count: number };
    followersCount = d.count;
  }
  if (followingResp.status === "fulfilled" && followingResp.value.ok) {
    const d = await followingResp.value.json() as { count: number };
    followingCount = d.count;
  }
  if (avatarResp.status === "fulfilled" && avatarResp.value.ok) {
    const d = await avatarResp.value.json() as { data: Array<{ imageUrl: string }> };
    avatarUrl = d.data?.[0]?.imageUrl || null;
  }

  res.json({
    id: userData.id,
    name: userData.name,
    displayName: userData.displayName,
    description: userData.description || "",
    created: userData.created,
    isBanned: userData.isBanned,
    hasVerifiedBadge: userData.hasVerifiedBadge,
    friendsCount,
    followersCount,
    followingCount,
    avatarUrl,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GROUPS LIST
// ─────────────────────────────────────────────────────────────────────────────

router.get("/roblox/groups", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  if (!cookie) {
    res.status(401).json({ error: "No active Roblox session." });
    return;
  }

  const userResp = await fetchRoblox(`${ROBLOX_USERS_API}/v1/users/authenticated`, cookie);
  if (!userResp.ok) {
    req.session.destroy(() => {});
    res.status(401).json({ error: "Roblox session expired. Please sign in again." });
    return;
  }

  const userData = await userResp.json() as { id: number };

  const groupsResp = await fetchRoblox(`${ROBLOX_GROUPS_API}/v1/users/${userData.id}/groups/roles`, cookie);
  if (!groupsResp.ok) {
    res.status(401).json({ error: "Failed to load groups." });
    return;
  }

  const groupsData = await groupsResp.json() as {
    data: Array<{
      group: { id: number; name: string; description: string; memberCount: number; publicEntryAllowed: boolean; isLocked: boolean };
      role: { rank: number; name: string };
    }>
  };

  const ownerGroups = groupsData.data.filter(g => g.role.rank === 255);

  if (ownerGroups.length === 0) {
    res.json({ groups: [] });
    return;
  }

  const groupIds = ownerGroups.map(g => g.group.id).join(",");
  const thumbnailMap: Record<number, string | null> = {};
  try {
    const thumbResp = await fetch(
      `${ROBLOX_THUMBNAILS_API}/v1/groups/icons?groupIds=${groupIds}&size=150x150&format=Png&isCircular=false`
    );
    if (thumbResp.ok) {
      const thumbData = await thumbResp.json() as { data: Array<{ targetId: number; imageUrl: string }> };
      thumbData.data.forEach(t => { thumbnailMap[t.targetId] = t.imageUrl; });
    }
  } catch {
    // ignore
  }

  const groups = ownerGroups.map(g => ({
    id: g.group.id,
    name: g.group.name,
    description: g.group.description || "",
    memberCount: g.group.memberCount,
    thumbnailUrl: thumbnailMap[g.group.id] || null,
    publicEntryAllowed: g.group.publicEntryAllowed,
    isLocked: g.group.isLocked,
  }));

  try {
    const now = new Date();
    const topGroup = [...groups].sort((a, b) => b.memberCount - a.memberCount)[0];
    if (topGroup) {
      await db
        .insert(featuredGroups)
        .values({
          groupId: topGroup.id,
          name: topGroup.name,
          memberCount: topGroup.memberCount,
          thumbnailUrl: topGroup.thumbnailUrl,
          ownerUserId: userData.id,
          lastActiveAt: now,
        })
        .onConflictDoUpdate({
          target: featuredGroups.groupId,
          set: {
            name: topGroup.name,
            memberCount: topGroup.memberCount,
            thumbnailUrl: topGroup.thumbnailUrl,
            ownerUserId: userData.id,
            lastActiveAt: now,
          },
        });
    }
  } catch (err) {
    console.error("[featured_groups] Failed to upsert group:", err);
  }

  res.json({ groups });
});

// ─────────────────────────────────────────────────────────────────────────────
// GROUP STATS (enhanced with pending + revenue)
// ─────────────────────────────────────────────────────────────────────────────

router.get("/roblox/groups/:groupId/stats", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  if (!cookie) {
    res.status(401).json({ error: "No active Roblox session." });
    return;
  }

  const rawId = Array.isArray(req.params.groupId) ? req.params.groupId[0] : req.params.groupId;
  const groupId = parseInt(rawId, 10);

  if (isNaN(groupId)) {
    res.status(400).json({ error: "Invalid group ID." });
    return;
  }

  const meResp = await fetchRoblox(`${ROBLOX_USERS_API}/v1/users/authenticated`, cookie);
  if (!meResp.ok) {
    req.session.destroy(() => {});
    res.status(401).json({ error: "Roblox session expired. Please sign in again." });
    return;
  }
  const meData = await meResp.json() as { id: number };

  const ownerCheckResp = await fetchRoblox(`${ROBLOX_GROUPS_API}/v1/users/${meData.id}/groups/roles`, cookie);
  if (!ownerCheckResp.ok) {
    res.status(403).json({ error: "Failed to verify group access rights." });
    return;
  }
  const ownerCheckData = await ownerCheckResp.json() as {
    data: Array<{ group: { id: number }; role: { rank: number } }>;
  };
  const isOwner = ownerCheckData.data.some(g => g.group.id === groupId && g.role.rank === 255);
  if (!isOwner) {
    res.status(403).json({ error: "You do not have access to this group." });
    return;
  }

  const [groupResp, fundsResp, revSummaryResp, thumbResp] = await Promise.allSettled([
    fetch(`${ROBLOX_GROUPS_API}/v1/groups/${groupId}`),
    fetchRoblox(`${ROBLOX_ECONOMY_API}/v1/groups/${groupId}/currency`, cookie),
    fetchRoblox(`${ROBLOX_ECONOMY_API}/v1/groups/${groupId}/revenue/summary/Day`, cookie),
    fetch(`${ROBLOX_THUMBNAILS_API}/v1/groups/icons?groupIds=${groupId}&size=150x150&format=Png&isCircular=false`),
  ]);

  if (groupResp.status !== "fulfilled" || !groupResp.value.ok) {
    res.status(404).json({ error: "Group not found." });
    return;
  }

  const groupData = await groupResp.value.json() as {
    id: number; name: string; description: string;
    memberCount: number; publicEntryAllowed: boolean;
    isLocked: boolean; joinType: string;
  };

  let funds = 0;
  if (fundsResp.status === "fulfilled" && fundsResp.value.ok) {
    const d = await fundsResp.value.json() as { robux: number };
    funds = d.robux;
  }

  let pendingRobux = 0;
  let salesRevenue24h = 0;
  let salesCount24h = 0;
  if (revSummaryResp.status === "fulfilled" && revSummaryResp.value.ok) {
    const d = await revSummaryResp.value.json() as {
      recurringRobuxStipend?: number;
      itemSaleRobux?: number;
      purchasedRobux?: number;
      tradeSystemRobux?: number;
      pendingRobux?: number;
      groupPayoutRobux?: number;
      individualToGroupRobux?: number;
    };
    pendingRobux = d.pendingRobux ?? 0;
    salesRevenue24h = d.itemSaleRobux ?? 0;
  }

  let thumbnailUrl: string | null = null;
  if (thumbResp.status === "fulfilled" && thumbResp.value.ok) {
    const d = await thumbResp.value.json() as { data: Array<{ imageUrl: string }> };
    thumbnailUrl = d.data?.[0]?.imageUrl || null;
  }

  // Try to get today's transaction count
  try {
    const txResp = await fetchRoblox(
      `${ROBLOX_ECONOMY_API}/v2/groups/${groupId}/transactions?transactionType=Sale&limit=100`,
      cookie
    );
    if (txResp.ok) {
      const txData = await txResp.json() as { data: Array<{ created: string; revenue: number }> };
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const todayTx = txData.data.filter(t => new Date(t.created) > dayAgo);
      salesCount24h = todayTx.length;
      if (salesRevenue24h === 0) {
        salesRevenue24h = todayTx.reduce((sum, t) => sum + Math.abs(t.revenue || 0), 0);
      }
    }
  } catch {
    // ignore
  }

  db.insert(featuredGroups)
    .values({
      groupId: groupData.id,
      name: groupData.name,
      memberCount: groupData.memberCount,
      thumbnailUrl,
      ownerUserId: meData.id,
      lastActiveAt: new Date(),
    })
    .onConflictDoUpdate({
      target: featuredGroups.groupId,
      set: {
        name: groupData.name,
        memberCount: groupData.memberCount,
        thumbnailUrl,
        ownerUserId: meData.id,
        lastActiveAt: new Date(),
      },
    })
    .catch(err => console.error("[featured_groups] stats touch failed:", err));

  res.json({
    id: groupData.id,
    name: groupData.name,
    description: groupData.description || "",
    memberCount: groupData.memberCount,
    funds,
    pendingRobux,
    salesRevenue24h,
    salesCount24h,
    joinPolicy: groupData.joinType || (groupData.publicEntryAllowed ? "Open" : "Closed"),
    isLocked: groupData.isLocked,
    publicEntryAllowed: groupData.publicEntryAllowed,
    thumbnailUrl,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GROUP CLOTHING LIST (for copy feature)
// ─────────────────────────────────────────────────────────────────────────────

router.get("/roblox/groups/:groupId/clothing", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  if (!cookie) {
    res.status(401).json({ error: "No active Roblox session." });
    return;
  }

  const rawId = Array.isArray(req.params.groupId) ? req.params.groupId[0] : req.params.groupId;
  const groupId = parseInt(rawId, 10);

  if (isNaN(groupId)) {
    res.status(400).json({ error: "Invalid group ID." });
    return;
  }

  type RobloxCatalogItem = { id: number; name: string; itemType: string; assetType: number; price: number | null; creatorName: string };

  const cacheKey = `group_clothing_all_${groupId}`;
  const cached = cacheGet<{ items: unknown[] }>(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  type PagedResult = { data: RobloxCatalogItem[]; nextPageCursor?: string };

  console.log(`[Catalog] Fetching ALL clothing for group ${groupId}...`);

  const allCatalogItems: RobloxCatalogItem[] = [];
  let cursor: string | null = null;
  let pages = 0;
  const MAX_PAGES = 50;
  let retryCount = 0;
  const MAX_RETRIES = 5;
  let firstStatus = 200;

  while (pages < MAX_PAGES) {
    const url = `${ROBLOX_CATALOG_API}/v1/search/items?category=Clothing&creatorType=Group&creatorTargetId=${groupId}&limit=120${cursor ? `&cursor=${cursor}` : ""}`;
    const clothingResp = await fetchRobloxWithRetry(url, cookie, 2);

    if (pages === 0) firstStatus = clothingResp.status;

    if (!clothingResp.ok) {
      if (clothingResp.status === 429 && retryCount < MAX_RETRIES) {
        retryCount++;
        const waitTime = 3000 * retryCount;
        console.log(`[Catalog] Rate limited on page ${pages + 1}, waiting ${waitTime / 1000}s (retry ${retryCount}/${MAX_RETRIES})...`);
        await new Promise(r => setTimeout(r, waitTime));
        continue;
      }
      break;
    }
    retryCount = 0;

    try {
      const data = await clothingResp.json() as PagedResult;
      const items = (data.data || []).filter(i =>
        !i.assetType || i.assetType === 2 || i.assetType === 11 || i.assetType === 12
      );
      allCatalogItems.push(...items);
      cursor = data.nextPageCursor || null;
      if (!cursor) break;
      pages++;
      await new Promise(r => setTimeout(r, 500));
    } catch {
      break;
    }
  }

  console.log(`[Catalog] Fetched ${allCatalogItems.length} items across ${pages + 1} pages`);

  if (allCatalogItems.length === 0 && pages === 0) {
    console.log(`[Catalog] Primary empty — trying creatorType=1 fallback`);
    const fb1 = await fetchRobloxWithRetry(
      `${ROBLOX_CATALOG_API}/v1/search/items?category=Clothing&creatorType=User&creatorTargetId=${groupId}&limit=120`,
      cookie, 1
    );
    if (fb1.ok) {
      try {
        const data = await fb1.json() as PagedResult;
        const items = (data.data || []).filter(i => i.assetType === 11 || i.assetType === 12);
        allCatalogItems.push(...items);
        console.log(`[Catalog] fallback-1 returned ${items.length} items`);
      } catch {}
    }
  }

  if (allCatalogItems.length === 0) {
    if (firstStatus === 429) {
      res.status(429).json({ error: "Roblox is rate limiting requests. Please wait 30 seconds and try again." });
      return;
    }
    if (firstStatus === 401 || firstStatus === 403) {
      res.status(401).json({ error: "Roblox session expired. Please sign in again in Settings." });
      return;
    }
    res.json({ items: [] });
    return;
  }

  const thumbMap: Record<number, string | null> = {};
  const allIds = allCatalogItems.map(i => i.id);
  for (let i = 0; i < allIds.length; i += 100) {
    const batch = allIds.slice(i, i + 100);
    try {
      const thumbResp = await fetch(
        `${ROBLOX_THUMBNAILS_API}/v1/assets?assetIds=${batch.join(",")}&size=420x420&format=Png&isCircular=false`
      );
      if (thumbResp.ok) {
        const thumbData = await thumbResp.json() as { data: Array<{ targetId: number; imageUrl: string }> };
        thumbData.data.forEach(t => { thumbMap[t.targetId] = t.imageUrl; });
      }
    } catch {}
    if (i + 100 < allIds.length) await new Promise(r => setTimeout(r, 200));
  }

  const displayItems = allCatalogItems.map(item => ({
    id: item.id,
    name: item.name,
    assetType: item.assetType === 12 ? "Pants" : "Shirt",
    price: item.price,
    thumbnailUrl: thumbMap[item.id] || null,
  }));

  const truncated = pages >= MAX_PAGES - 1 && cursor !== null;
  const payload = { items: displayItems, truncated, pagesFetched: pages + 1 };
  cacheSet(cacheKey, payload);
  res.json(payload);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET CLOTHING TEMPLATE (for copying)
// ─────────────────────────────────────────────────────────────────────────────

router.get("/roblox/clothing/:itemId/template", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  if (!cookie) {
    res.status(401).json({ error: "No active Roblox session." });
    return;
  }

  const itemId = parseInt(req.params.itemId, 10);
  if (isNaN(itemId)) {
    res.status(400).json({ error: "Invalid item ID." });
    return;
  }

  // Get asset details (name + type)
  let assetName = `Item_${itemId}`;
  let assetTypeId = 11;
  try {
    const detailResp = await fetchRobloxPost(
      `${ROBLOX_CATALOG_API}/v1/catalog/items/details`,
      cookie,
      JSON.stringify({ items: [{ itemType: "Asset", id: itemId }] })
    );
    if (detailResp.ok) {
      const det = await detailResp.json() as { data: Array<{ name: string; assetType: number }> };
      assetName = det.data?.[0]?.name || assetName;
      assetTypeId = det.data?.[0]?.assetType || assetTypeId;
    }
  } catch { }

  // Step 1: Download the clothing XML
  const xmlResp = await fetchRoblox(`${ROBLOX_ASSET_DELIVERY_API}/v1/asset/?id=${itemId}`, cookie);
  if (!xmlResp.ok) {
    res.status(502).json({ error: `Failed to load clothing asset (HTTP ${xmlResp.status}).` });
    return;
  }

  const contentType = xmlResp.headers.get("content-type") || "";
  let textureId: number | null = null;
  let textureBuffer: ArrayBuffer | null = null;

  if (contentType.includes("image") || contentType.includes("png") || contentType.includes("jpeg")) {
    // Direct image response (already a texture)
    textureBuffer = await xmlResp.arrayBuffer();
  } else {
    // XML clothing asset — parse to find texture ID
    const xmlText = await xmlResp.text();
    textureId = extractRbxAssetId(xmlText);

    if (textureId) {
      // Step 2: Download the actual texture image
      const texResp = await fetchRoblox(`${ROBLOX_ASSET_DELIVERY_API}/v1/asset/?id=${textureId}`, cookie);
      if (texResp.ok) {
        textureBuffer = await texResp.arrayBuffer();
      }
    }

    // Fallback: try asset delivery v2
    if (!textureBuffer) {
      const fallbackResp = await fetchRoblox(`https://assetdelivery.roblox.com/v2/asset?id=${itemId}`, cookie);
      if (fallbackResp.ok) {
        const fallbackData = await fallbackResp.json() as { locations?: Array<{ location: string }> };
        const location = fallbackData.locations?.[0]?.location;
        if (location) {
          const imgResp = await fetch(location);
          if (imgResp.ok) textureBuffer = await imgResp.arrayBuffer();
        }
      }
    }
  }

  if (!textureBuffer) {
    res.status(502).json({ error: "Could not extract clothing texture. The item may be unavailable." });
    return;
  }

  const b64 = Buffer.from(textureBuffer).toString("base64");
  const clothingType = assetTypeId === 12 ? "Pants" : "Shirt";

  res.json({ b64_json: b64, name: assetName, clothingType, originalId: itemId, textureId });
});

// ─────────────────────────────────────────────────────────────────────────────
// CATALOG SEARCH
// ─────────────────────────────────────────────────────────────────────────────

router.get("/roblox/catalog/search", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  if (!cookie) {
    res.status(401).json({ error: "No active Roblox session." });
    return;
  }

  const keyword = String(req.query.keyword || "").trim();
  const limit = Math.min(parseInt(String(req.query.limit || "120"), 10), 120);
  const subcategory = String(req.query.subcategory || "");
  const sortType = parseInt(String(req.query.sortType || "0"), 10);

  if (!keyword) {
    res.status(400).json({ error: "Please provide a search keyword." });
    return;
  }

  type CatalogSearchItem = { id: number; name: string; itemType: string; assetType: number; price: number | null; creatorName: string };

  const cacheKey = `catalog_search_${keyword.toLowerCase()}_${limit}_${subcategory}_${sortType}`;
  const cached = cacheGet<{ items: unknown[] }>(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  const kw = encodeURIComponent(keyword);
  const lim2 = Math.min(limit, 120);
  console.log(`[CatalogSearch] keyword="${keyword}" limit=${lim2} subcategory="${subcategory}" sortType=${sortType}`);

  let searchUrl = `${ROBLOX_CATALOG_API}/v1/search/items?category=Clothing&keyword=${kw}&limit=${lim2}&sortType=${sortType}&salesTypeFilter=1`;
  if (subcategory) searchUrl += `&subcategory=${encodeURIComponent(subcategory)}`;
  else searchUrl += `&subcategory=ClassicShirts`;
  let searchResp: Response;
  try {
    searchResp = await fetch(searchUrl, {
      headers: { "Accept": "application/json" },
    });
    console.log(`[CatalogSearch] public status=${searchResp.status}`);

    if (searchResp.status === 429) {
      console.log(`[CatalogSearch] public rate limited, waiting 3s and retrying with cookie...`);
      await new Promise(r => setTimeout(r, 3000));
      searchResp = await fetchRobloxWithRetry(searchUrl, cookie, 3);
      console.log(`[CatalogSearch] retry status=${searchResp.status}`);
    } else if (!searchResp.ok) {
      console.log(`[CatalogSearch] public failed, trying with cookie...`);
      searchResp = await fetchRobloxWithRetry(searchUrl, cookie, 2);
      console.log(`[CatalogSearch] auth status=${searchResp.status}`);
    }
  } catch (e) {
    console.error(`[CatalogSearch] fetch error:`, e);
    res.status(502).json({ error: "Failed to reach Roblox catalog API." });
    return;
  }

  let items: CatalogSearchItem[] = [];

  if (searchResp.ok) {
    try {
      const raw = await searchResp.text();
      console.log(`[CatalogSearch] body length=${raw.length}, preview=${raw.slice(0, 200)}`);
      const data = JSON.parse(raw) as { data: CatalogSearchItem[] };
      const all = data.data || [];
      console.log(`[CatalogSearch] parsed ${all.length} items`);
      items = all.filter(i => !i.assetType || i.assetType === 2 || i.assetType === 11 || i.assetType === 12);
    } catch (e) {
      console.error(`[CatalogSearch] parse error:`, e);
    }
  } else if (searchResp.status === 429) {
    console.log(`[CatalogSearch] rate limited`);
    res.status(429).json({ error: "Roblox is rate limiting requests. Please wait 30 seconds and try again." });
    return;
  } else {
    const errBody = await searchResp.text().catch(() => "");
    console.log(`[CatalogSearch] error body: ${errBody.slice(0, 300)}`);
  }

  if (items.length === 0) {
    if (searchResp.status === 401 || searchResp.status === 403) {
      res.status(401).json({ error: "Roblox session expired. Please sign in again in Settings." });
      return;
    }
    console.log(`[CatalogSearch] returning empty results`);
    res.json({ items: [] });
    return;
  }

  const finalItems = items;

  // The search endpoint returns only {id, itemType}. We need to fetch
  // full details (name, price, assetType, creatorName) from the details endpoint.
  type DetailItem = {
    id: number;
    name: string;
    assetType: number;
    price: number | null;
    creatorName: string;
    creatorType: string;
    description: string;
  };
  const detailMap = new Map<number, DetailItem>();

  try {
    const detailBody = finalItems.map(i => ({ itemType: "Asset", id: i.id }));
    const detailResp = await fetch(`${ROBLOX_CATALOG_API}/v1/catalog/items/details`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ items: detailBody }),
    });
    if (detailResp.ok) {
      const detailData = await detailResp.json() as { data: DetailItem[] };
      for (const d of (detailData.data || [])) {
        detailMap.set(d.id, d);
      }
      console.log(`[CatalogSearch] fetched details for ${detailMap.size} items`);
    } else {
      console.log(`[CatalogSearch] details endpoint status=${detailResp.status}`);
    }
  } catch (e) {
    console.error(`[CatalogSearch] details fetch error:`, e);
  }

  // Fetch thumbnails
  const ids = finalItems.map(i => i.id).join(",");
  const thumbMap: Record<number, string | null> = {};
  if (ids) {
    try {
      const thumbResp = await fetch(
        `${ROBLOX_THUMBNAILS_API}/v1/assets?assetIds=${ids}&size=420x420&format=Png&isCircular=false`
      );
      if (thumbResp.ok) {
        const thumbData = await thumbResp.json() as { data: Array<{ targetId: number; imageUrl: string }> };
        thumbData.data.forEach(t => { thumbMap[t.targetId] = t.imageUrl; });
      }
    } catch {}
  }

  const result = finalItems.map(item => {
    const detail = detailMap.get(item.id);
    const assetType = detail?.assetType ?? item.assetType;
    return {
      id: item.id,
      name: detail?.name || item.name || `Item ${item.id}`,
      assetType: assetType === 12 ? "Pants" : "Shirt",
      price: detail?.price ?? item.price ?? null,
      creatorName: detail?.creatorName || item.creatorName || "",
      thumbnailUrl: thumbMap[item.id] || null,
    };
  });

  const payload = { items: result };
  cacheSet(cacheKey, payload);
  res.json(payload);
});

// ─────────────────────────────────────────────────────────────────────────────
// SALES MONITOR
// ─────────────────────────────────────────────────────────────────────────────

router.get("/roblox/groups/:groupId/sales", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  if (!cookie) {
    res.status(401).json({ error: "No active Roblox session." });
    return;
  }

  const rawId = Array.isArray(req.params.groupId) ? req.params.groupId[0] : req.params.groupId;
  const groupId = parseInt(rawId, 10);
  if (isNaN(groupId)) {
    res.status(400).json({ error: "Invalid group ID." });
    return;
  }

  const [dailyResp, txResp] = await Promise.allSettled([
    fetchRoblox(`${ROBLOX_ECONOMY_API}/v1/groups/${groupId}/revenue/summary/Day`, cookie),
    fetchRoblox(`${ROBLOX_ECONOMY_API}/v2/groups/${groupId}/transactions?transactionType=Sale&limit=100`, cookie),
  ]);

  let pendingRobux = 0;
  let todayRevenue = 0;
  let weekRevenue = 0;

  if (dailyResp.status === "fulfilled" && dailyResp.value.ok) {
    const d = await dailyResp.value.json() as {
      itemSaleRobux?: number;
      pendingRobux?: number;
    };
    todayRevenue = d.itemSaleRobux ?? 0;
    pendingRobux = d.pendingRobux ?? 0;
  }

  let recentSales: Array<{ id: string; created: string; revenue: number; description: string }> = [];
  if (txResp.status === "fulfilled" && txResp.value.ok) {
    const txData = await txResp.value.json() as {
      data: Array<{
        id: string;
        created: string;
        // Roblox Economy API v2 uses currency.amount (not revenue)
        currency?: { amount: number; type: string };
        revenue?: number; // keep for backward compat with older API versions
        details: { id: number; name: string; type: string };
        agent?: { id: number; type: string; name: string };
      }>
    };
    recentSales = txData.data.slice(0, 50).map(t => ({
      id: String(t.id),
      created: t.created,
      revenue: Math.abs(t.currency?.amount ?? t.revenue ?? 0),
      description: t.details?.name || "Sale",
    }));
  }

  // Weekly summary
  try {
    const weekResp = await fetchRoblox(
      `${ROBLOX_ECONOMY_API}/v1/groups/${groupId}/revenue/summary/Week`,
      cookie
    );
    if (weekResp.ok) {
      const d = await weekResp.json() as { itemSaleRobux?: number };
      weekRevenue = d.itemSaleRobux ?? 0;
    }
  } catch {
    // ignore
  }

  res.json({ pendingRobux, todayRevenue, weekRevenue, recentSales });
});

// ─────────────────────────────────────────────────────────────────────────────
// GROUP ANALYSIS (generates TXT report)
// ─────────────────────────────────────────────────────────────────────────────

router.get("/roblox/groups/:groupId/analyze", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  if (!cookie) {
    res.status(401).json({ error: "No active Roblox session." });
    return;
  }

  const rawId = Array.isArray(req.params.groupId) ? req.params.groupId[0] : req.params.groupId;
  const groupId = parseInt(rawId, 10);
  if (isNaN(groupId)) {
    res.status(400).json({ error: "Invalid group ID." });
    return;
  }

  const [groupResp, fundsResp, revDayResp, revWeekResp, revMonthResp, clothingResp] = await Promise.allSettled([
    fetch(`${ROBLOX_GROUPS_API}/v1/groups/${groupId}`),
    fetchRoblox(`${ROBLOX_ECONOMY_API}/v1/groups/${groupId}/currency`, cookie),
    fetchRoblox(`${ROBLOX_ECONOMY_API}/v1/groups/${groupId}/revenue/summary/Day`, cookie),
    fetchRoblox(`${ROBLOX_ECONOMY_API}/v1/groups/${groupId}/revenue/summary/Week`, cookie),
    fetchRoblox(`${ROBLOX_ECONOMY_API}/v1/groups/${groupId}/revenue/summary/Month`, cookie),
    fetch(`${ROBLOX_CATALOG_API}/v1/search/items?category=3&creatorType=2&creatorTargetId=${groupId}&limit=120`),
  ]);

  if (groupResp.status !== "fulfilled" || !groupResp.value.ok) {
    res.status(404).json({ error: "Group not found." });
    return;
  }

  const group = await groupResp.value.json() as {
    id: number; name: string; description: string;
    memberCount: number; publicEntryAllowed: boolean; isLocked: boolean; joinType: string;
  };

  let funds = 0;
  if (fundsResp.status === "fulfilled" && fundsResp.value.ok) {
    const d = await fundsResp.value.json() as { robux: number };
    funds = d.robux;
  }

  let dayData = { itemSaleRobux: 0, pendingRobux: 0 };
  let weekData = { itemSaleRobux: 0 };
  let monthData = { itemSaleRobux: 0 };
  if (revDayResp.status === "fulfilled" && revDayResp.value.ok) {
    dayData = { ...dayData, ...(await revDayResp.value.json() as typeof dayData) };
  }
  if (revWeekResp.status === "fulfilled" && revWeekResp.value.ok) {
    weekData = { ...weekData, ...(await revWeekResp.value.json() as typeof weekData) };
  }
  if (revMonthResp.status === "fulfilled" && revMonthResp.value.ok) {
    monthData = { ...monthData, ...(await revMonthResp.value.json() as typeof monthData) };
  }

  let clothingCount = 0;
  if (clothingResp.status === "fulfilled" && clothingResp.value.ok) {
    const d = await clothingResp.value.json() as { data: unknown[] };
    clothingCount = d.data?.length ?? 0;
  }

  const now = new Date().toLocaleString("en-US");
  const joinType = group.joinType || (group.publicEntryAllowed ? "Open" : "Closed");
  const avgDailyRevenue = dayData.itemSaleRobux;
  const avgWeeklyRevenue = weekData.itemSaleRobux;
  const avgMonthlyRevenue = monthData.itemSaleRobux;

  const suggestions: string[] = [];
  if (group.memberCount < 100) suggestions.push("• Member growth: small group — run ads via Roblox Sponsored Items.");
  if (group.memberCount > 0 && avgMonthlyRevenue / group.memberCount < 0.5) suggestions.push("• Monetization: low revenue per member — consider releasing limited collections.");
  if (!group.description || group.description.length < 50) suggestions.push("• Description: add a detailed group description to improve search visibility.");
  if (joinType === "Closed" && group.memberCount < 500) suggestions.push("• Recruitment: consider opening free entry at the early stage to grow faster.");
  if (clothingCount < 10) suggestions.push("• Catalog: add more clothing items — aim for at least 20-30 for steady sales.");
  if (dayData.pendingRobux > funds * 0.5) suggestions.push("• Finances: large Pending Robux volume — ensure sales comply with Roblox policy.");
  if (avgWeeklyRevenue < 100) suggestions.push("• Sales: low weekly revenue — try lowering prices or running discount events.");
  if (suggestions.length === 0) suggestions.push("• Group is in great shape! Keep releasing new content and watch trends.");

  const report = [
    `╔══════════════════════════════════════════════════════════╗`,
    `║          ANALYTICS REPORT — LIMITED.INK                  ║`,
    `╚══════════════════════════════════════════════════════════╝`,
    ``,
    `Report generated: ${now}`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `GROUP: ${group.name}`,
    `ID: ${group.id}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `KEY METRICS`,
    `  Members:             ${group.memberCount.toLocaleString()}`,
    `  Group balance:       ${funds.toLocaleString()} R$`,
    `  Pending Robux:       ${dayData.pendingRobux.toLocaleString()} R$`,
    `  Join policy:         ${joinType}`,
    `  Locked:              ${group.isLocked ? "Yes ⚠️" : "No"}`,
    `  Clothing items (30): ${clothingCount}`,
    ``,
    `FINANCIAL STATS`,
    `  Daily revenue:       ${avgDailyRevenue.toLocaleString()} R$`,
    `  Weekly revenue:      ${avgWeeklyRevenue.toLocaleString()} R$`,
    `  Monthly revenue:     ${avgMonthlyRevenue.toLocaleString()} R$`,
    ``,
    `GROUP DESCRIPTION`,
    `  ${group.description ? group.description.substring(0, 300) : "(none)"}`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `IMPROVEMENT RECOMMENDATIONS`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    ...suggestions,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `Generated by Limited.Ink — Roblox Group Management Panel`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
  ].join("\n");

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="analysis_${group.name.replace(/\s+/g, "_")}_${Date.now()}.txt"`);
  res.send(report);
});

// ─────────────────────────────────────────────────────────────────────────────
// ALT ACCOUNTS
// ─────────────────────────────────────────────────────────────────────────────

router.post("/roblox/alt", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  if (!cookie) {
    res.status(401).json({ error: "No active Roblox session." });
    return;
  }

  const { cookie: altCookie } = req.body as { cookie?: string };
  if (!altCookie || typeof altCookie !== "string") {
    res.status(400).json({ error: "Please provide an account cookie." });
    return;
  }

  const userResp = await fetchRoblox(`${ROBLOX_USERS_API}/v1/users/authenticated`, altCookie);
  if (!userResp.ok) {
    res.status(401).json({ error: "Invalid cookie. Account not found." });
    return;
  }

  const userData = await userResp.json() as { id: number; name: string; displayName: string };

  let avatarUrl: string | null = null;
  try {
    const thumbResp = await fetch(
      `${ROBLOX_THUMBNAILS_API}/v1/users/avatar-headshot?userIds=${userData.id}&size=150x150&format=Png&isCircular=false`
    );
    if (thumbResp.ok) {
      const d = await thumbResp.json() as { data: Array<{ imageUrl: string }> };
      avatarUrl = d.data?.[0]?.imageUrl || null;
    }
  } catch {
    // ignore
  }

  if (!req.session.altAccounts) req.session.altAccounts = [];

  const already = req.session.altAccounts.some(a => a.userId === userData.id);
  if (already) {
    res.status(409).json({ error: "This account has already been added." });
    return;
  }

  req.session.altAccounts.push({
    cookie: altCookie,
    userId: userData.id,
    name: userData.name,
    displayName: userData.displayName,
    avatarUrl,
  });

  res.json({
    index: req.session.altAccounts.length - 1,
    userId: userData.id,
    name: userData.name,
    displayName: userData.displayName,
    avatarUrl,
  });
});

router.get("/roblox/alt", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  if (!cookie) {
    res.status(401).json({ error: "No active Roblox session." });
    return;
  }

  const alts = (req.session.altAccounts || []).map((a, i) => ({
    index: i,
    userId: a.userId,
    name: a.name,
    displayName: a.displayName,
    avatarUrl: a.avatarUrl,
  }));

  res.json({ accounts: alts });
});

router.delete("/roblox/alt/:index", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  if (!cookie) {
    res.status(401).json({ error: "No active Roblox session." });
    return;
  }

  const idx = parseInt(req.params.index, 10);
  if (isNaN(idx) || !req.session.altAccounts || !req.session.altAccounts[idx]) {
    res.status(404).json({ error: "Account not found." });
    return;
  }

  req.session.altAccounts.splice(idx, 1);
  res.json({ status: "ok" });
});

router.get("/roblox/open-cloud-key", (req, res): void => {
  res.json({ hasKey: !!req.session.robloxOpenCloudApiKey });
});

router.post("/roblox/open-cloud-key", (req, res): void => {
  const { apiKey } = req.body as { apiKey?: string };
  if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length === 0) {
    res.status(400).json({ error: "API key is required." });
    return;
  }
  req.session.robloxOpenCloudApiKey = apiKey.trim();
  res.json({ status: "ok", hasKey: true });
});

router.delete("/roblox/open-cloud-key", (req, res): void => {
  delete req.session.robloxOpenCloudApiKey;
  res.json({ status: "ok", hasKey: false });
});

export default router;
