import { useState, useEffect, useCallback } from "react";
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
import {
  CalendarDays, FilePen, ListTodo, Bell, Plus, Trash2, Pencil, Check, X,
  Loader2, ChevronLeft, ChevronRight, AlertTriangle, Clock, CheckCircle2,
  Circle, ArrowUp, Minus, ArrowDown, Tag, Shirt, Megaphone, FileText,
  Image as ImageIcon, Zap, Flag, MoreHorizontal
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch<T = any>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { "Content-Type": "application/json", ...opts?.headers },
    credentials: "include", ...opts,
  });
  if (!res.ok) { const e = await res.json().catch(() => ({ error: "Error" })); throw new Error(e.error || "Failed"); }
  return res.json();
}

function daysLeft(ts: number) {
  return Math.ceil((ts - Date.now()) / 86400000);
}
function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString("ru", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtDateTime(ts: number) {
  return new Date(ts).toLocaleDateString("ru", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function toDateStr(ts: number) { return new Date(ts).toISOString().slice(0, 10); }

const EVENT_TYPES = [
  { value: "clothing", label: "👕 Одежда", color: "#6366f1" },
  { value: "post", label: "📢 Пост", color: "#f59e0b" },
  { value: "announcement", label: "📣 Анонс", color: "#10b981" },
  { value: "sale", label: "🏷️ Акция", color: "#ef4444" },
  { value: "collab", label: "🤝 Коллаб", color: "#8b5cf6" },
  { value: "stream", label: "🎮 Стрим", color: "#06b6d4" },
  { value: "other", label: "📌 Другое", color: "#6b7280" },
];
const DRAFT_TYPES = [
  { value: "clothing", label: "👕 Одежда" }, { value: "post", label: "📢 Пост" },
  { value: "announcement", label: "📣 Анонс" }, { value: "sale", label: "🏷️ Акция" },
  { value: "video", label: "🎬 Видео" }, { value: "other", label: "📌 Другое" },
];
const DRAFT_STATUSES = [
  { value: "draft", label: "✏️ Черновик", color: "text-gray-500 border-gray-400/30" },
  { value: "ready", label: "✅ Готов", color: "text-green-600 border-green-500/30" },
  { value: "scheduled", label: "🗓️ Запланирован", color: "text-blue-600 border-blue-500/30" },
  { value: "published", label: "🚀 Опубликован", color: "text-indigo-600 border-indigo-500/30" },
];
const TODO_CATEGORIES = [
  { value: "general", label: "📋 Общее" }, { value: "design", label: "🎨 Дизайн" },
  { value: "upload", label: "📤 Загрузка" }, { value: "moderation", label: "🛡️ Модерация" },
  { value: "marketing", label: "📣 Маркетинг" }, { value: "collab", label: "🤝 Коллаб" },
];
const REMINDER_TYPES = [
  { value: "upload", label: "📤 Загрузка" }, { value: "deadline", label: "⏰ Дедлайн" },
  { value: "sale", label: "🏷️ Акция" }, { value: "meeting", label: "🤝 Встреча" },
  { value: "payment", label: "💳 Оплата" }, { value: "other", label: "📌 Другое" },
];
const EVENT_COLOR_MAP: Record<string, string> = Object.fromEntries(EVENT_TYPES.map(e => [e.value, e.color]));

// ── Content Calendar ──────────────────────────────────────────────────────────
interface CalEvent { id: string; title: string; type: string; date: string; color: string; draftId: string | null; notes: string; createdAt: number }

function CalendarTab({ drafts }: { drafts: Draft[] }) {
  const { toast } = useToast();
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [today] = useState(new Date());
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: "", type: "clothing", notes: "", draftId: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<{ events: CalEvent[] }>("/api/content/calendar").then(({ events: e }) => setEvents(e)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const monthName = month.toLocaleDateString("ru", { month: "long", year: "numeric" });
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const firstDow = (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7; // Mon=0
  const todayStr = today.toISOString().slice(0, 10);

  const prevMonth = () => setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  const nextMonth = () => setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1));

  const getDateStr = (day: number) => {
    const d = new Date(month.getFullYear(), month.getMonth(), day);
    return d.toISOString().slice(0, 10);
  };

  const eventsOn = (dateStr: string) => events.filter(e => e.date === dateStr);

  const addEvent = async () => {
    if (!form.title || !selectedDay) return;
    setSaving(true);
    const evtType = EVENT_TYPES.find(t => t.value === form.type);
    try {
      const { event } = await apiFetch<{ event: CalEvent }>("/api/content/calendar", {
        method: "POST",
        body: JSON.stringify({ ...form, date: selectedDay, color: evtType?.color || "#000000", draftId: form.draftId || null }),
      });
      setEvents(p => [...p, event]);
      setShowAdd(false);
      setForm({ title: "", type: "clothing", notes: "", draftId: "" });
      toast({ title: "✅ Событие добавлено" });
    } catch (e) { toast({ variant: "destructive", title: "Ошибка", description: e instanceof Error ? e.message : "" }); }
    finally { setSaving(false); }
  };

  const deleteEvent = async (id: string) => {
    await apiFetch(`/api/content/calendar/${id}`, { method: "DELETE" });
    setEvents(p => p.filter(e => e.id !== id));
  };

  const selectedEvents = selectedDay ? eventsOn(selectedDay) : [];

  return (
    <div className="space-y-4">
      {/* Calendar header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="rounded-xl h-8 w-8 p-0" onClick={prevMonth}><ChevronLeft className="w-4 h-4" /></Button>
        <p className="font-bold text-base flex-1 text-center capitalize">{monthName}</p>
        <Button variant="ghost" size="sm" className="rounded-xl h-8 w-8 p-0" onClick={nextMonth}><ChevronRight className="w-4 h-4" /></Button>
        <Button size="sm" className="rounded-xl gap-1.5" onClick={() => setMonth(new Date(today.getFullYear(), today.getMonth(), 1))}>Сегодня</Button>
      </div>

      {/* Day of week headers */}
      <div className="grid grid-cols-7 gap-1">
        {["Пн","Вт","Ср","Чт","Пт","Сб","Вс"].map(d => (
          <div key={d} className="text-center text-[10px] font-bold text-muted-foreground py-1">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateStr = getDateStr(day);
          const dayEvents = eventsOn(dateStr);
          const isToday = dateStr === todayStr;
          const isSelected = selectedDay === dateStr;
          return (
            <button key={day} onClick={() => { setSelectedDay(dateStr === selectedDay ? null : dateStr); setShowAdd(false); }}
              className={`min-h-[48px] p-1 rounded-xl border text-left transition-all hover:border-black/30 ${isToday ? "border-black bg-black text-white" : isSelected ? "border-black/40 bg-secondary" : "border-border/40"}`}>
              <span className={`text-xs font-bold block mb-0.5 ${isToday ? "text-white" : ""}`}>{day}</span>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map(ev => (
                  <div key={ev.id} className="h-1.5 rounded-full" style={{ background: ev.color }} title={ev.title} />
                ))}
                {dayEvents.length > 3 && <p className={`text-[8px] ${isToday ? "text-white/70" : "text-muted-foreground"}`}>+{dayEvents.length - 3}</p>}
              </div>
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-3 flex-wrap">
        {EVENT_TYPES.map(t => <span key={t.value} className="flex items-center gap-1 text-[10px] text-muted-foreground"><span className="w-2 h-2 rounded-full inline-block" style={{ background: t.color }} />{t.label.split(" ")[1]}</span>)}
      </div>

      {/* Selected day panel */}
      <AnimatePresence>
        {selectedDay && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold">{new Date(selectedDay).toLocaleDateString("ru", { day: "numeric", month: "long" })}</p>
              <Button size="sm" className="rounded-xl gap-1.5 h-7 text-xs" onClick={() => setShowAdd(p => !p)}><Plus className="w-3 h-3" /> Добавить</Button>
            </div>

            {showAdd && (
              <Card className="rounded-2xl border-black/20 bg-secondary/20">
                <CardContent className="pt-3 pb-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Название события..." className="rounded-xl" />
                    <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v }))}>
                      <SelectTrigger className="rounded-xl h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>{EVENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  {drafts.length > 0 && (
                    <Select value={form.draftId} onValueChange={v => setForm(p => ({ ...p, draftId: v, title: p.title || drafts.find(d => d.id === v)?.title || "" }))}>
                      <SelectTrigger className="rounded-xl h-9 text-sm"><SelectValue placeholder="Привязать черновик (необяз.)" /></SelectTrigger>
                      <SelectContent>{drafts.map(d => <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                  <Input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Заметки..." className="rounded-xl" />
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1 rounded-xl" onClick={addEvent} disabled={saving || !form.title}>
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Добавить
                    </Button>
                    <Button size="sm" variant="ghost" className="rounded-xl" onClick={() => setShowAdd(false)}><X className="w-3.5 h-3.5" /></Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {selectedEvents.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">Нет событий на этот день</p>
            ) : (
              <div className="space-y-2">
                {selectedEvents.map(ev => {
                  const evType = EVENT_TYPES.find(t => t.value === ev.type);
                  return (
                    <div key={ev.id} className="flex items-center gap-3 rounded-xl border border-border/50 p-3" style={{ borderLeftColor: ev.color, borderLeftWidth: "3px" }}>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{ev.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground">{evType?.label}</span>
                          {ev.notes && <span className="text-xs text-muted-foreground/60 truncate">• {ev.notes}</span>}
                        </div>
                      </div>
                      <button onClick={() => deleteEvent(ev.id)} className="text-muted-foreground hover:text-red-500 transition-colors shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Draft System ──────────────────────────────────────────────────────────────
interface Draft { id: string; title: string; type: string; content: string; thumbnailUrl: string; scheduledAt: number | null; status: string; tags: string[]; createdAt: number; updatedAt: number }

function DraftTab({ drafts, setDrafts }: { drafts: Draft[]; setDrafts: React.Dispatch<React.SetStateAction<Draft[]>> }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "edit">("list");
  const [editing, setEditing] = useState<Draft | null>(null);
  const [form, setForm] = useState({ title: "", type: "clothing", content: "", thumbnailUrl: "", scheduledAt: "", status: "draft", tags: "" });
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    apiFetch<{ drafts: Draft[] }>("/api/content/drafts").then(({ drafts: d }) => setDrafts(d)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const openEdit = (draft?: Draft) => {
    if (draft) {
      setEditing(draft);
      setForm({ title: draft.title, type: draft.type, content: draft.content, thumbnailUrl: draft.thumbnailUrl, scheduledAt: draft.scheduledAt ? toDateStr(draft.scheduledAt) : "", status: draft.status, tags: draft.tags.join(", ") });
    } else {
      setEditing(null);
      setForm({ title: "", type: "clothing", content: "", thumbnailUrl: "", scheduledAt: "", status: "draft", tags: "" });
    }
    setView("edit");
  };

  const saveDraft = async () => {
    if (!form.title) return;
    setSaving(true);
    const body = { ...form, scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).getTime() : null, tags: form.tags.split(",").map(t => t.trim()).filter(Boolean) };
    try {
      if (editing) {
        await apiFetch(`/api/content/drafts/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) });
        setDrafts(p => p.map(d => d.id === editing.id ? { ...d, ...body, updatedAt: Date.now() } : d));
        toast({ title: "✅ Черновик обновлён" });
      } else {
        const { draft } = await apiFetch<{ draft: Draft }>("/api/content/drafts", { method: "POST", body: JSON.stringify(body) });
        setDrafts(p => [draft, ...p]);
        toast({ title: "✅ Черновик создан" });
      }
      setView("list");
    } catch (e) { toast({ variant: "destructive", title: "Ошибка", description: e instanceof Error ? e.message : "" }); }
    finally { setSaving(false); }
  };

  const deleteDraft = async (id: string) => {
    await apiFetch(`/api/content/drafts/${id}`, { method: "DELETE" });
    setDrafts(p => p.filter(d => d.id !== id));
    toast({ title: "✅ Черновик удалён" });
  };

  const updateStatus = async (id: string, status: string) => {
    await apiFetch(`/api/content/drafts/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    setDrafts(p => p.map(d => d.id === id ? { ...d, status, updatedAt: Date.now() } : d));
  };

  const filtered = filterStatus === "all" ? drafts : drafts.filter(d => d.status === filterStatus);

  if (view === "edit") return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="rounded-xl gap-1.5" onClick={() => setView("list")}><X className="w-4 h-4" /> Отмена</Button>
        <p className="font-semibold">{editing ? "Редактировать" : "Новый"} черновик</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Название..." className="rounded-xl" />
        <div className="grid grid-cols-2 gap-2">
          <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v }))}>
            <SelectTrigger className="rounded-xl h-9"><SelectValue /></SelectTrigger>
            <SelectContent>{DRAFT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
            <SelectTrigger className="rounded-xl h-9"><SelectValue /></SelectTrigger>
            <SelectContent>{DRAFT_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <Textarea value={form.content} onChange={e => setForm(p => ({ ...p, content: e.target.value }))} placeholder="Описание, текст публикации, заметки по дизайну..." className="rounded-xl resize-none" rows={5} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">URL превью (необяз.)</Label><Input value={form.thumbnailUrl} onChange={e => setForm(p => ({ ...p, thumbnailUrl: e.target.value }))} placeholder="https://..." className="rounded-xl" /></div>
        <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Дата публикации</Label><Input type="date" value={form.scheduledAt} onChange={e => setForm(p => ({ ...p, scheduledAt: e.target.value }))} className="rounded-xl" /></div>
      </div>
      <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Теги (через запятую)</Label><Input value={form.tags} onChange={e => setForm(p => ({ ...p, tags: e.target.value }))} placeholder="лето, хайп, коллаб..." className="rounded-xl" /></div>
      <Button className="w-full rounded-xl gap-2" onClick={saveDraft} disabled={saving || !form.title}>
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {editing ? "Сохранить" : "Создать черновик"}
      </Button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1 bg-secondary/50 rounded-xl border border-border p-1">
          {["all", ...DRAFT_STATUSES.map(s => s.value)].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)} className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition-colors ${filterStatus === s ? "bg-black text-white" : "text-muted-foreground"}`}>
              {s === "all" ? "Все" : DRAFT_STATUSES.find(st => st.value === s)?.label.split(" ")[1]}
            </button>
          ))}
        </div>
        <Button size="sm" className="rounded-xl gap-1.5" onClick={() => openEdit()}><Plus className="w-3.5 h-3.5" /> Новый черновик</Button>
      </div>

      {loading ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground flex flex-col items-center gap-2"><FilePen className="w-12 h-12 opacity-20" /><p className="text-sm">Нет черновиков</p><Button size="sm" className="rounded-xl gap-1.5 mt-2" onClick={() => openEdit()}><Plus className="w-3.5 h-3.5" /> Создать первый</Button></div>
      ) : (
        <div className="space-y-2">
          {filtered.map(draft => {
            const draftType = DRAFT_TYPES.find(t => t.value === draft.type);
            const draftStatus = DRAFT_STATUSES.find(s => s.value === draft.status);
            return (
              <Card key={draft.id} className="rounded-2xl border-border/50 hover:border-black/20 transition-colors">
                <CardContent className="p-4 flex items-start gap-3">
                  {draft.thumbnailUrl ? (
                    <img src={draft.thumbnailUrl} alt="" className="w-12 h-12 rounded-xl object-cover shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center shrink-0 text-xl">
                      {draftType?.label.split(" ")[0]}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 flex-wrap">
                      <p className="font-bold text-sm flex-1 min-w-0 truncate">{draft.title}</p>
                      <Select value={draft.status} onValueChange={v => updateStatus(draft.id, v)}>
                        <SelectTrigger className={`h-6 w-auto rounded-lg border text-[10px] font-semibold px-2 ${draftStatus?.color}`}><SelectValue /></SelectTrigger>
                        <SelectContent>{DRAFT_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    {draft.content && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{draft.content}</p>}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-[10px] text-muted-foreground">{draftType?.label}</span>
                      {draft.scheduledAt && <span className="text-[10px] text-blue-600">📅 {fmtDate(draft.scheduledAt)}</span>}
                      {draft.tags.slice(0, 3).map(t => <span key={t} className="text-[9px] bg-secondary rounded-md px-1.5 py-0.5">{t}</span>)}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-lg" onClick={() => openEdit(draft)}><Pencil className="w-3 h-3" /></Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-lg text-red-500 hover:bg-red-500/10" onClick={() => deleteDraft(draft.id)}><Trash2 className="w-3 h-3" /></Button>
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

// ── To-Do List ────────────────────────────────────────────────────────────────
interface Todo { id: string; title: string; description: string; priority: string; category: string; dueDate: number | null; done: boolean; createdAt: number }

const PRIORITY_META: Record<string, { icon: JSX.Element; label: string; color: string }> = {
  high: { icon: <ArrowUp className="w-3 h-3" />, label: "Высокий", color: "text-red-500" },
  medium: { icon: <Minus className="w-3 h-3" />, label: "Средний", color: "text-amber-500" },
  low: { icon: <ArrowDown className="w-3 h-3" />, label: "Низкий", color: "text-blue-500" },
};

function TodoTab() {
  const { toast } = useToast();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", priority: "medium", category: "general", dueDate: "" });
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "done">("active");

  useEffect(() => {
    apiFetch<{ todos: Todo[] }>("/api/content/todos").then(({ todos: t }) => setTodos(t)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const addTodo = async () => {
    if (!form.title) return;
    setSaving(true);
    try {
      const { todo } = await apiFetch<{ todo: Todo }>("/api/content/todos", {
        method: "POST", body: JSON.stringify({ ...form, dueDate: form.dueDate ? new Date(form.dueDate).getTime() : null }),
      });
      setTodos(p => [todo, ...p]);
      setShowAdd(false); setForm({ title: "", description: "", priority: "medium", category: "general", dueDate: "" });
    } catch (e) { toast({ variant: "destructive", title: "Ошибка" }); }
    finally { setSaving(false); }
  };

  const toggle = async (todo: Todo) => {
    await apiFetch(`/api/content/todos/${todo.id}`, { method: "PATCH", body: JSON.stringify({ done: !todo.done }) });
    setTodos(p => p.map(t => t.id === todo.id ? { ...t, done: !t.done } : t).sort((a, b) => {
      const P: any = { high: 0, medium: 1, low: 2 };
      if (a.done !== b.done) return a.done ? 1 : -1;
      return P[a.priority] - P[b.priority];
    }));
  };

  const deleteTodo = async (id: string) => {
    await apiFetch(`/api/content/todos/${id}`, { method: "DELETE" });
    setTodos(p => p.filter(t => t.id !== id));
  };

  const filtered = todos.filter(t => filter === "all" ? true : filter === "done" ? t.done : !t.done);
  const counts = { active: todos.filter(t => !t.done).length, done: todos.filter(t => t.done).length };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1 bg-secondary/50 rounded-xl border border-border p-1">
          {([["active", `Активные (${counts.active})`], ["done", `Выполнены (${counts.done})`], ["all", "Все"]] as [string, string][]).map(([k, v]) => (
            <button key={k} onClick={() => setFilter(k as any)} className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition-colors ${filter === k ? "bg-black text-white" : "text-muted-foreground"}`}>{v}</button>
          ))}
        </div>
        <Button size="sm" className="rounded-xl gap-1.5" onClick={() => setShowAdd(p => !p)}><Plus className="w-3.5 h-3.5" /> Добавить задачу</Button>
      </div>

      <AnimatePresence>
        {showAdd && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <Card className="rounded-2xl border-black/20 bg-secondary/20">
              <CardContent className="pt-4 space-y-2">
                <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Название задачи *" className="rounded-xl" />
                <Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Описание (необяз.)" className="rounded-xl" />
                <div className="grid grid-cols-3 gap-2">
                  <Select value={form.priority} onValueChange={v => setForm(p => ({ ...p, priority: v }))}>
                    <SelectTrigger className="rounded-xl h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(PRIORITY_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
                    <SelectTrigger className="rounded-xl h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>{TODO_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input type="date" value={form.dueDate} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))} className="rounded-xl h-9" />
                </div>
                <div className="flex gap-2">
                  <Button className="flex-1 rounded-xl" onClick={addTodo} disabled={saving || !form.title}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Добавить
                  </Button>
                  <Button variant="ghost" className="rounded-xl" onClick={() => setShowAdd(false)}><X className="w-4 h-4" /></Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-2xl" />) : filtered.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground"><ListTodo className="w-10 h-10 mx-auto mb-2 opacity-20" /><p className="text-sm">{filter === "done" ? "Нет выполненных задач" : "Нет активных задач"}</p></div>
      ) : (
        <div className="space-y-1.5">
          <AnimatePresence>
            {filtered.map(todo => {
              const pm = PRIORITY_META[todo.priority] || PRIORITY_META.medium;
              const cat = TODO_CATEGORIES.find(c => c.value === todo.category);
              const due = todo.dueDate ? daysLeft(todo.dueDate) : null;
              return (
                <motion.div key={todo.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8, height: 0 }}>
                  <div className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${todo.done ? "opacity-50 bg-secondary/30 border-border/30" : "border-border/50 hover:border-black/20"}`}>
                    <button onClick={() => toggle(todo)} className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${todo.done ? "border-green-500 bg-green-500 text-white" : "border-border hover:border-black"}`}>
                      {todo.done && <Check className="w-3 h-3" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold ${todo.done ? "line-through text-muted-foreground" : ""}`}>{todo.title}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className={`flex items-center gap-0.5 text-[10px] font-semibold ${pm.color}`}>{pm.icon}{pm.label}</span>
                        <span className="text-[10px] text-muted-foreground">{cat?.label}</span>
                        {due !== null && !todo.done && <span className={`text-[10px] font-medium ${due < 0 ? "text-red-500" : due === 0 ? "text-amber-600" : "text-muted-foreground"}`}>{due < 0 ? `Просрочено ${Math.abs(due)}д` : due === 0 ? "Сегодня!" : `${due}д`}</span>}
                      </div>
                    </div>
                    <button onClick={() => deleteTodo(todo.id)} className="text-muted-foreground hover:text-red-500 transition-colors shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

// ── Deadline Reminders ────────────────────────────────────────────────────────
interface Reminder { id: string; title: string; description: string; type: string; dueAt: number; notifyDaysBefore: number; notified: boolean; createdAt: number }

function RemindersTab() {
  const { toast } = useToast();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", type: "deadline", dueAt: "", dueTime: "12:00", notifyDaysBefore: "1" });
  const [saving, setSaving] = useState(false);
  const [showPast, setShowPast] = useState(false);

  useEffect(() => {
    apiFetch<{ reminders: Reminder[] }>("/api/content/reminders").then(({ reminders: r }) => setReminders(r)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const addReminder = async () => {
    if (!form.title || !form.dueAt) return;
    setSaving(true);
    const dueAt = new Date(`${form.dueAt}T${form.dueTime || "12:00"}`).getTime();
    try {
      const { reminder } = await apiFetch<{ reminder: Reminder }>("/api/content/reminders", {
        method: "POST", body: JSON.stringify({ ...form, dueAt, notifyDaysBefore: parseInt(form.notifyDaysBefore) }),
      });
      setReminders(p => [...p, reminder].sort((a, b) => a.dueAt - b.dueAt));
      setShowAdd(false); setForm({ title: "", description: "", type: "deadline", dueAt: "", dueTime: "12:00", notifyDaysBefore: "1" });
      toast({ title: "🔔 Напоминание создано" });
    } catch (e) { toast({ variant: "destructive", title: "Ошибка" }); }
    finally { setSaving(false); }
  };

  const deleteReminder = async (id: string) => {
    await apiFetch(`/api/content/reminders/${id}`, { method: "DELETE" });
    setReminders(p => p.filter(r => r.id !== id));
  };

  const now = Date.now();
  const active = reminders.filter(r => r.dueAt >= now - 86400000);
  const past = reminders.filter(r => r.dueAt < now - 86400000);
  const displayed = showPast ? reminders : active;

  const urgencyClass = (r: Reminder) => {
    const d = daysLeft(r.dueAt);
    if (d < 0) return "border-red-500/30 bg-red-500/5";
    if (d === 0) return "border-amber-500/30 bg-amber-500/5";
    if (d <= 3) return "border-yellow-400/30 bg-yellow-400/5";
    return "border-border/50";
  };
  const urgencyLabel = (r: Reminder) => {
    const d = daysLeft(r.dueAt);
    if (d < 0) return { text: `Просрочено ${Math.abs(d)}д назад`, color: "text-red-600", icon: <AlertTriangle className="w-3 h-3" /> };
    if (d === 0) return { text: "Сегодня!", color: "text-amber-600", icon: <Clock className="w-3 h-3" /> };
    if (d <= 3) return { text: `Через ${d}д`, color: "text-yellow-600", icon: <Clock className="w-3 h-3" /> };
    return { text: `Через ${d}д`, color: "text-muted-foreground", icon: <CalendarDays className="w-3 h-3" /> };
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <p className="font-semibold text-sm">Напоминания</p>
          {past.length > 0 && <button onClick={() => setShowPast(p => !p)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">{showPast ? "Скрыть прошедшие" : `+${past.length} прошедших`}</button>}
        </div>
        <Button size="sm" className="rounded-xl gap-1.5" onClick={() => setShowAdd(p => !p)}><Plus className="w-3.5 h-3.5" /> Добавить</Button>
      </div>

      {/* Upcoming summary */}
      {active.filter(r => daysLeft(r.dueAt) <= 7 && daysLeft(r.dueAt) >= 0).length > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
          <Bell className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="text-xs text-amber-700 font-medium">{active.filter(r => daysLeft(r.dueAt) <= 7 && daysLeft(r.dueAt) >= 0).length} напоминаний на этой неделе</p>
        </div>
      )}

      <AnimatePresence>
        {showAdd && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <Card className="rounded-2xl border-black/20 bg-secondary/20">
              <CardContent className="pt-4 space-y-2">
                <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Название напоминания *" className="rounded-xl" />
                <Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Описание (необяз.)" className="rounded-xl" />
                <div className="grid grid-cols-3 gap-2">
                  <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v }))}>
                    <SelectTrigger className="rounded-xl h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>{REMINDER_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input type="date" value={form.dueAt} onChange={e => setForm(p => ({ ...p, dueAt: e.target.value }))} className="rounded-xl h-9" />
                  <Input type="time" value={form.dueTime} onChange={e => setForm(p => ({ ...p, dueTime: e.target.value }))} className="rounded-xl h-9" />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">Уведомить за:</Label>
                  <div className="flex gap-1">
                    {["0", "1", "2", "3", "7"].map(d => (
                      <button key={d} onClick={() => setForm(p => ({ ...p, notifyDaysBefore: d }))}
                        className={`text-xs rounded-lg px-2.5 py-1 border transition-colors ${form.notifyDaysBefore === d ? "bg-black text-white border-black" : "border-border text-muted-foreground"}`}>{d === "0" ? "В день" : `${d}д`}</button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button className="flex-1 rounded-xl" onClick={addReminder} disabled={saving || !form.title || !form.dueAt}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />} Создать
                  </Button>
                  <Button variant="ghost" className="rounded-xl" onClick={() => setShowAdd(false)}><X className="w-4 h-4" /></Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />) : displayed.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground flex flex-col items-center gap-2"><Bell className="w-10 h-10 opacity-20" /><p className="text-sm">Нет напоминаний</p><p className="text-xs">Создайте напоминание о дедлайне, акции или загрузке</p></div>
      ) : (
        <div className="space-y-2">
          {displayed.map(r => {
            const ur = urgencyLabel(r);
            const rType = REMINDER_TYPES.find(t => t.value === r.type);
            const isPast = r.dueAt < now;
            return (
              <div key={r.id} className={`flex items-start gap-3 rounded-2xl border p-4 transition-colors ${urgencyClass(r)} ${isPast ? "opacity-60" : ""}`}>
                <div className={`mt-0.5 shrink-0 ${ur.color}`}>{ur.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-sm">{r.title}</p>
                    <Badge variant="outline" className="text-[9px]">{rType?.label}</Badge>
                    {r.notified && !isPast && <Badge variant="outline" className="text-[9px] text-blue-600 border-blue-400/30">🔔 Уведомлено</Badge>}
                  </div>
                  {r.description && <p className="text-xs text-muted-foreground mt-0.5">{r.description}</p>}
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`text-xs font-semibold ${ur.color}`}>{ur.text}</span>
                    <span className="text-[10px] text-muted-foreground">• {fmtDateTime(r.dueAt)}</span>
                    <span className="text-[10px] text-muted-foreground">• за {r.notifyDaysBefore}д</span>
                  </div>
                </div>
                <button onClick={() => deleteReminder(r.id)} className="text-muted-foreground hover:text-red-500 transition-colors shrink-0 mt-0.5"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ContentPlanner() {
  const [activeTab, setActiveTab] = useState("calendar");
  const [drafts, setDrafts] = useState<Draft[]>([]);

  return (
    <div className="p-6 lg:p-10 w-full max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3"><CalendarDays className="w-7 h-7" /> Content Planner</h1>
        <p className="text-muted-foreground mt-1 text-sm">Календарь публикаций, черновики, задачи и напоминания</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="rounded-xl bg-secondary/50 border border-border p-1 h-auto gap-1 flex-wrap">
          <TabsTrigger value="calendar" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-4 py-2 flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" /> Календарь</TabsTrigger>
          <TabsTrigger value="drafts" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-4 py-2 flex items-center gap-1.5"><FilePen className="w-3.5 h-3.5" /> Черновики</TabsTrigger>
          <TabsTrigger value="todos" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-4 py-2 flex items-center gap-1.5"><ListTodo className="w-3.5 h-3.5" /> To-Do</TabsTrigger>
          <TabsTrigger value="reminders" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-4 py-2 flex items-center gap-1.5"><Bell className="w-3.5 h-3.5" /> Напоминания</TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="calendar" className="mt-0"><CalendarTab drafts={drafts} /></TabsContent>
          <TabsContent value="drafts" className="mt-0"><DraftTab drafts={drafts} setDrafts={setDrafts} /></TabsContent>
          <TabsContent value="todos" className="mt-0"><TodoTab /></TabsContent>
          <TabsContent value="reminders" className="mt-0"><RemindersTab /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
