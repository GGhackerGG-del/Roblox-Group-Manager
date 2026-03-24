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

router.get("/pnl/group/:groupId/summary", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  if (!cookie) { res.status(401).json({ error: "No active Roblox session." }); return; }

  const rawId = Array.isArray(req.params.groupId) ? req.params.groupId[0] : req.params.groupId;
  const groupId = parseInt(rawId, 10);
  if (isNaN(groupId)) { res.status(400).json({ error: "Invalid group ID." }); return; }

  try {
    const [fundsResp, revDayResp, revWeekResp, revMonthResp] = await Promise.allSettled([
      fetchRoblox(`${ROBLOX_ECONOMY_API}/v1/groups/${groupId}/currency`, cookie),
      fetchRoblox(`${ROBLOX_ECONOMY_API}/v1/groups/${groupId}/revenue/summary/Day`, cookie),
      fetchRoblox(`${ROBLOX_ECONOMY_API}/v1/groups/${groupId}/revenue/summary/Week`, cookie),
      fetchRoblox(`${ROBLOX_ECONOMY_API}/v1/groups/${groupId}/revenue/summary/Month`, cookie),
    ]);

    let funds = 0, partial = false;
    if (fundsResp.status === "fulfilled" && fundsResp.value.ok) {
      funds = ((await fundsResp.value.json()) as any).robux ?? 0;
    } else { partial = true; }

    let pendingRobux = 0, dailyRevenue = 0, weekRevenue = 0, monthRevenue = 0;
    if (revDayResp.status === "fulfilled" && revDayResp.value.ok) {
      const d = await revDayResp.value.json() as Record<string, any>;
      pendingRobux = d.pendingRobux ?? 0;
      dailyRevenue = d.itemSaleRobux ?? 0;
    } else { partial = true; }
    if (revWeekResp.status === "fulfilled" && revWeekResp.value.ok) {
      weekRevenue = ((await revWeekResp.value.json()) as any).itemSaleRobux ?? 0;
    } else { partial = true; }
    if (revMonthResp.status === "fulfilled" && revMonthResp.value.ok) {
      monthRevenue = ((await revMonthResp.value.json()) as any).itemSaleRobux ?? 0;
    } else { partial = true; }

    const robloxCommission = Math.round(weekRevenue * 0.3);
    const netRevenue = weekRevenue - robloxCommission;
    const netMonth = monthRevenue - Math.round(monthRevenue * 0.3);
    const ROBUX_TO_USD = 0.0035;
    const USD_TO_RUB = 96;

    res.json({
      partial,
      balance: funds,
      pendingRobux,
      todayRevenue: dailyRevenue,
      weekRevenue,
      monthRevenue,
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

router.get("/pnl/group/:groupId/transactions", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  if (!cookie) { res.status(401).json({ error: "No active Roblox session." }); return; }

  const rawId = Array.isArray(req.params.groupId) ? req.params.groupId[0] : req.params.groupId;
  const groupId = parseInt(rawId, 10);
  if (isNaN(groupId)) { res.status(400).json({ error: "Invalid group ID." }); return; }

  try {
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
      txPages++;
      if (txCursor) await new Promise(r => setTimeout(r, 500));
    } while (txCursor && txPages < MAX_TX_PAGES);

    console.log(`[P&L] Fetched ${transactions.length} total transactions across ${txPages} pages`);

    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const todayTx = transactions.filter(v => new Date(v.created) > dayAgo);
    const weekTx = transactions.filter(v => new Date(v.created) > weekAgo);

    function buildTopItems(txList: typeof transactions) {
      const stats: Record<string, { name: string; revenue: number; count: number; assetId: number | null }> = {};
      for (const tx of txList) {
        const key = tx.assetId ? String(tx.assetId) : (tx.description || "Sale");
        if (!stats[key]) stats[key] = { name: tx.description || "Sale", revenue: 0, count: 0, assetId: tx.assetId };
        stats[key].revenue += tx.revenue;
        stats[key].count += 1;
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
    const uniqueAssetIds = [...new Set(allAssetIds)];

    const thumbMap: Record<number, string | null> = {};
    for (let i = 0; i < uniqueAssetIds.length; i += 100) {
      const batch = uniqueAssetIds.slice(i, i + 100);
      try {
        const thumbResp = await fetch(
          `${ROBLOX_THUMBNAILS_API}/v1/assets?assetIds=${batch.join(",")}&size=150x150&format=Png&isCircular=false`
        );
        if (thumbResp.ok) {
          const td = await thumbResp.json() as { data: Array<{ targetId: number; imageUrl: string }> };
          for (const item of td.data || []) thumbMap[item.targetId] = item.imageUrl || null;
        }
      } catch {}
      if (i + 100 < uniqueAssetIds.length) await new Promise(r => setTimeout(r, 200));
    }

    const mapTopItems = (raw: typeof topItemsDayRaw) => raw.map(item => ({
      name: item.name, revenue: item.revenue, count: item.count,
      thumbnailUrl: item.assetId ? (thumbMap[item.assetId] || null) : null,
    }));

    res.json({
      todayRevenue: todayTx.reduce((s, v) => s + v.revenue, 0),
      todaySales: todayTx.length,
      weekSales: weekTx.length,
      totalSales: transactions.length,
      topItemsDay: mapTopItems(topItemsDayRaw),
      topItemsWeek: mapTopItems(topItemsWeekRaw),
      recentTransactions: recentTx.map(tx => ({
        ...tx, thumbnailUrl: tx.assetId ? (thumbMap[tx.assetId] || null) : null,
      })),
    });
  } catch (err) {
    console.error("[P&L] Transactions error:", err);
    res.status(500).json({ error: "Failed to load transactions." });
  }
});

export default router;
