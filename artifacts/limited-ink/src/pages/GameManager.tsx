import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useGetRobloxGroups, getAuthCredentials } from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Gamepad2, Users, BarChart2, Star, Bell, RefreshCw, ExternalLink, Loader2,
  TrendingDown, TrendingUp, ThumbsUp, ThumbsDown, Eye, Heart, ChevronRight,
  AlertTriangle, CheckCircle2, Activity, Clock, ArrowLeft
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { useLanguage } from "@/contexts/LanguageContext";

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
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

interface Game {
  universeId: number;
  name: string;
  description: string;
  placeId: number;
  creator: { name: string };
  maxPlayers: number;
  playing: number;
  visits: number;
  favoritedCount: number;
  likeCount: number;
  dislikeCount: number;
  created: string;
  updated: string;
  thumbnail: string | null;
}

function formatNum(n: number) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}

function timeAgo(dateStr: string, t: (k: string) => string) {
  const now = Date.now();
  const d = new Date(dateStr).getTime();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return t("common.justNow");
  if (diff < 3600) return Math.floor(diff / 60) + " " + t("common.minAgo");
  if (diff < 86400) return Math.floor(diff / 3600) + " " + t("common.hAgo");
  if (diff < 2592000) return Math.floor(diff / 86400) + " " + t("common.dAgo");
  return Math.floor(diff / 2592000) + " " + t("common.monthAgo");
}

