import { useState, useEffect, useRef, useCallback, DragEvent } from "react";
import { getAuthCredentials } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  FlaskConical, Upload, Shield, ClipboardCheck, Eye,
  Check, X, AlertTriangle, Loader2, Plus, Trash2,
  CheckCircle2, XCircle, AlertCircle, Info, RefreshCw, User
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

// ── Clothing type specs ───────────────────────────────────────────────────────
const CLOTHING_SPECS: Record<string, { label: string; w: number; h: number; icon: string }> = {
  shirt: { label: "Рубашка", w: 585, h: 559, icon: "👕" },
  pants: { label: "Брюки", w: 292, h: 280, icon: "👖" },
  tshirt: { label: "Футболка", w: 128, h: 128, icon: "🩱" },
  custom: { label: "Другое", w: 0, h: 0, icon: "📦" },
};

// ── Shared image picker ───────────────────────────────────────────────────────
function DropZone({ onFile, file, label = "Перетащите PNG или нажмите для выбора" }: { onFile: (f: File) => void; file: File | null; label?: string }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  };

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed rounded-2xl flex flex-col items-center justify-center p-8 cursor-pointer transition-colors ${dragging ? "border-black bg-black/5" : "border-border/50 hover:border-black/30"}`}>
      <input ref={inputRef} type="file" accept="image/png,image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
      {file ? (
        <div className="flex items-center gap-3 text-sm">
          <CheckCircle2 className="w-5 h-5 text-green-500" />
          <span className="font-medium">{file.name}</span>
          <span className="text-muted-foreground">({(file.size / 1024).toFixed(1)} KB)</span>
        </div>
      ) : (
        <>
          <Upload className="w-8 h-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground text-center">{label}</p>
        </>
      )}
    </div>
  );
}

// ── Image analysis helpers ────────────────────────────────────────────────────
async function loadImageData(file: File): Promise<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; data: ImageData; img: HTMLImageElement }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve({ canvas, ctx, data, img });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Не удалось загрузить изображение")); };
    img.src = url;
  });
}

function hasTransparency(data: ImageData): boolean {
  for (let i = 3; i < data.data.length; i += 4) {
    if (data.data[i] < 255) return true;
  }
  return false;
}

function transparentRatio(data: ImageData): number {
  let transparent = 0;
  for (let i = 3; i < data.data.length; i += 4) {
    if (data.data[i] < 10) transparent++;
  }
  return transparent / (data.data.length / 4);
}

function isSkinTone(r: number, g: number, b: number): boolean {
  return r > 95 && g > 40 && b > 20 && r > g && r > b &&
    Math.abs(r - g) > 15 && r - b > 15 && r < 250;
}

function analyzeSkinTone(data: ImageData): number {
  let skinCount = 0; let visibleCount = 0;
  for (let i = 0; i < data.data.length; i += 4) {
    const a = data.data[i + 3];
    if (a < 50) continue;
    visibleCount++;
    if (isSkinTone(data.data[i], data.data[i + 1], data.data[i + 2])) skinCount++;
  }
  return visibleCount ? skinCount / visibleCount : 0;
}

function analyzeContrast(data: ImageData): number {
  let maxBrightness = 0; let minBrightness = 255; let count = 0;
  for (let i = 0; i < data.data.length; i += 16) {
    const a = data.data[i + 3];
    if (a < 50) continue;
    const b = (data.data[i] * 299 + data.data[i + 1] * 587 + data.data[i + 2] * 114) / 1000;
    if (b > maxBrightness) maxBrightness = b;
    if (b < minBrightness) minBrightness = b;
    count++;
  }
  return count > 0 ? (maxBrightness - minBrightness) / 255 : 0;
}

function analyzeColorVariety(data: ImageData): number {
  const colors = new Set<string>();
  for (let i = 0; i < data.data.length; i += 4 * 8) {
    const a = data.data[i + 3];
    if (a < 50) continue;
    const r = Math.floor(data.data[i] / 32) * 32;
    const g = Math.floor(data.data[i + 1] / 32) * 32;
    const b = Math.floor(data.data[i + 2] / 32) * 32;
    colors.add(`${r},${g},${b}`);
  }
  return Math.min(colors.size / 50, 1);
}

// ── Upload Validator Tab ──────────────────────────────────────────────────────
type ValidationResult = { id: string; label: string; status: "pass" | "fail" | "warn" | "info"; detail: string };

function ValidatorTab() {
  const [file, setFile] = useState<File | null>(null);
  const [clothingType, setClothingType] = useState("shirt");
  const [results, setResults] = useState<ValidationResult[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const validate = useCallback(async () => {
    if (!file) return;
    setAnalyzing(true);
    const res: ValidationResult[] = [];
    const spec = CLOTHING_SPECS[clothingType];

    // File type
    const isPng = file.type === "image/png" || file.name.toLowerCase().endsWith(".png");
    res.push({ id: "type", label: "Формат файла (PNG)", status: isPng ? "pass" : "fail", detail: isPng ? "✓ Файл в формате PNG" : `✗ Обнаружен формат ${file.type || "неизвестный"} — Roblox принимает только PNG` });

    // File size
    const maxSize = 2 * 1024 * 1024;
    const sizeOk = file.size <= maxSize;
    res.push({ id: "size", label: "Размер файла (≤ 2 МБ)", status: sizeOk ? "pass" : "fail", detail: sizeOk ? `✓ ${(file.size / 1024).toFixed(1)} KB — в пределах лимита` : `✗ ${(file.size / 1024 / 1024).toFixed(2)} МБ — превышает лимит 2 МБ` });

    try {
      const { img, data } = await loadImageData(file);
      const w = img.naturalWidth; const h = img.naturalHeight;

      // Set preview
      const reader = new FileReader();
      reader.onload = e => setPreviewUrl(e.target?.result as string);
      reader.readAsDataURL(file);

      // Dimensions
      if (clothingType !== "custom" && spec.w > 0) {
        const exactMatch = w === spec.w && h === spec.h;
        const close = Math.abs(w - spec.w) < 20 && Math.abs(h - spec.h) < 20;
        res.push({ id: "dims", label: `Размеры (${spec.w}×${spec.h}px)`, status: exactMatch ? "pass" : close ? "warn" : "fail", detail: exactMatch ? `✓ ${w}×${h}px — точное соответствие шаблону` : close ? `⚠ ${w}×${h}px — близко, но не точно. Рекомендуется ${spec.w}×${spec.h}px` : `✗ ${w}×${h}px — не соответствует шаблону ${spec.label} (${spec.w}×${spec.h}px)` });
      } else {
        res.push({ id: "dims", label: "Размеры изображения", status: "info", detail: `ℹ ${w}×${h}px` });
      }

      // Transparency
      const hasAlpha = hasTransparency(data);
      res.push({ id: "alpha", label: "Прозрачность (alpha-канал)", status: hasAlpha ? "pass" : "warn", detail: hasAlpha ? "✓ Изображение содержит прозрачные пиксели" : "⚠ Прозрачность не обнаружена — убедитесь что фон прозрачный" });

      // Not fully transparent
      const transRatio = transparentRatio(data);
      res.push({ id: "content", label: "Наличие контента", status: transRatio > 0.98 ? "fail" : transRatio > 0.85 ? "warn" : "pass", detail: transRatio > 0.98 ? "✗ Изображение почти полностью прозрачное — нет контента" : transRatio > 0.85 ? `⚠ ${Math.round(transRatio * 100)}% пикселей прозрачны — убедитесь что дизайн нанесён` : `✓ ${Math.round((1 - transRatio) * 100)}% пикселей содержат контент` });

      // Power of 2 dimensions (optional)
      const isPow2 = (n: number) => n > 0 && (n & (n - 1)) === 0;
      if (clothingType === "custom") {
        const pow2 = isPow2(w) && isPow2(h);
        res.push({ id: "pow2", label: "Степень двойки (рекомендация)", status: pow2 ? "pass" : "warn", detail: pow2 ? "✓ Размеры являются степенями двойки — хорошо для производительности" : `⚠ ${w}×${h}px — рекомендуется использовать 128, 256, 512, 1024` });
      }

      // Aspect ratio
      if (clothingType !== "custom") {
        const expectedRatio = spec.w / spec.h;
        const actualRatio = w / h;
        const ratioOk = Math.abs(actualRatio - expectedRatio) < 0.05;
        res.push({ id: "ratio", label: "Соотношение сторон", status: ratioOk ? "pass" : "warn", detail: ratioOk ? `✓ Соотношение сторон корректное (${expectedRatio.toFixed(2)})` : `⚠ Ожидается ${expectedRatio.toFixed(2)}, получено ${actualRatio.toFixed(2)}` });
      }

      // Color check
      const skinRatio = analyzeSkinTone(data);
      res.push({ id: "skin", label: "Проверка телесных тонов", status: skinRatio > 0.6 ? "warn" : "pass", detail: skinRatio > 0.6 ? `⚠ ${Math.round(skinRatio * 100)}% пикселей — телесный тон. Возможен риск модерации` : `✓ ${Math.round(skinRatio * 100)}% телесного тона — в норме` });

    } catch (e) {
      res.push({ id: "load", label: "Загрузка изображения", status: "fail", detail: `✗ Ошибка: ${(e as Error).message}` });
    }

    setResults(res);
    setAnalyzing(false);
  }, [file, clothingType]);

  useEffect(() => { if (file) validate(); }, [file, clothingType]);

  const passCount = results.filter(r => r.status === "pass").length;
  const failCount = results.filter(r => r.status === "fail").length;
  const warnCount = results.filter(r => r.status === "warn").length;

  const STATUS_ICON = { pass: <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />, fail: <XCircle className="w-4 h-4 text-red-500 shrink-0" />, warn: <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />, info: <Info className="w-4 h-4 text-blue-400 shrink-0" /> };
  const STATUS_BG = { pass: "bg-green-500/5 border-green-500/20", fail: "bg-red-500/5 border-red-500/20", warn: "bg-amber-500/5 border-amber-500/20", info: "bg-blue-500/5 border-blue-400/20" };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Тип одежды</Label>
            <Select value={clothingType} onValueChange={setClothingType}>
              <SelectTrigger className="rounded-xl h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(CLOTHING_SPECS).map(([k, v]) => <SelectItem key={k} value={k}>{v.icon} {v.label} {v.w > 0 ? `(${v.w}×${v.h})` : ""}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <DropZone onFile={f => { setFile(f); setResults([]); setPreviewUrl(null); }} file={file} label="Перетащите PNG файл одежды сюда" />
          {file && <Button variant="outline" className="w-full rounded-xl gap-1.5" onClick={validate} disabled={analyzing}>{analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Повторить проверку</Button>}
        </div>

        <div>
          {previewUrl && (
            <div className="rounded-2xl overflow-hidden border border-border/50 bg-[repeating-conic-gradient(#f0f0f0_0%_25%,white_0%_50%)] bg-[length:24px_24px] flex items-center justify-center" style={{ minHeight: 180 }}>
              <img src={previewUrl} alt="preview" className="max-w-full max-h-48 object-contain" />
            </div>
          )}
          {results.length > 0 && (
            <div className="mt-3 flex gap-3">
              <div className="text-center"><p className="text-2xl font-black text-green-500">{passCount}</p><p className="text-[10px] text-muted-foreground">Пройдено</p></div>
              <div className="text-center"><p className="text-2xl font-black text-amber-500">{warnCount}</p><p className="text-[10px] text-muted-foreground">Предупреждений</p></div>
              <div className="text-center"><p className="text-2xl font-black text-red-500">{failCount}</p><p className="text-[10px] text-muted-foreground">Ошибок</p></div>
              <div className="ml-auto flex items-center">
                {failCount === 0 && warnCount === 0 ? <Badge className="bg-green-500/15 text-green-700 border-green-400/30">✅ Готово к загрузке</Badge>
                  : failCount === 0 ? <Badge className="bg-amber-500/15 text-amber-700 border-amber-400/30">⚠ Проверьте предупреждения</Badge>
                  : <Badge className="bg-red-500/15 text-red-700 border-red-400/30">❌ Есть ошибки</Badge>}
              </div>
            </div>
          )}
        </div>
      </div>

      {analyzing && <div className="flex items-center gap-3 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Анализирую изображение...</div>}

      <AnimatePresence>
        {results.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
            {results.map(r => (
              <div key={r.id} className={`flex items-start gap-3 rounded-xl border p-3 ${STATUS_BG[r.status]}`}>
                {STATUS_ICON[r.status]}
                <div><p className="text-xs font-bold">{r.label}</p><p className="text-xs text-muted-foreground mt-0.5">{r.detail}</p></div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {!file && (
        <Card className="rounded-2xl border-border/30 bg-secondary/20">
          <CardContent className="pt-4">
            <p className="text-xs font-bold text-muted-foreground mb-2">📐 Требования Roblox к одежде</p>
            <div className="grid grid-cols-3 gap-3">
              {Object.entries(CLOTHING_SPECS).filter(([k]) => k !== "custom").map(([, v]) => (
                <div key={v.label} className="text-center text-xs"><div className="text-2xl mb-1">{v.icon}</div><p className="font-bold">{v.label}</p><p className="text-muted-foreground">{v.w}×{v.h}px</p><p className="text-muted-foreground">≤ 2 МБ • PNG</p></div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Moderation Risk Scanner Tab ───────────────────────────────────────────────
type RiskFactor = { label: string; score: number; detail: string; weight: number };

function RiskScannerTab() {
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [factors, setFactors] = useState<RiskFactor[]>([]);
  const [totalRisk, setTotalRisk] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const scan = useCallback(async (f: File) => {
    setAnalyzing(true);
    setFactors([]); setTotalRisk(null);
    const reader = new FileReader();
    reader.onload = e => setPreviewUrl(e.target?.result as string);
    reader.readAsDataURL(f);

    try {
      const { img, data } = await loadImageData(f);
      const newFactors: RiskFactor[] = [];

      // Skin tone
      const skinRatio = analyzeSkinTone(data);
      newFactors.push({
        label: "Телесные тона",
        score: Math.min(skinRatio * 2, 1),
        detail: skinRatio > 0.5 ? `${Math.round(skinRatio * 100)}% пикселей — оттенки кожи. Высокий риск` : skinRatio > 0.25 ? `${Math.round(skinRatio * 100)}% телесных тонов — умеренный риск` : `${Math.round(skinRatio * 100)}% — в норме`,
        weight: 0.4,
      });

      // High transparency ratio (might hide content)
      const transRatio = transparentRatio(data);
      const hiddenRisk = transRatio > 0.9 ? 0.2 : 0;
      newFactors.push({ label: "Скрытый контент", score: hiddenRisk, detail: hiddenRisk > 0 ? "Изображение почти пустое — возможно скрытый контент" : "✓ Прозрачность в норме", weight: 0.1 });

      // Contrast (very high contrast can indicate offensive content)
      const contrast = analyzeContrast(data);
      const contrastRisk = contrast > 0.95 ? 0.3 : contrast > 0.85 ? 0.1 : 0;
      newFactors.push({ label: "Экстремальный контраст", score: contrastRisk, detail: contrastRisk > 0.2 ? "Очень высокий контраст — может содержать скрытые элементы" : contrastRisk > 0 ? "Повышенный контраст" : "✓ Контраст в норме", weight: 0.2 });

      // Color variety (very low = solid color block, moderate is ok)
      const variety = analyzeColorVariety(data);
      const varietyRisk = variety < 0.02 ? 0.2 : 0;
      newFactors.push({ label: "Однородность цвета", score: varietyRisk, detail: varietyRisk > 0 ? "Слишком однородные цвета — возможен обход правил" : "✓ Разнообразие цветов в порядке", weight: 0.1 });

      // Dimensions risk
      const w = img.naturalWidth; const h = img.naturalHeight;
      const dimRisk = (w !== 585 || h !== 559) && (w !== 292 || h !== 280) && (w !== 128 || h !== 128) ? 0.1 : 0;
      newFactors.push({ label: "Нестандартные размеры", score: dimRisk, detail: dimRisk > 0 ? `${w}×${h}px не соответствует стандартным шаблонам Roblox` : "✓ Стандартный размер шаблона", weight: 0.1 });

      // Aspect ratio extremes
      const ratio = w / h;
      const ratioRisk = ratio > 5 || ratio < 0.2 ? 0.15 : 0;
      newFactors.push({ label: "Пропорции изображения", score: ratioRisk, detail: ratioRisk > 0 ? `Необычные пропорции (${ratio.toFixed(2)}:1)` : "✓ Пропорции в норме", weight: 0.1 });

      setFactors(newFactors);
      const weighted = newFactors.reduce((acc, f) => acc + f.score * f.weight, 0) / newFactors.reduce((acc, f) => acc + f.weight, 0);
      setTotalRisk(Math.min(Math.round(weighted * 100), 100));
    } catch (e) {
      setFactors([{ label: "Ошибка анализа", score: 0, detail: (e as Error).message, weight: 1 }]);
    }
    setAnalyzing(false);
  }, []);

  const riskColor = totalRisk === null ? "" : totalRisk < 20 ? "text-green-500" : totalRisk < 50 ? "text-amber-500" : "text-red-500";
  const riskLabel = totalRisk === null ? "" : totalRisk < 20 ? "Низкий риск" : totalRisk < 50 ? "Средний риск" : "Высокий риск";
  const riskBg = totalRisk === null ? "" : totalRisk < 20 ? "from-green-500" : totalRisk < 50 ? "from-amber-500" : "from-red-500";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <DropZone onFile={f => { setFile(f); scan(f); }} file={file} label="Загрузите изображение одежды для проверки риска" />
          {file && <Button variant="outline" className="w-full rounded-xl gap-1.5" onClick={() => scan(file)} disabled={analyzing}>{analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Повторить сканирование</Button>}
        </div>

        {(totalRisk !== null || previewUrl) && (
          <div className="space-y-3">
            {previewUrl && <div className="rounded-2xl border border-border/50 overflow-hidden bg-[repeating-conic-gradient(#f0f0f0_0%_25%,white_0%_50%)] bg-[length:24px_24px] flex items-center justify-center" style={{ minHeight: 120 }}><img src={previewUrl} alt="scan" className="max-w-full max-h-32 object-contain" /></div>}
            {totalRisk !== null && (
              <div className="rounded-2xl border border-border/50 p-5 text-center space-y-3">
                <p className={`text-6xl font-black ${riskColor}`}>{totalRisk}%</p>
                <p className={`text-sm font-bold ${riskColor}`}>{riskLabel}</p>
                <div className="w-full h-3 rounded-full bg-secondary overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${totalRisk}%` }} transition={{ duration: 0.8, ease: "easeOut" }} className={`h-full rounded-full bg-gradient-to-r ${riskBg} to-transparent`} />
                </div>
                <p className="text-xs text-muted-foreground">{totalRisk < 20 ? "Изображение вероятно пройдёт модерацию" : totalRisk < 50 ? "Есть факторы риска — проверьте детали" : "Высокий риск отклонения модерацией"}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {analyzing && <div className="flex items-center gap-3 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Анализирую пиксели изображения...</div>}

      {factors.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">Факторы риска</p>
          {factors.map((f, i) => {
            const level = f.score < 0.15 ? "low" : f.score < 0.4 ? "medium" : "high";
            const bar = { low: "bg-green-500", medium: "bg-amber-500", high: "bg-red-500" }[level];
            const text = { low: "text-green-600", medium: "text-amber-600", high: "text-red-600" }[level];
            return (
              <div key={i} className="rounded-xl border border-border/50 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold">{f.label}</p>
                  <span className={`text-xs font-bold ${text}`}>{Math.round(f.score * 100)}%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${Math.round(f.score * 100)}%` }} transition={{ duration: 0.6, delay: i * 0.05 }} className={`h-full rounded-full ${bar}`} />
                </div>
                <p className="text-[11px] text-muted-foreground">{f.detail}</p>
              </div>
            );
          })}
        </div>
      )}

      <Card className="rounded-2xl border-border/30 bg-secondary/20">
        <CardContent className="pt-4 text-xs text-muted-foreground space-y-1">
          <p className="font-bold text-foreground">⚠️ Важно</p>
          <p>Сканер использует эвристический анализ пикселей — это не гарантия решения модерации Roblox. Финальное решение всегда за системой модерации Roblox.</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Quality Checklist Tab ─────────────────────────────────────────────────────
function ChecklistTab() {
  const { toast } = useToast();
  const [checklists, setChecklists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("shirt");
  const [newItem, setNewItem] = useState("");

  useEffect(() => { api("/api/quality/checklists").then(d => setChecklists(d.checklists)).finally(() => setLoading(false)); }, []);

  const create = async () => {
    if (!newName) return;
    setSaving(true);
    try {
      const { checklist } = await api<any>("/api/quality/checklists", { method: "POST", body: JSON.stringify({ name: newName, clothingType: newType }) });
      setChecklists(p => [...p, checklist]);
      setActiveId(checklist.id);
      setShowAdd(false); setNewName("");
      toast({ title: "✅ Чеклист создан" });
    } catch { toast({ variant: "destructive", title: "Ошибка" }); }
    finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    await api(`/api/quality/checklists/${id}`, { method: "DELETE" });
    setChecklists(p => p.filter(c => c.id !== id));
    if (activeId === id) setActiveId(null);
  };

  const toggleItem = async (clId: string, itemId: string) => {
    const cl = checklists.find(c => c.id === clId);
    if (!cl) return;
    const items = cl.items.map((it: any) => it.id === itemId ? { ...it, done: !it.done } : it);
    await api(`/api/quality/checklists/${clId}`, { method: "PATCH", body: JSON.stringify({ items }) });
    setChecklists(p => p.map(c => c.id === clId ? { ...c, items } : c));
  };

  const addItem = async (clId: string) => {
    if (!newItem.trim()) return;
    const cl = checklists.find(c => c.id === clId);
    if (!cl) return;
    const items = [...cl.items, { id: crypto.randomUUID(), text: newItem.trim(), done: false, required: false }];
    await api(`/api/quality/checklists/${clId}`, { method: "PATCH", body: JSON.stringify({ items }) });
    setChecklists(p => p.map(c => c.id === clId ? { ...c, items } : c));
    setNewItem("");
  };

  const removeItem = async (clId: string, itemId: string) => {
    const cl = checklists.find(c => c.id === clId);
    if (!cl) return;
    const items = cl.items.filter((it: any) => it.id !== itemId);
    await api(`/api/quality/checklists/${clId}`, { method: "PATCH", body: JSON.stringify({ items }) });
    setChecklists(p => p.map(c => c.id === clId ? { ...c, items } : c));
  };

  const resetChecklist = async (clId: string) => {
    const cl = checklists.find(c => c.id === clId);
    if (!cl) return;
    const items = cl.items.map((it: any) => ({ ...it, done: false }));
    await api(`/api/quality/checklists/${clId}`, { method: "PATCH", body: JSON.stringify({ items }) });
    setChecklists(p => p.map(c => c.id === clId ? { ...c, items } : c));
    toast({ title: "Чеклист сброшен" });
  };

  const activeCl = checklists.find(c => c.id === activeId);
  const doneCount = activeCl?.items.filter((it: any) => it.done).length || 0;
  const totalCount = activeCl?.items.length || 0;
  const requiredDone = activeCl?.items.filter((it: any) => it.required && it.done).length || 0;
  const requiredTotal = activeCl?.items.filter((it: any) => it.required).length || 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><p className="font-semibold">Quality Checklist</p><p className="text-xs text-muted-foreground">{checklists.length} чеклистов</p></div>
        <Button size="sm" className="rounded-xl gap-1.5" onClick={() => setShowAdd(p => !p)}><Plus className="w-3.5 h-3.5" /> Новый чеклист</Button>
      </div>

      <AnimatePresence>
        {showAdd && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <Card className="rounded-2xl border-black/20 bg-secondary/20">
              <CardContent className="pt-4 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Название чеклиста *" className="rounded-xl" onKeyDown={e => e.key === "Enter" && create()} />
                  <Select value={newType} onValueChange={setNewType}>
                    <SelectTrigger className="rounded-xl h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(CLOTHING_SPECS).map(([k, v]) => <SelectItem key={k} value={k}>{v.icon} {v.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button className="flex-1 rounded-xl gap-1.5" onClick={create} disabled={saving || !newName}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Создать с шаблоном</Button>
                  <Button variant="ghost" className="rounded-xl" onClick={() => setShowAdd(false)}><X className="w-4 h-4" /></Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? <Skeleton className="h-32 rounded-2xl" /> : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* List */}
          <div className="space-y-2">
            {checklists.length === 0 ? <div className="text-center py-8 text-muted-foreground text-sm"><ClipboardCheck className="w-8 h-8 opacity-20 mx-auto mb-2" />Нет чеклистов</div>
              : checklists.map(c => {
                const done = c.items.filter((it: any) => it.done).length;
                const total = c.items.length;
                const spec = CLOTHING_SPECS[c.clothingType];
                const pct = total ? Math.round(done / total * 100) : 0;
                return (
                  <div key={c.id} onClick={() => setActiveId(c.id === activeId ? null : c.id)}
                    className={`rounded-xl border p-3 cursor-pointer transition-colors ${c.id === activeId ? "border-black bg-black/5" : "border-border/50 hover:border-black/20"}`}>
                    <div className="flex items-center gap-2">
                      <span>{spec?.icon}</span>
                      <div className="flex-1 min-w-0"><p className="text-sm font-bold truncate">{c.name}</p><p className="text-[10px] text-muted-foreground">{done}/{total} выполнено</p></div>
                      <button onClick={e => { e.stopPropagation(); remove(c.id); }} className="text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-secondary mt-2 overflow-hidden">
                      <div className="h-full rounded-full bg-black transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
          </div>

          {/* Active checklist */}
          <div className="md:col-span-2">
            {!activeCl ? (
              <div className="text-center py-12 text-muted-foreground flex flex-col items-center gap-2"><ClipboardCheck className="w-8 h-8 opacity-20" /><p className="text-sm">Выберите чеклист слева</p></div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold">{activeCl.name}</p>
                    <p className="text-xs text-muted-foreground">{doneCount}/{totalCount} пунктов • {requiredDone}/{requiredTotal} обязательных</p>
                  </div>
                  <div className="flex gap-2 items-center">
                    {requiredDone === requiredTotal && requiredTotal > 0 && <Badge className="bg-green-500/15 text-green-700 border-green-400/30 text-[10px]">✅ Готово к загрузке</Badge>}
                    <Button size="sm" variant="outline" className="rounded-lg h-7 text-xs" onClick={() => resetChecklist(activeCl.id)}><RefreshCw className="w-3 h-3" /></Button>
                  </div>
                </div>

                <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
                  <motion.div animate={{ width: `${totalCount ? Math.round(doneCount / totalCount * 100) : 0}%` }} className="h-full rounded-full bg-black" />
                </div>

                <div className="space-y-1.5">
                  {activeCl.items.map((it: any) => (
                    <div key={it.id} className={`flex items-center gap-3 rounded-xl p-3 border transition-colors cursor-pointer ${it.done ? "border-green-500/20 bg-green-500/5" : "border-border/50 hover:border-black/20"}`} onClick={() => toggleItem(activeCl.id, it.id)}>
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${it.done ? "bg-black border-black" : "border-border/50"}`}>
                        {it.done && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <p className={`text-sm flex-1 ${it.done ? "line-through text-muted-foreground" : ""}`}>{it.text}</p>
                      {it.required && !it.done && <span className="text-[10px] text-red-500 font-bold shrink-0">Обязательно</span>}
                      <button onClick={e => { e.stopPropagation(); removeItem(activeCl.id, it.id); }} className="text-muted-foreground hover:text-red-500 shrink-0"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <Input value={newItem} onChange={e => setNewItem(e.target.value)} placeholder="Добавить пункт..." className="rounded-xl flex-1" onKeyDown={e => e.key === "Enter" && addItem(activeCl.id)} />
                  <Button className="rounded-xl" onClick={() => addItem(activeCl.id)} disabled={!newItem.trim()}><Plus className="w-4 h-4" /></Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Preview on Avatar Tab ─────────────────────────────────────────────────────
function AvatarPreviewTab() {
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [clothingType, setClothingType] = useState("shirt");
  const [avatarData, setAvatarData] = useState<any>(null);
  const [clothingFile, setClothingFile] = useState<File | null>(null);
  const [clothingUrl, setClothingUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [composited, setComposited] = useState(false);

  const fetchAvatar = async () => {
    if (!username.trim()) return;
    setLoading(true); setAvatarData(null); setComposited(false);
    try {
      const d = await api<any>(`/api/quality/roblox-avatar?username=${encodeURIComponent(username.trim())}`);
      setAvatarData(d);
      toast({ title: `✅ Аватар ${d.displayName} загружен` });
    } catch (e) {
      toast({ variant: "destructive", title: "Ошибка", description: (e as Error).message });
    } finally { setLoading(false); }
  };

  const handleClothingFile = (f: File) => {
    setClothingFile(f);
    const reader = new FileReader();
    reader.onload = e => setClothingUrl(e.target?.result as string);
    reader.readAsDataURL(f);
    setComposited(false);
  };

  // Canvas composite: draw avatar + clothing overlay
  const composite = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !avatarData?.imageUrl || !clothingUrl) return;
    const ctx = canvas.getContext("2d")!;
    const W = 420; const H = 420;
    canvas.width = W; canvas.height = H;

    const avatarImg = new Image();
    avatarImg.crossOrigin = "anonymous";
    const clothingImg = new Image();

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(avatarImg, 0, 0, W, H);

      // overlay clothing based on type
      ctx.globalAlpha = 0.85;
      if (clothingType === "shirt") {
        // torso area on avatar (~120-300 x, ~120-280 y for 420px)
        ctx.drawImage(clothingImg, 55, 130, 310, 180);
      } else if (clothingType === "pants") {
        ctx.drawImage(clothingImg, 80, 270, 260, 150);
      } else if (clothingType === "tshirt") {
        // T-shirt = front graphic on chest center
        const scale = 120;
        ctx.drawImage(clothingImg, W / 2 - scale / 2, 145, scale, scale);
      } else {
        ctx.drawImage(clothingImg, 60, 80, 300, 260);
      }
      ctx.globalAlpha = 1;
      setComposited(true);
    };

    let loaded = 0;
    const onLoad = () => { loaded++; if (loaded === 2) draw(); };
    avatarImg.onload = onLoad;
    clothingImg.onload = onLoad;
    avatarImg.onerror = () => { ctx.drawImage(clothingImg, 0, 0, W, H); setComposited(true); };
    avatarImg.src = avatarData.imageUrl;
    clothingImg.src = clothingUrl;
  }, [avatarData, clothingUrl, clothingType]);

  useEffect(() => { if (avatarData && clothingUrl) composite(); }, [avatarData, clothingUrl, clothingType]);

  const downloadPreview = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "avatar-preview.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Roblox Никнейм</Label>
            <div className="flex gap-2">
              <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="Введите Roblox username..." className="rounded-xl" onKeyDown={e => e.key === "Enter" && fetchAvatar()} />
              <Button className="rounded-xl gap-1.5 shrink-0" onClick={fetchAvatar} disabled={loading || !username.trim()}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <User className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Тип одежды</Label>
            <Select value={clothingType} onValueChange={v => { setClothingType(v); setComposited(false); }}>
              <SelectTrigger className="rounded-xl h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(CLOTHING_SPECS).map(([k, v]) => <SelectItem key={k} value={k}>{v.icon} {v.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <DropZone onFile={handleClothingFile} file={clothingFile} label="Загрузите PNG файл одежды" />

          {avatarData && (
            <Card className="rounded-2xl border-border/50">
              <CardContent className="p-3 flex items-center gap-3">
                <img src={avatarData.imageUrl} alt="avatar" className="w-12 h-12 rounded-xl object-cover" crossOrigin="anonymous" />
                <div><p className="text-sm font-bold">{avatarData.displayName}</p><p className="text-xs text-muted-foreground">ID: {avatarData.userId}</p></div>
                <Badge className="ml-auto text-[10px] bg-green-500/15 text-green-700 border-green-400/30">✅ Загружен</Badge>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl border border-border/50 overflow-hidden bg-gradient-to-b from-blue-50/50 to-gray-50 dark:from-blue-950/20 dark:to-secondary/10 flex items-center justify-center relative" style={{ minHeight: 340 }}>
            {!avatarData && !clothingUrl ? (
              <div className="text-center text-muted-foreground p-8">
                <Eye className="w-12 h-12 opacity-10 mx-auto mb-3" />
                <p className="text-sm">Загрузите аватар и одежду для предпросмотра</p>
              </div>
            ) : (
              <>
                <canvas ref={canvasRef} className={`max-w-full max-h-full ${composited ? "opacity-100" : "opacity-0"} transition-opacity`} />
                {!composited && avatarData && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <img src={avatarData.imageUrl} alt="base" className="max-h-full object-contain opacity-50" crossOrigin="anonymous" />
                    {!clothingUrl && <div className="absolute bottom-4 text-xs text-muted-foreground">Загрузите одежду для наложения</div>}
                  </div>
                )}
              </>
            )}
          </div>
          {composited && (
            <Button variant="outline" className="w-full rounded-xl gap-1.5" onClick={downloadPreview}><Upload className="w-4 h-4" /> Скачать предпросмотр</Button>
          )}
        </div>
      </div>

      <Card className="rounded-2xl border-border/30 bg-secondary/20">
        <CardContent className="pt-4 text-xs text-muted-foreground">
          <p className="font-bold text-foreground mb-1">💡 О предпросмотре</p>
          <p>Наложение одежды приблизительное — точное расположение зависит от шаблона Roblox. Для рубашек отображается область торса, для брюк — нижняя часть тела, для футболок — нагрудный рисунок. Используйте предпросмотр как ориентир, а не точное отображение.</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Testing() {
  return (
    <div className="p-6 lg:p-10 w-full max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3"><FlaskConical className="w-7 h-7" /> Testing & Quality</h1>
        <p className="text-muted-foreground mt-1 text-sm">Валидация, проверка модерации, чеклисты и предпросмотр на аватаре</p>
      </div>

      <Tabs defaultValue="validator" className="w-full">
        <TabsList className="rounded-xl bg-secondary/50 border border-border p-1 h-auto gap-1 flex-wrap">
          <TabsTrigger value="validator" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-3 py-2 flex items-center gap-1.5"><Upload className="w-3.5 h-3.5" /> Валидатор</TabsTrigger>
          <TabsTrigger value="risk" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-3 py-2 flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" /> Риск модерации</TabsTrigger>
          <TabsTrigger value="checklist" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-3 py-2 flex items-center gap-1.5"><ClipboardCheck className="w-3.5 h-3.5" /> Чеклист качества</TabsTrigger>
          <TabsTrigger value="avatar" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-3 py-2 flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" /> Предпросмотр</TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="validator" className="mt-0"><ValidatorTab /></TabsContent>
          <TabsContent value="risk" className="mt-0"><RiskScannerTab /></TabsContent>
          <TabsContent value="checklist" className="mt-0"><ChecklistTab /></TabsContent>
          <TabsContent value="avatar" className="mt-0"><AvatarPreviewTab /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
