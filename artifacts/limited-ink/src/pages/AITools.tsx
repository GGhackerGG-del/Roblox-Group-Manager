import { useState, useCallback } from "react";
import { getAuthCredentials } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Sparkles, FileText, Hash, Palette, TrendingUp, DollarSign, MessageSquare,
  Loader2, Copy, Check, ChevronUp, ChevronDown, RefreshCw, Download, Zap,
  Tag, Search, BarChart2, Star, Clock
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { playClick, playSuccess } from "@/hooks/useSounds";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function getAuthHeaders(): Record<string, string> {
  const { token, fingerprint } = getAuthCredentials();
  const h: Record<string, string> = {};
  if (token) h["Authorization"] = `Bearer ${token}`;
  if (fingerprint) h["X-Device-Fingerprint"] = fingerprint;
  return h;
}

async function apiFetch<T>(url: string, body: object): Promise<T> {
  const r = await fetch(`${BASE}${url}`, {
    method: "POST",
    credentials: "include",
    headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({ error: r.statusText })) as { error?: string };
    throw new Error(e.error || `HTTP ${r.status}`);
  }
  return r.json() as Promise<T>;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0" onClick={copy}>
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </Button>
  );
}

function ResultCard({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {children}
    </motion.div>
  );
}

const LANG_OPTIONS = [
  { value: "ru", label: "🇷🇺 Русский" },
  { value: "en", label: "🇬🇧 English" },
];

