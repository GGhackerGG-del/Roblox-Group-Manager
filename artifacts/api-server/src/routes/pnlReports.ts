import { Router, type IRouter } from "express";
import { randomUUID } from "crypto";
import { globalRobloxFetch } from "../lib/robloxThrottle.js";
import { pool } from "@workspace/db";

const router: IRouter = Router();
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ROBLOX_ECONOMY_API = "https://economy.roblox.com";

async function fetchRobloxPnl(url: string, cookie: string): Promise<Response> {
  return globalRobloxFetch(url, {
    redirect: "follow",
    headers: {
      Cookie: `.ROBLOSECURITY=${cookie}`,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Accept: "application/json",
    },
  }, "low");
}

interface PnlSummary {
  balance: number;
  pendingRobux: number;
  todayRevenue: number;
  weekRevenue: number;
  monthRevenue: number;
  netRevenue: number;
  netMonth: number;
  netUSD: number;
  netRUB: number;
  todaySales: number;
  topItems: Array<{ name: string; revenue: number; count: number }>;
}

async function fetchPnlSummary(groupId: number, cookie: string): Promise<PnlSummary | null> {
  try {
    const [fundsResp, revDayResp, revWeekResp, revMonthResp] = await Promise.allSettled([
      fetchRobloxPnl(`${ROBLOX_ECONOMY_API}/v1/groups/${groupId}/currency`, cookie),
      fetchRobloxPnl(`${ROBLOX_ECONOMY_API}/v1/groups/${groupId}/revenue/summary/Day`, cookie),
      fetchRobloxPnl(`${ROBLOX_ECONOMY_API}/v1/groups/${groupId}/revenue/summary/Week`, cookie),
      fetchRobloxPnl(`${ROBLOX_ECONOMY_API}/v1/groups/${groupId}/revenue/summary/Month`, cookie),
    ]);

    let balance = 0;
    if (fundsResp.status === "fulfilled" && fundsResp.value.ok) {
      const d = await fundsResp.value.json() as { robux: number };
      balance = d.robux;
    } else if (fundsResp.status === "fulfilled") { await fundsResp.value.text().catch(() => {}); }

    let pendingRobux = 0, todayRevenue = 0, weekRevenue = 0, monthRevenue = 0;

    if (revDayResp.status === "fulfilled" && revDayResp.value.ok) {
      const d = await revDayResp.value.json() as Record<string, any>;
      pendingRobux = d.pendingRobux ?? 0;
      todayRevenue = d.itemSaleRobux ?? 0;
    } else if (revDayResp.status === "fulfilled") { await revDayResp.value.text().catch(() => {}); }

    if (revWeekResp.status === "fulfilled" && revWeekResp.value.ok) {
      weekRevenue = ((await revWeekResp.value.json()) as any).itemSaleRobux ?? 0;
    } else if (revWeekResp.status === "fulfilled") { await revWeekResp.value.text().catch(() => {}); }

    if (revMonthResp.status === "fulfilled" && revMonthResp.value.ok) {
      monthRevenue = ((await revMonthResp.value.json()) as any).itemSaleRobux ?? 0;
    } else if (revMonthResp.status === "fulfilled") { await revMonthResp.value.text().catch(() => {}); }

    const ROBUX_TO_USD = 0.0035;
    const USD_TO_RUB = 96;
    const netRevenue = weekRevenue - Math.round(weekRevenue * 0.3);
    const netMonth = monthRevenue - Math.round(monthRevenue * 0.3);

    let todaySales = 0;
    const topItems: Array<{ name: string; revenue: number; count: number }> = [];
    try {
      const txUrl = `${ROBLOX_ECONOMY_API}/v2/groups/${groupId}/transactions?transactionType=Sale&limit=100`;
      const txResp = await fetchRobloxPnl(txUrl, cookie);
      if (txResp.ok) {
        const txData = await txResp.json() as { data: Array<{ created: string; currency: { amount: number }; details?: { name: string; id?: number } }> };
        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const stats: Record<string, { name: string; revenue: number; count: number }> = {};
        for (const tx of txData.data || []) {
          if (new Date(tx.created) > dayAgo) todaySales++;
          const key = tx.details?.name || "Sale";
          if (!stats[key]) stats[key] = { name: key, revenue: 0, count: 0 };
          stats[key].revenue += Math.abs(tx.currency?.amount ?? 0);
          stats[key].count++;
        }
        topItems.push(...Object.values(stats).sort((a, b) => b.revenue - a.revenue).slice(0, 5));
      }
    } catch {}

    return {
      balance, pendingRobux, todayRevenue, weekRevenue, monthRevenue,
      netRevenue, netMonth,
      netUSD: Math.round(netRevenue * ROBUX_TO_USD * 100) / 100,
      netRUB: Math.round(netRevenue * ROBUX_TO_USD * USD_TO_RUB),
      todaySales, topItems,
    };
  } catch (err) {
    console.error("[PnlReport] Failed to fetch P&L:", err);
    return null;
  }
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

async function sendDiscordReport(webhookUrl: string, groupName: string, pnl: PnlSummary): Promise<boolean> {
  try {
    const topItemsText = pnl.topItems.length > 0
      ? pnl.topItems.map((item, i) => `${i + 1}. **${item.name}** — ${formatNumber(item.revenue)} R$ (${item.count} sales)`).join("\n")
      : "No sales data";

    const embed = {
      title: `📊 P&L Report — ${groupName}`,
      color: 0x000000,
      fields: [
        { name: "💰 Balance", value: `${formatNumber(pnl.balance)} R$`, inline: true },
        { name: "⏳ Pending", value: `${formatNumber(pnl.pendingRobux)} R$`, inline: true },
        { name: "📅 Today", value: `${formatNumber(pnl.todayRevenue)} R$ (${pnl.todaySales} sales)`, inline: true },
        { name: "📈 Week Revenue", value: `${formatNumber(pnl.weekRevenue)} R$`, inline: true },
        { name: "📊 Month Revenue", value: `${formatNumber(pnl.monthRevenue)} R$`, inline: true },
        { name: "✅ Net (7d)", value: `${formatNumber(pnl.netRevenue)} R$`, inline: true },
        { name: "💵 Net USD (7d)", value: `$${pnl.netUSD}`, inline: true },
        { name: "💵 Net RUB (7d)", value: `${formatNumber(pnl.netRUB)} ₽`, inline: true },
        { name: "🏆 Top Items", value: topItemsText, inline: false },
      ],
      footer: { text: "Limited.Ink • Auto P&L Report" },
      timestamp: new Date().toISOString(),
    };

    const resp = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "Limited.Ink",
        embeds: [embed],
      }),
    });
    return resp.ok;
  } catch (err) {
    console.error("[PnlReport] Discord send error:", err);
    return false;
  }
}

