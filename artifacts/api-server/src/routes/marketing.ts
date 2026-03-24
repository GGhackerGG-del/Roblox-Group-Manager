import { Router, type IRouter } from "express";
import OpenAI from "openai";
import { randomUUID } from "crypto";

const router: IRouter = Router();

function getOpenAI(): OpenAI {
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!baseURL || !apiKey) throw new Error("OpenAI AI integration not configured.");
  return new OpenAI({ apiKey, baseURL });
}

async function chatJSON<T>(system: string, user: string): Promise<T> {
  const openai = getOpenAI();
  const res = await openai.chat.completions.create({
    model: "gpt-5.2",
    max_completion_tokens: 2048,
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0]?.message?.content || "{}") as T;
}

router.post("/marketing/seo-analyze", async (req, res): Promise<void> => {
  try {
    const { title, description, type, language } = req.body as {
      title?: string; description?: string; type?: string; language?: string;
    };
    if (!title) { res.status(400).json({ error: "title is required" }); return; }
    const lang = language === "ru" ? "Russian" : "English";
    const result = await chatJSON<{
      score: number;
      titleScore: number;
      descriptionScore: number;
      issues: Array<{ severity: "critical" | "warning" | "info"; field: "title" | "description" | "general"; message: string }>;
      suggestions: Array<{ field: "title" | "description"; current: string; improved: string; reason: string }>;
      optimizedTitle: string;
      optimizedDescription: string;
      keywords: string[];
    }>(
      `You are an SEO expert for Roblox UGC marketplace. Analyze a clothing item's title and description for search optimization.
Return JSON: {
  "score": 0-100 (overall SEO score),
  "titleScore": 0-100,
  "descriptionScore": 0-100,
  "issues": [{ "severity": "critical|warning|info", "field": "title|description|general", "message": "..." }, ...],
  "suggestions": [{ "field": "title|description", "current": "...", "improved": "...", "reason": "..." }, ...],
  "optimizedTitle": "...(ready-to-use optimized title)",
  "optimizedDescription": "...(ready-to-use optimized description, 100-200 words)",
  "keywords": ["keyword1", ...8 top keywords to use]
}
Respond in ${lang}. Be specific about Roblox marketplace search algorithm.`,
      `Title: "${title}"\nDescription: "${description || "(none)"}"\nType: ${type || "Shirt"}`
    );
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "AI error" });
  }
});

router.post("/marketing/keywords/research", async (req, res): Promise<void> => {
  try {
    const { category, subcategory, language } = req.body as {
      category?: string; subcategory?: string; language?: string;
    };
    const lang = language === "ru" ? "Russian" : "English";
    const result = await chatJSON<{
      topKeywords: Array<{ keyword: string; volume: "high" | "medium" | "low"; competition: "high" | "medium" | "low"; trend: "rising" | "stable" | "declining" }>;
      longTail: Array<{ phrase: string; intent: string; difficulty: "easy" | "medium" | "hard" }>;
      seasonal: Array<{ keyword: string; peakMonth: string; boost: string }>;
      competitors: string[];
      insights: string[];
    }>(
      `You are a Roblox UGC marketplace SEO analyst. Research keywords for clothing items.
Return JSON: {
  "topKeywords": [{ "keyword": "...", "volume": "high|medium|low", "competition": "high|medium|low", "trend": "rising|stable|declining" }, ...12],
  "longTail": [{ "phrase": "...", "intent": "...", "difficulty": "easy|medium|hard" }, ...8],
  "seasonal": [{ "keyword": "...", "peakMonth": "...", "boost": "+X%" }, ...4],
  "competitors": ["term1", ...6 competing search terms],
  "insights": ["insight1", ...5 actionable insights]
}
Respond in ${lang}.`,
      `Category: ${category || "Shirts"}\nSubcategory: ${subcategory || ""}`
    );
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "AI error" });
  }
});

