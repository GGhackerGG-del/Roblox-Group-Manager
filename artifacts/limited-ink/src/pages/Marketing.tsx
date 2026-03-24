import { useState, useEffect, useCallback } from "react";
import { getAuthCredentials } from "@workspace/api-client-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Megaphone, Search, TrendingUp, Bell, Calendar, Loader2, Check, X,
  Plus, Trash2, Copy, RefreshCw, Zap, Star, ChevronUp, ChevronDown,
  AlertTriangle, CheckCircle2, XCircle, Webhook, Send, BarChart2,
  Clock, Tag, ExternalLink, Edit2, ChevronRight, Upload, ImageIcon,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { playClick, playSuccess, playError } from "@/hooks/useSounds";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function authHeaders(): Record<string, string> {
  const { token, fingerprint } = getAuthCredentials();
  const h: Record<string, string> = {};
  if (token) h["Authorization"] = `Bearer ${token}`;
  if (fingerprint) h["X-Device-Fingerprint"] = fingerprint;
  return h;
}

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    credentials: "include", ...opts,
    headers: { ...authHeaders(), ...(opts?.headers ?? {}) },
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({ error: r.statusText })) as { error?: string };
    throw new Error(e.error || `HTTP ${r.status}`);
  }
  return r.json() as Promise<T>;
}

const WATCHLIST_KEY = "limitedink_trend_watchlist";

interface WatchlistItem { id: string; name: string; type: string; addedAt: number }
interface WebhookConfig {
  id: string; name: string; url: string; type: "discord" | "telegram";
  events: string[]; enabled: boolean; addedAt: number; lastTriggered?: number;
  avatarUrl?: string;
}
interface Promotion {
  id: string; title: string; description: string; discountPercent: number;
  startsAt: number; endsAt: number; itemType: string; webhookNotify: boolean;
  status: "scheduled" | "active" | "ended";
}

