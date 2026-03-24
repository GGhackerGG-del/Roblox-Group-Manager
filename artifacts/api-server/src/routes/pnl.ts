import { Router, type IRouter } from "express";

const router: IRouter = Router();

const ROBLOX_ECONOMY_API = "https://economy.roblox.com";
const ROBLOX_THUMBNAILS_API = "https://thumbnails.roblox.com";

async function fetchRoblox(url: string, cookie: string): Promise<Response> {
  return fetch(url, {
    redirect: "follow",
    headers: {
      Cookie: `.ROBLOSECURITY=${cookie}`,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Accept: "application/json",
    },
  });
}

async function fetchRobloxWithCsrf(url: string, cookie: string, method = "GET"): Promise<Response> {
  const headers: Record<string, string> = {
    Cookie: `.ROBLOSECURITY=${cookie}`,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    Accept: "application/json",
  };

  let resp = await fetch(url, { method, headers, redirect: "follow" });

  if (resp.status === 403) {
    const csrf = resp.headers.get("x-csrf-token");
    if (csrf) {
      headers["X-CSRF-TOKEN"] = csrf;
      resp = await fetch(url, { method, headers, redirect: "follow" });
    }
  }

  return resp;
}

interface Transaction {
  id: string;
  created: string;
  revenue: number;
  agentName: string;
  description: string;
  assetId: number | null;
  isPending: boolean;
}

async function fetchTransactions(groupId: number, cookie: string, maxAgeDays: number): Promise<Transaction[]> {
  const transactions: Transaction[] = [];
  const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
  let cursor: string | null = null;
  let pages = 0;
  const MAX_PAGES = 30;
  let retries = 0;

  do {
    const url = `${ROBLOX_ECONOMY_API}/v2/groups/${groupId}/transactions?transactionType=Sale&limit=100${cursor ? `&cursor=${cursor}` : ""}`;
    let resp: Response;
    try {
      resp = await fetchRobloxWithCsrf(url, cookie);
    } catch (err) {
      console.log(`[P&L] Transaction fetch error:`, err);
      if (retries < 3) { retries++; await new Promise(r => setTimeout(r, 2000 * retries)); continue; }
      break;
    }

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      console.log(`[P&L] Transaction API error: status=${resp.status} body=${body.slice(0, 300)}`);
      if (resp.status === 429 && retries < 3) { retries++; await new Promise(r => setTimeout(r, 2000 * retries)); continue; }
      break;
    }
    retries = 0;

    const d = await resp.json() as {
      nextPageCursor?: string | null;
      data: Array<{
        id: number; idHash?: string; created: string; isPending?: boolean;
        currency: { amount: number; type?: string };
        agent?: { id?: number; type?: string; name: string };
        details?: { id?: number; name: string; type?: string };
      }>;
    };

    let reachedCutoff = false;
    for (const tx of d.data || []) {
      const txDate = new Date(tx.created);
      if (txDate < cutoff) { reachedCutoff = true; break; }
      const txId = tx.idHash || (tx.id > 0 ? String(tx.id) : `${tx.created}_${tx.details?.id ?? ""}_${tx.currency?.amount ?? 0}`);
      transactions.push({
        id: txId,
        created: tx.created,
        revenue: Math.abs(tx.currency?.amount ?? 0),
        agentName: tx.agent?.name ?? "Unknown",
        description: tx.details?.name ?? "Sale",
        assetId: tx.details?.id ?? null,
        isPending: tx.isPending ?? false,
      });
    }

    if (reachedCutoff) break;

    cursor = d.nextPageCursor || null;
    pages++;
    if (cursor) await new Promise(r => setTimeout(r, 150));
  } while (cursor && pages < MAX_PAGES);

  console.log(`[P&L] Fetched ${transactions.length} transactions across ${pages + 1} pages (cutoff: ${maxAgeDays}d)`);
  return transactions;
}

async function fetchThumbnails(assetIds: number[]): Promise<Record<number, string | null>> {
  const thumbMap: Record<number, string | null> = {};
  const unique = [...new Set(assetIds.filter(id => id > 0))];
  if (unique.length === 0) return thumbMap;

  const batches = [];
  for (let i = 0; i < unique.length; i += 100) {
    batches.push(unique.slice(i, i + 100));
  }

  const results = await Promise.allSettled(
    batches.map(batch =>
      fetch(`${ROBLOX_THUMBNAILS_API}/v1/assets?assetIds=${batch.join(",")}&size=150x150&format=Png&isCircular=false`)
        .then(r => r.ok ? r.json() as Promise<{ data: Array<{ targetId: number; imageUrl: string }> }> : null)
    )
  );

  for (const r of results) {
    if (r.status === "fulfilled" && r.value) {
      for (const item of r.value.data || []) {
        thumbMap[item.targetId] = item.imageUrl || null;
      }
    }
  }
  return thumbMap;
}

