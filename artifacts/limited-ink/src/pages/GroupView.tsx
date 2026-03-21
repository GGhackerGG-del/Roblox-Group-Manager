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
  Loader2, Users, Shield, Image as ImageIcon,
  Search, Copy, UserPlus, Trash2, Download, RefreshCw,
  Hourglass, ChevronRight, DollarSign, Upload, Package, FolderDown
} from "lucide-react";
import { motion } from "framer-motion";
import { playClick, playSuccess, playError, playTabSwitch } from "@/hooks/useSounds";
import PnL from "./PnL";
import BanShield from "@/components/features/BanShield";
import JSZip from "jszip";

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
  const [bulkCount, setBulkCount] = useState("");
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);

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

  const handleBulkDownload = async (count?: number) => {
    const downloadItems = count ? items.slice(0, count) : items;
    if (downloadItems.length === 0) return;

    setBulkDownloading(true);
    setBulkProgress(0);
    const zip = new JSZip();
    let downloaded = 0;

    for (const item of downloadItems) {
      try {
        const tmpl = await apiFetch<{ b64_json: string; name: string; clothingType: string }>(
          `/api/roblox/clothing/${item.id}/template`
        );
        const fileName = `${tmpl.name.replace(/[^a-z0-9]/gi, "_")}_${item.id}.png`;
        zip.file(fileName, tmpl.b64_json, { base64: true });
        downloaded++;
        setBulkProgress(Math.round((downloaded / downloadItems.length) * 100));
        await new Promise(r => setTimeout(r, 200));
      } catch {}
    }

    if (downloaded > 0) {
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `clothing_group_${searchGroupId}_${downloaded}items.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Downloaded!", description: `${downloaded} items saved as ZIP.` });
    } else {
      toast({ variant: "destructive", title: "Failed", description: "Could not download any items." });
    }

    setBulkDownloading(false);
    setBulkProgress(0);
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

      {items.length > 0 && !loading && !rateLimited && (
        <Card className="rounded-2xl border border-border shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs font-semibold text-muted-foreground">Bulk Download:</span>
              <Button
                size="sm"
                variant="outline"
                className="rounded-lg text-xs gap-1.5"
                onClick={() => handleBulkDownload()}
                disabled={bulkDownloading}
              >
                <FolderDown className="w-3.5 h-3.5" /> All ({items.length})
              </Button>
              <div className="flex items-center gap-1.5">
                <Input
                  value={bulkCount}
                  onChange={e => setBulkCount(e.target.value.replace(/\D/g, ""))}
                  placeholder="Count"
                  className="w-20 h-8 rounded-lg text-xs"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-lg text-xs gap-1.5 h-8"
                  onClick={() => handleBulkDownload(parseInt(bulkCount) || 10)}
                  disabled={bulkDownloading || !bulkCount}
                >
                  <Package className="w-3.5 h-3.5" /> Download
                </Button>
              </div>
              {bulkDownloading && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{bulkProgress}%</span>
                  <div className="w-24 h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-black rounded-full transition-all" style={{ width: `${bulkProgress}%` }} />
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

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

// ─── Upload Clothing Tab ──────────────────────────────────────────────────────

interface QueuedFile {
  id: string;
  name: string;
  imageData: string;
  previewUrl: string;
  status: "pending" | "uploading" | "done" | "failed";
  assetId?: number;
  error?: string;
}

function UploadClothingTab({ groupId }: { groupId: number }) {
  const { toast } = useToast();
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [templateImage, setTemplateImage] = useState<string | null>(null);
  const [sharedName, setSharedName] = useState("");
  const [description, setDescription] = useState("");
  const [clothingType, setClothingType] = useState<"Shirt" | "Pants">("Shirt");
  const [uploading, setUploading] = useState(false);
  const [altIndex, setAltIndex] = useState<number | null>(null);
  const [alts, setAlts] = useState<AltAccount[]>([]);

  useEffect(() => {
    apiFetch<{ accounts: AltAccount[] }>("/api/roblox/alt").then(d => setAlts(d.accounts)).catch(() => {});
  }, []);

  const handleMultiFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const b64 = result.split(",")[1];
        const fileName = file.name.replace(/\.[^.]+$/, "");
        setQueue(prev => [...prev, {
          id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
          name: fileName,
          imageData: b64,
          previewUrl: result,
          status: "pending",
        }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const handleTemplateSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setTemplateImage(result.split(",")[1]);
    };
    reader.readAsDataURL(file);
  };

  const removeFromQueue = (id: string) => {
    setQueue(prev => prev.filter(f => f.id !== id));
  };

  const updateQueueName = (id: string, newName: string) => {
    setQueue(prev => prev.map(f => f.id === id ? { ...f, name: newName } : f));
  };

  const compositeWithTemplate = async (imageData: string): Promise<string> => {
    if (!templateImage) return imageData;
    return new Promise<string>((resolve) => {
      const canvas = document.createElement("canvas");
      canvas.width = 585;
      canvas.height = 559;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(imageData); return; }

      const img1 = new Image();
      img1.onload = () => {
        ctx.drawImage(img1, 0, 0, 585, 559);
        const img2 = new Image();
        img2.onload = () => {
          ctx.drawImage(img2, 0, 0, 585, 559);
          resolve(canvas.toDataURL("image/png").split(",")[1]);
        };
        img2.src = `data:image/png;base64,${templateImage}`;
      };
      img1.src = `data:image/png;base64,${imageData}`;
    });
  };

  const handleUploadAll = async () => {
    const pendingItems = queue.filter(f => f.status === "pending");
    if (pendingItems.length === 0) return;
    setUploading(true);

    for (const item of pendingItems) {
      setQueue(prev => prev.map(f => f.id === item.id ? { ...f, status: "uploading" } : f));

      try {
        const finalImage = await compositeWithTemplate(item.imageData);
        const uploadName = sharedName.trim() || item.name.trim() || "Clothing";
        const body: Record<string, unknown> = {
          groupId,
          name: uploadName,
          description: description.trim() || "Uploaded via Limited.Ink",
          imageData: finalImage,
          clothingType,
        };
        if (altIndex !== null) body.altIndex = altIndex;

        const result = await apiFetch<{ assetId?: number; error?: string; status?: string }>("/api/clothing/upload", {
          method: "POST",
          body: JSON.stringify(body),
        });

        if (result.assetId) {
          setQueue(prev => prev.map(f => f.id === item.id ? { ...f, status: "done", assetId: result.assetId } : f));
          playSuccess();
        } else {
          setQueue(prev => prev.map(f => f.id === item.id ? { ...f, status: "failed", error: result.error || "Upload failed" } : f));
          playError();
        }
      } catch (err) {
        setQueue(prev => prev.map(f => f.id === item.id ? { ...f, status: "failed", error: err instanceof Error ? err.message : "Error" } : f));
        playError();
      }

      await new Promise(r => setTimeout(r, 1000));
    }

    const doneCount = queue.filter(f => f.status === "done" || pendingItems.find(p => p.id === f.id)).length;
    toast({ title: "Upload complete", description: `Processed ${pendingItems.length} items` });
    setUploading(false);
  };

  const pendingCount = queue.filter(f => f.status === "pending").length;
  const doneCount = queue.filter(f => f.status === "done").length;
  const failedCount = queue.filter(f => f.status === "failed").length;

  return (
    <div className="space-y-5">
      <Card className="rounded-2xl border border-border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2"><Upload className="w-5 h-5" /> Upload Clothing</CardTitle>
          <CardDescription>Upload one or multiple PNG clothing images to your Roblox group.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Clothing Images (PNG) *</Label>
              <div className="border-2 border-dashed border-border rounded-xl p-4 text-center hover:border-foreground/30 transition-colors cursor-pointer relative">
                <input type="file" accept="image/png" multiple onChange={handleMultiFileSelect} className="absolute inset-0 opacity-0 cursor-pointer" />
                <div className="py-4">
                  <Upload className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-xs text-muted-foreground">Click to select one or more clothing PNGs</p>
                  {queue.length > 0 && (
                    <p className="text-xs text-green-600 font-semibold mt-1">{queue.length} file(s) in queue</p>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Template Overlay (optional)</Label>
              <div className="border-2 border-dashed border-border rounded-xl p-4 text-center hover:border-foreground/30 transition-colors cursor-pointer relative">
                <input type="file" accept="image/png" onChange={handleTemplateSelect} className="absolute inset-0 opacity-0 cursor-pointer" />
                {templateImage ? (
                  <div className="space-y-2">
                    <img src={`data:image/png;base64,${templateImage}`} alt="Template" className="w-32 h-32 mx-auto object-contain rounded-lg" />
                    <p className="text-xs text-green-600 font-semibold">Template loaded</p>
                    <Button variant="ghost" size="sm" className="text-xs" onClick={(e) => { e.stopPropagation(); setTemplateImage(null); }}>Remove</Button>
                  </div>
                ) : (
                  <div className="py-4">
                    <ImageIcon className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-xs text-muted-foreground">Click to select template PNG (overlay)</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {queue.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Upload Queue ({queue.length})</Label>
              <div className="max-h-64 overflow-y-auto space-y-2 custom-scrollbar">
                {queue.map(item => (
                  <div key={item.id} className="flex items-center gap-3 p-2 border border-border/50 rounded-xl">
                    <img src={item.previewUrl} alt="" className="w-10 h-10 rounded-lg object-contain border border-border/30" />
                    <Input
                      value={item.name}
                      onChange={e => updateQueueName(item.id, e.target.value)}
                      className="rounded-lg flex-1 h-8 text-xs"
                      placeholder="Item name"
                      disabled={item.status !== "pending"}
                    />
                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.status === "done" && (
                        <Badge className="text-[10px] bg-green-500/15 text-green-600 border-green-500/20">
                          ID: {item.assetId}
                        </Badge>
                      )}
                      {item.status === "failed" && (
                        <Badge className="text-[10px] bg-red-500/15 text-red-600 border-red-500/20">
                          Failed
                        </Badge>
                      )}
                      {item.status === "uploading" && <Loader2 className="w-4 h-4 animate-spin" />}
                      {item.status === "pending" && (
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => removeFromQueue(item.id)}>
                          <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {(doneCount > 0 || failedCount > 0) && (
                <p className="text-xs text-muted-foreground">
                  {doneCount > 0 && <span className="text-green-600">{doneCount} uploaded</span>}
                  {doneCount > 0 && failedCount > 0 && " · "}
                  {failedCount > 0 && <span className="text-red-600">{failedCount} failed</span>}
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Name (all items)</Label>
            <Input value={sharedName} onChange={e => setSharedName(e.target.value)} placeholder="Same name for all clothing" className="rounded-xl" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Description (all items)</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" className="rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Type</Label>
              <select
                value={clothingType}
                onChange={e => setClothingType(e.target.value as "Shirt" | "Pants")}
                className="w-full h-9 rounded-xl border border-input bg-background px-3 text-sm"
              >
                <option value="Shirt">Shirt</option>
                <option value="Pants">Pants</option>
              </select>
            </div>
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

          <Button onClick={handleUploadAll} disabled={uploading || pendingCount === 0} className="w-full rounded-xl gap-2">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? "Uploading..." : `Upload ${pendingCount} item${pendingCount !== 1 ? "s" : ""} to Roblox`}
          </Button>
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
    return localStorage.getItem(`limitedink_tab_${id}`) || "pnl";
  });

  const handleTabChange = (tab: string) => {
    playTabSwitch();
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
    const validTabs = ["pnl", "copy", "catalog", "upload", "alts"];
    if (saved && validTabs.includes(saved)) setActiveTab(saved);
    else setActiveTab("pnl");
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
      <Tabs value={["pnl", "copy", "catalog", "upload", "alts"].includes(activeTab) ? activeTab : "pnl"} onValueChange={handleTabChange} className="w-full">
        <TabsList className="rounded-xl bg-secondary/50 border border-border p-1 h-auto flex-wrap gap-1 w-full">
          <TabsTrigger value="pnl" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-sm px-3 py-2 flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5" /> P&L
          </TabsTrigger>
          <TabsTrigger value="copy" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-sm px-3 py-2 flex items-center gap-1.5">
            <Copy className="w-3.5 h-3.5" /> Copy Clothing
          </TabsTrigger>
          <TabsTrigger value="catalog" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-sm px-3 py-2 flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5" /> Catalog
          </TabsTrigger>
          <TabsTrigger value="upload" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-sm px-3 py-2 flex items-center gap-1.5">
            <Upload className="w-3.5 h-3.5" /> Upload
          </TabsTrigger>
          <TabsTrigger value="alts" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-sm px-3 py-2 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> Alt Accounts
          </TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="pnl" className="mt-0">
            <PnL groupId={String(stats.id)} />
          </TabsContent>
          <TabsContent value="copy" className="mt-0">
            <CopyClothingTab groupId={stats.id} />
          </TabsContent>
          <TabsContent value="catalog" className="mt-0">
            <CatalogSearchTab groupId={stats.id} />
          </TabsContent>
          <TabsContent value="upload" className="mt-0">
            <UploadClothingTab groupId={stats.id} />
          </TabsContent>
          <TabsContent value="alts" className="mt-0">
            <AltAccountsTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