function timeAgo(ts: number, justNowLabel = "now"): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return justNowLabel;
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? "text-green-600 bg-green-500/10 border-green-500/20"
    : score >= 60 ? "text-amber-600 bg-amber-500/10 border-amber-500/20"
      : "text-red-600 bg-red-500/10 border-red-500/20";
  const label = score >= 80 ? t("mkt.excellent") : score >= 60 ? t("mkt.good") : score >= 40 ? t("mkt.weak") : t("mkt.bad");
  return (
    <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${color}`}>
      <span className="text-2xl font-bold">{score}</span>
      <div>
        <p className="text-xs font-semibold">{label}</p>
        <p className="text-[10px] opacity-70">/100</p>
      </div>
    </div>
  );
}

const VOLUME_COLORS: Record<string, string> = {
  high: "text-green-500", medium: "text-amber-500", low: "text-gray-400",
};
const COMPETITION_COLORS: Record<string, string> = {
  high: "text-red-500", medium: "text-amber-500", low: "text-green-500",
};
const TREND_ICONS: Record<string, React.ReactNode> = {
  rising: <ChevronUp className="w-3.5 h-3.5 text-green-500" />,
  stable: <ChevronRight className="w-3.5 h-3.5 text-blue-400" />,
  declining: <ChevronDown className="w-3.5 h-3.5 text-red-500" />,
};
const MOMENTUM_COLORS: Record<string, string> = {
  rising: "text-green-500 bg-green-500/10 border-green-500/20",
  peak: "text-amber-500 bg-amber-500/10 border-amber-500/20",
  declining: "text-red-500 bg-red-500/10 border-red-500/20",
  niche: "text-blue-500 bg-blue-500/10 border-blue-500/20",
};
const MOMENTUM_LABEL_KEYS: Record<string, string> = {
  rising: "mkt.growing", peak: "mkt.peak", declining: "mkt.falling", niche: "mkt.niche",
};
const STATUS_STYLES: Record<string, string> = {
  active: "text-green-600 bg-green-500/10 border-green-500/20",
  scheduled: "text-blue-600 bg-blue-500/10 border-blue-500/20",
  ended: "text-gray-500 bg-gray-500/10 border-gray-500/20",
};
const STATUS_LABEL_KEYS: Record<string, string> = {
  active: "mkt.active", scheduled: "mkt.scheduled", ended: "mkt.completed",
};

const EVENT_OPTION_KEYS = [
  { value: "sale", labelKey: "mkt.sale" },
  { value: "new_item", labelKey: "mkt.newItem" },
  { value: "promotion_start", labelKey: "mkt.promoStart" },
  { value: "promotion_end", labelKey: "mkt.promoEnd" },
  { value: "trend_alert", labelKey: "mkt.trendAlert" },
];
const TYPE_OPTIONS = ["Shirt", "Pants", "T-Shirt", "Hoodie", "Jacket", "Dress", "Outfit", "All"];

export default function Marketing() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [tab, setTab] = useState("seo");
  const [lang, setLang] = useState("ru");

  const [seoForm, setSeoForm] = useState({ title: "", description: "", type: "Shirt" });
  const [seoResult, setSeoResult] = useState<{
    score: number; titleScore: number; descriptionScore: number;
    issues: Array<{ severity: string; field: string; message: string }>;
    suggestions: Array<{ field: string; current: string; improved: string; reason: string }>;
    optimizedTitle: string; optimizedDescription: string; keywords: string[];
  } | null>(null);
  const [seoLoading, setSeoLoading] = useState(false);

  const [kwCategory, setKwCategory] = useState("Shirts");
  const [kwSub, setKwSub] = useState("");
  const [kwResult, setKwResult] = useState<{
    topKeywords: Array<{ keyword: string; volume: string; competition: string; trend: string }>;
    longTail: Array<{ phrase: string; intent: string; difficulty: string }>;
    seasonal: Array<{ keyword: string; peakMonth: string; boost: string }>;
    competitors: string[];
    insights: string[];
  } | null>(null);
  const [kwLoading, setKwLoading] = useState(false);

  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [newWatchName, setNewWatchName] = useState("");
  const [newWatchType, setNewWatchType] = useState("Shirt");
  const [trendResult, setTrendResult] = useState<{
    analyses: Array<{ name: string; trendScore: number; momentum: string; salesPotential: string; recommendation: string; bestTime: string; tags: string[] }>;
    marketOverview: string;
  } | null>(null);
  const [trendLoading, setTrendLoading] = useState(false);

  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [webhooksLoading, setWebhooksLoading] = useState(false);
  const [newWebhookForm, setNewWebhookForm] = useState({ name: "", url: "", type: "discord", events: ["sale", "new_item"], avatarUrl: "" });
  const [addingWebhook, setAddingWebhook] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [testingWebhookId, setTestingWebhookId] = useState<string | null>(null);
  const [showAddWebhook, setShowAddWebhook] = useState(false);

  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [promoLoading, setPromoLoading] = useState(false);
  const [showAddPromo, setShowAddPromo] = useState(false);
  const [promoForm, setPromoForm] = useState({
    title: "", description: "", discountPercent: "20", itemType: "All",
    startDate: "", startTime: "", endDate: "", endTime: "", webhookNotify: true,
  });
  const [savingPromo, setSavingPromo] = useState(false);

  useEffect(() => {
    try { setWatchlist(JSON.parse(localStorage.getItem(WATCHLIST_KEY) || "[]")); } catch {}
    if (tab === "webhooks") loadWebhooks();
    if (tab === "promotions") loadPromotions();
  }, [tab]);

  const saveWatchlist = (items: WatchlistItem[]) => {
    setWatchlist(items);
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(items));
  };

  const handleError = (e: unknown) => {
    toast({ title: t("common.error"), description: e instanceof Error ? e.message : t("mkt.unknownError"), variant: "destructive" });
    playError();
  };

  const runSeoAnalyze = async () => {
    if (!seoForm.title.trim()) return;
    setSeoLoading(true); setSeoResult(null);
    try {
      const r = await apiFetch<typeof seoResult>("/api/marketing/seo-analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...seoForm, language: lang }),
      });
      setSeoResult(r);
      playSuccess();
    } catch (e) { handleError(e); }
    finally { setSeoLoading(false); }
  };

  const runKwResearch = async () => {
    setKwLoading(true); setKwResult(null);
    try {
      const r = await apiFetch<typeof kwResult>("/api/marketing/keywords/research", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: kwCategory, subcategory: kwSub, language: lang }),
      });
      setKwResult(r);
      playSuccess();
    } catch (e) { handleError(e); }
    finally { setKwLoading(false); }
  };

  const analyzeTrends = async () => {
    if (!watchlist.length) return;
    setTrendLoading(true); setTrendResult(null);
    try {
      const r = await apiFetch<typeof trendResult>("/api/marketing/trends/analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: watchlist.map(w => ({ name: w.name, type: w.type })), language: lang }),
      });
      setTrendResult(r);
      playSuccess();
    } catch (e) { handleError(e); }
    finally { setTrendLoading(false); }
  };

  const loadWebhooks = async () => {
    setWebhooksLoading(true);
    try {
      const { webhooks: whs } = await apiFetch<{ webhooks: WebhookConfig[] }>("/api/marketing/webhooks");
      setWebhooks(whs);
    } catch (e) { handleError(e); }
    finally { setWebhooksLoading(false); }
  };

  const addWebhook = async () => {
    if (!newWebhookForm.name || !newWebhookForm.url) return;
    setAddingWebhook(true);
    try {
      const { webhook } = await apiFetch<{ webhook: WebhookConfig }>("/api/marketing/webhooks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newWebhookForm),
      });
      setWebhooks(p => [...p, webhook]);
      setNewWebhookForm({ name: "", url: "", type: "discord", events: ["sale", "new_item"], avatarUrl: "" });
      setShowAddWebhook(false);
      playSuccess();
      toast({ title: t("mkt.webhookAdded") });
    } catch (e) { handleError(e); }
    finally { setAddingWebhook(false); }
  };

  const testWebhook = async (id: string) => {
    setTestingWebhookId(id);
    try {
      const r = await apiFetch<{ ok: boolean; error?: string }>(`/api/marketing/webhooks/${id}/test`, { method: "POST" });
      if (r.ok) { playSuccess(); toast({ title: t("mkt.testSuccess"), description: t("mkt.notifSent") }); }
      else { playError(); toast({ title: t("common.error"), description: r.error || t("mkt.notifFailed"), variant: "destructive" }); }
      loadWebhooks();
    } catch (e) { handleError(e); }
    finally { setTestingWebhookId(null); }
  };

  const toggleWebhook = async (id: string, enabled: boolean) => {
    try {
      await apiFetch(`/api/marketing/webhooks/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      setWebhooks(p => p.map(w => w.id === id ? { ...w, enabled } : w));
    } catch (e) { handleError(e); }
  };

  const deleteWebhook = async (id: string) => {
    try {
      await apiFetch(`/api/marketing/webhooks/${id}`, { method: "DELETE" });
      setWebhooks(p => p.filter(w => w.id !== id));
      toast({ title: t("mkt.deleted") });
    } catch (e) { handleError(e); }
  };

  const loadPromotions = async () => {
    setPromoLoading(true);
    try {
      const { promotions: promos } = await apiFetch<{ promotions: Promotion[] }>("/api/marketing/promotions");
      setPromotions(promos);
    } catch (e) { handleError(e); }
    finally { setPromoLoading(false); }
  };

  const createPromo = async () => {
    if (!promoForm.title || !promoForm.startDate || !promoForm.endDate) return;
    setSavingPromo(true);
    try {
      const startsAt = new Date(`${promoForm.startDate}T${promoForm.startTime || "00:00"}`).getTime();
      const endsAt = new Date(`${promoForm.endDate}T${promoForm.endTime || "23:59"}`).getTime();
      const { promotion } = await apiFetch<{ promotion: Promotion }>("/api/marketing/promotions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: promoForm.title,
          description: promoForm.description,
          discountPercent: parseInt(promoForm.discountPercent) || 0,
          startsAt, endsAt,
          itemType: promoForm.itemType,
          webhookNotify: promoForm.webhookNotify,
        }),
      });
      setPromotions(p => [promotion, ...p]);
      setPromoForm({ title: "", description: "", discountPercent: "20", itemType: "All", startDate: "", startTime: "", endDate: "", endTime: "", webhookNotify: true });
      setShowAddPromo(false);
      playSuccess();
      toast({ title: t("mkt.promoCreated") });
    } catch (e) { handleError(e); }
    finally { setSavingPromo(false); }
  };

  const deletePromo = async (id: string) => {
    try {
      await apiFetch(`/api/marketing/promotions/${id}`, { method: "DELETE" });
      setPromotions(p => p.filter(pr => pr.id !== id));
    } catch (e) { handleError(e); }
  };

  const firePromotionWebhooks = useCallback(async (promo: Promotion, event: string) => {
    try {
      await apiFetch("/api/marketing/webhooks/fire", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event,
          title: `${event === "promotion_start" ? t("mkt.promoStarted") : t("mkt.promoEnded")}: ${promo.title}`,
          description: `${promo.discountPercent > 0 ? t("mkt.discountOn").replace("{pct}", String(promo.discountPercent)).replace("{type}", promo.itemType) : promo.description}\n\n${formatDate(promo.startsAt)} – ${formatDate(promo.endsAt)}`,
          color: event === "promotion_start" ? 0x57F287 : 0xED4245,
        }),
      });
    } catch {}
  }, []);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    promotions.forEach(promo => {
      if (!promo.webhookNotify) return;
      const startIn = promo.startsAt - Date.now();
      const endIn = promo.endsAt - Date.now();
      if (startIn > 0 && startIn < 24 * 60 * 60 * 1000) {
        timers.push(setTimeout(() => firePromotionWebhooks(promo, "promotion_start"), startIn));
      }
      if (endIn > 0 && endIn < 24 * 60 * 60 * 1000) {
        timers.push(setTimeout(() => firePromotionWebhooks(promo, "promotion_end"), endIn));
      }
    });
    return () => timers.forEach(clearTimeout);
  }, [promotions, firePromotionWebhooks]);

  const tabs = [
    { id: "seo", icon: <Search className="w-3.5 h-3.5" />, label: "SEO Optimizer" },
    { id: "keywords", icon: <BarChart2 className="w-3.5 h-3.5" />, label: "Keyword Research" },
    { id: "trends", icon: <TrendingUp className="w-3.5 h-3.5" />, label: t("mkt.trendWatch") },
    { id: "webhooks", icon: <Bell className="w-3.5 h-3.5" />, label: t("mkt.webhooks") },
    { id: "promotions", icon: <Calendar className="w-3.5 h-3.5" />, label: t("mkt.promotions") },
  ];

  const categoryOptions = ["Shirts", "Pants", "T-Shirts", "Accessories", "Casual", "Streetwear", "Fantasy", "Military", "Anime", "Y2K", "Cottagecore"];

  return (
    <div className="p-4 lg:p-8 w-full max-w-4xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-orange-500 flex items-center justify-center">
            <Megaphone className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("mkt.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("mkt.desc")}</p>
          </div>
        </div>
        <Select value={lang} onValueChange={setLang}>
          <SelectTrigger className="w-32 h-9 rounded-xl text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ru">{t("mkt.ru")}</SelectItem>
            <SelectItem value="en">🇬🇧 English</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs value={tab} onValueChange={v => { playClick(); setTab(v); }}>
        <div className="overflow-x-auto pb-1">
          <TabsList className="rounded-xl bg-secondary/50 border border-border p-1 h-auto gap-1 flex-nowrap inline-flex">
            {tabs.map(tb => (
              <TabsTrigger key={tb.id} value={tb.id} className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-3 py-2 gap-1.5 whitespace-nowrap">
                {tb.icon} {tb.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="seo" className="mt-4 space-y-4">
          <Card className="rounded-2xl border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Search className="w-4 h-4 text-rose-500" /> SEO Optimizer</CardTitle>
              <CardDescription>{t("mkt.seoTitle")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">{t("mkt.currentTitle")}</label>
                <Input placeholder={t("mkt.titlePlaceholder")} value={seoForm.title} onChange={e => setSeoForm(p => ({ ...p, title: e.target.value }))} className="rounded-xl" />
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div className="col-span-3 space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t("mkt.currentDesc")}</label>
                  <Textarea placeholder={t("mkt.descPlaceholder")} value={seoForm.description} onChange={e => setSeoForm(p => ({ ...p, description: e.target.value }))} className="rounded-xl resize-none" rows={3} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t("mkt.type")}</label>
                  <Select value={seoForm.type} onValueChange={v => setSeoForm(p => ({ ...p, type: v }))}>
                    <SelectTrigger className="rounded-xl h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>{TYPE_OPTIONS.filter(o => o !== "All").map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <Button className="w-full rounded-xl gap-2" onClick={runSeoAnalyze} disabled={seoLoading || !seoForm.title.trim()}>
                {seoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {t("mkt.analyzeSeo")}
              </Button>
            </CardContent>
          </Card>

          <AnimatePresence>
            {seoResult && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <Card className="rounded-2xl border-border/50 col-span-1">
                    <CardContent className="pt-4 space-y-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("mkt.overallScore")}</p>
                      <ScoreBadge score={seoResult.score} />
                      <div className="space-y-2">
                        {[{ label: t("mkt.titleLabel"), score: seoResult.titleScore }, { label: t("mkt.descLabel"), score: seoResult.descriptionScore }].map(({ label, score }) => (
                          <div key={label}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-muted-foreground">{label}</span>
                              <span className="font-semibold">{score}/100</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-secondary">
                              <div
                                className={`h-1.5 rounded-full transition-all ${score >= 80 ? "bg-green-500" : score >= 60 ? "bg-amber-500" : "bg-red-500"}`}
                                style={{ width: `${score}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="rounded-2xl border-border/50 col-span-2">
                    <CardContent className="pt-4 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("mkt.issues")} ({seoResult.issues.length})</p>
                      <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                        {seoResult.issues.map((issue, i) => (
                          <div key={i} className={`flex items-start gap-2 rounded-lg p-2 text-xs ${issue.severity === "critical" ? "bg-red-500/5 text-red-700 dark:text-red-400" : issue.severity === "warning" ? "bg-amber-500/5 text-amber-700 dark:text-amber-400" : "bg-blue-500/5 text-blue-700 dark:text-blue-400"}`}>
                            <span className="shrink-0 mt-0.5">{issue.severity === "critical" ? "🔴" : issue.severity === "warning" ? "🟡" : "🔵"}</span>
                            <span>{issue.message}</span>
                            <Badge variant="outline" className="text-[9px] shrink-0 ml-auto">{issue.field}</Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {seoResult.suggestions.length > 0 && (
                  <Card className="rounded-2xl border-amber-500/20 bg-amber-500/5">
                    <CardContent className="pt-4 space-y-3">
                      <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">{t("mkt.suggestions")}</p>
                      {seoResult.suggestions.map((s, i) => (
                        <div key={i} className="rounded-xl border border-border/50 bg-card p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[9px]">{s.field}</Badge>
                            <p className="text-xs text-muted-foreground flex-1">{s.reason}</p>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="rounded-lg bg-red-500/5 p-2">
                              <p className="text-[10px] text-muted-foreground mb-1">{t("mkt.current")}</p>
                              <p className="line-through text-red-600 truncate">{s.current}</p>
                            </div>
                            <div className="rounded-lg bg-green-500/5 p-2">
                              <div className="flex items-start justify-between gap-1">
                                <div>
                                  <p className="text-[10px] text-muted-foreground mb-1">{t("mkt.improved")}</p>
                                  <p className="text-green-600 break-words">{s.improved}</p>
                                </div>
                                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 shrink-0" onClick={() => navigator.clipboard.writeText(s.improved)}>
                                  <Copy className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <Card className="rounded-2xl border-green-500/20 bg-green-500/5">
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-green-600 uppercase tracking-wide">{t("mkt.optimizedTitle")}</p>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => navigator.clipboard.writeText(seoResult.optimizedTitle)}><Copy className="w-3.5 h-3.5" /></Button>
                      </div>
                      <p className="text-sm font-medium">{seoResult.optimizedTitle}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">{seoResult.optimizedTitle.length}/64 {t("mkt.charsCount")}</p>
                    </CardContent>
                  </Card>
                  <Card className="rounded-2xl border-border/50">
                    <CardContent className="pt-4">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t("mkt.keywords")}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {seoResult.keywords.map(kw => (
                          <Badge key={kw} variant="secondary" className="text-xs cursor-pointer" onClick={() => navigator.clipboard.writeText(kw)}>{kw}</Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {seoResult.optimizedDescription && (
                  <Card className="rounded-2xl border-border/50">
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("mkt.optimizedDesc")}</p>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => navigator.clipboard.writeText(seoResult.optimizedDescription)}><Copy className="w-3.5 h-3.5" /></Button>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">{seoResult.optimizedDescription}</p>
                    </CardContent>
                  </Card>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </TabsContent>

        <TabsContent value="keywords" className="mt-4 space-y-4">
          <Card className="rounded-2xl border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><BarChart2 className="w-4 h-4 text-blue-500" /> Keyword Research</CardTitle>
              <CardDescription>{t("mkt.keywordAnalysis")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t("mkt.category")}</label>
                  <Select value={kwCategory} onValueChange={setKwCategory}>
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>{categoryOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t("mkt.subcategory")}</label>
                  <Input placeholder="Anime, Y2K, Military..." value={kwSub} onChange={e => setKwSub(e.target.value)} className="rounded-xl" />
                </div>
              </div>
              <Button className="w-full rounded-xl gap-2 bg-blue-600 hover:bg-blue-700" onClick={runKwResearch} disabled={kwLoading}>
                {kwLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                {t("mkt.researchKeywords")}
              </Button>
            </CardContent>
          </Card>

          <AnimatePresence>
            {kwResult && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                <Card className="rounded-2xl border-border/50">
                  <CardContent className="pt-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">{t("mkt.topKeywords")}</p>
                    <div className="space-y-1.5">
                      {kwResult.topKeywords.map((kw, i) => (
                        <div key={i} className="flex items-center gap-3 rounded-xl border border-border/50 p-2.5 hover:bg-accent/30 cursor-pointer transition-colors" onClick={() => navigator.clipboard.writeText(kw.keyword)}>
                          <span className="text-xs font-bold text-muted-foreground w-5 shrink-0">{i + 1}</span>
                          <div className="flex items-center gap-2 shrink-0">{TREND_ICONS[kw.trend]}</div>
                          <span className="flex-1 text-sm font-medium">{kw.keyword}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-xs font-semibold ${VOLUME_COLORS[kw.volume]}`}>Vol: {kw.volume}</span>
                            <span className="text-muted-foreground/40">|</span>
                            <span className={`text-xs font-semibold ${COMPETITION_COLORS[kw.competition]}`}>Conc: {kw.competition}</span>
                          </div>
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 shrink-0"><Copy className="w-3 h-3" /></Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-2 gap-3">
                  <Card className="rounded-2xl border-violet-500/20 bg-violet-500/5">
                    <CardContent className="pt-4">
                      <div className="flex justify-between items-center mb-2">
                        <p className="text-xs font-semibold text-violet-600 uppercase tracking-wide">{t("mkt.longTail")}</p>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => navigator.clipboard.writeText(kwResult.longTail.map(l => l.phrase).join("\n"))}><Copy className="w-3.5 h-3.5" /></Button>
                      </div>
                      <div className="space-y-2">
                        {kwResult.longTail.map((lt, i) => (
                          <div key={i} className="rounded-lg border border-border/50 bg-card p-2 text-xs">
                            <p className="font-medium">{lt.phrase}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-muted-foreground text-[10px]">{lt.intent}</span>
                              <Badge variant="outline" className={`text-[9px] ml-auto ${lt.difficulty === "easy" ? "border-green-500/30 text-green-600" : lt.difficulty === "hard" ? "border-red-500/30 text-red-600" : "border-amber-500/30 text-amber-600"}`}>{lt.difficulty}</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <div className="space-y-3">
                    <Card className="rounded-2xl border-amber-500/20 bg-amber-500/5">
                      <CardContent className="pt-4">
                        <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {t("mkt.seasonal")}</p>
                        <div className="space-y-1.5">
                          {kwResult.seasonal.map((s, i) => (
                            <div key={i} className="flex items-center justify-between text-xs rounded-lg border border-border/50 bg-card p-2">
                              <span className="font-medium">{s.keyword}</span>
                              <div className="flex items-center gap-1.5 text-muted-foreground text-[10px]">
                                <span>{s.peakMonth}</span>
                                <Badge className="text-[9px] bg-green-500/20 text-green-700 border-0">{s.boost}</Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="rounded-2xl border-border/50">
                      <CardContent className="pt-4">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t("mkt.insights")}</p>
                        <ul className="space-y-1.5">
                          {kwResult.insights.map((insight, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-xs"><span className="text-rose-500 shrink-0">→</span> {insight}</li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </TabsContent>

        <TabsContent value="trends" className="mt-4 space-y-4">
          <Card className="rounded-2xl border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="w-4 h-4 text-green-500" /> Trend Tracker</CardTitle>
              <CardDescription>{t("mkt.trendTracking")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input placeholder={t("mkt.searchTrends")} value={newWatchName} onChange={e => setNewWatchName(e.target.value)} onKeyDown={e => {
                  if (e.key === "Enter" && newWatchName.trim()) {
                    const item: WatchlistItem = { id: Math.random().toString(36).slice(2), name: newWatchName.trim(), type: newWatchType, addedAt: Date.now() };
                    saveWatchlist([...watchlist, item]);
                    setNewWatchName("");
                    setTrendResult(null);
                  }
                }} className="rounded-xl flex-1" />
                <Select value={newWatchType} onValueChange={setNewWatchType}>
                  <SelectTrigger className="w-28 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>{TYPE_OPTIONS.filter(o => o !== "All").map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                </Select>
                <Button variant="outline" className="rounded-xl gap-1" onClick={() => {
                  if (!newWatchName.trim()) return;
                  const item: WatchlistItem = { id: Math.random().toString(36).slice(2), name: newWatchName.trim(), type: newWatchType, addedAt: Date.now() };
                  saveWatchlist([...watchlist, item]);
                  setNewWatchName(""); setTrendResult(null);
                }}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              {watchlist.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {watchlist.map(item => (
                    <div key={item.id} className="flex items-center gap-1.5 rounded-lg border border-border/50 bg-secondary/50 px-2.5 py-1.5 text-xs">
                      <span className="font-medium">{item.name}</span>
                      <Badge variant="outline" className="text-[9px]">{item.type}</Badge>
                      <button className="text-muted-foreground hover:text-red-500 ml-0.5" onClick={() => { saveWatchlist(watchlist.filter(w => w.id !== item.id)); setTrendResult(null); }}>
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <Button className="w-full rounded-xl gap-2 bg-green-600 hover:bg-green-700" onClick={analyzeTrends} disabled={trendLoading || !watchlist.length}>
                {trendLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
                {t("mkt.analyzeTrends")} ({watchlist.length} {t("mkt.items")})
              </Button>

              {watchlist.length === 0 && (
                <p className="text-xs text-center text-muted-foreground py-2">{t("mkt.noWatchlist")}</p>
              )}
            </CardContent>
          </Card>

          <AnimatePresence>
            {trendResult && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                {trendResult.marketOverview && (
                  <Card className="rounded-2xl border-green-500/20 bg-green-500/5">
                    <CardContent className="pt-4">
                      <p className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-2">{t("mkt.marketOverview")}</p>
                      <p className="text-sm">{trendResult.marketOverview}</p>
                    </CardContent>
                  </Card>
                )}
                {trendResult.analyses.map((a, i) => (
                  <Card key={i} className="rounded-2xl border-border/50">
                    <CardContent className="pt-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold">{a.name}</p>
                          <p className="text-xs text-muted-foreground">{watchlist.find(w => w.name === a.name)?.type}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={`text-xs border ${MOMENTUM_COLORS[a.momentum] || "text-gray-500 bg-gray-500/10 border-gray-500/20"}`}>
                            {t(MOMENTUM_LABEL_KEYS[a.momentum]) || a.momentum}
                          </Badge>
                          <div className="text-right">
                            <p className="text-2xl font-bold">{a.trendScore}</p>
                            <p className="text-[10px] text-muted-foreground">/100</p>
                          </div>
                        </div>
                      </div>
                      <div className="h-2 rounded-full bg-secondary">
                        <div className={`h-2 rounded-full ${a.trendScore >= 70 ? "bg-green-500" : a.trendScore >= 40 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${a.trendScore}%` }} />
                      </div>
                      <p className="text-sm text-muted-foreground">{a.recommendation}</p>
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Clock className="w-3.5 h-3.5" /> {a.bestTime}
                        </div>
                        <Badge variant="outline" className={`text-[10px] ${a.salesPotential === "high" ? "border-green-500/30 text-green-600" : a.salesPotential === "low" ? "border-red-500/30 text-red-600" : "border-amber-500/30 text-amber-600"}`}>
                          {t("mkt.potential")}: {a.salesPotential}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {a.tags.map(tag => <Badge key={tag} variant="secondary" className="text-[10px]">#{tag}</Badge>)}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </TabsContent>

        <TabsContent value="webhooks" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold flex items-center gap-2"><Bell className="w-4 h-4 text-violet-500" /> Discord / Telegram Webhooks</h2>
            <Button size="sm" className="rounded-xl gap-1.5" onClick={() => setShowAddWebhook(p => !p)}>
              <Plus className="w-3.5 h-3.5" /> {t("mkt.addWebhook")}
            </Button>
          </div>

          <AnimatePresence>
            {showAddWebhook && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <Card className="rounded-2xl border-violet-500/20 bg-violet-500/5">
                  <CardContent className="pt-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">{t("mkt.webhookName")}</label>
                        <Input placeholder={t("mkt.webhookPlaceholder")} value={newWebhookForm.name} onChange={e => setNewWebhookForm(p => ({ ...p, name: e.target.value }))} className="rounded-xl" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">{t("mkt.webhookType")}</label>
                        <Select value={newWebhookForm.type} onValueChange={v => setNewWebhookForm(p => ({ ...p, type: v }))}>
                          <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="discord">Discord Webhook</SelectItem>
                            <SelectItem value="telegram">Telegram Chat ID</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">
                        {newWebhookForm.type === "discord" ? t("mkt.webhookUrl") : "Telegram Chat ID"}
                      </label>
                      <Input
                        placeholder={newWebhookForm.type === "discord" ? "https://discord.com/api/webhooks/..." : "-100123456789"}
                        value={newWebhookForm.url}
                        onChange={e => setNewWebhookForm(p => ({ ...p, url: e.target.value }))}
                        className="rounded-xl font-mono text-xs"
                      />
                    </div>
                    {newWebhookForm.type === "discord" && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">{t("mkt.webhookAvatar")}</label>
                        <div className="flex items-center gap-3">
                          {newWebhookForm.avatarUrl && (
                            <img src={newWebhookForm.avatarUrl} alt="avatar" className="w-10 h-10 rounded-full object-cover border border-border shrink-0" onError={e => (e.currentTarget.style.display = "none")} />
                          )}
                          <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border/50 cursor-pointer hover:bg-secondary/40 transition-colors text-xs text-muted-foreground shrink-0">
                            {uploadingAvatar ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                            {t("mkt.uploadFile")}
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/gif,image/webp"
                              className="hidden"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                if (file.size > 5 * 1024 * 1024) { toast({ variant: "destructive", title: t("common.error"), description: "Max 5MB" }); return; }
                                setUploadingAvatar(true);
                                try {
                                  const reader = new FileReader();
                                  const dataUrl = await new Promise<string>((resolve, reject) => {
                                    reader.onload = () => resolve(reader.result as string);
                                    reader.onerror = reject;
                                    reader.readAsDataURL(file);
                                  });
                                  const resp = await fetch(`${BASE}/api/marketing/webhook-avatar-upload`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
                                    credentials: "include",
                                    body: JSON.stringify({ data: dataUrl }),
                                  });
                                  if (!resp.ok) throw new Error("Upload failed");
                                  const { url } = await resp.json() as { url: string };
                                  setNewWebhookForm(p => ({ ...p, avatarUrl: url }));
                                } catch (err) {
                                  toast({ variant: "destructive", title: t("common.error"), description: (err as Error).message });
                                } finally { setUploadingAvatar(false); }
                              }}
                            />
                          </label>
                          {newWebhookForm.avatarUrl && (
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500 hover:bg-red-500/10 rounded-lg shrink-0" onClick={() => setNewWebhookForm(p => ({ ...p, avatarUrl: "" }))}>
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">{t("mkt.events")}</label>
                      <div className="flex flex-wrap gap-2">
                        {EVENT_OPTION_KEYS.map(ev => (
                          <button
                            key={ev.value}
                            onClick={() => setNewWebhookForm(p => ({
                              ...p,
                              events: p.events.includes(ev.value) ? p.events.filter(e => e !== ev.value) : [...p.events, ev.value],
                            }))}
                            className={`text-xs rounded-lg px-2.5 py-1.5 border transition-colors ${newWebhookForm.events.includes(ev.value) ? "bg-black text-white border-black" : "border-border/50 text-muted-foreground hover:border-border"}`}
                          >
                            {t(ev.labelKey)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button className="flex-1 rounded-xl gap-1.5" onClick={addWebhook} disabled={addingWebhook || !newWebhookForm.name || !newWebhookForm.url}>
                        {addingWebhook ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        {t("mkt.save")}
                      </Button>
                      <Button variant="ghost" className="rounded-xl" onClick={() => setShowAddWebhook(false)}><X className="w-4 h-4" /></Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {webhooksLoading ? (
            <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-20 rounded-2xl bg-secondary/50 animate-pulse" />)}</div>
          ) : webhooks.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-muted-foreground gap-2">
              <Bell className="w-12 h-12 opacity-20" />
              <p className="text-sm">{t("mkt.noWebhooks")}</p>
              <p className="text-xs">{t("mkt.addWebhookHint")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {webhooks.map(wh => (
                <Card key={wh.id} className="rounded-2xl border-border/50">
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {wh.type === "discord" && wh.avatarUrl ? (
                          <img src={wh.avatarUrl} alt="avatar" className="w-9 h-9 rounded-lg object-cover shrink-0" onError={e => (e.currentTarget.style.display = "none")} />
                        ) : (
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-lg ${wh.type === "discord" ? "bg-indigo-500/10" : "bg-sky-500/10"}`}>
                            {wh.type === "discord" ? "💬" : "✈️"}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-sm">{wh.name}</p>
                            <Badge variant="outline" className="text-[9px]">{wh.type}</Badge>
                            {!wh.enabled && <Badge variant="outline" className="text-[9px] border-red-500/30 text-red-500">{t("mkt.disabled")}</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">{wh.url.slice(0, 60)}...</p>
                          {wh.lastTriggered && <p className="text-[10px] text-muted-foreground mt-0.5">{t("mkt.lastTriggered")}: {timeAgo(wh.lastTriggered, t("mkt.justNow"))}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Switch checked={wh.enabled} onCheckedChange={v => toggleWebhook(wh.id, v)} />
                        <Button size="sm" variant="outline" className="rounded-lg gap-1 h-8 text-xs" onClick={() => testWebhook(wh.id)} disabled={testingWebhookId === wh.id}>
                          {testingWebhookId === wh.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                          {t("mkt.testWebhook")}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500 hover:bg-red-500/10 rounded-lg" onClick={() => deleteWebhook(wh.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {wh.events.map(ev => <Badge key={ev} variant="secondary" className="text-[10px]">{t(EVENT_OPTION_KEYS.find(e => e.value === ev)?.labelKey || "") || ev}</Badge>)}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <Card className="rounded-2xl border-border/50 bg-secondary/30">
            <CardContent className="pt-4 text-xs text-muted-foreground space-y-1.5">
              <p className="font-semibold text-foreground">{t("mkt.webhookGuide")}</p>
              <p>{t("mkt.webhookStep1")}</p>
              <p>{t("mkt.webhookStep2")}</p>
              <p>{t("mkt.webhookStep3")}</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="promotions" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold flex items-center gap-2"><Calendar className="w-4 h-4 text-orange-500" /> Promotion Scheduler</h2>
            <Button size="sm" className="rounded-xl gap-1.5" onClick={() => setShowAddPromo(p => !p)}>
              <Plus className="w-3.5 h-3.5" /> {t("mkt.createPromo")}
            </Button>
          </div>

          <AnimatePresence>
            {showAddPromo && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <Card className="rounded-2xl border-orange-500/20 bg-orange-500/5">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">{t("mkt.createPromo")}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">{t("mkt.promoName")} *</label>
                        <Input placeholder={t("mkt.promoNamePlaceholder")} value={promoForm.title} onChange={e => setPromoForm(p => ({ ...p, title: e.target.value }))} className="rounded-xl" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">{t("mkt.itemTypes")}</label>
                        <Select value={promoForm.itemType} onValueChange={v => setPromoForm(p => ({ ...p, itemType: v }))}>
                          <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                          <SelectContent>{TYPE_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">{t("mkt.promoDesc")}</label>
                      <Textarea placeholder={t("mkt.promoDescPlaceholder")} value={promoForm.description} onChange={e => setPromoForm(p => ({ ...p, description: e.target.value }))} className="rounded-xl resize-none" rows={2} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">{t("mkt.discount")}</label>
                      <Input type="number" min="0" max="100" value={promoForm.discountPercent} onChange={e => setPromoForm(p => ({ ...p, discountPercent: e.target.value }))} className="rounded-xl" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">{t("mkt.startDate")} *</label>
                        <div className="flex gap-2">
                          <Input type="date" value={promoForm.startDate} onChange={e => setPromoForm(p => ({ ...p, startDate: e.target.value }))} className="rounded-xl text-xs flex-1" />
                          <Input type="time" value={promoForm.startTime} onChange={e => setPromoForm(p => ({ ...p, startTime: e.target.value }))} className="rounded-xl text-xs w-24" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">{t("mkt.endDate")} *</label>
                        <div className="flex gap-2">
                          <Input type="date" value={promoForm.endDate} onChange={e => setPromoForm(p => ({ ...p, endDate: e.target.value }))} className="rounded-xl text-xs flex-1" />
                          <Input type="time" value={promoForm.endTime} onChange={e => setPromoForm(p => ({ ...p, endTime: e.target.value }))} className="rounded-xl text-xs w-24" />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-border/50 p-3">
                      <div>
                        <p className="text-sm font-medium">{t("mkt.webhookNotif")}</p>
                        <p className="text-xs text-muted-foreground">{t("mkt.autoNotify")}</p>
                      </div>
                      <Switch checked={promoForm.webhookNotify} onCheckedChange={v => setPromoForm(p => ({ ...p, webhookNotify: v }))} />
                    </div>
                    <div className="flex gap-2">
                      <Button className="flex-1 rounded-xl gap-1.5 bg-orange-600 hover:bg-orange-700" onClick={createPromo} disabled={savingPromo || !promoForm.title || !promoForm.startDate || !promoForm.endDate}>
                        {savingPromo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
                        {t("mkt.createPromoBtn")}
                      </Button>
                      <Button variant="ghost" className="rounded-xl" onClick={() => setShowAddPromo(false)}><X className="w-4 h-4" /></Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {promoLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 rounded-2xl bg-secondary/50 animate-pulse" />)}</div>
          ) : promotions.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-muted-foreground gap-2">
              <Calendar className="w-12 h-12 opacity-20" />
              <p className="text-sm">{t("mkt.noPromos")}</p>
              <p className="text-xs">{t("mkt.createFirstPromo")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {promotions
                .sort((a, b) => (a.status === "active" ? -1 : b.status === "active" ? 1 : a.startsAt - b.startsAt))
                .map(promo => (
                  <Card key={promo.id} className={`rounded-2xl border ${promo.status === "active" ? "border-green-500/30" : "border-border/50"}`}>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold">{promo.title}</p>
                            <Badge className={`text-[10px] border ${STATUS_STYLES[promo.status]}`}>{t(STATUS_LABEL_KEYS[promo.status])}</Badge>
                            {promo.discountPercent > 0 && (
                              <Badge className="text-[10px] bg-orange-500/20 text-orange-700 border-0">-{promo.discountPercent}%</Badge>
                            )}
                            <Badge variant="outline" className="text-[10px]">{promo.itemType}</Badge>
                          </div>
                          {promo.description && <p className="text-xs text-muted-foreground mt-1 truncate">{promo.description}</p>}
                          <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-2">
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatDate(promo.startsAt)}</span>
                            <span>→</span>
                            <span>{formatDate(promo.endsAt)}</span>
                            {promo.webhookNotify && <span className="flex items-center gap-1 text-violet-500"><Bell className="w-3 h-3" /> {t("mkt.notifications")}</span>}
                          </div>
                        </div>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500 hover:bg-red-500/10 rounded-lg shrink-0" onClick={() => deletePromo(promo.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>

                      {promo.status === "active" && (
                        <div className="mt-3">
                          <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                            <span>{t("mkt.progress")}</span>
                            <span>{Math.round(Math.min(100, ((Date.now() - promo.startsAt) / (promo.endsAt - promo.startsAt)) * 100))}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-secondary">
                            <div
                              className="h-1.5 rounded-full bg-green-500 transition-all"
                              style={{ width: `${Math.min(100, ((Date.now() - promo.startsAt) / (promo.endsAt - promo.startsAt)) * 100)}%` }}
                            />
                          </div>
                        </div>
                      )}
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
