import { Router } from "express";
import { randomUUID } from "crypto";

const router = Router();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ALL_EVENTS = [
  "new_item", "item_sold", "new_follower", "group_join", "group_leave",
  "promotion_start", "promotion_end", "invoice_paid", "goal_reached",
  "streak_milestone", "achievement_unlocked", "devex_ready",
];

// ── Status overview ───────────────────────────────────────────────────────────
router.get("/integrations/status", async (req, res): Promise<void> => {
  let tgBotUsername: string | null = null;
  let tgBotOnline = false;
  if (BOT_TOKEN) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`);
      const d = await r.json() as any;
      if (d.ok) { tgBotOnline = true; tgBotUsername = d.result.username; }
    } catch {}
  }
  const discordWebhooks = (req.session.webhooks || []).filter(w => w.type === "discord");
  const tgWebhooks = (req.session.webhooks || []).filter(w => w.type === "telegram");
  const customWH = req.session.customWebhooks || [];
  res.json({
    discord: { connected: discordWebhooks.length > 0, webhookCount: discordWebhooks.length, notifyEvents: req.session.integrationDiscord?.notifyEvents || [] },
    telegram: { online: tgBotOnline, username: tgBotUsername, configured: BOT_TOKEN != null, chatIds: req.session.integrationTelegram?.chatIds || [], notifyEvents: req.session.integrationTelegram?.notifyEvents || [] },
    email: { configured: req.session.integrationEmail?.enabled || false, toEmail: req.session.integrationEmail?.toEmail || "", notifyEvents: req.session.integrationEmail?.notifyEvents || [] },
    sheets: { configured: !!(req.session.integrationSheets?.sheetId), sheetId: req.session.integrationSheets?.sheetId || "", lastSync: req.session.integrationSheets?.lastSync || null },
    customWebhooks: { total: customWH.length, enabled: customWH.filter(w => w.enabled).length },
  });
});

// ── Discord ───────────────────────────────────────────────────────────────────
router.get("/integrations/discord", (req, res): void => {
  const discordWebhooks = (req.session.webhooks || []).filter(w => w.type === "discord");
  res.json({
    webhooks: discordWebhooks,
    notifyEvents: req.session.integrationDiscord?.notifyEvents || [],
    allEvents: ALL_EVENTS,
    testChannelWebhookId: req.session.integrationDiscord?.testChannelWebhookId || "",
  });
});

router.post("/integrations/discord/config", (req, res): void => {
  const { notifyEvents, testChannelWebhookId } = req.body;
  req.session.integrationDiscord = { notifyEvents: notifyEvents || [], testChannelWebhookId: testChannelWebhookId || "" };
  req.session.save(() => res.json({ ok: true }));
});

router.post("/integrations/discord/test", async (req, res): Promise<void> => {
  const webhookId = req.body.webhookId || req.session.integrationDiscord?.testChannelWebhookId;
  const wh = (req.session.webhooks || []).find(w => w.id === webhookId && w.type === "discord");
  if (!wh) { res.status(400).json({ error: "Discord webhook не выбран" }); return; }
  try {
    const r = await fetch(wh.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [{ title: "✅ Limited.Ink тест", description: "Discord интеграция работает!", color: 5763719, footer: { text: "Limited.Ink Integrations" } }] }),
    });
    res.json({ ok: r.ok, status: r.status });
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : "Error" });
  }
});

// ── Telegram ──────────────────────────────────────────────────────────────────
router.get("/integrations/telegram", async (req, res): Promise<void> => {
  let botInfo: any = null;
  if (BOT_TOKEN) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`);
      const d = await r.json() as any;
      if (d.ok) botInfo = d.result;
    } catch {}
  }
  res.json({
    configured: !!BOT_TOKEN,
    botInfo,
    chatIds: req.session.integrationTelegram?.chatIds || [],
    notifyEvents: req.session.integrationTelegram?.notifyEvents || [],
    messageLog: (req.session.integrationTelegram?.messageLog || []).slice(-20),
    allEvents: ALL_EVENTS,
  });
});

