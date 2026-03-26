import { useState, useEffect, useCallback } from "react";
import { getAuthCredentials } from "@workspace/api-client-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2, Star, Package, Gamepad2, Gift, Check, X,
  Dices, CircleDot, Hash, RotateCcw, Cherry,
  Crown, Trophy, Sparkles, Timer, ChevronDown,
} from "lucide-react";

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
    const err = await r.json().catch(() => ({ error: "Network error" })) as { error?: string; remaining?: number };
    throw { message: err.error || "Request failed", remaining: err.remaining };
  }
  return r.json() as Promise<T>;
}

interface Accessory {
  id: number;
  name: string;
  nameRu: string | null;
  nameEs: string | null;
  description: string;
  descriptionRu: string | null;
  descriptionEs: string | null;
  icon: string;
  category: string;
  rarity: string;
  obtainMethod: string;
  eventTag: string | null;
  equipped?: boolean;
  obtainedAt?: string;
  userAccessoryId?: number;
}

interface GameStats {
  totalPlays: number;
  wins: number;
  cooldownRemaining: number;
}

const RARITY_COLORS: Record<string, string> = {
  common: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  rare: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  epic: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  legendary: "bg-amber-500/20 text-amber-400 border-amber-500/30",
};

const RARITY_GLOW: Record<string, string> = {
  common: "",
  rare: "shadow-[0_0_12px_rgba(59,130,246,0.15)]",
  epic: "shadow-[0_0_12px_rgba(147,51,234,0.2)]",
  legendary: "shadow-[0_0_16px_rgba(245,158,11,0.25)]",
};

const CATEGORY_ICONS: Record<string, string> = {
  frame: "🖼️",
  badge: "🏅",
  background: "🎨",
  title: "📛",
  effect: "✨",
};

interface MiniGame {
  id: string;
  icon: React.ReactNode;
  gradient: string;
}

const MINI_GAMES: MiniGame[] = [
  { id: "daily-spin", icon: <RotateCcw className="w-5 h-5" />, gradient: "from-amber-500/20 to-orange-500/20" },
  { id: "coin-flip", icon: <CircleDot className="w-5 h-5" />, gradient: "from-blue-500/20 to-cyan-500/20" },
  { id: "dice-roll", icon: <Dices className="w-5 h-5" />, gradient: "from-green-500/20 to-emerald-500/20" },
  { id: "number-guess", icon: <Hash className="w-5 h-5" />, gradient: "from-purple-500/20 to-pink-500/20" },
  { id: "slot-machine", icon: <Cherry className="w-5 h-5" />, gradient: "from-red-500/20 to-rose-500/20" },
];

