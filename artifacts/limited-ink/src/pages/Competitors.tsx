import { useState, useEffect } from "react";
import { getAuthCredentials } from "@workspace/api-client-react";
import { usePageCache } from "@/contexts/PageCacheContext";
import { playClick, playSuccess, playTabSwitch } from "@/hooks/useSounds";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search, Users, ShoppingBag, DollarSign, Calendar,
  TrendingUp, Crown, Loader2, AlertCircle, Heart, Shirt,
  ChevronDown, ChevronUp, Image as ImageIcon, BarChart3,
  Target, Percent, Award
} from "lucide-react";
import { motion } from "framer-motion";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface ClothingItem {
  id: number;
  name: string;
  price: number | null;
  favorites: number;
  type: string;
  thumbnailUrl: string | null;
}

interface PriceRanges {
  free: number;
  under10: number;
  r10to50: number;
  r51to100: number;
  r101to500: number;
  over500: number;
}

interface CompetitorData {
  group: {
    id: number;
    name: string;
    description: string;
    memberCount: number;
    owner?: { userId: number; username: string; displayName: string };
    created: string;
    publicEntryAllowed: boolean;
    thumbnailUrl: string | null;
  };
  clothing: {
    totalCount: number;
    averagePrice: number;
    medianPrice: number;
    minPrice: number;
    maxPrice: number;
    shirts: number;
    pants: number;
    tshirts: number;
    paidCount: number;
    freeCount: number;
    totalFavorites: number;
    avgFavorites: number;
    priceRanges: PriceRanges;
    topItems: ClothingItem[];
    allItems: ClothingItem[];
    truncated?: boolean;
    pagesFetched?: number;
  };
}

