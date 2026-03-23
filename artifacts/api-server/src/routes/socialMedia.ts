import { Router } from "express";
import { randomUUID } from "crypto";

const router = Router();

const CATALOG_API = "https://catalog.roblox.com";
const THUMBNAILS_API = "https://thumbnails.roblox.com";

function getHeaders(cookie: string) {
  return {
    "Cookie": `.ROBLOSECURITY=${cookie}`,
    "User-Agent": "Mozilla/5.0",
    "Referer": "https://www.roblox.com/",
  };
}

// ── Auto Post Config ──────────────────────────────────────────────────────────

router.get("/social-media/auto-post/config", (req, res): void => {
  res.json({
    config: req.session.autoPostConfig || {
      enabled: false, webhookId: "", groupId: "", template: "🆕 Новый товар: **{name}**\n💰 Цена: {price} Robux\n🔗 {link}", color: 0x5865F2, lastPostedItemId: null, lastChecked: null,
    },
  });
});

router.post("/social-media/auto-post/config", (req, res): void => {
  const { enabled, webhookId, groupId, template, color } = req.body;
  req.session.autoPostConfig = {
    enabled: !!enabled,
    webhookId: webhookId || "",
    groupId: groupId || "",
    template: template || "",
    color: color || 0x5865F2,
    lastPostedItemId: req.session.autoPostConfig?.lastPostedItemId ?? null,
    lastChecked: req.session.autoPostConfig?.lastChecked ?? null,
  };
  req.session.save(() => res.json({ ok: true }));
});

router.post("/social-media/auto-post/check", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  if (!cookie) { res.status(401).json({ error: "Not authenticated" }); return; }

  const config = req.session.autoPostConfig;
  if (!config || !config.enabled || !config.webhookId || !config.groupId) {
    res.json({ posted: 0, message: "Auto-post not configured" }); return;
  }

  const webhook = (req.session.webhooks || []).find(w => w.id === config.webhookId);
  if (!webhook || webhook.type !== "discord") {
    res.json({ posted: 0, message: "Discord webhook not found" }); return;
  }

  try {
    // Fetch latest group items from catalog
    const itemsRes = await fetch(
      `${CATALOG_API}/v1/search/items?groupId=${config.groupId}&limit=10&sortOrder=Desc&subcategory=Clothing`,
      { headers: getHeaders(cookie) }
    );
    const itemsData = await itemsRes.json() as any;
    const items: any[] = itemsData.data || [];

    if (!items.length) { res.json({ posted: 0, message: "No items found" }); return; }

    const lastId = config.lastPostedItemId;
    const newItems = lastId ? items.filter((i: any) => i.id > lastId) : items.slice(0, 1);

    if (!newItems.length) {
      config.lastChecked = Date.now();
      req.session.autoPostConfig = config;
      req.session.save(() => res.json({ posted: 0, message: "No new items" }));
      return;
    }

    // Get thumbnails
    const ids = newItems.map((i: any) => i.id).join(",");
    let thumbMap: Record<number, string> = {};
    try {
      const thumbRes = await fetch(`${THUMBNAILS_API}/v1/assets?assetIds=${ids}&size=420x420&format=Png`, { headers: getHeaders(cookie) });
      const thumbData = await thumbRes.json() as any;
      for (const t of (thumbData.data || [])) if (t.imageUrl) thumbMap[t.targetId] = t.imageUrl;
    } catch {}

    let postedCount = 0;
    for (const item of newItems.slice(0, 5)) {
      try {
        const thumb = thumbMap[item.id] || null;
        const price = item.price ?? item.lowestPrice ?? 0;
        const link = `https://www.roblox.com/catalog/${item.id}`;
        const desc = (config.template || "{name}")
          .replace("{name}", item.name || "Unknown")
          .replace("{price}", price === 0 ? "Free" : String(price))
          .replace("{link}", link);

        const body: any = {
          embeds: [{
            title: item.name || "New Item",
            description: desc,
            color: config.color || 0x5865F2,
            url: link,
            fields: [{ name: "Цена", value: price === 0 ? "Бесплатно" : `${price} R$`, inline: true }],
            footer: { text: "Limited.Ink Auto Post" },
            timestamp: new Date().toISOString(),
          }],
        };
        if (thumb) body.embeds[0].image = { url: thumb };

        const r = await fetch(webhook.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (r.ok || r.status === 204) {
          postedCount++;
          if (!req.session.autoPostHistory) req.session.autoPostHistory = [];
          req.session.autoPostHistory.unshift({
            id: randomUUID(),
            itemId: item.id,
            itemName: item.name || "Unknown",
            thumbnailUrl: thumb,
            webhookName: webhook.name,
            postedAt: Date.now(),
            success: true,
          });
          if (req.session.autoPostHistory.length > 50) req.session.autoPostHistory.pop();
        }
      } catch {}
    }

    config.lastPostedItemId = newItems[0].id;
    config.lastChecked = Date.now();
    req.session.autoPostConfig = config;
    req.session.save(() => res.json({ posted: postedCount, newItemsFound: newItems.length }));
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Error" });
  }
});

