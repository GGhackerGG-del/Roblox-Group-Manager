import { Router, type IRouter } from "express";
import { globalRobloxFetch } from "../lib/robloxThrottle.js";

const router: IRouter = Router();

const ROBLOX_ECONOMY_API = "https://economy.roblox.com";
const ROBLOX_THUMBNAILS_API = "https://thumbnails.roblox.com";

async function fetchRoblox(url: string, cookie: string): Promise<Response> {
  return globalRobloxFetch(url, {
    redirect: "follow",
    headers: {
      Cookie: `.ROBLOSECURITY=${cookie}`,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Accept: "application/json",
    },
  }, "low");
}

async function fetchRobloxWithCsrf(url: string, cookie: string, method = "GET"): Promise<Response> {
  const headers: Record<string, string> = {
    Cookie: `.ROBLOSECURITY=${cookie}`,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    Accept: "application/json",
  };
  let resp = await globalRobloxFetch(url, { method, headers, redirect: "follow" }, "low");
  if (resp.status === 403) {
    const csrf = resp.headers.get("x-csrf-token");
    if (csrf) {
      headers["X-CSRF-TOKEN"] = csrf;
      resp = await globalRobloxFetch(url, { method, headers, redirect: "follow" }, "low");
    }
  }
  return resp;
}

function getGroupCookie(req: any, res: any): { cookie: string; groupId: number } | null {
  const cookie = req.session.robloxCookie;
  if (!cookie) { res.status(401).json({ error: "No active Roblox session." }); return null; }
  const rawId = Array.isArray(req.params.groupId) ? req.params.groupId[0] : req.params.groupId;
  const groupId = parseInt(rawId, 10);
  if (isNaN(groupId)) { res.status(400).json({ error: "Invalid group ID." }); return null; }
  return { cookie, groupId };
}

router.get("/pnl/group/:groupId/summary", async (req, res): Promise<void> => {
  const ctx = getGroupCookie(req, res);
  if (!ctx) return;
  const { cookie, groupId } = ctx;

  try {
    const [fundsResp, revDayResp, revWeekResp, revMonthResp] = await Promise.allSettled([
      fetchRoblox(`${ROBLOX_ECONOMY_API}/v1/groups/${groupId}/currency`, cookie),
      fetchRoblox(`${ROBLOX_ECONOMY_API}/v1/groups/${groupId}/revenue/summary/Day`, cookie),
      fetchRoblox(`${ROBLOX_ECONOMY_API}/v1/groups/${groupId}/revenue/summary/Week`, cookie),
      fetchRoblox(`${ROBLOX_ECONOMY_API}/v1/groups/${groupId}/revenue/summary/Month`, cookie),
    ]);

    let funds = 0;
    if (fundsResp.status === "fulfilled" && fundsResp.value.ok) {
      const d = await fundsResp.value.json() as { robux: number };
      funds = d.robux;
    } else if (fundsResp.status === "fulfilled") { await fundsResp.value.text().catch(() => {}); }

    let pendingRobux = 0, dailyRevenue = 0, summaryWeekRevenue = 0, summaryMonthRevenue = 0;

    if (revDayResp.status === "fulfilled" && revDayResp.value.ok) {
      const d = await revDayResp.value.json() as Record<string, any>;
      pendingRobux = d.pendingRobux ?? 0;
      dailyRevenue = d.itemSaleRobux ?? 0;
    } else if (revDayResp.status === "fulfilled") { await revDayResp.value.text().catch(() => {}); }

    if (revWeekResp.status === "fulfilled" && revWeekResp.value.ok) {
      summaryWeekRevenue = ((await revWeekResp.value.json()) as any).itemSaleRobux ?? 0;
    } else if (revWeekResp.status === "fulfilled") { await revWeekResp.value.text().catch(() => {}); }

    if (revMonthResp.status === "fulfilled" && revMonthResp.value.ok) {
      summaryMonthRevenue = ((await revMonthResp.value.json()) as any).itemSaleRobux ?? 0;
    } else if (revMonthResp.status === "fulfilled") { await revMonthResp.value.text().catch(() => {}); }

    const grossRevenue = summaryWeekRevenue;
    const robloxCommission = Math.round(grossRevenue * 0.3);
    const netRevenue = grossRevenue - robloxCommission;

    const grossMonth = summaryMonthRevenue;
    const netMonth = grossMonth - Math.round(grossMonth * 0.3);

    const ROBUX_TO_USD = 0.0035;
    const USD_TO_RUB = 96;

    console.log(`[P&L] Summary: balance=${funds} pending=${pendingRobux} daily=${dailyRevenue} week=${summaryWeekRevenue} month=${summaryMonthRevenue}`);

    res.json({
      balance: funds,
      pendingRobux,
      todayRevenue: dailyRevenue,
      weekRevenue: grossRevenue,
      monthRevenue: grossMonth,
      robloxCommission,
      netRevenue,
      netMonth,
      netUSD: Math.round(netRevenue * ROBUX_TO_USD * 100) / 100,
      netRUB: Math.round(netRevenue * ROBUX_TO_USD * USD_TO_RUB),
      netMonthUSD: Math.round(netMonth * ROBUX_TO_USD * 100) / 100,
      netMonthRUB: Math.round(netMonth * ROBUX_TO_USD * USD_TO_RUB),
    });
  } catch (err) {
    console.error("[P&L] Summary error:", err);
    res.status(500).json({ error: "Failed to load summary." });
  }
});

