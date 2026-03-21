import { useState, useEffect, useCallback } from "react";
import { getAuthCredentials } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import {
  Crosshair, Loader2, RefreshCw, ArrowUpRight, Filter, BarChart3, Zap, Heart
} from "lucide-react";
import { motion } from "framer-motion";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface LimitedItem {
  id: number;
  name: string;
  price: number | null;
  lowestResalePrice: number | null;
  favoriteCount: number;
  creatorName: string;
  collectibleItemId: string | null;
  assetType: number;
  discount?: number;
  resalePrice?: number;
}

function getAuthHeaders(): Record<string, string> {
  const { token, fingerprint } = getAuthCredentials();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (fingerprint) headers["X-Device-Fingerprint"] = fingerprint;
  return headers;
}

export default function Sniper() {
  const [items, setItems] = useState<LimitedItem[]>([]);
  const [deals, setDeals] = useState<LimitedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [dealsLoading, setDealsLoading] = useState(false);
  const [maxPrice, setMaxPrice] = useState("50000");
  const [minFavorites, setMinFavorites] = useState("0");
  const [search, setSearch] = useState("");
  const [totalItems, setTotalItems] = useState(0);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${BASE}/api/sniper/items`, { credentials: "include", headers: getAuthHeaders() });
      if (resp.ok) {
        const data = await resp.json();
        setItems(data.items || []);
        setTotalItems(data.total || 0);
      }
    } catch {} finally { setLoading(false); }
  }, []);

  const fetchDeals = useCallback(async () => {
    setDealsLoading(true);
    try {
      const params = new URLSearchParams({ maxPrice, minFavorites });
      const resp = await fetch(`${BASE}/api/sniper/deals?${params}`, { credentials: "include", headers: getAuthHeaders() });
      if (resp.ok) {
        const data = await resp.json();
        setDeals(data.deals || []);
      }
    } catch {} finally { setDealsLoading(false); }
  }, [maxPrice, minFavorites]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const filteredItems = items.filter(i =>
    !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.creatorName.toLowerCase().includes(search.toLowerCase())
  );

  const getDisplayPrice = (item: LimitedItem) => {
    return item.price ?? item.lowestResalePrice ?? 0;
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Crosshair className="w-6 h-6" /> Limited Sniper
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor collectible items, find resale opportunities
          </p>
        </div>
        {totalItems > 0 && (
          <Badge variant="outline" className="text-xs">
            {totalItems.toLocaleString()} items tracked
          </Badge>
        )}
      </div>

      <Tabs defaultValue="browse">
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
              placeholder="Search by name or creator..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1"
            />
            <Button variant="outline" onClick={fetchItems} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : filteredItems.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center text-muted-foreground">
                <Crosshair className="w-8 h-8 mx-auto mb-3 opacity-30" />
                <p className="text-sm">{items.length === 0 ? "Loading items... Click refresh to retry." : "No items match your search."}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-1">
              {filteredItems.slice(0, 100).map((item) => (
                <Card key={item.id} className="hover:bg-secondary/30 transition-colors">
                  <CardContent className="py-2.5 px-4 flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.creatorName}</p>
                    </div>
                    <div className="flex items-center gap-4 text-xs shrink-0">
                      <div className="text-right">
                        <span className="font-mono font-semibold">{getDisplayPrice(item).toLocaleString()} R$</span>
                      </div>
                      {item.lowestResalePrice != null && item.lowestResalePrice > 0 && (
                        <div className="text-right">
                          <span className="text-muted-foreground">Resale </span>
                          <span className="font-mono font-semibold">{item.lowestResalePrice.toLocaleString()}</span>
                        </div>
                      )}
                      <span className="text-muted-foreground flex items-center gap-0.5 w-16 justify-end">
                        <Heart className="w-3 h-3" /> {item.favoriteCount.toLocaleString()}
                      </span>
                      <a href={`https://www.roblox.com/catalog/${item.id}`} target="_blank" rel="noreferrer">
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
                <Filter className="w-4 h-4" /> Deal Finder Settings
              </CardTitle>
              <CardDescription className="text-xs">Find collectibles with resale potential</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">Max Price (R$)</Label>
                  <Input value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} className="font-mono text-sm" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Min Favorites</Label>
                  <Input value={minFavorites} onChange={(e) => setMinFavorites(e.target.value)} className="font-mono text-sm" />
                </div>
              </div>
              <Button onClick={fetchDeals} disabled={dealsLoading} className="w-full">
                {dealsLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Crosshair className="w-4 h-4 mr-2" />}
                Scan for Deals
              </Button>
            </CardContent>
          </Card>

          {deals.length > 0 && (
            <div className="space-y-2">
              {deals.map((item, i) => (
                <motion.div key={item.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
                  <Card className="hover:border-green-500/30 transition-colors">
                    <CardContent className="py-3 px-4 flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold text-green-500">#{i + 1}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{item.name}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{item.creatorName}</span>
                            <span>Price: {getDisplayPrice(item).toLocaleString()} R$</span>
                            {item.resalePrice != null && item.resalePrice > 0 && (
                              <span>Resale: {item.resalePrice.toLocaleString()} R$</span>
                            )}
                            <span className="flex items-center gap-0.5"><Heart className="w-2.5 h-2.5" /> {item.favoriteCount.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {item.discount != null && item.discount > 0 && (
                          <div className="text-right">
                            <p className="text-sm font-bold text-green-500">-{item.discount}%</p>
                            <p className="text-[10px] text-muted-foreground">resale discount</p>
                          </div>
                        )}
                        <a href={`https://www.roblox.com/catalog/${item.id}`} target="_blank" rel="noreferrer">
                          <Button variant="ghost" size="sm"><ArrowUpRight className="w-4 h-4" /></Button>
                        </a>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}

          {deals.length === 0 && !dealsLoading && (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center text-muted-foreground">
                <Crosshair className="w-8 h-8 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Click "Scan for Deals" to find collectibles with resale potential</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
