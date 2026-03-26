import { useState, useEffect, useCallback, useRef } from "react";
import { getAuthCredentials } from "@workspace/api-client-react";
import { robloxHeadshot } from "@/lib/roblox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Shield, Cookie, Users, Activity, RefreshCw, Globe, Plus, Trash2, Check,
  X, Loader2, Eye, EyeOff, AlertTriangle, Copy, CheckCircle2, XCircle,
  Clock, LogIn, Zap, ChevronRight, Lock, Unlock, Wifi, WifiOff, Info,
  Coins, Crown, UserCheck,
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
    headers: { ...authHeaders(), ...(opts?.headers || {}) },
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({ error: r.statusText })) as { error?: string };
    throw new Error(e.error || `HTTP ${r.status}`);
  }
  return r.json() as Promise<T>;
}

const STORAGE_KEY = "limitedink_saved_accounts";
const ACTIVITY_KEY = "limitedink_activity_log";
const PROXY_KEY = "limitedink_proxy_config";

interface SavedAccount {
  id: string;
  label: string;
  cookie: string;
  userId: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  addedAt: number;
  lastChecked?: number;
  status: "unchecked" | "valid" | "invalid" | "checking";
  robux?: number | null;
  isPremium?: boolean;
  friendCount?: number | null;
}

interface ActivityEntry {
  id: string;
  action: string;
  detail?: string;
  ts: number;
  source: "local" | "server";
}

interface ProxyConfig {
  url: string;
  enabled: boolean;
  addedAt: number;
}