async function fetchTransactions(groupId: number, cookie: string) {
  const transactions: Array<{
    id: string; created: string; revenue: number; agentName: string;
    description: string; assetId: number | null; isPending: boolean;
  }> = [];

  let txCursor: string | null = null;
  let txPages = 0;
  const MAX_TX_PAGES = 50;
  let txRetries = 0;

  do {
    const txUrl = `${ROBLOX_ECONOMY_API}/v2/groups/${groupId}/transactions?transactionType=Sale&limit=100${txCursor ? `&cursor=${txCursor}` : ""}`;
    let txResp: Response;
    try {
      txResp = await fetchRobloxWithCsrf(txUrl, cookie);
    } catch (err) {
      console.log(`[P&L] Transaction fetch error:`, err);
      if (txRetries < 5) { txRetries++; await new Promise(r => setTimeout(r, 3000 * txRetries)); continue; }
      break;
    }

    if (!txResp.ok) {
      if (txResp.status === 429) {
        txRetries++;
        if (txRetries <= 3) {
          await txResp.text().catch(() => {});
          await new Promise(r => setTimeout(r, 5000 * txRetries));
          continue;
        }
        console.log(`[P&L] Rate limited, returning ${transactions.length} transactions collected so far`);
        break;
      }
      await txResp.text().catch(() => "");
      break;
    }
    txRetries = 0;

    const d = await txResp.json() as {
      nextPageCursor?: string | null;
      data: Array<{
        id: number; idHash?: string; created: string; isPending?: boolean;
        currency: { amount: number; type?: string };
        agent?: { id?: number; type?: string; name: string };
        details?: { id?: number; name: string; type?: string };
      }>;
    };

    for (const tx of d.data || []) {
      const txId = tx.idHash || (tx.id > 0 ? String(tx.id) : `${tx.created}_${tx.details?.id ?? ""}_${tx.currency?.amount ?? 0}`);
      transactions.push({
        id: txId, created: tx.created,
        revenue: Math.abs(tx.currency?.amount ?? 0),
        agentName: tx.agent?.name ?? "Unknown",
        description: tx.details?.name ?? "Sale",
        assetId: tx.details?.id ?? null,
        isPending: tx.isPending ?? false,
      });
    }

    txCursor = d.nextPageCursor || null;
    txPages++;
    if (txCursor) await new Promise(r => setTimeout(r, 500));
  } while (txCursor && txPages < MAX_TX_PAGES);

  console.log(`[P&L] Fetched ${transactions.length} total transactions across ${txPages} pages`);
  return transactions;
}

function buildTopItems(txList: Array<{ description: string; revenue: number; assetId: number | null }>) {
  const stats: Record<string, { name: string; revenue: number; count: number; assetId: number | null }> = {};
  for (const tx of txList) {
    const key = tx.assetId ? String(tx.assetId) : (tx.description || "Sale");
    if (!stats[key]) stats[key] = { name: tx.description || "Sale", revenue: 0, count: 0, assetId: tx.assetId };
    stats[key].revenue += tx.revenue;
    stats[key].count += 1;
  }
  return Object.values(stats).sort((a, b) => b.revenue - a.revenue).slice(0, 20);
}

async function fetchThumbnails(assetIds: number[]) {
  const thumbMap: Record<number, string | null> = {};
  const uniqueIds = [...new Set(assetIds.filter(id => id > 0))];
  for (let i = 0; i < uniqueIds.length; i += 100) {
    const batch = uniqueIds.slice(i, i + 100);
    try {
      const resp = await globalRobloxFetch(`${ROBLOX_THUMBNAILS_API}/v1/assets?assetIds=${batch.join(",")}&size=150x150&format=Png&isCircular=false`, undefined, "low");
      if (resp.ok) {
        const td = await resp.json() as { data: Array<{ targetId: number; imageUrl: string }> };
        for (const item of td.data || []) thumbMap[item.targetId] = item.imageUrl || null;
      }
    } catch {}
    if (i + 100 < uniqueIds.length) await new Promise(r => setTimeout(r, 200));
  }
  return thumbMap;
}

