import { useState, useEffect, useRef, useCallback } from "react";
import { getAuthCredentials } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Users, UserPlus, Shield, BarChart2, MessageCircle, Clock,
  Loader2, Plus, Trash2, Pencil, Check, X, Star, Send,
  UserCheck, UserX, ChevronDown, ChevronUp, Timer, CheckCircle2,
  AlertCircle, Coffee
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
function getAuthHeaders(): Record<string, string> {
  const { credentials } = getAuthCredentials();
  return credentials ? { Authorization: `Bearer ${credentials}` } : {};
}
async function api<T = any>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, { ...opts, credentials: "include", headers: { "Content-Type": "application/json", ...getAuthHeaders(), ...(opts?.headers || {}) } });
  if (!res.ok) { const e = await res.json().catch(() => ({ error: "Error" })); throw new Error(e.error || "Failed"); }
  return res.json();
}

function timeAgo(ts: number) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return "только что";
  if (m < 60) return `${m}м назад`;
  if (m < 1440) return `${Math.floor(m / 60)}ч назад`;
  return `${Math.floor(m / 1440)}д назад`;
}
function fmtDuration(ms: number) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h ? `${h}ч ${m}м` : `${m}м`;
}

const STATUS_CFG = {
  active: { label: "Активен", color: "bg-green-500/15 text-green-700 border-green-500/30" },
  inactive: { label: "Неактивен", color: "bg-gray-200 text-gray-600" },
  suspended: { label: "Отстранён", color: "bg-red-500/15 text-red-700 border-red-500/30" },
};
const SHIFT_STATUS = {
  scheduled: { label: "Запланирована", color: "bg-blue-500/15 text-blue-700", icon: <Clock className="w-3 h-3" /> },
  "in-progress": { label: "Идёт", color: "bg-green-500/15 text-green-700", icon: <Timer className="w-3 h-3" /> },
  completed: { label: "Завершена", color: "bg-gray-100 text-gray-500", icon: <CheckCircle2 className="w-3 h-3" /> },
  cancelled: { label: "Отменена", color: "bg-red-500/15 text-red-600", icon: <X className="w-3 h-3" /> },
};

function Avatar({ url, name, size = 8 }: { url: string; name: string; size?: number }) {
  const [err, setErr] = useState(false);
  const initials = name.slice(0, 2).toUpperCase();
  if (err) return <div className={`w-${size} h-${size} rounded-full bg-secondary flex items-center justify-center text-xs font-bold`}>{initials}</div>;
  return <img src={url} alt={name} onError={() => setErr(true)} className={`w-${size} h-${size} rounded-full object-cover`} />;
}

function Stars({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <button key={i} onClick={() => onChange?.(i)} className={`${onChange ? "cursor-pointer" : "cursor-default"}`}>
          <Star className={`w-4 h-4 ${i <= value ? "fill-amber-400 text-amber-400" : "text-gray-200"}`} />
        </button>
      ))}
    </div>
  );
}