function loadAccounts(): SavedAccount[] {
  try { return JSON.parse(atob(localStorage.getItem(STORAGE_KEY) || btoa("[]"))); }
  catch { return []; }
}
function saveAccounts(accounts: SavedAccount[]) {
  localStorage.setItem(STORAGE_KEY, btoa(JSON.stringify(accounts)));
}
function loadActivity(): ActivityEntry[] {
  try { return JSON.parse(localStorage.getItem(ACTIVITY_KEY) || "[]"); }
  catch { return []; }
}
function appendActivity(entry: Omit<ActivityEntry, "id">) {
  const log = loadActivity();
  log.unshift({ ...entry, id: Math.random().toString(36).slice(2) });
  if (log.length > 500) log.splice(500);
  localStorage.setItem(ACTIVITY_KEY, JSON.stringify(log));
}
function loadProxy(): ProxyConfig | null {
  try { return JSON.parse(localStorage.getItem(PROXY_KEY) || "null"); }
  catch { return null; }
}
function saveProxy(cfg: ProxyConfig | null) {
  if (cfg) localStorage.setItem(PROXY_KEY, JSON.stringify(cfg));
  else localStorage.removeItem(PROXY_KEY);
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export function logAppActivity(action: string, detail?: string) {
  appendActivity({ action, detail, ts: Date.now(), source: "local" });
}

function formatRobux(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString();
}

export default function Security() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [tab, setTab] = useState("cookies");

  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [bulkInput, setBulkInput] = useState("");
  const [showCookies, setShowCookies] = useState<Set<string>>(new Set());
  const [checkingAll, setCheckingAll] = useState(false);
  const checkingRef = useRef(false);

  const [sessionInfo, setSessionInfo] = useState<{
    userId: number; username: string; displayName: string; avatarUrl: string | null;
    maskedCookie: string; sessionCreatedAt: number | null; activityCount: number;
    proxyEnabled: boolean; altCount: number;
  } | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionHealthy, setSessionHealthy] = useState<boolean | null>(null);
  const [lastChecked, setLastChecked] = useState<number | null>(null);

  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);
  const [activityFilter, setActivityFilter] = useState("");

  const [autoRefresh, setAutoRefresh] = useState(() => localStorage.getItem("limitedink_auto_refresh") === "true");
  const autoRefreshRef = useRef(autoRefresh);
  useEffect(() => { autoRefreshRef.current = autoRefresh; }, [autoRefresh]);

  const [proxyConfig, setProxyConfig] = useState<ProxyConfig | null>(null);
  const [proxyInput, setProxyInput] = useState("");
  const [proxyEnabled, setProxyEnabled] = useState(true);
  const [testingProxy, setTestingProxy] = useState(false);
  const [proxyTestResult, setProxyTestResult] = useState<{ ok: boolean; latency?: number; message: string } | null>(null);
  const [savingProxy, setSavingProxy] = useState(false);

  useEffect(() => {
    const accs = loadAccounts();
    setAccounts(accs);
    setActivityLog(loadActivity());
    const proxy = loadProxy();
    setProxyConfig(proxy);
    if (proxy) setProxyInput(proxy.url);
    loadSessionInfo();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      if (autoRefreshRef.current) checkSession();
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const loadSessionInfo = async () => {
    setSessionLoading(true);
    try {
      const data = await apiFetch<typeof sessionInfo>("/api/security/session-info");
      setSessionInfo(data);
      setSessionHealthy(true);
      setLastChecked(Date.now());
    } catch {
      setSessionHealthy(false);
      setLastChecked(Date.now());
    } finally { setSessionLoading(false); }
  };

  const checkSession = async () => {
    try {
      await apiFetch("/api/roblox/me");
      setSessionHealthy(true);
      setLastChecked(Date.now());
    } catch {
      setSessionHealthy(false);
      setLastChecked(Date.now());
      if (autoRefreshRef.current) {
        toast({ title: `⚠️ ${t("sec.expired")}`, description: t("sec.invalid"), variant: "destructive" });
        playError();
      }
    }
  };

  const addBulkCookies = () => {
    const lines = bulkInput
      .split(/\n/)
      .map(l => l.trim().replace(/^\.ROBLOSECURITY=/, ""))
      .filter(l => l.length > 20);
    if (lines.length === 0) return;

    const existingCookies = new Set(accounts.map(a => a.cookie));
    const newAccs: SavedAccount[] = lines
      .filter(c => !existingCookies.has(c))
      .map(cookie => ({
        id: Math.random().toString(36).slice(2),
        label: `...${cookie.slice(-6)}`,
        cookie,
        userId: 0,
        username: "",
        displayName: "",
        avatarUrl: null,
        addedAt: Date.now(),
        status: "unchecked" as const,
      }));

    if (newAccs.length === 0) {
      toast({ title: t("common.error"), description: "All cookies already added", variant: "destructive" });
      return;
    }

    const updated = [...newAccs, ...accounts];
    saveAccounts(updated);
    setAccounts(updated);
    setBulkInput("");
    logAppActivity("Cookies added", `${newAccs.length} cookies`);
    toast({ title: `${newAccs.length} cookies added` });
    playSuccess();
  };

  const checkSingleCookie = async (accId: string) => {
    setAccounts(prev => {
      const upd = prev.map(a => a.id === accId ? { ...a, status: "checking" as const } : a);
      saveAccounts(upd);
      return upd;
    });

    const acc = accounts.find(a => a.id === accId);
    if (!acc) return;

    try {
      const r = await apiFetch<{
        valid: boolean; userId?: number; username?: string; displayName?: string;
        avatarUrl?: string | null; robux?: number | null; isPremium?: boolean;
        friendCount?: number | null; error?: string;
      }>("/api/security/check-cookie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookie: acc.cookie }),
      });

      setAccounts(prev => {
        const upd = prev.map(a => {
          if (a.id !== accId) return a;
          if (r.valid) {
            return {
              ...a,
              status: "valid" as const,
              userId: r.userId!,
              username: r.username!,
              displayName: r.displayName!,
              avatarUrl: r.avatarUrl || null,
              label: r.displayName || r.username || a.label,
              robux: r.robux ?? null,
              isPremium: r.isPremium || false,
              friendCount: r.friendCount ?? null,
              lastChecked: Date.now(),
            };
          }
          return { ...a, status: "invalid" as const, lastChecked: Date.now() };
        });
        saveAccounts(upd);
        return upd;
      });
    } catch {
      setAccounts(prev => {
        const upd = prev.map(a => a.id === accId ? { ...a, status: "invalid" as const, lastChecked: Date.now() } : a);
        saveAccounts(upd);
        return upd;
      });
    }
  };

  const checkAllCookies = async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    setCheckingAll(true);

    const current = loadAccounts();
    for (let i = 0; i < current.length; i++) {
      if (!checkingRef.current) break;
      const acc = current[i];

      setAccounts(prev => {
        const upd = prev.map(a => a.id === acc.id ? { ...a, status: "checking" as const } : a);
        return upd;
      });

      try {
        const r = await apiFetch<{
          valid: boolean; userId?: number; username?: string; displayName?: string;
          avatarUrl?: string | null; robux?: number | null; isPremium?: boolean;
          friendCount?: number | null;
        }>("/api/security/check-cookie", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cookie: acc.cookie }),
        });

        setAccounts(prev => {
          const upd = prev.map(a => {
            if (a.id !== acc.id) return a;
            if (r.valid) {
              return {
                ...a,
                status: "valid" as const,
                userId: r.userId!,
                username: r.username!,
                displayName: r.displayName!,
                avatarUrl: r.avatarUrl || null,
                label: r.displayName || r.username || a.label,
                robux: r.robux ?? null,
                isPremium: r.isPremium || false,
                friendCount: r.friendCount ?? null,
                lastChecked: Date.now(),
              };
            }
            return { ...a, status: "invalid" as const, lastChecked: Date.now() };
          });
          saveAccounts(upd);
          return upd;
        });
      } catch {
        setAccounts(prev => {
          const upd = prev.map(a => a.id === acc.id ? { ...a, status: "invalid" as const, lastChecked: Date.now() } : a);
          saveAccounts(upd);
          return upd;
        });
      }

      if (i < current.length - 1) {
        await new Promise(r => setTimeout(r, 400));
      }
    }

    checkingRef.current = false;
    setCheckingAll(false);
    playSuccess();
    toast({ title: t("sec.checkAll"), description: "Done" });
  };

  const stopChecking = () => {
    checkingRef.current = false;
    setCheckingAll(false);
  };

  const deleteAccount = (id: string) => {
    const updated = accounts.filter(a => a.id !== id);
    saveAccounts(updated);
    setAccounts(updated);
    toast({ title: t("common.delete") });
  };

  const removeInvalid = () => {
    const updated = accounts.filter(a => a.status !== "invalid");
    saveAccounts(updated);
    setAccounts(updated);
    const removed = accounts.length - updated.length;
    toast({ title: `${removed} invalid cookies removed` });
  };

  const clearAll = () => {
    saveAccounts([]);
    setAccounts([]);
    toast({ title: t("sec.clearAll") });
  };

  const copyCookie = (cookie: string) => {
    navigator.clipboard.writeText(cookie);
    toast({ title: t("sec.copied") });
    playClick();
  };

  const copyAllValid = () => {
    const valid = accounts.filter(a => a.status === "valid").map(a => a.cookie);
    if (valid.length === 0) return;
    navigator.clipboard.writeText(valid.join("\n"));
    toast({ title: `${valid.length} cookies copied` });
    playClick();
  };

  const toggleShowCookie = (id: string) => {
    setShowCookies(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const validCount = accounts.filter(a => a.status === "valid").length;
  const invalidCount = accounts.filter(a => a.status === "invalid").length;
  const uncheckedCount = accounts.filter(a => a.status === "unchecked").length;
  const totalRobux = accounts.reduce((sum, a) => sum + (a.status === "valid" && a.robux ? a.robux : 0), 0);

  const testProxy = async () => {
    setTestingProxy(true); setProxyTestResult(null);
    try {
      const r = await apiFetch<{ ok: boolean; latency?: number; message: string }>("/api/security/proxy/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: proxyInput }),
      });
      setProxyTestResult(r);
      if (r.ok) playSuccess(); else playError();
    } catch (e) {
      setProxyTestResult({ ok: false, message: e instanceof Error ? e.message : t("common.error") });
    } finally { setTestingProxy(false); }
  };

  const saveProxyConfig = async () => {
    setSavingProxy(true);
    try {
      if (!proxyInput.trim()) {
        saveProxy(null);
        setProxyConfig(null);
        toast({ title: t("sec.proxyDisconnected") });
        return;
      }
      const cfg: ProxyConfig = { url: proxyInput.trim(), enabled: proxyEnabled, addedAt: Date.now() };
      saveProxy(cfg);
      setProxyConfig(cfg);
      await apiFetch("/api/security/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: cfg.url, enabled: cfg.enabled }),
      }).catch(() => {});
      logAppActivity("Proxy saved");
      toast({ title: `✅ ${t("sec.proxyConnected")}` });
      playSuccess();
    } finally { setSavingProxy(false); }
  };

  const loadServerActivity = useCallback(async () => {
    try {
      const { log } = await apiFetch<{ log: ActivityEntry[] }>("/api/security/activity");
      const local = loadActivity();
      const merged = [...log.map((e: any) => ({ ...e, source: "server" as const })), ...local]
        .sort((a, b) => b.ts - a.ts)
        .slice(0, 300);
      setActivityLog(merged);
    } catch { setActivityLog(loadActivity()); }
  }, []);

  const clearActivity = async () => {
    await apiFetch("/api/security/activity", { method: "DELETE" }).catch(() => {});
    localStorage.removeItem(ACTIVITY_KEY);
    setActivityLog([]);
    toast({ title: t("sec.noLogs") });
  };

  useEffect(() => { if (tab === "activity") loadServerActivity(); }, [tab]);

  const tabs = [
    { id: "cookies", icon: <Cookie className="w-3.5 h-3.5" />, label: t("sec.cookieChecker") },
    { id: "session", icon: <Shield className="w-3.5 h-3.5" />, label: "Session Monitor" },
    { id: "activity", icon: <Activity className="w-3.5 h-3.5" />, label: "Activity Logs" },
    { id: "refresh", icon: <RefreshCw className="w-3.5 h-3.5" />, label: "Auto Refresh" },
    { id: "proxy", icon: <Globe className="w-3.5 h-3.5" />, label: "Proxy" },
  ];

  const filteredActivity = activityLog.filter(e =>
    !activityFilter || e.action.toLowerCase().includes(activityFilter.toLowerCase()) ||
    (e.detail || "").toLowerCase().includes(activityFilter.toLowerCase())
  );

  return (
    <div className="p-4 lg:p-8 w-full max-w-4xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center">
          <Shield className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("sec.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("sec.desc")}</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={v => { playClick(); setTab(v); }}>
        <div className="overflow-x-auto pb-1">
          <TabsList className="rounded-xl bg-secondary/50 border border-border p-1 h-auto gap-1 flex-nowrap inline-flex">
            {tabs.map(t => (
              <TabsTrigger key={t.id} value={t.id} className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-3 py-2 gap-1.5 whitespace-nowrap">
                {t.icon} {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="cookies" className="mt-4 space-y-4">
          <div className="grid grid-cols-4 gap-3">
            <Card className="rounded-2xl border-border/50">
              <CardContent className="pt-4 text-center">
                <p className="text-2xl font-bold text-green-600">{validCount}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{t("sec.validCount")}</p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-border/50">
              <CardContent className="pt-4 text-center">
                <p className="text-2xl font-bold text-red-500">{invalidCount}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{t("sec.invalidCount")}</p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-border/50">
              <CardContent className="pt-4 text-center">
                <p className="text-2xl font-bold text-gray-400">{uncheckedCount}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{t("sec.unchecked")}</p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-border/50">
              <CardContent className="pt-4 text-center">
                <div className="flex items-center justify-center gap-1">
                  <Coins className="w-4 h-4 text-yellow-500" />
                  <p className="text-2xl font-bold">{formatRobux(totalRobux)}</p>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">{t("sec.totalRobux")}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-2xl border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Plus className="w-4 h-4 text-blue-500" /> {t("sec.addCookies")}</CardTitle>
              <CardDescription>{t("sec.cookieCheckerDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                placeholder={t("sec.pasteCookies")}
                value={bulkInput}
                onChange={e => setBulkInput(e.target.value)}
                className="rounded-xl font-mono text-xs min-h-[100px] resize-y"
              />
              <div className="flex gap-2">
                <Button className="flex-1 rounded-xl gap-1.5" onClick={addBulkCookies} disabled={!bulkInput.trim()}>
                  <Plus className="w-4 h-4" /> {t("sec.bulkAdd")}
                </Button>
              </div>
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-700 dark:text-amber-300 flex gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>{t("sec.cookie")}</p>
              </div>
            </CardContent>
          </Card>

          {accounts.length > 0 && (
            <Card className="rounded-2xl border-border/50">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Cookie className="w-4 h-4" /> {t("sec.accounts")}
                    <Badge variant="outline" className="ml-1">{accounts.length}</Badge>
                  </CardTitle>
                  <div className="flex gap-1.5">
                    {checkingAll ? (
                      <Button size="sm" variant="destructive" className="rounded-xl gap-1.5 text-xs h-8" onClick={stopChecking}>
                        <X className="w-3.5 h-3.5" /> Stop
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="rounded-xl gap-1.5 text-xs h-8" onClick={checkAllCookies}>
                        <RefreshCw className="w-3.5 h-3.5" /> {accounts.some(a => a.status !== "unchecked") ? t("sec.recheckAll") : t("sec.checkAll")}
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="rounded-xl gap-1.5 text-xs h-8" onClick={copyAllValid} disabled={validCount === 0}>
                      <Copy className="w-3.5 h-3.5" /> {t("sec.copyAll")}
                    </Button>
                    {invalidCount > 0 && (
                      <Button size="sm" variant="ghost" className="rounded-xl gap-1.5 text-xs h-8 text-red-500 hover:bg-red-500/10" onClick={removeInvalid}>
                        <Trash2 className="w-3.5 h-3.5" /> {t("sec.removeInvalid")}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="rounded-xl h-8 w-8 p-0 text-red-500 hover:bg-red-500/10" onClick={clearAll}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[600px] overflow-y-auto">
                {accounts.map((acc, idx) => (
                  <motion.div
                    key={acc.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(idx * 0.02, 0.3) }}
                    className={`rounded-xl border p-3 transition-colors ${
                      acc.status === "valid" ? "border-green-500/30 bg-green-500/5" :
                      acc.status === "invalid" ? "border-red-500/30 bg-red-500/5" :
                      acc.status === "checking" ? "border-blue-500/30 bg-blue-500/5" :
                      "border-border/50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {acc.status === "valid" && acc.avatarUrl ? (
                        <img src={acc.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                      ) : acc.status === "valid" && acc.userId ? (
                        <img src={robloxHeadshot(acc.userId)} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className={`w-10 h-10 rounded-full shrink-0 flex items-center justify-center ${
                          acc.status === "checking" ? "bg-blue-500/20" :
                          acc.status === "invalid" ? "bg-red-500/20" :
                          "bg-secondary"
                        }`}>
                          {acc.status === "checking" ? <Loader2 className="w-5 h-5 animate-spin text-blue-500" /> :
                           acc.status === "invalid" ? <XCircle className="w-5 h-5 text-red-500" /> :
                           <Cookie className="w-5 h-5 text-muted-foreground" />}
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold truncate">
                            {acc.status === "valid" ? acc.displayName || acc.username : acc.label}
                          </p>
                          {acc.status === "valid" && (
                            <Badge className="text-[9px] bg-green-500/20 text-green-700 border-0 shrink-0">{t("sec.verified")}</Badge>
                          )}
                          {acc.status === "invalid" && (
                            <Badge className="text-[9px] bg-red-500/20 text-red-700 border-0 shrink-0">{t("sec.invalid")}</Badge>
                          )}
                          {acc.status === "unchecked" && (
                            <Badge variant="outline" className="text-[9px] shrink-0">{t("sec.unchecked")}</Badge>
                          )}
                          {acc.status === "checking" && (
                            <Badge className="text-[9px] bg-blue-500/20 text-blue-700 border-0 shrink-0">{t("sec.checking")}</Badge>
                          )}
                        </div>

                        {acc.status === "valid" && (
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-xs text-muted-foreground">@{acc.username}</span>
                            <span className="text-xs text-muted-foreground">ID: {acc.userId}</span>
                          </div>
                        )}

                        {acc.status === "valid" && (
                          <div className="flex items-center gap-3 mt-1.5">
                            <div className="flex items-center gap-1">
                              <Coins className="w-3 h-3 text-yellow-500" />
                              <span className="text-xs font-semibold">{formatRobux(acc.robux)}</span>
                            </div>
                            {acc.isPremium && (
                              <div className="flex items-center gap-1">
                                <Crown className="w-3 h-3 text-yellow-500" />
                                <span className="text-xs text-yellow-600">{t("sec.premium")}</span>
                              </div>
                            )}
                            {acc.friendCount !== null && acc.friendCount !== undefined && (
                              <div className="flex items-center gap-1">
                                <UserCheck className="w-3 h-3 text-blue-500" />
                                <span className="text-xs text-muted-foreground">{acc.friendCount} {t("sec.friends")}</span>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="mt-1.5">
                          <p className={`text-[10px] font-mono text-muted-foreground truncate ${showCookies.has(acc.id) ? "" : "blur-sm select-none"}`}>
                            {showCookies.has(acc.id) ? acc.cookie : `${"•".repeat(40)}`}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1 shrink-0">
                        {acc.status !== "checking" && (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-lg" onClick={() => checkSingleCookie(acc.id)} title={t("sec.verify")}>
                            <RefreshCw className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-lg" onClick={() => toggleShowCookie(acc.id)} title={showCookies.has(acc.id) ? t("sec.hideCookie") : t("sec.showCookie")}>
                          {showCookies.has(acc.id) ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-lg" onClick={() => copyCookie(acc.cookie)} title={t("sec.copyCookie")}>
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-lg text-red-500 hover:bg-red-500/10" onClick={() => deleteAccount(acc.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="session" className="mt-4 space-y-4">
          <Card className="rounded-2xl border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2"><Shield className="w-4 h-4 text-blue-500" /> Session Monitor</CardTitle>
                <CardDescription>{t("sec.currentSession")}</CardDescription>
              </div>
              <Button size="sm" variant="outline" className="rounded-xl gap-1.5" onClick={() => { loadSessionInfo(); checkSession(); }} disabled={sessionLoading}>
                <RefreshCw className={`w-3.5 h-3.5 ${sessionLoading ? "animate-spin" : ""}`} />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className={`flex items-center gap-3 rounded-xl border p-4 ${sessionHealthy === true ? "border-green-500/30 bg-green-500/5" : sessionHealthy === false ? "border-red-500/30 bg-red-500/5" : "border-border/50"}`}>
                <div className={`w-3 h-3 rounded-full shrink-0 ${sessionHealthy === true ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" : sessionHealthy === false ? "bg-red-500" : "bg-gray-400"} ${sessionHealthy === true ? "animate-pulse" : ""}`} />
                <div className="flex-1">
                  <p className="text-sm font-semibold">
                    {sessionHealthy === true ? t("sec.active") : sessionHealthy === false ? t("sec.expired") : t("sec.verify") + "..."}
                  </p>
                  {lastChecked && <p className="text-xs text-muted-foreground">{t("sec.verify")}: {timeAgo(lastChecked)}</p>}
                </div>
                <Badge variant="outline" className={sessionHealthy === true ? "border-green-500/30 text-green-600" : "border-red-500/30 text-red-600"}>
                  {sessionHealthy === true ? "Online" : sessionHealthy === false ? "Offline" : "Checking"}
                </Badge>
              </div>

              {sessionLoading ? (
                <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
              ) : sessionInfo ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-3 rounded-xl border border-border/50 p-3">
                    {sessionInfo.avatarUrl && <img src={sessionInfo.avatarUrl} alt="" className="w-10 h-10 rounded-full shrink-0" />}
                    <div className="flex-1">
                      <p className="text-sm font-semibold">{sessionInfo.displayName}</p>
                      <p className="text-xs text-muted-foreground">@{sessionInfo.username} • ID: {sessionInfo.userId}</p>
                    </div>
                  </div>
                  {[
                    { icon: <Lock className="w-4 h-4" />, label: t("sec.cookie"), value: sessionInfo.maskedCookie, mono: true },
                    { icon: <Clock className="w-4 h-4" />, label: t("sec.currentSession"), value: sessionInfo.sessionCreatedAt ? timeAgo(sessionInfo.sessionCreatedAt) : "—" },
                    { icon: <Activity className="w-4 h-4" />, label: t("sec.logs"), value: String(sessionInfo.activityCount) },
                    { icon: <Users className="w-4 h-4" />, label: t("sec.accounts"), value: String(accounts.length) },
                    { icon: <Globe className="w-4 h-4" />, label: t("sec.proxy"), value: sessionInfo.proxyEnabled ? t("sec.proxyConnected") : t("sec.proxyDisconnected") },
                  ].map(({ icon, label, value, mono }) => (
                    <div key={label} className="flex items-center gap-3 rounded-xl border border-border/50 p-3">
                      <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0 text-muted-foreground">{icon}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className={`text-sm font-medium ${mono ? "font-mono" : ""}`}>{value}</p>
                      </div>
                      {mono && (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => navigator.clipboard.writeText(value)}>
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Shield className="w-10 h-10 opacity-20 mx-auto mb-2" />
                  <p className="text-sm">{t("common.error")}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="mt-4 space-y-4">
          <Card className="rounded-2xl border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2"><Activity className="w-4 h-4 text-green-500" /> {t("sec.logs")}</CardTitle>
                <CardDescription>{t("sec.desc")}</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="rounded-xl gap-1.5" onClick={loadServerActivity}>
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
                <Button size="sm" variant="ghost" className="rounded-xl gap-1.5 text-red-500 hover:bg-red-500/10" onClick={clearActivity}>
                  <Trash2 className="w-3.5 h-3.5" /> {t("common.delete")}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder={t("sec.logs")}
                value={activityFilter}
                onChange={e => setActivityFilter(e.target.value)}
                className="rounded-xl"
              />
              {filteredActivity.length === 0 ? (
                <div className="flex flex-col items-center py-10 text-muted-foreground gap-2">
                  <Activity className="w-10 h-10 opacity-20" />
                  <p className="text-sm">{t("sec.noLogs")}</p>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
                  {filteredActivity.map((entry, i) => (
                    <motion.div
                      key={entry.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: Math.min(i * 0.01, 0.2) }}
                      className="flex items-start gap-3 rounded-xl border border-border/50 p-2.5"
                    >
                      <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${entry.source === "server" ? "bg-blue-500" : "bg-violet-500"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{entry.action}</p>
                        {entry.detail && <p className="text-xs text-muted-foreground truncate">{entry.detail}</p>}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[10px] text-muted-foreground">{timeAgo(entry.ts)}</p>
                        <Badge variant="outline" className={`text-[8px] mt-0.5 ${entry.source === "server" ? "border-blue-500/30 text-blue-500" : "border-violet-500/30 text-violet-500"}`}>
                          {entry.source}
                        </Badge>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground text-center">
                {filteredActivity.length} {t("sec.logs")} • 500
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="refresh" className="mt-4 space-y-4">
          <Card className="rounded-2xl border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><RefreshCw className="w-4 h-4 text-amber-500" /> Auto Cookie Refresh</CardTitle>
              <CardDescription>{t("sec.desc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-border/50 p-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${autoRefresh ? "bg-green-500/10" : "bg-secondary"}`}>
                    {autoRefresh ? <Wifi className="w-5 h-5 text-green-500" /> : <WifiOff className="w-5 h-5 text-muted-foreground" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{autoRefresh ? t("sec.active") : t("sec.proxyDisconnected")}</p>
                    <p className="text-xs text-muted-foreground">{t("sec.verify")}</p>
                  </div>
                </div>
                <Switch
                  checked={autoRefresh}
                  onCheckedChange={v => {
                    setAutoRefresh(v);
                    localStorage.setItem("limitedink_auto_refresh", String(v));
                    playClick();
                    if (v) toast({ title: `✅ ${t("sec.active")}` });
                  }}
                />
              </div>

              {sessionHealthy !== null && (
                <div className={`flex items-center gap-3 rounded-xl border p-3 ${sessionHealthy ? "border-green-500/20 bg-green-500/5" : "border-red-500/20 bg-red-500/5"}`}>
                  {sessionHealthy ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <XCircle className="w-5 h-5 text-red-500" />}
                  <div>
                    <p className="text-sm font-semibold">{sessionHealthy ? t("sec.verified") : t("sec.expired")}</p>
                    <p className="text-xs text-muted-foreground">{lastChecked ? `${t("sec.verify")}: ${timeAgo(lastChecked)}` : t("sec.verify")}</p>
                  </div>
                </div>
              )}

              <Button className="w-full rounded-xl gap-1.5" variant="outline" onClick={checkSession} disabled={sessionLoading}>
                <Zap className="w-4 h-4" /> {t("sec.verify")}
              </Button>

              <div className="rounded-xl bg-blue-500/10 border border-blue-500/20 p-3 text-xs text-blue-700 dark:text-blue-300 flex gap-2">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <p>{t("sec.cookie")}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="proxy" className="mt-4 space-y-4">
          <Card className="rounded-2xl border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Globe className="w-4 h-4 text-blue-500" /> {t("sec.proxy")}</CardTitle>
              <CardDescription>{t("sec.proxyConfig")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">{t("sec.proxyUrl")}</label>
                <Input
                  placeholder="http://user:pass@host:port"
                  value={proxyInput}
                  onChange={e => { setProxyInput(e.target.value); setProxyTestResult(null); }}
                  className="rounded-xl font-mono text-xs"
                />
              </div>

              <div className="flex items-center justify-between rounded-xl border border-border/50 p-3">
                <div>
                  <p className="text-sm font-semibold">{t("sec.proxyConnected")}</p>
                  <p className="text-xs text-muted-foreground">{t("sec.proxyConfig")}</p>
                </div>
                <Switch checked={proxyEnabled} onCheckedChange={v => { setProxyEnabled(v); playClick(); }} />
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 rounded-xl gap-1.5" onClick={testProxy} disabled={testingProxy || !proxyInput.trim()}>
                  {testingProxy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                  {t("sec.verify")}
                </Button>
                <Button className="flex-1 rounded-xl gap-1.5" onClick={saveProxyConfig} disabled={savingProxy}>
                  {savingProxy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {t("common.save")}
                </Button>
                {proxyConfig && (
                  <Button variant="ghost" className="rounded-xl text-red-500 hover:bg-red-500/10" onClick={() => { setProxyInput(""); saveProxyConfig(); }}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>

              <AnimatePresence>
                {proxyTestResult && (
                  <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    <div className={`flex items-center gap-3 rounded-xl border p-3 ${proxyTestResult.ok ? "border-green-500/20 bg-green-500/5" : "border-red-500/20 bg-red-500/5"}`}>
                      {proxyTestResult.ok ? <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" /> : <XCircle className="w-5 h-5 text-red-500 shrink-0" />}
                      <div>
                        <p className="text-sm font-semibold">{proxyTestResult.ok ? t("sec.proxyConnected") : t("common.error")}</p>
                        <p className="text-xs text-muted-foreground">{proxyTestResult.message}</p>
                        {proxyTestResult.latency && <p className="text-xs text-muted-foreground">{proxyTestResult.latency}ms</p>}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {proxyConfig && (
                <div className="rounded-xl border border-border/50 p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("sec.proxy")}</p>
                  <p className="text-xs font-mono text-foreground">{proxyConfig.url.replace(/\/\/(.+):(.+)@/, "//***:***@")}</p>
                  <p className="text-xs text-muted-foreground">{timeAgo(proxyConfig.addedAt)} • {proxyConfig.enabled ? t("sec.active") : t("sec.proxyDisconnected")}</p>
                </div>
              )}

              <div className="rounded-xl bg-secondary/50 border border-border/50 p-3 text-xs text-muted-foreground space-y-1.5">
                <p className="font-semibold text-foreground">{t("sec.proxyConfig")}:</p>
                <p className="font-mono">http://user:pass@host:8080</p>
                <p className="font-mono">https://host:8080</p>
                <p className="font-mono">socks5://user:pass@host:1080</p>
                <p className="mt-2">{t("sec.proxyConfig")}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