router.post("/integrations/telegram/config", (req, res): void => {
  const { chatIds, notifyEvents } = req.body;
  if (!req.session.integrationTelegram) req.session.integrationTelegram = { notifyEvents: [], chatIds: [], messageLog: [] };
  req.session.integrationTelegram.chatIds = chatIds || [];
  req.session.integrationTelegram.notifyEvents = notifyEvents || [];
  req.session.save(() => res.json({ ok: true }));
});

router.post("/integrations/telegram/send", async (req, res): Promise<void> => {
  const { chatId, text } = req.body;
  if (!chatId || !text) { res.status(400).json({ error: "chatId and text required" }); return; }
  if (!BOT_TOKEN) { res.status(400).json({ error: "TELEGRAM_BOT_TOKEN not configured" }); return; }
  try {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
    const d = await r.json() as any;
    const logEntry = { chatId, text, sentAt: Date.now(), ok: d.ok };
    if (!req.session.integrationTelegram) req.session.integrationTelegram = { notifyEvents: [], chatIds: [], messageLog: [] };
    req.session.integrationTelegram.messageLog = [...(req.session.integrationTelegram.messageLog || []).slice(-49), logEntry];
    req.session.save(() => {});
    if (!d.ok) throw new Error(d.description);
    res.json({ ok: true, messageId: d.result?.message_id });
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : "Error" });
  }
});

// ── Custom Webhooks ───────────────────────────────────────────────────────────
router.get("/integrations/webhooks", (req, res): void => {
  res.json({ webhooks: req.session.customWebhooks || [], allEvents: ALL_EVENTS });
});

router.post("/integrations/webhooks", (req, res): void => {
  const { name, url, method, headers, payload, events } = req.body;
  if (!name || !url) { res.status(400).json({ error: "Name and URL required" }); return; }
  if (!req.session.customWebhooks) req.session.customWebhooks = [];
  const wh = { id: randomUUID(), name, url, method: method || "POST", headers: headers || "{}", payload: payload || '{"event":"{{event}}","timestamp":"{{timestamp}}"}', events: events || [], enabled: true, createdAt: Date.now(), lastTriggered: null, lastStatus: null };
  req.session.customWebhooks.push(wh);
  req.session.save(() => res.json({ webhook: wh }));
});

router.patch("/integrations/webhooks/:id", (req, res): void => {
  req.session.customWebhooks = (req.session.customWebhooks || []).map(w => w.id === req.params.id ? { ...w, ...req.body, id: w.id } : w);
  req.session.save(() => res.json({ ok: true }));
});

router.delete("/integrations/webhooks/:id", (req, res): void => {
  req.session.customWebhooks = (req.session.customWebhooks || []).filter(w => w.id !== req.params.id);
  req.session.save(() => res.json({ ok: true }));
});

router.post("/integrations/webhooks/:id/test", async (req, res): Promise<void> => {
  const wh = (req.session.customWebhooks || []).find(w => w.id === req.params.id);
  if (!wh) { res.status(404).json({ error: "Not found" }); return; }
  try {
    const now = new Date().toISOString();
    const body = wh.payload.replace(/\{\{event\}\}/g, "test").replace(/\{\{timestamp\}\}/g, now);
    let parsedHeaders: Record<string, string> = { "Content-Type": "application/json" };
    try { parsedHeaders = { ...parsedHeaders, ...JSON.parse(wh.headers) }; } catch {}
    const r = await fetch(wh.url, { method: wh.method, headers: parsedHeaders, body: wh.method !== "GET" ? body : undefined });
    req.session.customWebhooks = (req.session.customWebhooks || []).map(w => w.id === wh.id ? { ...w, lastTriggered: Date.now(), lastStatus: r.status } : w);
    req.session.save(() => {});
    res.json({ ok: r.ok, status: r.status, responsePreview: (await r.text()).slice(0, 300) });
  } catch (e) {
    res.json({ ok: false, error: e instanceof Error ? e.message : "Error" });
  }
});

// ── Google Sheets ─────────────────────────────────────────────────────────────
router.get("/integrations/sheets", (req, res): void => {
  res.json({ config: req.session.integrationSheets || { sheetId: "", sheetUrl: "", syncFields: ["invoices", "goals", "drafts", "todos"], lastSync: null, autoSync: false } });
});

