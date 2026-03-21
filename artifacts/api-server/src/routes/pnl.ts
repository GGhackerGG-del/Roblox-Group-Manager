import { Router, type IRouter } from "express";

const router: IRouter = Router();

const ROBLOX_ECONOMY_API = "https://economy.roblox.com";
const ROBLOX_USERS_API = "https://users.roblox.com";

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
    const [fundsResp, revResp, txResp] = await Promise.allSettled([
      fetchRoblox(`${ROBLOX_ECONOMY_API}/v1/groups/${groupId}/currency`, cookie),
      fetchRoblox(`${ROBLOX_ECONOMY_API}/v1/groups/${groupId}/revenue/summary/Day`, cookie),
      fetchRoblox(`${ROBLOX_ECONOMY_API}/v2/groups/${groupId}/transactions?transactionType=Sale&limit=100`, cookie),
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
    }> = [];

    if (txResp.status === "fulfilled" && txResp.value.ok) {
      const d = await txResp.value.json() as {
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
        });
      }
    }

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
      recentTransactions: transactions.slice(0, 30),
    });
  } catch (err) {
    console.error("[P&L] Error:", err);
    res.status(500).json({ error: "Failed to calculate P&L." });
  }
});

export default router;
