import { useState, useEffect, useCallback, useRef } from "react";
import { getAuthCredentials } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Receipt, Calculator, FileText, ArrowLeftRight, Target, Plus, Trash2,
  Pencil, Check, X, Loader2, RefreshCw, Download, Copy, ChevronRight,
  TrendingUp, DollarSign, Wallet, Calendar, AlertCircle, CheckCircle2,
  Clock, ArrowUpRight, Info, Flag
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

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

function fmt(n: number, decimals = 0) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toFixed(decimals);
}

function fmtMoney(n: number, sym = "$") { return `${sym}${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}` }

interface Rates { usdRub: number; usdEur: number; robuxUsd: number; marketplaceFee: number; devexMin: number; fetchedAt: number }
interface Invoice { id: string; number: string; clientName: string; clientEmail: string; currency: string; items: { description: string; qty: number; price: number }[]; notes: string; status: string; createdAt: number; dueDate: number | null }
interface Goal { id: string; title: string; category: string; targetAmount: number; currentAmount: number; currency: string; deadline: number | null; createdAt: number }

// ── Shared rates hook ─────────────────────────────────────────────────────────
function useRates() {
  const [rates, setRates] = useState<Rates | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    try { const r = await apiFetch<Rates>("/api/finance/rates"); setRates(r); }
    catch {}
    finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return { rates, loading, refresh };
}

// ── Invoice Generator ─────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  draft: "border-gray-400/30 text-gray-500",
  sent: "border-blue-500/30 text-blue-600",
  paid: "border-green-500/30 text-green-600",
  overdue: "border-red-500/30 text-red-600",
};
const STATUS_LABELS: Record<string, string> = { draft: "📝 Черновик", sent: "📤 Отправлен", paid: "✅ Оплачен", overdue: "⚠️ Просрочен" };
const CURRENCIES = [{ value: "robux", label: "Robux (R$)" }, { value: "usd", label: "US Dollar ($)" }, { value: "rub", label: "Рубли (₽)" }];
const CUR_SYM: Record<string, string> = { robux: "R$", usd: "$", rub: "₽" };