export default function AITools() {
  const { toast } = useToast();
  const [tab, setTab] = useState("description");
  const [lang, setLang] = useState("ru");

  const [descForm, setDescForm] = useState({ name: "", type: "Shirt", style: "", colors: "", mood: "" });
  const [descResult, setDescResult] = useState<{ description: string; shortDescription: string; tags: string[] } | null>(null);
  const [descLoading, setDescLoading] = useState(false);

  const [titleForm, setTitleForm] = useState({ description: "", style: "", type: "Shirt" });
  const [titleResult, setTitleResult] = useState<{ titles: string[] } | null>(null);
  const [titleLoading, setTitleLoading] = useState(false);

  const [kwForm, setKwForm] = useState({ name: "", description: "", type: "Shirt" });
  const [kwResult, setKwResult] = useState<{ primary: string[]; secondary: string[]; longTail: string[]; hashtags: string[] } | null>(null);
  const [kwLoading, setKwLoading] = useState(false);

  const [designForm, setDesignForm] = useState({ description: "", style: "", colors: "" });
  const [designResult, setDesignResult] = useState<string | null>(null);
  const [designLoading, setDesignLoading] = useState(false);

  const [trendForm, setTrendForm] = useState({ category: "", timeframe: "" });
  const [trendResult, setTrendResult] = useState<{
    hotStyles: Array<{ name: string; growth: string; description: string }>;
    risingColors: string[];
    decliningStyles: string[];
    opportunities: string[];
    bestUploadTime: string;
    summary: string;
  } | null>(null);
  const [trendLoading, setTrendLoading] = useState(false);

  const [priceForm, setPriceForm] = useState({ type: "Shirt", style: "", rarity: "Common", demand: "Medium", competitorPrices: "" });
  const [priceResult, setPriceResult] = useState<{
    recommendedPrice: number;
    priceRange: { min: number; max: number };
    strategy: string;
    reasoning: string[];
    proTips: string[];
    expectedSalesPerWeek: string;
  } | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);

  const [chatbotForm, setChatbotForm] = useState({ post: "", tone: "friendly", groupContext: "" });
  const [chatbotResult, setChatbotResult] = useState<{
    replies: Array<{ text: string; tone: string }>;
    sentiment: string;
    suggestedAction: string;
  } | null>(null);
  const [chatbotLoading, setChatbotLoading] = useState(false);

  const handleError = useCallback((e: unknown) => {
    toast({ title: "Ошибка AI", description: e instanceof Error ? e.message : "Неизвестная ошибка", variant: "destructive" });
  }, [toast]);

  const genDescription = async () => {
    if (!descForm.name.trim()) return;
    setDescLoading(true); setDescResult(null);
    try {
      const r = await apiFetch<typeof descResult>("/api/ai-tools/description", { ...descForm, language: lang });
      setDescResult(r);
      playSuccess();
    } catch (e) { handleError(e); }
    finally { setDescLoading(false); }
  };

  const genTitles = async () => {
    if (!titleForm.description.trim()) return;
    setTitleLoading(true); setTitleResult(null);
    try {
      const r = await apiFetch<typeof titleResult>("/api/ai-tools/title", { ...titleForm, language: lang });
      setTitleResult(r);
      playSuccess();
    } catch (e) { handleError(e); }
    finally { setTitleLoading(false); }
  };

  const genKeywords = async () => {
    if (!kwForm.name.trim() && !kwForm.description.trim()) return;
    setKwLoading(true); setKwResult(null);
    try {
      const r = await apiFetch<typeof kwResult>("/api/ai-tools/keywords", { ...kwForm, language: lang });
      setKwResult(r);
      playSuccess();
    } catch (e) { handleError(e); }
    finally { setKwLoading(false); }
  };

  const genDesign = async () => {
    if (!designForm.description.trim()) return;
    setDesignLoading(true); setDesignResult(null);
    try {
      const r = await apiFetch<{ b64_json: string }>("/api/ai-tools/design", designForm);
      setDesignResult(r.b64_json);
      playSuccess();
    } catch (e) { handleError(e); }
    finally { setDesignLoading(false); }
  };

  const downloadDesign = () => {
    if (!designResult) return;
    const a = document.createElement("a");
    a.href = `data:image/png;base64,${designResult}`;
    a.download = "ai-clothing-design.png";
    a.click();
  };

  const genTrends = async () => {
    setTrendLoading(true); setTrendResult(null);
    try {
      const r = await apiFetch<typeof trendResult>("/api/ai-tools/trend", { ...trendForm, language: lang });
      setTrendResult(r);
      playSuccess();
    } catch (e) { handleError(e); }
    finally { setTrendLoading(false); }
  };

  const genPrice = async () => {
    setPriceLoading(true); setPriceResult(null);
    try {
      const r = await apiFetch<typeof priceResult>("/api/ai-tools/price", { ...priceForm, language: lang });
      setPriceResult(r);
      playSuccess();
    } catch (e) { handleError(e); }
    finally { setPriceLoading(false); }
  };

  const genChatbot = async () => {
    if (!chatbotForm.post.trim()) return;
    setChatbotLoading(true); setChatbotResult(null);
    try {
      const r = await apiFetch<typeof chatbotResult>("/api/ai-tools/chatbot-reply", { ...chatbotForm, language: lang });
      setChatbotResult(r);
      playSuccess();
    } catch (e) { handleError(e); }
    finally { setChatbotLoading(false); }
  };

  const tabs = [
    { id: "description", icon: <FileText className="w-3.5 h-3.5" />, label: "Описание", badge: "AI" },
    { id: "title", icon: <Sparkles className="w-3.5 h-3.5" />, label: "Название", badge: "AI" },
    { id: "keywords", icon: <Hash className="w-3.5 h-3.5" />, label: "Ключевые слова", badge: "SEO" },
    { id: "design", icon: <Palette className="w-3.5 h-3.5" />, label: "Дизайнер", badge: "IMG" },
    { id: "trend", icon: <TrendingUp className="w-3.5 h-3.5" />, label: "Тренды", badge: "AI" },
    { id: "price", icon: <DollarSign className="w-3.5 h-3.5" />, label: "Цена", badge: "AI" },
    { id: "chatbot", icon: <MessageSquare className="w-3.5 h-3.5" />, label: "Чат-бот", badge: "BOT" },
  ];

  const typeOptions = ["Shirt", "Pants", "T-Shirt", "Hoodie", "Jacket", "Dress", "Outfit"];
  const rarityOptions = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];
  const demandOptions = ["Low", "Medium", "High", "Very High"];
  const toneOptions = [
    { value: "friendly", label: "Дружелюбный" },
    { value: "professional", label: "Профессиональный" },
    { value: "casual", label: "Casual" },
    { value: "promotional", label: "Промо" },
  ];
  const categoryOptions = ["All", "Shirts", "Pants", "T-Shirts", "Accessories", "Casual", "Streetwear", "Fantasy", "Military", "Anime"];

  const strategyColor: Record<string, string> = {
    budget: "text-green-500", midrange: "text-blue-500",
    premium: "text-violet-500", luxury: "text-amber-500",
  };
  const strategyLabel: Record<string, string> = {
    budget: "💰 Бюджет", midrange: "⚖️ Средний", premium: "⭐ Премиум", luxury: "👑 Люкс",
  };
  const sentimentColor: Record<string, string> = {
    positive: "text-green-500", neutral: "text-blue-500",
    negative: "text-red-500", question: "text-amber-500",
  };
  const actionLabel: Record<string, string> = {
    reply: "💬 Ответить", ignore: "🚫 Игнорировать",
    escalate: "⚠️ Эскалировать", pin: "📌 Закрепить",
  };

  return (
    <div className="p-4 lg:p-8 w-full max-w-4xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">AI Инструменты</h1>
            <p className="text-sm text-muted-foreground">Умные помощники для создания и продвижения одежды</p>
          </div>
        </div>
        <Select value={lang} onValueChange={setLang}>
          <SelectTrigger className="w-36 h-9 rounded-xl text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LANG_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Tabs value={tab} onValueChange={v => { playClick(); setTab(v); }}>
        <div className="overflow-x-auto pb-1">
          <TabsList className="rounded-xl bg-secondary/50 border border-border p-1 h-auto gap-1 flex-nowrap inline-flex">
            {tabs.map(t => (
              <TabsTrigger key={t.id} value={t.id} className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-3 py-2 gap-1.5 whitespace-nowrap">
                {t.icon} {t.label}
                <span className={`text-[8px] font-bold uppercase px-1 py-0.5 rounded ${tab === t.id ? "bg-white/20 text-white" : "bg-violet-500/15 text-violet-500"}`}>{t.badge}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="description" className="mt-4 space-y-4">
          <Card className="rounded-2xl border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><FileText className="w-4 h-4 text-violet-500" /> AI Description Writer</CardTitle>
              <CardDescription>Генерация продающих описаний для одежды Roblox</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Название *</label>
                  <Input placeholder="Neon Streetwear Hoodie" value={descForm.name} onChange={e => setDescForm(p => ({ ...p, name: e.target.value }))} className="rounded-xl" onKeyDown={e => e.key === "Enter" && genDescription()} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Тип</label>
                  <Select value={descForm.type} onValueChange={v => setDescForm(p => ({ ...p, type: v }))}>
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>{typeOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Стиль</label>
                  <Input placeholder="Streetwear, Anime, Military..." value={descForm.style} onChange={e => setDescForm(p => ({ ...p, style: e.target.value }))} className="rounded-xl" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Цвета</label>
                  <Input placeholder="Black, neon green, white..." value={descForm.colors} onChange={e => setDescForm(p => ({ ...p, colors: e.target.value }))} className="rounded-xl" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Настроение / Атмосфера</label>
                <Input placeholder="Dark, mysterious, futuristic..." value={descForm.mood} onChange={e => setDescForm(p => ({ ...p, mood: e.target.value }))} className="rounded-xl" />
              </div>
              <Button className="w-full rounded-xl gap-2" onClick={genDescription} disabled={descLoading || !descForm.name.trim()}>
                {descLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                Сгенерировать описание
              </Button>
            </CardContent>
          </Card>
          <AnimatePresence>
            {descResult && (
              <ResultCard>
                <Card className="rounded-2xl border-violet-500/20 bg-violet-500/5">
                  <CardContent className="pt-4 space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Полное описание</p>
                        <CopyButton text={descResult.description} />
                      </div>
                      <p className="text-sm leading-relaxed">{descResult.description}</p>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Короткое описание</p>
                        <CopyButton text={descResult.shortDescription} />
                      </div>
                      <p className="text-sm text-muted-foreground">{descResult.shortDescription}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Теги</p>
                      <div className="flex flex-wrap gap-1.5">
                        {descResult.tags.map(tag => (
                          <Badge key={tag} variant="secondary" className="text-xs cursor-pointer hover:bg-violet-500/20" onClick={() => navigator.clipboard.writeText(tag)}>
                            #{tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </ResultCard>
            )}
          </AnimatePresence>
        </TabsContent>

        <TabsContent value="title" className="mt-4 space-y-4">
          <Card className="rounded-2xl border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Sparkles className="w-4 h-4 text-amber-500" /> AI Title Generator</CardTitle>
              <CardDescription>Генерация цепляющих названий для максимальных продаж</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Описание предмета *</label>
                <Textarea placeholder="Опишите вашу одежду кратко..." value={titleForm.description} onChange={e => setTitleForm(p => ({ ...p, description: e.target.value }))} className="rounded-xl resize-none" rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Стиль</label>
                  <Input placeholder="Anime, Streetwear..." value={titleForm.style} onChange={e => setTitleForm(p => ({ ...p, style: e.target.value }))} className="rounded-xl" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Тип</label>
                  <Select value={titleForm.type} onValueChange={v => setTitleForm(p => ({ ...p, type: v }))}>
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>{typeOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <Button className="w-full rounded-xl gap-2" onClick={genTitles} disabled={titleLoading || !titleForm.description.trim()}>
                {titleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Сгенерировать названия
              </Button>
            </CardContent>
          </Card>
          <AnimatePresence>
            {titleResult && (
              <ResultCard>
                <Card className="rounded-2xl border-amber-500/20 bg-amber-500/5">
                  <CardContent className="pt-4 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">8 вариантов названий</p>
                    {titleResult.titles.map((title, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-xl border border-border/50 bg-card p-3">
                        <span className="text-xs font-bold text-muted-foreground w-4 shrink-0">{i + 1}</span>
                        <span className="flex-1 text-sm font-medium">{title}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">{title.length}/64</span>
                        <CopyButton text={title} />
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </ResultCard>
            )}
          </AnimatePresence>
        </TabsContent>

        <TabsContent value="keywords" className="mt-4 space-y-4">
          <Card className="rounded-2xl border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Hash className="w-4 h-4 text-green-500" /> AI Keyword Suggester</CardTitle>
              <CardDescription>SEO-оптимизация для максимальной видимости в поиске</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Название</label>
                  <Input placeholder="Название одежды..." value={kwForm.name} onChange={e => setKwForm(p => ({ ...p, name: e.target.value }))} className="rounded-xl" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Тип</label>
                  <Select value={kwForm.type} onValueChange={v => setKwForm(p => ({ ...p, type: v }))}>
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>{typeOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Описание</label>
                <Textarea placeholder="Краткое описание..." value={kwForm.description} onChange={e => setKwForm(p => ({ ...p, description: e.target.value }))} className="rounded-xl resize-none" rows={2} />
              </div>
              <Button className="w-full rounded-xl gap-2 bg-green-600 hover:bg-green-700" onClick={genKeywords} disabled={kwLoading || (!kwForm.name.trim() && !kwForm.description.trim())}>
                {kwLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Подобрать ключевые слова
              </Button>
            </CardContent>
          </Card>
          <AnimatePresence>
            {kwResult && (
              <ResultCard>
                <div className="space-y-3">
                  {[
                    { label: "Основные ключевые слова", items: kwResult.primary, color: "text-green-500", bg: "bg-green-500/5 border-green-500/20" },
                    { label: "Дополнительные", items: kwResult.secondary, color: "text-blue-500", bg: "bg-blue-500/5 border-blue-500/20" },
                    { label: "Длинные фразы (long-tail)", items: kwResult.longTail, color: "text-violet-500", bg: "bg-violet-500/5 border-violet-500/20" },
                    { label: "Хэштеги", items: kwResult.hashtags, color: "text-amber-500", bg: "bg-amber-500/5 border-amber-500/20" },
                  ].map(({ label, items, color, bg }) => (
                    <Card key={label} className={`rounded-2xl border ${bg}`}>
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between mb-3">
                          <p className={`text-xs font-semibold uppercase tracking-wide ${color}`}>{label}</p>
                          <CopyButton text={items.join(", ")} />
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {items.map(kw => (
                            <Badge key={kw} variant="secondary" className="text-xs cursor-pointer" onClick={() => navigator.clipboard.writeText(kw)}>
                              {kw}
                            </Badge>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ResultCard>
            )}
          </AnimatePresence>
        </TabsContent>

        <TabsContent value="design" className="mt-4 space-y-4">
          <Card className="rounded-2xl border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Palette className="w-4 h-4 text-pink-500" /> AI Clothing Designer</CardTitle>
              <CardDescription>Генерация визуального дизайна одежды с помощью нейросети</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Описание дизайна *</label>
                <Textarea
                  placeholder="Например: темно-синяя худи с японскими иероглифами и неоновыми вставками..."
                  value={designForm.description}
                  onChange={e => setDesignForm(p => ({ ...p, description: e.target.value }))}
                  className="rounded-xl resize-none"
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Стиль</label>
                  <Input placeholder="Streetwear, Anime, Y2K..." value={designForm.style} onChange={e => setDesignForm(p => ({ ...p, style: e.target.value }))} className="rounded-xl" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Цвета</label>
                  <Input placeholder="Black, red, gold..." value={designForm.colors} onChange={e => setDesignForm(p => ({ ...p, colors: e.target.value }))} className="rounded-xl" />
                </div>
              </div>
              <div className="rounded-xl bg-secondary/50 p-3 text-xs text-muted-foreground">
                💡 Дизайн генерируется нейросетью (~30-60 сек). Результат можно скачать и использовать как основу.
              </div>
              <Button className="w-full rounded-xl gap-2 bg-pink-600 hover:bg-pink-700" onClick={genDesign} disabled={designLoading || !designForm.description.trim()}>
                {designLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Генерация (~30-60 сек)</> : <><Palette className="w-4 h-4" /> Создать дизайн</>}
              </Button>
            </CardContent>
          </Card>
          <AnimatePresence>
            {designResult && (
              <ResultCard>
                <Card className="rounded-2xl border-pink-500/20 bg-pink-500/5">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Сгенерированный дизайн</p>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="rounded-xl gap-1.5 h-8" onClick={genDesign} disabled={designLoading}>
                          <RefreshCw className="w-3.5 h-3.5" /> Пересоздать
                        </Button>
                        <Button size="sm" className="rounded-xl gap-1.5 h-8" onClick={downloadDesign}>
                          <Download className="w-3.5 h-3.5" /> Скачать
                        </Button>
                      </div>
                    </div>
                    <div className="rounded-xl overflow-hidden border border-border/50">
                      <img src={`data:image/png;base64,${designResult}`} alt="AI generated design" className="w-full object-contain max-h-96" />
                    </div>
                  </CardContent>
                </Card>
              </ResultCard>
            )}
          </AnimatePresence>
        </TabsContent>

        <TabsContent value="trend" className="mt-4 space-y-4">
          <Card className="rounded-2xl border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="w-4 h-4 text-blue-500" /> AI Trend Predictor</CardTitle>
              <CardDescription>Анализ рынка и прогноз трендов Roblox marketplace</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Категория</label>
                  <Select value={trendForm.category} onValueChange={v => setTrendForm(p => ({ ...p, category: v }))}>
                    <SelectTrigger className="rounded-xl"><SelectValue placeholder="Все категории" /></SelectTrigger>
                    <SelectContent>{categoryOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Период</label>
                  <Select value={trendForm.timeframe} onValueChange={v => setTrendForm(p => ({ ...p, timeframe: v }))}>
                    <SelectTrigger className="rounded-xl"><SelectValue placeholder="Текущий момент" /></SelectTrigger>
                    <SelectContent>
                      {["This week", "This month", "This season", "Next month"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button className="w-full rounded-xl gap-2 bg-blue-600 hover:bg-blue-700" onClick={genTrends} disabled={trendLoading}>
                {trendLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart2 className="w-4 h-4" />}
                Анализировать тренды
              </Button>
            </CardContent>
          </Card>
          <AnimatePresence>
            {trendResult && (
              <ResultCard>
                <div className="space-y-3">
                  <Card className="rounded-2xl border-blue-500/20 bg-blue-500/5">
                    <CardContent className="pt-4">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Итог</p>
                      <p className="text-sm">{trendResult.summary}</p>
                      {trendResult.bestUploadTime && (
                        <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                          <Clock className="w-3.5 h-3.5" /> Лучшее время публикации: <span className="font-semibold text-foreground">{trendResult.bestUploadTime}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="rounded-2xl border-green-500/20 bg-green-500/5">
                    <CardContent className="pt-4">
                      <p className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                        <ChevronUp className="w-3.5 h-3.5" /> Горячие стили
                      </p>
                      <div className="space-y-2">
                        {trendResult.hotStyles.map((s, i) => (
                          <div key={i} className="flex items-center gap-3 rounded-lg border border-border/50 bg-card p-2.5">
                            <Star className="w-4 h-4 text-amber-500 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold">{s.name}</p>
                              <p className="text-xs text-muted-foreground truncate">{s.description}</p>
                            </div>
                            <Badge className="text-[10px] bg-green-500/20 text-green-700 border-0 shrink-0">{s.growth}</Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <div className="grid grid-cols-2 gap-3">
                    <Card className="rounded-2xl border-border/50">
                      <CardContent className="pt-4">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Растущие цвета</p>
                        <div className="flex flex-wrap gap-1.5">
                          {trendResult.risingColors.map(c => <Badge key={c} variant="outline" className="text-xs">{c}</Badge>)}
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="rounded-2xl border-border/50">
                      <CardContent className="pt-4">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                          <ChevronDown className="w-3.5 h-3.5 text-red-500" /> Угасающие
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {trendResult.decliningStyles.map(s => <Badge key={s} variant="secondary" className="text-xs text-red-500/70">{s}</Badge>)}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <Card className="rounded-2xl border-violet-500/20 bg-violet-500/5">
                    <CardContent className="pt-4">
                      <p className="text-xs font-semibold text-violet-600 uppercase tracking-wide mb-2">Возможности</p>
                      <ul className="space-y-1.5">
                        {trendResult.opportunities.map((o, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <span className="text-violet-500 shrink-0">→</span> {o}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </div>
              </ResultCard>
            )}
          </AnimatePresence>
        </TabsContent>

        <TabsContent value="price" className="mt-4 space-y-4">
          <Card className="rounded-2xl border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><DollarSign className="w-4 h-4 text-amber-500" /> AI Price Advisor</CardTitle>
              <CardDescription>Оптимальная цена для максимальной прибыли</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Тип</label>
                  <Select value={priceForm.type} onValueChange={v => setPriceForm(p => ({ ...p, type: v }))}>
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>{typeOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Редкость</label>
                  <Select value={priceForm.rarity} onValueChange={v => setPriceForm(p => ({ ...p, rarity: v }))}>
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>{rarityOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Спрос</label>
                  <Select value={priceForm.demand} onValueChange={v => setPriceForm(p => ({ ...p, demand: v }))}>
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>{demandOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Стиль</label>
                  <Input placeholder="Streetwear, Anime..." value={priceForm.style} onChange={e => setPriceForm(p => ({ ...p, style: e.target.value }))} className="rounded-xl" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Цены конкурентов</label>
                <Input placeholder="5-25 R$, основные конкуренты..." value={priceForm.competitorPrices} onChange={e => setPriceForm(p => ({ ...p, competitorPrices: e.target.value }))} className="rounded-xl" />
              </div>
              <Button className="w-full rounded-xl gap-2 bg-amber-600 hover:bg-amber-700" onClick={genPrice} disabled={priceLoading}>
                {priceLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Tag className="w-4 h-4" />}
                Рассчитать цену
              </Button>
            </CardContent>
          </Card>
          <AnimatePresence>
            {priceResult && (
              <ResultCard>
                <Card className="rounded-2xl border-amber-500/20 bg-amber-500/5">
                  <CardContent className="pt-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-4xl font-bold">{priceResult.recommendedPrice} R$</p>
                        <p className="text-xs text-muted-foreground mt-1">Диапазон: {priceResult.priceRange.min}–{priceResult.priceRange.max} R$</p>
                      </div>
                      <div className={`text-lg font-bold ${strategyColor[priceResult.strategy] || "text-foreground"}`}>
                        {strategyLabel[priceResult.strategy] || priceResult.strategy}
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Обоснование</p>
                      <ul className="space-y-1.5">
                        {priceResult.reasoning.map((r, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <span className="text-amber-500 shrink-0">•</span> {r}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {priceResult.expectedSalesPerWeek && (
                      <div className="flex items-center gap-2 rounded-xl bg-secondary/50 p-3 text-sm">
                        <BarChart2 className="w-4 h-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Прогноз продаж:</span>
                        <span className="font-semibold">{priceResult.expectedSalesPerWeek}</span>
                      </div>
                    )}

                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Pro-советы</p>
                      <ul className="space-y-1.5">
                        {priceResult.proTips.map((tip, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <span className="text-blue-500 shrink-0">→</span> {tip}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              </ResultCard>
            )}
          </AnimatePresence>
        </TabsContent>

        <TabsContent value="chatbot" className="mt-4 space-y-4">
          <Card className="rounded-2xl border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><MessageSquare className="w-4 h-4 text-green-500" /> AI Chatbot</CardTitle>
              <CardDescription>Автогенерация ответов для community-постов и сообщений</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Сообщение/пост *</label>
                <Textarea
                  placeholder="Вставьте сообщение участника, на которое нужно ответить..."
                  value={chatbotForm.post}
                  onChange={e => setChatbotForm(p => ({ ...p, post: e.target.value }))}
                  className="rounded-xl resize-none"
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Тон ответа</label>
                  <Select value={chatbotForm.tone} onValueChange={v => setChatbotForm(p => ({ ...p, tone: v }))}>
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>{toneOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Контекст группы</label>
                  <Input placeholder="Название/тема группы..." value={chatbotForm.groupContext} onChange={e => setChatbotForm(p => ({ ...p, groupContext: e.target.value }))} className="rounded-xl" />
                </div>
              </div>
              <Button className="w-full rounded-xl gap-2 bg-green-600 hover:bg-green-700" onClick={genChatbot} disabled={chatbotLoading || !chatbotForm.post.trim()}>
                {chatbotLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                Сгенерировать ответы
              </Button>
            </CardContent>
          </Card>
          <AnimatePresence>
            {chatbotResult && (
              <ResultCard>
                <Card className="rounded-2xl border-green-500/20 bg-green-500/5">
                  <CardContent className="pt-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div>
                          <p className="text-xs text-muted-foreground">Тональность поста</p>
                          <p className={`text-sm font-semibold capitalize ${sentimentColor[chatbotResult.sentiment] || ""}`}>{chatbotResult.sentiment}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Действие</p>
                          <p className="text-sm font-semibold">{actionLabel[chatbotResult.suggestedAction] || chatbotResult.suggestedAction}</p>
                        </div>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">3 варианта ответа</p>
                      <div className="space-y-2">
                        {chatbotResult.replies.map((reply, i) => (
                          <div key={i} className="rounded-xl border border-border/50 bg-card p-3">
                            <div className="flex items-start gap-3">
                              <span className="text-xs font-bold text-muted-foreground w-4 shrink-0 mt-0.5">{i + 1}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm leading-relaxed">{reply.text}</p>
                                <Badge variant="outline" className="text-[10px] mt-2">{reply.tone}</Badge>
                              </div>
                              <CopyButton text={reply.text} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </ResultCard>
            )}
          </AnimatePresence>
        </TabsContent>
      </Tabs>
    </div>
  );
}