async function sendTelegramReport(chatId: string, groupName: string, pnl: PnlSummary): Promise<boolean> {
  if (!BOT_TOKEN) return false;
  try {
    const topItemsText = pnl.topItems.length > 0
      ? pnl.topItems.map((item, i) => `  ${i + 1}. <b>${item.name}</b> — ${formatNumber(item.revenue)} R$ (${item.count})`).join("\n")
      : "  No data";

    const text = `📊 <b>P&L Report — ${groupName}</b>\n\n`
      + `💰 Balance: <b>${formatNumber(pnl.balance)} R$</b>\n`
      + `⏳ Pending: ${formatNumber(pnl.pendingRobux)} R$\n`
      + `📅 Today: ${formatNumber(pnl.todayRevenue)} R$ (${pnl.todaySales} sales)\n`
      + `📈 Week: ${formatNumber(pnl.weekRevenue)} R$\n`
      + `📊 Month: ${formatNumber(pnl.monthRevenue)} R$\n`
      + `✅ Net (7d): ${formatNumber(pnl.netRevenue)} R$\n`
      + `💵 ~$${pnl.netUSD} / ~${formatNumber(pnl.netRUB)} ₽\n\n`
      + `🏆 <b>Top items:</b>\n${topItemsText}\n\n`
      + `<i>Limited.Ink • ${new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })}</i>`;

    const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
    const d = await resp.json() as any;
    return d.ok === true;
  } catch (err) {
    console.error("[PnlReport] Telegram send error:", err);
    return false;
  }
}

