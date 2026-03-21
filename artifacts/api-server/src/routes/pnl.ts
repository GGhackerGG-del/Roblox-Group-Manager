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
    const [fundsResp, revResp] = await Promise.allSettled([
      fetchRoblox(`${ROBLOX_ECONOMY_API}/v1/groups/${groupId}/currency`, cookie),
      fetchRoblox(`${ROBLOX_ECONOMY_API}/v1/groups/${groupId}/revenue/summary/Day`, cookie),
    ]);

    let funds = 0;
    if (fundsResp.status === "fulfilled" && fundsResp.value.ok) {
      const d = await fundsResp.value.json() as { robux: number };
      funds = d.robux;
    }

    let pendingRobux = 0;
    let dailyRevenue = 0;
    if (revResp.status === "fulfilled" && revResp.value.ok) {
      const d = await revResp.value.json() as {
        pendingRobux?: number;
        itemSaleRobux?: number;
      };
      pendingRobux = d.pendingRobux ?? 0;
      dailyRevenue = d.itemSaleRobux ?? 0;
    }

    const transactions: Array<{
      id: string;
      created: string;
      revenue: number;
      agentName: string;
      description: string;
      assetId: number | null;
    }> = [];

    let txCursor: string | null = null;
    let txPages = 0;
    const MAX_TX_PAGES = 50;
    let txRetries = 0;

    do {
      const txUrl = `${ROBLOX_ECONOMY_API}/v2/groups/${groupId}/transactions?transactionType=Sale&limit=100${txCursor ? `&cursor=${txCursor}` : ""}`;
      let txResp: Response;
      try {
        txResp = await fetchRoblox(txUrl, cookie);
      } catch {
        if (txRetries < 5) {
          txRetries++;
          await new Promise(r => setTimeout(r, 3000 * txRetries));
          continue;
        }
        break;
      }

      if (!txResp.ok) {
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
          created: string;
          currency: { amount: number };
          agent?: { name: string };
          details?: { name: string };
        }>;
      };

      for (const tx of d.data || []) {
        transactions.push({
          id: String(tx.id),
          created: tx.created,
          revenue: Math.abs(tx.currency?.amount ?? 0),
          agentName: tx.agent?.name ?? "Unknown",
          description: tx.details?.name ?? "Sale",
          assetId: (tx.details as any)?.id ?? null,
        });
      }

      txCursor = d.nextPageCursor || null;
      txPages++;
      if (txCursor) await new Promise(r => setTimeout(r, 500));
    } while (txCursor && txPages < MAX_TX_PAGES);

    console.log(`[P&L] Fetched ${transactions.length} total transactions across ${txPages} pages`);

    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const todayTx = transactions.filter(t => new Date(t.created) > dayAgo);
    const weekTx = transactions.filter(t => new Date(t.created) > weekAgo);

    const todayRevenue = todayTx.reduce((s, t) => s + t.revenue, 0);
    const weekRevenue = weekTx.reduce((s, t) => s + t.revenue, 0);

    const grossRevenue = weekRevenue;
    const robloxCommission = Math.round(grossRevenue * 0.3);
    const netRevenue = grossRevenue - robloxCommission;

    const ROBUX_TO_USD = 0.0035;
    const USD_TO_RUB = 96;

    const netUSD = netRevenue * ROBUX_TO_USD;
    const netRUB = netUSD * USD_TO_RUB;

    const itemStats: Record<string, { name: string; revenue: number; count: number }> = {};
    for (const tx of transactions) {
      const key = tx.description;
      if (!itemStats[key]) {
        itemStats[key] = { name: key, revenue: 0, count: 0 };
      }
      itemStats[key].revenue += tx.revenue;
      itemStats[key].count += 1;
    }

    const topItems = Object.values(itemStats)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 20);

    const recentTx = transactions.slice(0, 50);

    const txAssetIds = recentTx
      .map(t => t.assetId)
      .filter((id): id is number => id !== null && id > 0);
    const uniqueAssetIds = [...new Set(txAssetIds)];

    const thumbMap: Record<number, string | null> = {};
    for (let i = 0; i < uniqueAssetIds.length; i += 100) {
      const batch = uniqueAssetIds.slice(i, i + 100);
      try {
        const thumbResp = await fetch(
          `${ROBLOX_THUMBNAILS_API}/v1/assets?assetIds=${batch.join(",")}&size=150x150&format=Png&isCircular=false`
        );
        if (thumbResp.ok) {
          const td = await thumbResp.json() as { data: Array<{ targetId: number; imageUrl: string }> };
          for (const t of td.data || []) {
            thumbMap[t.targetId] = t.imageUrl || null;
          }
        }
      } catch {}
      if (i + 100 < uniqueAssetIds.length) await new Promise(r => setTimeout(r, 200));
    }

    const recentWithThumbs = recentTx.map(tx => ({
      ...tx,
      thumbnailUrl: tx.assetId ? (thumbMap[tx.assetId] || null) : null,
    }));

    res.json({
      balance: funds,
      pendingRobux,
      dailyRevenue,
      todayRevenue,
      weekRevenue: grossRevenue,
      robloxCommission,
      netRevenue,
      netUSD: Math.round(netUSD * 100) / 100,
      netRUB: Math.round(netRUB),
      totalSales: transactions.length,
      todaySales: todayTx.length,
      topItems,
      recentTransactions: recentWithThumbs,
    });
  } catch (err) {
    console.error("[P&L] Error:", err);
    res.status(500).json({ error: "Failed to calculate P&L." });
  }
});

export default router;
