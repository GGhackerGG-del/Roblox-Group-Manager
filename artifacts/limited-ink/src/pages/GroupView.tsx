import { useState, useEffect, useRef, useCallback } from "react";
import { getAuthCredentials } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2, Users, Coins, Shield, UploadCloud, Image as ImageIcon,
  Search, Copy, TrendingUp, UserPlus, Trash2, Download, BarChart3, Clock, RefreshCw,
  Hourglass, ShoppingCart, Settings, X, ChevronRight, LayoutGrid, DollarSign
} from "lucide-react";
import { motion } from "framer-motion";
import PnL from "./PnL";
import BanShield from "@/components/features/BanShield";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function getAuthHeaders(): Record<string, string> {
  const { token, fingerprint } = getAuthCredentials();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (fingerprint) headers["X-Device-Fingerprint"] = fingerprint;
  return headers;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      ...getAuthHeaders(),
      "Content-Type": "application/json",
      ...(options?.headers as Record<string, string> || {}),
    },
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: "Network error" })) as { error?: string };
    throw new Error(err.error || "Request failed");
  }
  return r.json() as Promise<T>;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface ClothingItem {
  id: number;
  name: string;
  assetType: string;
  price: number | null;
  thumbnailUrl: string | null;
}

interface AltAccount {
  index: number;
  userId: number;
  name: string;
  displayName: string;
  avatarUrl: string | null;
}

interface SalesData {
  pendingRobux: number;
  todayRevenue: number;
  weekRevenue: number;
  recentSales: Array<{ id: string; created: string; revenue: number; description: string }>;
}