router.post("/integrations/sheets/config", (req, res): void => {
  req.session.integrationSheets = { sheetId: "", sheetUrl: "", syncFields: ["invoices"], lastSync: null, autoSync: false, ...req.session.integrationSheets, ...req.body };
  req.session.save(() => res.json({ ok: true }));
});

router.post("/integrations/sheets/export", (req, res): void => {
  const { field } = req.body as { field: string };
  let csv = "";
  if (field === "invoices") {
    const headers = ["Номер", "Клиент", "Email", "Валюта", "Сумма", "Статус", "Дата", "Дедлайн"];
    const rows = (req.session.invoices || []).map(inv => {
      const total = inv.items.reduce((s, it) => s + it.qty * it.price, 0);
      return [inv.number, inv.clientName, inv.clientEmail, inv.currency, total, inv.status, new Date(inv.createdAt).toLocaleDateString("ru"), inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("ru") : ""];
    });
    csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
  } else if (field === "goals") {
    const headers = ["Название", "Категория", "Валюта", "Цель", "Текущее", "%", "Дедлайн"];
    const rows = (req.session.financialGoals || []).map(g => [g.title, g.category, g.currency, g.targetAmount, g.currentAmount, Math.round((g.currentAmount / g.targetAmount) * 100) + "%", g.deadline ? new Date(g.deadline).toLocaleDateString("ru") : ""]);
    csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
  } else if (field === "todos") {
    const headers = ["Задача", "Категория", "Приоритет", "Статус", "Дедлайн"];
    const rows = (req.session.contentTodos || []).map(t => [t.title, t.category, t.priority, t.done ? "Выполнено" : "Активно", t.dueDate ? new Date(t.dueDate).toLocaleDateString("ru") : ""]);
    csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
  } else if (field === "drafts") {
    const headers = ["Название", "Тип", "Статус", "Теги", "Дата"];
    const rows = (req.session.contentDrafts || []).map(d => [d.title, d.type, d.status, d.tags.join("; "), new Date(d.createdAt).toLocaleDateString("ru")]);
    csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
  }
  if (req.session.integrationSheets) req.session.integrationSheets.lastSync = Date.now();
  req.session.save(() => {});
  res.json({ csv, rows: csv.split("\n").length - 1 });
});

// ── Email ─────────────────────────────────────────────────────────────────────
router.get("/integrations/email", (req, res): void => {
  const cfg = req.session.integrationEmail;
  res.json({
    config: cfg ? { ...cfg, smtpPass: cfg.smtpPass ? "••••••••" : "" } : { smtpHost: "", smtpPort: 587, smtpUser: "", smtpPass: "", fromEmail: "", toEmail: "", notifyEvents: [], enabled: false },
    allEvents: ALL_EVENTS,
  });
});

router.post("/integrations/email/config", (req, res): void => {
  const existing = req.session.integrationEmail;
  const { smtpHost, smtpPort, smtpUser, smtpPass, fromEmail, toEmail, notifyEvents, enabled } = req.body;
  req.session.integrationEmail = {
    smtpHost: smtpHost || existing?.smtpHost || "",
    smtpPort: smtpPort || existing?.smtpPort || 587,
    smtpUser: smtpUser || existing?.smtpUser || "",
    smtpPass: smtpPass && smtpPass !== "••••••••" ? smtpPass : (existing?.smtpPass || ""),
    fromEmail: fromEmail || existing?.fromEmail || "",
    toEmail: toEmail || existing?.toEmail || "",
    notifyEvents: notifyEvents ?? existing?.notifyEvents ?? [],
    enabled: enabled ?? existing?.enabled ?? false,
  };
  req.session.save(() => res.json({ ok: true }));
});

router.post("/integrations/email/test", (req, res): void => {
  const cfg = req.session.integrationEmail;
  if (!cfg?.enabled || !cfg.smtpHost || !cfg.toEmail) { res.status(400).json({ error: "Email не настроен" }); return; }
  // Simulate sending (in real deploy, use nodemailer)
  res.json({ ok: true, simulated: true, to: cfg.toEmail, subject: "✅ Тест — Limited.Ink уведомления работают!" });
});

export default router;
