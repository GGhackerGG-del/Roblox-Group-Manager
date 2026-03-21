import { useState, useEffect, useCallback } from "react";
import { getAuthCredentials } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  Crosshair, TrendingUp, TrendingDown, Loader2, RefreshCw,
  Gem, ArrowUpRight, Filter, BarChart3, Zap, DollarSign
} from "lucide-react";
import { motion } from "framer-motion";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface LimitedItem {
  id: number;
  name: string;
  acronym: string;
  rap: number;
  value: number;
  demand: number;
  trend: string;
  projected: number;
  hyped: number;
  rare: number;
  premium?: number;
  potentialProfit?: number;
}

function getAuthHeaders(): Record<string, string> {
  const { token, fingerprint } = getAuthCredentials();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (fingerprint) headers["X-Device-Fingerprint"] = fingerprint;
  return headers;
}

function getDemandLabel(d: number): string {
  const labels: Record<number, string> = { [-1]: "—", 0: "Terrible", 1: "Low", 2: "Normal", 3: "High", 4: "Amazing" };
  return labels[d] || "Unknown";
}

function getDemandColor(d: number): string {
  if (d >= 4) return "text-green-500";
  if (d >= 3) return "text-emerald-500";
  if (d >= 2) return "text-yellow-500";
  if (d >= 1) return "text-orange-500";
  return "text-red-500";
}

export default function Sniper() {
  const [items, setItems] = useState<LimitedItem[]>([]);
  const [deals, setDeals] = useState<LimitedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [dealsLoading, setDealsLoading] = useState(false);
  const [threshold, setThreshold] = useState(60);
  const [minRap, setMinRap] = useState("5000");
  const [minDemand, setMinDemand] = useState(2);
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
      const params = new URLSearchParams({
        minPremium: String(threshold),
        minRap,
        minDemand: String(minDemand),
      });
      const resp = await fetch(`${BASE}/api/sniper/deals?${params}`, { credentials: "include", headers: getAuthHeaders() });
      if (resp.ok) {
        const data = await resp.json();
        setDeals(data.deals || []);
      }
    } catch {} finally { setDealsLoading(false); }
  }, [threshold, minRap, minDemand]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const filteredItems = items.filter(i =>
    !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.acronym.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Crosshair className="w-6 h-6" /> Limited Sniper
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor limited items, find undervalued deals
          </p>
        </div>
        {totalItems > 0 && (
          <Badge variant="outline" className="text-xs">
            <Gem className="w-3 h-3 mr-1" /> {totalItems.toLocaleString()} items tracked
          </Badge>
        )}
      </div>

      <Tabs defaultValue="deals">
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="deals" className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5" /> Find Deals
          </TabsTrigger>
          <TabsTrigger value="browse" className="flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" /> Browse All
          </TabsTrigger>
        </TabsList>

        <TabsContent value="deals" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Filter className="w-4 h-4" /> Sniper Settings
              </CardTitle>
              <CardDescription className="text-xs">Configure filters to find undervalued limiteds</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">Min Value Premium: {threshold}% above RAP</Label>
                  <Slider value={[threshold]} onValueChange={(v) => setThreshold(v[0])} min={10} max={200} step={5} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Min RAP (R$)</Label>
                  <Input value={minRap} onChange={(e) => setMinRap(e.target.value)} className="font-mono text-sm" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Min Demand</Label>
                  <select
                    value={minDemand}
                    onChange={(e) => setMinDemand(Number(e.target.value))}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value={0}>Any</option>
                    <option value={1}>Low+</option>
                    <option value={2}>Normal+</option>
                    <option value={3}>High+</option>
                    <option value={4}>Amazing only</option>
                  </select>
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
                            <span>RAP: {item.rap.toLocaleString()} R$</span>
                            <span>Value: {item.value.toLocaleString()} R$</span>
                            <span className={getDemandColor(item.demand)}>{getDemandLabel(item.demand)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <p className="text-sm font-bold text-green-500">+{item.premium}%</p>
                          <p className="text-xs text-muted-foreground">+{item.potentialProfit?.toLocaleString()} R$</p>
                        </div>
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
                <p className="text-sm">Click "Scan for Deals" to find undervalued limiteds</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="browse" className="space-y-4 mt-4">
          <div className="flex gap-3">
            <Input
              placeholder="Search by name or acronym..."
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
          ) : (
            <div className="space-y-1">
              {filteredItems.slice(0, 100).map((item) => (
                <Card key={item.id} className="hover:bg-secondary/30 transition-colors">
                  <CardContent className="py-2.5 px-4 flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{item.name} {item.acronym && <span className="text-muted-foreground">({item.acronym})</span>}</p>
                    </div>
                    <div className="flex items-center gap-4 text-xs shrink-0">
                      <div className="text-right">
                        <span className="text-muted-foreground">RAP </span>
                        <span className="font-mono font-semibold">{item.rap.toLocaleString()}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-muted-foreground">Value </span>
                        <span className="font-mono font-semibold">{item.value.toLocaleString()}</span>
                      </div>
                      <span className={`${getDemandColor(item.demand)} font-medium w-16 text-right`}>{getDemandLabel(item.demand)}</span>
                      <Badge variant="outline" className="text-[10px]">{item.trend}</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