const DISCORD_WEBHOOK_RE = /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/.+$/;

function isValidDiscordWebhookUrl(url: string): boolean {
  return DISCORD_WEBHOOK_RE.test(url.trim());
}

function safeInterval(val: any): number {
  const n = Number(val);
  if (!Number.isFinite(n) || n < 1) return 1;
  if (n > 168) return 168;
  return Math.round(n);
}

type ScheduleEntry = {
  id: string;
  sessionId: string;
  groupId: number;
  groupName: string;
  intervalHours: number;
  discordWebhookUrl: string;
  telegramChatId: string;
  lastSentAt: number | null;
};

const activeTimers = new Map<string, ReturnType<typeof setInterval>>();
const runningReports = new Set<string>();

async function resolveSessionCookie(sessionId: string): Promise<string | null> {
  try {
    const result = await pool.query(`SELECT sess FROM user_sessions WHERE sid = $1 AND expire > NOW()`, [sessionId]);
    if (result.rows.length > 0) {
      const sess = typeof result.rows[0].sess === "string" ? JSON.parse(result.rows[0].sess) : result.rows[0].sess;
      return sess.robloxCookie || null;
    }
  } catch {}
  return null;
}

async function executeReport(entry: ScheduleEntry) {
  if (runningReports.has(entry.id)) return;
  runningReports.add(entry.id);
  try {
    const cookie = await resolveSessionCookie(entry.sessionId);
    if (!cookie) {
      console.log(`[PnlReport] No active Roblox session for ${entry.groupName}, stopping timer`);
      stopTimer(entry.id);
      return;
    }

    console.log(`[PnlReport] Executing report for group ${entry.groupName} (${entry.groupId})`);
    const pnl = await fetchPnlSummary(entry.groupId, cookie);
    if (!pnl) {
      console.log(`[PnlReport] Failed to fetch P&L for group ${entry.groupId}`);
      return;
    }

    let discordOk = false, telegramOk = false;
    if (entry.discordWebhookUrl) {
      discordOk = await sendDiscordReport(entry.discordWebhookUrl, entry.groupName, pnl);
      console.log(`[PnlReport] Discord: ${discordOk ? "sent" : "failed"}`);
    }
    if (entry.telegramChatId) {
      telegramOk = await sendTelegramReport(entry.telegramChatId, entry.groupName, pnl);
      console.log(`[PnlReport] Telegram: ${telegramOk ? "sent" : "failed"}`);
    }

    entry.lastSentAt = Date.now();

    try {
      const result = await pool.query(`SELECT sess FROM user_sessions WHERE sid = $1`, [entry.sessionId]);
      if (result.rows.length > 0) {
        const sess = typeof result.rows[0].sess === "string" ? JSON.parse(result.rows[0].sess) : result.rows[0].sess;
        const schedules = sess.pnlReportSchedules || [];
        const idx = schedules.findIndex((s: any) => s.id === entry.id);
        if (idx >= 0) {
          schedules[idx].lastSentAt = entry.lastSentAt;
          await pool.query(`UPDATE user_sessions SET sess = $1 WHERE sid = $2`, [JSON.stringify(sess), entry.sessionId]);
        }
      }
    } catch (err) {
      console.error("[PnlReport] Failed to persist lastSentAt:", err);
    }
  } finally {
    runningReports.delete(entry.id);
  }
}