export default function Competitors() {
  const cache = usePageCache();
  const cached = cache.get<{ data: CompetitorData; groupId: string }>("competitors");

  const [groupId, setGroupId] = useState(cached?.groupId || "");
  const [data, setData] = useState<CompetitorData | null>(cached?.data || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [visibleCount, setVisibleCount] = useState(50);
  const [sortBy, setSortBy] = useState<"favorites" | "price_high" | "price_low">("favorites");
  const [filterType, setFilterType] = useState<"all" | "Shirt" | "Pants" | "T-Shirt">("all");

  useEffect(() => {
    if (data && groupId) {
      cache.set("competitors", { data, groupId });
    }
  }, [data, groupId]);

  async function analyze() {
    const id = groupId.trim();
    if (!id) return;

    playClick();
    setLoading(true);
    setError(null);
    setShowAll(false);
    setVisibleCount(50);

    try {
      const { token, fingerprint } = getAuthCredentials();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      if (fingerprint) headers["X-Device-Fingerprint"] = fingerprint;

      const resp = await fetch(`${BASE}/api/competitor/analyze/${id}`, {
        credentials: "include",
        headers,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Request failed" })) as { error?: string };
        throw new Error(err.error || "Failed to analyze");
      }

      const result = await resp.json();
      setData(result);
      playSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  const allItems = data?.clothing.allItems || [];
  const filteredItems = filterType === "all" ? allItems : allItems.filter(i => i.type === filterType);
  const sortedItems = [...filteredItems].sort((a, b) => {
    if (sortBy === "favorites") return (b.favorites || 0) - (a.favorites || 0);
    if (sortBy === "price_high") return ((b.price ?? 0) - (a.price ?? 0));
    return ((a.price ?? 0) - (b.price ?? 0));
  });
  const displayItems = showAll ? sortedItems.slice(0, visibleCount) : sortedItems.slice(0, 15);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Search className="w-6 h-6" /> Competitor Tracker
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Analyze any Roblox group to see their clothing stats and strategy
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <Input
              placeholder="Enter competitor Group ID (e.g. 114200141)"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && analyze()}
              className="font-mono"
            />
            <Button onClick={analyze} disabled={loading || !groupId.trim()} className="shrink-0">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
              Analyze
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6 flex items-center gap-2 text-destructive">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
          </CardContent>
        </Card>
      )}

      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-48 rounded-xl" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
          <Skeleton className="h-32 rounded-xl" />
        </div>
      )}

      {data && !loading && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                {data.group.thumbnailUrl ? (
                  <img src={data.group.thumbnailUrl} className="w-16 h-16 rounded-xl object-cover border border-border" alt="" />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-secondary flex items-center justify-center">
                    <Users className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold">{data.group.name}</h2>
                  {data.group.owner && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Crown className="w-3 h-3" /> {data.group.owner.displayName} (@{data.group.owner.username})
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{data.group.description}</p>
                </div>
                <Badge variant={data.group.publicEntryAllowed ? "default" : "secondary"} className="shrink-0">
                  {data.group.publicEntryAllowed ? "Open" : "Closed"}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <Users className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
                <p className="text-2xl font-bold">{data.group.memberCount.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Members</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <ShoppingBag className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
                <p className="text-2xl font-bold">{data.clothing.totalCount}</p>
                <p className="text-xs text-muted-foreground">Clothing Items</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <DollarSign className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
                <p className="text-2xl font-bold">{data.clothing.averagePrice} R$</p>
                <p className="text-xs text-muted-foreground">Avg Price</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <Heart className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
                <p className="text-2xl font-bold">{data.clothing.totalFavorites.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Total Favorites</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(data.clothing.shirts > 0 || data.clothing.pants > 0 || data.clothing.tshirts > 0) && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Shirt className="w-4 h-4" /> Clothing Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center p-3 rounded-xl bg-blue-500/5 border border-blue-500/20">
                      <p className="text-lg font-bold text-blue-600">{data.clothing.shirts}</p>
                      <p className="text-xs text-muted-foreground">Shirts</p>
                    </div>
                    <div className="text-center p-3 rounded-xl bg-purple-500/5 border border-purple-500/20">
                      <p className="text-lg font-bold text-purple-600">{data.clothing.pants}</p>
                      <p className="text-xs text-muted-foreground">Pants</p>
                    </div>
                    <div className="text-center p-3 rounded-xl bg-green-500/5 border border-green-500/20">
                      <p className="text-lg font-bold text-green-600">{data.clothing.tshirts}</p>
                      <p className="text-xs text-muted-foreground">T-Shirts</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" /> Price Analytics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Avg Price</span>
                    <span className="font-semibold">{data.clothing.averagePrice} R$</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Median Price</span>
                    <span className="font-semibold">{data.clothing.medianPrice} R$</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Min Price</span>
                    <span className="font-semibold">{data.clothing.minPrice} R$</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Max Price</span>
                    <span className="font-semibold">{data.clothing.maxPrice} R$</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Avg Favorites</span>
                    <span className="font-semibold">{data.clothing.avgFavorites}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Created</span>
                    <span className="font-semibold">{new Date(data.group.created).toLocaleDateString("ru-RU", { month: "short", year: "numeric" })}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Percent className="w-4 h-4" /> Free vs Paid
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">Paid</span>
                        <span className="font-semibold">{data.clothing.paidCount} ({data.clothing.totalCount > 0 ? Math.round(data.clothing.paidCount / data.clothing.totalCount * 100) : 0}%)</span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full" style={{ width: `${data.clothing.totalCount > 0 ? (data.clothing.paidCount / data.clothing.totalCount * 100) : 0}%` }} />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">Free / Off-sale</span>
                        <span className="font-semibold">{data.clothing.freeCount} ({data.clothing.totalCount > 0 ? Math.round(data.clothing.freeCount / data.clothing.totalCount * 100) : 0}%)</span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div className="h-full bg-gray-400 rounded-full" style={{ width: `${data.clothing.totalCount > 0 ? (data.clothing.freeCount / data.clothing.totalCount * 100) : 0}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="w-4 h-4" /> Price Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  {[
                    { label: "Free", count: data.clothing.priceRanges.free, color: "bg-gray-400" },
                    { label: "< 10 R$", count: data.clothing.priceRanges.under10, color: "bg-blue-400" },
                    { label: "10–50 R$", count: data.clothing.priceRanges.r10to50, color: "bg-green-400" },
                    { label: "51–100 R$", count: data.clothing.priceRanges.r51to100, color: "bg-yellow-500" },
                    { label: "101–500 R$", count: data.clothing.priceRanges.r101to500, color: "bg-orange-500" },
                    { label: "> 500 R$", count: data.clothing.priceRanges.over500, color: "bg-red-500" },
                  ].map(({ label, count, color }) => {
                    const pct = data.clothing.totalCount > 0 ? (count / data.clothing.totalCount * 100) : 0;
                    return (
                      <div key={label} className="flex items-center gap-2 text-xs">
                        <span className="w-20 text-muted-foreground shrink-0">{label}</span>
                        <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                          <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-8 text-right font-mono">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {allItems.length > 0 && allItems[0].favorites > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Award className="w-4 h-4" /> Top 5 Most Popular
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-5 gap-2">
                  {allItems.slice(0, 5).map((item, i) => (
                    <a key={item.id} href={`https://www.roblox.com/catalog/${item.id}`} target="_blank" rel="noreferrer" className="text-center group">
                      {item.thumbnailUrl ? (
                        <img src={item.thumbnailUrl} alt="" className="w-full aspect-square rounded-lg object-cover border border-border/50 group-hover:border-foreground/30 transition-colors" />
                      ) : (
                        <div className="w-full aspect-square rounded-lg bg-secondary flex items-center justify-center">
                          <ImageIcon className="w-5 h-5 text-muted-foreground/40" />
                        </div>
                      )}
                      <p className="text-[10px] font-semibold mt-1 truncate">{i + 1}. {item.name}</p>
                      <p className="text-[10px] text-muted-foreground">{item.favorites.toLocaleString()} fav</p>
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  {showAll ? `All Clothing (${filteredItems.length})` : `Top Clothing Items`}
                  {data.clothing.truncated && (
                    <Badge variant="outline" className="text-[10px]">truncated</Badge>
                  )}
                </CardTitle>
                <div className="flex gap-2 items-center">
                  {allItems.length > 15 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-lg text-xs gap-1.5"
                      onClick={() => { playTabSwitch(); setShowAll(!showAll); setVisibleCount(50); }}
                    >
                      {showAll ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      {showAll ? "Show Top 15" : `Show All (${allItems.length})`}
                    </Button>
                  )}
                </div>
              </div>
              {showAll && (
                <div className="flex gap-2 flex-wrap mt-2">
                  <div className="flex gap-1">
                    {(["all", "Shirt", "Pants", "T-Shirt"] as const).map(t => (
                      <button
                        key={t}
                        onClick={() => { playClick(); setFilterType(t); setVisibleCount(50); }}
                        className={`px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors ${filterType === t ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:bg-secondary"}`}
                      >
                        {t === "all" ? "All" : t}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1 ml-auto">
                    {([
                      { key: "favorites", label: "By Favorites" },
                      { key: "price_high", label: "Price ↓" },
                      { key: "price_low", label: "Price ↑" },
                    ] as const).map(s => (
                      <button
                        key={s.key}
                        onClick={() => { playClick(); setSortBy(s.key); }}
                        className={`px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors ${sortBy === s.key ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:bg-secondary"}`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[600px] overflow-y-auto custom-scrollbar">
                {displayItems.map((item, i) => (
                  <a
                    key={item.id}
                    href={`https://www.roblox.com/catalog/${item.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between py-2.5 px-3 border border-border/30 rounded-xl hover:bg-secondary/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground font-mono w-5">{i + 1}.</span>
                      {item.thumbnailUrl ? (
                        <img src={item.thumbnailUrl} alt="" className="w-10 h-10 rounded-lg object-cover border border-border/50" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                          <ImageIcon className="w-4 h-4 text-muted-foreground/40" />
                        </div>
                      )}
                      <div>
                        <span className="text-sm font-medium">{item.name}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="outline" className="text-[10px] h-4">
                            {item.type}
                          </Badge>
                          {item.favorites > 0 && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                              <Heart className="w-2.5 h-2.5" /> {item.favorites.toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {item.price != null && item.price > 0 ? `${item.price} R$` : "Off-sale"}
                    </Badge>
                  </a>
                ))}
                {displayItems.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">No items found</p>
                )}
              </div>
              {showAll && visibleCount < sortedItems.length && (
                <Button
                  variant="outline"
                  className="w-full mt-3 rounded-xl text-xs"
                  onClick={() => { playClick(); setVisibleCount(v => v + 50); }}
                >
                  Load more ({sortedItems.length - visibleCount} remaining)
                </Button>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
