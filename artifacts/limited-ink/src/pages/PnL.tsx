import { useState, useEffect, useCallback } from "react";
import { getAuthCredentials } from "@workspace/api-client-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePageCache } from "@/contexts/PageCacheContext";
import { playClick, playSuccess } from "@/hooks/useSounds";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DollarSign, TrendingUp, TrendingDown, Loader2, RefreshCw,
  Wallet, Clock, BarChart3, ArrowUpRight, Coins, PiggyBank,
  Image as ImageIcon
} from "lucide-react";
import { motion } from "framer-motion";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface SummaryData {
  partial?: boolean;
  balance: number;
  pendingRobux: number;
  todayRevenue: number;
  weekRevenue: number;
  monthRevenue: number;
  robloxCommission: number;
  netRevenue: number;
  netMonth: number;
  netUSD: number;
  netRUB: number;
  netMonthUSD: number;
  netMonthRUB: number;
}

interface TxData {
  todayRevenue: number;
  todaySales: number;
  weekSales: number;
  totalSales: number;
  topItemsDay: Array<{ name: string; revenue: number; count: number; thumbnailUrl?: string | null }>;
  topItemsWeek: Array<{ name: string; revenue: number; count: number; thumbnailUrl?: string | null }>;
  recentTransactions: Array<{ id: string; created: string; revenue: number; agentName: string; description: string; thumbnailUrl?: string | null; assetId?: number | null }>;
}

function makeHeaders() {
  const { token, fingerprint } = getAuthCredentials();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (fingerprint) headers["X-Device-Fingerprint"] = fingerprint;
  return headers;
}