interface FullStats {
  id: number;
  name: string;
  description: string;
  memberCount: number;
  funds: number;
  pendingRobux: number;
  salesRevenue24h: number;
  salesCount24h: number;
  joinPolicy: string;
  isLocked: boolean;
  publicEntryAllowed: boolean;
  thumbnailUrl: string | null;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ icon, label, value, accent = false }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return (
    <Card className={`rounded-2xl border-none shadow-lg shadow-black/5 ${accent ? "bg-black text-white" : "bg-gradient-to-br from-card to-secondary/30"}`}>
      <CardContent className="p-5 flex items-center gap-4">
        <div className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${accent ? "bg-white/15" : "bg-black text-white"}`}>
          {icon}
        </div>
        <div>
          <p className={`text-xs font-semibold uppercase tracking-wider ${accent ? "text-white/60" : "text-muted-foreground"}`}>{label}</p>
          <p className={`text-2xl font-bold leading-tight ${accent ? "text-white" : ""}`}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ stats }: { stats: FullStats }) {
  const groupId = String(stats.id);
  const { toast } = useToast();

  const handleAnalyze = async () => {
    try {
      const resp = await fetch(`${BASE}/api/roblox/groups/${groupId}/analyze`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Failed to generate report" })) as { error?: string };
        toast({ variant: "destructive", title: "Error", description: err.error || "Failed to generate report" });
        return;
      }
      const blob = await resp.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `analysis_${stats.name.replace(/\s+/g, "_")}_${Date.now()}.txt`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to download report" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard icon={<Users className="w-5 h-5" />} label="Members" value={stats.memberCount.toLocaleString()} />
        <StatCard icon={<Coins className="w-5 h-5" />} label="Balance" value={`${stats.funds.toLocaleString()} R$`} />
        <StatCard icon={<Hourglass className="w-5 h-5" />} label="Pending R$" value={`${(stats.pendingRobux ?? 0).toLocaleString()} R$`} />
        <StatCard icon={<ShoppingCart className="w-5 h-5" />} label="Sales 24h" value={`${(stats.salesRevenue24h ?? 0).toLocaleString()} R$`} />
        <StatCard icon={<Shield className="w-5 h-5" />} label="Join Policy" value={stats.joinPolicy} />
      </div>

      {stats.description && (
        <Card className="rounded-2xl border border-border shadow-sm">
          <CardContent className="p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Description</p>
            <p className="text-sm text-muted-foreground leading-relaxed">{stats.description}</p>
          </CardContent>
        </Card>
      )}

      <Card className="rounded-2xl border border-border shadow-md">
        <CardContent className="p-5 flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-5 h-5 text-foreground" />
              <p className="font-bold text-base">Group Analysis</p>
            </div>
            <p className="text-sm text-muted-foreground">Download a full report with improvement recommendations as a TXT file.</p>
          </div>
          <Button onClick={handleAnalyze} className="rounded-xl shrink-0 gap-2 shadow-md shadow-black/10">
            <Download className="w-4 h-4" /> Download Report
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Copy Clothing Tab ─────────────────────────────────────────────────────────

function CopyClothingTab({ groupId }: { groupId: number }) {
  const { toast } = useToast();
  const [items, setItems] = useState<ClothingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState<number | null>(null);
  const [downloading, setDownloading] = useState<number | null>(null);
  const [searchGroupId, setSearchGroupId] = useState(String(groupId));
  const [altIndex, setAltIndex] = useState<number | null>(null);
  const [alts, setAlts] = useState<AltAccount[]>([]);
  const [rateLimited, setRateLimited] = useState(false);
  const [retryCountdown, setRetryCountdown] = useState(0);

  const startRetryCountdown = useCallback((seconds: number, gid: string, fetchFn: (g: string) => Promise<void>) => {
    setRetryCountdown(seconds);
    const interval = setInterval(() => {
      setRetryCountdown(prev => {
        if (prev <= 1) { clearInterval(interval); fetchFn(gid); return 0; }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const fetchClothing = useCallback(async (gid: string) => {
    setLoading(true);
    setRateLimited(false);
    try {
      const data = await apiFetch<{ items: ClothingItem[] }>(`/api/roblox/groups/${gid}/clothing`);
      setItems(data.items);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      if (msg.toLowerCase().includes("rate limit") || msg.includes("429")) {
        setRateLimited(true);
        startRetryCountdown(30, gid, fetchClothing);
        toast({ variant: "destructive", title: "Rate limited", description: "Roblox is busy. Auto-retrying in 30s..." });
      } else if (msg.toLowerCase().includes("session") || msg.toLowerCase().includes("sign in") || msg.includes("401")) {
        toast({ variant: "destructive", title: "Roblox session required", description: "Go to Settings → connect your Roblox account first." });
      } else {
        toast({ variant: "destructive", title: "Failed to load", description: msg });
      }
    } finally {
      setLoading(false);
    }
  }, [toast, startRetryCountdown]);

  useEffect(() => {
    fetchClothing(String(groupId));
    apiFetch<{ accounts: AltAccount[] }>("/api/roblox/alt").then(d => setAlts(d.accounts)).catch(() => {});
  }, [groupId, fetchClothing]);

  const handleDownloadItem = async (item: ClothingItem) => {
    setDownloading(item.id);
    try {
      const tmpl = await apiFetch<{ b64_json: string; name: string; clothingType: string }>(
        `/api/roblox/clothing/${item.id}/template`
      );
      const a = document.createElement("a");
      a.href = `data:image/png;base64,${tmpl.b64_json}`;
      a.download = `${tmpl.name.replace(/[^a-z0-9]/gi, "_")}.png`;
      a.click();
      toast({ title: "Downloaded!", description: `${tmpl.name} saved to your device.` });
    } catch (err) {
      toast({ variant: "destructive", title: "Download failed", description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setDownloading(null);
    }
  };

  const handleCopyItem = async (item: ClothingItem) => {
    setCopying(item.id);
    try {
      const tmpl = await apiFetch<{ b64_json: string; name: string; clothingType: string }>(
        `/api/roblox/clothing/${item.id}/template`
      );

      const body: Record<string, unknown> = {
        groupId,
        name: `${tmpl.name} (copy)`,
        description: `Copied from ID ${item.id} via Limited.Ink`,
        imageData: tmpl.b64_json,
        clothingType: tmpl.clothingType,
      };
      if (altIndex !== null) body.altIndex = altIndex;

      const result = await apiFetch<{ assetId: number }>("/api/clothing/upload", {
        method: "POST",
        body: JSON.stringify(body),
      });
      toast({ title: "Copied!", description: `Uploaded with Asset ID: ${result.assetId}` });
    } catch (err) {
      toast({ variant: "destructive", title: "Copy failed", description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setCopying(null);
    }
  };

  return (
    <div className="space-y-5">
      <Card className="rounded-2xl border border-border shadow-sm">
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex gap-2">
              <Input
                value={searchGroupId}
                onChange={e => setSearchGroupId(e.target.value)}
                placeholder="Source group ID"
                className="rounded-xl"
              />
              <Button variant="outline" onClick={() => fetchClothing(searchGroupId)} className="rounded-xl px-4 shrink-0">
                <Search className="w-4 h-4 mr-1.5" />Load
              </Button>
              <Button variant="outline" onClick={() => fetchClothing(searchGroupId)} className="rounded-xl px-3 shrink-0">
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>
          {alts.length > 0 && (
            <div className="flex gap-2 flex-wrap items-center">
              <span className="text-xs text-muted-foreground font-semibold">Upload from:</span>
              <button
                onClick={() => setAltIndex(null)}
                className={`px-2.5 py-1 rounded-lg border text-xs font-semibold transition-all ${altIndex === null ? "bg-black text-white border-black" : "border-border text-muted-foreground"}`}
              >
                Main
              </button>
              {alts.map(alt => (
                <button
                  key={alt.index}
                  onClick={() => setAltIndex(alt.index)}
                  className={`px-2.5 py-1 rounded-lg border text-xs font-semibold transition-all ${altIndex === alt.index ? "bg-black text-white border-black" : "border-border text-muted-foreground"}`}
                >
                  @{alt.name}
                </button>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">Enter a group ID to load its catalog. Click "Copy" to upload to your group, or "Download" to save the template.</p>
        </CardContent>
      </Card>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-2xl" />)}
        </div>
      ) : rateLimited ? (
        <div className="text-center py-16 text-muted-foreground space-y-3">
          <Hourglass className="w-12 h-12 mx-auto opacity-30" strokeWidth={1} />
          <p className="font-medium">Roblox rate limit hit</p>
          <p className="text-xs">Auto-retrying in <span className="font-bold text-foreground">{retryCountdown}s</span></p>
          <Button size="sm" variant="outline" className="rounded-lg" onClick={() => { setRateLimited(false); setRetryCountdown(0); fetchClothing(searchGroupId); }}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry Now
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-30" strokeWidth={1} />
          <p className="font-medium">No clothing found</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {items.map(item => (
            <motion.div key={item.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="group">
              <Card className="rounded-2xl border border-border overflow-hidden shadow-sm hover:shadow-md transition-all">
                <div className="aspect-square bg-secondary/50 relative overflow-hidden">
                  {item.thumbnailUrl ? (
                    <img src={item.thumbnailUrl} alt={item.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
                      <ImageIcon className="w-10 h-10" strokeWidth={1} />
                    </div>
                  )}
                  <div className="absolute top-2 left-2">
                    <Badge className={`text-[10px] ${item.assetType === "Shirt" ? "bg-blue-500/80" : "bg-purple-500/80"} text-white border-0`}>
                      {item.assetType === "Shirt" ? "👕" : "👖"} {item.assetType}
                    </Badge>
                  </div>
                </div>
                <CardContent className="p-3 space-y-2">
                  <p className="text-xs font-semibold line-clamp-1">{item.name}</p>
                  <div className="flex items-center justify-between gap-1">
                    {item.price !== null ? (
                      <span className="text-xs text-muted-foreground">{item.price} R$</span>
                    ) : <span className="text-xs text-muted-foreground">Free</span>}
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs rounded-lg" onClick={() => handleDownloadItem(item)} disabled={downloading === item.id} title="Download template">
                        {downloading === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs rounded-lg" onClick={() => handleCopyItem(item)} disabled={copying === item.id}>
                        {copying === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Copy className="w-3 h-3 mr-1" />}
                        {copying === item.id ? "" : "Copy"}
                      </Button>
                    </div>
                  </div>
                  <BanShield name={item.name} clothingType={item.assetType} />
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Catalog Search Tab ───────────────────────────────────────────────────────

function CatalogSearchTab({ groupId }: { groupId: number }) {
  const { toast } = useToast();
  const [keyword, setKeyword] = useState("");
  const [items, setItems] = useState<Array<ClothingItem & { creatorName?: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [copying, setCopying] = useState<number | null>(null);
  const [downloading, setDownloading] = useState<number | null>(null);
  const [altIndex, setAltIndex] = useState<number | null>(null);
  const [alts, setAlts] = useState<AltAccount[]>([]);

  useEffect(() => {
    apiFetch<{ accounts: AltAccount[] }>("/api/roblox/alt").then(d => setAlts(d.accounts)).catch(() => {});
  }, []);

  const [rateLimited, setRateLimited] = useState(false);

  const handleSearch = async () => {
    if (!keyword.trim()) return;
    setLoading(true);
    setItems([]);
    setRateLimited(false);
    try {
      const data = await apiFetch<{ items: Array<ClothingItem & { creatorName?: string }> }>(
        `/api/roblox/catalog/search?keyword=${encodeURIComponent(keyword)}&limit=30`
      );
      setItems(data.items);
      if (data.items.length === 0) {
        toast({ title: "No results", description: `Nothing found for "${keyword}". Try a different keyword.` });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Search failed.";
      if (msg.toLowerCase().includes("rate limit") || msg.includes("429")) {
        setRateLimited(true);
        toast({ variant: "destructive", title: "Rate limited", description: "Roblox is busy — wait 30s then try again." });
      } else {
        toast({ variant: "destructive", title: "Error", description: msg });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadItem = async (item: ClothingItem) => {
    setDownloading(item.id);
    try {
      const tmpl = await apiFetch<{ b64_json: string; name: string; clothingType: string }>(
        `/api/roblox/clothing/${item.id}/template`
      );
      const a = document.createElement("a");
      a.href = `data:image/png;base64,${tmpl.b64_json}`;
      a.download = `${tmpl.name.replace(/[^a-z0-9]/gi, "_")}.png`;
      a.click();
      toast({ title: "Downloaded!", description: `${tmpl.name} saved to your device.` });
    } catch (err) {
      toast({ variant: "destructive", title: "Download failed", description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setDownloading(null);
    }
  };

  const handleCopyItem = async (item: ClothingItem) => {
    setCopying(item.id);
    try {
      const tmpl = await apiFetch<{ b64_json: string; name: string; clothingType: string }>(
        `/api/roblox/clothing/${item.id}/template`
      );
      const body: Record<string, unknown> = {
        groupId,
        name: `${tmpl.name} (copy)`,
        description: `Found in catalog, copied via Limited.Ink`,
        imageData: tmpl.b64_json,
        clothingType: tmpl.clothingType,
      };
      if (altIndex !== null) body.altIndex = altIndex;

      const result = await apiFetch<{ assetId: number }>("/api/clothing/upload", {
        method: "POST",
        body: JSON.stringify(body),
      });
      toast({ title: "Copied!", description: `Asset ID: ${result.assetId}` });
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setCopying(null);
    }
  };

  return (
    <div className="space-y-5">
      <Card className="rounded-2xl border border-border shadow-sm">
        <CardContent className="p-4 space-y-3">
          <div className="flex gap-2">
            <Input
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder="Clothing name (e.g. Black Jacket, Hoodie, Anime)..."
              className="rounded-xl flex-1"
            />
            <Button onClick={handleSearch} disabled={loading || !keyword.trim()} className="rounded-xl px-5">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
          </div>
          {alts.length > 0 && (
            <div className="flex gap-2 flex-wrap items-center">
              <span className="text-xs text-muted-foreground font-semibold">Upload from:</span>
              <button onClick={() => setAltIndex(null)} className={`px-2.5 py-1 rounded-lg border text-xs font-semibold ${altIndex === null ? "bg-black text-white border-black" : "border-border text-muted-foreground"}`}>
                Main
              </button>
              {alts.map(alt => (
                <button key={alt.index} onClick={() => setAltIndex(alt.index)} className={`px-2.5 py-1 rounded-lg border text-xs font-semibold ${altIndex === alt.index ? "bg-black text-white border-black" : "border-border text-muted-foreground"}`}>
                  @{alt.name}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {loading && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-2xl" />)}
        </div>
      )}

      {!loading && rateLimited && (
        <div className="text-center py-16 text-muted-foreground space-y-3">
          <Hourglass className="w-12 h-12 mx-auto opacity-30" strokeWidth={1} />
          <p className="font-medium">Roblox rate limit hit</p>
          <p className="text-sm text-muted-foreground/70">Wait ~30 seconds, then search again.</p>
          <Button size="sm" variant="outline" className="rounded-lg" onClick={handleSearch}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry
          </Button>
        </div>
      )}

      {!loading && !rateLimited && items.length === 0 && !keyword && (
        <div className="text-center py-16 text-muted-foreground">
          <Search className="w-12 h-12 mx-auto mb-3 opacity-30" strokeWidth={1} />
          <p className="font-medium">Enter a name to search the Roblox catalog</p>
          <p className="text-sm mt-1 text-muted-foreground/70">Try: "black jacket", "anime shirt", "hoodie"</p>
        </div>
      )}

      {items.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {items.map(item => (
            <motion.div key={item.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
              <Card className="rounded-2xl border border-border overflow-hidden shadow-sm hover:shadow-md transition-all">
                <div className="aspect-square bg-secondary/50 relative overflow-hidden">
                  {item.thumbnailUrl ? (
                    <img src={item.thumbnailUrl} alt={item.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
                      <ImageIcon className="w-10 h-10" strokeWidth={1} />
                    </div>
                  )}
                  <div className="absolute top-2 left-2">
                    <Badge className={`text-[10px] ${item.assetType === "Shirt" ? "bg-blue-500/80" : "bg-purple-500/80"} text-white border-0`}>
                      {item.assetType === "Shirt" ? "👕" : "👖"}
                    </Badge>
                  </div>
                </div>
                <CardContent className="p-3 space-y-2">
                  <p className="text-xs font-semibold line-clamp-1">{item.name}</p>
                  {item.creatorName && <p className="text-[10px] text-muted-foreground">@{item.creatorName}</p>}
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs text-muted-foreground">{item.price !== null ? `${item.price} R$` : "Free"}</span>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs rounded-lg"
                        onClick={() => handleDownloadItem(item)}
                        disabled={downloading === item.id}
                        title="Download template"
                      >
                        {downloading === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs rounded-lg" onClick={() => handleCopyItem(item)} disabled={copying === item.id}>
                        {copying === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Copy className="w-3 h-3 mr-1" />Copy</>}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Sales Tab ────────────────────────────────────────────────────────────────

function SalesTab({ groupId }: { groupId: number }) {
  const [data, setData] = useState<SalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const fetchSales = useCallback(async () => {
    try {
      const d = await apiFetch<SalesData>(`/api/roblox/groups/${groupId}/sales`);
      setData(d);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchSales, 30_000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchSales]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-lg">Sales Monitor</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(p => !p)}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${autoRefresh ? "bg-green-500/15 text-green-600 border-green-500/30" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            <Clock className="w-3.5 h-3.5" />
            {autoRefresh ? "Auto (30s)" : "Auto-refresh"}
          </button>
          <Button size="sm" variant="outline" onClick={fetchSales} className="rounded-lg gap-1.5 text-xs">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard icon={<TrendingUp className="w-5 h-5" />} label="Today's Revenue" value={`${(data?.todayRevenue ?? 0).toLocaleString()} R$`} accent />
        <StatCard icon={<Hourglass className="w-5 h-5" />} label="Pending Robux" value={`${(data?.pendingRobux ?? 0).toLocaleString()} R$`} />
        <StatCard icon={<ShoppingCart className="w-5 h-5" />} label="Transactions" value={(data?.recentSales.length ?? 0).toLocaleString()} />
      </div>

      <Card className="rounded-2xl border border-border shadow-sm">
        <CardHeader className="pb-2 p-5">
          <CardTitle className="text-base font-bold">Recent Sales</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!data?.recentSales || data.recentSales.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ShoppingCart className="w-10 h-10 mx-auto mb-3 opacity-30" strokeWidth={1} />
              <p className="text-sm">No sales data available</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {data.recentSales.map((sale, i) => (
                <div key={`${sale.id}-${i}`} className="flex items-center justify-between px-5 py-3 hover:bg-secondary/40 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 bg-green-500/15 rounded-full flex items-center justify-center shrink-0">
                      <ShoppingCart className="w-4 h-4 text-green-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{sale.description}</p>
                      <p className="text-xs text-muted-foreground">{new Date(sale.created).toLocaleString("en-US")}</p>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-green-600 ml-4 shrink-0">+{sale.revenue} R$</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Alt Accounts Tab ─────────────────────────────────────────────────────────

function AltAccountsTab() {
  const { toast } = useToast();
  const [alts, setAlts] = useState<AltAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCookie, setNewCookie] = useState("");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);

  useEffect(() => {
    apiFetch<{ accounts: AltAccount[] }>("/api/roblox/alt")
      .then(d => setAlts(d.accounts))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleAdd = async () => {
    if (!newCookie.trim()) return;
    setAdding(true);
    try {
      const data = await apiFetch<AltAccount>("/api/roblox/alt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookie: newCookie.trim() }),
      });
      setAlts(prev => [...prev, data]);
      setNewCookie("");
      toast({ title: "Account added", description: `@${data.name} is ready to use.` });
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: err instanceof Error ? err.message : "Failed to add account." });
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (alt: AltAccount) => {
    setRemoving(alt.index);
    try {
      await apiFetch(`/api/roblox/alt/${alt.index}`, { method: "DELETE" });
      setAlts(prev => prev.filter(a => a.userId !== alt.userId).map((a, i) => ({ ...a, index: i })));
      toast({ title: "Removed", description: `@${alt.name} has been removed.` });
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to remove account." });
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="space-y-5">
      <Card className="rounded-2xl border border-border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2"><UserPlus className="w-5 h-5" /> Add Alt Account</CardTitle>
          <CardDescription>Alt accounts are used to upload clothing instead of the main account. Stored only for the current session.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Cookie (.ROBLOSECURITY)</Label>
            <Textarea
              value={newCookie}
              onChange={e => setNewCookie(e.target.value)}
              placeholder="_|WARNING:-DO-NOT-SHARE-THIS..."
              className="resize-none min-h-[80px] rounded-xl font-mono text-xs"
            />
          </div>
          <Button onClick={handleAdd} disabled={adding || !newCookie.trim()} className="rounded-xl w-full gap-2">
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            {adding ? "Verifying..." : "Add Account"}
          </Button>
          <p className="text-xs text-muted-foreground">
            The cookie is not stored permanently — only in server memory for the current session.
          </p>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map(i => <Skeleton key={i} className="h-20 rounded-2xl" />)}
        </div>
      ) : alts.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" strokeWidth={1} />
          <p className="font-medium">No alt accounts added</p>
          <p className="text-sm mt-1">Add an account cookie above</p>
        </div>
      ) : (
        <div className="space-y-3">
          {alts.map(alt => (
            <Card key={alt.userId} className="rounded-2xl border border-border shadow-sm">
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Avatar className="w-12 h-12 border border-border">
                    <AvatarImage src={alt.avatarUrl || undefined} />
                    <AvatarFallback className="font-bold">{alt.displayName.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-bold">{alt.displayName}</p>
                    <p className="text-xs text-muted-foreground">@{alt.name} · ID: {alt.userId}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="text-xs bg-green-500/15 text-green-600 border-green-500/20">Active</Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg"
                    onClick={() => handleRemove(alt)}
                    disabled={removing === alt.index}
                  >
                    {removing === alt.index ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main GroupView ───────────────────────────────────────────────────────────

export default function GroupView({ id }: { id: string }) {
  const [stats, setStats] = useState<FullStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem(`limitedink_tab_${id}`) || "overview";
  });

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    localStorage.setItem(`limitedink_tab_${id}`, tab);
  };

  useEffect(() => {
    setIsLoading(true);
    setIsError(false);
    setStats(null);
    apiFetch<FullStats>(`/api/roblox/groups/${id}/stats`)
      .then(d => setStats(d))
      .catch(() => setIsError(true))
      .finally(() => setIsLoading(false));
  }, [id]);

  useEffect(() => {
    const saved = localStorage.getItem(`limitedink_tab_${id}`);
    if (saved) setActiveTab(saved);
    else setActiveTab("overview");
  }, [id]);

  if (isLoading || (!stats && !isError)) {
    return (
      <div className="p-8 lg:p-12 w-full max-w-6xl mx-auto space-y-8">
        <div className="flex items-center gap-4">
          <Skeleton className="w-20 h-20 rounded-2xl" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
        </div>
        <div className="grid grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  if (isError || !stats) {
    return <div className="p-12 text-center text-muted-foreground">Failed to load group stats.</div>;
  }

  return (
    <div className="p-6 lg:p-10 w-full max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-5">
        {stats.thumbnailUrl && (
          <img src={stats.thumbnailUrl} alt={stats.name} className="w-20 h-20 rounded-2xl shadow-lg border border-border/50 shrink-0" />
        )}
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-foreground leading-tight">{stats.name}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            ID: {stats.id} · {stats.memberCount.toLocaleString()} members
          </p>
        </div>
        <a
          href={`https://www.roblox.com/groups/${stats.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-xs font-semibold px-3 py-2 rounded-xl bg-secondary hover:bg-secondary/70 transition-colors border border-border flex items-center gap-1.5 shrink-0"
        >
          Roblox <ChevronRight className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="rounded-xl bg-secondary/50 border border-border p-1 h-auto flex-wrap gap-1 w-full">
          <TabsTrigger value="overview" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-sm px-3 py-2 flex items-center gap-1.5">
            <LayoutGrid className="w-3.5 h-3.5" /> Overview
          </TabsTrigger>
          <TabsTrigger value="copy" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-sm px-3 py-2 flex items-center gap-1.5">
            <Copy className="w-3.5 h-3.5" /> Copy Clothing
          </TabsTrigger>
          <TabsTrigger value="catalog" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-sm px-3 py-2 flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5" /> Catalog
          </TabsTrigger>
          <TabsTrigger value="sales" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-sm px-3 py-2 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" /> Sales
          </TabsTrigger>
          <TabsTrigger value="alts" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-sm px-3 py-2 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> Alt Accounts
          </TabsTrigger>
          <TabsTrigger value="pnl" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-sm px-3 py-2 flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5" /> P&L
          </TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="overview" className="mt-0">
            <OverviewTab stats={stats} />
          </TabsContent>
          <TabsContent value="copy" className="mt-0">
            <CopyClothingTab groupId={stats.id} />
          </TabsContent>
          <TabsContent value="catalog" className="mt-0">
            <CatalogSearchTab groupId={stats.id} />
          </TabsContent>
          <TabsContent value="sales" className="mt-0">
            <SalesTab groupId={stats.id} />
          </TabsContent>
          <TabsContent value="alts" className="mt-0">
            <AltAccountsTab />
          </TabsContent>
          <TabsContent value="pnl" className="mt-0">
            <PnL groupId={String(stats.id)} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
