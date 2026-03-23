import React, { useState, useEffect, useCallback, useRef } from "react";
import { getAuthCredentials } from "@workspace/api-client-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar,
} from "recharts";
import {
  Loader2, Search, TrendingUp, TrendingDown, Minus, Star,
  RefreshCw, ShoppingCart, Eye, ExternalLink, Crosshair, Zap,
  Bell, BarChart3, ArrowLeftRight, AlertTriangle, ClipboardList,
  Plus, Trash2, ChevronRight, ChevronDown, Activity, Package, Tag, Clock,
  Image as ImageIcon, CheckCircle2, XCircle, Bot,
} from "lucide-react";
import { playClick, playSuccess, playError, playTabSwitch } from "@/hooks/useSounds";
import { motion, AnimatePresence } from "framer-motion";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function getAuthHeaders(): Record<string, string> {
  const { token, fingerprint } = getAuthCredentials();
  const h: Record<string, string> = {};
  if (token) h["Authorization"] = `Bearer ${token}`;
  if (fingerprint) h["X-Device-Fingerprint"] = fingerprint;
  return h;
}

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${url}`, {
    credentials: "include", ...opts,
    headers: { ...getAuthHeaders(), ...(opts?.headers || {}) },
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({ error: r.statusText })) as { error?: string };
    throw new Error(e.error || `HTTP ${r.status}`);
  }
  return r.json() as Promise<T>;
}

interface LimitedItem {
  id: number; name: string; acronym: string;
  rap: number; value: number; demand: number; trend: number;
  projected: number; hyped: number; rare: number;
  thumbnailUrl?: string | null; dealPercent?: number;
  catalogPrice?: number | null; discount?: number;
}

interface WatchlistEntry {
  assetId: number; name: string; maxPrice: number;
  thumbnailUrl?: string | null; productId?: number | null;
  sellerId?: number | null; userAssetId?: number | null;
  livePrice?: number | null; available?: boolean; autoBuy?: boolean;
}

interface DealLogEntry {
  id: string; timestamp: number; assetId: number; itemName: string;
  targetPrice: number; actualPrice: number;
  status: "bought" | "alert" | "failed";
  thumbnailUrl?: string | null;
}

const demandKeys: Record<number, string> = {
  [-1]: "sniper.demand.terrible", 0: "sniper.demand.low",
  1: "sniper.demand.normal", 2: "sniper.demand.high", 3: "sniper.demand.amazing",
};
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

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  } catch { return dateStr; }
}

function ItemCard({ item, onWatch, watching }: { item: LimitedItem; onWatch: (i: LimitedItem) => void; watching: boolean }) {
  const { t } = useLanguage();
  return (
    <div className="rounded-xl border border-border/50 p-3 bg-card hover:bg-accent/20 transition-colors">
      <div className="flex gap-3">
        {item.thumbnailUrl ? (
          <img src={item.thumbnailUrl} alt={item.name} className="w-16 h-16 rounded-lg object-cover shrink-0" loading="lazy" />
        ) : (
          <div className="w-16 h-16 rounded-lg bg-muted shrink-0 flex items-center justify-center">
            <ImageIcon className="w-5 h-5 text-muted-foreground/30" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{item.name}</p>
          {item.acronym && <p className="text-[10px] text-muted-foreground">{item.acronym}</p>}
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
            <span>RAP: <strong className="text-foreground">{formatRobux(item.rap)}</strong></span>
            <span>Value: <strong className="text-foreground">{formatRobux(item.value)}</strong></span>
            {item.catalogPrice != null && item.catalogPrice > 0 && (
              <span>Price: <strong className="text-blue-600 dark:text-blue-400">{formatRobux(item.catalogPrice)}</strong></span>
            )}
            {item.rap > 0 && item.value > 0 && item.value > item.rap && (
              <span className="text-green-600 font-semibold">+{Math.round((item.value / item.rap - 1) * 100)}%</span>
            )}
            {item.discount != null && item.discount > 0 && (
              <span className="text-orange-600 font-bold">-{item.discount}% RAP</span>
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
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalItems, setTotalItems] = useState(0);

  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem("sniper_watchlist") || "[]"); } catch { return []; }
  });
  const [monitoring, setMonitoring] = useState(false);
  const [buying, setBuying] = useState<number | null>(null);

  const [botActive, setBotActive] = useState(false);
  const [botInterval, setBotInterval] = useState("60");
  const botRef = useRef<NodeJS.Timeout | null>(null);

  const [dealLog, setDealLog] = useState<DealLogEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem("sniper_deal_log") || "[]"); } catch { return []; }
  });

  const [underprice, setUnderprice] = useState<LimitedItem[]>([]);
  const [underpriceLoading, setUnderpriceLoading] = useState(false);

  const [rapSearch, setRapSearch] = useState("");
  const [rapSearchResults, setRapSearchResults] = useState<LimitedItem[]>([]);
  const [rapSearchLoading, setRapSearchLoading] = useState(false);
  const [rapData, setRapData] = useState<{
    assetId: number; name: string; rap: number; value: number; thumbnailUrl?: string | null;
    priceDataPoints: Array<{ value: number; date: string }>;
    volumeDataPoints: Array<{ value: number; date: string }>;
    recentAveragePrice: number; originalPrice?: number; numberRemaining?: number;
  } | null>(null);
  const [rapLoading, setRapLoading] = useState(false);

  const [tradeGive, setTradeGive] = useState<LimitedItem[]>([]);
  const [tradeReceive, setTradeReceive] = useState<LimitedItem[]>([]);
  const [tradeSearch, setTradeSearch] = useState("");
  const [tradeSearchResults, setTradeSearchResults] = useState<LimitedItem[]>([]);
  const [tradeSearchLoading, setTradeSearchLoading] = useState(false);
  const [tradeTarget, setTradeTarget] = useState<"give" | "receive">("give");

  const saveWatchlist = useCallback((wl: WatchlistEntry[]) => {
    setWatchlist(wl);
    localStorage.setItem("sniper_watchlist", JSON.stringify(wl));
  }, []);

  useEffect(() => {
    localStorage.setItem("sniper_deal_log", JSON.stringify(dealLog));
  }, [dealLog]);

  const fetchItems = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("search", q);
      params.set("offset", "0");
      params.set("limit", "200");
      const data = await apiFetch<{ items: LimitedItem[]; total: number; hasMore: boolean }>(`/api/sniper/items?${params}`);
      setItems(data.items || []);
      setHasMore(data.hasMore || false);
      setTotalItems(data.total || 0);
    } catch (e: unknown) {
      toast({ title: t("sniper.error"), description: e instanceof Error ? e.message : t("sniper.failedLoad"), variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast, t]);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      params.set("offset", String(items.length));
      params.set("limit", "200");
      const data = await apiFetch<{ items: LimitedItem[]; total: number; hasMore: boolean }>(`/api/sniper/items?${params}`);
      setItems(prev => [...prev, ...(data.items || [])]);
      setHasMore(data.hasMore || false);
      setTotalItems(data.total || 0);
    } catch (e: unknown) {
      toast({ title: t("sniper.error"), description: e instanceof Error ? e.message : t("sniper.failedLoad"), variant: "destructive" });
    } finally { setLoadingMore(false); }
  }, [toast, t, search, items.length]);

  const fetchDeals = useCallback(async () => {
    setDealsLoading(true);
    try {
      const data = await apiFetch<{ items: LimitedItem[] }>("/api/sniper/deals");
      setDeals(data.items || []);
    } catch (e: unknown) {
      toast({ title: t("sniper.error"), description: e instanceof Error ? e.message : t("sniper.failedLoadDeals"), variant: "destructive" });
    } finally { setDealsLoading(false); }
  }, [toast, t]);

  const fetchUnderprice = useCallback(async () => {
    setUnderpriceLoading(true);
    try {
      const data = await apiFetch<{ items: LimitedItem[] }>("/api/sniper/underprice");
      setUnderprice(data.items || []);
    } catch (e: unknown) {
      toast({ title: t("sniper.error"), description: e instanceof Error ? e.message : t("sniper.loadFail"), variant: "destructive" });
    } finally { setUnderpriceLoading(false); }
  }, [toast]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleSearch = () => { playClick(); fetchItems(search); };

  const toggleWatch = (item: LimitedItem) => {
    const exists = watchlist.find(w => w.assetId === item.id);
    if (exists) {
      saveWatchlist(watchlist.filter(w => w.assetId !== item.id));
    } else {
      saveWatchlist([...watchlist, {
        assetId: item.id, name: item.name,
        maxPrice: item.rap, thumbnailUrl: item.thumbnailUrl, autoBuy: false,
      }]);
    }
  };

  const checkLivePrices = useCallback(async (silent = false): Promise<WatchlistEntry[]> => {
    if (!watchlist.length) return watchlist;
    if (!silent) setMonitoring(true);
    const updated = [...watchlist];
    let errors = 0;
    for (let i = 0; i < updated.length; i++) {
      try {
        const data = await apiFetch<{ price: number | null; productId: number | null; sellerId: number | null; userAssetId: number | null; available: boolean }>(
          `/api/sniper/live/${updated[i].assetId}`
        );
        updated[i] = { ...updated[i], livePrice: data.price, productId: data.productId, sellerId: data.sellerId, userAssetId: data.userAssetId, available: data.available };
      } catch { errors++; }
      await new Promise(r => setTimeout(r, 800));
    }
    saveWatchlist(updated);
    if (!silent) {
      setMonitoring(false);
      if (errors > 0) {
        playError();
        toast({ title: t("sniper.pricesUpdated"), description: `${errors}/${updated.length} ${t("sniper.pricesPartialFail")}`, variant: "destructive" });
      } else {
        playSuccess();
        toast({ title: t("sniper.pricesUpdated"), description: t("sniper.pricesAllChecked") });
      }
    }
    return updated;
  }, [watchlist, saveWatchlist, toast, t]);

  const handleBuy = async (entry: WatchlistEntry, silent = false): Promise<boolean> => {
    if (!entry.livePrice) return false;
    if (!silent) { playClick(); setBuying(entry.assetId); }
    try {
      const data = await apiFetch<{ message: string }>("/api/sniper/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId: entry.assetId, maxPrice: entry.maxPrice }),
      });
      const logEntry: DealLogEntry = {
        id: Date.now().toString(), timestamp: Date.now(),
        assetId: entry.assetId, itemName: entry.name,
        targetPrice: entry.maxPrice, actualPrice: entry.livePrice,
        status: "bought", thumbnailUrl: entry.thumbnailUrl,
      };
      setDealLog(prev => [logEntry, ...prev].slice(0, 100));
      if (!silent) { playSuccess(); toast({ title: t("sniper.purchased"), description: data.message }); }
      return true;
    } catch (e: unknown) {
      const logEntry: DealLogEntry = {
        id: Date.now().toString(), timestamp: Date.now(),
        assetId: entry.assetId, itemName: entry.name,
        targetPrice: entry.maxPrice, actualPrice: entry.livePrice || 0,
        status: "failed", thumbnailUrl: entry.thumbnailUrl,
      };
      setDealLog(prev => [logEntry, ...prev].slice(0, 100));
      if (!silent) { playError(); toast({ title: t("sniper.purchaseFailed"), description: e instanceof Error ? e.message : t("sniper.error"), variant: "destructive" }); }
      return false;
    } finally {
      if (!silent) setBuying(null);
    }
  };

  const runBotCycle = useCallback(async () => {
    const updated = await checkLivePrices(true);
    const autoBuyItems = updated.filter(e => e.autoBuy && e.available && e.livePrice && e.livePrice <= e.maxPrice);
    for (const entry of autoBuyItems) {
      toast({
        title: `${t("sniper.snipeTitle")}: ${entry.name}`,
        description: `${formatRobux(entry.livePrice!)} R$ ≤ ${formatRobux(entry.maxPrice)} R$ — ${t("sniper.snipeDesc")}`,
      });
      await handleBuy(entry, true);
    }
    const alertItems = updated.filter(e => !e.autoBuy && e.available && e.livePrice && e.livePrice <= e.maxPrice);
    for (const entry of alertItems) {
      playSuccess();
      const logEntry: DealLogEntry = {
        id: Date.now().toString() + entry.assetId, timestamp: Date.now(),
        assetId: entry.assetId, itemName: entry.name,
        targetPrice: entry.maxPrice, actualPrice: entry.livePrice!,
        status: "alert", thumbnailUrl: entry.thumbnailUrl,
      };
      setDealLog(prev => [logEntry, ...prev].slice(0, 100));
      toast({
        title: `🔔 ${entry.name}`,
        description: `${t("sniper.priceFell")} ${formatRobux(entry.livePrice!)} R$ (${t("sniper.goalLabel")}: ${formatRobux(entry.maxPrice)} R$)`,
      });
    }
  }, [checkLivePrices, handleBuy, toast]);

  useEffect(() => {
    if (botActive) {
      const secs = parseInt(botInterval) * 1000;
      botRef.current = setInterval(runBotCycle, secs);
      runBotCycle();
    } else {
      if (botRef.current) clearInterval(botRef.current);
    }
    return () => { if (botRef.current) clearInterval(botRef.current); };
  }, [botActive, botInterval]);

  const searchRapItem = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setRapSearchLoading(true);
    setRapData(null);
    try {
      const numId = parseInt(q.trim());
      if (!isNaN(numId)) {
        const data = await apiFetch<{ assetId: number; name: string; rap: number; value: number; thumbnailUrl?: string | null; priceDataPoints: Array<{ value: number; date: string }>; volumeDataPoints: Array<{ value: number; date: string }>; recentAveragePrice: number; originalPrice?: number; numberRemaining?: number }>(`/api/sniper/rap-history/${numId}`);
        setRapData(data);
        setRapSearchResults([]);
      } else {
        const data = await apiFetch<{ items: LimitedItem[] }>(`/api/sniper/items?search=${encodeURIComponent(q.trim())}`);
        setRapSearchResults((data.items || []).slice(0, 8));
      }
    } catch (e: unknown) {
      toast({ title: t("sniper.error"), description: e instanceof Error ? e.message : t("sniper.searchFail"), variant: "destructive" });
    } finally { setRapSearchLoading(false); }
  }, [toast]);

  const loadRapHistory = useCallback(async (assetId: number) => {
    setRapLoading(true);
    setRapSearchResults([]);
    try {
      const data = await apiFetch<typeof rapData>(`/api/sniper/rap-history/${assetId}`);
      setRapData(data);
    } catch (e: unknown) {
      toast({ title: t("sniper.error"), description: e instanceof Error ? e.message : t("sniper.historyFail"), variant: "destructive" });
    } finally { setRapLoading(false); }
  }, [toast]);

  const searchTradeItems = useCallback(async (q: string) => {
    if (!q.trim()) { setTradeSearchResults([]); return; }
    setTradeSearchLoading(true);
    try {
      const numId = parseInt(q.trim());
      if (!isNaN(numId)) {
        const data = await apiFetch<{ item: LimitedItem }>(`/api/sniper/item/${numId}`);
        setTradeSearchResults([data.item]);
      } else {
        const data = await apiFetch<{ items: LimitedItem[] }>(`/api/sniper/items?search=${encodeURIComponent(q.trim())}`);
        setTradeSearchResults((data.items || []).slice(0, 6));
      }
    } catch { setTradeSearchResults([]); }
    finally { setTradeSearchLoading(false); }
  }, []);

  const addToTrade = (item: LimitedItem, side: "give" | "receive") => {
    if (side === "give") setTradeGive(prev => prev.find(i => i.id === item.id) ? prev : [...prev, item]);
    else setTradeReceive(prev => prev.find(i => i.id === item.id) ? prev : [...prev, item]);
    setTradeSearch("");
    setTradeSearchResults([]);
  };

  const tradeGiveRap = tradeGive.reduce((s, i) => s + i.rap, 0);
  const tradeReceiveRap = tradeReceive.reduce((s, i) => s + i.rap, 0);
  const tradeGiveValue = tradeGive.reduce((s, i) => s + i.value, 0);
  const tradeReceiveValue = tradeReceive.reduce((s, i) => s + i.value, 0);
  const rapDiff = tradeReceiveRap - tradeGiveRap;
  const valueDiff = tradeReceiveValue - tradeGiveValue;

  const allTabs = [
    { id: "browse", icon: <Search className="w-3.5 h-3.5" />, label: t("sniper.browse") },
    { id: "deals", icon: <TrendingUp className="w-3.5 h-3.5" />, label: t("sniper.deals") },
    { id: "underprice", icon: <TrendingDown className="w-3.5 h-3.5" />, label: "Underprice" },
    { id: "watchlist", icon: <Eye className="w-3.5 h-3.5" />, label: `${t("sniper.watchlist")} (${watchlist.length})` },
    { id: "trade", icon: <ArrowLeftRight className="w-3.5 h-3.5" />, label: "Trade Calc" },
    { id: "log", icon: <ClipboardList className="w-3.5 h-3.5" />, label: `Deal Log (${dealLog.length})` },
  ];

  return (
    <div className="p-4 lg:p-8 w-full max-w-6xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Crosshair className="w-7 h-7 text-foreground" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("sniper.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("sniper.desc")}</p>
        </div>
        {botActive && (
          <Badge className="ml-auto bg-green-500/20 text-green-700 dark:text-green-300 border-0 gap-1 animate-pulse">
            <Activity className="w-3 h-3" /> {t("sniper.botActive")}
          </Badge>
        )}
      </div>

      <Tabs value={tab} onValueChange={v => { playTabSwitch(); setTab(v); if (v === "deals" && !deals.length) fetchDeals(); if (v === "underprice" && !underprice.length) fetchUnderprice(); }}>
        <div className="overflow-x-auto pb-1">
          <TabsList className="rounded-xl bg-secondary/50 border border-border p-1 h-auto gap-1 flex-nowrap inline-flex">
            {allTabs.map(tab => (
              <TabsTrigger key={tab.id} value={tab.id} className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-3 py-2 gap-1.5 whitespace-nowrap">
                {tab.icon} {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="browse" className="mt-4 space-y-4">
          <div className="flex gap-2">
            <Input placeholder={t("sniper.search")} value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSearch()} className="rounded-xl" />
            <Button onClick={handleSearch} disabled={loading} className="rounded-xl gap-1.5">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} {t("sniper.searchBtn")}
            </Button>
          </div>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[600px] overflow-y-auto pr-1">
                {items.map(item => <ItemCard key={item.id} item={item} onWatch={toggleWatch} watching={!!watchlist.find(w => w.assetId === item.id)} />)}
              </div>
              {totalItems > 0 && (
                <p className="text-xs text-muted-foreground text-center">{t("sniper.showingOf").replace("{shown}", String(items.length)).replace("{total}", String(totalItems))}</p>
              )}
              {hasMore && (
                <div className="flex justify-center pt-2">
                  <Button variant="outline" className="rounded-xl gap-1.5" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronDown className="w-4 h-4" />} {t("sniper.loadMore")}
                  </Button>
                </div>
              )}
            </>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[600px] overflow-y-auto pr-1">
              {deals.map(item => <ItemCard key={item.id} item={item} onWatch={toggleWatch} watching={!!watchlist.find(w => w.assetId === item.id)} />)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="underprice" className="mt-4 space-y-4">
          <Card className="rounded-2xl border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-sm flex items-center gap-2"><TrendingDown className="w-4 h-4 text-orange-500" /> Underprice Detector</CardTitle>
                <CardDescription className="text-xs">{t("sniper.underpriceDesc")}</CardDescription>
              </div>
              <Button size="sm" variant="outline" className="rounded-xl gap-1.5" onClick={fetchUnderprice} disabled={underpriceLoading}>
                <RefreshCw className={`w-3.5 h-3.5 ${underpriceLoading ? "animate-spin" : ""}`} /> {t("sniper.refresh")}
              </Button>
            </CardHeader>
            <CardContent>
              {underpriceLoading ? (
                <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
              ) : underprice.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                  <TrendingDown className="w-10 h-10 opacity-20" />
                  <p className="text-sm">{t("sniper.noUnderprice")}</p>
                  <p className="text-xs opacity-60">{t("sniper.refreshHint")}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[600px] overflow-y-auto pr-1">
                  {underprice.map(item => (
                    <div key={item.id} className="rounded-xl border border-orange-500/30 p-3 bg-orange-500/5 hover:bg-orange-500/10 transition-colors">
                      <div className="flex gap-3">
                        {item.thumbnailUrl ? (
                          <img src={item.thumbnailUrl} alt={item.name} className="w-14 h-14 rounded-lg object-cover shrink-0" />
                        ) : (
                          <div className="w-14 h-14 rounded-lg bg-muted shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{item.name}</p>
                          <div className="grid grid-cols-3 gap-1 mt-1.5 text-xs">
                            <div className="text-center rounded-lg bg-secondary/80 p-1">
                              <p className="text-muted-foreground text-[9px]">RAP</p>
                              <p className="font-bold">{formatRobux(item.rap)}</p>
                            </div>
                            <div className="text-center rounded-lg bg-blue-500/10 p-1">
                              <p className="text-muted-foreground text-[9px]">Price</p>
                              <p className="font-bold text-blue-600">{formatRobux(item.catalogPrice!)}</p>
                            </div>
                            <div className="text-center rounded-lg bg-orange-500/10 p-1">
                              <p className="text-muted-foreground text-[9px]">Discount</p>
                              <p className="font-bold text-orange-600">-{item.discount}%</p>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1 shrink-0">
                          <a href={`https://www.roblox.com/catalog/${item.id}`} target="_blank" rel="noreferrer">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0"><ExternalLink className="w-3.5 h-3.5" /></Button>
                          </a>
                          <Button size="sm" variant={watchlist.find(w => w.assetId === item.id) ? "default" : "outline"} className="h-7 w-7 p-0" onClick={() => { playClick(); toggleWatch(item); }}>
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="watchlist" className="mt-4 space-y-4">
          <Card className="rounded-2xl border-border/50">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2"><Eye className="w-4 h-4" /> {t("sniper.watchlist.title")}</CardTitle>
                <CardDescription>{t("sniper.watchlist.desc")}</CardDescription>
              </div>
              <Button size="sm" className="rounded-xl gap-1.5" onClick={() => checkLivePrices()} disabled={monitoring || !watchlist.length}>
                {monitoring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                {t("sniper.checkPrices")}
              </Button>
            </CardHeader>
            <CardContent>
              {watchlist.length === 0 ? (
                <div className="flex flex-col items-center py-10 text-muted-foreground gap-2">
                  <Eye className="w-10 h-10 opacity-20" />
                  <p className="text-sm">{t("sniper.addItems")}</p>
                </div>
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
                          {entry.livePrice != null && (
                            <span className={entry.livePrice <= entry.maxPrice ? "text-green-600 font-bold" : ""}>
                              {t("sniper.live")}: <strong>{formatRobux(entry.livePrice)}</strong>
                            </span>
                          )}
                          {entry.available === false && <span className="text-amber-500">{t("sniper.notForSale")}</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer">
                            <Switch
                              checked={!!entry.autoBuy}
                              onCheckedChange={v => saveWatchlist(watchlist.map(w => w.assetId === entry.assetId ? { ...w, autoBuy: v } : w))}
                              className="scale-75"
                            />
                            <Zap className="w-3 h-3 text-amber-500" /> Auto-Buy
                          </label>
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0 items-center">
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
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trade" className="mt-4 space-y-4">
          <Card className="rounded-2xl border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><ArrowLeftRight className="w-4 h-4" /> Trade Calculator</CardTitle>
              <CardDescription>{t("sniper.tradeCalcDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <div className="flex gap-1 bg-secondary rounded-lg p-0.5">
                  <button onClick={() => setTradeTarget("give")} className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${tradeTarget === "give" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
                    {t("sniper.give")}
                  </button>
                  <button onClick={() => setTradeTarget("receive")} className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${tradeTarget === "receive" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
                    {t("sniper.receive")}
                  </button>
                </div>
                <Input
                  placeholder={t("sniper.searchPlaceholder")}
                  value={tradeSearch}
                  onChange={e => { setTradeSearch(e.target.value); if (e.target.value.length >= 2) searchTradeItems(e.target.value); else setTradeSearchResults([]); }}
                  onKeyDown={e => e.key === "Enter" && searchTradeItems(tradeSearch)}
                  className="rounded-xl flex-1"
                />
                {tradeSearchLoading && <Loader2 className="w-4 h-4 animate-spin self-center" />}
              </div>

              {tradeSearchResults.length > 0 && (
                <div className="rounded-xl border border-border/50 overflow-hidden">
                  {tradeSearchResults.map((item, i) => (
                    <button
                      key={item.id}
                      onClick={() => { playClick(); addToTrade(item, tradeTarget); }}
                      className={`w-full flex items-center gap-3 p-2.5 text-left hover:bg-accent/50 transition-colors text-sm ${i > 0 ? "border-t border-border/50" : ""}`}
                    >
                      {item.thumbnailUrl ? (
                        <img src={item.thumbnailUrl} alt={item.name} className="w-8 h-8 rounded-lg object-cover shrink-0" />
                      ) : <div className="w-8 h-8 rounded-lg bg-muted shrink-0" />}
                      <span className="flex-1 font-medium truncate">{item.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">RAP {formatRobux(item.rap)}</span>
                      <Plus className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    </button>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {(["give", "receive"] as const).map(side => {
                  const sideItems = side === "give" ? tradeGive : tradeReceive;
                  const setItems = side === "give" ? setTradeGive : setTradeReceive;
                  const totalRap = sideItems.reduce((s, i) => s + i.rap, 0);
                  const totalValue = sideItems.reduce((s, i) => s + i.value, 0);
                  return (
                    <div key={side} className="rounded-xl border border-border/50 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold">{side === "give" ? t("sniper.giveLabel") : t("sniper.receiveLabel")}</p>
                        {sideItems.length > 0 && (
                          <button onClick={() => setItems([])} className="text-[10px] text-muted-foreground hover:text-red-500 transition-colors">{t("sniper.clear")}</button>
                        )}
                      </div>
                      {sideItems.length === 0 ? (
                        <div className="text-center py-6 text-xs text-muted-foreground">{t("sniper.addItems")}</div>
                      ) : (
                        <div className="space-y-1.5">
                          {sideItems.map(item => (
                            <div key={item.id} className="flex items-center gap-2 text-xs">
                              {item.thumbnailUrl ? (
                                <img src={item.thumbnailUrl} alt={item.name} className="w-7 h-7 rounded object-cover shrink-0" />
                              ) : <div className="w-7 h-7 rounded bg-muted shrink-0" />}
                              <span className="flex-1 truncate">{item.name}</span>
                              <span className="text-muted-foreground shrink-0">{formatRobux(item.rap)}</span>
                              <button onClick={() => setItems(prev => prev.filter(i => i.id !== item.id))} className="text-red-500 hover:text-red-600 shrink-0">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                          <div className="border-t border-border/50 pt-1.5 text-xs space-y-0.5">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">RAP</span>
                              <strong>{formatRobux(totalRap)}</strong>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Value</span>
                              <strong>{formatRobux(totalValue)}</strong>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {(tradeGive.length > 0 || tradeReceive.length > 0) && (
                <div className="rounded-xl bg-secondary/50 border border-border/50 p-4 space-y-3">
                  <p className="text-sm font-semibold">{t("sniper.tradeSummary")}</p>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground font-medium">{t("sniper.byRap")}</p>
                      <div className="flex items-center gap-2">
                        <span className={`text-lg font-bold ${rapDiff > 0 ? "text-green-600" : rapDiff < 0 ? "text-red-600" : "text-foreground"}`}>
                          {rapDiff > 0 ? "+" : ""}{formatRobux(rapDiff)} R$
                        </span>
                        {rapDiff > 0 ? <TrendingUp className="w-4 h-4 text-green-500" /> : rapDiff < 0 ? <TrendingDown className="w-4 h-4 text-red-500" /> : <Minus className="w-4 h-4" />}
                      </div>
                      {tradeGiveRap > 0 && <p className="text-xs text-muted-foreground">{Math.round((tradeReceiveRap / tradeGiveRap - 1) * 100)}% {t("sniper.ofValue")}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground font-medium">{t("sniper.byValue")}</p>
                      <div className="flex items-center gap-2">
                        <span className={`text-lg font-bold ${valueDiff > 0 ? "text-green-600" : valueDiff < 0 ? "text-red-600" : "text-foreground"}`}>
                          {valueDiff > 0 ? "+" : ""}{formatRobux(valueDiff)} R$
                        </span>
                        {valueDiff > 0 ? <TrendingUp className="w-4 h-4 text-green-500" /> : valueDiff < 0 ? <TrendingDown className="w-4 h-4 text-red-500" /> : <Minus className="w-4 h-4" />}
                      </div>
                      {tradeGiveValue > 0 && <p className="text-xs text-muted-foreground">{Math.round((tradeReceiveValue / tradeGiveValue - 1) * 100)}% {t("sniper.ofValue")}</p>}
                    </div>
                  </div>
                  <div className={`rounded-lg p-2.5 text-xs font-medium text-center ${rapDiff > 0 && valueDiff > 0 ? "bg-green-500/10 text-green-700 dark:text-green-300" : rapDiff < 0 || valueDiff < 0 ? "bg-red-500/10 text-red-700 dark:text-red-300" : "bg-secondary text-muted-foreground"}`}>
                    {rapDiff > 0 && valueDiff > 0 ? t("sniper.goodTrade") : rapDiff < 0 && valueDiff < 0 ? t("sniper.badTrade") : t("sniper.neutralTrade")}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="log" className="mt-4 space-y-4">
          <Card className="rounded-2xl border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2"><ClipboardList className="w-4 h-4" /> Deal Log</CardTitle>
                <CardDescription>{t("sniper.dealLog")}</CardDescription>
              </div>
              {dealLog.length > 0 && (
                <Button size="sm" variant="outline" className="rounded-xl gap-1.5 text-red-500 border-red-500/30 hover:bg-red-500/10" onClick={() => { setDealLog([]); playClick(); }}>
                  <Trash2 className="w-3.5 h-3.5" /> {t("sniper.clearLog")}
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {dealLog.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                  <ClipboardList className="w-10 h-10 opacity-20" />
                  <p className="text-sm">{t("sniper.logEmpty")}</p>
                  <p className="text-xs opacity-60">{t("sniper.logEmptyHint")}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {dealLog.map(entry => (
                    <div key={entry.id} className="flex items-center gap-3 rounded-xl border border-border/50 p-3">
                      {entry.thumbnailUrl ? (
                        <img src={entry.thumbnailUrl} alt={entry.itemName} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                      ) : <div className="w-10 h-10 rounded-lg bg-muted shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{entry.itemName}</p>
                        <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                          <span>{t("sniper.target")}: <strong>{formatRobux(entry.targetPrice)}</strong></span>
                          <span>{t("sniper.price")}: <strong className={entry.status === "bought" ? "text-green-600" : "text-foreground"}>{formatRobux(entry.actualPrice)}</strong></span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(entry.timestamp).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      </div>
                      <Badge className={`text-[10px] gap-1 shrink-0 ${entry.status === "bought" ? "bg-green-600/20 text-green-700 dark:text-green-300 border-0" : entry.status === "alert" ? "bg-blue-500/20 text-blue-700 dark:text-blue-300 border-0" : "bg-red-500/20 text-red-700 dark:text-red-300 border-0"}`}>
                        {entry.status === "bought" ? <><CheckCircle2 className="w-2.5 h-2.5" /> {t("sniper.bought")}</> : entry.status === "alert" ? <><Bell className="w-2.5 h-2.5" /> {t("sniper.alert")}</> : <><XCircle className="w-2.5 h-2.5" /> {t("sniper.failed")}</>}
                      </Badge>
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