export default function PnL({ groupId }: { groupId: string }) {
  const { t } = useLanguage();
  const cache = usePageCache();
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [txData, setTxData] = useState<TxData | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [txError, setTxError] = useState(false);
  const [topItemsPeriod, setTopItemsPeriod] = useState<"day" | "week">("day");
  const [refreshing, setRefreshing] = useState(false);

  const fetchSummary = useCallback(async (silent = false) => {
    if (!silent) setSummaryLoading(true);
    try {
      const resp = await fetch(`${BASE}/api/pnl/group/${groupId}/summary`, {
        credentials: "include", headers: makeHeaders(),
      });
      if (!resp.ok) throw new Error("Failed");
      const data = await resp.json();
      setSummary(data);
      cache.set(`pnl_summary_${groupId}`, data);
    } catch (err) {
      if (!silent) setError(t("pnl.failedLoad"));
    } finally {
      setSummaryLoading(false);
    }
  }, [groupId]);

  const fetchTx = useCallback(async (silent = false) => {
    if (!silent) setTxLoading(true);
    setTxError(false);
    try {
      const resp = await fetch(`${BASE}/api/pnl/group/${groupId}/transactions`, {
        credentials: "include", headers: makeHeaders(),
      });
      if (!resp.ok) throw new Error("Failed");
      const data = await resp.json();
      setTxData(data);
      cache.set(`pnl_tx_${groupId}`, data);
    } catch {
      if (!txData) setTxError(true);
    } finally {
      setTxLoading(false);
      setRefreshing(false);
    }
  }, [groupId, txData]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    playClick();
    fetchSummary(true);
    fetchTx(true);
  }, [fetchSummary, fetchTx]);

  useEffect(() => {
    const cachedSummary = cache.get<SummaryData>(`pnl_summary_${groupId}`);
    const cachedTx = cache.get<TxData>(`pnl_tx_${groupId}`);
    if (cachedSummary) { setSummary(cachedSummary); setSummaryLoading(false); }
    if (cachedTx) { setTxData(cachedTx); setTxLoading(false); }

    fetchSummary(!!cachedSummary);
    fetchTx(!!cachedTx);
  }, [groupId]);

  if (summaryLoading && !summary) {
    return (
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (error && !summary) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <TrendingDown className="w-8 h-8 mb-3 opacity-30" />
        <p className="text-sm">{error}</p>
        <Button variant="outline" size="sm" onClick={refresh} className="mt-3">{t("sniper.refresh")}</Button>
      </div>
    );
  }

  const s = summary!;
  const todayRev = txData ? Math.max(txData.todayRevenue, s.todayRevenue) : s.todayRevenue;
  const todaySales = txData?.todaySales ?? 0;
  const weekSales = txData?.weekSales ?? 0;
  const totalSales = txData?.totalSales ?? 0;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{t("pnl.title")}</h3>
        <Button variant="ghost" size="sm" onClick={refresh} disabled={refreshing}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1 ${refreshing ? "animate-spin" : ""}`} /> {t("sniper.refresh")}
        </Button>
      </div>

      {s.partial && (
        <div className="text-xs text-yellow-500 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
          {t("pnl.partialData") || "Some data may be incomplete due to Roblox API rate limits. Try refreshing in a minute."}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-gradient-to-br from-green-500/5 to-green-500/0 border-green-500/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="w-4 h-4 text-green-500" />
              <span className="text-xs text-muted-foreground">{t("pnl.balance") || "Balance"}</span>
            </div>
            <p className="text-xl font-bold">{s.balance.toLocaleString()} <span className="text-sm text-muted-foreground">R$</span></p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/5 to-blue-500/0 border-blue-500/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-blue-500" />
              <span className="text-xs text-muted-foreground">{t("pnl.pending") || "Pending"}</span>
            </div>
            <p className="text-xl font-bold">{s.pendingRobux.toLocaleString()} <span className="text-sm text-muted-foreground">R$</span></p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-500/5 to-emerald-500/0 border-emerald-500/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              <span className="text-xs text-muted-foreground">{t("pnl.today") || "Today"}</span>
            </div>
            <p className="text-xl font-bold">{todayRev.toLocaleString()} <span className="text-sm text-muted-foreground">R$</span></p>
            <p className="text-xs text-muted-foreground">{todaySales} {t("pnl.sales")}</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/5 to-purple-500/0 border-purple-500/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-2">
              <PiggyBank className="w-4 h-4 text-purple-500" />
              <span className="text-xs text-muted-foreground">{t("pnl.net7d") || "Net (7d)"}</span>
            </div>
            <p className="text-xl font-bold">{s.netRevenue.toLocaleString()} <span className="text-sm text-muted-foreground">R$</span></p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">{t("pnl.weekRevenue") || "Week Revenue"}</p>
            <p className="text-lg font-bold text-green-500">{s.weekRevenue.toLocaleString()} R$</p>
            <p className="text-[10px] text-muted-foreground">{weekSales} {t("pnl.sales")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">{t("pnl.monthRevenue") || "Month Revenue"}</p>
            <p className="text-lg font-bold text-green-500">{s.monthRevenue.toLocaleString()} R$</p>
            <p className="text-[10px] text-muted-foreground">{totalSales} {t("pnl.sales")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">{t("pnl.commission") || "Commission (30%)"}</p>
            <p className="text-lg font-bold text-red-500">-{s.robloxCommission.toLocaleString()} R$</p>
            <p className="text-[10px] text-muted-foreground">{t("pnl.monthLabel") || "month"}: -{Math.round(s.monthRevenue * 0.3).toLocaleString()} R$</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">{t("pnl.netFiat") || "Net in Fiat"}</p>
            <p className="text-lg font-bold">${s.netUSD} <span className="text-sm text-muted-foreground">/ {s.netRUB.toLocaleString()} ₽</span></p>
            <p className="text-[10px] text-muted-foreground">{t("pnl.monthLabel") || "month"}: ${s.netMonthUSD} / {s.netMonthRUB.toLocaleString()} ₽</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="w-4 h-4" /> {t("pnl.topItems") || "Top Items by Revenue"}
            </CardTitle>
            <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5">
              <button
                onClick={() => setTopItemsPeriod("day")}
                className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${topItemsPeriod === "day" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                24h
              </button>
              <button
                onClick={() => setTopItemsPeriod("week")}
                className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${topItemsPeriod === "week" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                7d
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {txError && !txData ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <TrendingDown className="w-6 h-6 mb-2 opacity-30" />
              <p className="text-sm mb-2">{t("pnl.txFailed") || "Failed to load transactions"}</p>
              <Button variant="outline" size="sm" onClick={() => fetchTx()}>{t("sniper.refresh")}</Button>
            </div>
          ) : txLoading && !txData ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="w-6 h-6 mb-2 animate-spin opacity-40" />
              <p className="text-sm">{t("pnl.loadingTx") || "Loading transactions..."}</p>
            </div>
          ) : (() => {
            const items = topItemsPeriod === "day" ? (txData?.topItemsDay || []) : (txData?.topItemsWeek || []);
            if (items.length === 0) {
              return (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <BarChart3 className="w-8 h-8 mb-2 opacity-20" />
                  <p className="text-sm">{topItemsPeriod === "day" ? "No sales in the last 24 hours" : "No sales in the last 7 days"}</p>
                </div>
              );
            }
            return (
              <div className="space-y-2.5">
                {items.map((item, i) => {
                  const maxRev = items[0].revenue || 1;
                  const pct = Math.round((item.revenue / maxRev) * 100);
                  return (
                    <div key={i} className="space-y-1">
                      <div className="flex items-center gap-2.5 text-sm">
                        {item.thumbnailUrl ? (
                          <img src={item.thumbnailUrl} alt={item.name} className="w-9 h-9 rounded-lg object-cover border border-border/50 shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                            <ImageIcon className="w-4 h-4 text-muted-foreground/30" />
                          </div>
                        )}
                        <span className="font-medium truncate flex-1">{item.name}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Badge variant="outline" className="text-[10px]">{item.count} {t("pnl.sales")}</Badge>
                          <span className="font-mono font-semibold text-green-600 text-xs">{item.revenue.toLocaleString()} R$</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-secondary rounded-full overflow-hidden ml-11">
                        <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {txData && txData.recentTransactions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Coins className="w-4 h-4" /> {t("pnl.recentTx") || "Recent Transactions"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-64 overflow-y-auto custom-scrollbar">
              {txData.recentTransactions.map((tx) => (
                <div key={tx.id} className="flex items-center gap-3 py-2 border-b border-border/20 last:border-0">
                  {tx.thumbnailUrl ? (
                    <img src={tx.thumbnailUrl} alt="" className="w-9 h-9 rounded-lg object-cover border border-border/50 shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                      <ImageIcon className="w-4 h-4 text-muted-foreground/30" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{tx.description}</p>
                    <p className="text-xs text-muted-foreground">{tx.agentName} &middot; {new Date(tx.created).toLocaleDateString("ru-RU")}</p>
                  </div>
                  <span className="text-sm font-mono font-semibold text-green-600 shrink-0 ml-3">+{tx.revenue} R$</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}