router.post("/marketing/trends/analyze", async (req, res): Promise<void> => {
  try {
    const { items, language } = req.body as { items: Array<{ name: string; type: string }>; language?: string };
    if (!items?.length) { res.status(400).json({ error: "items array required" }); return; }
    const lang = language === "ru" ? "Russian" : "English";
    const result = await chatJSON<{
      analyses: Array<{
        name: string;
        trendScore: number;
        momentum: "rising" | "peak" | "declining" | "niche";
        salesPotential: "high" | "medium" | "low";
        recommendation: string;
        bestTime: string;
        tags: string[];
      }>;
      marketOverview: string;
    }>(
      `You are a Roblox UGC trend analyst. Analyze the market potential and trend status for clothing items.
Return JSON: {
  "analyses": [{
    "name": "...(item name from input)",
    "trendScore": 0-100,
    "momentum": "rising|peak|declining|niche",
    "salesPotential": "high|medium|low",
    "recommendation": "...(1-2 sentences)",
    "bestTime": "...(when to list/promote)",
    "tags": ["tag1", ...4]
  }, ...one per item],
  "marketOverview": "...(2-3 sentence market summary)"
}
Respond in ${lang}.`,
      `Items to analyze: ${items.map(i => `${i.name} (${i.type})`).join(", ")}`
    );
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "AI error" });
  }
});

router.get("/marketing/webhooks", (req, res): void => {
  res.json({ webhooks: req.session.webhooks || [] });
});

router.post("/marketing/webhooks", (req, res): void => {
  const { name, url, type, events, avatarUrl } = req.body as {
    name?: string; url?: string; type?: string; events?: string[]; avatarUrl?: string;
  };
  if (!name || !url || !type) { res.status(400).json({ error: "name, url, type required" }); return; }
  if (!req.session.webhooks) req.session.webhooks = [];
  const webhook = {
    id: randomUUID(),
    name,
    url,
    type: type as "discord" | "telegram",
    events: events || ["sale", "new_item"],
    enabled: true,
    addedAt: Date.now(),
    avatarUrl: avatarUrl || "",
  };
  req.session.webhooks.push(webhook);
  req.session.save(() => res.json({ webhook }));
});

router.patch("/marketing/webhooks/:id", (req, res): void => {
  const { id } = req.params;
  const { enabled, events, name, avatarUrl } = req.body as { enabled?: boolean; events?: string[]; name?: string; avatarUrl?: string };
  if (!req.session.webhooks) { res.status(404).json({ error: "Not found" }); return; }
  req.session.webhooks = req.session.webhooks.map(w =>
    w.id === id ? { ...w, ...(enabled !== undefined ? { enabled } : {}), ...(events ? { events } : {}), ...(name ? { name } : {}), ...(avatarUrl !== undefined ? { avatarUrl } : {}) } : w
  );
  req.session.save(() => res.json({ ok: true }));
});

router.delete("/marketing/webhooks/:id", (req, res): void => {
  req.session.webhooks = (req.session.webhooks || []).filter(w => w.id !== req.params.id);
  req.session.save(() => res.json({ ok: true }));
});

router.post("/marketing/webhooks/:id/test", async (req, res): Promise<void> => {
  const webhook = (req.session.webhooks || []).find(w => w.id === req.params.id);
  if (!webhook) { res.status(404).json({ error: "Webhook not found" }); return; }
  try {
    const profile = req.session.robloxProfile;
    if (webhook.type === "discord") {
      const payload = {
        username: "Limited.Ink",
        avatar_url: webhook.avatarUrl || "https://www.roblox.com/favicon.ico",
        embeds: [{
          title: "🔔 Test Notification",
          description: `Webhook successfully connected!\nGroup: ${profile?.name || "Unknown"}\nTriggered at: ${new Date().toLocaleString()}`,
          color: 0x5865F2,
          timestamp: new Date().toISOString(),
          footer: { text: "Limited.Ink Marketing" },
        }],
      };
      const r = await fetch(webhook.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000),
      });
      if (r.ok || r.status === 204) {
        req.session.webhooks = (req.session.webhooks || []).map(w => w.id === webhook.id ? { ...w, lastTriggered: Date.now() } : w);
        req.session.save(() => {});
        res.json({ ok: true, status: r.status });
      } else {
        const body = await r.text().catch(() => "");
        res.json({ ok: false, status: r.status, body: body.slice(0, 200) });
      }
    } else if (webhook.type === "telegram") {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (!botToken) { res.status(500).json({ error: "Telegram bot not configured" }); return; }
      const chatId = webhook.url;
      const r = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: `🔔 *Test Notification*\n\nWebhook successfully connected\\!\nGroup: ${profile?.name || "Unknown"}\nTime: ${new Date().toLocaleString()}`,
          parse_mode: "MarkdownV2",
        }),
        signal: AbortSignal.timeout(8000),
      });
      const data = await r.json() as { ok: boolean };
      if (data.ok) {
        req.session.webhooks = (req.session.webhooks || []).map(w => w.id === webhook.id ? { ...w, lastTriggered: Date.now() } : w);
        req.session.save(() => {});
        res.json({ ok: true });
      } else {
        res.json({ ok: false, error: JSON.stringify(data) });
      }
    } else {
      res.status(400).json({ error: "Unknown webhook type" });
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : "Request failed" });
  }
});

