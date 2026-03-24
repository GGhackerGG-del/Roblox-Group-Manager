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
  TrendingUp, TrendingDown, Loader2, RefreshCw,
  Wallet, Clock, BarChart3, Coins, PiggyBank,
  Image as ImageIcon, ExternalLink
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const shimmer = {
  animate: {
    opacity: [1, 0.5, 1],
    transition: { duration: 1.2, repeat: Infinity, ease: "easeInOut" },
  },
};

interface SummaryData {
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

interface TopItemsData {
  topItemsDay: Array<{ name: string; revenue: number; count: number; assetId?: number | null; thumbnailUrl?: string | null }>;
  topItemsWeek: Array<{ name: string; revenue: number; count: number; assetId?: number | null; thumbnailUrl?: string | null }>;
  todayRevenue: number;
  todaySales: number;
  weekSales: number;
  totalSales: number;
}

interface RecentData {
  recentTransactions: Array<{
    id: string; created: string; revenue: number; agentName: string;
    description: string; thumbnailUrl?: string | null; assetId?: number | null;
  }>;
}

function makeHeaders() {
  const { token, fingerprint } = getAuthCredentials();
  const h: Record<string, string> = {};
  if (token) h["Authorization"] = `Bearer ${token}`;
  if (fingerprint) h["X-Device-Fingerprint"] = fingerprint;
  return h;
}

function RefreshBtn({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="p-1 rounded-md hover:bg-secondary transition-colors disabled:opacity-40"
      title="Refresh"
    >
      <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
    </button>
  );
}

export default function PnL({ groupId }: { groupId: string }) {
  const { t } = useLanguage();
  const cache = usePageCache();

  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [topItems, setTopItems] = useState<TopItemsData | null>(null);
  const [recent, setRecent] = useState<RecentData | null>(null);

  const [summaryLoading, setSummaryLoading] = useState(true);
  const [topLoading, setTopLoading] = useState(true);
  const [recentLoading, setRecentLoading] = useState(true);

  const [summaryError, setSummaryError] = useState(false);
  const [topError, setTopError] = useState(false);
  const [recentError, setRecentError] = useState(false);

  const [topItemsPeriod, setTopItemsPeriod] = useState<"day" | "week">("day");

  const fetchSummary = useCallback(async (silent = false) => {
    setSummaryLoading(true);
    setSummaryError(false);
    try {
      const resp = await fetch(`${BASE}/api/pnl/group/${groupId}/summary`, {
        credentials: "include", headers: makeHeaders(),
      });
      if (!resp.ok) throw new Error("Failed");
      const data = await resp.json();
      setSummary(data);
      cache.set(`pnl_summary_${groupId}`, data);
      if (!silent) playSuccess();
    } catch {
      setSummaryError(true);
    } finally {
      setSummaryLoading(false);
    }
  }, [groupId]);

  const fetchTopItems = useCallback(async (silent = false) => {
    setTopLoading(true);
    setTopError(false);
    try {
      const resp = await fetch(`${BASE}/api/pnl/group/${groupId}/top-items`, {
        credentials: "include", headers: makeHeaders(),
      });
      if (!resp.ok) throw new Error("Failed");
      const data = await resp.json();
      setTopItems(data);
      cache.set(`pnl_top_${groupId}`, data);
      if (!silent) playSuccess();
    } catch {
      setTopError(true);
    } finally {
      setTopLoading(false);
    }
  }, [groupId]);

  const fetchRecent = useCallback(async (silent = false) => {
    setRecentLoading(true);
    setRecentError(false);
    try {
      const resp = await fetch(`${BASE}/api/pnl/group/${groupId}/recent`, {
        credentials: "include", headers: makeHeaders(),
      });
      if (!resp.ok) throw new Error("Failed");
      const data = await resp.json();
      setRecent(data);
      cache.set(`pnl_recent_${groupId}`, data);
      if (!silent) playSuccess();
    } catch {
      setRecentError(true);
    } finally {
      setRecentLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    const cs = cache.get<SummaryData>(`pnl_summary_${groupId}`);
    const ct = cache.get<TopItemsData>(`pnl_top_${groupId}`);
    const cr = cache.get<RecentData>(`pnl_recent_${groupId}`);
    if (cs) { setSummary(cs); setSummaryLoading(false); }
    if (ct) { setTopItems(ct); setTopLoading(false); }
    if (cr) { setRecent(cr); setRecentLoading(false); }

    fetchSummary(!!cs);
    fetchTopItems(!!ct);
    fetchRecent(!!cr);
  }, [groupId]);

  const s = summary;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{t("pnl.title")}</h3>
      </div>

      {summaryLoading && !s ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[5, 6, 7, 8].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        </div>
      ) : summaryError && !s ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <TrendingDown className="w-8 h-8 mb-3 opacity-30" />
          <p className="text-sm mb-2">{t("pnl.failedLoad") || "Failed to load summary"}</p>
          <Button variant="outline" size="sm" onClick={() => fetchSummary()}>{t("sniper.refresh")}</Button>
        </div>
      ) : s ? (
        <>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium">{t("pnl.stats") || "Stats"}</span>
            <RefreshBtn loading={summaryLoading} onClick={() => { playClick(); fetchSummary(true); }} />
          </div>
          <motion.div animate={summaryLoading ? shimmer.animate : {}} className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
                <p className="text-xl font-bold">{(topItems ? Math.max(topItems.todayRevenue, s.todayRevenue) : s.todayRevenue).toLocaleString()} <span className="text-sm text-muted-foreground">R$</span></p>
                {topItems && <p className="text-xs text-muted-foreground">{topItems.todaySales} {t("pnl.sales")}</p>}
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
          </motion.div>

          <motion.div animate={summaryLoading ? shimmer.animate : {}} className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">{t("pnl.weekRevenue") || "Week Revenue"}</p>
                <p className="text-lg font-bold text-green-500">{s.weekRevenue.toLocaleString()} R$</p>
                {topItems && <p className="text-[10px] text-muted-foreground">{topItems.weekSales} {t("pnl.sales")}</p>}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">{t("pnl.monthRevenue") || "Month Revenue"}</p>
                <p className="text-lg font-bold text-green-500">{s.monthRevenue.toLocaleString()} R$</p>
                {topItems && <p className="text-[10px] text-muted-foreground">{topItems.totalSales} {t("pnl.sales")}</p>}
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
          </motion.div>
        </>
      ) : null}

