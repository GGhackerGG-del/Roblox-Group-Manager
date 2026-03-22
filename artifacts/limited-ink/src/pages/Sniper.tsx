import React, { useState, useEffect, useCallback } from "react";
import { getAuthCredentials } from "@workspace/api-client-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Search, TrendingUp, TrendingDown, Minus, Star,
  RefreshCw, ShoppingCart, Eye, ExternalLink, Crosshair
} from "lucide-react";
import { playClick, playSuccess, playError, playTabSwitch } from "@/hooks/useSounds";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function getAuthHeaders(): Record<string, string> {
  const { token, fingerprint } = getAuthCredentials();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (fingerprint) headers["X-Device-Fingerprint"] = fingerprint;
  return headers;
}

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${url}`, { credentials: "include", ...opts, headers: { ...getAuthHeaders(), ...(opts?.headers || {}) } });
  if (!r.ok) {
    const e = await r.json().catch(() => ({ error: r.statusText })) as { error?: string };
    throw new Error(e.error || `HTTP ${r.status}`);
  }
  return r.json() as Promise<T>;
}

interface LimitedItem {
  id: number;
  name: string;
  acronym: string;
  rap: number;
  value: number;
  demand: number;
  trend: number;
  projected: number;
  hyped: number;
  rare: number;
  thumbnailUrl?: string | null;
  dealPercent?: number;
  catalogPrice?: number | null;
}

interface WatchlistEntry {
  assetId: number;
  name: string;
  maxPrice: number;
  thumbnailUrl?: string | null;
  productId?: number | null;
  sellerId?: number | null;
  userAssetId?: number | null;
  livePrice?: number | null;
  available?: boolean;
}

const demandKeys: Record<number, string> = { [-1]: "sniper.demand.terrible", 0: "sniper.demand.low", 1: "sniper.demand.normal", 2: "sniper.demand.high", 3: "sniper.demand.amazing" };
const trendIcons: Record<number, React.ReactNode> = {
  [-1]: <TrendingDown className="w-3.5 h-3.5 text-red-500" />,
  0: <Minus className="w-3.5 h-3.5 text-amber-500" />,
  1: <Minus className="w-3.5 h-3.5 text-green-500" />,
  2: <TrendingUp className="w-3.5 h-3.5 text-green-500" />,
  3: <TrendingUp className="w-3.5 h-3.5 text-amber-500" />,
};

function formatRobux(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function ItemCard({ item, onWatch, watching }: { item: LimitedItem; onWatch: (i: LimitedItem) => void; watching: boolean }) {
  const { t } = useLanguage();
  return (
    <div className="rounded-xl border border-border/50 p-3 bg-card hover:bg-accent/20 transition-colors">
      <div className="flex gap-3">
        {item.thumbnailUrl ? (
          <img src={item.thumbnailUrl} alt={item.name} className="w-16 h-16 rounded-lg object-cover shrink-0" loading="lazy" />
        ) : (
          <div className="w-16 h-16 rounded-lg bg-muted shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{item.name}</p>
          {item.acronym && <p className="text-[10px] text-muted-foreground">{item.acronym}</p>}
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
            <span>RAP: <strong className="text-foreground">{formatRobux(item.rap)}</strong></span>
            <span>Value: <strong className="text-foreground">{formatRobux(item.value)}</strong></span>
            {item.catalogPrice != null && item.catalogPrice > 0 && (
              <span>{t("sniper.catalogPrice")}: <strong className="text-blue-600 dark:text-blue-400">{formatRobux(item.catalogPrice)}</strong></span>
            )}
            {item.rap > 0 && item.value > 0 && item.value > item.rap && (
              <span className="text-green-600 font-semibold">+{Math.round((item.value / item.rap - 1) * 100)}%</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="text-[9px] h-5">{t(demandKeys[item.demand] || "sniper.demand.normal")}</Badge>
            {trendIcons[item.trend]}
            {item.projected === 1 && <Badge className="text-[9px] h-5 bg-purple-500/20 text-purple-700 dark:text-purple-300 border-0">{t("sniper.projected")}</Badge>}
            {item.rare === 1 && <Badge className="text-[9px] h-5 bg-amber-500/20 text-amber-700 dark:text-amber-300 border-0">{t("sniper.rare")}</Badge>}
            {item.dealPercent !== undefined && item.dealPercent > 0 && (
              <Badge className="text-[9px] h-5 bg-green-500/20 text-green-700 dark:text-green-300 border-0">+{item.dealPercent}%</Badge>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <a href={`https://www.roblox.com/catalog/${item.id}`} target="_blank" rel="noreferrer">
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0"><ExternalLink className="w-3.5 h-3.5" /></Button>
          </a>
          <Button size="sm" variant={watching ? "default" : "outline"} className="h-7 w-7 p-0" onClick={() => { playClick(); onWatch(item); }}>
            <Eye className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function Sniper() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [tab, setTab] = useState("browse");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<LimitedItem[]>([]);
  const [deals, setDeals] = useState<LimitedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dealsLoading, setDealsLoading] = useState(false);
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem("sniper_watchlist") || "[]"); } catch { return []; }
  });
  const [monitoring, setMonitoring] = useState(false);
  const [buying, setBuying] = useState<number | null>(null);

  const saveWatchlist = useCallback((wl: WatchlistEntry[]) => {
    setWatchlist(wl);
    localStorage.setItem("sniper_watchlist", JSON.stringify(wl));
  }, []);

  const fetchItems = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const params = q ? `?search=${encodeURIComponent(q)}` : "";
      const data = await apiFetch<{ items: LimitedItem[]; total: number }>(`/api/sniper/items${params}`);
      setItems(data.items || []);
    } catch (e: unknown) {
      toast({ title: t("sniper.error"), description: e instanceof Error ? e.message : t("sniper.failedLoad"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  const fetchDeals = useCallback(async () => {
    setDealsLoading(true);
    try {
      const data = await apiFetch<{ items: LimitedItem[] }>("/api/sniper/deals");
      setDeals(data.items || []);
    } catch (e: unknown) {
      toast({ title: t("sniper.error"), description: e instanceof Error ? e.message : t("sniper.failedLoadDeals"), variant: "destructive" });
    } finally {
      setDealsLoading(false);
    }
  }, [toast, t]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleSearch = () => { playClick(); fetchItems(search); };

  const toggleWatch = (item: LimitedItem) => {
    const exists = watchlist.find(w => w.assetId === item.id);
    if (exists) {
      saveWatchlist(watchlist.filter(w => w.assetId !== item.id));
    } else {
      saveWatchlist([...watchlist, { assetId: item.id, name: item.name, maxPrice: item.rap, thumbnailUrl: item.thumbnailUrl }]);
    }
  };

  const checkLivePrices = async () => {
    if (!watchlist.length) return;
    setMonitoring(true);
    const updated = [...watchlist];
    let errors = 0;
    for (let i = 0; i < updated.length; i++) {
      try {
        const data = await apiFetch<{ price: number | null; productId: number | null; sellerId: number | null; userAssetId: number | null; available: boolean }>(
          `/api/sniper/live/${updated[i].assetId}`
        );
        updated[i] = { ...updated[i], livePrice: data.price, productId: data.productId, sellerId: data.sellerId, userAssetId: data.userAssetId, available: data.available };
      } catch {
        errors++;
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    saveWatchlist(updated);
    setMonitoring(false);
    if (errors > 0) {
      playError();
      toast({ title: t("sniper.pricesUpdated"), description: `${errors}/${updated.length} ${t("sniper.pricesPartialFail")}`, variant: "destructive" });
    } else {
      playSuccess();
      toast({ title: t("sniper.pricesUpdated"), description: t("sniper.pricesAllChecked") });
    }
  };

  const handleBuy = async (entry: WatchlistEntry) => {
    if (!entry.livePrice) return;
    playClick();
    setBuying(entry.assetId);
    try {
      const data = await apiFetch<{ message: string }>("/api/sniper/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId: entry.assetId, maxPrice: entry.maxPrice }),
      });
      playSuccess();
      toast({ title: t("sniper.purchased"), description: data.message });
    } catch (e: unknown) {
      playError();
      toast({ title: t("sniper.purchaseFailed"), description: e instanceof Error ? e.message : t("sniper.error"), variant: "destructive" });
    } finally {
      setBuying(null);
    }
  };

  return (
    <div className="p-6 lg:p-10 w-full max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Crosshair className="w-7 h-7 text-foreground" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("sniper.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("sniper.desc")}</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={v => { playTabSwitch(); setTab(v); if (v === "deals" && !deals.length) fetchDeals(); }}>
        <TabsList className="rounded-xl bg-secondary/50 border border-border p-1 h-auto gap-1">
          <TabsTrigger value="browse" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-3 py-2 gap-1.5">
            <Search className="w-3.5 h-3.5" /> {t("sniper.browse")}
          </TabsTrigger>
          <TabsTrigger value="deals" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-3 py-2 gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" /> {t("sniper.deals")}
          </TabsTrigger>
          <TabsTrigger value="watchlist" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-3 py-2 gap-1.5">
            <Eye className="w-3.5 h-3.5" /> {t("sniper.watchlist")} ({watchlist.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="browse" className="mt-4 space-y-4">
          <div className="flex gap-2">
            <Input placeholder={t("sniper.search")} value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSearch()} className="rounded-xl" />
            <Button onClick={handleSearch} disabled={loading} className="rounded-xl gap-1.5">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} {t("sniper.searchBtn")}
            </Button>
          </div>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[600px] overflow-y-auto pr-1">
              {items.map(item => (
                <ItemCard key={item.id} item={item} onWatch={toggleWatch} watching={!!watchlist.find(w => w.assetId === item.id)} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="deals" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{t("sniper.deals.desc")}</p>
            <Button size="sm" variant="outline" className="rounded-xl gap-1.5" onClick={fetchDeals} disabled={dealsLoading}>
              <RefreshCw className={`w-3.5 h-3.5 ${dealsLoading ? "animate-spin" : ""}`} /> {t("sniper.refresh")}
            </Button>
          </div>
          {dealsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[600px] overflow-y-auto pr-1">
              {deals.map(item => (
                <ItemCard key={item.id} item={item} onWatch={toggleWatch} watching={!!watchlist.find(w => w.assetId === item.id)} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="watchlist" className="mt-4 space-y-4">
          <Card className="rounded-2xl border-border/50">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2"><Eye className="w-4 h-4" /> {t("sniper.watchlist.title")}</CardTitle>
                <CardDescription>{t("sniper.watchlist.desc")}</CardDescription>
              </div>
              <Button size="sm" className="rounded-xl gap-1.5" onClick={checkLivePrices} disabled={monitoring || !watchlist.length}>
                {monitoring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                {t("sniper.checkPrices")}
              </Button>
            </CardHeader>
            <CardContent>
              {watchlist.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">{t("sniper.addItems")}</p>
              ) : (
                <div className="space-y-2">
                  {watchlist.map(entry => (
                    <div key={entry.assetId} className="flex items-center gap-3 rounded-xl border border-border/50 p-3 bg-card">
                      {entry.thumbnailUrl ? (
                        <img src={entry.thumbnailUrl} alt={entry.name} className="w-12 h-12 rounded-lg object-cover shrink-0" />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-muted shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{entry.name}</p>
                        <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                          <span>{t("sniper.target")}: <strong>{formatRobux(entry.maxPrice)}</strong></span>
                          {entry.livePrice !== undefined && entry.livePrice !== null && (
                            <span className={entry.livePrice <= entry.maxPrice ? "text-green-600 font-bold" : ""}>
                              {t("sniper.live")}: <strong>{formatRobux(entry.livePrice)}</strong>
                            </span>
                          )}
                          {entry.available === false && <span className="text-amber-500">{t("sniper.notForSale")}</span>}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Input
                          type="number"
                          value={entry.maxPrice}
                          onChange={e => {
                            const v = parseInt(e.target.value) || 0;
                            saveWatchlist(watchlist.map(w => w.assetId === entry.assetId ? { ...w, maxPrice: v } : w));
                          }}
                          className="w-20 rounded-lg text-xs h-8"
                        />
                        {entry.available && entry.livePrice && entry.livePrice <= entry.maxPrice && (
                          <Button size="sm" className="rounded-lg h-8 gap-1 bg-green-600 hover:bg-green-700" onClick={() => handleBuy(entry)} disabled={buying === entry.assetId}>
                            {buying === entry.assetId ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShoppingCart className="w-3 h-3" />}
                            {t("sniper.buy")}
                          </Button>
                        )}
                        <a href={`https://www.roblox.com/catalog/${entry.assetId}`} target="_blank" rel="noreferrer">
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0"><ExternalLink className="w-3.5 h-3.5" /></Button>
                        </a>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500" onClick={() => saveWatchlist(watchlist.filter(w => w.assetId !== entry.assetId))}>
                          <Star className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