function InvoiceTab({ rates }: { rates: Rates | null }) {
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "create" | "detail">("list");
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [form, setForm] = useState({ clientName: "", clientEmail: "", currency: "robux", notes: "", dueDate: "" });
  const [items, setItems] = useState([{ description: "", qty: 1, price: 0 }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<{ invoices: Invoice[] }>("/api/finance/invoices").then(({ invoices: v }) => setInvoices(v)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const total = (inv: Invoice) => inv.items.reduce((s, it) => s + it.qty * it.price, 0);
  const formTotal = items.reduce((s, it) => s + it.qty * (it.price || 0), 0);

  const createInvoice = async () => {
    if (!form.clientName || !items[0].description) return;
    setSaving(true);
    try {
      const { invoice } = await apiFetch<{ invoice: Invoice }>("/api/finance/invoices", {
        method: "POST",
        body: JSON.stringify({ ...form, items, dueDate: form.dueDate ? new Date(form.dueDate).getTime() : null }),
      });
      setInvoices(p => [invoice, ...p]);
      setView("list"); setForm({ clientName: "", clientEmail: "", currency: "robux", notes: "", dueDate: "" }); setItems([{ description: "", qty: 1, price: 0 }]);
      toast({ title: `✅ Счёт ${invoice.number} создан` });
    } catch (e) { toast({ variant: "destructive", title: "Ошибка", description: e instanceof Error ? e.message : "" }); }
    finally { setSaving(false); }
  };

  const updateStatus = async (id: string, status: string) => {
    await apiFetch(`/api/finance/invoices/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    setInvoices(p => p.map(inv => inv.id === id ? { ...inv, status } : inv));
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, status } : prev);
  };

  const deleteInvoice = async (id: string) => {
    await apiFetch(`/api/finance/invoices/${id}`, { method: "DELETE" });
    setInvoices(p => p.filter(inv => inv.id !== id));
    if (selected?.id === id) setView("list");
    toast({ title: "✅ Счёт удалён" });
  };

  const copyToClipboard = (inv: Invoice) => {
    const sym = CUR_SYM[inv.currency] || "";
    const lines = [
      `СЧЁТ ${inv.number}`, `Клиент: ${inv.clientName}`, `Дата: ${new Date(inv.createdAt).toLocaleDateString("ru")}`,
      inv.dueDate ? `Оплатить до: ${new Date(inv.dueDate).toLocaleDateString("ru")}` : "",
      "", "Услуги:", ...inv.items.map(it => `  • ${it.description} — ${it.qty} × ${sym}${it.price} = ${sym}${it.qty * it.price}`),
      "", `ИТОГО: ${sym}${total(inv)}`, inv.notes ? `\nПримечание: ${inv.notes}` : "",
    ].filter(Boolean).join("\n");
    navigator.clipboard.writeText(lines);
    toast({ title: "✅ Скопировано в буфер обмена" });
  };

  if (view === "create") return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="rounded-xl gap-1.5" onClick={() => setView("list")}><X className="w-4 h-4" /> Отмена</Button>
        <p className="font-semibold">Новый счёт</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Клиент *</Label><Input value={form.clientName} onChange={e => setForm(p => ({ ...p, clientName: e.target.value }))} placeholder="Имя клиента..." className="rounded-xl" /></div>
        <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Email клиента</Label><Input value={form.clientEmail} onChange={e => setForm(p => ({ ...p, clientEmail: e.target.value }))} placeholder="email@example.com" className="rounded-xl" /></div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Валюта</Label>
          <Select value={form.currency} onValueChange={v => setForm(p => ({ ...p, currency: v }))}>
            <SelectTrigger className="rounded-xl h-9"><SelectValue /></SelectTrigger>
            <SelectContent>{CURRENCIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Срок оплаты</Label><Input type="date" value={form.dueDate} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))} className="rounded-xl" /></div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between"><Label className="text-xs text-muted-foreground">Позиции *</Label><Button size="sm" variant="outline" className="rounded-xl h-7 gap-1 text-xs" onClick={() => setItems(p => [...p, { description: "", qty: 1, price: 0 }])}><Plus className="w-3 h-3" /> Добавить</Button></div>
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <Input value={item.description} onChange={e => setItems(p => p.map((it, i) => i === idx ? { ...it, description: e.target.value } : it))} placeholder="Описание услуги..." className="rounded-xl flex-1 text-sm" />
            <Input type="number" value={item.qty} min={1} onChange={e => setItems(p => p.map((it, i) => i === idx ? { ...it, qty: parseInt(e.target.value) || 1 } : it))} className="rounded-xl w-16 text-sm" />
            <div className="flex items-center gap-1 w-28">
              <span className="text-xs text-muted-foreground shrink-0">{CUR_SYM[form.currency]}</span>
              <Input type="number" value={item.price} min={0} onChange={e => setItems(p => p.map((it, i) => i === idx ? { ...it, price: parseFloat(e.target.value) || 0 } : it))} className="rounded-xl text-sm" />
            </div>
            {items.length > 1 && <Button size="sm" variant="ghost" className="h-9 w-9 p-0 rounded-xl text-red-500 hover:bg-red-500/10 shrink-0" onClick={() => setItems(p => p.filter((_, i) => i !== idx))}><Trash2 className="w-3.5 h-3.5" /></Button>}
          </div>
        ))}
        <div className="flex justify-end"><p className="text-sm font-bold">Итого: {CUR_SYM[form.currency]}{formTotal.toFixed(2)}</p></div>
      </div>

      <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Примечания</Label><Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Условия оплаты, реквизиты..." className="rounded-xl resize-none" rows={3} /></div>

      <Button className="w-full rounded-xl gap-2" onClick={createInvoice} disabled={saving || !form.clientName || !items[0].description}>
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />} Создать счёт
      </Button>
    </div>
  );

  if (view === "detail" && selected) return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="rounded-xl gap-1.5" onClick={() => setView("list")}><X className="w-4 h-4" /> Назад</Button>
        <p className="font-bold flex-1">{selected.number}</p>
        <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[selected.status]}`}>{STATUS_LABELS[selected.status]}</Badge>
      </div>
      <Card className="rounded-2xl border-border/50 print:shadow-none">
        <CardContent className="pt-5 space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-2xl font-bold">СЧЁТ {selected.number}</p>
              <p className="text-muted-foreground text-sm mt-0.5">Дата: {new Date(selected.createdAt).toLocaleDateString("ru")}</p>
              {selected.dueDate && <p className="text-muted-foreground text-sm">До: {new Date(selected.dueDate).toLocaleDateString("ru")}</p>}
            </div>
            <div className="text-right">
              <p className="font-bold">{selected.clientName}</p>
              {selected.clientEmail && <p className="text-sm text-muted-foreground">{selected.clientEmail}</p>}
            </div>
          </div>
          <div className="border-t border-border/50 pt-3 space-y-2">
            <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-muted-foreground pb-1 border-b border-border/30">
              <span className="col-span-6">Описание</span><span className="col-span-2 text-center">Кол-во</span><span className="col-span-2 text-right">Цена</span><span className="col-span-2 text-right">Сумма</span>
            </div>
            {selected.items.map((it, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 text-sm">
                <span className="col-span-6">{it.description}</span><span className="col-span-2 text-center">{it.qty}</span>
                <span className="col-span-2 text-right">{CUR_SYM[selected.currency]}{it.price}</span>
                <span className="col-span-2 text-right font-medium">{CUR_SYM[selected.currency]}{(it.qty * it.price).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-border/50 pt-2 flex justify-end">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">ИТОГО</p>
              <p className="text-2xl font-bold">{CUR_SYM[selected.currency]}{total(selected).toFixed(2)}</p>
              {rates && selected.currency === "robux" && <p className="text-xs text-muted-foreground">≈ ${(total(selected) * rates.robuxUsd).toFixed(2)} / ≈ ₽{Math.round(total(selected) * rates.robuxUsd * rates.usdRub)}</p>}
            </div>
          </div>
          {selected.notes && <div className="border-t border-border/50 pt-2"><p className="text-xs text-muted-foreground">Примечание: {selected.notes}</p></div>}
        </CardContent>
      </Card>
      <div className="flex gap-2 flex-wrap">
        <Select value={selected.status} onValueChange={v => updateStatus(selected.id, v)}>
          <SelectTrigger className="rounded-xl h-9 w-44"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
        </Select>
        <Button variant="outline" className="rounded-xl gap-1.5" onClick={() => copyToClipboard(selected)}><Copy className="w-4 h-4" /> Копировать</Button>
        <Button variant="outline" className="rounded-xl gap-1.5 text-red-500 hover:text-red-600 hover:border-red-500/30 ml-auto" onClick={() => deleteInvoice(selected.id)}><Trash2 className="w-4 h-4" /> Удалить</Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold">Счета</p>
          <p className="text-xs text-muted-foreground">{invoices.length} счетов</p>
        </div>
        <Button size="sm" className="rounded-xl gap-1.5" onClick={() => setView("create")}><Plus className="w-3.5 h-3.5" /> Создать счёт</Button>
      </div>
      {loading ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />) : invoices.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground flex flex-col items-center gap-2"><Receipt className="w-12 h-12 opacity-20" /><p className="text-sm">Счетов нет</p><Button size="sm" className="rounded-xl gap-1.5 mt-2" onClick={() => setView("create")}><Plus className="w-3.5 h-3.5" /> Создать первый счёт</Button></div>
      ) : (
        <div className="space-y-2">
          {invoices.map(inv => (
            <Card key={inv.id} className="rounded-2xl border-border/50 hover:border-black/20 cursor-pointer transition-colors" onClick={() => { setSelected(inv); setView("detail"); }}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap"><p className="font-bold text-sm">{inv.number}</p><Badge variant="outline" className={`text-[9px] ${STATUS_COLORS[inv.status]}`}>{STATUS_LABELS[inv.status]}</Badge></div>
                  <p className="text-xs text-muted-foreground mt-0.5">{inv.clientName} • {new Date(inv.createdAt).toLocaleDateString("ru")}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-sm">{CUR_SYM[inv.currency]}{total(inv).toFixed(0)}</p>
                  <p className="text-[10px] text-muted-foreground">{CURRENCIES.find(c => c.value === inv.currency)?.label}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Commission Calculator ─────────────────────────────────────────────────────
function CommissionTab({ rates, ratesLoading }: { rates: Rates | null; ratesLoading: boolean }) {
  const [robux, setRobux] = useState("1000");
  const [taxRate, setTaxRate] = useState("13");
  const [mode, setMode] = useState<"earn" | "price">("earn");
  const [targetRobux, setTargetRobux] = useState("700");

  const R = parseFloat(robux) || 0;
  const tax = parseFloat(taxRate) / 100;
  const usdGross = R * (rates?.robuxUsd || 0.0035);
  const usdNet = usdGross * (1 - tax);
  const rubGross = usdGross * (rates?.usdRub || 90);
  const rubNet = usdNet * (rates?.usdRub || 90);

  // Marketplace: if you sell item for R Robux, you get 70%
  const sellerReceives = R * 0.70;
  const platformFee = R * 0.30;

  // Reverse: to earn targetRobux, price item at
  const T = parseFloat(targetRobux) || 0;
  const neededPrice = Math.ceil(T / 0.70);

  const PRESETS = [100, 1000, 10000, 30000, 100000, 1000000];

  if (ratesLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex gap-2 p-1 bg-secondary/50 rounded-xl border border-border w-fit">
        <button onClick={() => setMode("earn")} className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors ${mode === "earn" ? "bg-black text-white" : "text-muted-foreground"}`}>Сколько получу</button>
        <button onClick={() => setMode("price")} className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors ${mode === "price" ? "bg-black text-white" : "text-muted-foreground"}`}>Как выставить цену</button>
      </div>

      {mode === "earn" ? (
        <div className="space-y-4">
          <Card className="rounded-2xl border-border/50">
            <CardContent className="pt-4 space-y-3">
              <Label className="text-xs text-muted-foreground">Сумма Robux для DevEx</Label>
              <Input type="number" value={robux} onChange={e => setRobux(e.target.value)} className="rounded-xl text-lg font-bold" placeholder="Введите Robux..." />
              <div className="flex gap-1.5 flex-wrap">
                {PRESETS.map(p => <button key={p} onClick={() => setRobux(String(p))} className="text-xs rounded-lg px-2.5 py-1 border border-border text-muted-foreground hover:border-black/40 transition-colors">{fmt(p)} R$</button>)}
              </div>
              <div className="flex items-center gap-3">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Ставка налога:</Label>
                <Input type="number" value={taxRate} onChange={e => setTaxRate(e.target.value)} className="rounded-xl h-8 w-20 text-sm" min={0} max={50} />
                <span className="text-sm text-muted-foreground">%</span>
                <div className="flex gap-1 ml-auto">
                  {[0, 6, 13, 20].map(t => <button key={t} onClick={() => setTaxRate(String(t))} className={`text-xs rounded-lg px-2 py-1 border transition-colors ${taxRate === String(t) ? "bg-black text-white border-black" : "border-border text-muted-foreground"}`}>{t}%</button>)}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Курс DevEx", value: `R$${fmt(1000)} = $${(1000 * (rates?.robuxUsd || 0.0035)).toFixed(2)}`, sub: "Официальный курс Roblox", color: "" },
              { label: "Брутто (USD)", value: fmtMoney(usdGross), sub: `${fmt(rubGross, 0)} ₽`, color: "text-blue-600" },
              { label: "Налог", value: fmtMoney(usdGross * tax), sub: `Ставка ${taxRate}%`, color: "text-red-500" },
              { label: "Нетто (USD)", value: fmtMoney(usdNet), sub: `${fmt(rubNet, 0)} ₽`, color: "text-green-600" },
            ].map(s => (
              <Card key={s.label} className="rounded-2xl border-border/50">
                <CardContent className="pt-4 pb-3">
                  <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.sub}</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="rounded-2xl border-blue-500/20 bg-blue-500/5">
            <CardContent className="pt-4 space-y-2">
              <p className="text-sm font-semibold text-blue-700">📦 Продажа через маркетплейс (не DevEx)</p>
              <p className="text-xs text-muted-foreground">Если вы продаёте товар за {fmt(R, 0)} R$, Roblox оставляет 30% себе:</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-card border border-border/50 p-2"><p className="text-sm font-bold">{fmt(R, 0)} R$</p><p className="text-[10px] text-muted-foreground">Цена товара</p></div>
                <div className="rounded-xl bg-card border border-border/50 p-2"><p className="text-sm font-bold text-red-500">-{fmt(platformFee, 0)} R$</p><p className="text-[10px] text-muted-foreground">Комиссия 30%</p></div>
                <div className="rounded-xl bg-green-500/10 border border-green-500/20 p-2"><p className="text-sm font-bold text-green-600">+{fmt(sellerReceives, 0)} R$</p><p className="text-[10px] text-muted-foreground">Ваш доход</p></div>
              </div>
            </CardContent>
          </Card>

          {R < (rates?.devexMin || 30000) && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">Минимум для DevEx: <strong>{fmt(rates?.devexMin || 30000, 0)} R$</strong>. Вам ещё нужно <strong>{fmt((rates?.devexMin || 30000) - R, 0)} R$</strong>.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <Card className="rounded-2xl border-border/50">
            <CardContent className="pt-4 space-y-3">
              <Label className="text-xs text-muted-foreground">Сколько хочу заработать (Robux)</Label>
              <Input type="number" value={targetRobux} onChange={e => setTargetRobux(e.target.value)} className="rounded-xl text-lg font-bold" placeholder="Цель в Robux..." />
            </CardContent>
          </Card>
          <div className="grid grid-cols-2 gap-3">
            <Card className="rounded-2xl border-border/50">
              <CardContent className="pt-4 pb-3">
                <p className="text-2xl font-bold">{fmt(neededPrice, 0)} R$</p>
                <p className="text-xs text-muted-foreground mt-0.5">Цена товара</p>
                <p className="text-[10px] text-muted-foreground/60">чтобы получить {fmt(T, 0)} R$</p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-border/50">
              <CardContent className="pt-4 pb-3">
                <p className="text-2xl font-bold">{fmt(T, 0)} R$</p>
                <p className="text-xs text-muted-foreground mt-0.5">Ваш доход (70%)</p>
                <p className="text-[10px] text-muted-foreground/60">≈ ${(T * (rates?.robuxUsd || 0.0035)).toFixed(2)}</p>
              </CardContent>
            </Card>
          </div>
          <Card className="rounded-2xl border-border/50">
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground mb-3">Популярные ценовые точки:</p>
              <div className="space-y-2">
                {[5, 10, 25, 50, 100, 200, 500].map(price => {
                  const earn = Math.floor(price * 0.70);
                  return (
                    <div key={price} className="flex items-center justify-between text-sm py-1 border-b border-border/30 last:border-0">
                      <span className="font-semibold">{price} R$</span>
                      <span className="text-muted-foreground text-xs">Roblox: {price - earn} R$</span>
                      <span className="text-green-600 font-medium">{earn} R$</span>
                      <span className="text-muted-foreground text-xs">${(earn * (rates?.robuxUsd || 0.0035)).toFixed(3)}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ── Robux Converter ───────────────────────────────────────────────────────────
function ConverterTab({ rates, ratesLoading, refreshRates }: { rates: Rates | null; ratesLoading: boolean; refreshRates: () => void }) {
  const [fromCurrency, setFromCurrency] = useState("robux");
  const [amount, setAmount] = useState("1000");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => { if (rates) setLastUpdated(new Date(rates.fetchedAt).toLocaleTimeString()); }, [rates]);

  const A = parseFloat(amount) || 0;
  const R = rates?.robuxUsd || 0.0035;
  const USD_RUB = rates?.usdRub || 90;

  const convert = (): { robux: number; usd: number; rub: number } => {
    if (fromCurrency === "robux") return { robux: A, usd: A * R, rub: A * R * USD_RUB };
    if (fromCurrency === "usd") return { robux: A / R, usd: A, rub: A * USD_RUB };
    return { robux: A / USD_RUB / R, usd: A / USD_RUB, rub: A };
  };
  const result = convert();

  const QUICK_ROBUX = [100, 1000, 5000, 10000, 30000, 100000];
  const CONVS = [
    { label: "Robux", value: "robux", sym: "R$" },
    { label: "USD", value: "usd", sym: "$" },
    { label: "Рубли", value: "rub", sym: "₽" },
  ];

  const copyResult = (val: number, sym: string) => {
    navigator.clipboard.writeText(val.toFixed(2));
    toast({ title: `✅ ${sym}${val.toFixed(2)} скопировано` });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex gap-1 bg-secondary/50 rounded-xl border border-border p-1">
          {CONVS.map(c => <button key={c.value} onClick={() => setFromCurrency(c.value)} className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors ${fromCurrency === c.value ? "bg-black text-white" : "text-muted-foreground"}`}>{c.sym} {c.label}</button>)}
        </div>
        <Button variant="ghost" size="sm" className="rounded-xl gap-1.5 ml-auto" onClick={refreshRates} disabled={ratesLoading}>
          {ratesLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        </Button>
        {lastUpdated && <p className="text-[10px] text-muted-foreground">Курс: {lastUpdated}</p>}
      </div>

      <Card className="rounded-2xl border-black/20 bg-secondary/10">
        <CardContent className="pt-4 space-y-2">
          <Label className="text-xs text-muted-foreground">Сумма в {CONVS.find(c => c.value === fromCurrency)?.label}</Label>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-muted-foreground">{CONVS.find(c => c.value === fromCurrency)?.sym}</span>
            <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="rounded-xl text-2xl font-bold h-12 flex-1" placeholder="0" />
          </div>
          {fromCurrency === "robux" && (
            <div className="flex gap-1.5 flex-wrap pt-1">
              {QUICK_ROBUX.map(v => <button key={v} onClick={() => setAmount(String(v))} className="text-xs rounded-lg px-2 py-1 border border-border text-muted-foreground hover:border-black/40 transition-colors">{fmt(v)} R$</button>)}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-2">
        {[
          { label: "Robux", sym: "R$", val: result.robux, from: "robux" },
          { label: "US Dollar", sym: "$", val: result.usd, from: "usd" },
          { label: "Рубли", sym: "₽", val: result.rub, from: "rub" },
        ].filter(c => c.from !== fromCurrency).map(c => (
          <Card key={c.from} className="rounded-2xl border-border/50 hover:border-black/20 transition-colors">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{c.label}</p>
                <p className="text-2xl font-bold">{c.sym}{c.from === "robux" ? Math.round(c.val).toLocaleString() : c.val.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}</p>
              </div>
              <button onClick={() => copyResult(c.val, c.sym)} className="text-muted-foreground hover:text-foreground transition-colors p-2"><Copy className="w-4 h-4" /></button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="rounded-2xl border-border/30 bg-secondary/20">
        <CardContent className="pt-4">
          <p className="text-xs text-muted-foreground font-semibold mb-2">Справочные курсы</p>
          <div className="grid grid-cols-2 gap-y-1.5 text-xs">
            <span className="text-muted-foreground">DevEx (1000 R$)</span><span className="font-medium">${(1000 * R).toFixed(2)}</span>
            <span className="text-muted-foreground">USD/RUB</span><span className="font-medium">{USD_RUB.toFixed(2)} ₽</span>
            <span className="text-muted-foreground">1 R$ в USD</span><span className="font-medium">${R.toFixed(4)}</span>
            <span className="text-muted-foreground">1 R$ в RUB</span><span className="font-medium">{(R * USD_RUB).toFixed(2)} ₽</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Tax Report ────────────────────────────────────────────────────────────────
function TaxTab({ rates }: { rates: Rates | null }) {
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [taxRate, setTaxRate] = useState("13");
  const { toast } = useToast();

  useEffect(() => {
    apiFetch<any>("/api/finance/tax-report").then(setReport).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  if (!report || report.paidInvoices === 0) return (
    <div className="text-center py-12 text-muted-foreground flex flex-col items-center gap-2">
      <FileText className="w-12 h-12 opacity-20" />
      <p className="text-sm">Нет оплаченных счетов для отчёта</p>
      <p className="text-xs">Отметьте счета как "Оплачен" в разделе Invoice Generator</p>
    </div>
  );

  const taxEst = report.totalUsd * (parseFloat(taxRate) / 100);
  const taxRub = taxEst * (rates?.usdRub || 90);

  const copyReport = () => {
    const text = [
      "НАЛОГОВЫЙ ОТЧЁТ Limited.Ink",
      `Сформирован: ${new Date().toLocaleDateString("ru")}`,
      "", `Оплаченных счетов: ${report.paidInvoices}`,
      `Доход (USD): $${report.totalUsd.toFixed(2)}`,
      `Доход (RUB): ${report.totalRub.toLocaleString()} ₽`,
      `Доход (Robux): ${report.totalRobux.toLocaleString()} R$`,
      "", `Налог ${taxRate}% (USD): $${taxEst.toFixed(2)}`,
      `Налог ${taxRate}% (RUB): ${Math.round(taxRub).toLocaleString()} ₽`,
      "", "По месяцам:",
      ...report.byMonth.map((m: any) => `  ${m.month}: $${m.totalUsd.toFixed(2)} (${m.count} счетов)`),
    ].join("\n");
    navigator.clipboard.writeText(text);
    toast({ title: "✅ Отчёт скопирован" });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="font-semibold">Налоговый отчёт</p>
          <p className="text-xs text-muted-foreground">{report.paidInvoices} оплаченных счетов</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Ставка:</span>
          {["0", "6", "13", "20"].map(t => <button key={t} onClick={() => setTaxRate(t)} className={`text-xs rounded-lg px-2 py-1 border transition-colors ${taxRate === t ? "bg-black text-white border-black" : "border-border text-muted-foreground"}`}>{t}%</button>)}
          <Button size="sm" variant="outline" className="rounded-xl gap-1.5 h-8" onClick={copyReport}><Copy className="w-3.5 h-3.5" /> Копировать</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Доход (USD)", value: `$${report.totalUsd.toFixed(2)}`, color: "text-green-600" },
          { label: "Доход (RUB)", value: `${report.totalRub.toLocaleString()} ₽`, color: "text-blue-600" },
          { label: "Доход (Robux)", value: `R$${report.totalRobux.toLocaleString()}`, color: "" },
          { label: `Налог ${taxRate}%`, value: `$${taxEst.toFixed(2)}`, color: "text-red-500" },
        ].map(s => (
          <Card key={s.label} className="rounded-2xl border-border/50">
            <CardContent className="pt-4 pb-3"><p className={`text-xl font-bold ${s.color}`}>{s.value}</p><p className="text-xs text-muted-foreground mt-0.5">{s.label}</p></CardContent>
          </Card>
        ))}
      </div>

      {taxRate !== "0" && (
        <Card className="rounded-2xl border-amber-500/20 bg-amber-500/5">
          <CardContent className="pt-4">
            <p className="text-xs font-semibold text-amber-700 mb-2">💡 К уплате налога ({taxRate}%)</p>
            <div className="grid grid-cols-2 gap-3">
              <div><p className="text-xl font-bold">${taxEst.toFixed(2)}</p><p className="text-xs text-muted-foreground">в долларах</p></div>
              <div><p className="text-xl font-bold">{Math.round(taxRub).toLocaleString()} ₽</p><p className="text-xs text-muted-foreground">в рублях</p></div>
            </div>
          </CardContent>
        </Card>
      )}

      {report.byMonth.length > 0 && (
        <Card className="rounded-2xl border-border/50">
          <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm font-semibold text-muted-foreground">Доход по месяцам (USD)</CardTitle></CardHeader>
          <CardContent className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={report.byMonth.map((m: any) => ({ ...m, name: m.month.slice(5) + "/" + m.month.slice(0, 4) }))} margin={{ top: 4, right: 16, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={v => `$${v}`} />
                <Tooltip contentStyle={{ borderRadius: "12px", fontSize: "12px" }} formatter={(v: any) => [`$${Number(v).toFixed(2)}`, "Доход"]} />
                <Bar dataKey="totalUsd" fill="#000" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="space-y-1.5">
        {report.byMonth.map((m: any) => (
          <div key={m.month} className="flex items-center justify-between rounded-xl border border-border/50 px-4 py-2.5">
            <p className="text-sm font-medium">{m.month}</p>
            <p className="text-xs text-muted-foreground">{m.count} счетов</p>
            <p className="text-sm font-bold text-green-600">${m.totalUsd.toFixed(2)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Financial Goals ───────────────────────────────────────────────────────────
const GOAL_CATEGORIES = [
  { value: "devex", label: "💸 DevEx вывод" }, { value: "commission", label: "🎨 Комиссия" },
  { value: "group_funds", label: "🏦 Казна группы" }, { value: "personal", label: "👤 Личное" },
  { value: "team", label: "👥 Команда" }, { value: "other", label: "🎯 Другое" },
];

function GoalsTab({ rates }: { rates: Rates | null }) {
  const { toast } = useToast();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: "", category: "devex", targetAmount: "", currency: "robux", deadline: "" });
  const [saving, setSaving] = useState(false);
  const [addingFunds, setAddingFunds] = useState<string | null>(null);
  const [addAmount, setAddAmount] = useState("");

  useEffect(() => {
    apiFetch<{ goals: Goal[] }>("/api/finance/goals").then(({ goals: g }) => setGoals(g)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const createGoal = async () => {
    if (!form.title || !form.targetAmount) return;
    setSaving(true);
    try {
      const { goal } = await apiFetch<{ goal: Goal }>("/api/finance/goals", {
        method: "POST", body: JSON.stringify({ ...form, targetAmount: parseFloat(form.targetAmount), deadline: form.deadline ? new Date(form.deadline).getTime() : null }),
      });
      setGoals(p => [goal, ...p]);
      setShowAdd(false); setForm({ title: "", category: "devex", targetAmount: "", currency: "robux", deadline: "" });
      toast({ title: "✅ Цель создана" });
    } catch (e) { toast({ variant: "destructive", title: "Ошибка", description: e instanceof Error ? e.message : "" }); }
    finally { setSaving(false); }
  };

  const updateProgress = async (goal: Goal, newAmount: number) => {
    const clipped = Math.min(Math.max(0, newAmount), goal.targetAmount);
    await apiFetch(`/api/finance/goals/${goal.id}`, { method: "PATCH", body: JSON.stringify({ currentAmount: clipped }) });
    setGoals(p => p.map(g => g.id === goal.id ? { ...g, currentAmount: clipped } : g));
    setAddingFunds(null); setAddAmount("");
  };

  const deleteGoal = async (id: string) => {
    await apiFetch(`/api/finance/goals/${id}`, { method: "DELETE" });
    setGoals(p => p.filter(g => g.id !== id));
  };

  const getRobuxEquiv = (goal: Goal) => {
    if (goal.currency === "robux") return goal.targetAmount;
    const R = rates?.robuxUsd || 0.0035;
    if (goal.currency === "usd") return goal.targetAmount / R;
    return goal.targetAmount / (rates?.usdRub || 90) / R;
  };

  const daysLeft = (deadline: number | null) => {
    if (!deadline) return null;
    const d = Math.ceil((deadline - Date.now()) / 86400000);
    return d;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><p className="font-semibold">Финансовые цели</p><p className="text-xs text-muted-foreground">{goals.length} целей</p></div>
        <Button size="sm" className="rounded-xl gap-1.5" onClick={() => setShowAdd(p => !p)}><Plus className="w-3.5 h-3.5" /> Новая цель</Button>
      </div>

      <AnimatePresence>
        {showAdd && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <Card className="rounded-2xl border-black/20 bg-secondary/20">
              <CardContent className="pt-4 space-y-3">
                <p className="text-sm font-semibold">Новая финансовая цель</p>
                <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Название цели..." className="rounded-xl" />
                <div className="grid grid-cols-2 gap-2">
                  <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
                    <SelectTrigger className="rounded-xl h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>{GOAL_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={form.currency} onValueChange={v => setForm(p => ({ ...p, currency: v }))}>
                    <SelectTrigger className="rounded-xl h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="number" value={form.targetAmount} onChange={e => setForm(p => ({ ...p, targetAmount: e.target.value }))} placeholder={`Сумма (${CUR_SYM[form.currency]})`} className="rounded-xl" />
                  <Input type="date" value={form.deadline} onChange={e => setForm(p => ({ ...p, deadline: e.target.value }))} className="rounded-xl" />
                </div>
                <div className="flex gap-2">
                  <Button className="flex-1 rounded-xl" onClick={createGoal} disabled={saving || !form.title || !form.targetAmount}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flag className="w-4 h-4" />} Создать
                  </Button>
                  <Button variant="ghost" className="rounded-xl" onClick={() => setShowAdd(false)}><X className="w-4 h-4" /></Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />) : goals.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground flex flex-col items-center gap-2"><Target className="w-12 h-12 opacity-20" /><p className="text-sm">Нет финансовых целей</p><p className="text-xs">Создайте цель для DevEx, комиссии или пополнения казны группы</p></div>
      ) : (
        <div className="space-y-3">
          {goals.map(goal => {
            const pct = Math.min(100, (goal.currentAmount / goal.targetAmount) * 100);
            const days = daysLeft(goal.deadline);
            const cat = GOAL_CATEGORIES.find(c => c.value === goal.category);
            const sym = CUR_SYM[goal.currency] || "";
            const robuxEquiv = getRobuxEquiv(goal);
            const isComplete = pct >= 100;
            return (
              <Card key={goal.id} className={`rounded-2xl border transition-colors ${isComplete ? "border-green-500/30 bg-green-500/5" : "border-border/50"}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="text-xl">{cat?.label.split(" ")[0] || "🎯"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap"><p className="font-bold text-sm">{goal.title}</p>{isComplete && <Badge className="text-[9px] bg-green-500/15 text-green-700 border-green-500/30">✅ Достигнута</Badge>}</div>
                      <p className="text-xs text-muted-foreground">{cat?.label || goal.category}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-sm">{sym}{goal.currentAmount.toLocaleString()}<span className="text-muted-foreground font-normal"> / {sym}{goal.targetAmount.toLocaleString()}</span></p>
                      {days !== null && <p className={`text-[10px] mt-0.5 ${days < 0 ? "text-red-500" : days < 7 ? "text-amber-600" : "text-muted-foreground"}`}>{days < 0 ? `Просрочено ${Math.abs(days)}д` : `${days}д осталось`}</p>}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-muted-foreground"><span>{Math.round(pct)}%</span><span className="text-muted-foreground/60">≈ R${Math.round(robuxEquiv).toLocaleString()}</span></div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <motion.div className={`h-full rounded-full ${isComplete ? "bg-green-500" : "bg-black"}`} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8 }} />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {addingFunds === goal.id ? (
                      <>
                        <Input type="number" value={addAmount} onChange={e => setAddAmount(e.target.value)} placeholder={`Добавить ${sym}...`} className="rounded-xl h-8 flex-1 text-sm" />
                        <Button size="sm" className="rounded-xl h-8 gap-1" onClick={() => updateProgress(goal, goal.currentAmount + parseFloat(addAmount || "0"))}><Check className="w-3 h-3" /></Button>
                        <Button size="sm" variant="ghost" className="rounded-xl h-8 w-8 p-0" onClick={() => setAddingFunds(null)}><X className="w-3.5 h-3.5" /></Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="outline" className="rounded-xl h-8 gap-1.5 text-xs" onClick={() => { setAddingFunds(goal.id); setAddAmount(""); }}>
                          <TrendingUp className="w-3 h-3" /> Обновить прогресс
                        </Button>
                        <Button size="sm" variant="ghost" className="rounded-xl h-8 w-8 p-0 ml-auto text-red-500 hover:bg-red-500/10" onClick={() => deleteGoal(goal.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </>
                    )}
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

// ── Main Finance Page ─────────────────────────────────────────────────────────
export default function Finance() {
  const { rates, loading: ratesLoading, refresh: refreshRates } = useRates();
  const [activeTab, setActiveTab] = useState("invoice");

  return (
    <div className="p-6 lg:p-10 w-full max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3"><Receipt className="w-7 h-7" /> Invoice & Finance</h1>
        <p className="text-muted-foreground mt-1 text-sm">Счета, калькулятор DevEx, налоги и финансовые цели</p>
      </div>

      {rates && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>💱 USD/RUB: <strong>{rates.usdRub.toFixed(1)}</strong></span>
          <span>🎮 DevEx: <strong>R$1000 = ${(1000 * rates.robuxUsd).toFixed(2)}</strong></span>
          <span className="ml-auto opacity-60">Курс обновлён: {new Date(rates.fetchedAt).toLocaleTimeString()}</span>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="rounded-xl bg-secondary/50 border border-border p-1 h-auto gap-1 flex-wrap">
          <TabsTrigger value="invoice" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-4 py-2 flex items-center gap-1.5"><Receipt className="w-3.5 h-3.5" /> Счета</TabsTrigger>
          <TabsTrigger value="commission" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-4 py-2 flex items-center gap-1.5"><Calculator className="w-3.5 h-3.5" /> Комиссия DevEx</TabsTrigger>
          <TabsTrigger value="converter" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-4 py-2 flex items-center gap-1.5"><ArrowLeftRight className="w-3.5 h-3.5" /> Конвертер</TabsTrigger>
          <TabsTrigger value="tax" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-4 py-2 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Налоги</TabsTrigger>
          <TabsTrigger value="goals" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-4 py-2 flex items-center gap-1.5"><Target className="w-3.5 h-3.5" /> Цели</TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="invoice" className="mt-0"><InvoiceTab rates={rates} /></TabsContent>
          <TabsContent value="commission" className="mt-0"><CommissionTab rates={rates} ratesLoading={ratesLoading} /></TabsContent>
          <TabsContent value="converter" className="mt-0"><ConverterTab rates={rates} ratesLoading={ratesLoading} refreshRates={refreshRates} /></TabsContent>
          <TabsContent value="tax" className="mt-0"><TaxTab rates={rates} /></TabsContent>
          <TabsContent value="goals" className="mt-0"><GoalsTab rates={rates} /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