router.post("/marketing/webhooks/fire", async (req, res): Promise<void> => {
  const { event, title, description, color } = req.body as {
    event?: string; title?: string; description?: string; color?: number;
  };
  const webhooks = (req.session.webhooks || []).filter(w => w.enabled && w.events.includes(event || ""));
  const results: Array<{ id: string; ok: boolean }> = [];
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  for (const wh of webhooks) {
    try {
      if (wh.type === "discord") {
        const r = await fetch(wh.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: "Limited.Ink",
            avatar_url: wh.avatarUrl || undefined,
            embeds: [{ title: title || event, description, color: color || 0x5865F2, timestamp: new Date().toISOString() }],
          }),
          signal: AbortSignal.timeout(5000),
        });
        results.push({ id: wh.id, ok: r.ok || r.status === 204 });
      } else if (wh.type === "telegram" && botToken) {
        const r = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: wh.url, text: `${title}\n\n${description || ""}`, parse_mode: "Markdown" }),
          signal: AbortSignal.timeout(5000),
        });
        const data = await r.json() as { ok: boolean };
        results.push({ id: wh.id, ok: data.ok });
      }
    } catch { results.push({ id: wh.id, ok: false }); }
  }
  res.json({ fired: results.length, results });
});

router.get("/marketing/promotions", (req, res): void => {
  const promos = req.session.promotions || [];
  const now = Date.now();
  const updated = promos.map(p => ({
    ...p,
    status: (now >= p.startsAt && now <= p.endsAt ? "active" : now > p.endsAt ? "ended" : "scheduled") as "active" | "ended" | "scheduled",
  }));
  req.session.promotions = updated;
  res.json({ promotions: updated });
});

router.post("/marketing/promotions", (req, res): void => {
  const { title, description, discountPercent, startsAt, endsAt, itemType, webhookNotify } = req.body as {
    title?: string; description?: string; discountPercent?: number;
    startsAt?: number; endsAt?: number; itemType?: string; webhookNotify?: boolean;
  };
  if (!title || !startsAt || !endsAt) { res.status(400).json({ error: "title, startsAt, endsAt required" }); return; }
  if (!req.session.promotions) req.session.promotions = [];
  const now = Date.now();
  const promo = {
    id: randomUUID(),
    title,
    description: description || "",
    discountPercent: discountPercent || 0,
    startsAt,
    endsAt,
    itemType: itemType || "All",
    webhookNotify: webhookNotify !== false,
    status: (now >= startsAt && now <= endsAt ? "active" : now > endsAt ? "ended" : "scheduled") as "active" | "ended" | "scheduled",
  };
  req.session.promotions.push(promo);
  req.session.save(() => res.json({ promotion: promo }));
});

router.delete("/marketing/promotions/:id", (req, res): void => {
  req.session.promotions = (req.session.promotions || []).filter(p => p.id !== req.params.id);
  req.session.save(() => res.json({ ok: true }));
});

export default router;
