import { useState, useEffect, useCallback } from "react";
import { getAuthCredentials } from "@workspace/api-client-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { robloxHeadshot } from "@/lib/roblox";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Loader2, Star, Package, Gamepad2, Gift, Check, X,
  Crown, Trophy, Sparkles, ChevronDown,
  Swords, Target, Dices, Brain, Coins, Medal,
  ArrowRight, Clock, Users, Plus,
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

interface DuelChallenge {
  id: number;
  gameType: string;
  challengerId: number;
  opponentId: number | null;
  status: string;
  createdAt: string;
  challengerName: string;
  challengerAvatar: string | null;
  challengerRobloxUserId: number;
  opponentName?: string;
  opponentAvatar?: string | null;
  opponentRobloxUserId?: number;
  winnerId?: number;
  winnerName?: string;
  rewardAccessoryId?: number;
  challengerMove?: any;
  opponentMove?: any;
}

interface LeaderboardEntry {
  id: number;
  display_name: string;
  avatar_url: string | null;
  roblox_user_id: number;
  wins: number;
  total_games: number;
  win_rate: number;
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

interface GameDef {
  id: string;
  icon: React.ReactNode;
  gradient: string;
  color: string;
}

const DUEL_GAMES: GameDef[] = [
  { id: "rps", icon: <Swords className="w-5 h-5" />, gradient: "from-red-500/20 to-orange-500/20", color: "text-red-400" },
  { id: "number-war", icon: <Target className="w-5 h-5" />, gradient: "from-blue-500/20 to-cyan-500/20", color: "text-blue-400" },
  { id: "dice-battle", icon: <Dices className="w-5 h-5" />, gradient: "from-green-500/20 to-emerald-500/20", color: "text-green-400" },
  { id: "trivia", icon: <Brain className="w-5 h-5" />, gradient: "from-purple-500/20 to-pink-500/20", color: "text-purple-400" },
  { id: "coin-battle", icon: <Coins className="w-5 h-5" />, gradient: "from-amber-500/20 to-yellow-500/20", color: "text-amber-400" },
];

export function UserEquippedAccessories({ userId, accessories }: { userId?: number; accessories?: Accessory[] }) {
  const [items, setItems] = useState<Accessory[]>(accessories || []);
  useEffect(() => {
    if (accessories) { setItems(accessories); return; }
    if (!userId) return;
    apiFetch<Accessory[]>(`/api/accessories/user/${userId}`)
      .then(setItems)
      .catch(() => {});
  }, [userId, accessories]);
  if (items.length === 0) return null;
  return (
    <div className="flex gap-1 flex-wrap mt-1">
      {items.map(a => (
        <span key={a.id} title={a.name} className={`text-sm px-1 py-0.5 rounded border ${RARITY_COLORS[a.rarity]} cursor-default`}>
          {a.icon}
        </span>
      ))}
    </div>
  );
}

export default function AccessoriesTab() {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const [subTab, setSubTab] = useState<"inventory" | "catalog" | "duels" | "leaderboard" | "quests">("quests");
  const [catalog, setCatalog] = useState<Accessory[]>([]);
  const [inventory, setInventory] = useState<Accessory[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const [duelsData, setDuelsData] = useState<{ open: DuelChallenge[]; mine: DuelChallenge[]; results: DuelChallenge[]; myUserId: number }>({ open: [], mine: [], results: [], myUserId: 0 });
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [creatingDuel, setCreatingDuel] = useState<string | null>(null);
  const [duelMove, setDuelMove] = useState<any>(null);
  const [acceptingDuel, setAcceptingDuel] = useState<number | null>(null);
  const [acceptMove, setAcceptMove] = useState<any>(null);
  const [duelResult, setDuelResult] = useState<any>(null);
  const [busyAction, setBusyAction] = useState(false);
  const [triviaQuestions, setTriviaQuestions] = useState<any[]>([]);
  const [triviaQuestionIds, setTriviaQuestionIds] = useState<number[]>([]);
  const [triviaAnswers, setTriviaAnswers] = useState<number[]>([]);
  const [questsList, setQuestsList] = useState<any[]>([]);
  const [questsLoading, setQuestsLoading] = useState(false);
  const [questRarityFilter, setQuestRarityFilter] = useState<string>("all");

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

  const gameNames: Record<string, Record<string, string>> = {
    rps: { en: "Rock Paper Scissors", ru: "Камень Ножницы Бумага", es: "Piedra Papel Tijera" },
    "number-war": { en: "Number War", ru: "Числовая война", es: "Guerra de números" },
    "dice-battle": { en: "Dice Battle", ru: "Битва кубиков", es: "Batalla de dados" },
    trivia: { en: "Roblox Trivia", ru: "Roblox Викторина", es: "Trivia de Roblox" },
    "coin-battle": { en: "Coin Battle", ru: "Битва монет", es: "Batalla de monedas" },
  };

  const gameDescriptions: Record<string, Record<string, string>> = {
    rps: { en: "Classic rock-paper-scissors duel", ru: "Классическая дуэль камень-ножницы-бумага", es: "Duelo clásico piedra-papel-tijera" },
    "number-war": { en: "Pick 1-100, closest to target wins", ru: "Выбери 1-100, ближе к цели — победа", es: "Elige 1-100, más cerca del objetivo gana" },
    "dice-battle": { en: "Roll 3 dice, highest total wins", ru: "Брось 3 кубика, больше очков — победа", es: "Lanza 3 dados, mayor total gana" },
    trivia: { en: "5 Roblox questions, most correct wins", ru: "5 вопросов о Roblox, кто больше — победа", es: "5 preguntas de Roblox, más correctas gana" },
    "coin-battle": { en: "Best of 3 coin flips", ru: "Лучший из 3 подбрасываний монеты", es: "Mejor de 3 lanzamientos de moneda" },
  };

  const getGameName = (id: string) => gameNames[id]?.[language] || gameNames[id]?.en || id;
  const getGameDesc = (id: string) => gameDescriptions[id]?.[language] || gameDescriptions[id]?.en || "";

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cat, inv, duels] = await Promise.all([
        apiFetch<Accessory[]>("/api/accessories/catalog"),
        apiFetch<Accessory[]>("/api/accessories/my"),
        apiFetch<any>("/api/accessories/duels"),
      ]);
      setCatalog(cat);
      setInventory(inv);
      setDuelsData(duels);
    } catch {
      toast({ variant: "destructive", title: t("assistant.error") });
    } finally { setLoading(false); }
  }, []);

  const loadDuels = useCallback(async () => {
    try {
      const duels = await apiFetch<any>("/api/accessories/duels");
      setDuelsData(duels);
    } catch {}
  }, []);

  const loadLeaderboard = useCallback(async () => {
    try {
      const lb = await apiFetch<LeaderboardEntry[]>("/api/accessories/duels/leaderboard");
      setLeaderboard(lb);
    } catch {}
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    if (subTab === "leaderboard") loadLeaderboard();
  }, [subTab, loadLeaderboard]);

  useEffect(() => {
    if (subTab === "duels") {
      const iv = setInterval(loadDuels, 10000);
      return () => clearInterval(iv);
    }
  }, [subTab, loadDuels]);

  const loadQuests = useCallback(async () => {
    setQuestsLoading(true);
    try {
      await apiFetch("/api/accessories/quests/refresh", { method: "POST" });
      const data = await apiFetch<{ quests: any[] }>("/api/accessories/quests");
      setQuestsList(data.quests || []);
    } catch { }
    setQuestsLoading(false);
  }, []);

  useEffect(() => {
    if (subTab === "quests") loadQuests();
  }, [subTab, loadQuests]);

  const startQuest = async (questId: number) => {
    setBusyAction(true);
    try {
      await apiFetch(`/api/accessories/quests/${questId}/start`, { method: "POST" });
      toast({ title: language === "ru" ? "Квест начат!" : language === "es" ? "Misión iniciada!" : "Quest started!" });
      await loadQuests();
    } catch (err: any) {
      toast({ title: language === "ru" ? "Ошибка" : "Error", description: err.message, variant: "destructive" });
    }
    setBusyAction(false);
  };

  const claimQuest = async (questId: number) => {
    setBusyAction(true);
    try {
      const res = await apiFetch<{ success: boolean; reward: any }>(`/api/accessories/quests/${questId}/claim`, { method: "POST" });
      if (res.reward) {
        toast({ title: language === "ru" ? "Награда получена!" : language === "es" ? "Recompensa obtenida!" : "Reward claimed!", description: `${res.reward.icon} ${res.reward.name}` });
      }
      await loadQuests();
      await loadAll();
    } catch (err: any) {
      toast({ title: language === "ru" ? "Ошибка" : "Error", description: err.message, variant: "destructive" });
    }
    setBusyAction(false);
  };

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

  const createDuel = async (gameType: string) => {
    setBusyAction(true);
    try {
      let move = duelMove;
      if (gameType === "trivia") {
        move = { answers: triviaAnswers, questionIds: triviaQuestionIds };
      }
      await apiFetch("/api/accessories/duels/create", {
        method: "POST",
        body: JSON.stringify({ gameType, move }),
      });
      toast({ title: language === "ru" ? "Дуэль создана!" : language === "es" ? "¡Duelo creado!" : "Duel created!" });
      setCreatingDuel(null);
      setDuelMove(null);
      setTriviaAnswers([]);
      setTriviaQuestionIds([]);
      await loadDuels();
    } catch (err: any) {
      toast({ variant: "destructive", title: err?.message || t("assistant.error") });
    } finally { setBusyAction(false); }
  };

  const acceptDuel = async (challengeId: number, gameType: string) => {
    setBusyAction(true);
    try {
      let move = acceptMove;
      if (gameType === "trivia" && triviaAnswers.length > 0) {
        move = { answers: triviaAnswers };
      }
      const result = await apiFetch<any>(`/api/accessories/duels/${challengeId}/accept`, {
        method: "POST",
        body: JSON.stringify({ move }),
      });
      setDuelResult(result);
      setAcceptingDuel(null);
      setAcceptMove(null);
      setTriviaAnswers([]);
      if (result.reward) {
        setInventory(prev => [...prev, { ...result.reward, equipped: false, obtainedAt: new Date().toISOString() }]);
      }
      await loadDuels();
    } catch (err: any) {
      toast({ variant: "destructive", title: err?.message || t("assistant.error") });
    } finally { setBusyAction(false); }
  };

  const cancelDuel = async (id: number) => {
    try {
      await apiFetch(`/api/accessories/duels/${id}`, { method: "DELETE" });
      await loadDuels();
    } catch {}
  };

  const fetchTriviaForCreate = async () => {
    try {
      const data = await apiFetch<{ questions: any[]; questionIds: number[] }>("/api/accessories/duels/trivia-questions");
      setTriviaQuestions(data.questions);
      setTriviaQuestionIds(data.questionIds);
      setTriviaAnswers(new Array(data.questions.length).fill(-1));
    } catch {}
  };

  const fetchTriviaByIds = async (ids: number[]) => {
    try {
      const data = await apiFetch<{ questions: any[]; questionIds: number[] }>("/api/accessories/duels/trivia-questions?ids=" + ids.join(","));
      setTriviaQuestions(data.questions);
      setTriviaQuestionIds(data.questionIds);
      setTriviaAnswers(new Array(data.questions.length).fill(-1));
    } catch {}
  };

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

  const renderMoveInput = (gameType: string, move: any, setMove: (m: any) => void, isCreate: boolean) => {
    if (gameType === "rps") {
      const choices = [
        { val: "rock", label: language === "ru" ? "Камень" : language === "es" ? "Piedra" : "Rock", emoji: "🪨" },
        { val: "paper", label: language === "ru" ? "Бумага" : language === "es" ? "Papel" : "Paper", emoji: "📄" },
        { val: "scissors", label: language === "ru" ? "Ножницы" : language === "es" ? "Tijera" : "Scissors", emoji: "✂️" },
      ];
      return (
        <div className="grid grid-cols-3 gap-2">
          {choices.map(c => (
            <button
              key={c.val}
              onClick={() => setMove({ choice: c.val })}
              className={`py-3 rounded-xl text-sm font-semibold border transition-all flex flex-col items-center gap-1 ${
                move?.choice === c.val
                  ? "border-primary bg-primary/15 text-primary scale-105"
                  : "border-border bg-secondary/50 text-muted-foreground hover:text-foreground hover:border-primary/50"
              }`}
            >
              <span className="text-2xl">{c.emoji}</span>
              {c.label}
            </button>
          ))}
        </div>
      );
    }

    if (gameType === "number-war") {
      return (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {language === "ru" ? "Выберите число от 1 до 100:" : language === "es" ? "Elige un número del 1 al 100:" : "Pick a number from 1 to 100:"}
          </p>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={100}
              value={move?.number || 50}
              onChange={e => setMove({ number: parseInt(e.target.value) })}
              className="flex-1 accent-primary"
            />
            <div className="w-14 h-10 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center font-bold text-primary text-lg">
              {move?.number || 50}
            </div>
          </div>
        </div>
      );
    }

    if (gameType === "dice-battle") {
      return (
        <div className="text-center py-4">
          <div className="flex justify-center gap-3 text-4xl mb-2">🎲🎲🎲</div>
          <p className="text-xs text-muted-foreground">
            {language === "ru" ? "3 кубика будут брошены автоматически — удачи!" : language === "es" ? "3 dados se lanzarán automáticamente — ¡buena suerte!" : "3 dice will be rolled automatically — good luck!"}
          </p>
        </div>
      );
    }

    if (gameType === "trivia") {
      if (triviaQuestions.length === 0) {
        return (
          <div className="text-center py-4">
            <Button size="sm" onClick={fetchTriviaForCreate} className="rounded-xl gap-2">
              <Brain className="w-4 h-4" />
              {language === "ru" ? "Загрузить вопросы" : language === "es" ? "Cargar preguntas" : "Load Questions"}
            </Button>
          </div>
        );
      }
      return (
        <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
          {triviaQuestions.map((q: any, qi: number) => (
            <div key={qi} className="space-y-2">
              <p className="text-xs font-semibold">
                {qi + 1}. {language === "ru" && q.questionRu ? q.questionRu : language === "es" && q.questionEs ? q.questionEs : q.question}
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {q.options.map((opt: string, oi: number) => (
                  <button
                    key={oi}
                    onClick={() => {
                      const next = [...triviaAnswers];
                      next[qi] = oi;
                      setTriviaAnswers(next);
                    }}
                    className={`py-2 px-2 rounded-lg text-xs font-medium border transition-all ${
                      triviaAnswers[qi] === oi
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border bg-secondary/30 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (gameType === "coin-battle") {
      return (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {language === "ru" ? "Выберите сторону для каждого из 3 раундов:" : language === "es" ? "Elige un lado para cada una de las 3 rondas:" : "Pick a side for each of 3 rounds:"}
          </p>
          {[0, 1, 2].map(i => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs font-medium w-20 text-muted-foreground">
                {language === "ru" ? `Раунд ${i + 1}` : `Round ${i + 1}`}
              </span>
              <div className="flex gap-1.5 flex-1">
                {(["heads", "tails"] as const).map(side => (
                  <button
                    key={side}
                    onClick={() => {
                      const choices = [...(move?.choices || ["heads", "heads", "heads"])];
                      choices[i] = side;
                      setMove({ choices });
                    }}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-all ${
                      (move?.choices?.[i] || "heads") === side
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border bg-secondary/30 text-muted-foreground"
                    }`}
                  >
                    {side === "heads" ? "🪙 " + (language === "ru" ? "Орёл" : language === "es" ? "Cara" : "Heads") : "🪙 " + (language === "ru" ? "Решка" : language === "es" ? "Cruz" : "Tails")}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }

    return null;
  };

  const canSubmitMove = (gameType: string, move: any): boolean => {
    if (gameType === "rps") return !!move?.choice;
    if (gameType === "number-war") return true;
    if (gameType === "dice-battle") return true;
    if (gameType === "trivia") return triviaAnswers.every(a => a >= 0);
    if (gameType === "coin-battle") return true;
    return false;
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return language === "ru" ? "только что" : "just now";
    if (mins < 60) return `${mins}${language === "ru" ? "м" : "m"}`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}${language === "ru" ? "ч" : "h"}`;
    return `${Math.floor(hrs / 24)}${language === "ru" ? "д" : "d"}`;
  };

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
        {(["quests", "duels", "inventory", "catalog", "leaderboard"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setSubTab(tab)}
            className={`flex-1 py-2 px-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1 ${
              subTab === tab ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "quests" && <Target className="w-3.5 h-3.5" />}
            {tab === "duels" && <Swords className="w-3.5 h-3.5" />}
            {tab === "inventory" && <Package className="w-3.5 h-3.5" />}
            {tab === "catalog" && <Star className="w-3.5 h-3.5" />}
            {tab === "leaderboard" && <Trophy className="w-3.5 h-3.5" />}
            {tab === "quests" ? (language === "ru" ? "Квесты" : language === "es" ? "Misiones" : "Quests")
              : tab === "duels" ? (language === "ru" ? "Дуэли" : language === "es" ? "Duelos" : "Duels")
              : tab === "inventory" ? (t("acc.inventory") || "Inventory")
              : tab === "catalog" ? (t("acc.catalog") || "Catalog")
              : (language === "ru" ? "Рейтинг" : language === "es" ? "Ranking" : "Leaderboard")}
          </button>
        ))}
      </div>

      <AnimatePresence>
        {duelResult && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setDuelResult(null)}
          >
            <motion.div
              initial={{ y: 20 }}
              animate={{ y: 0 }}
              className="w-[380px] bg-card rounded-2xl shadow-2xl border border-border overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className={`p-6 text-center ${
                duelResult.result === "draw"
                  ? "bg-gradient-to-b from-yellow-500/10 to-transparent"
                  : duelResult.winner?.id === duelsData.myUserId
                    ? "bg-gradient-to-b from-green-500/10 to-transparent"
                    : "bg-gradient-to-b from-red-500/10 to-transparent"
              }`}>
                <div className="text-5xl mb-3">
                  {duelResult.result === "draw" ? "🤝" : duelResult.winner?.id === duelsData.myUserId ? "🏆" : "😔"}
                </div>
                <h3 className="text-xl font-bold">
                  {duelResult.result === "draw"
                    ? (language === "ru" ? "Ничья!" : language === "es" ? "¡Empate!" : "It's a draw!")
                    : duelResult.winner?.id === duelsData.myUserId
                      ? (language === "ru" ? "Победа!" : language === "es" ? "¡Victoria!" : "You won!")
                      : (language === "ru" ? "Поражение" : language === "es" ? "Derrota" : "You lost")}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {duelResult.challengerName} vs {duelResult.opponentName}
                </p>
              </div>

              {duelResult.details && (
                <div className="px-6 py-3 border-t border-border/50 text-xs text-muted-foreground space-y-1">
                  {duelResult.details.challengerChoice && (
                    <p>{duelResult.challengerName}: {duelResult.details.challengerChoice} | {duelResult.opponentName}: {duelResult.details.opponentChoice}</p>
                  )}
                  {duelResult.details.target !== undefined && (
                    <p>{language === "ru" ? "Цель" : "Target"}: {duelResult.details.target} | {duelResult.details.challengerNumber} vs {duelResult.details.opponentNumber}</p>
                  )}
                  {duelResult.details.challengerRolls && (
                    <p>🎲 [{duelResult.details.challengerRolls.join(",")}] = {duelResult.details.challengerTotal} vs 🎲 [{duelResult.details.opponentRolls.join(",")}] = {duelResult.details.opponentTotal}</p>
                  )}
                  {duelResult.details.challengerCorrect !== undefined && (
                    <p>✅ {duelResult.details.challengerCorrect}/5 vs {duelResult.details.opponentCorrect}/5</p>
                  )}
                  {duelResult.details.rounds && (
                    <div className="space-y-0.5">
                      {duelResult.details.rounds.map((r: any, i: number) => (
                        <p key={i}>R{i + 1}: 🪙{r.flip} | {r.challengerPick} vs {r.opponentPick}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {duelResult.reward && (
                <div className="px-6 py-3 border-t border-border/50">
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                    <span className="text-2xl">{duelResult.reward.icon}</span>
                    <div>
                      <p className="text-sm font-bold">{language === "ru" && duelResult.reward.nameRu ? duelResult.reward.nameRu : duelResult.reward.name}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md border ${RARITY_COLORS[duelResult.reward.rarity]}`}>
                        {rarityLabels[duelResult.reward.rarity]?.[language] || duelResult.reward.rarity}
                      </span>
                    </div>
                    <Sparkles className="w-5 h-5 text-amber-500 ml-auto" />
                  </div>
                </div>
              )}

              <div className="p-4 border-t border-border/50">
                <Button onClick={() => setDuelResult(null)} className="w-full rounded-xl" size="sm">
                  {language === "ru" ? "Закрыть" : language === "es" ? "Cerrar" : "Close"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
              <p className="text-xs mt-1">{language === "ru" ? "Побеждайте в дуэлях!" : "Win duels to earn accessories!"}</p>
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
                    <div className="absolute top-2 right-2"><Check className="w-4 h-4 text-primary" /></div>
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
                      acc.equipped ? "bg-secondary text-muted-foreground hover:bg-secondary/80" : "bg-primary/15 text-primary hover:bg-primary/25"
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
                  owned ? "border-green-500/30 bg-green-500/5" : "border-border bg-card"
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
                    <Swords className="w-3 h-3" />
                    {language === "ru" ? "Победа в дуэли" : language === "es" ? "Ganar en un duelo" : "Win in a duel"}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {subTab === "quests" && (
        <div className="space-y-3">
          <div className="flex gap-1 flex-wrap">
            {["all", "common", "rare", "epic", "legendary"].map(r => (
              <button
                key={r}
                onClick={() => setQuestRarityFilter(r)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all ${
                  questRarityFilter === r
                    ? r === "common" ? "bg-zinc-500 text-white" : r === "rare" ? "bg-blue-500 text-white" : r === "epic" ? "bg-purple-500 text-white" : r === "legendary" ? "bg-amber-500 text-white" : "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                {r === "all" ? (language === "ru" ? "Все" : language === "es" ? "Todos" : "All")
                  : r === "common" ? (language === "ru" ? "Обычные" : language === "es" ? "Comunes" : "Common")
                  : r === "rare" ? (language === "ru" ? "Редкие" : language === "es" ? "Raros" : "Rare")
                  : r === "epic" ? (language === "ru" ? "Эпические" : language === "es" ? "Épicos" : "Epic")
                  : (language === "ru" ? "Легендарные" : language === "es" ? "Legendarios" : "Legendary")}
              </button>
            ))}
          </div>

          {questsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : questsList.filter(q => questRarityFilter === "all" || q.rarity === questRarityFilter).length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Target className="w-10 h-10 mx-auto mb-3 opacity-30" strokeWidth={1} />
              <p className="text-sm font-medium">{language === "ru" ? "Нет квестов" : "No quests available"}</p>
            </div>
          ) : (
            questsList
              .filter(q => questRarityFilter === "all" || q.rarity === questRarityFilter)
              .sort((a, b) => {
                if (a.claimed && !b.claimed) return 1;
                if (!a.claimed && b.claimed) return -1;
                if (a.completed && !a.claimed && !(b.completed && !b.claimed)) return -1;
                if (!(a.completed && !a.claimed) && b.completed && !b.claimed) return 1;
                if (a.started && !b.started) return -1;
                return 0;
              })
              .map(quest => {
                const rarityColor = quest.rarity === "legendary" ? "border-amber-500/40 bg-amber-500/5"
                  : quest.rarity === "epic" ? "border-purple-500/40 bg-purple-500/5"
                  : quest.rarity === "rare" ? "border-blue-500/40 bg-blue-500/5"
                  : "border-border bg-card";
                const rarityBadge = quest.rarity === "legendary" ? "bg-amber-500/20 text-amber-500"
                  : quest.rarity === "epic" ? "bg-purple-500/20 text-purple-500"
                  : quest.rarity === "rare" ? "bg-blue-500/20 text-blue-500"
                  : "bg-zinc-500/20 text-zinc-400";
                const progressPct = quest.target > 0 ? Math.min(100, Math.round((quest.progress / quest.target) * 100)) : 0;
                const questName = language === "ru" && quest.nameRu ? quest.nameRu : language === "es" && quest.nameEs ? quest.nameEs : quest.name;
                const questDesc = language === "ru" && quest.descriptionRu ? quest.descriptionRu : language === "es" && quest.descriptionEs ? quest.descriptionEs : quest.description;

                return (
                  <motion.div
                    key={quest.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`rounded-xl border p-3 transition-all ${rarityColor} ${quest.claimed ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="text-2xl flex-shrink-0">{quest.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-bold truncate">{questName}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${rarityBadge}`}>
                            {quest.rarity}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mb-2">{questDesc}</p>

                        {quest.reward && (
                          <div className="flex items-center gap-1.5 mb-2 px-2 py-1 rounded-lg bg-secondary/50 w-fit">
                            <Gift className="w-3 h-3 text-amber-500" />
                            <span className="text-[10px] font-medium">{quest.reward.icon} {quest.reward.name}</span>
                          </div>
                        )}

                        {(quest.started || quest.alreadyOwned) && (
                          <div className="mb-2">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] text-muted-foreground">
                                {quest.progress}/{quest.target}
                              </span>
                              <span className="text-[10px] font-semibold">{progressPct}%</span>
                            </div>
                            <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                              <motion.div
                                className={`h-full rounded-full ${quest.completed ? "bg-green-500" : "bg-primary"}`}
                                initial={{ width: 0 }}
                                animate={{ width: `${progressPct}%` }}
                                transition={{ duration: 0.5 }}
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex-shrink-0">
                        {quest.claimed || quest.alreadyOwned ? (
                          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-green-500/10 text-green-500">
                            <Check className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-semibold">{language === "ru" ? "Получено" : "Claimed"}</span>
                          </div>
                        ) : quest.completed && !quest.claimed ? (
                          <Button
                            size="sm"
                            className="h-7 text-[10px] bg-green-600 hover:bg-green-700"
                            onClick={() => claimQuest(quest.id)}
                            disabled={busyAction}
                          >
                            {busyAction ? <Loader2 className="w-3 h-3 animate-spin" /> : <Gift className="w-3 h-3 mr-1" />}
                            {language === "ru" ? "Забрать" : "Claim"}
                          </Button>
                        ) : quest.started ? (
                          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-500/10 text-blue-500">
                            <Clock className="w-3 h-3" />
                            <span className="text-[10px] font-semibold">{language === "ru" ? "В работе" : "Active"}</span>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px]"
                            onClick={() => startQuest(quest.id)}
                            disabled={busyAction}
                          >
                            {busyAction ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3 mr-1" />}
                            {language === "ru" ? "Начать" : "Start"}
                          </Button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })
          )}
        </div>
      )}

      {subTab === "duels" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {DUEL_GAMES.map(game => (
              <button
                key={game.id}
                onClick={() => {
                  setCreatingDuel(game.id);
                  setDuelMove(game.id === "number-war" ? { number: 50 } : game.id === "coin-battle" ? { choices: ["heads", "heads", "heads"] } : null);
                  setTriviaQuestions([]);
                  setTriviaAnswers([]);
                }}
                className={`rounded-xl border border-border p-3 bg-gradient-to-br ${game.gradient} hover:scale-[1.02] transition-all text-left`}
              >
                <div className={`w-9 h-9 rounded-lg bg-background/60 flex items-center justify-center mb-2 ${game.color}`}>
                  {game.icon}
                </div>
                <p className="text-xs font-bold">{getGameName(game.id)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{getGameDesc(game.id)}</p>
              </button>
            ))}
          </div>

          <AnimatePresence>
            {creatingDuel && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold flex items-center gap-2">
                      <Swords className="w-4 h-4 text-primary" />
                      {getGameName(creatingDuel)}
                    </h3>
                    <button onClick={() => { setCreatingDuel(null); setDuelMove(null); }} className="text-muted-foreground hover:text-foreground">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {renderMoveInput(creatingDuel, duelMove, setDuelMove, true)}

                  <Button
                    onClick={() => createDuel(creatingDuel)}
                    disabled={busyAction || !canSubmitMove(creatingDuel, duelMove)}
                    className="w-full rounded-xl gap-2"
                    size="sm"
                  >
                    {busyAction ? <Loader2 className="w-4 h-4 animate-spin" /> : <Swords className="w-4 h-4" />}
                    {language === "ru" ? "Создать дуэль" : language === "es" ? "Crear duelo" : "Create Duel"}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {duelsData.mine.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                {language === "ru" ? "Мои вызовы" : language === "es" ? "Mis desafíos" : "My Challenges"}
              </h3>
              {duelsData.mine.map(ch => (
                <div key={ch.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${DUEL_GAMES.find(g => g.id === ch.gameType)?.color || ""} bg-secondary/50`}>
                    {DUEL_GAMES.find(g => g.id === ch.gameType)?.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold">{getGameName(ch.gameType)}</p>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {timeAgo(ch.createdAt)}
                      {!ch.opponentId && <Badge variant="outline" className="text-[8px] h-4 ml-1">{language === "ru" ? "Открытый" : "Open"}</Badge>}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" className="rounded-lg h-7 text-xs text-red-500" onClick={() => cancelDuel(ch.id)}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {duelsData.open.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Swords className="w-3 h-3" />
                {language === "ru" ? "Доступные дуэли" : language === "es" ? "Duelos disponibles" : "Available Duels"}
              </h3>
              {duelsData.open.map(ch => (
                <div key={ch.id} className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="flex items-center gap-3 p-3">
                    <Avatar className="w-8 h-8 border border-border">
                      <AvatarImage src={ch.challengerAvatar || robloxHeadshot(ch.challengerRobloxUserId)} />
                      <AvatarFallback className="text-xs">{ch.challengerName?.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold">{ch.challengerName}</p>
                      <p className="text-[10px] text-muted-foreground">{getGameName(ch.gameType)} • {timeAgo(ch.createdAt)}</p>
                    </div>
                    {acceptingDuel === ch.id ? (
                      <Button size="sm" variant="ghost" className="rounded-lg h-7 text-xs" onClick={() => { setAcceptingDuel(null); setAcceptMove(null); }}>
                        <X className="w-3 h-3" />
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="rounded-lg h-7 text-xs gap-1"
                        onClick={() => {
                          setAcceptingDuel(ch.id);
                          setAcceptMove(ch.gameType === "number-war" ? { number: 50 } : ch.gameType === "coin-battle" ? { choices: ["heads", "heads", "heads"] } : null);
                          setTriviaQuestions([]);
                          setTriviaAnswers([]);
                          if (ch.gameType === "trivia") {
                            if ((ch as any).triviaQuestionIds) {
                              fetchTriviaByIds((ch as any).triviaQuestionIds);
                            } else {
                              fetchTriviaForCreate();
                            }
                          }
                        }}
                      >
                        <Swords className="w-3 h-3" />
                        {language === "ru" ? "Принять" : language === "es" ? "Aceptar" : "Accept"}
                      </Button>
                    )}
                  </div>
                  <AnimatePresence>
                    {acceptingDuel === ch.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="px-3 pb-3 space-y-3 border-t border-border/50 pt-3">
                          {renderMoveInput(ch.gameType, acceptMove, setAcceptMove, false)}
                          <Button
                            onClick={() => acceptDuel(ch.id, ch.gameType)}
                            disabled={busyAction || !canSubmitMove(ch.gameType, acceptMove)}
                            className="w-full rounded-xl gap-2"
                            size="sm"
                          >
                            {busyAction ? <Loader2 className="w-4 h-4 animate-spin" /> : <Swords className="w-4 h-4" />}
                            {language === "ru" ? "Играть!" : language === "es" ? "¡Jugar!" : "Play!"}
                          </Button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          )}

          {duelsData.open.length === 0 && duelsData.mine.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Swords className="w-10 h-10 mx-auto mb-3 opacity-30" strokeWidth={1} />
              <p className="text-sm font-medium">{language === "ru" ? "Нет активных дуэлей" : "No active duels"}</p>
              <p className="text-xs mt-1">{language === "ru" ? "Создайте дуэль выше!" : "Create a duel above!"}</p>
            </div>
          )}

          {duelsData.results.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Trophy className="w-3 h-3" />
                {language === "ru" ? "Последние результаты" : language === "es" ? "Resultados recientes" : "Recent Results"}
              </h3>
              {duelsData.results.map(ch => {
                const isWinner = ch.winnerId === duelsData.myUserId;
                const isDraw = !ch.winnerId;
                return (
                  <div
                    key={ch.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border ${
                      isDraw ? "border-yellow-500/20 bg-yellow-500/5" : isWinner ? "border-green-500/20 bg-green-500/5" : "border-red-500/20 bg-red-500/5"
                    }`}
                  >
                    <div className="text-xl">
                      {isDraw ? "🤝" : isWinner ? "🏆" : "😔"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold">
                        {ch.challengerName} vs {ch.opponentName || "?"}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {getGameName(ch.gameType)} • {isDraw ? (language === "ru" ? "Ничья" : "Draw") : isWinner ? (language === "ru" ? "Победа" : "Won") : (language === "ru" ? "Поражение" : "Lost")}
                      </p>
                    </div>
                    {ch.rewardAccessoryId && isWinner && (
                      <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-500 gap-1">
                        <Sparkles className="w-3 h-3" /> +1
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {subTab === "leaderboard" && (
        <div className="space-y-2">
          {leaderboard.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Trophy className="w-10 h-10 mx-auto mb-3 opacity-30" strokeWidth={1} />
              <p className="text-sm font-medium">{language === "ru" ? "Пока нет данных" : "No data yet"}</p>
              <p className="text-xs mt-1">{language === "ru" ? "Нужно минимум 3 дуэли" : "Need at least 3 duels"}</p>
            </div>
          ) : (
            leaderboard.map((entry, i) => (
              <div
                key={entry.id}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                  i === 0 ? "border-amber-500/30 bg-amber-500/5" : i === 1 ? "border-zinc-400/30 bg-zinc-400/5" : i === 2 ? "border-orange-600/30 bg-orange-600/5" : "border-border bg-card"
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  i === 0 ? "bg-amber-500/20 text-amber-500" : i === 1 ? "bg-zinc-400/20 text-zinc-400" : i === 2 ? "bg-orange-600/20 text-orange-600" : "bg-secondary text-muted-foreground"
                }`}>
                  {i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}
                </div>
                <Avatar className="w-8 h-8 border border-border">
                  <AvatarImage src={entry.avatar_url || robloxHeadshot(entry.roblox_user_id)} />
                  <AvatarFallback className="text-xs">{entry.display_name?.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{entry.display_name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {entry.total_games} {language === "ru" ? "игр" : "games"} • {Math.round((entry.win_rate || 0) * 100)}% WR
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-green-500">{entry.wins}</p>
                  <p className="text-[10px] text-muted-foreground">{language === "ru" ? "побед" : "wins"}</p>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