// ── Staff Manager ─────────────────────────────────────────────────────────────
function StaffTab() {
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "inactive" | "suspended">("all");
  const [form, setForm] = useState({ username: "", robloxId: "", displayName: "", avatarUrl: "", role: "moderator", department: "Менеджмент", salary: "", notes: "" });

  useEffect(() => { api("/api/team/staff").then(setData).catch(() => {}).finally(() => setLoading(false)); }, []);

  const resetForm = () => setForm({ username: "", robloxId: "", displayName: "", avatarUrl: "", role: "moderator", department: "Менеджмент", salary: "", notes: "" });

  const save = async () => {
    if (!form.username) return;
    setSaving(true);
    try {
      if (editId) {
        await api(`/api/team/staff/${editId}`, { method: "PATCH", body: JSON.stringify({ ...form, salary: Number(form.salary) }) });
        setData((p: any) => ({ ...p, staff: p.staff.map((m: any) => m.id === editId ? { ...m, ...form, salary: Number(form.salary) } : m) }));
        setEditId(null);
      } else {
        const { member } = await api<any>("/api/team/staff", { method: "POST", body: JSON.stringify({ ...form, salary: Number(form.salary) }) });
        setData((p: any) => ({ ...p, staff: [...p.staff, member] }));
        setShowAdd(false);
      }
      resetForm();
      toast({ title: "✅ Сохранено" });
    } catch (e) { toast({ variant: "destructive", title: "Ошибка", description: (e as Error).message }); }
    finally { setSaving(false); }
  };

  const setStatus = async (id: string, status: string) => {
    await api(`/api/team/staff/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    setData((p: any) => ({ ...p, staff: p.staff.map((m: any) => m.id === id ? { ...m, status } : m) }));
  };

  const remove = async (id: string) => {
    await api(`/api/team/staff/${id}`, { method: "DELETE" });
    setData((p: any) => ({ ...p, staff: p.staff.filter((m: any) => m.id !== id) }));
    toast({ title: "Сотрудник удалён" });
  };

  const startEdit = (m: any) => { setEditId(m.id); setShowAdd(false); setForm({ username: m.username, robloxId: m.robloxId, displayName: m.displayName, avatarUrl: m.avatarUrl, role: m.role, department: m.department, salary: String(m.salary), notes: m.notes }); };

  const filtered = (data?.staff || []).filter((m: any) => filter === "all" || m.status === filter);
  const activeCount = (data?.staff || []).filter((m: any) => m.status === "active").length;

  const FormPanel = () => (
    <Card className="rounded-2xl border-black/20 bg-secondary/20">
      <CardContent className="pt-4 space-y-3">
        <p className="text-sm font-semibold">{editId ? "Редактировать" : "Добавить"} сотрудника</p>
        <div className="grid grid-cols-2 gap-2">
          <Input value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))} placeholder="Roblox username *" className="rounded-xl" />
          <Input value={form.robloxId} onChange={e => setForm(p => ({ ...p, robloxId: e.target.value }))} placeholder="Roblox ID" className="rounded-xl" />
          <Input value={form.displayName} onChange={e => setForm(p => ({ ...p, displayName: e.target.value }))} placeholder="Отображаемое имя" className="rounded-xl" />
          <Input value={form.salary} onChange={e => setForm(p => ({ ...p, salary: e.target.value }))} placeholder="Зарплата (Robux)" className="rounded-xl" type="number" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select value={form.role} onValueChange={v => setForm(p => ({ ...p, role: v }))}>
            <SelectTrigger className="rounded-xl h-9"><SelectValue placeholder="Роль" /></SelectTrigger>
            <SelectContent>{(data?.roles || []).map((r: any) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={form.department} onValueChange={v => setForm(p => ({ ...p, department: v }))}>
            <SelectTrigger className="rounded-xl h-9"><SelectValue placeholder="Отдел" /></SelectTrigger>
            <SelectContent>{(data?.departments || []).map((d: string) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Заметки..." className="rounded-xl resize-none text-sm" rows={2} />
        <div className="flex gap-2">
          <Button className="flex-1 rounded-xl gap-1.5" onClick={save} disabled={saving || !form.username}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Сохранить</Button>
          <Button variant="ghost" className="rounded-xl" onClick={() => { setShowAdd(false); setEditId(null); resetForm(); }}><X className="w-4 h-4" /></Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold">Staff Manager</p>
          <p className="text-xs text-muted-foreground">{activeCount} активных из {data?.staff?.length || 0} сотрудников</p>
        </div>
        <Button size="sm" className="rounded-xl gap-1.5" onClick={() => { setShowAdd(p => !p); setEditId(null); resetForm(); }}><UserPlus className="w-3.5 h-3.5" /> Добавить</Button>
      </div>

      <AnimatePresence>{showAdd && !editId && <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}><FormPanel /></motion.div>}</AnimatePresence>

      <div className="flex gap-1.5 flex-wrap">
        {(["all", "active", "inactive", "suspended"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`text-xs rounded-lg px-3 py-1.5 border font-medium transition-colors ${filter === f ? "bg-black text-white border-black" : "border-border hover:border-black/30"}`}>
            {f === "all" ? "Все" : STATUS_CFG[f].label}
          </button>
        ))}
      </div>

      {loading ? <Skeleton className="h-32 rounded-2xl" /> : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground flex flex-col items-center gap-2"><Users className="w-10 h-10 opacity-20" /><p className="text-sm">Нет сотрудников</p></div>
      ) : (
        <div className="space-y-2">
          {filtered.map((m: any) => {
            const roleObj = (data?.roles || []).find((r: any) => r.id === m.role);
            const expanded = expandedId === m.id;
            return (
              <div key={m.id}>
                {editId === m.id ? <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}><FormPanel /></motion.div> : (
                  <Card className="rounded-2xl border-border/50 hover:border-black/15 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <Avatar url={m.avatarUrl} name={m.displayName} size={10} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-sm">{m.displayName}</p>
                            <span className="text-xs text-muted-foreground">@{m.username}</span>
                            {roleObj && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md" style={{ background: roleObj.color + "22", color: roleObj.color }}>{roleObj.name}</span>}
                            <Badge variant="outline" className={`text-[10px] ${STATUS_CFG[m.status as keyof typeof STATUS_CFG]?.color}`}>{STATUS_CFG[m.status as keyof typeof STATUS_CFG]?.label}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{m.department} {m.salary > 0 ? `• 💰 ${m.salary} R$` : ""}</p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-lg" onClick={() => setExpandedId(expanded ? null : m.id)}>{expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}</Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-lg" onClick={() => startEdit(m)}><Pencil className="w-3 h-3" /></Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-lg text-red-500 hover:bg-red-500/10" onClick={() => remove(m.id)}><Trash2 className="w-3 h-3" /></Button>
                        </div>
                      </div>
                      <AnimatePresence>
                        {expanded && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                            <div className="mt-3 pt-3 border-t border-border/40 space-y-2">
                              {m.notes && <p className="text-xs text-muted-foreground italic">"{m.notes}"</p>}
                              <p className="text-xs text-muted-foreground">Roblox ID: {m.robloxId || "не указан"} • В команде с {new Date(m.joinedAt).toLocaleDateString("ru")}</p>
                              <div className="flex gap-2">
                                {m.status !== "active" && <Button size="sm" variant="outline" className="rounded-lg h-7 text-xs gap-1 text-green-600 border-green-500/30 hover:bg-green-500/10" onClick={() => setStatus(m.id, "active")}><UserCheck className="w-3 h-3" /> Активировать</Button>}
                                {m.status !== "suspended" && <Button size="sm" variant="outline" className="rounded-lg h-7 text-xs gap-1 text-red-600 border-red-500/30 hover:bg-red-500/10" onClick={() => setStatus(m.id, "suspended")}><UserX className="w-3 h-3" /> Отстранить</Button>}
                                {m.status !== "inactive" && <Button size="sm" variant="outline" className="rounded-lg h-7 text-xs gap-1" onClick={() => setStatus(m.id, "inactive")}><Coffee className="w-3 h-3" /> Неактивен</Button>}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </CardContent>
                  </Card>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Role Permissions ──────────────────────────────────────────────────────────
function RolesTab() {
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", color: "#888888", level: "10", permissions: [] as string[] });

  useEffect(() => { api("/api/team/roles").then(setData).catch(() => {}).finally(() => setLoading(false)); }, []);

  const togglePerm = (key: string) => setForm(p => ({ ...p, permissions: p.permissions.includes(key) ? p.permissions.filter(x => x !== key) : [...p.permissions, key] }));

  const save = async () => {
    if (!form.name) return;
    setSaving(true);
    try {
      const payload = { ...form, level: Number(form.level) };
      if (editId) {
        await api(`/api/team/roles/${editId}`, { method: "PATCH", body: JSON.stringify(payload) });
        setData((p: any) => ({ ...p, roles: p.roles.map((r: any) => r.id === editId ? { ...r, ...payload } : r) }));
        setEditId(null);
      } else {
        const { role } = await api<any>("/api/team/roles", { method: "POST", body: JSON.stringify(payload) });
        setData((p: any) => ({ ...p, roles: [...p.roles, role] }));
        setShowAdd(false);
      }
      setForm({ name: "", color: "#888888", level: "10", permissions: [] });
      toast({ title: "✅ Роль сохранена" });
    } catch { toast({ variant: "destructive", title: "Ошибка" }); }
    finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    await api(`/api/team/roles/${id}`, { method: "DELETE" });
    setData((p: any) => ({ ...p, roles: p.roles.filter((r: any) => r.id !== id) }));
  };

  const startEdit = (r: any) => { setEditId(r.id); setShowAdd(false); setForm({ name: r.name, color: r.color, level: String(r.level), permissions: r.permissions }); };

  const FormPanel = () => (
    <Card className="rounded-2xl border-black/20 bg-secondary/20">
      <CardContent className="pt-4 space-y-3">
        <p className="text-sm font-semibold">{editId ? "Редактировать" : "Новая"} роль</p>
        <div className="grid grid-cols-3 gap-2">
          <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Название *" className="rounded-xl col-span-2" />
          <Input value={form.level} onChange={e => setForm(p => ({ ...p, level: e.target.value }))} placeholder="Уровень" className="rounded-xl" type="number" />
        </div>
        <div className="flex items-center gap-3">
          <Label className="text-xs text-muted-foreground">Цвет</Label>
          <input type="color" value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))} className="w-8 h-8 rounded cursor-pointer" />
          <span className="text-sm font-bold px-2.5 py-0.5 rounded-lg" style={{ background: form.color + "22", color: form.color }}>{form.name || "Роль"}</span>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Права доступа</Label>
          <div className="grid grid-cols-2 gap-1.5">
            {(data?.allPermissions || []).map((p: any) => (
              <label key={p.key} className="flex items-center gap-2 text-xs cursor-pointer hover:text-foreground text-muted-foreground">
                <input type="checkbox" checked={form.permissions.includes(p.key)} onChange={() => togglePerm(p.key)} className="rounded" />
                {p.label}
              </label>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Button className="flex-1 rounded-xl gap-1.5" onClick={save} disabled={saving || !form.name}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Сохранить</Button>
          <Button variant="ghost" className="rounded-xl" onClick={() => { setShowAdd(false); setEditId(null); }}><X className="w-4 h-4" /></Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><p className="font-semibold">Role Permissions</p><p className="text-xs text-muted-foreground">{data?.roles?.length || 0} ролей в системе</p></div>
        <Button size="sm" className="rounded-xl gap-1.5" onClick={() => { setShowAdd(p => !p); setEditId(null); }}><Plus className="w-3.5 h-3.5" /> Новая роль</Button>
      </div>

      <AnimatePresence>{showAdd && !editId && <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}><FormPanel /></motion.div>}</AnimatePresence>

      {loading ? <Skeleton className="h-40 rounded-2xl" /> : (
        <div className="space-y-2">
          {[...(data?.roles || [])].sort((a: any, b: any) => b.level - a.level).map((r: any) => (
            <div key={r.id}>
              {editId === r.id ? <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}><FormPanel /></motion.div> : (
                <Card className="rounded-2xl border-border/50 hover:border-black/15 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-8 rounded-full shrink-0" style={{ background: r.color }} />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm">{r.name}</span>
                          <span className="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">Lvl {r.level}</span>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {r.permissions.slice(0, 5).map((p: string) => (
                            <span key={p} className="text-[10px] bg-secondary rounded-md px-1.5 py-0.5">
                              {(data?.allPermissions || []).find((ap: any) => ap.key === p)?.label || p}
                            </span>
                          ))}
                          {r.permissions.length > 5 && <span className="text-[10px] text-muted-foreground">+{r.permissions.length - 5}</span>}
                          {r.permissions.length === 0 && <span className="text-[10px] text-muted-foreground italic">Нет прав</span>}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-lg" onClick={() => startEdit(r)}><Pencil className="w-3 h-3" /></Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-lg text-red-500 hover:bg-red-500/10" onClick={() => remove(r.id)}><Trash2 className="w-3 h-3" /></Button>
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

// ── Performance ───────────────────────────────────────────────────────────────
function PerformanceTab() {
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<string>("all");
  const [form, setForm] = useState({ staffId: "", tasksCompleted: "1", rating: 5, note: "", category: "general" });

  useEffect(() => { api("/api/team/performance").then(setData).catch(() => {}).finally(() => setLoading(false)); }, []);

  const save = async () => {
    if (!form.staffId) return;
    setSaving(true);
    try {
      const { record } = await api<any>("/api/team/performance", { method: "POST", body: JSON.stringify({ ...form, tasksCompleted: Number(form.tasksCompleted) }) });
      setData((p: any) => ({ ...p, records: [...p.records, record] }));
      setShowAdd(false);
      setForm({ staffId: "", tasksCompleted: "1", rating: 5, note: "", category: "general" });
      toast({ title: "✅ Запись добавлена" });
    } catch { toast({ variant: "destructive", title: "Ошибка" }); }
    finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    await api(`/api/team/performance/${id}`, { method: "DELETE" });
    setData((p: any) => ({ ...p, records: p.records.filter((r: any) => r.id !== id) }));
  };

  const staffMap = Object.fromEntries((data?.staff || []).map((m: any) => [m.id, m]));
  const filtered = (data?.records || []).filter((r: any) => selectedStaff === "all" || r.staffId === selectedStaff);

  // stats per staff
  const staffStats = (data?.staff || []).map((m: any) => {
    const recs = (data?.records || []).filter((r: any) => r.staffId === m.id);
    const tasks = recs.reduce((s: number, r: any) => s + r.tasksCompleted, 0);
    const avgRating = recs.length ? recs.reduce((s: number, r: any) => s + r.rating, 0) / recs.length : 0;
    return { ...m, tasks, avgRating: Number(avgRating.toFixed(1)), recCount: recs.length };
  }).sort((a: any, b: any) => b.tasks - a.tasks);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><p className="font-semibold">Staff Performance</p><p className="text-xs text-muted-foreground">{data?.records?.length || 0} записей оценки</p></div>
        <Button size="sm" className="rounded-xl gap-1.5" onClick={() => setShowAdd(p => !p)} disabled={!data?.staff?.length}><Plus className="w-3.5 h-3.5" /> Добавить запись</Button>
      </div>

      <AnimatePresence>
        {showAdd && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <Card className="rounded-2xl border-black/20 bg-secondary/20">
              <CardContent className="pt-4 space-y-3">
                <Select value={form.staffId} onValueChange={v => setForm(p => ({ ...p, staffId: v }))}>
                  <SelectTrigger className="rounded-xl h-9"><SelectValue placeholder="Выберите сотрудника *" /></SelectTrigger>
                  <SelectContent>{(data?.staff || []).map((m: any) => <SelectItem key={m.id} value={m.id}>{m.displayName}</SelectItem>)}</SelectContent>
                </Select>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Выполнено задач</Label><Input value={form.tasksCompleted} onChange={e => setForm(p => ({ ...p, tasksCompleted: e.target.value }))} type="number" min="0" className="rounded-xl" /></div>
                  <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Категория</Label>
                    <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}><SelectTrigger className="rounded-xl h-9"><SelectValue /></SelectTrigger><SelectContent>{["general", "design", "moderation", "support", "marketing"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
                  </div>
                </div>
                <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Оценка</Label><Stars value={form.rating} onChange={v => setForm(p => ({ ...p, rating: v }))} /></div>
                <Textarea value={form.note} onChange={e => setForm(p => ({ ...p, note: e.target.value }))} placeholder="Заметка о работе..." className="rounded-xl resize-none text-sm" rows={2} />
                <div className="flex gap-2">
                  <Button className="flex-1 rounded-xl gap-1.5" onClick={save} disabled={saving || !form.staffId}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Сохранить</Button>
                  <Button variant="ghost" className="rounded-xl" onClick={() => setShowAdd(false)}><X className="w-4 h-4" /></Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {!data?.staff?.length && !loading && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-700">Сначала добавьте сотрудников во вкладке "Сотрудники"</div>
      )}

      {/* Top performers */}
      {staffStats.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {staffStats.slice(0, 6).map((m: any, i: number) => (
            <Card key={m.id} className={`rounded-2xl border-border/50 ${i === 0 ? "border-amber-400/40 bg-amber-50/30 dark:bg-amber-500/5" : ""}`}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className="relative">
                  <Avatar url={m.avatarUrl} name={m.displayName} size={10} />
                  {i === 0 && <span className="absolute -top-1 -right-1 text-sm">👑</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{m.displayName}</p>
                  <p className="text-xs text-muted-foreground">{m.tasks} задач • <Stars value={Math.round(m.avgRating)} /></p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Records */}
      {loading ? <Skeleton className="h-32 rounded-2xl" /> : (
        <div className="space-y-3">
          <div className="flex gap-2 items-center">
            <Select value={selectedStaff} onValueChange={setSelectedStaff}>
              <SelectTrigger className="rounded-xl h-8 w-48 text-xs"><SelectValue placeholder="Все сотрудники" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Все сотрудники</SelectItem>{(data?.staff || []).map((m: any) => <SelectItem key={m.id} value={m.id}>{m.displayName}</SelectItem>)}</SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">{filtered.length} записей</span>
          </div>
          {filtered.slice().reverse().map((r: any) => {
            const staff = staffMap[r.staffId];
            return (
              <div key={r.id} className="flex items-start gap-3 rounded-xl border border-border/40 p-3 hover:border-black/15 transition-colors">
                {staff && <Avatar url={staff.avatarUrl} name={staff.displayName} size={8} />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap"><p className="text-sm font-bold">{staff?.displayName || "Неизвестный"}</p><Stars value={r.rating} /><span className="text-xs text-muted-foreground">{r.tasksCompleted} задач</span></div>
                  {r.note && <p className="text-xs text-muted-foreground italic mt-0.5">"{r.note}"</p>}
                  <p className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(r.date)} • {r.category}</p>
                </div>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 rounded text-red-400 hover:bg-red-500/10" onClick={() => remove(r.id)}><Trash2 className="w-3 h-3" /></Button>
              </div>
            );
          })}
          {filtered.length === 0 && <div className="text-center py-8 text-muted-foreground text-sm">Нет записей оценки</div>}
        </div>
      )}
    </div>
  );
}

// ── Internal Chat ─────────────────────────────────────────────────────────────
const QUICK_REACTIONS = ["👍", "❤️", "🔥", "👏", "😂", "✅"];

function ChatTab() {
  const { toast } = useToast();
  const [messages, setMessages] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [authorId, setAuthorId] = useState("owner");
  const [authorName, setAuthorName] = useState("Владелец");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api("/api/team/chat").then(d => setMessages(d.messages)).catch(() => {});
    api("/api/team/staff").then(d => setStaff(d.staff)).finally(() => setLoading(false));
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      const { message } = await api<any>("/api/team/chat", { method: "POST", body: JSON.stringify({ authorId, authorName, text }) });
      setMessages(p => [...p, message]);
      setText("");
    } catch { toast({ variant: "destructive", title: "Ошибка" }); }
    finally { setSending(false); }
  };

  const react = async (id: string, emoji: string) => {
    await api(`/api/team/chat/${id}/react`, { method: "POST", body: JSON.stringify({ emoji }) });
    setMessages(p => p.map(m => m.id === id ? { ...m, reactions: { ...m.reactions, [emoji]: (m.reactions[emoji] || 0) + 1 } } : m));
  };

  const remove = async (id: string) => {
    await api(`/api/team/chat/${id}`, { method: "DELETE" });
    setMessages(p => p.filter(m => m.id !== id));
  };

  const selectAuthor = (id: string) => {
    setAuthorId(id);
    if (id === "owner") { setAuthorName("Владелец"); return; }
    const m = staff.find(s => s.id === id);
    if (m) setAuthorName(m.displayName);
  };

  const staffMember = staff.find(s => s.id === authorId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><p className="font-semibold">Internal Chat</p><p className="text-xs text-muted-foreground">{messages.length} сообщений</p></div>
        <Select value={authorId} onValueChange={selectAuthor}>
          <SelectTrigger className="rounded-xl h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="owner">👑 Владелец (вы)</SelectItem>
            {staff.filter(m => m.status === "active").map(m => <SelectItem key={m.id} value={m.id}>{m.displayName}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-2xl border border-border/50 overflow-hidden flex flex-col" style={{ height: "420px" }}>
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-secondary/10">
          {loading ? <Skeleton className="h-full rounded-xl" /> : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
              <MessageCircle className="w-10 h-10 opacity-20" />
              <p className="text-sm">Начните общение с командой</p>
            </div>
          ) : messages.map((m) => {
            const isOwn = m.authorId === authorId;
            const member = staff.find(s => s.id === m.authorId);
            return (
              <motion.div key={m.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className={`flex gap-2 ${isOwn ? "flex-row-reverse" : ""} group`}>
                {member ? <Avatar url={member.avatarUrl} name={member.displayName} size={7} /> : <div className="w-7 h-7 rounded-full bg-black flex items-center justify-center text-white text-xs font-bold shrink-0">👑</div>}
                <div className={`max-w-[75%] space-y-1 ${isOwn ? "items-end" : "items-start"} flex flex-col`}>
                  <div className="flex items-center gap-2">
                    <p className={`text-[10px] text-muted-foreground ${isOwn ? "order-2" : ""}`}>{m.authorName}</p>
                    <p className={`text-[10px] text-muted-foreground ${isOwn ? "order-1" : ""}`}>{timeAgo(m.sentAt)}</p>
                  </div>
                  <div className={`rounded-2xl px-3 py-2 text-sm ${isOwn ? "bg-black text-white rounded-tr-sm" : "bg-white border border-border/50 rounded-tl-sm"}`}>{m.text}</div>
                  <div className="flex items-center gap-1 flex-wrap">
                    {Object.entries(m.reactions || {}).filter(([, count]) => (count as number) > 0).map(([emoji, count]) => (
                      <button key={emoji} onClick={() => react(m.id, emoji)} className="text-xs bg-secondary rounded-full px-1.5 py-0.5 hover:bg-secondary/80">{emoji} {count as number}</button>
                    ))}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
                      {QUICK_REACTIONS.map(e => <button key={e} onClick={() => react(m.id, e)} className="text-sm hover:scale-125 transition-transform">{e}</button>)}
                      <button onClick={() => remove(m.id)} className="text-muted-foreground hover:text-red-500 ml-1"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
          <div ref={bottomRef} />
        </div>
        <div className="border-t border-border/40 p-3 flex gap-2 bg-background">
          <Input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Написать сообщение..." className="rounded-xl flex-1" />
          <Button onClick={send} disabled={sending || !text.trim()} className="rounded-xl">{sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}</Button>
        </div>
      </div>
    </div>
  );
}

// ── Shift System ──────────────────────────────────────────────────────────────
function ShiftsTab() {
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [form, setForm] = useState({ title: "", date: new Date().toISOString().split("T")[0], startTime: "09:00", endTime: "18:00", department: "Менеджмент", requiredStaff: "1", notes: "", assignedStaff: [] as string[] });

  useEffect(() => { api("/api/team/shifts").then(setData).catch(() => {}).finally(() => setLoading(false)); }, []);

  const staffMap = Object.fromEntries((data?.staff || []).map((m: any) => [m.id, m]));

  const save = async () => {
    if (!form.title) return;
    setSaving(true);
    try {
      const { shift } = await api<any>("/api/team/shifts", { method: "POST", body: JSON.stringify({ ...form, requiredStaff: Number(form.requiredStaff) }) });
      setData((p: any) => ({ ...p, shifts: [...p.shifts, shift] }));
      setShowAdd(false);
      setForm({ title: "", date: new Date().toISOString().split("T")[0], startTime: "09:00", endTime: "18:00", department: "Менеджмент", requiredStaff: "1", notes: "", assignedStaff: [] });
      toast({ title: "✅ Смена создана" });
    } catch { toast({ variant: "destructive", title: "Ошибка" }); }
    finally { setSaving(false); }
  };

  const setStatus = async (id: string, status: string) => {
    await api(`/api/team/shifts/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    setData((p: any) => ({ ...p, shifts: p.shifts.map((s: any) => s.id === id ? { ...s, status } : s) }));
  };

  const clockIn = async (shiftId: string, staffId: string) => {
    await api(`/api/team/shifts/${shiftId}/clockin`, { method: "POST", body: JSON.stringify({ staffId }) });
    setData((p: any) => ({ ...p, shifts: p.shifts.map((s: any) => s.id === shiftId ? { ...s, status: "in-progress", clockIns: [...s.clockIns, { staffId, clockedIn: Date.now(), clockedOut: null }] } : s) }));
    toast({ title: "⏱️ Отмечен вход" });
  };

  const clockOut = async (shiftId: string, staffId: string) => {
    await api(`/api/team/shifts/${shiftId}/clockout`, { method: "POST", body: JSON.stringify({ staffId }) });
    setData((p: any) => ({ ...p, shifts: p.shifts.map((s: any) => s.id !== shiftId ? s : { ...s, clockIns: s.clockIns.map((c: any) => c.staffId === staffId && !c.clockedOut ? { ...c, clockedOut: Date.now() } : c) }) }));
    toast({ title: "✅ Отмечен выход" });
  };

  const remove = async (id: string) => {
    await api(`/api/team/shifts/${id}`, { method: "DELETE" });
    setData((p: any) => ({ ...p, shifts: p.shifts.filter((s: any) => s.id !== id) }));
  };

  const toggleAssign = (staffId: string) => setForm(p => ({ ...p, assignedStaff: p.assignedStaff.includes(staffId) ? p.assignedStaff.filter(id => id !== staffId) : [...p.assignedStaff, staffId] }));

  const filtered = (data?.shifts || []).filter((s: any) => filterStatus === "all" || s.status === filterStatus);
  const todayStr = new Date().toISOString().split("T")[0];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><p className="font-semibold">Shift System</p><p className="text-xs text-muted-foreground">{(data?.shifts || []).filter((s: any) => s.status === "in-progress").length} смен сейчас</p></div>
        <Button size="sm" className="rounded-xl gap-1.5" onClick={() => setShowAdd(p => !p)}><Plus className="w-3.5 h-3.5" /> Новая смена</Button>
      </div>

      <AnimatePresence>
        {showAdd && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <Card className="rounded-2xl border-black/20 bg-secondary/20">
              <CardContent className="pt-4 space-y-3">
                <p className="text-sm font-semibold">Создать смену</p>
                <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Название смены *" className="rounded-xl" />
                <div className="grid grid-cols-3 gap-2">
                  <Input value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} type="date" className="rounded-xl" />
                  <Input value={form.startTime} onChange={e => setForm(p => ({ ...p, startTime: e.target.value }))} type="time" className="rounded-xl" />
                  <Input value={form.endTime} onChange={e => setForm(p => ({ ...p, endTime: e.target.value }))} type="time" className="rounded-xl" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Select value={form.department} onValueChange={v => setForm(p => ({ ...p, department: v }))}><SelectTrigger className="rounded-xl h-9"><SelectValue /></SelectTrigger><SelectContent>{(data?.departments || []).map((d: string) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent></Select>
                  <Input value={form.requiredStaff} onChange={e => setForm(p => ({ ...p, requiredStaff: e.target.value }))} type="number" min="1" placeholder="Нужно сотрудников" className="rounded-xl" />
                </div>
                {(data?.staff || []).length > 0 && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Назначить сотрудников</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {(data?.staff || []).filter((m: any) => m.status === "active").map((m: any) => (
                        <button key={m.id} onClick={() => toggleAssign(m.id)} className={`flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-1.5 border transition-colors ${form.assignedStaff.includes(m.id) ? "bg-black text-white border-black" : "border-border hover:border-black/30"}`}>
                          <Avatar url={m.avatarUrl} name={m.displayName} size={5} />{m.displayName}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Заметки..." className="rounded-xl resize-none text-sm" rows={2} />
                <div className="flex gap-2">
                  <Button className="flex-1 rounded-xl gap-1.5" onClick={save} disabled={saving || !form.title}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Создать</Button>
                  <Button variant="ghost" className="rounded-xl" onClick={() => setShowAdd(false)}><X className="w-4 h-4" /></Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex gap-1.5 flex-wrap">
        {["all", "scheduled", "in-progress", "completed", "cancelled"].map(f => {
          const cfg = f === "all" ? { label: "Все", color: "" } : SHIFT_STATUS[f as keyof typeof SHIFT_STATUS];
          return (
            <button key={f} onClick={() => setFilterStatus(f)} className={`text-xs rounded-lg px-3 py-1.5 border font-medium transition-colors ${filterStatus === f ? "bg-black text-white border-black" : "border-border hover:border-black/30"}`}>
              {cfg.label}
            </button>
          );
        })}
      </div>

      {loading ? <Skeleton className="h-40 rounded-2xl" /> : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground flex flex-col items-center gap-2"><Clock className="w-10 h-10 opacity-20" /><p className="text-sm">Нет смен</p></div>
      ) : (
        <div className="space-y-3">
          {filtered.slice().sort((a: any, b: any) => a.date > b.date ? 1 : -1).map((s: any) => {
            const statusCfg = SHIFT_STATUS[s.status as keyof typeof SHIFT_STATUS];
            const isToday = s.date === todayStr;
            return (
              <Card key={s.id} className={`rounded-2xl border-border/50 ${isToday && s.status !== "completed" ? "border-blue-400/40" : ""}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-sm">{s.title}</p>
                        {isToday && s.status !== "completed" && <Badge className="text-[10px] bg-blue-500/15 text-blue-700 border-blue-400/30">Сегодня</Badge>}
                        <Badge className={`text-[10px] flex items-center gap-1 ${statusCfg.color}`}>{statusCfg.icon}{statusCfg.label}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{s.date} • {s.startTime}–{s.endTime} • {s.department}</p>
                    </div>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-lg text-red-400 hover:bg-red-500/10" onClick={() => remove(s.id)}><Trash2 className="w-3 h-3" /></Button>
                  </div>

                  {/* Assigned staff + clock in/out */}
                  {s.assignedStaff.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Сотрудники ({s.assignedStaff.length}/{s.requiredStaff}):</p>
                      <div className="flex flex-wrap gap-2">
                        {s.assignedStaff.map((sid: string) => {
                          const m = staffMap[sid];
                          if (!m) return null;
                          const clockIn = s.clockIns.find((c: any) => c.staffId === sid);
                          const isIn = clockIn && !clockIn.clockedOut;
                          const duration = clockIn?.clockedOut ? clockIn.clockedOut - clockIn.clockedIn : clockIn ? Date.now() - clockIn.clockedIn : 0;
                          return (
                            <div key={sid} className="flex items-center gap-2 rounded-xl border border-border/50 px-2.5 py-1.5 text-xs">
                              <Avatar url={m.avatarUrl} name={m.displayName} size={6} />
                              <div>
                                <p className="font-medium">{m.displayName}</p>
                                {clockIn && <p className={`text-[10px] ${isIn ? "text-green-600" : "text-muted-foreground"}`}>{isIn ? `⏱ ${fmtDuration(Date.now() - clockIn.clockedIn)}` : `✓ ${fmtDuration(duration)}`}</p>}
                              </div>
                              {(s.status === "scheduled" || s.status === "in-progress") && !isIn && !clockIn?.clockedOut && (
                                <Button size="sm" variant="outline" className="rounded-lg h-6 text-[10px] gap-0.5 px-2" onClick={() => clockIn(s.id, sid)}><Timer className="w-2.5 h-2.5" /> Вход</Button>
                              )}
                              {isIn && (
                                <Button size="sm" variant="outline" className="rounded-lg h-6 text-[10px] gap-0.5 px-2 text-green-600 border-green-500/30" onClick={() => clockOut(s.id, sid)}><CheckCircle2 className="w-2.5 h-2.5" /> Выход</Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {s.notes && <p className="text-xs text-muted-foreground italic">"{s.notes}"</p>}

                  {s.status === "scheduled" && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="rounded-lg h-7 text-xs gap-1 text-green-600 border-green-500/30" onClick={() => setStatus(s.id, "in-progress")}><Timer className="w-3 h-3" /> Начать</Button>
                      <Button size="sm" variant="outline" className="rounded-lg h-7 text-xs gap-1 text-red-500 border-red-500/30" onClick={() => setStatus(s.id, "cancelled")}><X className="w-3 h-3" /> Отменить</Button>
                    </div>
                  )}
                  {s.status === "in-progress" && (
                    <Button size="sm" variant="outline" className="rounded-lg h-7 text-xs gap-1" onClick={() => setStatus(s.id, "completed")}><CheckCircle2 className="w-3 h-3" /> Завершить смену</Button>
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

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Team() {
  return (
    <div className="p-6 lg:p-10 w-full max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3"><Users className="w-7 h-7" /> Team & Collaboration</h1>
        <p className="text-muted-foreground mt-1 text-sm">Управление персоналом, роли, продуктивность и смены</p>
      </div>

      <Tabs defaultValue="staff" className="w-full">
        <TabsList className="rounded-xl bg-secondary/50 border border-border p-1 h-auto gap-1 flex-wrap">
          <TabsTrigger value="staff" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-3 py-2 flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Сотрудники</TabsTrigger>
          <TabsTrigger value="roles" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-3 py-2 flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" /> Роли</TabsTrigger>
          <TabsTrigger value="performance" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-3 py-2 flex items-center gap-1.5"><BarChart2 className="w-3.5 h-3.5" /> Продуктивность</TabsTrigger>
          <TabsTrigger value="chat" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-3 py-2 flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5" /> Чат</TabsTrigger>
          <TabsTrigger value="shifts" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-3 py-2 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Смены</TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="staff" className="mt-0"><StaffTab /></TabsContent>
          <TabsContent value="roles" className="mt-0"><RolesTab /></TabsContent>
          <TabsContent value="performance" className="mt-0"><PerformanceTab /></TabsContent>
          <TabsContent value="chat" className="mt-0"><ChatTab /></TabsContent>
          <TabsContent value="shifts" className="mt-0"><ShiftsTab /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
