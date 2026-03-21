import { useState, useEffect, useCallback } from "react";
import { getAuthCredentials } from "@workspace/api-client-react";
import { usePageCache } from "@/contexts/PageCacheContext";
import { playClick, playSuccess, playTabSwitch } from "@/hooks/useSounds";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Crosshair, Loader2, RefreshCw, ArrowUpRight, Filter, BarChart3, Zap, TrendingUp,
  TrendingDown, Minus, Star, Flame, Image as ImageIcon
} from "lucide-react";
import { motion } from "framer-motion";

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

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
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
  }, [search]);

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
  }, []);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Crosshair className="w-6 h-6" /> Limited Sniper
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Rolimons data · Find undervalued limiteds
          </p>
        </div>
        {totalItems > 0 && (
          <Badge variant="outline" className="text-xs">
            {totalItems.toLocaleString()} limiteds tracked
          </Badge>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={(v) => { playTabSwitch(); setActiveTab(v); }}>
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="browse" className="flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" /> Browse All
          </TabsTrigger>
          <TabsTrigger value="deals" className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5" /> Find Deals
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
            <Button variant="outline" onClick={() => { playClick(); fetchItems(); }} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>

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
              {items.slice(0, 200).map((item) => (
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
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Filter className="w-4 h-4" /> Deal Finder
              </CardTitle>
              <CardDescription className="text-xs">
                Find limiteds selling below their RAP. Compares Best Price on Roblox vs RAP.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={fetchDeals} disabled={dealsLoading} className="w-full">
                {dealsLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Crosshair className="w-4 h-4 mr-2" />}
                Scan for Deals
              </Button>
            </CardContent>
          </Card>

          {dealsLoading && (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
          )}

          {deals.length > 0 && !dealsLoading && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-semibold">{deals.length} deals found</p>
              {deals.map((item, i) => {
                const bestPrice = item.listedPrice ?? 0;
                const dealPercent = item.rap > 0 && bestPrice > 0 ? Math.round(((item.rap - bestPrice) / item.rap) * 100) : 0;

                return (
                  <motion.div key={item.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.02, 1) }}>
                    <Card className="hover:border-green-500/30 transition-colors">
                      <CardContent className="py-3 px-4 flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                            <span className="text-xs font-bold text-green-500">#{i + 1}</span>
                          </div>
                          {item.thumbnailUrl ? (
                            <img
                              src={item.thumbnailUrl}
                              alt={item.name}
                              className="w-12 h-12 rounded-lg object-cover border border-border/50 shrink-0"
                            />
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
                              {bestPrice > 0 && (
                                <>
                                  <span className="text-muted-foreground">→</span>
                                  <span className="font-mono text-green-600 font-semibold">
                                    Best Price: {bestPrice.toLocaleString()} R$
                                  </span>
                                </>
                              )}
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
      </Tabs>
    </div>
  );
}
