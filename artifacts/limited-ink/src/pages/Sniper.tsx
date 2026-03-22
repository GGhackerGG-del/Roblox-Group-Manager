import { useState, useEffect, useCallback, useRef } from "react";
import { getAuthCredentials } from "@workspace/api-client-react";
import { usePageCache } from "@/contexts/PageCacheContext";
import { useToast } from "@/hooks/use-toast";
import { playClick, playSuccess, playTabSwitch, playError } from "@/hooks/useSounds";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Crosshair, Loader2, RefreshCw, ArrowUpRight, Filter, BarChart3, Zap, TrendingUp,
  TrendingDown, Minus, Star, Flame, Image as ImageIcon, SlidersHorizontal, ChevronDown, ChevronUp,
  Plus, Trash2, ShoppingCart, Target, AlertCircle, CheckCircle2, Clock, Eye
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface SniperItem {
  id: number;
  name: string;
  acronym: string;
  rap: number;
  value: number;
  demand: number;
  demandLabel: string;
  trend: number;
  trendLabel: string;
  projected: boolean;
  hyped: boolean;
  rare: boolean;
  priceDiff: number;
  discount?: number;
  thumbnailUrl?: string | null;
  listedPrice?: number;
}

interface WatchlistItem {
  assetId: number;
  name: string;
  targetPrice: number;
  autoBuy: boolean;
  thumbnailUrl: string | null;
  rap: number;
  currentPrice: number | null;
  lastChecked: number | null;
  buying: boolean;
  bought: boolean;
  error: string | null;
  productId: number | null;
  sellerId: number | null;
  userAssetId: number | null;
}

const WATCHLIST_KEY = "limitedink_watchlist_v2";

function loadWatchlist(): WatchlistItem[] {
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as WatchlistItem[];
  } catch {
    return [];
  }
}

function saveWatchlist(items: WatchlistItem[]) {
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(items.map(i => ({
    ...i,
    buying: false,
    error: null,
  }))));
}

function getAuthHeaders(): Record<string, string> {
  const { token, fingerprint } = getAuthCredentials();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (fingerprint) headers["X-Device-Fingerprint"] = fingerprint;
  return headers;
}

function DemandBadge({ demand, label }: { demand: number; label: string }) {
  const colors: Record<number, string> = {
    [-1]: "bg-red-500/15 text-red-600 border-red-500/20",
    0: "bg-orange-500/15 text-orange-600 border-orange-500/20",
    1: "bg-yellow-500/15 text-yellow-600 border-yellow-500/20",
    2: "bg-green-500/15 text-green-600 border-green-500/20",
    3: "bg-emerald-500/15 text-emerald-600 border-emerald-500/20",
  };
  return <Badge className={`text-[10px] ${colors[demand] || colors[1]}`}>{label}</Badge>;
}

function TrendIcon({ trend }: { trend: number }) {
  if (trend === 2) return <TrendingUp className="w-3.5 h-3.5 text-green-500" />;
  if (trend === -1) return <TrendingDown className="w-3.5 h-3.5 text-red-500" />;
  return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
}