function startTimer(entry: ScheduleEntry) {
  stopTimer(entry.id);
  const intervalMs = entry.intervalHours * 60 * 60 * 1000;
  const timer = setInterval(() => executeReport(entry), intervalMs);
  activeTimers.set(entry.id, timer);
  console.log(`[PnlReport] Timer started: ${entry.id} every ${entry.intervalHours}h for ${entry.groupName}`);
}

function stopTimer(id: string) {
  const existing = activeTimers.get(id);
  if (existing) {
    clearInterval(existing);
    activeTimers.delete(id);
  }
}

export function stopAllTimersForSession(sessionId: string) {
  for (const [id, _timer] of activeTimers) {
    const key = `${sessionId}:`;
    if (id.startsWith(key)) {
      stopTimer(id);
    }
  }
  for (const [id, entry] of sessionTimerMap) {
    if (entry === sessionId) {
      stopTimer(id);
      sessionTimerMap.delete(id);
    }
  }
}

const sessionTimerMap = new Map<string, string>();

async function restoreTimersFromDb() {
  try {
    const result = await pool.query(`SELECT sid, sess FROM user_sessions WHERE expire > NOW()`);
    let restored = 0;
    for (const row of result.rows) {
      const sess = typeof row.sess === "string" ? JSON.parse(row.sess) : row.sess;
      const schedules = sess.pnlReportSchedules || [];
      if (!sess.robloxCookie) continue;
      for (const sched of schedules) {
        if (!sched.enabled) continue;
        if (!sched.discordWebhookUrl && !sched.telegramChatId) continue;
        const entry: ScheduleEntry = {
          id: sched.id,
          sessionId: row.sid,
          groupId: sched.groupId,
          groupName: sched.groupName,
          intervalHours: safeInterval(sched.intervalHours),
          discordWebhookUrl: sched.discordWebhookUrl,
          telegramChatId: sched.telegramChatId,
          lastSentAt: sched.lastSentAt,
        };
        startTimer(entry);
        sessionTimerMap.set(sched.id, row.sid);
        restored++;
      }
    }
    if (restored > 0) console.log(`[PnlReport] Restored ${restored} report timer(s) from DB`);
  } catch (err) {
    console.error("[PnlReport] Failed to restore timers:", err);
  }
}

setTimeout(() => restoreTimersFromDb(), 5000);

router.get("/pnl-reports", (req, res): void => {
  res.json({
    schedules: req.session.pnlReportSchedules || [],
    telegramConfigured: !!BOT_TOKEN,
  });
});

router.post("/pnl-reports", (req, res): void => {
  const { groupId, groupName, intervalHours, discordWebhookUrl, telegramChatId } = req.body as {
    groupId?: number;
    groupName?: string;
    intervalHours?: number;
    discordWebhookUrl?: string;
    telegramChatId?: string;
  };

  if (!groupId || !groupName) { res.status(400).json({ error: "Group ID and name required." }); return; }
  const interval = safeInterval(intervalHours);
  if (!discordWebhookUrl && !telegramChatId) { res.status(400).json({ error: "At least one destination (Discord or Telegram) required." }); return; }
  if (discordWebhookUrl && !isValidDiscordWebhookUrl(discordWebhookUrl)) { res.status(400).json({ error: "Invalid Discord webhook URL. Must be a valid discord.com webhook." }); return; }

  const cookie = req.session.robloxCookie;
  if (!cookie) { res.status(401).json({ error: "No active Roblox session." }); return; }

  if (!req.session.pnlReportSchedules) req.session.pnlReportSchedules = [];

  const existing = req.session.pnlReportSchedules.find(s => s.groupId === groupId);
  if (existing) {
    stopTimer(existing.id);
    req.session.pnlReportSchedules = req.session.pnlReportSchedules.filter(s => s.id !== existing.id);
  }

  const id = randomUUID();
  const schedule = {
    id, groupId, groupName,
    intervalHours: interval,
    discordWebhookUrl: discordWebhookUrl?.trim() || "",
    telegramChatId: telegramChatId?.trim() || "",
    enabled: true,
    lastSentAt: null as number | null,
    createdAt: Date.now(),
  };

  req.session.pnlReportSchedules.push(schedule);

  req.session.save((err) => {
    if (err) { res.status(500).json({ error: "Failed to save session." }); return; }
    startTimer({
      id, sessionId: req.sessionID,
      groupId, groupName, intervalHours: interval,
      discordWebhookUrl: schedule.discordWebhookUrl,
      telegramChatId: schedule.telegramChatId,
      lastSentAt: null,
    });
    sessionTimerMap.set(id, req.sessionID);
    res.json({ schedule });
  });
});