router.get("/pnl/group/:groupId", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  if (!cookie) { res.status(401).json({ error: "No active Roblox session." }); return; }

  const rawId = Array.isArray(req.params.groupId) ? req.params.groupId[0] : req.params.groupId;
  const groupId = parseInt(rawId, 10);
  if (isNaN(groupId)) { res.status(400).json({ error: "Invalid group ID." }); return; }

  try {
    const [summaryResults, transactions] = await Promise.all([
      Promise.allSettled([
        fetchRoblox(`${ROBLOX_ECONOMY_API}/v1/groups/${groupId}/currency`, cookie),
        fetchRoblox(`${ROBLOX_ECONOMY_API}/v1/groups/${groupId}/revenue/summary/Day`, cookie),
        fetchRoblox(`${ROBLOX_ECONOMY_API}/v1/groups/${groupId}/revenue/summary/Week`, cookie),
        fetchRoblox(`${ROBLOX_ECONOMY_API}/v1/groups/${groupId}/revenue/summary/Month`, cookie),
      ]),
      fetchTransactions(groupId, cookie, 8),
    ]);

    const [fundsResp, revDayResp, revWeekResp, revMonthResp] = summaryResults;

    let funds = 0;
    if (fundsResp.status === "fulfilled" && fundsResp.value.ok) {
      const d = await fundsResp.value.json() as { robux: number };
      funds = d.robux;
    }

    let pendingRobux = 0;
    let dailyRevenue = 0;
    let summaryWeekRevenue = 0;
    let summaryMonthRevenue = 0;

    if (revDayResp.status === "fulfilled" && revDayResp.value.ok) {
      const d = await revDayResp.value.json() as Record<string, any>;
      pendingRobux = d.pendingRobux ?? 0;
      dailyRevenue = d.itemSaleRobux ?? 0;
    }

    if (revWeekResp.status === "fulfilled" && revWeekResp.value.ok) {
      const d = await revWeekResp.value.json() as Record<string, any>;
      summaryWeekRevenue = d.itemSaleRobux ?? 0;
    }

    if (revMonthResp.status === "fulfilled" && revMonthResp.value.ok) {
      const d = await revMonthResp.value.json() as Record<string, any>;
      summaryMonthRevenue = d.itemSaleRobux ?? 0;
    }

    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const todayTx = transactions.filter(v => new Date(v.created) > dayAgo);
    const weekTx = transactions.filter(v => new Date(v.created) > weekAgo);

    const todayTxRevenue = todayTx.reduce((s, v) => s + v.revenue, 0);
    const weekTxRevenue = weekTx.reduce((s, v) => s + v.revenue, 0);

    const todayRevenue = Math.max(todayTxRevenue, dailyRevenue);
    const grossRevenue = summaryWeekRevenue > 0 ? summaryWeekRevenue : weekTxRevenue;
    const robloxCommission = Math.round(grossRevenue * 0.3);
    const netRevenue = grossRevenue - robloxCommission;

    const grossMonth = summaryMonthRevenue > 0 ? summaryMonthRevenue : transactions.reduce((s, v) => s + v.revenue, 0);
    const monthCommission = Math.round(grossMonth * 0.3);
    const netMonth = grossMonth - monthCommission;

    const ROBUX_TO_USD = 0.0035;
    const USD_TO_RUB = 96;
    const netUSD = netRevenue * ROBUX_TO_USD;
    const netRUB = netUSD * USD_TO_RUB;
    const netMonthUSD = netMonth * ROBUX_TO_USD;
    const netMonthRUB = netMonthUSD * USD_TO_RUB;

    function buildTopItems(txList: Transaction[]) {
      const stats: Record<string, { name: string; revenue: number; count: number; assetId: number | null }> = {};
      for (const tx of txList) {
        const key = tx.description || "Sale";
        if (!stats[key]) stats[key] = { name: key, revenue: 0, count: 0, assetId: tx.assetId };
        stats[key].revenue += tx.revenue;
        stats[key].count += 1;
        if (!stats[key].assetId && tx.assetId) stats[key].assetId = tx.assetId;
      }
      return Object.values(stats).sort((a, b) => b.revenue - a.revenue).slice(0, 20);
    }

    const topItemsDayRaw = buildTopItems(todayTx);
    const topItemsWeekRaw = buildTopItems(weekTx.length > 0 ? weekTx : transactions);
    const recentTx = transactions.slice(0, 50);

    const allAssetIds = [
      ...recentTx.map(v => v.assetId),
      ...topItemsDayRaw.map(v => v.assetId),
      ...topItemsWeekRaw.map(v => v.assetId),
    ].filter((id): id is number => id !== null && id > 0);

    const thumbMap = await fetchThumbnails(allAssetIds);

    const mapTopItems = (raw: ReturnType<typeof buildTopItems>) => raw.map(item => ({
      name: item.name,
      revenue: item.revenue,
      count: item.count,
      thumbnailUrl: item.assetId ? (thumbMap[item.assetId] || null) : null,
    }));

    res.json({
      balance: funds,
      pendingRobux,
      dailyRevenue,
      todayRevenue,
      weekRevenue: grossRevenue,
      monthRevenue: grossMonth,
      robloxCommission,
      netRevenue,
      netMonth,
      netUSD: Math.round(netUSD * 100) / 100,
      netRUB: Math.round(netRUB),
      netMonthUSD: Math.round(netMonthUSD * 100) / 100,
      netMonthRUB: Math.round(netMonthRUB),
      totalSales: transactions.length,
      todaySales: todayTx.length,
      weekSales: weekTx.length,
      topItemsDay: mapTopItems(topItemsDayRaw),
      topItemsWeek: mapTopItems(topItemsWeekRaw),
      recentTransactions: recentTx.map(tx => ({
        ...tx,
        thumbnailUrl: tx.assetId ? (thumbMap[tx.assetId] || null) : null,
      })),
    });
  } catch (err) {
    console.error("[P&L] Error:", err);
    res.status(500).json({ error: "Failed to calculate P&L." });
  }
});

export default router;
