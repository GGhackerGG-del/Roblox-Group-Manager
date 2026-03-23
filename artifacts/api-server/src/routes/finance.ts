import { Router } from "express";
import { randomUUID } from "crypto";

const router = Router();

// Cached exchange rates (refresh every 30 min)
let rateCache: { usdRub: number; usdEur: number; fetchedAt: number } | null = null;

async function getExchangeRates() {
  if (rateCache && Date.now() - rateCache.fetchedAt < 30 * 60 * 1000) return rateCache;
  try {
    const r = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
    const d = await r.json() as any;
    rateCache = { usdRub: d.rates?.RUB || 90, usdEur: d.rates?.EUR || 0.92, fetchedAt: Date.now() };
  } catch {
    rateCache = { usdRub: 90, usdEur: 0.92, fetchedAt: Date.now() };
  }
  return rateCache!;
}

// GET /finance/rates — live exchange rates
router.get("/finance/rates", async (req, res): Promise<void> => {
  try {
    const rates = await getExchangeRates();
    res.json({
      usdRub: rates.usdRub,
      usdEur: rates.usdEur,
      robuxUsd: 0.0035,        // 1000 Robux = $3.50 DevEx rate
      marketplaceFee: 0.30,    // Roblox takes 30%
      devexMin: 30000,         // Minimum Robux to DevEx
      fetchedAt: rates.fetchedAt,
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Error" });
  }
});

// ── Invoices ──────────────────────────────────────────────────────────────────

router.get("/finance/invoices", (req, res): void => {
  const invoices = (req.session.invoices || []).sort((a, b) => b.createdAt - a.createdAt);
  res.json({ invoices });
});

router.post("/finance/invoices", (req, res): void => {
  const { clientName, clientEmail, currency, items, notes, dueDate } = req.body;
  if (!clientName || !items?.length) { res.status(400).json({ error: "Client name and items required" }); return; }
  if (!req.session.invoices) req.session.invoices = [];
  const num = `INV-${new Date().getFullYear()}-${String(req.session.invoices.length + 1).padStart(4, "0")}`;
  const invoice = {
    id: randomUUID(),
    number: num,
    clientName,
    clientEmail: clientEmail || "",
    currency: currency || "robux",
    items,
    notes: notes || "",
    status: "draft" as const,
    createdAt: Date.now(),
    dueDate: dueDate || null,
  };
  req.session.invoices.push(invoice);
  req.session.save(() => res.json({ invoice }));
});

router.patch("/finance/invoices/:id", (req, res): void => {
  if (!req.session.invoices) { res.status(404).json({ error: "Not found" }); return; }
  req.session.invoices = req.session.invoices.map(inv =>
    inv.id === req.params.id ? { ...inv, ...req.body, id: inv.id } : inv
  );
  req.session.save(() => res.json({ ok: true }));
});

router.delete("/finance/invoices/:id", (req, res): void => {
  req.session.invoices = (req.session.invoices || []).filter(inv => inv.id !== req.params.id);
  req.session.save(() => res.json({ ok: true }));
});

// ── Financial Goals ───────────────────────────────────────────────────────────

router.get("/finance/goals", (req, res): void => {
  res.json({ goals: req.session.financialGoals || [] });
});

router.post("/finance/goals", (req, res): void => {
  const { title, category, targetAmount, currency, deadline } = req.body;
  if (!title || !targetAmount) { res.status(400).json({ error: "Title and target required" }); return; }
  if (!req.session.financialGoals) req.session.financialGoals = [];
  const goal = {
    id: randomUUID(),
    title,
    category: category || "general",
    targetAmount: Number(targetAmount),
    currentAmount: 0,
    currency: currency || "robux",
    deadline: deadline || null,
    createdAt: Date.now(),
  };
  req.session.financialGoals.push(goal);
  req.session.save(() => res.json({ goal }));
});

router.patch("/finance/goals/:id", (req, res): void => {
  if (!req.session.financialGoals) { res.status(404).json({ error: "Not found" }); return; }
  req.session.financialGoals = req.session.financialGoals.map(g =>
    g.id === req.params.id ? { ...g, ...req.body, id: g.id } : g
  );
  req.session.save(() => res.json({ ok: true }));
});

router.delete("/finance/goals/:id", (req, res): void => {
  req.session.financialGoals = (req.session.financialGoals || []).filter(g => g.id !== req.params.id);
  req.session.save(() => res.json({ ok: true }));
});

// ── Tax Report ────────────────────────────────────────────────────────────────

router.get("/finance/tax-report", async (req, res): Promise<void> => {
  const invoices = (req.session.invoices || []).filter(inv => inv.status === "paid");
  const rates = await getExchangeRates();
  const ROBUX_USD = 0.0035;

  // Group by month
  const byMonth: Record<string, { count: number; totalRobux: number; totalUsd: number }> = {};
  for (const inv of invoices) {
    const d = new Date(inv.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!byMonth[key]) byMonth[key] = { count: 0, totalRobux: 0, totalUsd: 0 };
    const total = inv.items.reduce((s: number, it: any) => s + it.qty * it.price, 0);
    byMonth[key].count++;
    if (inv.currency === "robux") {
      byMonth[key].totalRobux += total;
      byMonth[key].totalUsd += total * ROBUX_USD;
    } else if (inv.currency === "usd") {
      byMonth[key].totalUsd += total;
      byMonth[key].totalRobux += total / ROBUX_USD;
    } else if (inv.currency === "rub") {
      const usd = total / rates.usdRub;
      byMonth[key].totalUsd += usd;
      byMonth[key].totalRobux += usd / ROBUX_USD;
    }
  }

  const totalUsd = Object.values(byMonth).reduce((s, m) => s + m.totalUsd, 0);
  const totalRobux = Object.values(byMonth).reduce((s, m) => s + m.totalRobux, 0);

  res.json({
    paidInvoices: invoices.length,
    totalUsd: Math.round(totalUsd * 100) / 100,
    totalRub: Math.round(totalUsd * rates.usdRub),
    totalRobux: Math.round(totalRobux),
    byMonth: Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0])).map(([month, data]) => ({ month, ...data })),
    taxEstimate13: Math.round(totalUsd * 0.13 * 100) / 100,
    taxEstimate20: Math.round(totalUsd * 0.20 * 100) / 100,
  });
});

export default router;