router.patch("/pnl-reports/:id", (req, res): void => {
  const schedId = req.params.id;
  const schedules = req.session.pnlReportSchedules || [];
  const idx = schedules.findIndex(s => s.id === schedId);
  if (idx < 0) { res.status(404).json({ error: "Schedule not found." }); return; }

  const { intervalHours, discordWebhookUrl, telegramChatId, enabled } = req.body;

  if (intervalHours !== undefined) schedules[idx].intervalHours = safeInterval(intervalHours);
  if (discordWebhookUrl !== undefined) {
    if (discordWebhookUrl && !isValidDiscordWebhookUrl(discordWebhookUrl)) { res.status(400).json({ error: "Invalid Discord webhook URL." }); return; }
    schedules[idx].discordWebhookUrl = (discordWebhookUrl || "").trim();
  }
  if (telegramChatId !== undefined) schedules[idx].telegramChatId = (telegramChatId || "").trim();
  if (enabled !== undefined) schedules[idx].enabled = !!enabled;

  req.session.pnlReportSchedules = schedules;
  const sched = schedules[idx];

  req.session.save((err) => {
    if (err) { res.status(500).json({ error: "Failed to save session." }); return; }
    stopTimer(schedId);
    if (sched.enabled && (sched.discordWebhookUrl || sched.telegramChatId) && req.session.robloxCookie) {
      startTimer({
        id: sched.id, sessionId: req.sessionID,
        groupId: sched.groupId, groupName: sched.groupName,
        intervalHours: sched.intervalHours,
        discordWebhookUrl: sched.discordWebhookUrl,
        telegramChatId: sched.telegramChatId,
        lastSentAt: sched.lastSentAt,
      });
      sessionTimerMap.set(sched.id, req.sessionID);
    }
    res.json({ schedule: sched });
  });
});

router.delete("/pnl-reports/:id", (req, res): void => {
  const schedId = req.params.id;
  stopTimer(schedId);
  req.session.pnlReportSchedules = (req.session.pnlReportSchedules || []).filter(s => s.id !== schedId);
  req.session.save(() => res.json({ ok: true }));
});

router.post("/pnl-reports/:id/send-now", async (req, res): Promise<void> => {
  const schedId = req.params.id;
  const sched = (req.session.pnlReportSchedules || []).find(s => s.id === schedId);
  if (!sched) { res.status(404).json({ error: "Schedule not found." }); return; }

  const cookie = req.session.robloxCookie;
  if (!cookie) { res.status(401).json({ error: "No active Roblox session." }); return; }

  const pnl = await fetchPnlSummary(sched.groupId, cookie);
  if (!pnl) { res.status(502).json({ error: "Failed to fetch P&L data from Roblox." }); return; }

  let discordOk = false, telegramOk = false;
  if (sched.discordWebhookUrl) discordOk = await sendDiscordReport(sched.discordWebhookUrl, sched.groupName, pnl);
  if (sched.telegramChatId) telegramOk = await sendTelegramReport(sched.telegramChatId, sched.groupName, pnl);

  sched.lastSentAt = Date.now();
  req.session.pnlReportSchedules = (req.session.pnlReportSchedules || []).map(s => s.id === schedId ? sched : s);
  req.session.save(() => {});

  res.json({ ok: true, discord: discordOk, telegram: telegramOk, sentAt: sched.lastSentAt });
});

export default router;
