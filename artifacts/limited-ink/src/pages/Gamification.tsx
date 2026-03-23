import { useState, useEffect, useCallback } from "react";
import { getAuthCredentials } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Trophy, BarChart2, Flame, Gift, Star, Lock, Zap, CheckCircle2,
  RefreshCw, Loader2, Crown, Medal, Award, Target, ArrowUp, TrendingUp
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function getAuthHeaders(): Record<string, string> {
  const { credentials } = getAuthCredentials();
  return credentials ? { Authorization: `Bearer ${credentials}` } : {};
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

interface Achievement { id: string; title: string; desc: string; icon: string; category: string; xp: number; unlocked: boolean }
interface Milestone { id: string; title: string; desc: string; icon: string; reward: string; target: number; current: number; metric: string; xp: number; reached: boolean; claimed: boolean }
interface LeaderboardEntry { username: string; avatar: string; xp: number; streak: number; invoices: number; drafts: number; rank: number; isMe: boolean; days?: number }
interface StreakData { currentStreak: number; longestStreak: number; lastLoginDate: string; totalLogins: number; streakStartDate: string }
interface LevelInfo { level: number; nextXP: number; prevXP: number; progress: number }

interface DashData {
  streak: StreakData;
  xp: number;
  level: LevelInfo;
  achievements: Achievement[];
  milestones: Milestone[];
  leaderboard: LeaderboardEntry[];
  newlyUnlocked: string[];
  metrics: Record<string, number | boolean>;
}

const LEVEL_NAMES: Record<number, string> = {
  1: "Новичок", 2: "Исследователь", 3: "Любитель", 4: "Практик",
  5: "Профи", 6: "Эксперт", 7: "Мастер", 8: "Гуру", 9: "Легенда", 10: "Иконa", 11: "Бог",
};
const LEVEL_COLORS: Record<number, string> = {
  1: "from-gray-400 to-gray-600", 2: "from-green-400 to-green-600", 3: "from-blue-400 to-blue-600",
  4: "from-indigo-400 to-indigo-600", 5: "from-purple-400 to-purple-600", 6: "from-pink-400 to-pink-600",
  7: "from-orange-400 to-orange-600", 8: "from-red-400 to-red-600", 9: "from-yellow-400 to-amber-600",
  10: "from-sky-400 to-cyan-600", 11: "from-black to-gray-700",
};
const ACH_CATEGORIES: Record<string, string> = {
  platform: "🌐 Платформа", streak: "🔥 Стрики", finance: "💰 Финансы", content: "📝 Контент", social: "📣 Соцсети",
};

// ── XP Level Bar ──────────────────────────────────────────────────────────────
function LevelBar({ data, loading }: { data: DashData | null; loading: boolean }) {
  if (loading || !data) return <Skeleton className="h-28 rounded-2xl" />;
  const { xp, level, streak } = data;
  const lv = level.level;
  const pct = Math.round(level.progress * 100);
  return (
    <Card className="rounded-2xl border-border/50 overflow-hidden">
      <CardContent className="p-0">
        <div className={`bg-gradient-to-r ${LEVEL_COLORS[lv] || LEVEL_COLORS[1]} p-5`}>
          <div className="flex items-center justify-between text-white">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-3xl font-black">Ур. {lv}</span>
                <span className="text-white/80 text-base font-semibold">{LEVEL_NAMES[lv] || "Легенда"}</span>
              </div>
              <p className="text-white/70 text-xs mt-0.5">{xp.toLocaleString()} XP</p>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-1.5 justify-end">
                <span className="text-2xl">🔥</span>
                <span className="text-2xl font-black">{streak.currentStreak}</span>
              </div>
              <p className="text-white/70 text-xs mt-0.5">день подряд</p>
            </div>
          </div>
          <div className="mt-4 space-y-1">
            <div className="flex justify-between text-[11px] text-white/70">
              <span>{xp - level.prevXP} XP сделано</span>
              <span>{level.nextXP - xp} XP до Ур. {lv + 1}</span>
            </div>
            <div className="h-2.5 bg-white/20 rounded-full overflow-hidden">
              <motion.div className="h-full bg-white rounded-full" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 1, ease: "easeOut" }} />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-4 divide-x divide-border/50">
          {[
            { label: "Достижений", value: data.achievements.filter(a => a.unlocked).length },
            { label: "Вайти всего", value: streak.totalLogins },
            { label: "Лучший стрик", value: streak.longestStreak },
            { label: "Вайлстоуны", value: data.milestones.filter(m => m.claimed).length },
          ].map(s => (
            <div key={s.label} className="text-center py-3">
              <p className="text-lg font-bold">{s.value}</p>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Achievements ──────────────────────────────────────────────────────────────
function AchievementsTab({ achievements, newlyUnlocked }: { achievements: Achievement[]; newlyUnlocked: string[] }) {
  const [filter, setFilter] = useState("all");
  const [showLocked, setShowLocked] = useState(true);
  const categories = ["all", ...Object.keys(ACH_CATEGORIES)];
  const unlockedCount = achievements.filter(a => a.unlocked).length;

  const filtered = achievements
    .filter(a => filter === "all" || a.category === filter)
    .filter(a => showLocked || a.unlocked);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1 flex-wrap">
          {categories.map(c => (
            <button key={c} onClick={() => setFilter(c)}
              className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition-colors ${filter === c ? "bg-black text-white" : "bg-secondary text-muted-foreground hover:bg-secondary/80"}`}>
              {c === "all" ? `Все (${unlockedCount}/${achievements.length})` : ACH_CATEGORIES[c]}
            </button>
          ))}
        </div>
        <button onClick={() => setShowLocked(p => !p)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          {showLocked ? "Скрыть заблокированные" : "Показать все"}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {filtered.map(ach => {
          const isNew = newlyUnlocked.includes(ach.id);
          return (
            <motion.div key={ach.id} initial={isNew ? { scale: 0.8, opacity: 0 } : {}} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 300 }}>
              <Card className={`rounded-2xl border transition-all relative overflow-hidden ${ach.unlocked ? "border-black/20 bg-card hover:shadow-md hover:-translate-y-0.5" : "border-border/30 bg-secondary/20 opacity-50"}`}>
                {isNew && <div className="absolute top-1.5 right-1.5 w-2 h-2 bg-yellow-400 rounded-full animate-ping" />}
                <CardContent className="pt-4 pb-3 text-center">
                  <div className={`text-3xl mb-2 transition-all ${ach.unlocked ? "" : "grayscale opacity-40"}`}>{ach.unlocked ? ach.icon : <Lock className="w-6 h-6 mx-auto text-muted-foreground" />}</div>
                  <p className={`text-xs font-bold leading-tight ${ach.unlocked ? "" : "text-muted-foreground"}`}>{ach.title}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{ach.desc}</p>
                  <div className={`mt-2 text-[10px] font-semibold ${ach.unlocked ? "text-yellow-600" : "text-muted-foreground/40"}`}>+{ach.xp} XP</div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ── Leaderboard ───────────────────────────────────────────────────────────────
const RANK_ICONS: Record<number, JSX.Element> = {
  1: <Crown className="w-4 h-4 text-yellow-500" />,
  2: <Medal className="w-4 h-4 text-gray-400" />,
  3: <Award className="w-4 h-4 text-amber-600" />,
};

function LeaderboardTab({ leaderboard }: { leaderboard: LeaderboardEntry[] }) {
  const [sortBy, setSortBy] = useState<"xp" | "streak" | "invoices" | "drafts">("xp");

  const sorted = [...leaderboard].sort((a, b) => {
    if (sortBy === "xp") return b.xp - a.xp;
    if (sortBy === "streak") return b.streak - a.streak;
    if (sortBy === "invoices") return b.invoices - a.invoices;
    return b.drafts - a.drafts;
  }).map((e, i) => ({ ...e, rank: i + 1 }));

  const meEntry = sorted.find(e => e.isMe);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-sm text-muted-foreground">Сортировать по:</p>
        {[["xp", "⚡ XP"], ["streak", "🔥 Стрик"], ["invoices", "🧾 Счета"], ["drafts", "✏️ Черновики"]].map(([k, v]) => (
          <button key={k} onClick={() => setSortBy(k as any)}
            className={`text-xs px-2.5 py-1 rounded-lg font-semibold border transition-colors ${sortBy === k ? "bg-black text-white border-black" : "border-border text-muted-foreground hover:border-black/30"}`}>{v}</button>
        ))}
      </div>

      {/* Top 3 podium */}
      <div className="flex items-end justify-center gap-3 py-4">
        {[sorted[1], sorted[0], sorted[2]].filter(Boolean).map((entry, idx) => {
          const heights = ["h-20", "h-28", "h-16"];
          const actualRank = idx === 0 ? 2 : idx === 1 ? 1 : 3;
          return (
            <div key={entry.username} className="flex flex-col items-center gap-1.5">
              <div className={`relative text-2xl w-12 h-12 rounded-2xl flex items-center justify-center font-bold ${entry.isMe ? "bg-black text-white ring-2 ring-offset-1 ring-black" : "bg-secondary"}`}>
                {entry.avatar}
                {actualRank <= 3 && <div className="absolute -top-1.5 -right-1.5">{RANK_ICONS[actualRank]}</div>}
              </div>
              <div className={`rounded-xl w-20 flex flex-col items-center justify-end pb-2 text-center ${heights[idx]} ${actualRank === 1 ? "bg-yellow-400/20 border border-yellow-400/30" : "bg-secondary/50"}`}>
                <p className={`text-lg font-black ${actualRank === 1 ? "text-yellow-600" : ""}`}>#{actualRank}</p>
                <p className="text-[9px] text-muted-foreground font-medium truncate w-full px-1">{entry.username}</p>
                <p className="text-[10px] font-bold">{entry.xp.toLocaleString()} XP</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Full list */}
      <div className="space-y-1.5">
        {sorted.map((entry) => (
          <div key={entry.username + entry.rank}
            className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${entry.isMe ? "border-black bg-black/5 font-bold" : "border-border/50 hover:border-black/20"}`}>
            <div className="w-7 text-center shrink-0">
              {RANK_ICONS[entry.rank] || <span className="text-sm font-bold text-muted-foreground">#{entry.rank}</span>}
            </div>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-base shrink-0 ${entry.isMe ? "bg-black text-white" : "bg-secondary"}`}>{entry.avatar}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-semibold truncate">{entry.username}</p>
                {entry.isMe && <Badge className="text-[9px] bg-black text-white shrink-0">Вы</Badge>}
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-[10px] text-muted-foreground">🔥{entry.streak}д</span>
                <span className="text-[10px] text-muted-foreground">🧾{entry.invoices}</span>
                <span className="text-[10px] text-muted-foreground">✏️{entry.drafts}</span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-bold">{entry.xp.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground">XP</p>
            </div>
          </div>
        ))}
      </div>

      {meEntry && (
        <div className="rounded-xl border border-black/20 bg-black/5 p-3 text-center">
          <p className="text-xs font-semibold">Ваше место: <span className="text-lg">#{meEntry.rank}</span> из {leaderboard.length}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {meEntry.rank > 1 ? `${(sorted[meEntry.rank - 2]?.xp - meEntry.xp).toLocaleString()} XP до позиции #${meEntry.rank - 1}` : "🏆 Вы на первом месте!"}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Daily Streak ──────────────────────────────────────────────────────────────
function StreakTab({ streak, xp, level }: { streak: StreakData | null; xp: number; level: LevelInfo | null }) {
  if (!streak) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const STREAK_REWARDS = [
    { days: 3, icon: "🔥", label: "On Fire", xp: 75 },
    { days: 7, icon: "💪", label: "Unstoppable", xp: 150 },
    { days: 14, icon: "🌙", label: "Fortnight", xp: 250 },
    { days: 30, icon: "🌟", label: "Dedicated", xp: 500 },
    { days: 60, icon: "🚀", label: "Hardcore", xp: 1000 },
    { days: 100, icon: "💎", label: "Legendary", xp: 2000 },
  ];

  // Generate last 30 days
  const today = new Date();
  const last30 = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (29 - i));
    return d.toISOString().slice(0, 10);
  });
  const streakStart = streak.streakStartDate;
  const lastLogin = streak.lastLoginDate;

  const isActiveDay = (dateStr: string) => {
    const start = new Date(streakStart);
    const check = new Date(dateStr);
    const last = new Date(lastLogin);
    return check >= start && check <= last;
  };

  const cur = streak.currentStreak;
  const nextReward = STREAK_REWARDS.find(r => r.days > cur);
  const lastReward = [...STREAK_REWARDS].reverse().find(r => r.days <= cur);

  return (
    <div className="space-y-5">
      {/* Main streak card */}
      <Card className="rounded-2xl border-border/50 overflow-hidden">
        <div className="bg-gradient-to-br from-orange-400 to-red-500 p-6 text-center text-white">
          <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 200 }}>
            <div className="text-5xl mb-1">🔥</div>
            <p className="text-6xl font-black">{cur}</p>
            <p className="text-white/80 text-sm mt-1">день подряд</p>
          </motion.div>
          {nextReward && (
            <div className="mt-4 bg-white/15 rounded-xl px-4 py-2">
              <p className="text-xs text-white/80">До следующей награды "{nextReward.label}" {nextReward.icon}</p>
              <div className="mt-1.5 h-2 bg-white/20 rounded-full overflow-hidden">
                <motion.div className="h-full bg-white rounded-full" initial={{ width: 0 }}
                  animate={{ width: `${(cur / nextReward.days) * 100}%` }} transition={{ duration: 1 }} />
              </div>
              <p className="text-[10px] text-white/60 mt-1">{cur}/{nextReward.days} дней (+{nextReward.xp} XP)</p>
            </div>
          )}
        </div>
        <CardContent className="pt-0">
          <div className="grid grid-cols-3 divide-x divide-border/50">
            {[
              { label: "Текущий стрик", value: cur + "д" },
              { label: "Лучший стрик", value: streak.longestStreak + "д" },
              { label: "Всего входов", value: streak.totalLogins },
            ].map(s => (
              <div key={s.label} className="text-center py-3">
                <p className="text-xl font-bold">{s.value}</p>
                <p className="text-[10px] text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Last 30 days heatmap */}
      <div className="space-y-2">
        <p className="text-sm font-semibold text-muted-foreground">Последние 30 дней</p>
        <div className="flex gap-1 flex-wrap">
          {last30.map(d => {
            const active = isActiveDay(d);
            const isToday = d === today.toISOString().slice(0, 10);
            return (
              <div key={d} title={d}
                className={`w-6 h-6 rounded-md transition-all ${isToday ? "ring-2 ring-black ring-offset-1" : ""} ${active ? "bg-orange-400" : "bg-secondary"}`} />
            );
          })}
        </div>
        <div className="flex gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-secondary inline-block" /> Пропущено</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-400 inline-block" /> Вход</span>
        </div>
      </div>

      {/* Streak milestone rewards */}
      <div className="space-y-2">
        <p className="text-sm font-semibold text-muted-foreground">Награды за стрик</p>
        {STREAK_REWARDS.map(r => {
          const reached = cur >= r.days;
          return (
            <div key={r.days} className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${reached ? "border-orange-400/30 bg-orange-400/5" : "border-border/40 opacity-50"}`}>
              <span className={`text-2xl ${reached ? "" : "grayscale"}`}>{r.icon}</span>
              <div className="flex-1">
                <p className={`text-sm font-bold ${reached ? "" : "text-muted-foreground"}`}>{r.label}</p>
                <p className="text-xs text-muted-foreground">{r.days} дней подряд</p>
              </div>
              <div className="text-right">
                <p className={`text-xs font-bold ${reached ? "text-orange-600" : "text-muted-foreground/40"}`}>+{r.xp} XP</p>
                {reached ? <CheckCircle2 className="w-4 h-4 text-green-500 ml-auto mt-0.5" /> : <p className="text-[10px] text-muted-foreground">{r.days - cur}д</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Milestones ────────────────────────────────────────────────────────────────
function MilestonesTab({ milestones, onClaim }: { milestones: Milestone[]; onClaim: (id: string) => void }) {
  const claimedCount = milestones.filter(m => m.claimed).length;
  const reachableCount = milestones.filter(m => m.reached && !m.claimed).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Вайлстоуны</p>
          <p className="text-xs text-muted-foreground">{claimedCount}/{milestones.length} получено</p>
        </div>
        {reachableCount > 0 && (
          <Badge className="bg-yellow-400/20 text-yellow-700 border-yellow-400/30 text-xs animate-pulse">🎁 {reachableCount} можно забрать!</Badge>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {milestones.map(ms => {
          const pct = Math.round((ms.current / ms.target) * 100);
          const canClaim = ms.reached && !ms.claimed;
          return (
            <Card key={ms.id}
              className={`rounded-2xl border transition-all ${ms.claimed ? "border-green-500/20 bg-green-500/5" : ms.reached ? "border-yellow-400/30 bg-yellow-400/5 shadow-md" : "border-border/50"}`}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className={`text-2xl shrink-0 ${ms.reached ? "" : "opacity-50"}`}>{ms.icon}</div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-bold text-sm ${ms.claimed ? "text-green-700" : ""}`}>{ms.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{ms.desc}</p>
                  </div>
                  <div className={`text-xs font-bold shrink-0 ${ms.reached ? "text-yellow-600" : "text-muted-foreground/40"}`}>+{ms.xp} XP</div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>{ms.current} / {ms.target}</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <motion.div
                      className={`h-full rounded-full ${ms.claimed ? "bg-green-500" : ms.reached ? "bg-yellow-400" : "bg-black"}`}
                      initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8 }} />
                  </div>
                </div>

                {ms.claimed ? (
                  <div className="flex items-center gap-1.5 text-green-600 text-xs font-semibold"><CheckCircle2 className="w-3.5 h-3.5" /> Получено!</div>
                ) : canClaim ? (
                  <Button size="sm" className="w-full rounded-xl gap-1.5 bg-yellow-400 text-yellow-900 hover:bg-yellow-500 text-xs" onClick={() => onClaim(ms.id)}>
                    <Gift className="w-3.5 h-3.5" /> Забрать {ms.reward}
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Gamification() {
  const { toast } = useToast();
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("achievements");
  const [shownNew, setShownNew] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiFetch<DashData>("/api/gamification/dashboard");
      setData(d);
      if (!shownNew && d.newlyUnlocked.length > 0) {
        setTimeout(() => {
          d.newlyUnlocked.forEach(id => {
            const ach = d.achievements.find(a => a.id === id);
            if (ach) toast({ title: `🏆 Достижение разблокировано!`, description: `${ach.icon} ${ach.title} (+${ach.xp} XP)` });
          });
        }, 800);
        setShownNew(true);
      }
    } catch {}
    finally { setLoading(false); }
  }, [shownNew]);

  useEffect(() => {
    load();
    // Track this section
    apiFetch("/api/gamification/visit", { method: "POST", body: JSON.stringify({ section: "gamification" }) }).catch(() => {});
  }, [load]);

  const claimMilestone = async (id: string) => {
    try {
      const { xpGained } = await apiFetch<{ xpGained: number }>(`/api/gamification/milestones/${id}/claim`, { method: "POST" });
      toast({ title: `🎁 Награда получена! +${xpGained} XP` });
      load();
    } catch (e) { toast({ variant: "destructive", title: "Ошибка", description: e instanceof Error ? e.message : "" }); }
  };

  return (
    <div className="p-6 lg:p-10 w-full max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3"><Trophy className="w-7 h-7" /> Gamification</h1>
          <p className="text-muted-foreground mt-1 text-sm">Достижения, рейтинги, стрики и вайлстоуны</p>
        </div>
        <Button variant="ghost" size="sm" className="rounded-xl gap-1.5" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </Button>
      </div>

      <LevelBar data={data} loading={loading} />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="rounded-xl bg-secondary/50 border border-border p-1 h-auto gap-1">
          <TabsTrigger value="achievements" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-4 py-2 flex items-center gap-1.5">
            <Star className="w-3.5 h-3.5" /> Достижения
            {data && <span className="text-[9px] opacity-60">({data.achievements.filter(a => a.unlocked).length}/{data.achievements.length})</span>}
          </TabsTrigger>
          <TabsTrigger value="leaderboard" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-4 py-2 flex items-center gap-1.5"><BarChart2 className="w-3.5 h-3.5" /> Рейтинг</TabsTrigger>
          <TabsTrigger value="streak" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-4 py-2 flex items-center gap-1.5"><Flame className="w-3.5 h-3.5" /> Стрик</TabsTrigger>
          <TabsTrigger value="milestones" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-4 py-2 flex items-center gap-1.5">
            <Gift className="w-3.5 h-3.5" /> Вайлстоуны
            {data && data.milestones.filter(m => m.reached && !m.claimed).length > 0 && (
              <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
            )}
          </TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="achievements" className="mt-0">
            {loading ? <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div>
              : data ? <AchievementsTab achievements={data.achievements} newlyUnlocked={data.newlyUnlocked} /> : null}
          </TabsContent>
          <TabsContent value="leaderboard" className="mt-0">
            {loading ? <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>
              : data ? <LeaderboardTab leaderboard={data.leaderboard} /> : null}
          </TabsContent>
          <TabsContent value="streak" className="mt-0">
            {loading ? <Skeleton className="h-64 rounded-2xl" />
              : data ? <StreakTab streak={data.streak} xp={data.xp} level={data.level} /> : null}
          </TabsContent>
          <TabsContent value="milestones" className="mt-0">
            {loading ? <div className="grid grid-cols-2 gap-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}</div>
              : data ? <MilestonesTab milestones={data.milestones} onClaim={claimMilestone} /> : null}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