router.get("/pnl/group/:groupId/top-items", async (req, res): Promise<void> => {
  const ctx = getGroupCookie(req, res);
  if (!ctx) return;
  const { cookie, groupId } = ctx;

  try {
    const transactions = await fetchTransactions(groupId, cookie);

    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const todayTx = transactions.filter(v => new Date(v.created) > dayAgo);
    const weekTx = transactions.filter(v => new Date(v.created) > weekAgo);

    const topItemsDayRaw = buildTopItems(todayTx);
    const topItemsWeekRaw = buildTopItems(weekTx.length > 0 ? weekTx : transactions);

    const allAssetIds = [...topItemsDayRaw, ...topItemsWeekRaw].map(v => v.assetId).filter((id): id is number => id !== null);
    const thumbMap = await fetchThumbnails(allAssetIds);

    const mapItems = (raw: typeof topItemsDayRaw) => raw.map(item => ({
      name: item.name, revenue: item.revenue, count: item.count,
      assetId: item.assetId,
      thumbnailUrl: item.assetId ? (thumbMap[item.assetId] || null) : null,
    }));

    res.json({
      topItemsDay: mapItems(topItemsDayRaw),
      topItemsWeek: mapItems(topItemsWeekRaw),
      todayRevenue: todayTx.reduce((s, v) => s + v.revenue, 0),
      todaySales: todayTx.length,
      weekSales: weekTx.length,
      totalSales: transactions.length,
    });
  } catch (err) {
    console.error("[P&L] Top items error:", err);
    res.status(500).json({ error: "Failed to load top items." });
  }
});

router.get("/pnl/group/:groupId/recent", async (req, res): Promise<void> => {
  const ctx = getGroupCookie(req, res);
  if (!ctx) return;
  const { cookie, groupId } = ctx;

  try {
    const transactions: Array<{
      id: string; created: string; revenue: number; agentName: string;
      description: string; assetId: number | null; isPending: boolean;
    }> = [];

    let txCursor: string | null = null;
    let pages = 0;
    let retries = 0;

    do {
      const txUrl = `${ROBLOX_ECONOMY_API}/v2/groups/${groupId}/transactions?transactionType=Sale&limit=100${txCursor ? `&cursor=${txCursor}` : ""}`;
      let txResp: Response;
      try {
        txResp = await fetchRobloxWithCsrf(txUrl, cookie);
      } catch {
        if (retries < 3) { retries++; await new Promise(r => setTimeout(r, 3000 * retries)); continue; }
        break;
      }

      if (!txResp.ok) {
        if (txResp.status === 429 && retries < 3) {
          retries++; await txResp.text().catch(() => {}); await new Promise(r => setTimeout(r, 5000 * retries)); continue;
        }
        break;
      }
      retries = 0;

      const d = await txResp.json() as {
        nextPageCursor?: string | null;
        data: Array<{
          id: number; idHash?: string; created: string; isPending?: boolean;
          currency: { amount: number; type?: string };
          agent?: { id?: number; type?: string; name: string };
          details?: { id?: number; name: string; type?: string };
        }>;
      };

      for (const tx of d.data || []) {
        transactions.push({
          id: tx.idHash || (tx.id > 0 ? String(tx.id) : `${tx.created}_${tx.details?.id ?? ""}_${tx.currency?.amount ?? 0}`),
          created: tx.created,
          revenue: Math.abs(tx.currency?.amount ?? 0),
          agentName: tx.agent?.name ?? "Unknown",
          description: tx.details?.name ?? "Sale",
          assetId: tx.details?.id ?? null,
          isPending: tx.isPending ?? false,
        });
      }

      txCursor = d.nextPageCursor || null;
      pages++;
      if (transactions.length >= 50) break;
      if (txCursor) await new Promise(r => setTimeout(r, 500));
    } while (txCursor && pages < 5);

    const recent = transactions.slice(0, 50);
    const assetIds = recent.map(v => v.assetId).filter((id): id is number => id !== null);
    const thumbMap = await fetchThumbnails(assetIds);

    res.json({
      recentTransactions: recent.map(tx => ({
        ...tx,
        thumbnailUrl: tx.assetId ? (thumbMap[tx.assetId] || null) : null,
      })),
    });
  } catch (err) {
    console.error("[P&L] Recent error:", err);
    res.status(500).json({ error: "Failed to load recent transactions." });
  }
});

export default router;