export default function AccessoriesTab() {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const [subTab, setSubTab] = useState<"inventory" | "catalog" | "games">("inventory");
  const [catalog, setCatalog] = useState<Accessory[]>([]);
  const [inventory, setInventory] = useState<Accessory[]>([]);
  const [gameStats, setGameStats] = useState<Record<string, GameStats>>({});
  const [loading, setLoading] = useState(true);
  const [playingGame, setPlayingGame] = useState<string | null>(null);
  const [gameResult, setGameResult] = useState<any>(null);
  const [coinChoice, setCoinChoice] = useState<string>("heads");
  const [numberGuess, setNumberGuess] = useState<number>(5);
  const [cooldowns, setCooldowns] = useState<Record<string, number>>({});
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [expandedGame, setExpandedGame] = useState<string | null>(null);

  const getName = useCallback((acc: Accessory) => {
    if (language === "ru" && acc.nameRu) return acc.nameRu;
    if (language === "es" && acc.nameEs) return acc.nameEs;
    return acc.name;
  }, [language]);

  const getDesc = useCallback((acc: Accessory) => {
    if (language === "ru" && acc.descriptionRu) return acc.descriptionRu;
    if (language === "es" && acc.descriptionEs) return acc.descriptionEs;
    return acc.description;
  }, [language]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cat, inv, stats] = await Promise.all([
        apiFetch<Accessory[]>("/api/accessories/catalog"),
        apiFetch<Accessory[]>("/api/accessories/my"),
        apiFetch<Record<string, GameStats>>("/api/accessories/minigame/stats"),
      ]);
      setCatalog(cat);
      setInventory(inv);
      setGameStats(stats);
      const newCooldowns: Record<string, number> = {};
      Object.entries(stats).forEach(([gId, s]) => {
        if (s.cooldownRemaining > 0) newCooldowns[gId] = s.cooldownRemaining;
      });
      setCooldowns(newCooldowns);
    } catch {
      toast({ variant: "destructive", title: t("assistant.error") });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    const activeIds = Object.keys(cooldowns).filter(gId => cooldowns[gId] > 0);
    if (activeIds.length === 0) return;

    const interval = setInterval(() => {
      setCooldowns(prev => {
        const next: Record<string, number> = {};
        let changed = false;
        for (const [gId, sec] of Object.entries(prev)) {
          const v = sec - 1;
          if (v > 0) { next[gId] = v; }
          changed = true;
        }
        return changed ? next : prev;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [Object.keys(cooldowns).sort().join(",")]);

  const equip = async (accId: number) => {
    try {
      await apiFetch("/api/accessories/equip", { method: "POST", body: JSON.stringify({ accessoryId: accId }) });
      setInventory(prev => prev.map(a => {
        const target = prev.find(x => x.id === accId);
        if (!target) return a;
        if (a.category === target.category) return { ...a, equipped: a.id === accId };
        return a;
      }));
      toast({ title: t("acc.equipped") || "Equipped!" });
    } catch { toast({ variant: "destructive", title: t("assistant.error") }); }
  };

  const unequip = async (accId: number) => {
    try {
      await apiFetch("/api/accessories/unequip", { method: "POST", body: JSON.stringify({ accessoryId: accId }) });
      setInventory(prev => prev.map(a => a.id === accId ? { ...a, equipped: false } : a));
      toast({ title: t("acc.unequipped") || "Unequipped" });
    } catch { toast({ variant: "destructive", title: t("assistant.error") }); }
  };

  const playGame = async (gameId: string) => {
    setPlayingGame(gameId);
    setGameResult(null);
    try {
      let body: any = {};
      if (gameId === "coin-flip") body = { choice: coinChoice };
      if (gameId === "number-guess") body = { choice: numberGuess };
      const result = await apiFetch<any>(`/api/accessories/minigame/${gameId}/play`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setGameResult({ gameId, ...result });
      if (result.won && result.reward) {
        setInventory(prev => [...prev, { ...result.reward, equipped: false, obtainedAt: new Date().toISOString() }]);
      }
      const stats = await apiFetch<Record<string, GameStats>>("/api/accessories/minigame/stats");
      setGameStats(stats);
      const newCd: Record<string, number> = {};
      Object.entries(stats).forEach(([gId, s]) => {
        if (s.cooldownRemaining > 0) newCd[gId] = s.cooldownRemaining;
      });
      setCooldowns(prev => ({ ...prev, ...newCd }));
    } catch (err: any) {
      if (err?.remaining) {
        setCooldowns(prev => ({ ...prev, [gameId]: err.remaining }));
        toast({ variant: "destructive", title: t("acc.cooldown") || "Cooldown!", description: `${err.remaining}s` });
      } else {
        toast({ variant: "destructive", title: err?.message || t("assistant.error") });
      }
    } finally { setPlayingGame(null); }
  };

  const formatCooldown = (sec: number) => {
    if (sec >= 3600) {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      return `${h}h ${m}m`;
    }
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
  };

  const gameNames: Record<string, Record<string, string>> = {
    "daily-spin": { en: "Daily Spin", ru: "Ежедневное колесо", es: "Giro diario" },
    "coin-flip": { en: "Coin Flip", ru: "Монетка", es: "Lanzar moneda" },
    "dice-roll": { en: "Dice Roll", ru: "Кубики", es: "Lanzar dados" },
    "number-guess": { en: "Number Guess", ru: "Угадай число", es: "Adivina el número" },
    "slot-machine": { en: "Slot Machine", ru: "Слот-машина", es: "Tragamonedas" },
  };

  const getGameName = (id: string) => gameNames[id]?.[language] || gameNames[id]?.en || id;

  const ownedIds = new Set(inventory.map(i => i.id));
  const categories = ["all", "frame", "badge", "background", "title", "effect"];
  const catLabels: Record<string, Record<string, string>> = {
    all: { en: "All", ru: "Все", es: "Todo" },
    frame: { en: "Frames", ru: "Рамки", es: "Marcos" },
    badge: { en: "Badges", ru: "Значки", es: "Insignias" },
    background: { en: "Backgrounds", ru: "Фоны", es: "Fondos" },
    title: { en: "Titles", ru: "Титулы", es: "Títulos" },
    effect: { en: "Effects", ru: "Эффекты", es: "Efectos" },
  };

  const rarityLabels: Record<string, Record<string, string>> = {
    common: { en: "Common", ru: "Обычный", es: "Común" },
    rare: { en: "Rare", ru: "Редкий", es: "Raro" },
    epic: { en: "Epic", ru: "Эпический", es: "Épico" },
    legendary: { en: "Legendary", ru: "Легендарный", es: "Legendario" },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const filteredInventory = categoryFilter === "all" ? inventory : inventory.filter(a => a.category === categoryFilter);
  const filteredCatalog = categoryFilter === "all" ? catalog : catalog.filter(a => a.category === categoryFilter);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{t("acc.title") || "Accessories"}</h2>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="gap-1 text-xs">
            <Package className="w-3 h-3" /> {inventory.length}
          </Badge>
          <Badge variant="outline" className="gap-1 text-xs text-amber-500 border-amber-500/30">
            <Crown className="w-3 h-3" /> {inventory.filter(a => a.equipped).length}
          </Badge>
        </div>
      </div>

      <div className="flex gap-1 p-1 bg-secondary/50 rounded-xl">
        {(["inventory", "catalog", "games"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setSubTab(tab)}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
              subTab === tab ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "inventory" && <Package className="w-3.5 h-3.5" />}
            {tab === "catalog" && <Star className="w-3.5 h-3.5" />}
            {tab === "games" && <Gamepad2 className="w-3.5 h-3.5" />}
            {tab === "inventory" ? (t("acc.inventory") || "Inventory") : tab === "catalog" ? (t("acc.catalog") || "Catalog") : (t("acc.games") || "Mini Games")}
          </button>
        ))}
      </div>

      {(subTab === "inventory" || subTab === "catalog") && (
        <div className="flex gap-1 flex-wrap">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                categoryFilter === cat
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "bg-secondary/50 text-muted-foreground hover:text-foreground border border-transparent"
              }`}
            >
              {cat !== "all" && <span className="mr-1">{CATEGORY_ICONS[cat]}</span>}
              {catLabels[cat]?.[language] || catLabels[cat]?.en}
            </button>
          ))}
        </div>
      )}

      {subTab === "inventory" && (
        <div className="space-y-3">
          {filteredInventory.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="w-10 h-10 mx-auto mb-3 opacity-30" strokeWidth={1} />
              <p className="text-sm font-medium">{t("acc.emptyInventory") || "No accessories yet"}</p>
              <p className="text-xs mt-1">{t("acc.playGames") || "Play mini-games to earn accessories!"}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {filteredInventory.map(acc => (
                <motion.div
                  key={acc.id}
                  layout
                  className={`relative rounded-xl border p-3 transition-all ${
                    acc.equipped
                      ? "border-primary/50 bg-primary/5 " + RARITY_GLOW[acc.rarity]
                      : "border-border bg-card hover:bg-secondary/30"
                  }`}
                >
                  {acc.equipped && (
                    <div className="absolute top-2 right-2">
                      <Check className="w-4 h-4 text-primary" />
                    </div>
                  )}
                  <div className="text-2xl mb-2">{acc.icon}</div>
                  <p className="text-sm font-semibold truncate">{getName(acc)}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md border ${RARITY_COLORS[acc.rarity]}`}>
                      {rarityLabels[acc.rarity]?.[language] || acc.rarity}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{CATEGORY_ICONS[acc.category]}</span>
                  </div>
                  <button
                    onClick={() => acc.equipped ? unequip(acc.id) : equip(acc.id)}
                    className={`mt-2 w-full py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      acc.equipped
                        ? "bg-secondary text-muted-foreground hover:bg-secondary/80"
                        : "bg-primary/15 text-primary hover:bg-primary/25"
                    }`}
                  >
                    {acc.equipped ? (t("acc.unequip") || "Unequip") : (t("acc.equip") || "Equip")}
                  </button>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}

      {subTab === "catalog" && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {filteredCatalog.map(acc => {
            const owned = ownedIds.has(acc.id);
            return (
              <div
                key={acc.id}
                className={`rounded-xl border p-3 transition-all ${
                  owned
                    ? "border-green-500/30 bg-green-500/5"
                    : "border-border bg-card"
                } ${RARITY_GLOW[acc.rarity]}`}
              >
                <div className="flex items-start justify-between">
                  <div className="text-2xl">{acc.icon}</div>
                  {owned && <Check className="w-4 h-4 text-green-500" />}
                  {acc.obtainMethod === "event" && <Gift className="w-4 h-4 text-amber-500" />}
                </div>
                <p className="text-sm font-semibold truncate mt-1.5">{getName(acc)}</p>
                <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5 min-h-[28px]">{getDesc(acc)}</p>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-md border ${RARITY_COLORS[acc.rarity]}`}>
                    {rarityLabels[acc.rarity]?.[language] || acc.rarity}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{CATEGORY_ICONS[acc.category]}</span>
                </div>
                {!owned && (
                  <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
                    {acc.obtainMethod === "event" ? <Gift className="w-3 h-3" /> : <Gamepad2 className="w-3 h-3" />}
                    {acc.obtainMethod === "event"
                      ? (t("acc.eventOnly") || "Event exclusive")
                      : (t("acc.fromGames") || "Win in mini-games")}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {subTab === "games" && (
        <div className="space-y-3">
          {MINI_GAMES.map(game => {
            const stats = gameStats[game.id];
            const cd = cooldowns[game.id] || 0;
            const isExpanded = expandedGame === game.id;
            const isPlaying = playingGame === game.id;
            const showResult = gameResult?.gameId === game.id;

            return (
              <div key={game.id} className={`rounded-xl border border-border bg-gradient-to-r ${game.gradient} overflow-hidden`}>
                <button
                  onClick={() => setExpandedGame(isExpanded ? null : game.id)}
                  className="w-full flex items-center gap-3 p-4 text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-background/50 flex items-center justify-center shrink-0">
                    {game.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold">{getGameName(game.id)}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      {stats && (
                        <>
                          <span className="text-[11px] text-muted-foreground">
                            {t("acc.played") || "Played"}: {stats.totalPlays}
                          </span>
                          <span className="text-[11px] text-green-500">
                            {t("acc.wins") || "Wins"}: {stats.wins}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {cd > 0 && (
                      <span className="text-xs text-amber-500 flex items-center gap-1">
                        <Timer className="w-3 h-3" /> {formatCooldown(cd)}
                      </span>
                    )}
                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                  </div>
                </button>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 space-y-3">
                        {game.id === "coin-flip" && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => setCoinChoice("heads")}
                              className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-all ${
                                coinChoice === "heads"
                                  ? "border-primary bg-primary/15 text-primary"
                                  : "border-border bg-background/50 text-muted-foreground"
                              }`}
                            >
                              🪙 {language === "ru" ? "Орёл" : language === "es" ? "Cara" : "Heads"}
                            </button>
                            <button
                              onClick={() => setCoinChoice("tails")}
                              className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-all ${
                                coinChoice === "tails"
                                  ? "border-primary bg-primary/15 text-primary"
                                  : "border-border bg-background/50 text-muted-foreground"
                              }`}
                            >
                              🪙 {language === "ru" ? "Решка" : language === "es" ? "Cruz" : "Tails"}
                            </button>
                          </div>
                        )}

                        {game.id === "number-guess" && (
                          <div className="space-y-2">
                            <p className="text-xs text-muted-foreground">
                              {language === "ru" ? "Выберите число от 1 до 10:" : language === "es" ? "Elige un número del 1 al 10:" : "Pick a number from 1 to 10:"}
                            </p>
                            <div className="grid grid-cols-5 gap-1.5">
                              {[1,2,3,4,5,6,7,8,9,10].map(n => (
                                <button
                                  key={n}
                                  onClick={() => setNumberGuess(n)}
                                  className={`py-2 rounded-lg text-xs font-bold border transition-all ${
                                    numberGuess === n
                                      ? "border-primary bg-primary/15 text-primary"
                                      : "border-border bg-background/50 text-muted-foreground hover:text-foreground"
                                  }`}
                                >
                                  {n}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        <Button
                          onClick={() => playGame(game.id)}
                          disabled={isPlaying || cd > 0}
                          className="w-full rounded-xl gap-2"
                          size="sm"
                        >
                          {isPlaying ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : cd > 0 ? (
                            <Timer className="w-4 h-4" />
                          ) : (
                            <Gamepad2 className="w-4 h-4" />
                          )}
                          {cd > 0
                            ? `${formatCooldown(cd)}`
                            : isPlaying
                              ? (language === "ru" ? "Играем..." : language === "es" ? "Jugando..." : "Playing...")
                              : (language === "ru" ? "Играть" : language === "es" ? "Jugar" : "Play")}
                        </Button>

                        <AnimatePresence>
                          {showResult && (
                            <motion.div
                              initial={{ opacity: 0, y: -10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0 }}
                              className={`rounded-xl p-3 border ${
                                gameResult.won
                                  ? "bg-green-500/10 border-green-500/30"
                                  : "bg-red-500/10 border-red-500/30"
                              }`}
                            >
                              <div className="flex items-center gap-2 mb-1">
                                {gameResult.won ? (
                                  <Trophy className="w-4 h-4 text-green-500" />
                                ) : (
                                  <X className="w-4 h-4 text-red-500" />
                                )}
                                <span className={`text-sm font-bold ${gameResult.won ? "text-green-500" : "text-red-500"}`}>
                                  {gameResult.won
                                    ? (language === "ru" ? "Победа!" : language === "es" ? "¡Victoria!" : "You won!")
                                    : (language === "ru" ? "Не повезло" : language === "es" ? "Sin suerte" : "No luck")}
                                </span>
                              </div>

                              {game.id === "coin-flip" && gameResult.game && (
                                <p className="text-xs text-muted-foreground">
                                  {language === "ru" ? "Выпало" : "Result"}: {gameResult.game.result === "heads" ? "🪙 " + (language === "ru" ? "Орёл" : "Heads") : "🪙 " + (language === "ru" ? "Решка" : "Tails")}
                                </p>
                              )}
                              {game.id === "dice-roll" && gameResult.game && (
                                <p className="text-xs text-muted-foreground">
                                  🎲 {gameResult.game.dice1} + 🎲 {gameResult.game.dice2}
                                  {gameResult.game.doubles && " — Doubles!"}
                                </p>
                              )}
                              {game.id === "number-guess" && gameResult.game && (
                                <p className="text-xs text-muted-foreground">
                                  {language === "ru" ? "Загаданное число" : "Target"}: {gameResult.game.target}, {language === "ru" ? "ваше" : "yours"}: {gameResult.game.yourGuess}
                                </p>
                              )}
                              {game.id === "slot-machine" && gameResult.game?.reels && (
                                <p className="text-lg tracking-widest mt-1">
                                  {gameResult.game.reels.join(" ")}
                                </p>
                              )}

                              {gameResult.reward && (
                                <div className="mt-2 flex items-center gap-2 p-2 rounded-lg bg-background/50 border border-amber-500/20">
                                  <span className="text-xl">{gameResult.reward.icon}</span>
                                  <div>
                                    <p className="text-xs font-bold">{getName(gameResult.reward)}</p>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md border ${RARITY_COLORS[gameResult.reward.rarity]}`}>
                                      {rarityLabels[gameResult.reward.rarity]?.[language] || gameResult.reward.rarity}
                                    </span>
                                  </div>
                                  <Sparkles className="w-4 h-4 text-amber-500 ml-auto" />
                                </div>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function UserEquippedAccessories({ accessories: accs }: { accessories: Accessory[] }) {
  if (!accs || accs.length === 0) return null;

  const frames = accs.filter(a => a.category === "frame");
  const badges = accs.filter(a => a.category === "badge");
  const titles = accs.filter(a => a.category === "title");
  const effects = accs.filter(a => a.category === "effect");
  const backgrounds = accs.filter(a => a.category === "background");

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {titles.map(a => (
        <span key={a.id} className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center gap-0.5">
          {a.icon} {a.name}
        </span>
      ))}
      {badges.map(a => (
        <span key={a.id} title={a.name} className="text-sm">{a.icon}</span>
      ))}
      {frames.map(a => (
        <span key={a.id} title={a.name} className="text-sm">{a.icon}</span>
      ))}
      {effects.map(a => (
        <span key={a.id} title={a.name} className="text-sm">{a.icon}</span>
      ))}
    </div>
  );
}
