import { useState, useEffect, useCallback } from "react";
import { getAuthCredentials } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Plug, Bot, Webhook, Sheet, Mail, Check, X, Loader2, Plus, Trash2,
  Pencil, RefreshCw, Send, Copy, ExternalLink, AlertTriangle, CheckCircle2,
  Zap, Globe, Radio, Bell, Lock, Eye, EyeOff, Info, Download
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function getAuthHeaders(): Record<string, string> {
  const { token, fingerprint } = getAuthCredentials();
  const h: Record<string, string> = {};
  if (token) h["Authorization"] = `Bearer ${token}`;
  if (fingerprint) h["X-Device-Fingerprint"] = fingerprint;
  return h;
}

async function apiFetch<T = any>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    ...opts,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...getAuthHeaders(), ...(opts?.headers || {}) },
  });
  if (!res.ok) { const e = await res.json().catch(() => ({ error: "Error" })); throw new Error(e.error || "Failed"); }
  return res.json();
}

function timeAgo(ts: number | null, t: (key: string) => string) {
  if (!ts) return t("common.never") || "Никогда";
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return t("common.justNow");
  if (m < 60) return t("common.minAgo").replace("{n}", String(m));
  const h = Math.floor(m / 60);
  if (h < 24) return t("common.hAgo").replace("{n}", String(h));
  const d = Math.floor(h / 24);
  if (d < 30) return t("common.dAgo").replace("{n}", String(d));
  const mo = Math.floor(d / 30);
  return t("common.monthAgo").replace("{n}", String(mo));
}

function getEventLabels(t: (key: string) => string): Record<string, string> {
  return {
    new_item: `👕 ${t("int.newItem")}`, item_sold: `💰 ${t("int.itemSold")}`, new_follower: `👤 ${t("int.newFollower") || "Новый подписчик"}`,
    group_join: `📥 ${t("int.groupJoin")}`, group_leave: `📤 ${t("int.groupLeave")}`,
    promotion_start: `🎉 ${t("int.promoStart") || "Начало акции"}`, promotion_end: `🏁 ${t("int.promoEnd") || "Конец акции"}`,
    invoice_paid: `🧾 ${t("int.invoicePaid") || "Счёт оплачен"}`, goal_reached: `🎯 ${t("int.goalReached") || "Цель достигнута"}`,
    streak_milestone: `🔥 ${t("int.streakMilestone") || "Стрик-рекорд"}`, achievement_unlocked: `🏆 ${t("int.achievement") || "Достижение"}`,
    devex_ready: `💸 ${t("int.devexReady") || "Готов к DevEx"}`,
  };
}

// ── Event Selector ────────────────────────────────────────────────────────────
function EventSelector({ events, selected, onChange }: { events: string[]; selected: string[]; onChange: (s: string[]) => void }) {
  const { t } = useLanguage();
  const EVENT_LABELS = getEventLabels(t);
  const toggle = (e: string) => onChange(selected.includes(e) ? selected.filter(x => x !== e) : [...selected, e]);
  return (
    <div className="flex flex-wrap gap-1.5">
      {events.map(e => (
        <button key={e} onClick={() => toggle(e)}
          className={`text-xs rounded-lg px-2.5 py-1.5 border font-medium transition-colors ${selected.includes(e) ? "bg-black text-white border-black" : "border-border text-muted-foreground hover:border-black/30"}`}>
          {EVENT_LABELS[e] || e}
        </button>
      ))}
    </div>
  );
}

// ── Status header cards ───────────────────────────────────────────────────────
function StatusCards({ status }: { status: any }) {
  const { t } = useLanguage();
  const cards = [
    { label: t("int.discord"), icon: "💬", ok: status?.discord?.connected, detail: `${status?.discord?.webhookCount || 0} webhooks` },
    { label: t("int.telegram"), icon: "✈️", ok: status?.telegram?.online, detail: status?.telegram?.username ? `@${status.telegram.username}` : t("int.disconnected") },
    { label: "Email", icon: "📧", ok: status?.email?.configured, detail: status?.email?.toEmail || t("int.disconnected") },
    { label: "Sheets", icon: "📊", ok: status?.sheets?.configured, detail: status?.sheets?.lastSync ? `Sync: ${timeAgo(status.sheets.lastSync, t)}` : t("int.disconnected") },
    { label: t("int.webhooks"), icon: "🪝", ok: (status?.customWebhooks?.enabled || 0) > 0, detail: `${status?.customWebhooks?.enabled || 0}/${status?.customWebhooks?.total || 0}` },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
      {cards.map(c => (
        <div key={c.label} className={`rounded-xl border p-3 text-center transition-colors ${c.ok ? "border-green-500/20 bg-green-500/5" : "border-border/40"}`}>
          <div className="text-xl mb-1">{c.icon}</div>
          <div className="flex items-center justify-center gap-1"><p className="text-xs font-bold">{c.label}</p>{c.ok ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <div className="w-2 h-2 rounded-full bg-gray-300" />}</div>
          <p className="text-[9px] text-muted-foreground mt-0.5 truncate">{c.detail}</p>
        </div>
      ))}
    </div>
  );
}