router.get("/social-media/auto-post/history", (req, res): void => {
  res.json({ history: req.session.autoPostHistory || [] });
});

router.delete("/social-media/auto-post/history", (req, res): void => {
  req.session.autoPostHistory = [];
  req.session.save(() => res.json({ ok: true }));
});

// ── Social Links (Link Hub) ───────────────────────────────────────────────────

router.get("/social-media/links", (req, res): void => {
  const links = (req.session.socialLinks || []).sort((a, b) => a.order - b.order);
  res.json({ links });
});

router.post("/social-media/links", (req, res): void => {
  const { title, url, icon, description, color } = req.body;
  if (!title || !url) { res.status(400).json({ error: "Title and URL required" }); return; }
  if (!req.session.socialLinks) req.session.socialLinks = [];
  const link = {
    id: randomUUID(),
    title, url, icon: icon || "🔗", description: description || "", color: color || "#000000",
    order: req.session.socialLinks.length,
    addedAt: Date.now(),
  };
  req.session.socialLinks.push(link);
  req.session.save(() => res.json({ link }));
});

router.patch("/social-media/links/:id", (req, res): void => {
  if (!req.session.socialLinks) { res.status(404).json({ error: "Not found" }); return; }
  req.session.socialLinks = req.session.socialLinks.map(l =>
    l.id === req.params.id ? { ...l, ...req.body, id: l.id } : l
  );
  req.session.save(() => res.json({ ok: true }));
});

router.delete("/social-media/links/:id", (req, res): void => {
  req.session.socialLinks = (req.session.socialLinks || []).filter(l => l.id !== req.params.id);
  req.session.save(() => res.json({ ok: true }));
});

router.post("/social-media/links/reorder", (req, res): void => {
  const { ids }: { ids: string[] } = req.body;
  if (!req.session.socialLinks) { res.status(400).json({ error: "No links" }); return; }
  req.session.socialLinks = req.session.socialLinks.map(l => ({ ...l, order: ids.indexOf(l.id) }));
  req.session.save(() => res.json({ ok: true }));
});

// ── Social Accounts ───────────────────────────────────────────────────────────

router.get("/social-media/accounts", (req, res): void => {
  res.json({ accounts: req.session.socialAccounts || [] });
});

router.post("/social-media/accounts", (req, res): void => {
  const { platform, handle, url, followers } = req.body;
  if (!platform || !handle) { res.status(400).json({ error: "Platform and handle required" }); return; }
  if (!req.session.socialAccounts) req.session.socialAccounts = [];
  const existing = req.session.socialAccounts.findIndex(a => a.platform === platform);
  const account = { id: randomUUID(), platform, handle, url: url || "", followers: followers ?? null };
  if (existing >= 0) req.session.socialAccounts[existing] = account;
  else req.session.socialAccounts.push(account);
  req.session.save(() => res.json({ account }));
});

router.delete("/social-media/accounts/:id", (req, res): void => {
  req.session.socialAccounts = (req.session.socialAccounts || []).filter(a => a.id !== req.params.id);
  req.session.save(() => res.json({ ok: true }));
});

// ── Dashboard summary ─────────────────────────────────────────────────────────

router.get("/social-media/dashboard", (req, res): void => {
  const webhooks = req.session.webhooks || [];
  const config = req.session.autoPostConfig;
  const history = req.session.autoPostHistory || [];
  const links = req.session.socialLinks || [];
  const accounts = req.session.socialAccounts || [];

  res.json({
    webhooksTotal: webhooks.length,
    webhooksEnabled: webhooks.filter(w => w.enabled).length,
    autoPostEnabled: config?.enabled ?? false,
    autoPostLastChecked: config?.lastChecked ?? null,
    postsTotal: history.length,
    postsToday: history.filter(h => h.postedAt > Date.now() - 86400000).length,
    linksTotal: links.length,
    accountsTotal: accounts.length,
    recentPosts: history.slice(0, 5),
    webhooks: webhooks.map(w => ({ id: w.id, name: w.name, type: w.type, enabled: w.enabled, lastTriggered: w.lastTriggered })),
  });
});

export default router;
