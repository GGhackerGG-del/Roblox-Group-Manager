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

router.get("/pnl/group/:groupId", async (req, res): Promise<void> => {
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
      console.log(`[P&L] Balance for group ${groupId}: ${funds}`);
    } else {
      const status = fundsResp.status === "fulfilled" ? fundsResp.value.status : "rejected";
      let body = "";
      if (fundsResp.status === "fulfilled") {
        try { body = await fundsResp.value.text(); } catch {}
      }
      console.log(`[P&L] Currency endpoint failed for group ${groupId}: status=${status} body=${body.slice(0, 200)}`);
    }

    let pendingRobux = 0;
    let dailyRevenue = 0;
    let summaryWeekRevenue = 0;
    let summaryMonthRevenue = 0;

    if (revDayResp.status === "fulfilled" && revDayResp.value.ok) {
      const d = await revDayResp.value.json() as Record<string, any>;
      console.log(`[P&L] Day revenue raw:`, JSON.stringify(d).slice(0, 500));
      pendingRobux = d.pendingRobux ?? 0;
      dailyRevenue = d.itemSaleRobux ?? 0;
    } else {
      const status = revDayResp.status === "fulfilled" ? revDayResp.value.status : "rejected";
      let body = "";
      if (revDayResp.status === "fulfilled") {
        try { body = await revDayResp.value.text(); } catch {}
      }
      console.log(`[P&L] Day revenue failed for group ${groupId}: status=${status} body=${body.slice(0, 200)}`);
    }

    if (revWeekResp.status === "fulfilled" && revWeekResp.value.ok) {
      const d = await revWeekResp.value.json() as Record<string, any>;
      console.log(`[P&L] Week revenue raw:`, JSON.stringify(d).slice(0, 500));
      summaryWeekRevenue = d.itemSaleRobux ?? 0;
    } else {
      const status = revWeekResp.status === "fulfilled" ? revWeekResp.value.status : "rejected";
      let body = "";
      if (revWeekResp.status === "fulfilled") {
        try { body = await revWeekResp.value.text(); } catch {}
      }
      console.log(`[P&L] Week revenue failed: status=${status} body=${body.slice(0, 200)}`);
    }

    if (revMonthResp.status === "fulfilled" && revMonthResp.value.ok) {
      const d = await revMonthResp.value.json() as Record<string, any>;
      console.log(`[P&L] Month revenue raw:`, JSON.stringify(d).slice(0, 500));
      summaryMonthRevenue = d.itemSaleRobux ?? 0;
    } else {
      const status = revMonthResp.status === "fulfilled" ? revMonthResp.value.status : "rejected";
      let body = "";
      if (revMonthResp.status === "fulfilled") {
        try { body = await revMonthResp.value.text(); } catch {}
      }
      console.log(`[P&L] Month revenue failed: status=${status} body=${body.slice(0, 200)}`);
    }

    const transactions: Array<{
      id: string;
      created: string;
      revenue: number;
      agentName: string;
      description: string;
      assetId: number | null;
      isPending: boolean;
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
        if (txRetries < 5) {
          txRetries++;
          await new Promise(r => setTimeout(r, 3000 * txRetries));
          continue;
        }
        break;
      }

      if (!txResp.ok) {
        const body = await txResp.text().catch(() => "");
        console.log(`[P&L] Transaction API error: status=${txResp.status} body=${body.slice(0, 300)}`);
        if (txResp.status === 429 && txRetries < 5) {
          txRetries++;
          await new Promise(r => setTimeout(r, 3000 * txRetries));
          continue;
        }
        break;
      }
      txRetries = 0;

      const d = await txResp.json() as {
        nextPageCursor?: string | null;
        data: Array<{
          id: number;
          idHash?: string;
          created: string;
          isPending?: boolean;
          currency: { amount: number; type?: string };
          agent?: { id?: number; type?: string; name: string };
          details?: { id?: number; name: string; type?: string };
        }>;
      };

      if (txPages === 0) {
        console.log(`[P&L] First tx page sample (${d.data?.length ?? 0} items):`, JSON.stringify((d.data || []).slice(0, 2)).slice(0, 500));
      }

      for (const tx of d.data || []) {
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

      txCursor = d.nextPageCursor || null;
      txPages++;
      if (txCursor) await new Promise(r => setTimeout(r, 500));
    } while (txCursor && txPages < MAX_TX_PAGES);

    console.log(`[P&L] Fetched ${transactions.length} total transactions across ${txPages} pages`);

    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const todayTx = transactions.filter(v => new Date(v.created) > dayAgo);
    const weekTx = transactions.filter(v => new Date(v.created) > weekAgo);

    const todayRevenue = todayTx.reduce((s, v) => s + v.revenue, 0);
    const weekRevenue = weekTx.reduce((s, v) => s + v.revenue, 0);

    const grossRevenue = summaryWeekRevenue > 0 ? summaryWeekRevenue : weekRevenue;
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

    const txSource = weekTx.length > 0 ? weekTx : transactions;
    const itemStats: Record<string, { name: string; revenue: number; count: number; assetId: number | null }> = {};
    for (const tx of txSource) {
      const key = tx.description || "Sale";
      if (!itemStats[key]) {
        itemStats[key] = { name: key, revenue: 0, count: 0, assetId: tx.assetId };
      }
      itemStats[key].revenue += tx.revenue;
      itemStats[key].count += 1;
      if (!itemStats[key].assetId && tx.assetId) {
        itemStats[key].assetId = tx.assetId;
      }
    }

    const topItemsRaw = Object.values(itemStats)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 20);

    const recentTx = transactions.slice(0, 50);

    const allAssetIds = [
      ...recentTx.map(v => v.assetId),
      ...topItemsRaw.map(v => v.assetId),
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
          for (const item of td.data || []) {
            thumbMap[item.targetId] = item.imageUrl || null;
          }
        }
      } catch {}
      if (i + 100 < uniqueAssetIds.length) await new Promise(r => setTimeout(r, 200));
    }

    const topItems = topItemsRaw.map(item => ({
      name: item.name,
      revenue: item.revenue,
      count: item.count,
      thumbnailUrl: item.assetId ? (thumbMap[item.assetId] || null) : null,
    }));

    const recentWithThumbs = recentTx.map(tx => ({
      ...tx,
      thumbnailUrl: tx.assetId ? (thumbMap[tx.assetId] || null) : null,
    }));

    const todaySalesCount = todayTx.length;
    const weekSalesCount = weekTx.length;
    const finalTodayRevenue = todayRevenue > 0 ? todayRevenue : dailyRevenue;

    console.log(`[P&L] Summary: balance=${funds} pending=${pendingRobux} dailyRev=${dailyRevenue} todayTxRev=${todayRevenue} weekRev=${grossRevenue} monthRev=${grossMonth} todaySales=${todaySalesCount} weekSales=${weekSalesCount} totalSales=${transactions.length} topItems=${topItems.length}`);

    res.json({
      balance: funds,
      pendingRobux,
      dailyRevenue,
      todayRevenue: finalTodayRevenue,
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
      todaySales: todaySalesCount,
      weekSales: weekSalesCount,
      topItems,
      recentTransactions: recentWithThumbs,
    });
  } catch (err) {
    console.error("[P&L] Error:", err);
    res.status(500).json({ error: "Failed to calculate P&L." });
  }
});

export default router;
