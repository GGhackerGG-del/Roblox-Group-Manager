import { useState, useEffect, useRef, useCallback } from "react";
import { getAuthCredentials } from "@workspace/api-client-react";
import { robloxHeadshot } from "@/lib/roblox";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2, Users,
  UserPlus, Trash2, RefreshCw,
  ChevronRight, DollarSign,
  Search, Copy, Upload, Download, FolderDown, Layers, ImageIcon
} from "lucide-react";
import { playClick, playSuccess, playError, playTabSwitch } from "@/hooks/useSounds";
import PnL from "./PnL";


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

interface ClothingItem {
  id: number;
  name: string;
  assetType: string;
  assetTypeId: number;
  price: number | null;
  creatorName?: string;
  thumbnailUrl: string | null;
}

// ─── Catalog Search Tab ──────────────────────────────────────────────────────

function CatalogSearchTab({ groupId }: { groupId: number }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [keyword, setKeyword] = useState("");
  const [subcategory, setSubcategory] = useState("ClassicShirts");
  const [sortType, setSortType] = useState("0");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [creatorId, setCreatorId] = useState(String(groupId));
  const [items, setItems] = useState<ClothingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [copying, setCopying] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const doSearch = async (cursor?: string) => {
    if (!keyword.trim() && !creatorId.trim()) return;
    const isLoadMore = !!cursor;
    if (!isLoadMore) {
      playClick();
      setLoading(true);
      setSelected(new Set());
    } else {
      setLoadingMore(true);
    }
    try {
      const params = new URLSearchParams({ subcategory, sortType });
      if (keyword.trim()) params.set("keyword", keyword.trim());
      if (minPrice) params.set("minPrice", minPrice);
      if (maxPrice) params.set("maxPrice", maxPrice);
      if (creatorId.trim()) params.set("creatorId", creatorId.trim());
      if (cursor) params.set("cursor", cursor);
      const data = await apiFetch<{ items: ClothingItem[]; nextCursor: string | null }>(`/api/clothing/search?${params}`);
      if (isLoadMore) {
        setItems(prev => [...prev, ...(data.items || [])]);
      } else {
        setItems(data.items || []);
        if (!data.items?.length) toast({ title: t("group.noResults"), description: t("group.tryDifferent") });
      }
      setNextCursor(data.nextCursor || null);
    } catch (e: unknown) {
      playError();
      toast({ title: t("group.searchFailed"), description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const search = () => doSearch();
  const loadMore = () => { if (nextCursor) doSearch(nextCursor); };

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  const bulkDownload = async () => {
    if (!selected.size) return;
    playClick();
    setBulkDownloading(true);
    try {
      const resp = await fetch(`${BASE}/api/clothing/bulk-download`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ itemIds: Array.from(selected) }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Download failed" }));
        throw new Error(err.error || "Download failed");
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `clothing_${selected.size}_items.zip`;
      link.click();
      URL.revokeObjectURL(url);
      playSuccess();
      toast({ title: t("group.bulkDownload"), description: `${selected.size} items → ZIP` });
    } catch (e: unknown) {
      playError();
      toast({ title: t("group.downloadFailed"), description: e instanceof Error ? e.message : "Error", variant: "destructive" });
    } finally {
      setBulkDownloading(false);
    }
  };

  const copyItem = async (item: ClothingItem) => {
    playClick();
    setCopying(item.id);
    try {
      const data = await apiFetch<{ b64: string; name: string; clothingType: string }>(`/api/clothing/${item.id}/template`);
      const result = await apiFetch<{ assetId: number; released: boolean; message: string }>(`/api/clothing/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: data.b64,
          name: data.name,
          description: `Copied from ${item.id}`,
          groupId,
          clothingType: data.clothingType,
          price: item.price || 5,
        }),
      });
      playSuccess();
      toast({ title: t("group.copied"), description: result.message });
    } catch (e: unknown) {
      playError();
      toast({ title: t("group.copyFailed"), description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setCopying(null);
    }
  };

  const downloadTemplate = async (item: ClothingItem) => {
    playClick();
    try {
      const data = await apiFetch<{ b64: string; name: string }>(`/api/clothing/${item.id}/template`);
      const link = document.createElement("a");
      link.href = `data:image/png;base64,${data.b64}`;
      link.download = `${data.name.replace(/[^a-z0-9_.-]/gi, "_")}.png`;
      link.click();
      playSuccess();
    } catch (e: unknown) {
      playError();
      toast({ title: t("group.downloadFailed"), description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    }
  };

  return (
    <Card className="rounded-2xl border-border/50 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Search className="w-4 h-4" /> {t("group.catalogSearch")}</CardTitle>
        <CardDescription>{t("group.catalogSearch.desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Input placeholder={t("group.keyword")} value={keyword} onChange={e => setKeyword(e.target.value)} onKeyDown={e => e.key === "Enter" && search()} className="w-48 rounded-xl text-sm" />
          <Select value={subcategory} onValueChange={setSubcategory}>
            <SelectTrigger className="w-36 rounded-xl text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ClassicShirts">{t("group.shirts")}</SelectItem>
              <SelectItem value="ClassicPants">{t("group.pants")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortType} onValueChange={setSortType}>
            <SelectTrigger className="w-40 rounded-xl text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="0">{t("group.relevance")}</SelectItem>
              <SelectItem value="1">{t("group.mostFavourited")}</SelectItem>
              <SelectItem value="2">{t("group.bestselling")}</SelectItem>
              <SelectItem value="5">{t("group.recentlyUpdated")}</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder={`${t("competitors.minPrice")} R$`} value={minPrice} onChange={e => setMinPrice(e.target.value)} className="w-20 rounded-xl text-sm" />
          <Input placeholder={`${t("competitors.maxPrice")} R$`} value={maxPrice} onChange={e => setMaxPrice(e.target.value)} className="w-20 rounded-xl text-sm" />
          <Input placeholder={t("group.groupIdFilter")} value={creatorId} onChange={e => setCreatorId(e.target.value)} className="w-32 rounded-xl text-sm" />
          <Button onClick={search} disabled={loading || (!keyword.trim() && !creatorId.trim())} className="rounded-xl gap-1.5">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {t("group.search")}
          </Button>
        </div>

        {items.length > 0 && (
          <>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{items.length} {t("group.results")}</span>
              {selected.size > 0 && (
                <>
                  <span>· {selected.size} {t("group.selected")}</span>
                  <Button size="sm" variant="outline" className="rounded-lg text-[10px] h-7 gap-1" onClick={bulkDownload} disabled={bulkDownloading}>
                    {bulkDownloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <FolderDown className="w-3 h-3" />}
                    {t("group.download")} {selected.size}
                  </Button>
                  <Button size="sm" variant="ghost" className="rounded-lg text-[10px] h-7" onClick={() => setSelected(new Set())}>{t("group.clear")}</Button>
                </>
              )}
              <Button size="sm" variant="ghost" className="rounded-lg text-[10px] h-7" onClick={() => setSelected(new Set(items.map(i => i.id)))}>{t("group.selectAll")}</Button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {items.map(item => (
                <div key={item.id} className={`rounded-xl border p-2 bg-card hover:bg-accent/30 transition-colors cursor-pointer ${selected.has(item.id) ? "border-primary ring-1 ring-primary/30" : "border-border/50"}`} onClick={() => toggleSelect(item.id)}>
                  {item.thumbnailUrl && <img src={item.thumbnailUrl} alt={item.name} className="w-full aspect-square rounded-lg object-cover mb-2" loading="lazy" />}
                  <p className="text-xs font-medium truncate" title={item.name}>{item.name}</p>
                  <p className="text-[10px] text-muted-foreground">{item.assetType} · {item.price != null ? `${item.price} R$` : t("competitors.offsale")}</p>
                  {item.creatorName && <p className="text-[10px] text-muted-foreground truncate">{item.creatorName}</p>}
                  <div className="flex gap-1 mt-1.5" onClick={e => e.stopPropagation()}>
                    <Button size="sm" variant="outline" className="rounded-lg text-[10px] h-7 flex-1 gap-1" onClick={() => copyItem(item)} disabled={copying === item.id}>
                      {copying === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Copy className="w-3 h-3" />}
                      {t("group.copy")}
                    </Button>
                    <Button size="sm" variant="ghost" className="rounded-lg text-[10px] h-7 px-2" onClick={() => downloadTemplate(item)} title={t("group.template")}>
                      <Download className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            {nextCursor && (
              <Button variant="outline" className="rounded-xl w-full gap-2 mt-3" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                {t("group.loadMore")} ({items.length})
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Upload Clothing Tab ─────────────────────────────────────────────────────

function compositeWithTemplate(clothingB64: string, templateB64: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = 585;
    canvas.height = 559;
    const ctx = canvas.getContext("2d");
    if (!ctx) { reject(new Error("Canvas not supported")); return; }

    const clothingImg = new Image();
    clothingImg.onload = () => {
      ctx.drawImage(clothingImg, 0, 0, 585, 559);

      const templateImg = new Image();
      templateImg.onload = () => {
        ctx.drawImage(templateImg, 0, 0, 585, 559);
        const dataUrl = canvas.toDataURL("image/png");
        resolve(dataUrl.split(",")[1]);
      };
      templateImg.onerror = () => reject(new Error("Failed to load template image"));
      templateImg.src = `data:image/png;base64,${templateB64}`;
    };
    clothingImg.onerror = () => reject(new Error("Failed to load clothing image"));
    clothingImg.src = `data:image/png;base64,${clothingB64}`;
  });
}

function UploadClothingTab({ groupId }: { groupId: number }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [files, setFiles] = useState<Array<{ file: File; preview: string; name: string; type: string; price: number }>>([]);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<Array<{ name: string; success: boolean; assetId?: number; error?: string }>>([]);
  const [bulkDescription, setBulkDescription] = useState("Uploaded via Limited.Ink");
  const [templateFile, setTemplateFile] = useState<{ file: File; preview: string; b64: string } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const templateRef = useRef<HTMLInputElement | null>(null);
  const [altAccounts, setAltAccounts] = useState<AltAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>("main");

  useEffect(() => {
    apiFetch<{ accounts: AltAccount[] }>("/api/roblox/alt")
      .then(d => setAltAccounts(d.accounts || []))
      .catch(() => {});
  }, []);

  const addFiles = (fl: FileList | null) => {
    if (!fl) return;
    const newFiles = Array.from(fl).filter(f => f.type === "image/png").map(f => ({
      file: f,
      preview: URL.createObjectURL(f),
      name: f.name.replace(/\.png$/i, ""),
      type: "Shirt",
      price: 5,
    }));
    if (!newFiles.length) {
      toast({ title: "PNG", variant: "destructive" });
      return;
    }
    setFiles(prev => [...prev, ...newFiles]);
  };

  const removeFile = (idx: number) => {
    setFiles(prev => { URL.revokeObjectURL(prev[idx].preview); return prev.filter((_, i) => i !== idx); });
  };

  const updateFile = (idx: number, field: string, value: string | number) => {
    setFiles(prev => prev.map((f, i) => i === idx ? { ...f, [field]: value } : f));
  };

  const handleTemplate = async (fl: FileList | null) => {
    if (!fl || !fl[0]) return;
    const f = fl[0];
    if (f.type !== "image/png") {
      toast({ title: "PNG", variant: "destructive" });
      return;
    }
    const b64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => { const r = reader.result as string; resolve(r.split(",")[1]); };
      reader.onerror = () => reject(new Error("Failed to read"));
      reader.readAsDataURL(f);
    });
    setTemplateFile({ file: f, preview: URL.createObjectURL(f), b64 });
  };

  const removeTemplate = () => {
    if (templateFile) URL.revokeObjectURL(templateFile.preview);
    setTemplateFile(null);
  };

  const applyBulkName = (prefix: string) => {
    if (!prefix.trim()) return;
    setFiles(prev => prev.map(f => ({ ...f, name: prefix.trim() })));
  };

  const applyBulkType = (type: string) => {
    setFiles(prev => prev.map(f => ({ ...f, type })));
  };

  const applyBulkPrice = (price: number) => {
    setFiles(prev => prev.map(f => ({ ...f, price: Math.max(price, 5) })));
  };

  const uploadAll = async () => {
    if (!files.length) return;
    playClick();
    setUploading(true);
    setResults([]);
    const newResults: typeof results = [];

    for (const f of files) {
      try {
        let b64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => { const r = reader.result as string; resolve(r.split(",")[1]); };
          reader.onerror = () => reject(new Error("Failed to read file"));
          reader.readAsDataURL(f.file);
        });

        if (templateFile) {
          try {
            b64 = await compositeWithTemplate(b64, templateFile.b64);
          } catch (e) {
            console.error("Template composite failed:", e);
          }
        }

        const uploadBody: Record<string, unknown> = {
            imageBase64: b64,
            name: f.name,
            description: bulkDescription,
            groupId,
            clothingType: f.type,
            price: Math.max(f.price, 5),
          };
        if (selectedAccount !== "main") {
          uploadBody.altIndex = parseInt(selectedAccount, 10);
        }
        const data = await apiFetch<{ assetId: number; message: string }>(`/api/clothing/upload`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(uploadBody),
        });
        newResults.push({ name: f.name, success: true, assetId: data.assetId });
      } catch (e: unknown) {
        newResults.push({ name: f.name, success: false, error: e instanceof Error ? e.message : t("group.uploadFailed") });
      }
      setResults([...newResults]);
      await new Promise(r => setTimeout(r, 2000));
    }

    const ok = newResults.filter(r => r.success).length;
    const fail = newResults.filter(r => !r.success).length;
    if (ok > 0) playSuccess();
    if (fail > 0) playError();
    toast({ title: t("group.uploadSuccess"), description: `${ok} ✓ / ${fail} ✗` });
    setUploading(false);
  };

  const [bulkNamePrefix, setBulkNamePrefix] = useState("");
  const [bulkPrice, setBulkPrice] = useState(5);

  return (
    <Card className="rounded-2xl border-border/50 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Upload className="w-4 h-4" /> {t("group.uploadTab")}</CardTitle>
        <CardDescription>{t("group.uploadTab.desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <input ref={fileRef} type="file" accept="image/png" multiple className="hidden" onChange={e => addFiles(e.target.files)} />
            <div
              className="border-2 border-dashed border-border/60 rounded-xl p-6 text-center cursor-pointer hover:bg-accent/20 transition-colors"
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add("bg-accent/30"); }}
              onDragLeave={e => e.currentTarget.classList.remove("bg-accent/30")}
              onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove("bg-accent/30"); addFiles(e.dataTransfer.files); }}
            >
              <FolderDown className="w-7 h-7 mx-auto text-muted-foreground mb-1.5" />
              <p className="text-xs text-muted-foreground">{t("group.uploadTab.desc")}</p>
            </div>
          </div>

          <div>
            <input ref={templateRef} type="file" accept="image/png" className="hidden" onChange={e => handleTemplate(e.target.files)} />
            {templateFile ? (
              <div className="border rounded-xl p-3 bg-card flex items-center gap-3">
                <img src={templateFile.preview} alt="Template" className="w-12 h-12 rounded-lg object-cover shrink-0 border" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium flex items-center gap-1"><Layers className="w-3 h-3" /> {t("group.template")}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{templateFile.file.name}</p>
                </div>
                <Button size="sm" variant="ghost" className="shrink-0 h-7 w-7 p-0" onClick={removeTemplate}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ) : (
              <div
                className="border-2 border-dashed border-primary/30 rounded-xl p-6 text-center cursor-pointer hover:bg-primary/5 transition-colors"
                onClick={() => templateRef.current?.click()}
              >
                <Layers className="w-7 h-7 mx-auto text-primary/50 mb-1.5" />
                <p className="text-xs text-muted-foreground">{t("group.template")}</p>
              </div>
            )}
          </div>
        </div>

        {altAccounts.length > 0 && (
          <div className="rounded-xl border border-border/50 p-3 bg-muted/30 space-y-1.5">
            <Label className="text-xs font-medium">{t("group.uploadAccount")}</Label>
            <Select value={selectedAccount} onValueChange={setSelectedAccount}>
              <SelectTrigger className="rounded-lg text-xs h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="main">
                  <span className="flex items-center gap-2">{t("group.mainAccount")}</span>
                </SelectItem>
                {altAccounts.map(acc => (
                  <SelectItem key={acc.index} value={String(acc.index)}>
                    <span className="flex items-center gap-2">
                      {acc.avatarUrl && <img src={acc.avatarUrl} alt="" className="w-4 h-4 rounded-full inline-block" />}
                      {acc.displayName} (@{acc.name})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {files.length > 0 && (
          <div className="space-y-3">
            <div className="rounded-xl border border-border/50 p-3 bg-muted/30 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">{t("group.bulkName")}</p>
              <div className="flex flex-wrap gap-2 items-end">
                <div className="space-y-0.5">
                  <Label className="text-[10px]">{t("group.uploadName")}</Label>
                  <div className="flex gap-1">
                    <Input value={bulkNamePrefix} onChange={e => setBulkNamePrefix(e.target.value)} placeholder={t("group.uploadName")} className="w-28 rounded-lg text-xs h-7" />
                    <Button size="sm" variant="outline" className="h-7 text-[10px] rounded-lg" onClick={() => applyBulkName(bulkNamePrefix)}>{t("group.apply")}</Button>
                  </div>
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[10px]">{t("group.uploadType")}</Label>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="h-7 text-[10px] rounded-lg" onClick={() => applyBulkType("Shirt")}>{t("group.shirts")}</Button>
                    <Button size="sm" variant="outline" className="h-7 text-[10px] rounded-lg" onClick={() => applyBulkType("Pants")}>{t("group.pants")}</Button>
                  </div>
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[10px]">{t("group.uploadPrice")}</Label>
                  <div className="flex gap-1">
                    <Input type="number" min={5} value={bulkPrice} onChange={e => setBulkPrice(parseInt(e.target.value) || 5)} className="w-16 rounded-lg text-[10px] h-7" />
                    <Button size="sm" variant="outline" className="h-7 text-[10px] rounded-lg" onClick={() => applyBulkPrice(bulkPrice)}>{t("group.apply")}</Button>
                  </div>
                </div>
              </div>
              <div className="space-y-0.5">
                <Label className="text-[10px]">{t("group.uploadDesc")}</Label>
                <Input value={bulkDescription} onChange={e => setBulkDescription(e.target.value)} className="rounded-lg text-xs h-7" placeholder={t("group.uploadDesc")} />
              </div>
            </div>

            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border border-border/50 p-2 bg-card">
                <div className="relative shrink-0">
                  <img src={f.preview} alt="" className="w-14 h-14 rounded-lg object-cover" />
                  {templateFile && (
                    <div className="absolute -top-1 -right-1 bg-primary text-primary-foreground rounded-full w-4 h-4 flex items-center justify-center">
                      <Layers className="w-2.5 h-2.5" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <Input value={f.name} onChange={e => updateFile(i, "name", e.target.value)} className="rounded-lg text-xs h-7" placeholder={t("group.uploadName")} />
                  <div className="flex gap-2">
                    <Select value={f.type} onValueChange={v => updateFile(i, "type", v)}>
                      <SelectTrigger className="w-24 rounded-lg text-[10px] h-7"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Shirt">{t("group.shirts")}</SelectItem>
                        <SelectItem value="Pants">{t("group.pants")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input type="number" min={5} value={f.price} onChange={e => updateFile(i, "price", parseInt(e.target.value) || 5)} className="w-20 rounded-lg text-[10px] h-7" placeholder={t("group.uploadPrice")} />
                    <span className="text-[10px] text-muted-foreground self-center">R$</span>
                  </div>
                </div>
                <Button size="sm" variant="ghost" className="shrink-0 h-7 w-7 p-0" onClick={() => removeFile(i)} disabled={uploading}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}

            <Button onClick={uploadAll} disabled={uploading || !files.length} className="rounded-xl w-full gap-2">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {t("group.uploadBtn")} {files.length}{templateFile ? ` + ${t("group.template")}` : ""}
            </Button>
          </div>
        )}

        {results.length > 0 && (
          <div className="space-y-1">
            {results.map((r, i) => (
              <div key={i} className={`text-xs px-3 py-1.5 rounded-lg ${r.success ? "bg-green-500/10 text-green-700 dark:text-green-300" : "bg-red-500/10 text-red-700 dark:text-red-300"}`}>
                {r.success ? `✓ ${r.name} → ID ${r.assetId}` : `✗ ${r.name}: ${r.error}`}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Group Clothing Tab ──────────────────────────────────────────────────────

function GroupClothingTab({ groupId }: { groupId: number }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [items, setItems] = useState<ClothingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState<number | null>(null);
  const [searchFilter, setSearchFilter] = useState("");
  const [total, setTotal] = useState(0);
  const [visibleCount, setVisibleCount] = useState(60);

  const load = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const params = q ? `?search=${encodeURIComponent(q)}` : "";
      const data = await apiFetch<{ items: ClothingItem[]; total: number }>(`/api/clothing/group/${groupId}/items${params}`);
      setItems(data.items || []);
      setTotal(data.total || data.items?.length || 0);
    } catch {
      toast({ title: t("group.failedLoad"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [groupId, toast, t]);

  useEffect(() => { load(); }, [load]);

  const downloadTemplate = async (item: ClothingItem) => {
    playClick();
    setDownloading(item.id);
    try {
      const data = await apiFetch<{ b64: string; name: string }>(`/api/clothing/${item.id}/template`);
      const link = document.createElement("a");
      link.href = `data:image/png;base64,${data.b64}`;
      link.download = `${data.name.replace(/[^a-z0-9_.-]/gi, "_")}.png`;
      link.click();
      playSuccess();
    } catch (e: unknown) {
      playError();
      toast({ title: t("group.downloadFailed"), description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setDownloading(null);
    }
  };

  return (
    <Card className="rounded-2xl border-border/50 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base flex items-center gap-2"><FolderDown className="w-4 h-4" /> {t("group.clothingTab")}</CardTitle>
          <CardDescription>{t("group.clothingTab.desc")} {total > 0 && `(${total})`}</CardDescription>
        </div>
        <Button size="sm" variant="outline" className="rounded-xl gap-1.5" onClick={() => load(searchFilter || undefined)} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> {t("group.refreshAlts")}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 mb-4">
          <Input placeholder={t("group.keyword")} value={searchFilter} onChange={e => setSearchFilter(e.target.value)} onKeyDown={e => e.key === "Enter" && load(searchFilter || undefined)} className="rounded-xl text-sm" />
          <Button size="sm" variant="outline" className="rounded-xl gap-1.5" onClick={() => load(searchFilter || undefined)} disabled={loading}>
            <Search className="w-3.5 h-3.5" /> {t("group.search")}
          </Button>
          {searchFilter && <Button size="sm" variant="ghost" className="rounded-xl" onClick={() => { setSearchFilter(""); load(); }}>{t("group.clear")}</Button>}
        </div>
        {loading && !items.length ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
            {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-xl" />)}
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">{t("group.noResults")}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {items.slice(0, visibleCount).map(item => (
                <div key={item.id} className="rounded-xl border border-border/50 p-2 bg-card hover:bg-accent/30 transition-colors">
                  {item.thumbnailUrl && <img src={item.thumbnailUrl} alt={item.name} className="w-full aspect-square rounded-lg object-cover mb-2" loading="lazy" />}
                  <p className="text-xs font-medium truncate" title={item.name}>{item.name}</p>
                  <p className="text-[10px] text-muted-foreground">{item.assetType} · {item.price != null ? `${item.price} R$` : t("competitors.offsale")}</p>
                  <Button size="sm" variant="outline" className="rounded-lg text-[10px] h-7 w-full mt-1.5 gap-1" onClick={() => downloadTemplate(item)} disabled={downloading === item.id}>
                    {downloading === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                    {t("group.template")}
                  </Button>
                </div>
              ))}
            </div>
            {visibleCount < items.length && (
              <Button variant="outline" className="rounded-xl w-full gap-2 mt-3" onClick={() => setVisibleCount(prev => prev + 60)}>
                <ChevronRight className="w-4 h-4" />
                {t("group.loadMore")} ({Math.min(visibleCount, items.length)} / {items.length})
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Alt Accounts Tab ─────────────────────────────────────────────────────────

function AltAccountsTab() {
  const { t } = useLanguage();
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
      toast({ title: t("group.addAlt"), description: `@${data.name}` });
    } catch (err) {
      toast({ variant: "destructive", title: t("group.uploadFailed"), description: err instanceof Error ? err.message : "" });
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (alt: AltAccount) => {
    setRemoving(alt.index);
    try {
      await apiFetch(`/api/roblox/alt/${alt.index}`, { method: "DELETE" });
      setAlts(prev => prev.filter(a => a.userId !== alt.userId).map((a, i) => ({ ...a, index: i })));
      toast({ title: t("group.removeAlt"), description: `@${alt.name}` });
    } catch {
      toast({ variant: "destructive", title: t("group.uploadFailed") });
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="space-y-5">
      <Card className="rounded-2xl border border-border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2"><UserPlus className="w-5 h-5" /> {t("group.addAlt")}</CardTitle>
          <CardDescription>{t("group.altsTab.desc")}</CardDescription>
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
            {adding ? "..." : t("group.addAlt")}
          </Button>
          <p className="text-xs text-muted-foreground">
            {t("roblox.security")}
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
          <p className="font-medium">{t("group.noResults")}</p>
          <p className="text-sm mt-1">{t("group.altsTab.desc")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {alts.map(alt => (
            <Card key={alt.userId} className="rounded-2xl border border-border shadow-sm">
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Avatar className="w-12 h-12 border border-border">
                    <AvatarImage src={alt.avatarUrl || robloxHeadshot(alt.userId)} />
                    <AvatarFallback className="font-bold">{alt.displayName.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-bold">{alt.displayName}</p>
                    <p className="text-xs text-muted-foreground">@{alt.name} · ID: {alt.userId}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="text-xs bg-green-500/15 text-green-600 border-green-500/20">{t("license.active")}</Badge>
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
  const { t } = useLanguage();
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
    const validTabs = ["pnl", "catalog", "clothing", "upload", "alts"];
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
    return <div className="p-12 text-center text-muted-foreground">{t("group.failedLoad") || "Failed to load group stats."}</div>;
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
            ID: {stats.id} · {stats.memberCount.toLocaleString()} {t("group.members")}
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
      <Tabs value={["pnl", "catalog", "clothing", "upload", "alts"].includes(activeTab) ? activeTab : "pnl"} onValueChange={handleTabChange} className="w-full">
        <TabsList className="rounded-xl bg-secondary/50 border border-border p-1 h-auto flex-wrap gap-1 w-full">
          <TabsTrigger value="pnl" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-sm px-3 py-2 flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5" /> {t("group.pnl")}
          </TabsTrigger>
          <TabsTrigger value="catalog" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-sm px-3 py-2 flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5" /> {t("group.catalog")}
          </TabsTrigger>
          <TabsTrigger value="clothing" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-sm px-3 py-2 flex items-center gap-1.5">
            <FolderDown className="w-3.5 h-3.5" /> {t("group.clothing")}
          </TabsTrigger>
          <TabsTrigger value="upload" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-sm px-3 py-2 flex items-center gap-1.5">
            <Upload className="w-3.5 h-3.5" /> {t("group.upload")}
          </TabsTrigger>
          <TabsTrigger value="alts" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-sm px-3 py-2 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> {t("group.alts")}
          </TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="pnl" className="mt-0 data-[state=inactive]:hidden" forceMount>
            <PnL groupId={String(stats.id)} />
          </TabsContent>
          <TabsContent value="catalog" className="mt-0 data-[state=inactive]:hidden" forceMount>
            <CatalogSearchTab groupId={stats.id} />
          </TabsContent>
          <TabsContent value="clothing" className="mt-0 data-[state=inactive]:hidden" forceMount>
            <GroupClothingTab groupId={stats.id} />
          </TabsContent>
          <TabsContent value="upload" className="mt-0 data-[state=inactive]:hidden" forceMount>
            <UploadClothingTab groupId={stats.id} />
          </TabsContent>
          <TabsContent value="alts" className="mt-0 data-[state=inactive]:hidden" forceMount>
            <AltAccountsTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
