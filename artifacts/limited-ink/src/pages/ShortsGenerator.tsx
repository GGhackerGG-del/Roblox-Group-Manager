import { useState, useRef, useCallback, useEffect } from "react";
import { getAuthCredentials } from "@workspace/api-client-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Video, Upload, Sparkles, Download, Loader2, X, Image as ImageIcon,
  Play, Music, Type, Palette, Hash, Copy, Check, Film, Clock, Layers,
  Wand2, ChevronRight, RefreshCw, Trash2, GripVertical, Eye, FileImage,
  Zap, ArrowRight, CheckCircle2, AlertCircle, Pause, Maximize2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function authHeaders(): Record<string, string> {
  const { token, fingerprint } = getAuthCredentials();
  const h: Record<string, string> = {};
  if (token) h["Authorization"] = `Bearer ${token}`;
  if (fingerprint) h["X-Device-Fingerprint"] = fingerprint;
  return h;
}

interface GeneratedScript {
  hook: string;
  subtitles: string[];
  ctaLine: string;
  caption: string;
  hashtags: string[];
}

type Step = "details" | "media" | "script" | "settings" | "generate";

export default function ShortsGenerator() {
  const { t } = useLanguage();
  const { toast } = useToast();

  const STYLE_PRESETS = [
    { id: "clean", label: t("shorts.style.clean"), emoji: "✨", desc: t("shorts.style.clean.desc"), color: "from-blue-500/20 to-cyan-500/20 border-blue-500/30 text-blue-400" },
    { id: "hype", label: t("shorts.style.hype"), emoji: "🔥", desc: t("shorts.style.hype.desc"), color: "from-orange-500/20 to-red-500/20 border-orange-500/30 text-orange-400" },
    { id: "minimal", label: t("shorts.style.minimal"), emoji: "◾", desc: t("shorts.style.minimal.desc"), color: "from-gray-500/20 to-gray-600/20 border-gray-500/30 text-gray-400" },
    { id: "luxury", label: t("shorts.style.luxury"), emoji: "💎", desc: t("shorts.style.luxury.desc"), color: "from-purple-500/20 to-amber-500/20 border-purple-500/30 text-purple-400" },
    { id: "streetwear", label: t("shorts.style.street"), emoji: "🧢", desc: t("shorts.style.street.desc"), color: "from-green-500/20 to-emerald-500/20 border-green-500/30 text-green-400" },
  ];

  const DURATION_OPTIONS = [
    { value: 10, label: "10s", desc: t("shorts.dur.quick") },
    { value: 15, label: "15s", desc: t("shorts.dur.standard") },
    { value: 20, label: "20s", desc: t("shorts.dur.extended") },
    { value: 30, label: "30s", desc: t("shorts.dur.full") },
  ];

  const STEPS: { id: Step; label: string; icon: typeof Type }[] = [
    { id: "details", label: t("shorts.step.details"), icon: Type },
    { id: "media", label: t("shorts.step.media"), icon: ImageIcon },
    { id: "script", label: t("shorts.step.script"), icon: Wand2 },
    { id: "settings", label: t("shorts.step.settings"), icon: Layers },
    { id: "generate", label: t("shorts.step.generate"), icon: Zap },
  ];

  const [step, setStep] = useState<Step>("details");

  const [productName, setProductName] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [price, setPrice] = useState("");
  const [itemUrl, setItemUrl] = useState("");
  const [cta, setCta] = useState("");
  const [platform, setPlatform] = useState<"tiktok" | "youtube">("tiktok");
  const [duration, setDuration] = useState(15);
  const [style, setStyle] = useState("clean");

  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const [watermarkText, setWatermarkText] = useState("");
  const [brandColor, setBrandColor] = useState("#5B88BD");
  const [brandColorSecondary, setBrandColorSecondary] = useState("#FFFFFF");

  const [script, setScript] = useState<GeneratedScript | null>(null);
  const [generatingScript, setGeneratingScript] = useState(false);
  const [useAI, setUseAI] = useState(true);
  const [scriptSource, setScriptSource] = useState<string>("");

  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string>("idle");
  const [jobProgress, setJobProgress] = useState(0);
  const [jobError, setJobError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const musicInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleImageUpload = useCallback((files: FileList | File[]) => {
    const newFiles = Array.from(files).filter(f => f.type.startsWith("image/")).slice(0, 8 - images.length);
    if (newFiles.length === 0) return;
    setImages(prev => [...prev, ...newFiles].slice(0, 8));
    newFiles.forEach(f => {
      const reader = new FileReader();
      reader.onload = e => {
        setImagePreviews(prev => [...prev, e.target?.result as string].slice(0, 8));
      };
      reader.readAsDataURL(f);
    });
  }, [images.length]);

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) handleImageUpload(e.dataTransfer.files);
  }, [handleImageUpload]);

  const handleLogoUpload = (file: File) => {
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = e => setLogoPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const generateScriptHandler = async () => {
    if (!productName.trim()) {
      toast({ variant: "destructive", title: t("shorts.error"), description: t("shorts.enterNameFirst") });
      return;
    }
    setGeneratingScript(true);
    try {
      const r = await fetch(`${BASE}/api/shorts/generate-script`, {
        method: "POST",
        credentials: "include",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ productName, productDescription, price, cta, style, platform, useAI }),
      });
      if (!r.ok) throw new Error(t("shorts.failedGenScript"));
      const data = await r.json();
      setScript(data.script);
      setScriptSource(data.source || "template");
      toast({ title: t("shorts.scriptGenerated"), description: data.source === "ai" ? t("shorts.aiScriptReady") : t("shorts.templateScriptReady") });
    } catch (err: any) {
      toast({ variant: "destructive", title: t("shorts.error"), description: err.message });
    } finally {
      setGeneratingScript(false);
    }
  };

  const startGeneration = async () => {
    if (images.length === 0) {
      toast({ variant: "destructive", title: t("shorts.error"), description: t("shorts.uploadOneImage") });
      return;
    }
    if (!productName.trim()) {
      toast({ variant: "destructive", title: t("shorts.error"), description: t("shorts.enterName") });
      return;
    }

    setJobStatus("processing");
    setJobProgress(0);
    setJobError(null);
    setVideoUrl(null);

    const formData = new FormData();
    images.forEach(img => formData.append("images", img));
    if (musicFile) formData.append("music", musicFile);
    if (logoFile) formData.append("logo", logoFile);
    formData.append("productName", productName);
    formData.append("productDescription", productDescription);
    formData.append("price", price);
    formData.append("itemUrl", itemUrl);
    formData.append("cta", cta);
    formData.append("platform", platform);
    formData.append("duration", String(duration));
    formData.append("style", style);
    formData.append("watermarkText", watermarkText);
    formData.append("brandColor", brandColor);
    formData.append("brandColorSecondary", brandColorSecondary);
    if (script) formData.append("script", JSON.stringify(script));

    try {
      const r = await fetch(`${BASE}/api/shorts/generate`, {
        method: "POST",
        credentials: "include",
        headers: authHeaders(),
        body: formData,
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || t("shorts.genFailed"));
      }
      const data = await r.json();
      setJobId(data.jobId);
      startPolling(data.jobId);
    } catch (err: any) {
      setJobStatus("error");
      setJobError(err.message);
      toast({ variant: "destructive", title: t("shorts.error"), description: err.message });
    }
  };

  const startPolling = (id: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`${BASE}/api/shorts/${id}/status`, {
          credentials: "include",
          headers: authHeaders(),
        });
        if (!r.ok) return;
        const data = await r.json();
        setJobProgress(data.progress);
        setJobStatus(data.status);
        if (data.status === "done") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          toast({ title: t("shorts.videoReadyToast"), description: t("shorts.videoReadyDesc") });
        } else if (data.status === "error") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setJobError(data.error);
          toast({ variant: "destructive", title: t("shorts.genFailedToast"), description: data.error });
        }
      } catch {}
    }, 1500);
  };

  const downloadVideo = async () => {
    if (!jobId) return;
    try {
      const r = await fetch(`${BASE}/api/shorts/${jobId}/download`, {
        credentials: "include",
        headers: authHeaders(),
      });
      if (!r.ok) throw new Error(t("shorts.downloadFailed"));
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      setVideoUrl(url);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${productName || "short"}_${platform}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err: any) {
      toast({ variant: "destructive", title: t("shorts.error"), description: err.message });
    }
  };

  const previewVideo = async () => {
    if (videoUrl) return;
    if (!jobId) return;
    try {
      const r = await fetch(`${BASE}/api/shorts/${jobId}/download`, {
        credentials: "include",
        headers: authHeaders(),
      });
      if (!r.ok) return;
      const blob = await r.blob();
      setVideoUrl(URL.createObjectURL(blob));
    } catch {}
  };

  const copyCaption = () => {
    if (!script) return;
    const text = `${script.caption}\n\n${script.hashtags.join(" ")}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const resetAll = () => {
    setJobId(null);
    setJobStatus("idle");
    setJobProgress(0);
    setJobError(null);
    setVideoUrl(null);
    setStep("details");
  };

  const canGenerate = images.length > 0 && productName.trim().length > 0;
  const currentStepIndex = STEPS.findIndex(s => s.id === step);

  const goNext = () => {
    const idx = currentStepIndex;
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1].id);
  };
  const goPrev = () => {
    const idx = currentStepIndex;
    if (idx > 0) setStep(STEPS[idx - 1].id);
  };

  const getProgressLabel = (p: number) => {
    if (p < 10) return t("shorts.progress.init");
    if (p < 30) return t("shorts.progress.images");
    if (p < 65) return t("shorts.progress.scenes");
    if (p < 78) return t("shorts.progress.overlays");
    if (p < 85) return t("shorts.progress.transitions");
    if (p < 92) return t("shorts.progress.compositing");
    if (p < 98) return t("shorts.progress.music");
    return t("shorts.progress.finalizing");
  };

  const progressStepLabels = [
    t("shorts.progress.stepImages"),
    t("shorts.progress.stepScenes"),
    t("shorts.progress.stepOverlays"),
    t("shorts.progress.stepEffects"),
    t("shorts.progress.stepExport"),
  ];

  if (jobStatus === "processing" || jobStatus === "done" || jobStatus === "error") {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-border/50 bg-card/80 backdrop-blur">
            <CardContent className="pt-8 pb-8 px-8">
              <div className="text-center space-y-6">
                {jobStatus === "processing" && (
                  <>
                    <div className="w-20 h-20 mx-auto bg-gradient-to-br from-pink-500/20 to-violet-600/20 rounded-2xl flex items-center justify-center">
                      <Loader2 className="w-10 h-10 text-violet-400 animate-spin" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold">{t("shorts.generating")}</h2>
                      <p className="text-sm text-muted-foreground mt-1">{getProgressLabel(jobProgress)}</p>
                    </div>
                    <div className="space-y-2">
                      <div className="w-full bg-secondary rounded-full h-3 overflow-hidden">
                        <motion.div
                          className="h-full bg-gradient-to-r from-pink-500 to-violet-600 rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${jobProgress}%` }}
                          transition={{ duration: 0.5 }}
                        />
                      </div>
                      <p className="text-sm font-mono text-muted-foreground">{jobProgress}%</p>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5 px-4">
                      {progressStepLabels.map((label, i) => {
                        const thresholds = [10, 30, 70, 85, 98];
                        const active = jobProgress >= thresholds[i];
                        return (
                          <div key={label} className="text-center">
                            <div className={`w-2 h-2 rounded-full mx-auto mb-1 transition-colors ${active ? "bg-violet-400" : "bg-border"}`} />
                            <span className={`text-[10px] ${active ? "text-foreground" : "text-muted-foreground/50"}`}>{label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                {jobStatus === "done" && (
                  <>
                    <div className="w-20 h-20 mx-auto bg-gradient-to-br from-green-500/20 to-emerald-500/20 rounded-2xl flex items-center justify-center">
                      <CheckCircle2 className="w-10 h-10 text-green-400" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold">{t("shorts.videoReady")}</h2>
                      <p className="text-sm text-muted-foreground mt-1">{t("shorts.videoSuccess")}</p>
                    </div>

                    {videoUrl && (
                      <div className="mx-auto w-full max-w-[360px] aspect-[9/16] rounded-2xl overflow-hidden border border-border bg-black shadow-2xl shadow-black/50 relative group">
                        <video
                          src={videoUrl}
                          controls
                          className="w-full h-full object-contain"
                          autoPlay
                          muted
                          playsInline
                          style={{ maxHeight: "70vh" }}
                        />
                        <button
                          onClick={() => {
                            const v = document.querySelector<HTMLVideoElement>('video[src="' + videoUrl + '"]');
                            if (v) {
                              if (v.requestFullscreen) v.requestFullscreen();
                              else if ((v as any).webkitRequestFullscreen) (v as any).webkitRequestFullscreen();
                            }
                          }}
                          className="absolute top-3 right-3 bg-black/60 hover:bg-black/80 text-white rounded-lg p-2 opacity-0 group-hover:opacity-100 transition-opacity"
                          title={t("shorts.fullscreen")}
                        >
                          <Maximize2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    <div className="flex gap-3 justify-center pt-2">
                      {!videoUrl && (
                        <Button onClick={previewVideo} variant="outline" className="gap-2">
                          <Eye className="w-4 h-4" /> {t("shorts.preview")}
                        </Button>
                      )}
                      <Button onClick={downloadVideo} className="gap-2 bg-gradient-to-r from-pink-500 to-violet-600 hover:from-pink-600 hover:to-violet-700 text-white">
                        <Download className="w-4 h-4" /> {t("shorts.downloadMp4")}
                      </Button>
                    </div>

                    {script && (
                      <div className="text-left bg-secondary/50 rounded-xl p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-muted-foreground">{t("shorts.captionHashtags")}</span>
                          <button onClick={copyCaption} className="text-xs text-primary hover:underline flex items-center gap-1">
                            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            {copied ? t("shorts.copied") : t("shorts.copy")}
                          </button>
                        </div>
                        <p className="text-sm">{script.caption}</p>
                        <p className="text-xs text-primary">{script.hashtags.join(" ")}</p>
                      </div>
                    )}

                    <Button onClick={resetAll} variant="ghost" className="gap-2 text-muted-foreground">
                      <RefreshCw className="w-4 h-4" /> {t("shorts.createAnother")}
                    </Button>
                  </>
                )}

                {jobStatus === "error" && (
                  <>
                    <div className="w-20 h-20 mx-auto bg-gradient-to-br from-red-500/20 to-orange-500/20 rounded-2xl flex items-center justify-center">
                      <AlertCircle className="w-10 h-10 text-red-400" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold">{t("shorts.generationFailed")}</h2>
                      <p className="text-sm text-red-400 mt-1">{jobError || t("shorts.unknownError")}</p>
                    </div>
                    <div className="flex gap-3 justify-center">
                      <Button onClick={resetAll} variant="outline" className="gap-2">
                        <RefreshCw className="w-4 h-4" /> {t("shorts.tryAgain")}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-pink-500 to-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-violet-600/20">
              <Film className="w-5 h-5 text-white" />
            </div>
            {t("shorts.title")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">{t("shorts.subtitle")}</p>
        </div>
      </div>

      <div className="flex items-center gap-1 bg-secondary/50 rounded-xl p-1.5">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const isCurrent = step === s.id;
          const isPast = i < currentStepIndex;
          return (
            <button
              key={s.id}
              onClick={() => setStep(s.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-medium transition-all ${
                isCurrent
                  ? "bg-background text-foreground shadow-sm"
                  : isPast
                  ? "text-primary hover:bg-background/50"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/30"
              }`}
            >
              {isPast ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{s.label}</span>
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
        >
          {step === "details" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2"><Type className="w-5 h-5" /> {t("shorts.productDetails")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">{t("shorts.productName")}</label>
                    <Input value={productName} onChange={e => setProductName(e.target.value)} placeholder={t("shorts.productName.placeholder")} className="h-11" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">{t("shorts.price")}</label>
                    <Input value={price} onChange={e => setPrice(e.target.value)} placeholder={t("shorts.price.placeholder")} className="h-11" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t("shorts.description")}</label>
                  <Textarea value={productDescription} onChange={e => setProductDescription(e.target.value)} placeholder={t("shorts.description.placeholder")} className="resize-none min-h-[90px]" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">{t("shorts.robloxUrl")}</label>
                    <Input value={itemUrl} onChange={e => setItemUrl(e.target.value)} placeholder="https://www.roblox.com/..." className="h-11" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">{t("shorts.cta")}</label>
                    <Input value={cta} onChange={e => setCta(e.target.value)} placeholder={t("shorts.cta.placeholder")} className="h-11" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t("shorts.platform")}</label>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { id: "tiktok" as const, label: "TikTok", icon: "📱" },
                      { id: "youtube" as const, label: t("shorts.youtubeShorts"), icon: "▶️" },
                    ].map(p => (
                      <button
                        key={p.id}
                        onClick={() => setPlatform(p.id)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                          platform === p.id
                            ? "bg-primary/10 border-primary/30 text-foreground"
                            : "border-border text-muted-foreground hover:border-primary/20"
                        }`}
                      >
                        <span className="text-lg">{p.icon}</span>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {step === "media" && (
            <div className="space-y-5">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ImageIcon className="w-5 h-5" /> {t("shorts.images")}
                    <Badge variant="secondary" className="ml-auto text-xs">{images.length}/8</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div
                    onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add("border-primary/50", "bg-primary/5"); }}
                    onDragLeave={e => { e.currentTarget.classList.remove("border-primary/50", "bg-primary/5"); }}
                    onDrop={e => { e.currentTarget.classList.remove("border-primary/50", "bg-primary/5"); handleDrop(e); }}
                    className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
                      images.length >= 8 ? "border-border opacity-50 cursor-not-allowed" : "border-border hover:border-primary/40"
                    }`}
                    onClick={() => images.length < 8 && fileInputRef.current?.click()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={e => { if (e.target.files) handleImageUpload(e.target.files); e.target.value = ""; }}
                    />
                    <div className="w-14 h-14 mx-auto mb-3 bg-primary/10 rounded-xl flex items-center justify-center">
                      <Upload className="w-7 h-7 text-primary" />
                    </div>
                    <p className="text-sm font-medium">{t("shorts.dropImages")}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t("shorts.imageFormats")}</p>
                  </div>

                  {imagePreviews.length > 0 && (
                    <div className="grid grid-cols-4 sm:grid-cols-4 gap-3 mt-4">
                      {imagePreviews.map((src, i) => (
                        <motion.div
                          key={i}
                          layout
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="relative group aspect-[9/16] rounded-xl overflow-hidden border border-border bg-secondary shadow-sm"
                        >
                          <img src={src} alt={`${t("shorts.images")} ${i + 1}`} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all flex items-center justify-center">
                            <button
                              onClick={() => removeImage(i)}
                              className="opacity-0 group-hover:opacity-100 transition-all w-9 h-9 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center text-white shadow-lg"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="absolute top-2 left-2 bg-black/70 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                            {i + 1}
                          </div>
                          {i === 0 && (
                            <div className="absolute bottom-2 left-2 right-2 bg-violet-600/90 text-white text-[9px] font-bold py-0.5 text-center rounded">
                              {t("shorts.hook").split(" ")[0]}
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2"><Music className="w-4 h-4" /> {t("shorts.music")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {musicFile ? (
                      <div className="flex items-center gap-3 bg-secondary rounded-xl px-4 py-3">
                        <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                          <Music className="w-4 h-4 text-primary" />
                        </div>
                        <span className="text-sm truncate flex-1">{musicFile.name}</span>
                        <button onClick={() => setMusicFile(null)} className="text-muted-foreground hover:text-destructive transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => musicInputRef.current?.click()}
                        className="w-full border border-dashed border-border rounded-xl py-5 text-center text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground transition-all"
                      >
                        <Music className="w-6 h-6 mx-auto mb-1.5 opacity-50" />
                        {t("shorts.uploadMusic")}
                        <span className="block text-xs mt-0.5 opacity-60">{t("shorts.musicFormats")}</span>
                      </button>
                    )}
                    <input
                      ref={musicInputRef}
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={e => { if (e.target.files?.[0]) setMusicFile(e.target.files[0]); e.target.value = ""; }}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2"><FileImage className="w-4 h-4" /> {t("shorts.logo")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {logoPreview ? (
                      <div className="flex items-center gap-3 bg-secondary rounded-xl px-4 py-3">
                        <img src={logoPreview} alt={t("shorts.logo")} className="w-9 h-9 rounded-lg object-contain bg-white/5" />
                        <span className="text-sm truncate flex-1">{logoFile?.name}</span>
                        <button onClick={() => { setLogoFile(null); setLogoPreview(null); }} className="text-muted-foreground hover:text-destructive transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => logoInputRef.current?.click()}
                        className="w-full border border-dashed border-border rounded-xl py-5 text-center text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground transition-all"
                      >
                        <FileImage className="w-6 h-6 mx-auto mb-1.5 opacity-50" />
                        {t("shorts.uploadLogo")}
                        <span className="block text-xs mt-0.5 opacity-60">{t("shorts.logoFormat")}</span>
                      </button>
                    )}
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => { if (e.target.files?.[0]) handleLogoUpload(e.target.files[0]); e.target.value = ""; }}
                    />
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {step === "script" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Wand2 className="w-5 h-5" /> {t("shorts.aiScript")}
                  {scriptSource && (
                    <Badge variant="secondary" className="ml-2 text-[10px]">
                      {scriptSource === "ai" ? "🤖 AI" : "📝 Template"}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex items-center gap-4 bg-secondary/50 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2 flex-1">
                    <Sparkles className="w-4 h-4 text-violet-400" />
                    <span className="text-sm font-medium">{t("shorts.useAI")}</span>
                    <span className="text-xs text-muted-foreground">{t("shorts.poweredByGPT")}</span>
                  </div>
                  <Switch checked={useAI} onCheckedChange={setUseAI} />
                </div>

                <Button onClick={generateScriptHandler} disabled={generatingScript || !productName.trim()} variant="outline" className="w-full h-12 text-sm">
                  {generatingScript ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                  {script ? t("shorts.regenerateScript") : t("shorts.generateScript")}
                </Button>

                {!script && !generatingScript && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Wand2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">{t("shorts.clickToGenerate")}</p>
                    <p className="text-xs mt-1 opacity-60">{t("shorts.editAfter")}</p>
                  </div>
                )}

                {script && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-violet-500" /> {t("shorts.hook")}
                      </label>
                      <Input value={script.hook} onChange={e => setScript({ ...script, hook: e.target.value })} className="h-11 font-medium" />
                    </div>

                    <div className="space-y-3">
                      <label className="text-xs font-medium text-muted-foreground">{t("shorts.sceneSubtitles")}</label>
                      {script.subtitles.map((sub, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-6 text-right shrink-0">{i + 1}.</span>
                          <Input
                            value={sub}
                            onChange={e => {
                              const s = [...script.subtitles];
                              s[i] = e.target.value;
                              setScript({ ...script, subtitles: s });
                            }}
                            className="h-10"
                          />
                          {script.subtitles.length > 1 && (
                            <button
                              onClick={() => setScript({ ...script, subtitles: script.subtitles.filter((_, j) => j !== i) })}
                              className="text-muted-foreground hover:text-destructive shrink-0"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setScript({ ...script, subtitles: [...script.subtitles, ""] })}
                        className="text-xs text-muted-foreground"
                      >
                        {t("shorts.addSubtitle")}
                      </Button>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> {t("shorts.ctaClosing")}
                      </label>
                      <Input value={script.ctaLine} onChange={e => setScript({ ...script, ctaLine: e.target.value })} className="h-11" />
                    </div>

                    <div className="border-t border-border pt-4 space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground flex items-center justify-between">
                        <span>{t("shorts.captionHashtags")}</span>
                        <button onClick={copyCaption} className="flex items-center gap-1 text-primary hover:underline">
                          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          {copied ? t("shorts.copied") : t("shorts.copy")}
                        </button>
                      </label>
                      <Textarea
                        value={script.caption}
                        onChange={e => setScript({ ...script, caption: e.target.value })}
                        className="resize-none min-h-[60px] text-sm"
                      />
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {script.hashtags.map((tag, i) => (
                          <Badge key={i} variant="secondary" className="text-xs gap-1">
                            {tag}
                            <button onClick={() => setScript({ ...script, hashtags: script.hashtags.filter((_, j) => j !== i) })}>
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </CardContent>
            </Card>
          )}

          {step === "settings" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2"><Clock className="w-4 h-4" /> {t("shorts.duration")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3">
                    {DURATION_OPTIONS.map(d => (
                      <button
                        key={d.value}
                        onClick={() => setDuration(d.value)}
                        className={`py-3 rounded-xl text-center border transition-all ${
                          duration === d.value
                            ? "bg-primary/10 border-primary/30 text-foreground shadow-sm"
                            : "bg-secondary border-border text-muted-foreground hover:text-foreground hover:border-primary/20"
                        }`}
                      >
                        <span className="text-lg font-bold block">{d.label}</span>
                        <span className="text-[10px] opacity-60">{d.desc}</span>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2"><Palette className="w-4 h-4" /> {t("shorts.branding")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">{t("shorts.watermark")}</label>
                    <Input value={watermarkText} onChange={e => setWatermarkText(e.target.value)} placeholder="@yourbrand" className="h-10" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">{t("shorts.primaryColor")}</label>
                      <div className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2">
                        <input type="color" value={brandColor} onChange={e => setBrandColor(e.target.value)} className="w-7 h-7 rounded cursor-pointer border-0" />
                        <span className="text-xs font-mono text-muted-foreground">{brandColor}</span>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">{t("shorts.secondaryColor")}</label>
                      <div className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2">
                        <input type="color" value={brandColorSecondary} onChange={e => setBrandColorSecondary(e.target.value)} className="w-7 h-7 rounded cursor-pointer border-0" />
                        <span className="text-xs font-mono text-muted-foreground">{brandColorSecondary}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="sm:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2"><Layers className="w-4 h-4" /> {t("shorts.stylePreset")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    {STYLE_PRESETS.map(s => (
                      <button
                        key={s.id}
                        onClick={() => setStyle(s.id)}
                        className={`relative flex flex-col items-center gap-2 px-3 py-4 rounded-xl border text-center transition-all ${
                          style === s.id
                            ? `bg-gradient-to-b ${s.color} border-current font-semibold shadow-sm`
                            : "border-border text-muted-foreground hover:border-primary/20 hover:text-foreground"
                        }`}
                      >
                        <span className="text-2xl">{s.emoji}</span>
                        <span className="text-sm font-medium">{s.label}</span>
                        <span className="text-[10px] opacity-60">{s.desc}</span>
                        {style === s.id && (
                          <div className="absolute top-2 right-2">
                            <Check className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {step === "generate" && (
            <Card>
              <CardContent className="pt-8 pb-8">
                <div className="max-w-md mx-auto text-center space-y-6">
                  <div className="w-16 h-16 mx-auto bg-gradient-to-br from-pink-500/20 to-violet-600/20 rounded-2xl flex items-center justify-center">
                    <Video className="w-8 h-8 text-violet-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold">{t("shorts.readyToGenerate")}</h2>
                    <p className="text-sm text-muted-foreground mt-1">{t("shorts.reviewSettings")}</p>
                  </div>

                  <div className="text-left bg-secondary/50 rounded-xl p-4 space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("shorts.product")}</span>
                      <span className="font-medium truncate ml-4">{productName || "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("shorts.images")}</span>
                      <span className="font-medium">{images.length} {t("shorts.imagesCount")}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("shorts.duration")}</span>
                      <span className="font-medium">{duration}s</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("shorts.stylePreset")}</span>
                      <span className="font-medium capitalize">{style}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("shorts.platform")}</span>
                      <span className="font-medium">{platform === "tiktok" ? "TikTok" : t("shorts.youtubeShorts")}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("shorts.script")}</span>
                      <span className="font-medium">{script ? t("shorts.scriptReady") : t("shorts.scriptAuto")}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("shorts.music")}</span>
                      <span className="font-medium">{musicFile ? "✓ " + musicFile.name.slice(0, 20) : t("shorts.none")}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("shorts.logo")}</span>
                      <span className="font-medium">{logoFile ? t("shorts.logoAdded") : t("shorts.none")}</span>
                    </div>
                  </div>

                  {!canGenerate && (
                    <div className="bg-destructive/10 text-destructive rounded-lg px-4 py-2 text-sm">
                      {!productName.trim() && `${t("shorts.enterProductName")} • `}
                      {images.length === 0 && t("shorts.uploadAtLeastOne")}
                    </div>
                  )}

                  <Button
                    onClick={startGeneration}
                    disabled={!canGenerate}
                    className="w-full bg-gradient-to-r from-pink-500 to-violet-600 hover:from-pink-600 hover:to-violet-700 text-white h-14 text-base font-semibold shadow-lg shadow-violet-600/20"
                    size="lg"
                  >
                    <Zap className="w-5 h-5 mr-2" />
                    {t("shorts.generateVideo")}
                  </Button>

                  <p className="text-xs text-muted-foreground">
                    {t("shorts.generationTime")}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="flex items-center justify-between pt-2">
        <Button
          onClick={goPrev}
          variant="ghost"
          disabled={currentStepIndex === 0}
          className="gap-2"
        >
          <ChevronRight className="w-4 h-4 rotate-180" /> {t("shorts.back")}
        </Button>
        {currentStepIndex < STEPS.length - 1 && (
          <Button onClick={goNext} variant="outline" className="gap-2">
            {t("shorts.next")} <ChevronRight className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
