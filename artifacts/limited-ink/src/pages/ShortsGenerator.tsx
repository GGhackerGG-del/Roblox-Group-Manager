import { useState, useRef, useCallback, useEffect } from "react";
import { getAuthCredentials } from "@workspace/api-client-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Video, Upload, Sparkles, Download, Loader2, X, Image as ImageIcon,
  Play, Music, Type, Palette, Hash, Copy, Check, Film, Clock, Layers,
  Wand2, ChevronRight, RefreshCw, Trash2, GripVertical,
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

const STYLE_PRESETS = [
  { id: "clean", label: "Clean", emoji: "✨", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  { id: "hype", label: "Hype", emoji: "🔥", color: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
  { id: "minimal", label: "Minimal", emoji: "◾", color: "bg-gray-500/10 text-gray-400 border-gray-500/20" },
  { id: "luxury", label: "Luxury", emoji: "💎", color: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  { id: "streetwear", label: "Streetwear", emoji: "🧢", color: "bg-green-500/10 text-green-400 border-green-500/20" },
];

const DURATION_OPTIONS = [
  { value: 10, label: "10s" },
  { value: 15, label: "15s" },
  { value: 20, label: "20s" },
  { value: 30, label: "30s" },
];

export default function ShortsGenerator() {
  const { t } = useLanguage();
  const { toast } = useToast();

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

  const [watermarkText, setWatermarkText] = useState("");
  const [brandColor, setBrandColor] = useState("#5B88BD");
  const [brandColorSecondary, setBrandColorSecondary] = useState("#FFFFFF");

  const [script, setScript] = useState<GeneratedScript | null>(null);
  const [generatingScript, setGeneratingScript] = useState(false);

  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string>("idle");
  const [jobProgress, setJobProgress] = useState(0);
  const [jobError, setJobError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const musicInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

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

  const generateScriptHandler = async () => {
    if (!productName.trim()) {
      toast({ variant: "destructive", title: "Error", description: "Enter a product name first" });
      return;
    }
    setGeneratingScript(true);
    try {
      const r = await fetch(`${BASE}/api/shorts/generate-script`, {
        method: "POST",
        credentials: "include",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ productName, productDescription, price, cta, style, platform }),
      });
      if (!r.ok) throw new Error("Failed to generate script");
      const data = await r.json();
      setScript(data.script);
      toast({ title: "Script generated", description: "Review and edit the generated copy below" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setGeneratingScript(false);
    }
  };

  const startGeneration = async () => {
    if (images.length === 0) {
      toast({ variant: "destructive", title: "Error", description: "Upload at least one image" });
      return;
    }
    if (!productName.trim()) {
      toast({ variant: "destructive", title: "Error", description: "Enter a product name" });
      return;
    }

    setJobStatus("processing");
    setJobProgress(0);
    setJobError(null);

    const formData = new FormData();
    images.forEach(img => formData.append("images", img));
    if (musicFile) formData.append("music", musicFile);
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
        throw new Error(err.error || "Generation failed");
      }
      const data = await r.json();
      setJobId(data.jobId);
      startPolling(data.jobId);
    } catch (err: any) {
      setJobStatus("error");
      setJobError(err.message);
      toast({ variant: "destructive", title: "Error", description: err.message });
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
          toast({ title: "Video ready!", description: "Your short video has been generated" });
        } else if (data.status === "error") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setJobError(data.error);
          toast({ variant: "destructive", title: "Generation failed", description: data.error });
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
      if (!r.ok) throw new Error("Download failed");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${productName || "short"}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    }
  };

  const copyCaption = () => {
    if (!script) return;
    const text = `${script.caption}\n\n${script.hashtags.join(" ")}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const canGenerate = images.length > 0 && productName.trim().length > 0;

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-pink-500 to-violet-600 rounded-xl flex items-center justify-center">
              <Film className="w-5 h-5 text-white" />
            </div>
            AI Shorts Generator
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Create TikTok & YouTube Shorts for your Roblox products</p>
        </div>
        <Badge variant="outline" className="text-xs gap-1.5">
          <Sparkles className="w-3 h-3" /> Beta
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Type className="w-4 h-4" /> Product Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Product Name *</label>
                  <Input value={productName} onChange={e => setProductName(e.target.value)} placeholder="e.g. Midnight Hoodie" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Price</label>
                  <Input value={price} onChange={e => setPrice(e.target.value)} placeholder="e.g. 50 Robux" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Description</label>
                <Textarea value={productDescription} onChange={e => setProductDescription(e.target.value)} placeholder="Describe your product..." className="resize-none min-h-[70px]" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Roblox URL</label>
                  <Input value={itemUrl} onChange={e => setItemUrl(e.target.value)} placeholder="https://www.roblox.com/..." />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Call to Action</label>
                  <Input value={cta} onChange={e => setCta(e.target.value)} placeholder="Get yours now!" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><ImageIcon className="w-4 h-4" /> Images ({images.length}/8)</CardTitle>
            </CardHeader>
            <CardContent>
              <div
                onDragOver={e => e.preventDefault()}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${
                  images.length >= 8 ? "border-border opacity-50" : "border-border hover:border-primary/50"
                }`}
                onClick={() => images.length < 8 && fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={e => e.target.files && handleImageUpload(e.target.files)}
                />
                <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Drag & drop images or click to upload</p>
                <p className="text-xs text-muted-foreground mt-1">JPG, PNG, WebP — up to 8 images</p>
              </div>

              {imagePreviews.length > 0 && (
                <div className="grid grid-cols-4 gap-3 mt-4">
                  {imagePreviews.map((src, i) => (
                    <div key={i} className="relative group aspect-[9/16] rounded-lg overflow-hidden border border-border bg-secondary">
                      <img src={src} alt={`Image ${i + 1}`} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                        <button onClick={() => removeImage(i)} className="opacity-0 group-hover:opacity-100 transition-opacity w-8 h-8 bg-red-500 rounded-full flex items-center justify-center text-white">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <span className="absolute top-1.5 left-1.5 bg-black/60 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">{i + 1}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Wand2 className="w-4 h-4" /> AI Script</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={generateScriptHandler} disabled={generatingScript || !productName.trim()} variant="outline" className="w-full">
                {generatingScript ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                {script ? "Regenerate Script" : "Generate Script"}
              </Button>

              {script && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Hook</label>
                    <Input value={script.hook} onChange={e => setScript({ ...script, hook: e.target.value })} />
                  </div>
                  {script.subtitles.map((sub, i) => (
                    <div key={i} className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Subtitle {i + 1}</label>
                      <Input value={sub} onChange={e => {
                        const s = [...script.subtitles];
                        s[i] = e.target.value;
                        setScript({ ...script, subtitles: s });
                      }} />
                    </div>
                  ))}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">CTA Line</label>
                    <Input value={script.ctaLine} onChange={e => setScript({ ...script, ctaLine: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground flex items-center justify-between">
                      Caption + Hashtags
                      <button onClick={copyCaption} className="flex items-center gap-1 text-primary hover:underline">
                        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {copied ? "Copied" : "Copy"}
                      </button>
                    </label>
                    <Textarea value={`${script.caption}\n\n${script.hashtags.join(" ")}`} readOnly className="resize-none min-h-[60px] text-xs" />
                  </div>
                </motion.div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Layers className="w-4 h-4" /> Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Platform</label>
                <Select value={platform} onValueChange={v => setPlatform(v as "tiktok" | "youtube")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tiktok">TikTok</SelectItem>
                    <SelectItem value="youtube">YouTube Shorts</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Duration</label>
                <div className="grid grid-cols-4 gap-2">
                  {DURATION_OPTIONS.map(d => (
                    <button
                      key={d.value}
                      onClick={() => setDuration(d.value)}
                      className={`py-2 rounded-lg text-sm font-medium border transition-colors ${
                        duration === d.value
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-secondary border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Style</label>
                <div className="grid grid-cols-1 gap-2">
                  {STYLE_PRESETS.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setStyle(s.id)}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-sm text-left transition-all ${
                        style === s.id
                          ? s.color + " border-current font-semibold"
                          : "border-border text-muted-foreground hover:border-primary/30"
                      }`}
                    >
                      <span className="text-base">{s.emoji}</span>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Music className="w-4 h-4" /> Music</CardTitle>
            </CardHeader>
            <CardContent>
              {musicFile ? (
                <div className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2">
                  <Music className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm truncate flex-1">{musicFile.name}</span>
                  <button onClick={() => setMusicFile(null)} className="text-muted-foreground hover:text-destructive">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => musicInputRef.current?.click()}
                  className="w-full border border-dashed border-border rounded-lg py-4 text-center text-sm text-muted-foreground hover:border-primary/50 transition-colors"
                >
                  <Music className="w-5 h-5 mx-auto mb-1" />
                  Upload music (optional)
                </button>
              )}
              <input
                ref={musicInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={e => e.target.files?.[0] && setMusicFile(e.target.files[0])}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Palette className="w-4 h-4" /> Brand</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Watermark</label>
                <Input value={watermarkText} onChange={e => setWatermarkText(e.target.value)} placeholder="@yourbrand" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Primary</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={brandColor} onChange={e => setBrandColor(e.target.value)} className="w-8 h-8 rounded border border-border cursor-pointer" />
                    <span className="text-xs text-muted-foreground font-mono">{brandColor}</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Secondary</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={brandColorSecondary} onChange={e => setBrandColorSecondary(e.target.value)} className="w-8 h-8 rounded border border-border cursor-pointer" />
                    <span className="text-xs text-muted-foreground font-mono">{brandColorSecondary}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3">
            <Button
              onClick={startGeneration}
              disabled={!canGenerate || jobStatus === "processing"}
              className="w-full bg-gradient-to-r from-pink-500 to-violet-600 hover:from-pink-600 hover:to-violet-700 text-white h-12 text-base font-semibold"
              size="lg"
            >
              {jobStatus === "processing" ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Generating... {jobProgress}%
                </>
              ) : (
                <>
                  <Video className="w-5 h-5 mr-2" />
                  Generate Video
                </>
              )}
            </Button>

            {jobStatus === "processing" && (
              <div className="space-y-2">
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-pink-500 to-violet-600 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${jobProgress}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  {jobProgress < 15 && "Preparing images..."}
                  {jobProgress >= 15 && jobProgress < 70 && "Composing scenes..."}
                  {jobProgress >= 70 && jobProgress < 90 && "Adding effects..."}
                  {jobProgress >= 90 && "Finalizing video..."}
                </p>
              </div>
            )}

            {jobStatus === "error" && jobError && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                {jobError}
              </div>
            )}

            {jobStatus === "done" && (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-3">
                <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-center">
                  <Check className="w-8 h-8 text-green-500 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-green-400">Video Generated!</p>
                  <p className="text-xs text-muted-foreground mt-1">Your short is ready to download</p>
                </div>
                <Button onClick={downloadVideo} className="w-full" variant="outline" size="lg">
                  <Download className="w-5 h-5 mr-2" />
                  Download MP4
                </Button>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
