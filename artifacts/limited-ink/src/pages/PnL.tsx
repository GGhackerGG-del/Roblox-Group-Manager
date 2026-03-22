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

interface PnLData {
  balance: number;
  pendingRobux: number;
  dailyRevenue: number;
  todayRevenue: number;
  weekRevenue: number;
  robloxCommission: number;
  netRevenue: number;
  netUSD: number;
  netRUB: number;
  totalSales: number;
  todaySales: number;
  topItems: Array<{ name: string; revenue: number; count: number }>;
  recentTransactions: Array<{ id: string; created: string; revenue: number; agentName: string; description: string; thumbnailUrl?: string | null; assetId?: number | null }>;
}

export default function PnL({ groupId }: { groupId: string }) {
  const { t } = useLanguage();
  const cache = usePageCache();
  const [data, setData] = useState<PnLData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    playClick();
    try {
      const { token, fingerprint } = getAuthCredentials();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      if (fingerprint) headers["X-Device-Fingerprint"] = fingerprint;

      const resp = await fetch(`${BASE}/api/pnl/group/${groupId}`, {
        credentials: "include",
        headers,
      });

      if (!resp.ok) throw new Error("Failed to load P&L data");
      const result = await resp.json();
      setData(result);
      cache.set(`pnl_${groupId}`, result);
      playSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    const cached = cache.get<PnLData>(`pnl_${groupId}`);
    if (cached) {
      setData(cached);
      setLoading(false);
    } else {
      fetchData();
    }
  }, [groupId]);

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <TrendingDown className="w-8 h-8 mb-3 opacity-30" />
        <p className="text-sm">{error || t("pnl.noData")}</p>
        <Button variant="outline" size="sm" onClick={fetchData} className="mt-3">{t("sniper.refresh")}</Button>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{t("pnl.title")}</h3>
        <Button variant="ghost" size="sm" onClick={fetchData}>
          <RefreshCw className="w-3.5 h-3.5 mr-1" /> {t("sniper.refresh")}
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-gradient-to-br from-green-500/5 to-green-500/0 border-green-500/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="w-4 h-4 text-green-500" />
              <span className="text-xs text-muted-foreground">{t("pnl.balance") || "Balance"}</span>
            </div>
            <p className="text-xl font-bold">{data.balance.toLocaleString()} <span className="text-sm text-muted-foreground">R$</span></p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/5 to-blue-500/0 border-blue-500/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-blue-500" />
              <span className="text-xs text-muted-foreground">{t("pnl.pending") || "Pending"}</span>
            </div>
            <p className="text-xl font-bold">{data.pendingRobux.toLocaleString()} <span className="text-sm text-muted-foreground">R$</span></p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-500/5 to-emerald-500/0 border-emerald-500/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              <span className="text-xs text-muted-foreground">{t("pnl.today") || "Today"}</span>
            </div>
            <p className="text-xl font-bold">{data.todayRevenue.toLocaleString()} <span className="text-sm text-muted-foreground">R$</span></p>
            <p className="text-xs text-muted-foreground">{data.todaySales} {t("pnl.sales")}</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/5 to-purple-500/0 border-purple-500/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-2">
              <PiggyBank className="w-4 h-4 text-purple-500" />
              <span className="text-xs text-muted-foreground">{t("pnl.net7d") || "Net (7d)"}</span>
            </div>
            <p className="text-xl font-bold">{data.netRevenue.toLocaleString()} <span className="text-sm text-muted-foreground">R$</span></p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">{t("pnl.weekRevenue") || "Week Gross Revenue"}</p>
            <p className="text-lg font-bold text-green-500">{data.weekRevenue.toLocaleString()} R$</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">{t("pnl.commission") || "Roblox Commission (30%)"}</p>
            <p className="text-lg font-bold text-red-500">-{data.robloxCommission.toLocaleString()} R$</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">{t("pnl.netFiat") || "Net in Fiat"}</p>
            <p className="text-lg font-bold">${data.netUSD} <span className="text-sm text-muted-foreground">/ {data.netRUB.toLocaleString()} ₽</span></p>
          </CardContent>
        </Card>
      </div>

      {data.topItems.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="w-4 h-4" /> {t("pnl.topItems") || "Top Items by Revenue"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.topItems.map((item, i) => {
                const maxRev = data.topItems[0].revenue || 1;
                const pct = Math.round((item.revenue / maxRev) * 100);
                return (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium truncate flex-1">{item.name}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="text-[10px]">{item.count} {t("pnl.sales")}</Badge>
                        <span className="font-mono font-semibold text-green-600">{item.revenue.toLocaleString()} R$</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {data.recentTransactions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Coins className="w-4 h-4" /> {t("pnl.recentTx") || "Recent Transactions"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-64 overflow-y-auto custom-scrollbar">
              {data.recentTransactions.map((tx) => (
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