function WatchlistTab() {
  const { toast } = useToast();
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>(loadWatchlist);
  const [addAssetId, setAddAssetId] = useState("");
  const [addTargetPrice, setAddTargetPrice] = useState("");
  const [addAutoBuy, setAddAutoBuy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const updateWatchlist = (updater: (prev: WatchlistItem[]) => WatchlistItem[]) => {
    setWatchlist(prev => {
      const next = updater(prev);
      saveWatchlist(next);
      return next;
    });
  };

  const fetchLivePrice = useCallback(async (assetId: number): Promise<{
    name: string; rap: number; currentPrice: number | null; thumbnailUrl: string | null;
    productId: number | null; sellerId: number | null; userAssetId: number | null;
  } | null> => {
    try {
      const resp = await fetch(`${BASE}/api/sniper/live/${assetId}`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!resp.ok) return null;
      const data = await resp.json() as {
        name: string; rap: number; lowestPrice: number | null; thumbnailUrl: string | null;
        productId: number | null; sellerId: number | null; userAssetId: number | null;
      };
      return {
        name: data.name,
        rap: data.rap,
        currentPrice: data.lowestPrice,
        thumbnailUrl: data.thumbnailUrl,
        productId: data.productId ?? null,
        sellerId: data.sellerId ?? null,
        userAssetId: data.userAssetId ?? null,
      };
    } catch {
      return null;
    }
  }, []);

  const refreshAllPrices = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    const current = loadWatchlist();
    if (current.length === 0) {
      if (!silent) setRefreshing(false);
      return;
    }

    const updated = [...current];
    for (let i = 0; i < updated.length; i++) {
      const item = updated[i];
      if (item.bought) continue;
      const live = await fetchLivePrice(item.assetId);
      if (live) {
        updated[i] = {
          ...item,
          name: live.name || item.name,
          rap: live.rap || item.rap,
          currentPrice: live.currentPrice,
          thumbnailUrl: live.thumbnailUrl || item.thumbnailUrl,
          lastChecked: Date.now(),
          error: null,
          productId: live.productId ?? item.productId,
          sellerId: live.sellerId ?? item.sellerId,
          userAssetId: live.userAssetId ?? item.userAssetId,
        };
      }
    }

    setWatchlist(updated);
    saveWatchlist(updated);
    if (!silent) {
      setRefreshing(false);
      playSuccess();
    }

    for (const item of updated) {
      if (item.autoBuy && !item.bought && item.currentPrice !== null && item.currentPrice <= item.targetPrice) {
        handleBuy(item.assetId, item.targetPrice, true);
      }
    }
  }, [fetchLivePrice]);

  useEffect(() => {
    if (watchlist.length > 0) {
      refreshAllPrices(true);
    }
    intervalRef.current = setInterval(() => {
      refreshAllPrices(true);
    }, 30000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const handleAdd = async () => {
    const assetId = parseInt(addAssetId.trim(), 10);
    const targetPrice = parseInt(addTargetPrice.trim(), 10);

    if (isNaN(assetId) || assetId <= 0) {
      toast({ variant: "destructive", title: "Invalid ID", description: "Enter a valid Roblox asset ID" });
      return;
    }
    if (isNaN(targetPrice) || targetPrice <= 0) {
      toast({ variant: "destructive", title: "Invalid price", description: "Enter a target price in Robux" });
      return;
    }
    if (watchlist.some(w => w.assetId === assetId)) {
      toast({ variant: "destructive", title: "Already watching", description: "This item is already in your watchlist" });
      return;
    }

    setAdding(true);
    try {
      const live = await fetchLivePrice(assetId);
      const newItem: WatchlistItem = {
        assetId,
        name: live?.name || `Item #${assetId}`,
        targetPrice,
        autoBuy: addAutoBuy,
        thumbnailUrl: live?.thumbnailUrl || null,
        rap: live?.rap || 0,
        currentPrice: live?.currentPrice || null,
        lastChecked: Date.now(),
        buying: false,
        bought: false,
        error: null,
        productId: live?.productId ?? null,
        sellerId: live?.sellerId ?? null,
        userAssetId: live?.userAssetId ?? null,
      };
      updateWatchlist(prev => [...prev, newItem]);
      setAddAssetId("");
      setAddTargetPrice("");
      playSuccess();
      toast({ title: "Added to watchlist", description: newItem.name });

      if (addAutoBuy && live?.currentPrice !== null && live?.currentPrice !== undefined && live.currentPrice <= targetPrice) {
        handleBuy(assetId, targetPrice, true);
      }
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not fetch item data" });
      playError();
    } finally {
      setAdding(false);
    }
  };

  const handleBuy = async (assetId: number, maxPrice: number, auto = false) => {
    updateWatchlist(prev => prev.map(w =>
      w.assetId === assetId ? { ...w, buying: true, error: null } : w
    ));

    try {
      const resp = await fetch(`${BASE}/api/sniper/buy`, {
        method: "POST",
        credentials: "include",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId,
          maxPrice,
          productId: watchlist.find(w => w.assetId === assetId)?.productId ?? undefined,
          sellerId: watchlist.find(w => w.assetId === assetId)?.sellerId ?? undefined,
          userAssetId: watchlist.find(w => w.assetId === assetId)?.userAssetId ?? undefined,
        }),
      });
      const data = await resp.json() as { success?: boolean; error?: string; price?: number; message?: string };

      if (data.success) {
        updateWatchlist(prev => prev.map(w =>
          w.assetId === assetId ? { ...w, buying: false, bought: true, error: null } : w
        ));
        playSuccess();
        toast({
          title: auto ? "Auto-buy executed!" : "Purchased!",
          description: data.message || `Bought for ${data.price} R$`,
        });
      } else {
        updateWatchlist(prev => prev.map(w =>
          w.assetId === assetId ? { ...w, buying: false, error: data.error || "Purchase failed" } : w
        ));
        playError();
        if (!auto) {
          toast({ variant: "destructive", title: "Purchase failed", description: data.error || "Unknown error" });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      updateWatchlist(prev => prev.map(w =>
        w.assetId === assetId ? { ...w, buying: false, error: msg } : w
      ));
      playError();
    }
  };

  const removeItem = (assetId: number) => {
    updateWatchlist(prev => prev.filter(w => w.assetId !== assetId));
    playClick();
  };

  const toggleAutoBuy = (assetId: number, val: boolean) => {
    updateWatchlist(prev => prev.map(w =>
      w.assetId === assetId ? { ...w, autoBuy: val, bought: val ? w.bought : false } : w
    ));
  };

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add to Watchlist
          </CardTitle>
          <CardDescription className="text-xs">
            Monitor specific limited items and auto-buy when price drops below your target.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Asset ID</Label>
              <Input
                placeholder="e.g. 1028606"
                value={addAssetId}
                onChange={e => setAddAssetId(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAdd()}
                className="h-8 text-xs font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Target Price (R$)</Label>
              <Input
                type="number"
                placeholder="Max price to buy at"
                value={addTargetPrice}
                onChange={e => setAddTargetPrice(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAdd()}
                className="h-8 text-xs"
                min={1}
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch id="auto-buy-toggle" checked={addAutoBuy} onCheckedChange={setAddAutoBuy} />
              <Label htmlFor="auto-buy-toggle" className="text-xs font-medium cursor-pointer">
                Auto-buy when below target
              </Label>
            </div>
            <Button size="sm" onClick={handleAdd} disabled={adding} className="h-8 gap-1.5">
              {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              {adding ? "Fetching..." : "Add"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {watchlist.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground font-semibold">
            {watchlist.length} item{watchlist.length !== 1 ? "s" : ""} watching
          </p>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => { playClick(); refreshAllPrices(false); }}
            disabled={refreshing}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh Prices
          </Button>
        </div>
      )}

      <AnimatePresence>
        {watchlist.map((item) => {
          const isDeal = item.currentPrice !== null && item.currentPrice <= item.targetPrice;
          const discount = item.rap > 0 && item.currentPrice !== null && item.currentPrice > 0
            ? Math.round(((item.rap - item.currentPrice) / item.rap) * 100)
            : null;

          return (
            <motion.div
              key={item.assetId}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <Card className={`rounded-2xl transition-colors ${isDeal && !item.bought ? "border-green-500/40 bg-green-500/5" : ""} ${item.bought ? "border-blue-500/30 bg-blue-500/5" : ""}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {item.thumbnailUrl ? (
                      <img src={item.thumbnailUrl} alt={item.name} className="w-14 h-14 rounded-xl border border-border/50 object-cover shrink-0" />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                        <ImageIcon className="w-5 h-5 text-muted-foreground/30" />
                      </div>
                    )}

                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold truncate">{item.name}</p>
                        {item.bought && (
                          <Badge className="text-[10px] bg-blue-500/15 text-blue-600 border-blue-500/20 gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Purchased
                          </Badge>
                        )}
                        {isDeal && !item.bought && (
                          <Badge className="text-[10px] bg-green-500/15 text-green-600 border-green-500/20 gap-1">
                            <Target className="w-3 h-3" /> Target reached!
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-4 text-xs flex-wrap">
                        <div>
                          <span className="text-muted-foreground">RAP: </span>
                          <span className="font-mono font-semibold">{item.rap > 0 ? item.rap.toLocaleString() : "—"} R$</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Target: </span>
                          <span className="font-mono font-semibold text-orange-600">{item.targetPrice.toLocaleString()} R$</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Current: </span>
                          <span className={`font-mono font-semibold ${isDeal ? "text-green-600" : "text-foreground"}`}>
                            {item.currentPrice !== null ? `${item.currentPrice.toLocaleString()} R$` : "—"}
                          </span>
                        </div>
                        {discount !== null && discount > 0 && (
                          <Badge className="text-[10px] bg-green-500/15 text-green-600 border-green-500/20">
                            {discount}% below RAP
                          </Badge>
                        )}
                      </div>

                      {item.error && (
                        <p className="text-[10px] text-red-500 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> {item.error}
                        </p>
                      )}

                      {item.lastChecked && (
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Last checked: {new Date(item.lastChecked).toLocaleTimeString()}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <a href={`https://www.roblox.com/catalog/${item.assetId}`} target="_blank" rel="noreferrer">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </Button>
                        </a>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => removeItem(item.assetId)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Switch
                          checked={item.autoBuy}
                          onCheckedChange={val => toggleAutoBuy(item.assetId, val)}
                          disabled={item.bought}
                        />
                        <span className="text-[10px] text-muted-foreground font-medium">Auto</span>
                      </div>

                      <Button
                        size="sm"
                        className="h-7 text-xs gap-1.5"
                        onClick={() => handleBuy(item.assetId, item.targetPrice)}
                        disabled={item.buying || item.bought}
                      >
                        {item.buying
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : item.bought
                            ? <CheckCircle2 className="w-3.5 h-3.5" />
                            : <ShoppingCart className="w-3.5 h-3.5" />
                        }
                        {item.bought ? "Bought" : "Buy"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {watchlist.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Eye className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No items in watchlist</p>
            <p className="text-xs mt-1">Add limiteds above to monitor their prices and auto-buy on dips</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function Sniper() {
  const cache = usePageCache();
  const cachedBrowse = cache.get<{ items: SniperItem[]; total: number; search: string }>("sniper_browse");
  const cachedDeals = cache.get<{ deals: SniperItem[] }>("sniper_deals");

  const [items, setItems] = useState<SniperItem[]>(cachedBrowse?.items || []);
  const [deals, setDeals] = useState<SniperItem[]>(cachedDeals?.deals || []);
  const [loading, setLoading] = useState(false);
  const [dealsLoading, setDealsLoading] = useState(false);
  const [search, setSearch] = useState(cachedBrowse?.search || "");
  const [totalItems, setTotalItems] = useState(cachedBrowse?.total || 0);
  const [activeTab, setActiveTab] = useState("browse");

  const [showBrowseFilters, setShowBrowseFilters] = useState(false);
  const [browseMinRap, setBrowseMinRap] = useState("");
  const [browseMaxRap, setBrowseMaxRap] = useState("");
  const [browseMinDemand, setBrowseMinDemand] = useState("-2");
  const [browseSortBy, setBrowseSortBy] = useState("rap");

  const [showDealsFilters, setShowDealsFilters] = useState(false);
  const [dealsMinDiscount, setDealsMinDiscount] = useState("");
  const [dealsMinDemand, setDealsMinDemand] = useState("-2");
  const [dealsSearch, setDealsSearch] = useState("");
  const [dealsMinPrice, setDealsMinPrice] = useState("");
  const [dealsMaxPrice, setDealsMaxPrice] = useState("");

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (browseMinRap) params.set("minRap", browseMinRap);
      if (browseMaxRap) params.set("maxRap", browseMaxRap);
      if (browseMinDemand !== "-2") params.set("minDemand", browseMinDemand);
      if (browseSortBy !== "rap") params.set("sortBy", browseSortBy);
      const resp = await fetch(`${BASE}/api/sniper/items?${params}`, { credentials: "include", headers: getAuthHeaders() });
      if (resp.ok) {
        const data = await resp.json();
        const newItems = data.items || [];
        setItems(newItems);
        setTotalItems(data.total || 0);
        cache.set("sniper_browse", { items: newItems, total: data.total || 0, search });
        playSuccess();
      }
    } catch {} finally { setLoading(false); }
  }, [search, browseMinRap, browseMaxRap, browseMinDemand, browseSortBy]);

  const fetchDeals = useCallback(async () => {
    setDealsLoading(true);
    playClick();
    try {
      const resp = await fetch(`${BASE}/api/sniper/deals`, { credentials: "include", headers: getAuthHeaders() });
      if (resp.ok) {
        const data = await resp.json();
        const newDeals = data.deals || [];
        setDeals(newDeals);
        cache.set("sniper_deals", { deals: newDeals });
        playSuccess();
      }
    } catch {} finally { setDealsLoading(false); }
  }, []);

  useEffect(() => {
    if (items.length === 0) fetchItems();
    if (deals.length === 0) fetchDeals();
  }, []);

  const filteredDeals = deals.filter(d => {
    const minDisc = parseInt(dealsMinDiscount || "0", 10);
    if (minDisc > 0 && (d.discount ?? 0) < minDisc) return false;
    const minDem = parseInt(dealsMinDemand, 10);
    if (minDem > -2 && d.demand < minDem) return false;
    const bestPrice = d.listedPrice ?? d.value;
    const minP = parseInt(dealsMinPrice || "0", 10);
    const maxP = parseInt(dealsMaxPrice || "0", 10);
    if (minP > 0 && bestPrice < minP) return false;
    if (maxP > 0 && bestPrice > maxP) return false;
    if (dealsSearch) {
      const q = dealsSearch.toLowerCase();
      if (!d.name.toLowerCase().includes(q) && !d.acronym.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Crosshair className="w-6 h-6" /> Limited Sniper
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Rolimons data · Auto-buy on price dips
          </p>
        </div>
        {totalItems > 0 && (
          <Badge variant="outline" className="text-xs">
            {totalItems.toLocaleString()} limiteds tracked
          </Badge>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={(v) => { playTabSwitch(); setActiveTab(v); }}>
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="browse" className="flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" /> Browse All
          </TabsTrigger>
          <TabsTrigger value="deals" className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5" /> Find Deals
          </TabsTrigger>
          <TabsTrigger value="watchlist" className="flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5" /> Watchlist
          </TabsTrigger>
        </TabsList>

        <TabsContent value="browse" className="space-y-4 mt-4">
          <div className="flex gap-3">
            <Input
              placeholder="Search by name or acronym..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchItems()}
              className="flex-1"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowBrowseFilters(!showBrowseFilters)}
              className={showBrowseFilters ? "border-primary text-primary" : ""}
            >
              <SlidersHorizontal className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={() => { playClick(); fetchItems(); }} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {showBrowseFilters && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="overflow-hidden">
              <Card>
                <CardContent className="py-3 px-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Min RAP</label>
                      <Input type="number" placeholder="0" value={browseMinRap} onChange={(e) => setBrowseMinRap(e.target.value)} className="mt-1 h-8 text-xs" />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Max RAP</label>
                      <Input type="number" placeholder="No limit" value={browseMaxRap} onChange={(e) => setBrowseMaxRap(e.target.value)} className="mt-1 h-8 text-xs" />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Min Demand</label>
                      <Select value={browseMinDemand} onValueChange={setBrowseMinDemand}>
                        <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="-2">Any</SelectItem>
                          <SelectItem value="-1">Terrible+</SelectItem>
                          <SelectItem value="0">Low+</SelectItem>
                          <SelectItem value="1">Normal+</SelectItem>
                          <SelectItem value="2">High+</SelectItem>
                          <SelectItem value="3">Amazing</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Sort By</label>
                      <Select value={browseSortBy} onValueChange={setBrowseSortBy}>
                        <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="rap">RAP (High→Low)</SelectItem>
                          <SelectItem value="value">Value (High→Low)</SelectItem>
                          <SelectItem value="demand">Demand (High→Low)</SelectItem>
                          <SelectItem value="name">Name (A→Z)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button size="sm" className="mt-3 w-full h-7 text-xs" onClick={() => { playClick(); fetchItems(); }}>
                    Apply Filters
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : items.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center text-muted-foreground">
                <Crosshair className="w-8 h-8 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No items found. Try a different search or click refresh.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-1.5">
              {items.map((item) => (
                <Card key={item.id} className="hover:bg-secondary/30 transition-colors">
                  <CardContent className="py-2 px-3 flex items-center gap-3">
                    {item.thumbnailUrl ? (
                      <img src={item.thumbnailUrl} alt="" className="w-10 h-10 rounded-lg object-cover border border-border/50 shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                        <ImageIcon className="w-4 h-4 text-muted-foreground/30" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate flex items-center gap-1.5">
                        {item.name}
                        {item.rare && <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />}
                        {item.hyped && <Flame className="w-3 h-3 text-orange-500" />}
                      </p>
                      {item.acronym && <p className="text-[10px] text-muted-foreground">{item.acronym}</p>}
                    </div>
                    <div className="flex items-center gap-3 text-xs shrink-0">
                      <div className="text-right">
                        <p className="text-muted-foreground text-[10px]">RAP</p>
                        <span className="font-mono font-semibold">{item.rap.toLocaleString()}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-muted-foreground text-[10px]">Value</p>
                        <span className="font-mono font-semibold">{item.value.toLocaleString()}</span>
                      </div>
                      <div className={`font-mono font-bold text-xs w-14 text-right ${item.priceDiff > 0 ? "text-green-500" : item.priceDiff < 0 ? "text-red-500" : ""}`}>
                        {item.priceDiff > 0 ? "+" : ""}{item.priceDiff}%
                      </div>
                      <TrendIcon trend={item.trend} />
                      <DemandBadge demand={item.demand} label={item.demandLabel} />
                      <a href={`https://www.rolimons.com/item/${item.id}`} target="_blank" rel="noreferrer">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><ArrowUpRight className="w-3.5 h-3.5" /></Button>
                      </a>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="deals" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Filter className="w-4 h-4" /> Deal Finder
              </CardTitle>
              <CardDescription className="text-xs">
                Find limiteds selling below their RAP. Compares Best Price on Roblox vs RAP.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button onClick={fetchDeals} disabled={dealsLoading} className="w-full">
                {dealsLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Crosshair className="w-4 h-4 mr-2" />}
                Scan for Deals
              </Button>
            </CardContent>
          </Card>

          {deals.length > 0 && !dealsLoading && (
            <>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Search deals..."
                  value={dealsSearch}
                  onChange={(e) => setDealsSearch(e.target.value)}
                  className="flex-1 h-8 text-xs"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className={`h-8 text-xs gap-1.5 ${showDealsFilters ? "border-primary text-primary" : ""}`}
                  onClick={() => setShowDealsFilters(!showDealsFilters)}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  Filters
                  {showDealsFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </Button>
              </div>

              {showDealsFilters && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="overflow-hidden">
                  <Card>
                    <CardContent className="py-3 px-4">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div>
                          <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Min Discount %</label>
                          <Input type="number" placeholder="0" value={dealsMinDiscount} onChange={(e) => setDealsMinDiscount(e.target.value)} className="mt-1 h-8 text-xs" />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Min Demand</label>
                          <Select value={dealsMinDemand} onValueChange={setDealsMinDemand}>
                            <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="-2">Any</SelectItem>
                              <SelectItem value="-1">Terrible+</SelectItem>
                              <SelectItem value="0">Low+</SelectItem>
                              <SelectItem value="1">Normal+</SelectItem>
                              <SelectItem value="2">High+</SelectItem>
                              <SelectItem value="3">Amazing</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Min Best Price</label>
                          <Input type="number" placeholder="0" value={dealsMinPrice} onChange={(e) => setDealsMinPrice(e.target.value)} className="mt-1 h-8 text-xs" />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Max Best Price</label>
                          <Input type="number" placeholder="No limit" value={dealsMaxPrice} onChange={(e) => setDealsMaxPrice(e.target.value)} className="mt-1 h-8 text-xs" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              <p className="text-xs text-muted-foreground font-semibold">
                {filteredDeals.length} deal{filteredDeals.length !== 1 ? "s" : ""}
                {filteredDeals.length !== deals.length && ` (${deals.length} total)`}
              </p>

              <div className="space-y-2">
                {filteredDeals.map((item, i) => {
                  const bestPrice = item.listedPrice ?? 0;
                  const dealPercent = item.discount ?? (item.rap > 0 && bestPrice > 0 ? Math.round(((item.rap - bestPrice) / item.rap) * 100) : 0);

                  return (
                    <motion.div key={item.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.02, 1) }}>
                      <Card className="hover:border-green-500/30 transition-colors">
                        <CardContent className="py-3 px-4 flex items-center justify-between">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                              <span className="text-xs font-bold text-green-500">#{i + 1}</span>
                            </div>
                            {item.thumbnailUrl ? (
                              <img src={item.thumbnailUrl} alt={item.name} className="w-12 h-12 rounded-lg object-cover border border-border/50 shrink-0" />
                            ) : (
                              <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                                <ImageIcon className="w-5 h-5 text-muted-foreground/30" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-semibold truncate flex items-center gap-1.5">
                                {item.name}
                                {item.rare && <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />}
                              </p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap mt-0.5">
                                <span className="font-mono">RAP: <span className="text-foreground font-semibold">{item.rap.toLocaleString()} R$</span></span>
                                <span className="text-muted-foreground">→</span>
                                <span className="font-mono text-green-600 font-semibold">
                                  Best: {bestPrice.toLocaleString()} R$
                                </span>
                                <DemandBadge demand={item.demand} label={item.demandLabel} />
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            {dealPercent > 0 && (
                              <div className="text-right">
                                <p className="text-lg font-black text-green-500">{dealPercent}%</p>
                                <p className="text-[10px] text-muted-foreground font-medium">DEAL</p>
                              </div>
                            )}
                            <a href={`https://www.rolimons.com/item/${item.id}`} target="_blank" rel="noreferrer">
                              <Button variant="ghost" size="sm"><ArrowUpRight className="w-4 h-4" /></Button>
                            </a>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            </>
          )}

          {dealsLoading && (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
          )}

          {deals.length === 0 && !dealsLoading && (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center text-muted-foreground">
                <Crosshair className="w-8 h-8 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Click "Scan for Deals" to find limiteds with Best Price below RAP</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="watchlist" className="mt-4">
          <WatchlistTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