function RatingBar({ likeCount, dislikeCount }: { likeCount: number; dislikeCount: number }) {
  const total = likeCount + dislikeCount;
  const ratio = total > 0 ? Math.round((likeCount / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-green-600 flex items-center gap-1"><ThumbsUp className="w-3 h-3" /> {formatNum(likeCount)}</span>
        <span className="font-bold">{ratio}%</span>
        <span className="text-red-500 flex items-center gap-1">{formatNum(dislikeCount)} <ThumbsDown className="w-3 h-3" /></span>
      </div>
      <div className="h-1.5 bg-red-500/20 rounded-full overflow-hidden">
        <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${ratio}%` }} />
      </div>
    </div>
  );
}

// ── Shared group selector ─────────────────────────────────────────────────────
function useGroupGames(groupId: string | null) {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const { t } = useLanguage();

  const refresh = useCallback(async () => {
    if (!groupId) return;
    setLoading(true); setError(null);
    try {
      const { games: g } = await apiFetch<{ games: Game[] }>(`/api/game-manager/groups/${groupId}/games`);
      setGames(g);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      toast({ variant: "destructive", title: t("common.error"), description: e instanceof Error ? e.message : t("gm.failedLoad") });
    } finally { setLoading(false); }
  }, [groupId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { games, loading, error, refresh };
}

// ── PlaceManagerTab ───────────────────────────────────────────────────────────
function PlaceManagerTab({ games, loading, error, refresh }: { games: Game[]; loading: boolean; error: string | null; refresh: () => void }) {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const filtered = games.filter(g => !search || g.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Eye className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("gm.searchByName")} className="pl-9 rounded-xl" />
        </div>
        <Button variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} {t("common.refresh")}
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}
        </div>
      ) : error ? (
        <div className="text-center py-12 text-muted-foreground">
          <AlertTriangle className="w-10 h-10 mx-auto mb-2 text-red-400" />
          <p className="text-sm">{error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-muted-foreground gap-2">
          <Gamepad2 className="w-12 h-12 opacity-20" />
          <p className="text-sm">{search ? t("gm.noGames") : t("gm.noPublicGames")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map(game => (
            <motion.div key={game.universeId} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="rounded-2xl border-border/50 overflow-hidden hover:border-black/20 transition-colors">
                {game.thumbnail ? (
                  <div className="h-36 overflow-hidden bg-secondary">
                    <img src={game.thumbnail} alt={game.name} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="h-28 bg-gradient-to-br from-secondary to-background flex items-center justify-center">
                    <Gamepad2 className="w-10 h-10 text-muted-foreground/20" />
                  </div>
                )}
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start gap-2 justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm leading-tight">{game.name}</p>
                      {game.creator && <p className="text-xs text-muted-foreground">@{game.creator.name}</p>}
                    </div>
                    {game.placeId && (
                      <a href={`https://www.roblox.com/games/${game.placeId}`} target="_blank" rel="noreferrer"
                        className="text-muted-foreground hover:text-foreground transition-colors shrink-0 p-1">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-secondary/50 p-2">
                      <p className="text-sm font-bold text-green-600">{formatNum(game.playing)}</p>
                      <p className="text-[10px] text-muted-foreground">{t("gm.online")}</p>
                    </div>
                    <div className="rounded-xl bg-secondary/50 p-2">
                      <p className="text-sm font-bold">{formatNum(game.visits)}</p>
                      <p className="text-[10px] text-muted-foreground">{t("gm.visits")}</p>
                    </div>
                    <div className="rounded-xl bg-secondary/50 p-2">
                      <p className="text-sm font-bold text-rose-500">{formatNum(game.favoritedCount)}</p>
                      <p className="text-[10px] text-muted-foreground">{t("gm.favorites")}</p>
                    </div>
                  </div>
                  <RatingBar likeCount={game.likeCount} dislikeCount={game.dislikeCount} />
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{t("gm.updated")}: {timeAgo(game.updated, t)}</span>
                    <span>{t("gm.maxPlayers").replace("{n}", String(game.maxPlayers))}</span>
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

// ── PlayerCountTab ────────────────────────────────────────────────────────────
function PlayerCountTab({ games, loading, refresh }: { games: Game[]; loading: boolean; refresh: () => void }) {
  const { t } = useLanguage();
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const doRefresh = useCallback(async () => {
    await refresh();
    setLastUpdated(new Date());
  }, [refresh]);

  useEffect(() => {
    if (autoRefresh) {
      timerRef.current = setInterval(doRefresh, 30000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [autoRefresh, doRefresh]);

  const sorted = [...games].sort((a, b) => b.playing - a.playing);
  const total = games.reduce((s, g) => s + g.playing, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Switch id="auto-refresh" checked={autoRefresh} onCheckedChange={setAutoRefresh} />
          <Label htmlFor="auto-refresh" className="text-sm">{t("gm.autoRefresh")}</Label>
        </div>
        <Button variant="outline" size="sm" className="rounded-xl gap-1.5 ml-auto" onClick={doRefresh} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} {t("common.refresh")}
        </Button>
        {lastUpdated && <p className="text-xs text-muted-foreground">{t("gm.updated")}: {lastUpdated.toLocaleTimeString()}</p>}
      </div>

      {autoRefresh && (
        <div className="flex items-center gap-2 rounded-xl border border-green-500/20 bg-green-500/5 px-4 py-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
          <p className="text-xs text-green-700">{t("gm.trackingActive")}</p>
        </div>
      )}

      <Card className="rounded-2xl border-black/10">
        <CardContent className="pt-4 flex items-center justify-between">
          <div>
            <p className="text-3xl font-bold">{formatNum(total)}</p>
            <p className="text-sm text-muted-foreground">{t("gm.totalOnline")}</p>
          </div>
          <Activity className="w-10 h-10 text-muted-foreground/20" />
        </CardContent>
      </Card>

      {loading && !games.length ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground"><Users className="w-10 h-10 mx-auto mb-2 opacity-20" /><p className="text-sm">{t("common.noData")}</p></div>
      ) : (
        <div className="space-y-2">
          {sorted.map((game, idx) => {
            const maxPlaying = sorted[0].playing || 1;
            const pct = (game.playing / maxPlaying) * 100;
            return (
              <motion.div key={game.universeId} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.04 }}>
                <Card className="rounded-2xl border-border/50 hover:border-black/20 transition-colors">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-xs font-bold shrink-0 text-muted-foreground">
                      {idx + 1}
                    </div>
                    {game.thumbnail && <img src={game.thumbnail} className="w-10 h-10 rounded-xl object-cover shrink-0" alt="" />}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-sm truncate">{game.name}</p>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${game.playing > 0 ? "bg-green-500 animate-pulse" : "bg-gray-300"}`} />
                          <span className="font-bold text-sm">{formatNum(game.playing)}</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                        <motion.div className="h-full bg-black rounded-full" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6 }} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── VisitHistoryTab ───────────────────────────────────────────────────────────
function VisitHistoryTab({ games, groupId }: { games: Game[]; groupId: string }) {
  const { t } = useLanguage();
  const [selectedUid, setSelectedUid] = useState<string>("");
  const [snapshots, setSnapshots] = useState<{ ts: number; playing: number; visits: number }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (games.length && !selectedUid) setSelectedUid(String(games[0].universeId)); }, [games]);

  useEffect(() => {
    if (!selectedUid) return;
    setLoading(true);
    apiFetch<{ snapshots: { ts: number; playing: number; visits: number }[] }>(`/api/game-manager/universe/${selectedUid}/history`)
      .then(({ snapshots: s }) => setSnapshots(s))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedUid]);

  const chartData = snapshots.map(s => ({
    time: new Date(s.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    playing: s.playing,
    visits: s.visits,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={selectedUid} onValueChange={setSelectedUid}>
          <SelectTrigger className="w-64 rounded-xl h-9">
            <SelectValue placeholder={t("gm.selectGame")} />
          </SelectTrigger>
          <SelectContent>
            {games.map(g => <SelectItem key={g.universeId} value={String(g.universeId)}>{g.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Badge variant="outline" className="text-xs">{snapshots.length} {t("gm.dataPoints")}</Badge>
      </div>

      {loading ? (
        <Skeleton className="h-72 rounded-2xl" />
      ) : snapshots.length < 2 ? (
        <Card className="rounded-2xl border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <Clock className="w-12 h-12 opacity-20" />
            <p className="text-sm font-medium">{t("gm.notEnoughData")}</p>
            <p className="text-xs text-center">{t("gm.notEnoughDataDesc")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card className="rounded-2xl border-border/50">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold text-muted-foreground">{t("gm.onlinePlayers")}</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-4">
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData} margin={{ top: 4, right: 16, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                  <Tooltip contentStyle={{ borderRadius: "12px", fontSize: "12px", border: "1px solid hsl(var(--border))" }} />
                  <Line type="monotone" dataKey="playing" name={t("gm.online")} stroke="#000" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/50">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold text-muted-foreground">{t("gm.totalVisits")}</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-4">
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={chartData} margin={{ top: 4, right: 16, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={v => formatNum(v)} />
                  <Tooltip contentStyle={{ borderRadius: "12px", fontSize: "12px", border: "1px solid hsl(var(--border))" }} formatter={(v: any) => [formatNum(v), t("gm.visits")]} />
                  <Line type="monotone" dataKey="visits" name={t("gm.visits")} stroke="#6366f1" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ── RatingMonitorTab ──────────────────────────────────────────────────────────
function RatingMonitorTab({ games, loading }: { games: Game[]; loading: boolean }) {
  const { t } = useLanguage();
  const sorted = [...games].sort((a, b) => {
    const ra = a.likeCount + a.dislikeCount > 0 ? a.likeCount / (a.likeCount + a.dislikeCount) : 0;
    const rb = b.likeCount + b.dislikeCount > 0 ? b.likeCount / (b.likeCount + b.dislikeCount) : 0;
    return rb - ra;
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="rounded-2xl border-green-500/20 bg-green-500/5">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-1">{t("gm.bestRating")}</p>
            <p className="font-bold text-sm">{sorted[0]?.name || "—"}</p>
            {sorted[0] && <RatingBar likeCount={sorted[0].likeCount} dislikeCount={sorted[0].dislikeCount} />}
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-border/50">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-1">{t("gm.totalLikes")}</p>
            <p className="text-2xl font-bold text-green-600">{formatNum(games.reduce((s, g) => s + g.likeCount, 0))}</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-border/50">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-1">{t("gm.totalDislikes")}</p>
            <p className="text-2xl font-bold text-red-500">{formatNum(games.reduce((s, g) => s + g.dislikeCount, 0))}</p>
          </CardContent>
        </Card>
      </div>

      {loading && !games.length ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
      ) : (
        <div className="space-y-2">
          {sorted.map((game, idx) => {
            const total = game.likeCount + game.dislikeCount;
            const ratio = total > 0 ? Math.round((game.likeCount / total) * 100) : 0;
            const emoji = ratio >= 80 ? "🟢" : ratio >= 60 ? "🟡" : "🔴";
            return (
              <Card key={game.universeId} className="rounded-2xl border-border/50">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-sm truncate">{game.name}</p>
                        <Badge variant="outline" className={`text-[10px] shrink-0 ml-2 ${ratio >= 80 ? "border-green-500/30 text-green-600" : ratio >= 60 ? "border-amber-500/30 text-amber-600" : "border-red-500/30 text-red-600"}`}>{ratio}%</Badge>
                      </div>
                    </div>
                  </div>
                  <RatingBar likeCount={game.likeCount} dislikeCount={game.dislikeCount} />
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span>💜 {formatNum(game.favoritedCount)} {t("gm.favShort")}</span>
                    <span>👁 {formatNum(game.visits)} {t("gm.visitsShort")}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── PlayerDropAlertTab ────────────────────────────────────────────────────────
function PlayerDropAlertTab({ games }: { games: Game[] }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [alerts, setAlerts] = useState<Record<number, { enabled: boolean; threshold: number }>>({});
  const [triggered, setTriggered] = useState<{ universeId: number; current: number; previous: number; drop: number }[]>([]);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    games.forEach(async g => {
      try {
        const { settings } = await apiFetch<{ settings: { enabled: boolean; threshold: number } }>(`/api/game-manager/universe/${g.universeId}/alerts`);
        setAlerts(p => ({ ...p, [g.universeId]: settings }));
      } catch {}
    });
  }, [games]);

  const saveAlert = async (uid: number) => {
    const setting = alerts[uid] || { enabled: false, threshold: 20 };
    setSavingId(uid);
    try {
      await apiFetch(`/api/game-manager/universe/${uid}/alerts`, { method: "POST", body: JSON.stringify(setting) });
      toast({ title: setting.enabled ? "✅ " + t("gm.alertOn") : "⏸️ " + t("gm.alertOff") });
    } catch {}
    finally { setSavingId(null); }
  };

  const checkAlerts = async () => {
    setChecking(true);
    try {
      const { alerts: a } = await apiFetch<{ alerts: typeof triggered }>("/api/game-manager/alerts/check");
      setTriggered(a);
      if (a.length > 0) {
        toast({ variant: "destructive", title: "⚠️ " + t("gm.dropsDetected"), description: `${a.length} ${t("gm.gamesDropped")}` });
      } else {
        toast({ title: "✅ " + t("gm.allNormal"), description: t("gm.noDrops") });
      }
    } catch {}
    finally { setChecking(false); }
  };

  const gameNames = Object.fromEntries(games.map(g => [g.universeId, g.name]));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">{t("gm.alertsTitle")}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{t("gm.alertsDesc")}</p>
        </div>
        <Button size="sm" className="rounded-xl gap-1.5" onClick={checkAlerts} disabled={checking}>
          {checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />} {t("gm.check")}
        </Button>
      </div>

      <AnimatePresence>
        {triggered.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Card className="rounded-2xl border-red-500/30 bg-red-500/5">
              <CardContent className="pt-4 space-y-2">
                <p className="text-sm font-semibold text-red-600 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" /> {t("gm.dropsDetected")}
                </p>
                {triggered.map(a => (
                  <div key={a.universeId} className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-card p-3">
                    <TrendingDown className="w-4 h-4 text-red-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{gameNames[a.universeId] || `Universe ${a.universeId}`}</p>
                      <p className="text-xs text-muted-foreground">{a.previous} → {a.current} {t("gm.players")}</p>
                    </div>
                    <Badge className="bg-red-500/15 text-red-700 border-red-500/30 shrink-0">-{a.drop}%</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {games.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground"><Bell className="w-10 h-10 mx-auto mb-2 opacity-20" /><p className="text-sm">{t("gm.noGamesAlerts")}</p></div>
      ) : (
        <div className="space-y-2">
          {games.map(game => {
            const setting = alerts[game.universeId] || { enabled: false, threshold: 20 };
            return (
              <Card key={game.universeId} className={`rounded-2xl border transition-colors ${setting.enabled ? "border-black/20 bg-secondary/20" : "border-border/50"}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    {game.thumbnail && <img src={game.thumbnail} className="w-10 h-10 rounded-xl object-cover shrink-0" alt="" />}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{game.name}</p>
                      <p className="text-xs text-muted-foreground">{t("gm.currentPlayers").replace("{n}", String(game.playing))}</p>
                    </div>
                    <Switch
                      checked={setting.enabled}
                      onCheckedChange={v => setAlerts(p => ({ ...p, [game.universeId]: { ...setting, enabled: v } }))}
                    />
                  </div>
                  {setting.enabled && (
                    <div className="flex items-center gap-3 pl-1">
                      <Label className="text-xs text-muted-foreground whitespace-nowrap">{t("gm.threshold")}:</Label>
                      <Input
                        type="number" min={1} max={99} value={setting.threshold}
                        onChange={e => setAlerts(p => ({ ...p, [game.universeId]: { ...setting, threshold: parseInt(e.target.value) || 20 } }))}
                        className="rounded-xl h-8 w-20 text-xs"
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                      <Button size="sm" className="rounded-xl h-8 gap-1.5 ml-auto text-xs" onClick={() => saveAlert(game.universeId)} disabled={savingId === game.universeId}>
                        {savingId === game.universeId ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} {t("common.save")}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main GameManager Page ─────────────────────────────────────────────────────
export default function GameManager() {
  const { t } = useLanguage();
  const { data: groupsData, isLoading: groupsLoading } = useGetRobloxGroups();
  const groups = groupsData?.groups || [];
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("places");

  useEffect(() => {
    if (groups.length && !selectedGroupId) setSelectedGroupId(String(groups[0].id));
  }, [groups]);

  const { games, loading: gamesLoading, error, refresh } = useGroupGames(selectedGroupId);

  return (
    <div className="p-6 lg:p-10 w-full max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <Gamepad2 className="w-7 h-7" /> {t("gm.title")}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("gm.desc")}</p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          {groupsLoading ? <Skeleton className="h-9 w-52 rounded-xl" /> : (
            <Select value={selectedGroupId || ""} onValueChange={setSelectedGroupId}>
              <SelectTrigger className="w-64 rounded-xl h-9">
                <SelectValue placeholder={t("gm.selectGroup")} />
              </SelectTrigger>
              <SelectContent>
                {(groups || []).map((g: any) => (
                  <SelectItem key={g.id} value={String(g.id)}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        {games.length > 0 && (
          <Badge variant="outline" className="gap-1.5">
            <Gamepad2 className="w-3 h-3" /> {games.length} {t("gm.places")}
          </Badge>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="rounded-xl bg-secondary/50 border border-border p-1 h-auto gap-1 flex-wrap">
          <TabsTrigger value="places" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-4 py-2 flex items-center gap-1.5">
            <Gamepad2 className="w-3.5 h-3.5" /> {t("gm.places")}
          </TabsTrigger>
          <TabsTrigger value="players" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-4 py-2 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> {t("gm.playerCount")}
          </TabsTrigger>
          <TabsTrigger value="history" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-4 py-2 flex items-center gap-1.5">
            <BarChart2 className="w-3.5 h-3.5" /> {t("gm.visitHistory")}
          </TabsTrigger>
          <TabsTrigger value="ratings" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-4 py-2 flex items-center gap-1.5">
            <Star className="w-3.5 h-3.5" /> {t("gm.rating")}
          </TabsTrigger>
          <TabsTrigger value="alerts" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-4 py-2 flex items-center gap-1.5">
            <Bell className="w-3.5 h-3.5" /> {t("gm.alerts")}
          </TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="places" className="mt-0">
            <PlaceManagerTab games={games} loading={gamesLoading} error={error} refresh={refresh} />
          </TabsContent>
          <TabsContent value="players" className="mt-0">
            <PlayerCountTab games={games} loading={gamesLoading} refresh={refresh} />
          </TabsContent>
          <TabsContent value="history" className="mt-0">
            {selectedGroupId && <VisitHistoryTab games={games} groupId={selectedGroupId} />}
          </TabsContent>
          <TabsContent value="ratings" className="mt-0">
            <RatingMonitorTab games={games} loading={gamesLoading} />
          </TabsContent>
          <TabsContent value="alerts" className="mt-0">
            <PlayerDropAlertTab games={games} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