      <motion.div animate={topLoading && topItems ? shimmer.animate : undefined}>
        <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="w-4 h-4" /> {t("pnl.topItems") || "Top Items by Revenue"}
            </CardTitle>
            <div className="flex items-center gap-2">
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
              <RefreshBtn loading={topLoading} onClick={() => { playClick(); fetchTopItems(true); }} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {topError && !topItems ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <TrendingDown className="w-6 h-6 mb-2 opacity-30" />
              <p className="text-sm mb-2">{t("pnl.txFailed") || "Failed to load. Roblox API may be rate limited."}</p>
              <Button variant="outline" size="sm" onClick={() => fetchTopItems()}>{t("sniper.refresh")}</Button>
            </div>
          ) : topLoading && !topItems ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="w-6 h-6 mb-2 animate-spin opacity-40" />
              <p className="text-sm">{t("pnl.loadingTx") || "Loading transactions..."}</p>
            </div>
          ) : (() => {
            const items = topItemsPeriod === "day" ? (topItems?.topItemsDay || []) : (topItems?.topItemsWeek || []);
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
                        {item.assetId ? (
                          <button
                            onClick={() => window.open(`https://www.roblox.com/catalog/${item.assetId}`, "_blank", "noopener,noreferrer")}
                            className="font-medium truncate flex-1 text-left hover:text-blue-400 hover:underline transition-colors flex items-center gap-1 group"
                          >
                            {item.name}
                            <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-60 shrink-0 transition-opacity" />
                          </button>
                        ) : (
                          <span className="font-medium truncate flex-1">{item.name}</span>
                        )}
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
      </motion.div>

      <motion.div animate={recentLoading && recent ? shimmer.animate : undefined}>
        <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Coins className="w-4 h-4" /> {t("pnl.recentTx") || "Last Purchases"}
            </CardTitle>
            <RefreshBtn loading={recentLoading} onClick={() => { playClick(); fetchRecent(true); }} />
          </div>
        </CardHeader>
        <CardContent>
          {recentError && !recent ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <TrendingDown className="w-6 h-6 mb-2 opacity-30" />
              <p className="text-sm mb-2">{t("pnl.txFailed") || "Failed to load. Roblox API may be rate limited."}</p>
              <Button variant="outline" size="sm" onClick={() => fetchRecent()}>{t("sniper.refresh")}</Button>
            </div>
          ) : recentLoading && !recent ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="w-6 h-6 mb-2 animate-spin opacity-40" />
              <p className="text-sm">{t("pnl.loadingTx") || "Loading..."}</p>
            </div>
          ) : (!recent || recent.recentTransactions.length === 0) ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Coins className="w-8 h-8 mb-2 opacity-20" />
              <p className="text-sm">No recent transactions</p>
            </div>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto custom-scrollbar">
              {recent.recentTransactions.map((tx) => (
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
          )}
        </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
