import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useGetRobloxGroups } from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Share2, LayoutDashboard, Link2, Plus, Trash2, Pencil, Check, X, Loader2,
  RefreshCw, ExternalLink, ChevronUp, ChevronDown,
  Activity, Globe, AlertTriangle, CheckCircle2, Image as ImageIcon,
  Megaphone, Zap, Radio, Eye
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch<T = any>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { "Content-Type": "application/json", ...opts?.headers },
    credentials: "include", ...opts,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({ error: "Error" }));
    throw new Error(e.error || "Request failed");
  }
  return res.json();
}

function timeAgo(ts: number) {
  const d = Date.now() - ts;
  const m = Math.floor(d / 60000);
  if (m < 1) return "только что";
  if (m < 60) return `${m}м назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}ч назад`;
  return `${Math.floor(h / 24)}д назад`;
}

// ── AutoPostTab ───────────────────────────────────────────────────────────────
function AutoPostTab({ groups }: { groups: any[] }) {
  const { toast } = useToast();
  const [config, setConfig] = useState<any>({ enabled: false, webhookId: "", groupId: "", template: "🆕 Новый товар: **{name}**\n💰 Цена: {price} Robux\n🔗 {link}", color: 5793266 });
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ config: c }, { history: h }, dash] = await Promise.all([
        apiFetch<{ config: any }>("/api/social-media/auto-post/config"),
        apiFetch<{ history: any[] }>("/api/social-media/auto-post/history"),
        apiFetch<{ webhooks: any[] }>("/api/social-media/dashboard"),
      ]);
      setConfig(c);
      setHistory(h);
      setWebhooks(dash.webhooks?.filter((w: any) => w.type === "discord") || []);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch("/api/social-media/auto-post/config", { method: "POST", body: JSON.stringify(config) });
      toast({ title: "✅ Конфигурация сохранена" });
    } catch (e) { toast({ variant: "destructive", title: "Ошибка", description: e instanceof Error ? e.message : "" }); }
    finally { setSaving(false); }
  };

  const check = async () => {
    setChecking(true);
    try {
      const { posted, newItemsFound, message } = await apiFetch<any>("/api/social-media/auto-post/check", { method: "POST" });
      if (posted > 0) {
        toast({ title: `✅ Опубликовано ${posted} товаров в Discord!` });
        load();
      } else {
        toast({ title: "ℹ️ Нет новых товаров", description: message });
      }
    } catch (e) { toast({ variant: "destructive", title: "Ошибка", description: e instanceof Error ? e.message : "" }); }
    finally { setChecking(false); }
  };

  const clearHistory = async () => {
    await apiFetch("/api/social-media/auto-post/history", { method: "DELETE" });
    setHistory([]);
    toast({ title: "✅ История очищена" });
  };

  const TEMPLATE_VARS = ["{name}", "{price}", "{link}"];
  const DISCORD_COLORS = [
    { label: "Синий", value: 5793266 }, { label: "Зелёный", value: 5763719 },
    { label: "Красный", value: 15548997 }, { label: "Золотой", value: 16776960 },
    { label: "Фиолетовый", value: 10181046 }, { label: "Чёрный", value: 2303786 },
  ];

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-5">
      {/* Config card */}
      <Card className="rounded-2xl border-border/50">
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold">Авто-публикация в Discord</p>
              <p className="text-xs text-muted-foreground mt-0.5">Автоматически постить новые товары группы в Discord</p>
            </div>
            <div className="flex items-center gap-2">
              {config.enabled && <span className="flex items-center gap-1.5 text-xs text-green-600"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> Активно</span>}
              <Switch checked={config.enabled} onCheckedChange={v => setConfig((p: any) => ({ ...p, enabled: v }))} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Discord Webhook</Label>
              {webhooks.length === 0 ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700">
                  Нет Discord webhooks. Создайте их в разделе Маркетинг → Webhooks.
                </div>
              ) : (
                <Select value={config.webhookId} onValueChange={v => setConfig((p: any) => ({ ...p, webhookId: v }))}>
                  <SelectTrigger className="rounded-xl h-9 text-sm"><SelectValue placeholder="Выбрать webhook..." /></SelectTrigger>
                  <SelectContent>{webhooks.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Roblox Группа</Label>
              <Select value={config.groupId} onValueChange={v => setConfig((p: any) => ({ ...p, groupId: v }))}>
                <SelectTrigger className="rounded-xl h-9 text-sm"><SelectValue placeholder="Выбрать группу..." /></SelectTrigger>
                <SelectContent>{(groups || []).map((g: any) => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Шаблон сообщения</Label>
              <div className="flex gap-1">
                {TEMPLATE_VARS.map(v => <button key={v} onClick={() => setConfig((p: any) => ({ ...p, template: (p.template || "") + v }))} className="text-[10px] font-mono bg-secondary px-1.5 py-0.5 rounded hover:bg-secondary/80 transition-colors">{v}</button>)}
              </div>
            </div>
            <Textarea value={config.template} onChange={e => setConfig((p: any) => ({ ...p, template: e.target.value }))} className="rounded-xl resize-none text-sm" rows={3} placeholder="Шаблон Discord-сообщения..." />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Цвет embed</Label>
            <div className="flex gap-2 flex-wrap">
              {DISCORD_COLORS.map(c => (
                <button key={c.value} onClick={() => setConfig((p: any) => ({ ...p, color: c.value }))}
                  className={`flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-1.5 border transition-colors ${config.color === c.value ? "border-black bg-secondary" : "border-border text-muted-foreground"}`}>
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: `#${c.value.toString(16).padStart(6, "0")}` }} />
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button className="rounded-xl gap-1.5" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Сохранить
            </Button>
            <Button variant="outline" className="rounded-xl gap-1.5" onClick={check} disabled={checking || !config.enabled || !config.webhookId || !config.groupId}>
              {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} Проверить сейчас
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Discord embed preview */}
      <Card className="rounded-2xl border-border/50 bg-[#313338]">
        <CardContent className="pt-4">
          <p className="text-xs text-[#949ba4] mb-2">Предпросмотр Discord embed</p>
          <div className="rounded-sm overflow-hidden border-l-4" style={{ borderColor: `#${(config.color || 5793266).toString(16).padStart(6, "0")}` }}>
            <div className="bg-[#2b2d31] px-3 py-2.5">
              <p className="text-[#00b0f4] font-semibold text-sm">🆕 Название товара</p>
              <p className="text-[#dbdee1] text-xs mt-1 whitespace-pre-line">
                {(config.template || "")
                  .replace("{name}", "Summer T-Shirt")
                  .replace("{price}", "25")
                  .replace("{link}", "https://roblox.com/catalog/...")}
              </p>
              <div className="flex flex-wrap gap-3 mt-2">
                <div><p className="text-[#949ba4] text-[10px] font-bold uppercase">Цена</p><p className="text-[#dbdee1] text-xs">25 R$</p></div>
              </div>
              <p className="text-[#4e5058] text-[10px] mt-2">Limited.Ink Auto Post • сегодня в 12:00</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* History */}
      {history.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">История постов ({history.length})</p>
            <Button variant="ghost" size="sm" className="rounded-xl text-xs h-7 gap-1" onClick={clearHistory}><Trash2 className="w-3 h-3" /> Очистить</Button>
          </div>
          {history.slice(0, 10).map(h => (
            <div key={h.id} className="flex items-center gap-3 rounded-xl border border-border/50 p-3">
              {h.thumbnailUrl ? <img src={h.thumbnailUrl} className="w-10 h-10 rounded-xl object-cover shrink-0" alt="" /> : <div className="w-10 h-10 rounded-xl bg-secondary shrink-0 flex items-center justify-center"><ImageIcon className="w-4 h-4 text-muted-foreground/50" /></div>}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{h.itemName}</p>
                <p className="text-xs text-muted-foreground">{h.webhookName} • {timeAgo(h.postedAt)}</p>
              </div>
              <Badge className={`text-[10px] shrink-0 ${h.success ? "bg-green-500/15 text-green-700 border-green-500/30" : "bg-red-500/15 text-red-700 border-red-500/30"}`}>
                {h.success ? "✓ OK" : "✗ Fail"}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── SocialDashboard ───────────────────────────────────────────────────────────
const PLATFORM_META: Record<string, { icon: string; label: string; color: string }> = {
  discord: { icon: "💬", label: "Discord", color: "#5865F2" },
  twitter: { icon: "🐦", label: "Twitter / X", color: "#1DA1F2" },
  tiktok: { icon: "🎵", label: "TikTok", color: "#000000" },
  youtube: { icon: "▶️", label: "YouTube", color: "#FF0000" },
  instagram: { icon: "📸", label: "Instagram", color: "#E1306C" },
  telegram: { icon: "✈️", label: "Telegram", color: "#0088cc" },
  vk: { icon: "💙", label: "ВКонтакте", color: "#2787F5" },
  twitch: { icon: "🎮", label: "Twitch", color: "#9146FF" },
  other: { icon: "🌐", label: "Другое", color: "#666666" },
};
const PLATFORMS = Object.keys(PLATFORM_META);

function SocialDashboard() {
  const { toast } = useToast();
  const [dash, setDash] = useState<any>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ platform: "discord", handle: "", url: "", followers: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, { accounts: a }] = await Promise.all([
        apiFetch<any>("/api/social-media/dashboard"),
        apiFetch<{ accounts: any[] }>("/api/social-media/accounts"),
      ]);
      setDash(d); setAccounts(a);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addAccount = async () => {
    if (!form.platform || !form.handle) return;
    setSaving(true);
    try {
      const { account } = await apiFetch<{ account: any }>("/api/social-media/accounts", {
        method: "POST", body: JSON.stringify({ ...form, followers: form.followers ? parseInt(form.followers) : null }),
      });
      setAccounts(p => [...p.filter(a => a.platform !== account.platform), account]);
      setShowAdd(false); setForm({ platform: "discord", handle: "", url: "", followers: "" });
      toast({ title: "✅ Аккаунт добавлен" });
    } catch (e) { toast({ variant: "destructive", title: "Ошибка", description: e instanceof Error ? e.message : "" }); }
    finally { setSaving(false); }
  };

  const deleteAccount = async (id: string) => {
    await apiFetch(`/api/social-media/accounts/${id}`, { method: "DELETE" });
    setAccounts(p => p.filter(a => a.id !== id));
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-5">
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Webhooks", value: `${dash?.webhooksEnabled || 0}/${dash?.webhooksTotal || 0}`, icon: <Radio className="w-4 h-4" />, color: "text-blue-600" },
          { label: "Авто-пост", value: dash?.autoPostEnabled ? "Включён" : "Выключен", icon: <Zap className="w-4 h-4" />, color: dash?.autoPostEnabled ? "text-green-600" : "text-muted-foreground" },
          { label: "Постов сегодня", value: dash?.postsToday || 0, icon: <Megaphone className="w-4 h-4" />, color: "text-indigo-600" },
          { label: "Всего постов", value: dash?.postsTotal || 0, icon: <Activity className="w-4 h-4" />, color: "text-foreground" },
        ].map(s => (
          <Card key={s.label} className="rounded-2xl border-border/50">
            <CardContent className="pt-4 pb-3">
              <div className={`${s.color} mb-1`}>{s.icon}</div>
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Webhook health */}
      {dash?.webhooks?.length > 0 && (
        <Card className="rounded-2xl border-border/50">
          <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm font-semibold text-muted-foreground">Webhook статус</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {dash.webhooks.map((w: any) => (
              <div key={w.id} className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full shrink-0 ${w.enabled ? "bg-green-500" : "bg-gray-300"}`} />
                <span className="text-sm flex-1">{w.name}</span>
                <Badge variant="outline" className="text-[10px]">{w.type}</Badge>
                {w.lastTriggered ? <span className="text-[10px] text-muted-foreground">{timeAgo(w.lastTriggered)}</span> : <span className="text-[10px] text-muted-foreground/40">Не использовался</span>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Social accounts */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Социальные сети группы</p>
          <Button size="sm" className="rounded-xl gap-1.5" onClick={() => setShowAdd(p => !p)}><Plus className="w-3.5 h-3.5" /> Добавить</Button>
        </div>

        <AnimatePresence>
          {showAdd && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <Card className="rounded-2xl border-indigo-500/20 bg-indigo-500/5">
                <CardContent className="pt-4 space-y-3">
                  <Select value={form.platform} onValueChange={v => setForm(p => ({ ...p, platform: v }))}>
                    <SelectTrigger className="rounded-xl h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>{PLATFORMS.map(p => <SelectItem key={p} value={p}>{PLATFORM_META[p].icon} {PLATFORM_META[p].label}</SelectItem>)}</SelectContent>
                  </Select>
                  <div className="grid grid-cols-2 gap-2">
                    <Input placeholder="@handle или название" value={form.handle} onChange={e => setForm(p => ({ ...p, handle: e.target.value }))} className="rounded-xl" />
                    <Input type="number" placeholder="Подписчики (необяз.)" value={form.followers} onChange={e => setForm(p => ({ ...p, followers: e.target.value }))} className="rounded-xl" />
                  </div>
                  <Input placeholder="URL ссылка (необяз.)" value={form.url} onChange={e => setForm(p => ({ ...p, url: e.target.value }))} className="rounded-xl" />
                  <div className="flex gap-2">
                    <Button className="flex-1 rounded-xl" onClick={addAccount} disabled={saving || !form.handle}>
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Добавить
                    </Button>
                    <Button variant="ghost" className="rounded-xl" onClick={() => setShowAdd(false)}><X className="w-4 h-4" /></Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {accounts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground"><Globe className="w-10 h-10 mx-auto mb-2 opacity-20" /><p className="text-sm">Добавьте аккаунты соцсетей группы</p></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {accounts.map(acc => {
              const meta = PLATFORM_META[acc.platform] || PLATFORM_META.other;
              return (
                <Card key={acc.id} className="rounded-2xl border-border/50 hover:border-black/20 transition-colors">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ background: `${meta.color}15` }}>{meta.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm">{meta.label}</p>
                        {acc.followers && <Badge variant="outline" className="text-[9px]">{acc.followers >= 1000 ? `${(acc.followers / 1000).toFixed(1)}K` : acc.followers} подп.</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{acc.handle}</p>
                    </div>
                    {acc.url && <a href={acc.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground transition-colors shrink-0"><ExternalLink className="w-3.5 h-3.5" /></a>}
                    <button onClick={() => deleteAccount(acc.id)} className="text-muted-foreground hover:text-red-500 transition-colors shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent auto-posts */}
      {dash?.recentPosts?.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-muted-foreground">Последние автопосты</p>
          {dash.recentPosts.map((h: any) => (
            <div key={h.id} className="flex items-center gap-3 rounded-xl border border-border/50 p-3">
              {h.thumbnailUrl ? <img src={h.thumbnailUrl} className="w-8 h-8 rounded-lg object-cover shrink-0" alt="" /> : <div className="w-8 h-8 rounded-lg bg-secondary shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{h.itemName}</p>
                <p className="text-xs text-muted-foreground">{h.webhookName} • {timeAgo(h.postedAt)}</p>
              </div>
              {h.success ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── LinkHub ───────────────────────────────────────────────────────────────────
const LINK_COLORS = ["#000000", "#5865F2", "#1DA1F2", "#FF0000", "#E1306C", "#25D366", "#2787F5", "#FF6B35", "#8B5CF6"];

function LinkHubTab() {
  const { toast } = useToast();
  const [links, setLinks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", url: "", icon: "🔗", description: "", color: "#000000" });
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { links: l } = await apiFetch<{ links: any[] }>("/api/social-media/links");
      setLinks(l);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveLink = async () => {
    if (!form.title || !form.url) return;
    setSaving(true);
    try {
      if (editId) {
        await apiFetch(`/api/social-media/links/${editId}`, { method: "PATCH", body: JSON.stringify(form) });
        setLinks(p => p.map(l => l.id === editId ? { ...l, ...form } : l));
        setEditId(null);
      } else {
        const { link } = await apiFetch<{ link: any }>("/api/social-media/links", { method: "POST", body: JSON.stringify(form) });
        setLinks(p => [...p, link]);
        setShowAdd(false);
      }
      setForm({ title: "", url: "", icon: "🔗", description: "", color: "#000000" });
      toast({ title: "✅ Ссылка сохранена" });
    } catch (e) { toast({ variant: "destructive", title: "Ошибка", description: e instanceof Error ? e.message : "" }); }
    finally { setSaving(false); }
  };

  const deleteLink = async (id: string) => {
    await apiFetch(`/api/social-media/links/${id}`, { method: "DELETE" });
    setLinks(p => p.filter(l => l.id !== id));
  };

  const move = async (id: string, direction: "up" | "down") => {
    const idx = links.findIndex(l => l.id === id);
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === links.length - 1) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    const newLinks = [...links];
    [newLinks[idx], newLinks[swapIdx]] = [newLinks[swapIdx], newLinks[idx]];
    setLinks(newLinks);
    await apiFetch("/api/social-media/links/reorder", { method: "POST", body: JSON.stringify({ ids: newLinks.map(l => l.id) }) });
  };

  const startEdit = (link: any) => {
    setEditId(link.id);
    setForm({ title: link.title, url: link.url, icon: link.icon, description: link.description, color: link.color });
    setShowAdd(false);
  };

  const COMMON_ICONS = ["🔗", "💬", "🎵", "📸", "▶️", "✈️", "🌐", "🎮", "🛒", "📢", "💙", "⭐", "🔔", "📞", "💎"];

  const LinkCard = ({ link, preview }: { link: any; preview?: boolean }) => (
    <div className={`flex items-center gap-3 rounded-xl border p-3.5 transition-colors ${preview ? "border-border/30 bg-white" : "border-border/50"}`}
      style={{ borderLeftColor: link.color || "#000", borderLeftWidth: "3px" }}>
      <span className="text-xl shrink-0">{link.icon || "🔗"}</span>
      <div className="flex-1 min-w-0">
        <p className={`font-semibold text-sm ${preview ? "text-gray-900" : ""}`}>{link.title}</p>
        {link.description && <p className={`text-xs mt-0.5 truncate ${preview ? "text-gray-500" : "text-muted-foreground"}`}>{link.description}</p>}
      </div>
      {preview ? (
        <ExternalLink className="w-4 h-4 text-gray-400 shrink-0" />
      ) : (
        <div className="flex items-center gap-1 shrink-0">
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-lg" onClick={() => move(link.id, "up")}><ChevronUp className="w-3.5 h-3.5" /></Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-lg" onClick={() => move(link.id, "down")}><ChevronDown className="w-3.5 h-3.5" /></Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-lg" onClick={() => startEdit(link)}><Pencil className="w-3.5 h-3.5" /></Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-lg text-red-500 hover:bg-red-500/10" onClick={() => deleteLink(link.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
        </div>
      )}
    </div>
  );

  const FormSection = () => (
    <Card className="rounded-2xl border-black/20 bg-secondary/20">
      <CardContent className="pt-4 space-y-3">
        <p className="text-sm font-semibold">{editId ? "Редактировать ссылку" : "Добавить ссылку"}</p>
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="Название ссылки..." value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} className="rounded-xl" />
          <Input placeholder="https://..." value={form.url} onChange={e => setForm(p => ({ ...p, url: e.target.value }))} className="rounded-xl" />
        </div>
        <Input placeholder="Описание (необязательно)" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="rounded-xl" />
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Иконка</Label>
          <div className="flex flex-wrap gap-1.5 items-center">
            {COMMON_ICONS.map(ic => (
              <button key={ic} onClick={() => setForm(p => ({ ...p, icon: ic }))}
                className={`text-base w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${form.icon === ic ? "bg-black text-white" : "bg-secondary hover:bg-secondary/80"}`}>{ic}</button>
            ))}
            <Input value={form.icon} onChange={e => setForm(p => ({ ...p, icon: e.target.value }))} className="rounded-lg w-16 h-8 text-center text-base" maxLength={2} placeholder="✏️" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Цвет</Label>
          <div className="flex gap-2 flex-wrap">
            {LINK_COLORS.map(c => (
              <button key={c} onClick={() => setForm(p => ({ ...p, color: c }))}
                className={`w-7 h-7 rounded-full border-2 transition-all ${form.color === c ? "scale-125 border-foreground" : "border-transparent"}`}
                style={{ background: c }} />
            ))}
            <Input type="color" value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))} className="rounded-lg w-9 h-7 p-0.5 cursor-pointer border-border" />
          </div>
        </div>
        <div className="flex gap-2">
          <Button className="flex-1 rounded-xl" onClick={saveLink} disabled={saving || !form.title || !form.url}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {editId ? "Сохранить" : "Добавить"}
          </Button>
          <Button variant="ghost" className="rounded-xl" onClick={() => { setShowAdd(false); setEditId(null); setForm({ title: "", url: "", icon: "🔗", description: "", color: "#000000" }); }}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Link Hub — страница ссылок группы</p>
          <p className="text-xs text-muted-foreground mt-0.5">Как Linktree — все ваши ссылки в одном месте</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="rounded-xl gap-1.5" onClick={() => setPreview(p => !p)}>
            <Eye className="w-3.5 h-3.5" /> {preview ? "Список" : "Превью"}
          </Button>
          {!preview && <Button size="sm" className="rounded-xl gap-1.5" onClick={() => { setShowAdd(p => !p); setEditId(null); setForm({ title: "", url: "", icon: "🔗", description: "", color: "#000000" }); }}>
            <Plus className="w-3.5 h-3.5" /> Добавить
          </Button>}
        </div>
      </div>

      <AnimatePresence>
        {(showAdd && !editId) && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <FormSection />
          </motion.div>
        )}
      </AnimatePresence>

      {preview ? (
        /* Linktree-style preview */
        <div className="max-w-sm mx-auto">
          <Card className="rounded-3xl border-border/30 shadow-xl overflow-hidden">
            <div className="bg-gradient-to-br from-gray-900 to-gray-700 px-6 py-8 text-center">
              <div className="w-16 h-16 rounded-full bg-white/10 mx-auto flex items-center justify-center text-2xl mb-3">🔗</div>
              <p className="text-white font-bold text-lg">Ссылки группы</p>
              <p className="text-white/60 text-xs mt-1">Все наши соцсети и ресурсы</p>
            </div>
            <div className="bg-gray-50 p-4 space-y-2">
              {loading ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />) :
                links.length === 0 ? <p className="text-center text-gray-400 text-sm py-6">Нет ссылок</p> :
                  links.map(link => (
                    <a key={link.id} href={link.url} target="_blank" rel="noreferrer" className="block hover:scale-[1.01] transition-transform">
                      <LinkCard link={link} preview />
                    </a>
                  ))}
            </div>
          </Card>
        </div>
      ) : (
        loading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>
        ) : links.length === 0 && !showAdd ? (
          <div className="text-center py-12 text-muted-foreground flex flex-col items-center gap-2">
            <Link2 className="w-12 h-12 opacity-20" />
            <p className="text-sm">Нет ссылок</p>
            <p className="text-xs">Добавьте ссылки на соцсети, Discord, YouTube и другие ресурсы</p>
            <Button size="sm" className="rounded-xl gap-1.5 mt-2" onClick={() => setShowAdd(true)}><Plus className="w-3.5 h-3.5" /> Добавить первую ссылку</Button>
          </div>
        ) : (
          <div className="space-y-2">
            {links.map(link => (
              <div key={link.id}>
                <AnimatePresence>
                  {editId === link.id ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <FormSection />
                    </motion.div>
                  ) : (
                    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
                      <LinkCard link={link} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SocialMedia() {
  const { groups, loading: groupsLoading } = useGetRobloxGroups();
  const [activeTab, setActiveTab] = useState("autopost");

  return (
    <div className="p-6 lg:p-10 w-full max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <Share2 className="w-7 h-7" /> Social Media Automation
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">Автопостинг, дашборд соцсетей и страница ссылок группы</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="rounded-xl bg-secondary/50 border border-border p-1 h-auto gap-1">
          <TabsTrigger value="autopost" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-4 py-2 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5" /> Auto Post Discord
          </TabsTrigger>
          <TabsTrigger value="dashboard" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-4 py-2 flex items-center gap-1.5">
            <LayoutDashboard className="w-3.5 h-3.5" /> Social Dashboard
          </TabsTrigger>
          <TabsTrigger value="linkhub" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-4 py-2 flex items-center gap-1.5">
            <Link2 className="w-3.5 h-3.5" /> Link Hub
          </TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="autopost" className="mt-0">
            <AutoPostTab groups={groups || []} />
          </TabsContent>
          <TabsContent value="dashboard" className="mt-0">
            <SocialDashboard />
          </TabsContent>
          <TabsContent value="linkhub" className="mt-0">
            <LinkHubTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