// ── Discord Tab ───────────────────────────────────────────────────────────────
function DiscordTab() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [selectedWebhookId, setSelectedWebhookId] = useState("");
  const [notifyEvents, setNotifyEvents] = useState<string[]>([]);

  useEffect(() => {
    apiFetch("/api/integrations/discord").then(d => { setData(d); setNotifyEvents(d.notifyEvents || []); setSelectedWebhookId(d.testChannelWebhookId || ""); }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch("/api/integrations/discord/config", { method: "POST", body: JSON.stringify({ notifyEvents, testChannelWebhookId: selectedWebhookId }) });
      toast({ title: `✅ ${t("int.discord")} settings saved` });
    } catch (e) { toast({ variant: "destructive", title: t("common.error"), description: e instanceof Error ? e.message : "" }); }
    finally { setSaving(false); }
  };

  const test = async () => {
    setTesting(true); setTestResult(null);
    try {
      const r = await apiFetch<any>("/api/integrations/discord/test", { method: "POST", body: JSON.stringify({ webhookId: selectedWebhookId }) });
      setTestResult(r);
      if (r.ok) toast({ title: `✅ ${t("int.testSend")} Discord!` });
      else toast({ variant: "destructive", title: `${t("common.error")} ${r.status}` });
    } catch (e) { toast({ variant: "destructive", title: t("common.error"), description: e instanceof Error ? e.message : "" }); setTestResult({ ok: false, error: (e as Error).message }); }
    finally { setTesting(false); }
  };

  if (loading || !data) return <Skeleton className="h-64 rounded-2xl" />;

  return (
    <div className="space-y-5">
      <Card className="rounded-2xl border-border/50">
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#5865F2]/10 flex items-center justify-center text-2xl">💬</div>
            <div>
              <p className="font-bold">Discord Webhooks</p>
              <p className="text-xs text-muted-foreground">{data?.webhooks?.length || 0} webhook(s)</p>
            </div>
            {data?.webhooks?.length > 0 ? <Badge className="ml-auto text-[10px] bg-green-500/15 text-green-700 border-green-500/30">✅ {t("int.connected")}</Badge>
              : <Badge className="ml-auto text-[10px]" variant="outline">{t("int.disconnected")}</Badge>}
          </div>

          {data?.webhooks?.length === 0 ? (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>Webhooks are configured in <strong>Marketing → Webhooks</strong>. Add a Discord webhook there first, then return here for notification setup.</div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Webhook for tests</Label>
                <Select value={selectedWebhookId} onValueChange={setSelectedWebhookId}>
                  <SelectTrigger className="rounded-xl h-9"><SelectValue placeholder="Select webhook..." /></SelectTrigger>
                  <SelectContent>{(data?.webhooks || []).map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t("int.events")}</Label>
                <EventSelector events={data?.allEvents || []} selected={notifyEvents} onChange={setNotifyEvents} />
              </div>
            </div>
          )}

          {data?.webhooks?.length > 0 && (
            <div className="flex gap-2">
              <Button className="rounded-xl gap-1.5" onClick={save} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {t("common.save")}</Button>
              <Button variant="outline" className="rounded-xl gap-1.5" onClick={test} disabled={testing || !selectedWebhookId}>{testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} {t("int.testSend")}</Button>
            </div>
          )}

          {testResult && (
            <div className={`rounded-xl p-3 text-xs ${testResult.ok ? "bg-green-500/10 border border-green-500/20 text-green-700" : "bg-red-500/10 border border-red-500/20 text-red-700"}`}>
              {testResult.ok ? `✅ Sent (HTTP ${testResult.status})` : `❌ ${t("common.error")}: ${testResult.error || testResult.status}`}
            </div>
          )}
        </CardContent>
      </Card>

      {data?.webhooks?.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-muted-foreground">Discord webhooks</p>
          {(data?.webhooks || []).map((w: any) => (
            <div key={w.id} className="flex items-center gap-3 rounded-xl border border-border/50 px-4 py-3">
              <div className={`w-2 h-2 rounded-full shrink-0 ${w.enabled ? "bg-green-500" : "bg-gray-300"}`} />
              <p className="text-sm font-medium flex-1">{w.name}</p>
              <span className="text-[10px] text-muted-foreground">{timeAgo(w.lastTriggered, t)}</span>
            </div>
          ))}
        </div>
      )}

      <Card className="rounded-2xl border-border/30 bg-secondary/20">
        <CardContent className="pt-4">
          <p className="text-xs font-bold text-muted-foreground mb-2">📖 How to connect Discord</p>
          <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Go to Discord channel settings → Integrations → Webhooks</li>
            <li>Create a new Webhook and copy the URL</li>
            <li>Add the webhook in Marketing → Webhooks (type: Discord)</li>
            <li>Return here and select webhook for notifications</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Telegram Tab ──────────────────────────────────────────────────────────────
function TelegramTab() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [notifyEvents, setNotifyEvents] = useState<string[]>([]);
  const [chatIds, setChatIds] = useState<string[]>([]);
  const [newChatId, setNewChatId] = useState("");
  const [testText, setTestText] = useState("✅ Test from Limited.Ink! Telegram integration works.");
  const [selectedChatId, setSelectedChatId] = useState("");
  const [sendResult, setSendResult] = useState<any>(null);
  const [showLog, setShowLog] = useState(false);

  useEffect(() => {
    apiFetch("/api/integrations/telegram").then(d => { setData(d); setNotifyEvents(d.notifyEvents || []); setChatIds(d.chatIds || []); if (d.chatIds?.[0]) setSelectedChatId(d.chatIds[0]); }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch("/api/integrations/telegram/config", { method: "POST", body: JSON.stringify({ chatIds, notifyEvents }) });
      toast({ title: `✅ ${t("int.telegram")} settings saved` });
    } catch (e) { toast({ variant: "destructive", title: t("common.error") }); }
    finally { setSaving(false); }
  };

  const sendTest = async () => {
    if (!selectedChatId || !testText) return;
    setSending(true); setSendResult(null);
    try {
      const r = await apiFetch<any>("/api/integrations/telegram/send", { method: "POST", body: JSON.stringify({ chatId: selectedChatId, text: testText }) });
      setSendResult(r);
      if (r.ok) toast({ title: `✅ Sent to ${t("int.telegram")}! Message ID: ${r.messageId}` });
      else toast({ variant: "destructive", title: t("common.error"), description: r.error });
    } catch (e) { toast({ variant: "destructive", title: t("common.error"), description: e instanceof Error ? e.message : "" }); }
    finally { setSending(false); }
  };

  if (loading || !data) return <Skeleton className="h-64 rounded-2xl" />;

  return (
    <div className="space-y-5">
      <Card className="rounded-2xl border-border/50">
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#0088cc]/10 flex items-center justify-center text-2xl">✈️</div>
            <div className="flex-1">
              <p className="font-bold">{t("int.telegram")} Bot</p>
              <p className="text-xs text-muted-foreground">{data?.botInfo ? `@${data.botInfo.username} — ${data.botInfo.first_name}` : t("int.noBots")}</p>
            </div>
            {data?.botInfo ? <Badge className="text-[10px] bg-green-500/15 text-green-700 border-green-500/30">🟢 Online</Badge>
              : <Badge className="text-[10px] bg-red-500/15 text-red-700 border-red-500/30" variant="outline">⛔ Offline</Badge>}
          </div>

          {!data?.configured ? (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>TELEGRAM_BOT_TOKEN not configured. Add bot token to environment settings.</div>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Chat ID</Label>
                <div className="flex gap-2">
                  <Input value={newChatId} onChange={e => setNewChatId(e.target.value)} placeholder="-100xxxxxxxxxx or @channel" className="rounded-xl flex-1" />
                  <Button variant="outline" className="rounded-xl" onClick={() => { if (newChatId) { setChatIds(p => [...p.filter(c => c !== newChatId), newChatId]); setSelectedChatId(newChatId); setNewChatId(""); } }}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {chatIds.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {chatIds.map(id => (
                      <div key={id} className="flex items-center gap-1.5 bg-secondary rounded-lg px-2.5 py-1 text-xs">
                        <span className="font-mono">{id}</span>
                        <button onClick={() => setChatIds(p => p.filter(c => c !== id))} className="text-muted-foreground hover:text-red-500"><X className="w-3 h-3" /></button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground">To find Chat ID: send /start to the bot, or add @userinfobot to chat</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t("int.events")}</Label>
                <EventSelector events={data?.allEvents || []} selected={notifyEvents} onChange={setNotifyEvents} />
              </div>

              <Button className="rounded-xl gap-1.5 w-full" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {t("common.save")}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {data?.configured && chatIds.length > 0 && (
        <Card className="rounded-2xl border-border/50">
          <CardContent className="pt-4 space-y-3">
            <p className="text-sm font-semibold">{t("int.testSend")}</p>
            {chatIds.length > 1 && (
              <Select value={selectedChatId} onValueChange={setSelectedChatId}>
                <SelectTrigger className="rounded-xl h-9"><SelectValue placeholder="Select chat..." /></SelectTrigger>
                <SelectContent>{chatIds.map(id => <SelectItem key={id} value={id}>{id}</SelectItem>)}</SelectContent>
              </Select>
            )}
            <Textarea value={testText} onChange={e => setTestText(e.target.value)} className="rounded-xl resize-none text-sm" rows={3} />
            <Button className="rounded-xl gap-1.5 w-full" onClick={sendTest} disabled={sending || !selectedChatId}>
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} {t("int.testSend")} {t("int.telegram")}
            </Button>
            {sendResult && (
              <div className={`rounded-xl p-2.5 text-xs ${sendResult.ok ? "bg-green-500/10 border border-green-500/20 text-green-700" : "bg-red-500/10 border border-red-500/20 text-red-700"}`}>
                {sendResult.ok ? `✅ Sent! Message ID: ${sendResult.messageId}` : `❌ ${sendResult.error}`}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {data?.messageLog?.length > 0 && (
        <div className="space-y-2">
          <button onClick={() => setShowLog(p => !p)} className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
            {showLog ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />} Message history ({data?.messageLog?.length || 0})
          </button>
          {showLog && (data?.messageLog || []).slice().reverse().map((m: any, i: number) => (
            <div key={i} className="flex items-start gap-2 rounded-xl border border-border/40 p-2.5">
              {m.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" /> : <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />}
              <div className="flex-1 min-w-0"><p className="text-xs truncate">{m.text}</p><p className="text-[10px] text-muted-foreground">{m.chatId} • {timeAgo(m.sentAt, t)}</p></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Custom Webhooks Tab ───────────────────────────────────────────────────────
type CWH = { id: string; name: string; url: string; method: string; headers: string; payload: string; events: string[]; enabled: boolean; createdAt: number; lastTriggered: number | null; lastStatus: number | null };

function CustomWebhooksTab() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const EVENT_LABELS = getEventLabels(t);
  const [webhooks, setWebhooks] = useState<CWH[]>([]);
  const [allEvents, setAllEvents] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", url: "", method: "POST", headers: '{"Authorization": "Bearer TOKEN"}', payload: '{"event":"{{event}}","timestamp":"{{timestamp}}","platform":"limited-ink"}', events: [] as string[] });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, any>>({});

  useEffect(() => {
    apiFetch<{ webhooks: CWH[]; allEvents: string[] }>("/api/integrations/webhooks").then(d => { setWebhooks(d.webhooks); setAllEvents(d.allEvents); }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    if (!form.name || !form.url) return;
    setSaving(true);
    try {
      if (editId) {
        await apiFetch(`/api/integrations/webhooks/${editId}`, { method: "PATCH", body: JSON.stringify(form) });
        setWebhooks(p => p.map(w => w.id === editId ? { ...w, ...form } : w));
        setEditId(null);
      } else {
        const { webhook } = await apiFetch<{ webhook: CWH }>("/api/integrations/webhooks", { method: "POST", body: JSON.stringify(form) });
        setWebhooks(p => [...p, webhook]);
        setShowAdd(false);
      }
      setForm({ name: "", url: "", method: "POST", headers: '{"Authorization": "Bearer TOKEN"}', payload: '{"event":"{{event}}","timestamp":"{{timestamp}}","platform":"limited-ink"}', events: [] });
      toast({ title: "✅ Webhook saved" });
    } catch (e) { toast({ variant: "destructive", title: t("common.error") }); }
    finally { setSaving(false); }
  };

  const testWebhook = async (id: string) => {
    setTesting(id);
    try {
      const r = await apiFetch<any>(`/api/integrations/webhooks/${id}/test`, { method: "POST" });
      setTestResults(p => ({ ...p, [id]: r }));
      setWebhooks(prev => prev.map(w => w.id === id ? { ...w, lastTriggered: Date.now(), lastStatus: r.status } : w));
      toast({ title: r.ok ? `✅ HTTP ${r.status}` : `❌ HTTP ${r.status || "Error"}` });
    } catch (e) { toast({ variant: "destructive", title: t("common.error") }); }
    finally { setTesting(null); }
  };

  const toggleEnabled = async (id: string, enabled: boolean) => {
    await apiFetch(`/api/integrations/webhooks/${id}`, { method: "PATCH", body: JSON.stringify({ enabled }) });
    setWebhooks(p => p.map(w => w.id === id ? { ...w, enabled } : w));
  };

  const deleteWH = async (id: string) => {
    await apiFetch(`/api/integrations/webhooks/${id}`, { method: "DELETE" });
    setWebhooks(p => p.filter(w => w.id !== id));
  };

  const startEdit = (wh: CWH) => {
    setEditId(wh.id); setShowAdd(false);
    setForm({ name: wh.name, url: wh.url, method: wh.method, headers: wh.headers, payload: wh.payload, events: wh.events });
  };

  const FormPanel = () => (
    <Card className="rounded-2xl border-black/20 bg-secondary/20">
      <CardContent className="pt-4 space-y-3">
        <p className="text-sm font-semibold">{editId ? "Edit" : "New"} webhook</p>
        <div className="grid grid-cols-3 gap-2">
          <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Name *" className="rounded-xl col-span-2" />
          <Select value={form.method} onValueChange={v => setForm(p => ({ ...p, method: v }))}>
            <SelectTrigger className="rounded-xl h-9"><SelectValue /></SelectTrigger>
            <SelectContent>{["POST", "PUT", "PATCH", "GET"].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Input value={form.url} onChange={e => setForm(p => ({ ...p, url: e.target.value }))} placeholder="https://hooks.example.com/..." className="rounded-xl font-mono text-sm" />
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Headers (JSON)</Label>
          <Textarea value={form.headers} onChange={e => setForm(p => ({ ...p, headers: e.target.value }))} className="rounded-xl resize-none font-mono text-xs" rows={2} />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Payload (JSON)</Label>
            <span className="text-[10px] text-muted-foreground">Variables: {"{{"} event {"}}"} {"{{"} timestamp {"}}"}</span>
          </div>
          <Textarea value={form.payload} onChange={e => setForm(p => ({ ...p, payload: e.target.value }))} className="rounded-xl resize-none font-mono text-xs" rows={3} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t("int.events")}</Label>
          <EventSelector events={allEvents} selected={form.events} onChange={events => setForm(p => ({ ...p, events }))} />
        </div>
        <div className="flex gap-2">
          <Button className="flex-1 rounded-xl" onClick={save} disabled={saving || !form.name || !form.url}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {t("common.save")}</Button>
          <Button variant="ghost" className="rounded-xl" onClick={() => { setShowAdd(false); setEditId(null); }}><X className="w-4 h-4" /></Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><p className="font-semibold">{t("int.webhooks")}</p><p className="text-xs text-muted-foreground">{webhooks.length} webhook(s)</p></div>
        <Button size="sm" className="rounded-xl gap-1.5" onClick={() => { setShowAdd(p => !p); setEditId(null); }}><Plus className="w-3.5 h-3.5" /> {t("int.addWebhook")}</Button>
      </div>

      <AnimatePresence>
        {(showAdd && !editId) && <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}><FormPanel /></motion.div>}
      </AnimatePresence>

      {loading ? <Skeleton className="h-32 rounded-2xl" /> : webhooks.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground flex flex-col items-center gap-2"><Webhook className="w-10 h-10 opacity-20" /><p className="text-sm">{t("int.noWebhooks")}</p></div>
      ) : (
        <div className="space-y-3">
          {webhooks.map(wh => (
            <div key={wh.id}>
              {editId === wh.id ? <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}><FormPanel /></motion.div> : (
                <Card className="rounded-2xl border-border/50">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${wh.enabled ? "bg-green-500" : "bg-gray-300"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2"><p className="font-bold text-sm">{wh.name}</p><Badge variant="outline" className="text-[9px]">{wh.method}</Badge></div>
                        <p className="text-xs text-muted-foreground font-mono truncate">{wh.url}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Switch checked={wh.enabled} onCheckedChange={v => toggleEnabled(wh.id, v)} />
                      </div>
                    </div>
                    {wh.events.length > 0 && <div className="flex gap-1 flex-wrap">{wh.events.slice(0, 4).map(e => <span key={e} className="text-[10px] bg-secondary rounded-md px-1.5 py-0.5">{EVENT_LABELS[e] || e}</span>)}{wh.events.length > 4 && <span className="text-[10px] text-muted-foreground">+{wh.events.length - 4}</span>}</div>}
                    <div className="flex items-center gap-2">
                      {wh.lastTriggered && <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${(wh.lastStatus || 0) < 300 ? "bg-green-500/10 text-green-700" : "bg-red-500/10 text-red-700"}`}>HTTP {wh.lastStatus} • {timeAgo(wh.lastTriggered, t)}</span>}
                      {testResults[wh.id] && <span className={`text-[10px] italic truncate ${testResults[wh.id].ok ? "text-green-600" : "text-red-500"}`}>{testResults[wh.id].responsePreview?.slice(0, 60)}</span>}
                      <div className="flex gap-1 ml-auto">
                        <Button size="sm" variant="outline" className="rounded-xl h-7 gap-1 text-xs" onClick={() => testWebhook(wh.id)} disabled={testing === wh.id}>{testing === wh.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />} {t("int.testSend")}</Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-lg" onClick={() => startEdit(wh)}><Pencil className="w-3 h-3" /></Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-lg text-red-500 hover:bg-red-500/10" onClick={() => deleteWH(wh.id)}><Trash2 className="w-3 h-3" /></Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Google Sheets Tab ─────────────────────────────────────────────────────────
const EXPORT_FIELDS = [
  { value: "invoices", label: "🧾 Invoices", icon: "🧾" },
  { value: "goals", label: "🎯 Financial Goals", icon: "🎯" },
  { value: "todos", label: "✅ Tasks", icon: "✅" },
  { value: "drafts", label: "✏️ Drafts", icon: "✏️" },
];

function SheetsTab() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [csvResults, setCsvResults] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ sheetId: "", sheetUrl: "", autoSync: false });

  useEffect(() => {
    apiFetch("/api/integrations/sheets").then(({ config: c }) => { setConfig(c); setForm({ sheetId: c.sheetId || "", sheetUrl: c.sheetUrl || "", autoSync: c.autoSync || false }); }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch("/api/integrations/sheets/config", { method: "POST", body: JSON.stringify(form) });
      setConfig((p: any) => ({ ...p, ...form }));
      toast({ title: "✅ Settings saved" });
    } catch { toast({ variant: "destructive", title: t("common.error") }); }
    finally { setSaving(false); }
  };

  const exportField = async (field: string) => {
    setExporting(field);
    try {
      const { csv, rows } = await apiFetch<{ csv: string; rows: number }>("/api/integrations/sheets/export", { method: "POST", body: JSON.stringify({ field }) });
      setCsvResults(p => ({ ...p, [field]: csv }));
      await navigator.clipboard.writeText(csv);
      toast({ title: `✅ ${rows} rows copied!`, description: "Paste in Google Sheets (Ctrl+Shift+V)" });
    } catch { toast({ variant: "destructive", title: t("common.error") }); }
    finally { setExporting(null); }
  };

  if (loading || !config) return <Skeleton className="h-64 rounded-2xl" />;

  return (
    <div className="space-y-5">
      <Card className="rounded-2xl border-border/50">
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#34A853]/10 flex items-center justify-center text-2xl">📊</div>
            <div>
              <p className="font-bold">Google Sheets Sync</p>
              <p className="text-xs text-muted-foreground">{config?.sheetId ? t("int.connected") : t("int.disconnected")}</p>
            </div>
          </div>
          <Input value={form.sheetId} onChange={e => setForm(p => ({ ...p, sheetId: e.target.value }))} placeholder="Google Sheets ID..." className="rounded-xl font-mono text-sm" />
          <Input value={form.sheetUrl} onChange={e => setForm(p => ({ ...p, sheetUrl: e.target.value }))} placeholder="https://docs.google.com/spreadsheets/d/..." className="rounded-xl text-sm" />
          <div className="flex items-center gap-3">
            <Switch checked={form.autoSync} onCheckedChange={v => setForm(p => ({ ...p, autoSync: v }))} />
            <Label className="text-sm">Auto-sync on data change</Label>
          </div>
          <div className="flex gap-2">
            <Button className="rounded-xl gap-1.5" onClick={save} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {t("common.save")}</Button>
            {form.sheetUrl && <a href={form.sheetUrl} target="_blank" rel="noreferrer"><Button variant="outline" className="rounded-xl gap-1.5"><ExternalLink className="w-4 h-4" /> Open</Button></a>}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div>
          <p className="text-sm font-semibold">Data Export</p>
          <p className="text-xs text-muted-foreground mt-0.5">Click to copy data to clipboard. Paste in Google Sheets via Ctrl+Shift+V</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {EXPORT_FIELDS.map(f => (
            <Card key={f.value} className="rounded-2xl border-border/50 hover:border-black/20 transition-colors cursor-pointer" onClick={() => exportField(f.value)}>
              <CardContent className="p-4 flex items-center gap-3">
                <span className="text-2xl">{f.icon}</span>
                <div className="flex-1 min-w-0"><p className="text-sm font-semibold">{f.label}</p><p className="text-xs text-muted-foreground">CSV export</p></div>
                {exporting === f.value ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" /> : <Copy className="w-4 h-4 text-muted-foreground shrink-0" />}
              </CardContent>
            </Card>
          ))}
        </div>
        {Object.keys(csvResults).length > 0 && (
          <div className="space-y-2">
            {Object.entries(csvResults).map(([field, csv]) => (
              <div key={field} className="rounded-xl border border-green-500/20 bg-green-500/5 p-3">
                <p className="text-xs font-semibold text-green-700">{EXPORT_FIELDS.find(f => f.value === field)?.label} — {t("int.keyCopied")}</p>
                <p className="text-[10px] text-green-600/70 mt-0.5 font-mono truncate">{csv.slice(0, 80)}...</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <Card className="rounded-2xl border-border/30 bg-secondary/20">
        <CardContent className="pt-4">
          <p className="text-xs font-bold text-muted-foreground mb-2">📖 How to use with Google Sheets</p>
          <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Create a new Google Sheet and copy its ID from URL</li>
            <li>Add ID and URL above, click Save</li>
            <li>Click the section button to export CSV to clipboard</li>
            <li>In Google Sheets select cell A1, press Ctrl+Shift+V → Paste as text</li>
            <li>Data → Split text to columns (separator: comma)</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Email Tab ─────────────────────────────────────────────────────────────────
function EmailTab() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [showPass, setShowPass] = useState(false);
  const [form, setForm] = useState({ smtpHost: "", smtpPort: "587", smtpUser: "", smtpPass: "", fromEmail: "", toEmail: "", enabled: false, notifyEvents: [] as string[] });

  useEffect(() => {
    apiFetch("/api/integrations/email").then(d => { setData(d); const c = d.config; setForm({ smtpHost: c.smtpHost, smtpPort: String(c.smtpPort), smtpUser: c.smtpUser, smtpPass: c.smtpPass, fromEmail: c.fromEmail, toEmail: c.toEmail, enabled: c.enabled, notifyEvents: c.notifyEvents || [] }); }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch("/api/integrations/email/config", { method: "POST", body: JSON.stringify({ ...form, smtpPort: parseInt(form.smtpPort) }) });
      toast({ title: "✅ Email settings saved" });
    } catch { toast({ variant: "destructive", title: t("common.error") }); }
    finally { setSaving(false); }
  };

  const sendTest = async () => {
    setTesting(true); setTestResult(null);
    try {
      const r = await apiFetch<any>("/api/integrations/email/test", { method: "POST" });
      setTestResult(r);
      toast({ title: r.ok ? `✅ ${t("int.testSend")} → ${r.to}` : `❌ ${t("common.error")}` });
    } catch (e) { toast({ variant: "destructive", title: t("common.error"), description: e instanceof Error ? e.message : "" }); setTestResult({ ok: false, error: (e as Error).message }); }
    finally { setTesting(false); }
  };

  if (loading || !data) return <Skeleton className="h-64 rounded-2xl" />;

  return (
    <div className="space-y-5">
      <Card className="rounded-2xl border-border/50">
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-2xl">📧</div>
              <div><p className="font-bold">Email</p><p className="text-xs text-muted-foreground">{form.toEmail || t("int.disconnected")}</p></div>
            </div>
            <div className="flex items-center gap-2">
              {form.enabled && <span className="text-xs text-green-600 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500" />{t("int.connected")}</span>}
              <Switch checked={form.enabled} onCheckedChange={v => setForm(p => ({ ...p, enabled: v }))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">SMTP Host</Label>
              <Input value={form.smtpHost} onChange={e => setForm(p => ({ ...p, smtpHost: e.target.value }))} placeholder="smtp.gmail.com" className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Port</Label>
              <Input value={form.smtpPort} onChange={e => setForm(p => ({ ...p, smtpPort: e.target.value }))} placeholder="587" className="rounded-xl" type="number" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">SMTP Login</Label>
              <Input value={form.smtpUser} onChange={e => setForm(p => ({ ...p, smtpUser: e.target.value }))} placeholder="user@gmail.com" className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">SMTP Password</Label>
              <div className="relative">
                <Input value={form.smtpPass} onChange={e => setForm(p => ({ ...p, smtpPass: e.target.value }))} type={showPass ? "text" : "password"} placeholder="Password or App Password" className="rounded-xl pr-9" />
                <button onClick={() => setShowPass(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">{showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">From</Label>
              <Input value={form.fromEmail} onChange={e => setForm(p => ({ ...p, fromEmail: e.target.value }))} placeholder="Limited.Ink <noreply@...>" className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">To</Label>
              <Input value={form.toEmail} onChange={e => setForm(p => ({ ...p, toEmail: e.target.value }))} placeholder="your@email.com" className="rounded-xl" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("int.events")}</Label>
            <EventSelector events={data?.allEvents || []} selected={form.notifyEvents} onChange={notifyEvents => setForm(p => ({ ...p, notifyEvents }))} />
          </div>

          <div className="flex gap-2">
            <Button className="rounded-xl gap-1.5" onClick={save} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {t("common.save")}</Button>
            <Button variant="outline" className="rounded-xl gap-1.5" onClick={sendTest} disabled={testing || !form.enabled || !form.toEmail}>{testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} {t("int.testSend")}</Button>
          </div>

          {testResult && (
            <div className={`rounded-xl p-3 text-xs ${testResult.ok ? "bg-green-500/10 border border-green-500/20 text-green-700" : "bg-red-500/10 border border-red-500/20 text-red-700"}`}>
              {testResult.ok ? `✅ Simulation: "${testResult.subject}" → ${testResult.to}` : `❌ ${testResult.error}`}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border/30 bg-gray-50 dark:bg-secondary/20">
        <CardContent className="pt-4">
          <p className="text-xs font-bold text-muted-foreground mb-3">📧 Email Preview</p>
          <div className="border border-border/40 rounded-xl overflow-hidden bg-white">
            <div className="bg-black px-4 py-3 flex items-center gap-2">
              <div className="text-white text-sm font-bold">Limited.Ink</div>
            </div>
            <div className="px-5 py-4">
              <p className="font-bold text-base text-gray-900 mb-2">🔔 Notification from Limited.Ink</p>
              <p className="text-sm text-gray-600 mb-4">An event you subscribed to has occurred:</p>
              <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 mb-4">
                <p className="text-xs font-bold text-gray-900">📦 {t("int.newItem")}</p>
                <p className="text-xs text-gray-500 mt-0.5">Summer Collection T-Shirt — 25 Robux</p>
              </div>
              <a className="inline-block bg-black text-white text-xs rounded-lg px-4 py-2">Open Limited.Ink →</a>
              <p className="text-[10px] text-gray-400 mt-4">You received this email because you subscribed to notifications. {form.fromEmail || "noreply@limited.ink"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border/30 bg-secondary/20">
        <CardContent className="pt-4">
          <p className="text-xs font-bold text-muted-foreground mb-2">💡 Quick Gmail Setup</p>
          <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Google Account → Security → 2-Step Verification → enable</li>
            <li>Google Account → Security → App Passwords → create</li>
            <li>SMTP Host: smtp.gmail.com, Port: 587</li>
            <li>Paste the app password in the "SMTP Password" field</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

// ── P&L Reports Tab ──────────────────────────────────────────────────────────
function PnlReportsTab() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [schedules, setSchedules] = useState<any[]>([]);
  const [tgConfigured, setTgConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState<string | null>(null);

  const [groupId, setGroupId] = useState("");
  const [groupName, setGroupName] = useState("");
  const [intervalHours, setIntervalHours] = useState("1");
  const [discordUrl, setDiscordUrl] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");

  const load = useCallback(() => {
    apiFetch("/api/pnl-reports").then(d => {
      setSchedules(d.schedules || []);
      setTgConfigured(d.telegramConfigured);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const addSchedule = async () => {
    const gid = parseInt(groupId, 10);
    if (!gid || !groupName.trim()) { toast({ variant: "destructive", title: t("common.error"), description: "Group ID and name required" }); return; }
    if (!discordUrl && !telegramChatId) { toast({ variant: "destructive", title: t("common.error"), description: "Add Discord webhook URL or Telegram chat ID" }); return; }
    setSaving(true);
    try {
      await apiFetch("/api/pnl-reports", {
        method: "POST",
        body: JSON.stringify({ groupId: gid, groupName: groupName.trim(), intervalHours: parseInt(intervalHours, 10) || 1, discordWebhookUrl: discordUrl.trim(), telegramChatId: telegramChatId.trim() }),
      });
      toast({ title: "P&L report schedule created" });
      setGroupId(""); setGroupName(""); setDiscordUrl(""); setTelegramChatId("");
      load();
    } catch (e) { toast({ variant: "destructive", title: t("common.error"), description: e instanceof Error ? e.message : "" }); }
    finally { setSaving(false); }
  };

  const sendNow = async (id: string) => {
    setSending(id);
    try {
      const r = await apiFetch<any>(`/api/pnl-reports/${id}/send-now`, { method: "POST" });
      if (r.ok) toast({ title: `Report sent${r.discord ? " to Discord" : ""}${r.telegram ? " to Telegram" : ""}` });
      else toast({ variant: "destructive", title: "Send failed" });
      load();
    } catch (e) { toast({ variant: "destructive", title: t("common.error"), description: e instanceof Error ? e.message : "" }); }
    finally { setSending(null); }
  };

  const toggleEnabled = async (id: string, enabled: boolean) => {
    try {
      await apiFetch(`/api/pnl-reports/${id}`, { method: "PATCH", body: JSON.stringify({ enabled }) });
      load();
    } catch {}
  };

  const deleteSchedule = async (id: string) => {
    try {
      await apiFetch(`/api/pnl-reports/${id}`, { method: "DELETE" });
      toast({ title: "Schedule removed" });
      load();
    } catch {}
  };

  if (loading) return <Skeleton className="h-64 rounded-2xl" />;

  return (
    <div className="space-y-5">
      <Card className="rounded-2xl border-border/50">
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-2xl">📊</div>
            <div>
              <p className="font-bold">P&L Auto-Reports</p>
              <p className="text-xs text-muted-foreground">Periodic P&L reports to Discord & Telegram</p>
            </div>
            {schedules.length > 0 && <Badge className="ml-auto text-[10px] bg-green-500/15 text-green-700 border-green-500/30">{schedules.filter(s => s.enabled).length} active</Badge>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Group ID</Label>
              <Input value={groupId} onChange={e => setGroupId(e.target.value)} placeholder="e.g. 100188833" className="rounded-xl h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Group Name</Label>
              <Input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="e.g. XCLUTCH Studio" className="rounded-xl h-9" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Interval</Label>
            <Select value={intervalHours} onValueChange={setIntervalHours}>
              <SelectTrigger className="rounded-xl h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Every 1 hour</SelectItem>
                <SelectItem value="2">Every 2 hours</SelectItem>
                <SelectItem value="4">Every 4 hours</SelectItem>
                <SelectItem value="6">Every 6 hours</SelectItem>
                <SelectItem value="12">Every 12 hours</SelectItem>
                <SelectItem value="24">Every 24 hours</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Discord Webhook URL</Label>
            <Input value={discordUrl} onChange={e => setDiscordUrl(e.target.value)} placeholder="https://discord.com/api/webhooks/..." className="rounded-xl h-9" type="url" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              Telegram Chat ID
              {!tgConfigured && <span className="text-amber-600 text-[10px]">(bot not configured)</span>}
            </Label>
            <Input value={telegramChatId} onChange={e => setTelegramChatId(e.target.value)} placeholder="e.g. -1001234567890" className="rounded-xl h-9" disabled={!tgConfigured} />
          </div>

          <Button className="rounded-xl gap-1.5 w-full" onClick={addSchedule} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add Report Schedule
          </Button>
        </CardContent>
      </Card>

      {schedules.length > 0 && (
        <Card className="rounded-2xl border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2"><Bell className="w-4 h-4" /> Active Schedules</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {schedules.map(s => (
              <motion.div key={s.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className={`rounded-xl border p-3 space-y-2 transition-colors ${s.enabled ? "border-green-500/20 bg-green-500/5" : "border-border/40 opacity-60"}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold">{s.groupName}</p>
                    <p className="text-[10px] text-muted-foreground">ID: {s.groupId} • Every {s.intervalHours}h</p>
                  </div>
                  <Switch checked={s.enabled} onCheckedChange={v => toggleEnabled(s.id, v)} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {s.discordWebhookUrl && <Badge variant="outline" className="text-[10px] rounded-lg">💬 Discord</Badge>}
                  {s.telegramChatId && <Badge variant="outline" className="text-[10px] rounded-lg">✈️ Telegram</Badge>}
                  {s.lastSentAt && <Badge variant="outline" className="text-[10px] rounded-lg text-muted-foreground">Last: {new Date(s.lastSentAt).toLocaleString()}</Badge>}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="rounded-lg text-xs h-7 gap-1" onClick={() => sendNow(s.id)} disabled={sending === s.id}>
                    {sending === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                    Send Now
                  </Button>
                  <Button size="sm" variant="outline" className="rounded-lg text-xs h-7 gap-1 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => deleteSchedule(s.id)}>
                    <Trash2 className="w-3 h-3" /> Delete
                  </Button>
                </div>
              </motion.div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="rounded-2xl border-border/30 bg-secondary/20">
        <CardContent className="pt-4">
          <p className="text-xs font-bold text-muted-foreground mb-2">💡 How it works</p>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
            <li>Reports are sent automatically at the chosen interval</li>
            <li>Each report includes balance, revenue, sales count, and top items</li>
            <li>Discord receives a rich embed, Telegram receives a formatted message</li>
            <li>You can send a report immediately using "Send Now"</li>
            <li>Reports continue running while the server is active</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Integrations() {
  const { t } = useLanguage();
  const [status, setStatus] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("discord");

  useEffect(() => {
    apiFetch("/api/integrations/status").then(setStatus).catch(() => {});
  }, [activeTab]);

  return (
    <div className="p-6 lg:p-10 w-full max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3"><Plug className="w-7 h-7" /> {t("int.title")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("int.desc")}</p>
      </div>

      <StatusCards status={status} />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="rounded-xl bg-secondary/50 border border-border p-1 h-auto gap-1 flex-wrap">
          <TabsTrigger value="discord" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-3 py-2 flex items-center gap-1.5">💬 {t("int.discord")}</TabsTrigger>
          <TabsTrigger value="telegram" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-3 py-2 flex items-center gap-1.5">✈️ {t("int.telegram")}</TabsTrigger>
          <TabsTrigger value="webhooks" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-3 py-2 flex items-center gap-1.5"><Webhook className="w-3.5 h-3.5" /> {t("int.webhooks")}</TabsTrigger>
          <TabsTrigger value="sheets" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-3 py-2 flex items-center gap-1.5">📊 Google Sheets</TabsTrigger>
          <TabsTrigger value="email" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-3 py-2 flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Email</TabsTrigger>
          <TabsTrigger value="pnl-reports" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-3 py-2 flex items-center gap-1.5">📊 P&L Reports</TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="discord" className="mt-0"><DiscordTab /></TabsContent>
          <TabsContent value="telegram" className="mt-0"><TelegramTab /></TabsContent>
          <TabsContent value="webhooks" className="mt-0"><CustomWebhooksTab /></TabsContent>
          <TabsContent value="sheets" className="mt-0"><SheetsTab /></TabsContent>
          <TabsContent value="email" className="mt-0"><EmailTab /></TabsContent>
          <TabsContent value="pnl-reports" className="mt-0"><PnlReportsTab /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
