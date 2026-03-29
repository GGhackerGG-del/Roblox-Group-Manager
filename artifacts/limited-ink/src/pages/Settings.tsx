import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { robloxHeadshot } from "@/lib/roblox";
import { useLanguage, type Lang } from "@/contexts/LanguageContext";
import { getAuthCredentials } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Settings as SettingsIcon, User, Key, Shield, Bell, Palette,
  LogOut, Trash2, Download, Moon, Sun, Monitor, ChevronRight,
  Loader2, CheckCircle2, Globe, Info, Zap, RefreshCw, Languages,
  Mic, Volume2
} from "lucide-react";
import { motion } from "framer-motion";

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
    const err = await r.json().catch(() => ({ error: "Network error" })) as { error?: string };
    throw new Error(err.error || "Request failed");
  }
  return r.json() as Promise<T>;
}

type Theme = "light" | "dark" | "system";

const _eApi = (window as any).electronAPI;

function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    return (localStorage.getItem("limitedink_theme") as Theme) || "system";
  });

  const applyTheme = (t: Theme) => {
    const root = document.documentElement;
    if (t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  };

  const setTheme = (t: Theme) => {
    setThemeState(t);
    localStorage.setItem("limitedink_theme", t);
    _eApi?.storeSetting?.("theme", t);
    applyTheme(t);
  };

  useEffect(() => {
    (async () => {
      const local = localStorage.getItem("limitedink_theme") as Theme | null;
      if (!local && _eApi?.getSetting) {
        const stored = await _eApi.getSetting("theme") as Theme | undefined;
        if (stored) {
          setThemeState(stored);
          localStorage.setItem("limitedink_theme", stored);
          applyTheme(stored);
          return;
        }
      }
      applyTheme(theme);
    })();
  }, []);

  return { theme, setTheme };
}

export default function Settings() {
  const { profile, logoutRoblox, logoutLicense, licenseDetails } = useAuth();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const { lang, setLang, t } = useLanguage();

  const [bio, setBio] = useState(() => localStorage.getItem("limitedink_bio") || "");
  const [savingBio, setSavingBio] = useState(false);
  const [notifSound, setNotifSound] = useState(() => localStorage.getItem("limitedink_notif_sound") !== "false");
  const [compactMode, setCompactMode] = useState(() => localStorage.getItem("limitedink_compact") === "true");
  const [autoRefreshSales, setAutoRefreshSales] = useState(() => localStorage.getItem("limitedink_auto_refresh") === "true");

  useEffect(() => {
    (async () => {
      if (!_eApi?.getSetting) return;
      const keys = ["notif_sound", "compact", "auto_refresh", "mic_id", "speaker_id"] as const;
      const map: Record<string, string | undefined> = {};
      for (const k of keys) {
        const v = await _eApi.getSetting(k) as string | undefined;
        if (v !== undefined) map[k] = v;
      }
      if (!localStorage.getItem("limitedink_notif_sound") && map.notif_sound !== undefined) {
        localStorage.setItem("limitedink_notif_sound", map.notif_sound);
        setNotifSound(map.notif_sound !== "false");
      }
      if (!localStorage.getItem("limitedink_compact") && map.compact !== undefined) {
        localStorage.setItem("limitedink_compact", map.compact);
        setCompactMode(map.compact === "true");
      }
      if (!localStorage.getItem("limitedink_auto_refresh") && map.auto_refresh !== undefined) {
        localStorage.setItem("limitedink_auto_refresh", map.auto_refresh);
        setAutoRefreshSales(map.auto_refresh === "true");
      }
      if (!localStorage.getItem("limitedink_mic_id") && map.mic_id) {
        localStorage.setItem("limitedink_mic_id", map.mic_id);
        setSelectedMic(map.mic_id);
      }
      if (!localStorage.getItem("limitedink_speaker_id") && map.speaker_id) {
        localStorage.setItem("limitedink_speaker_id", map.speaker_id);
        setSelectedSpeaker(map.speaker_id);
      }
    })();
  }, []);

  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMic, setSelectedMic] = useState(() => localStorage.getItem("limitedink_mic_id") || "");
  const [selectedSpeaker, setSelectedSpeaker] = useState(() => localStorage.getItem("limitedink_speaker_id") || "");
  const [micTesting, setMicTesting] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micTestTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const micRafRef = useRef<number | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);

  const loadAudioDevices = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop()));
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAudioDevices(devices.filter(d => d.kind === "audioinput" || d.kind === "audiooutput"));
    } catch {
      toast({ variant: "destructive", title: t("settings.audio.permissionNeeded") });
    }
  };

  const stopMicTest = () => {
    micStreamRef.current?.getTracks().forEach(tr => tr.stop());
    micStreamRef.current = null;
    if (micTestTimeoutRef.current) { clearTimeout(micTestTimeoutRef.current); micTestTimeoutRef.current = null; }
    if (micRafRef.current) { cancelAnimationFrame(micRafRef.current); micRafRef.current = null; }
    if (micCtxRef.current) { micCtxRef.current.close().catch(() => {}); micCtxRef.current = null; }
    setMicTesting(false);
    setMicLevel(0);
  };

  useEffect(() => { return () => { stopMicTest(); }; }, []);

  const testMicrophone = async () => {
    if (micTesting) { stopMicTest(); return; }
    try {
      const constraints: MediaStreamConstraints = { audio: selectedMic ? { deviceId: { exact: selectedMic } } : true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      micStreamRef.current = stream;
      setMicTesting(true);
      const ctx = new AudioContext();
      micCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const check = () => {
        if (!micStreamRef.current) return;
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setMicLevel(Math.min(100, Math.round(avg * 1.5)));
        micRafRef.current = requestAnimationFrame(check);
      };
      check();
      micTestTimeoutRef.current = setTimeout(() => { stopMicTest(); }, 5000);
    } catch {
      toast({ variant: "destructive", title: t("settings.audio.permissionNeeded") });
    }
  };

  const saveMicSelection = (deviceId: string) => {
    setSelectedMic(deviceId);
    localStorage.setItem("limitedink_mic_id", deviceId);
    _eApi?.storeSetting?.("mic_id", deviceId);
    toast({ title: t("settings.audio.saved") });
  };

  const saveSpeakerSelection = (deviceId: string) => {
    setSelectedSpeaker(deviceId);
    localStorage.setItem("limitedink_speaker_id", deviceId);
    _eApi?.storeSetting?.("speaker_id", deviceId);
    toast({ title: t("settings.audio.saved") });
  };

  const handleSaveBio = async () => {
    setSavingBio(true);
    try {
      await apiFetch("/api/social/me", {
        method: "PATCH",
        body: JSON.stringify({ bio: bio.trim() }),
      });
      localStorage.setItem("limitedink_bio", bio.trim());
      toast({ title: t("profile.bio.saved"), description: t("profile.bio.saved.desc") });
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: err instanceof Error ? err.message : "Failed to save bio" });
    } finally {
      setSavingBio(false);
    }
  };

  const handleExportData = () => {
    const data = {
      profile: profile,
      license: licenseDetails,
      settings: {
        theme,
        notifSound,
        compactMode,
        autoRefreshSales,
        language: lang,
      },
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `limitedink_export_${Date.now()}.json`;
    a.click();
    toast({ title: t("data.exported"), description: t("data.exported.desc") });
  };

  const playNotifSound = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch {}
  };

  const [openCloudKey, setOpenCloudKey] = useState("");
  const [hasOpenCloudKey, setHasOpenCloudKey] = useState(false);
  const [savingApiKey, setSavingApiKey] = useState(false);
  const [loadingApiKey, setLoadingApiKey] = useState(true);

  useEffect(() => {
    apiFetch<{ hasKey: boolean }>("/api/roblox/open-cloud-key")
      .then(d => setHasOpenCloudKey(d.hasKey))
      .catch(() => {})
      .finally(() => setLoadingApiKey(false));
  }, []);

  const handleSaveApiKey = async () => {
    if (!openCloudKey.trim()) return;
    setSavingApiKey(true);
    try {
      await apiFetch("/api/roblox/open-cloud-key", {
        method: "POST",
        body: JSON.stringify({ apiKey: openCloudKey.trim() }),
      });
      setHasOpenCloudKey(true);
      setOpenCloudKey("");
      toast({ title: "API key saved", description: "Your Roblox Open Cloud API key has been stored for this session." });
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: err instanceof Error ? err.message : "Failed to save API key" });
    } finally {
      setSavingApiKey(false);
    }
  };

  const handleRemoveApiKey = async () => {
    try {
      await apiFetch("/api/roblox/open-cloud-key", { method: "DELETE" });
      setHasOpenCloudKey(false);
      toast({ title: "API key removed", description: "Your Open Cloud API key has been cleared." });
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: err instanceof Error ? err.message : "Failed to remove API key" });
    }
  };

  const sections = [
    { id: "profile", label: t("settings.profile"), icon: User },
    { id: "roblox-api", label: "Roblox API Key", icon: Key },
    { id: "appearance", label: t("settings.appearance"), icon: Palette },
    { id: "language", label: t("settings.language"), icon: Languages },
    { id: "notifications", label: t("settings.notifications"), icon: Bell },
    { id: "privacy", label: t("settings.privacy"), icon: Shield },
    { id: "data", label: t("settings.data"), icon: Download },
    { id: "license", label: t("settings.license"), icon: Key },
    { id: "audio", label: t("settings.audio"), icon: Mic },
    { id: "about", label: t("settings.about"), icon: Info },
  ];

  const [active, setActive] = useState("profile");

  const langOptions: Array<{ value: Lang; label: string; flag: string }> = [
    { value: "ru", label: t("lang.ru"), flag: "🇷🇺" },
    { value: "en", label: t("lang.en"), flag: "🇺🇸" },
    { value: "es", label: t("lang.es"), flag: "🇪🇸" },
  ];

  return (
    <div className="p-6 lg:p-10 w-full max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <SettingsIcon className="w-7 h-7" /> {t("settings")}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("settings.desc")}</p>
      </div>

      <div className="flex gap-6">
        <div className="w-56 shrink-0">
          <div className="space-y-1">
            {sections.map(s => (
              <button
                key={s.id}
                onClick={() => setActive(s.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${active === s.id ? "bg-black text-white shadow-sm" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
              >
                <s.icon className="w-4 h-4 shrink-0" />
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <motion.div key={active} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>

            {active === "profile" && (
              <div className="space-y-5">
                <Card className="rounded-2xl border border-border shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base">{t("profile.title")}</CardTitle>
                    <CardDescription>{t("profile.desc")}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="flex items-center gap-4">
                      <Avatar className="w-16 h-16 border border-border shadow-sm">
                        <AvatarImage src={profile?.avatarUrl || robloxHeadshot(profile?.id || 0)} />
                        <AvatarFallback className="text-xl font-bold">{profile?.displayName?.charAt(0) || "U"}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-bold text-lg">{profile?.displayName}</p>
                        <p className="text-sm text-muted-foreground">@{profile?.name}</p>
                        <a
                          href={`https://www.roblox.com/users/${profile?.id}/profile`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-500 hover:underline mt-0.5 block"
                        >
                          {t("profile.view")}
                        </a>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-bold uppercase tracking-wider">{t("profile.bio")}</Label>
                      <Textarea
                        value={bio}
                        onChange={e => setBio(e.target.value)}
                        placeholder={t("profile.bio.placeholder")}
                        className="resize-none min-h-[100px] rounded-xl"
                        maxLength={250}
                      />
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">{bio.length}/250 {t("characters")}</p>
                        <Button onClick={handleSaveBio} disabled={savingBio} size="sm" className="rounded-xl gap-2">
                          {savingBio ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                          {t("profile.bio.save")}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border border-destructive/30 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base text-destructive">{t("profile.session")}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <Button variant="outline" onClick={logoutRoblox} className="justify-start gap-2 rounded-xl border-border">
                      <LogOut className="w-4 h-4" /> {t("profile.disconnect")}
                    </Button>
                    <Button variant="outline" onClick={logoutLicense} className="justify-start gap-2 rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive">
                      <Key className="w-4 h-4" /> {t("profile.revoke")}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* ── Roblox API Key ── */}
            {active === "roblox-api" && (
              <div className="space-y-5">
                <Card className="rounded-2xl border border-border shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base">Roblox Open Cloud API Key (Optional)</CardTitle>
                    <CardDescription>Clothing uploads work automatically with your Roblox cookie. This API key is optional — add it only if cookie-based uploads don't work for your account.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {loadingApiKey ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" /> Checking API key status...
                      </div>
                    ) : hasOpenCloudKey ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded-xl">
                          <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                          <div>
                            <p className="text-sm font-semibold text-green-800 dark:text-green-200">API Key Active</p>
                            <p className="text-xs text-green-700 dark:text-green-300 mt-0.5">Your Open Cloud API key is stored for this session and will be used for clothing uploads.</p>
                          </div>
                        </div>
                        <Button variant="outline" onClick={handleRemoveApiKey} className="rounded-xl gap-2 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive">
                          <Trash2 className="w-4 h-4" /> Remove API Key
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                          <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">No API Key Set</p>
                            <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">Uploads use your Roblox cookie by default. You can optionally add an Open Cloud API key as a backup method.</p>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-bold">API Key</Label>
                          <Input
                            type="password"
                            value={openCloudKey}
                            onChange={e => setOpenCloudKey(e.target.value)}
                            placeholder="Paste your Open Cloud API key here..."
                            className="rounded-xl font-mono text-xs"
                          />
                        </div>
                        <Button onClick={handleSaveApiKey} disabled={savingApiKey || !openCloudKey.trim()} className="rounded-xl w-full gap-2">
                          {savingApiKey ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
                          {savingApiKey ? "Saving..." : "Save API Key"}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border border-border shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base">How to Get an API Key</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
                      <li>Go to <a href="https://create.roblox.com/dashboard/credentials" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Roblox Creator Hub → Credentials</a></li>
                      <li>Click "Create API Key"</li>
                      <li>Name it (e.g. "Limited.Ink Uploads")</li>
                      <li>Under "Access Permissions", add the <span className="font-semibold text-foreground">Asset</span> API with <span className="font-semibold text-foreground">Read</span> and <span className="font-semibold text-foreground">Write</span> operations</li>
                      <li>Under "Accepted IP Addresses", add <span className="font-mono text-foreground">0.0.0.0/0</span> (or the server's IP)</li>
                      <li>Copy the generated key and paste it above</li>
                    </ol>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* ── Appearance ── */}
            {active === "appearance" && (
              <div className="space-y-5">
                <Card className="rounded-2xl border border-border shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base">{t("appearance.theme")}</CardTitle>
                    <CardDescription>{t("appearance.theme.desc")}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-3">
                      {([
                        { value: "light", label: t("appearance.light"), icon: Sun },
                        { value: "dark", label: t("appearance.dark"), icon: Moon },
                        { value: "system", label: t("appearance.system"), icon: Monitor },
                      ] as Array<{ value: Theme; label: string; icon: React.FC<{ className?: string }> }>).map(({ value, label, icon: Icon }) => (
                        <button
                          key={value}
                          onClick={() => setTheme(value)}
                          className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${theme === value ? "border-black bg-black/5" : "border-border hover:border-black/30"}`}
                        >
                          <Icon className="w-6 h-6" />
                          <span className="text-sm font-semibold">{label}</span>
                          {theme === value && <Badge className="text-[10px] bg-black text-white border-0">{t("appearance.active")}</Badge>}
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border border-border shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base">{t("appearance.interface")}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between py-2">
                      <div>
                        <p className="font-semibold text-sm">{t("appearance.compact")}</p>
                        <p className="text-xs text-muted-foreground">{t("appearance.compact.desc")}</p>
                      </div>
                      <Switch
                        checked={compactMode}
                        onCheckedChange={v => {
                          setCompactMode(v);
                          localStorage.setItem("limitedink_compact", String(v));
                          _eApi?.storeSetting?.("compact", String(v));
                          if (v) document.documentElement.classList.add("compact");
                          else document.documentElement.classList.remove("compact");
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between py-2 border-t border-border">
                      <div>
                        <p className="font-semibold text-sm">{t("appearance.autorefresh")}</p>
                        <p className="text-xs text-muted-foreground">{t("appearance.autorefresh.desc")}</p>
                      </div>
                      <Switch
                        checked={autoRefreshSales}
                        onCheckedChange={v => {
                          setAutoRefreshSales(v);
                          localStorage.setItem("limitedink_auto_refresh", String(v));
                          _eApi?.storeSetting?.("auto_refresh", String(v));
                        }}
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {active === "language" && (
              <Card className="rounded-2xl border border-border shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">{t("lang.title")}</CardTitle>
                  <CardDescription>{t("lang.desc")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-3">
                    {langOptions.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setLang(opt.value)}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${lang === opt.value ? "border-black bg-black/5" : "border-border hover:border-black/30"}`}
                      >
                        <span className="text-2xl">{opt.flag}</span>
                        <span className="text-sm font-semibold">{opt.label}</span>
                        {lang === opt.value && <Badge className="text-[10px] bg-black text-white border-0">{t("appearance.active")}</Badge>}
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {active === "notifications" && (
              <Card className="rounded-2xl border border-border shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">{t("notif.title")}</CardTitle>
                  <CardDescription>{t("notif.desc")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <p className="font-semibold text-sm">{t("notif.sound")}</p>
                      <p className="text-xs text-muted-foreground">{t("notif.sound.desc")}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7 px-2"
                        onClick={playNotifSound}
                      >
                        {t("notif.sound.test")}
                      </Button>
                      <Switch
                        checked={notifSound}
                        onCheckedChange={v => {
                          setNotifSound(v);
                          localStorage.setItem("limitedink_notif_sound", String(v));
                          _eApi?.storeSetting?.("notif_sound", String(v));
                          if (v) playNotifSound();
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between py-2 border-t border-border">
                    <div>
                      <p className="font-semibold text-sm">{t("notif.upload")}</p>
                      <p className="text-xs text-muted-foreground">{t("notif.upload.desc")}</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between py-2 border-t border-border">
                    <div>
                      <p className="font-semibold text-sm">{t("notif.chat")}</p>
                      <p className="text-xs text-muted-foreground">{t("notif.chat.desc")}</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                </CardContent>
              </Card>
            )}

            {active === "privacy" && (
              <div className="space-y-5">
                <Card className="rounded-2xl border border-border shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base">{t("privacy.title")}</CardTitle>
                    <CardDescription>{t("privacy.desc")}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between py-2">
                      <div>
                        <p className="font-semibold text-sm">{t("privacy.discover")}</p>
                        <p className="text-xs text-muted-foreground">{t("privacy.discover.desc")}</p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between py-2 border-t border-border">
                      <div>
                        <p className="font-semibold text-sm">{t("privacy.groups")}</p>
                        <p className="text-xs text-muted-foreground">{t("privacy.groups.desc")}</p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between py-2 border-t border-border">
                      <div>
                        <p className="font-semibold text-sm">{t("privacy.friends")}</p>
                        <p className="text-xs text-muted-foreground">{t("privacy.friends.desc")}</p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border border-border shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base">{t("privacy.security")}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                      <Shield className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">{t("privacy.cookie")}</p>
                        <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">{t("privacy.cookie.desc")}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded-xl">
                      <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-green-800 dark:text-green-200">{t("privacy.protected")}</p>
                        <p className="text-xs text-green-700 dark:text-green-300 mt-0.5">{t("privacy.protected.desc")}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {active === "data" && (
              <div className="space-y-5">
                <Card className="rounded-2xl border border-border shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base">{t("data.export")}</CardTitle>
                    <CardDescription>{t("data.export.desc")}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button onClick={handleExportData} className="rounded-xl gap-2">
                      <Download className="w-4 h-4" /> {t("data.export.btn")}
                    </Button>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border border-border shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base">{t("data.local")}</CardTitle>
                    <CardDescription>{t("data.local.desc")}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-secondary/50 rounded-xl">
                      <div>
                        <p className="text-sm font-semibold">{t("data.prefs")}</p>
                        <p className="text-xs text-muted-foreground">{t("data.prefs.desc")}</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-lg gap-1.5 text-xs"
                        onClick={() => {
                          const keys = Object.keys(localStorage).filter(k => k.startsWith("limitedink_") && !k.includes("bio"));
                          keys.forEach(k => localStorage.removeItem(k));
                          toast({ title: t("data.cleared"), description: t("data.cleared.desc") });
                        }}
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> {t("data.reset")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {active === "license" && (
              <Card className="rounded-2xl border border-border shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">{t("license.title")}</CardTitle>
                  <CardDescription>{t("license.desc")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-secondary/50 rounded-xl">
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">{t("license.plan")}</p>
                      <p className="text-xl font-bold capitalize">{licenseDetails?.plan || "—"}</p>
                    </div>
                    <div className="p-4 bg-secondary/50 rounded-xl">
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">{t("license.status")}</p>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${licenseDetails?.valid ? "bg-green-500" : "bg-red-500"}`} />
                        <p className="text-xl font-bold">{licenseDetails?.valid ? t("license.active") : t("license.invalid")}</p>
                      </div>
                    </div>
                  </div>

                  {licenseDetails?.expiresAt && (
                    <div className="p-4 bg-secondary/50 rounded-xl">
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">{t("license.expires")}</p>
                      <p className="font-semibold">{new Date(licenseDetails.expiresAt).toLocaleDateString(lang === "ru" ? "ru-RU" : lang === "es" ? "es-ES" : "en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
                    </div>
                  )}

                  <div className="flex items-center gap-3 p-4 bg-black text-white rounded-xl">
                    <Zap className="w-5 h-5 shrink-0" />
                    <div>
                      <p className="font-semibold text-sm">{t("license.upgrade")}</p>
                      <p className="text-xs text-white/70 mt-0.5">{t("license.upgrade.desc")}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 ml-auto shrink-0" />
                  </div>
                </CardContent>
              </Card>
            )}

            {active === "audio" && (
              <div className="space-y-5">
                <Card className="rounded-2xl border border-border shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2"><Mic className="w-4 h-4" /> {t("settings.audio")}</CardTitle>
                    <CardDescription>{t("settings.audio.desc")}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="space-y-3">
                      <Label className="text-sm font-semibold flex items-center gap-2"><Mic className="w-3.5 h-3.5" /> {t("settings.audio.microphone")}</Label>
                      <div className="space-y-2">
                        {audioDevices.filter(d => d.kind === "audioinput").length > 0 ? (
                          audioDevices.filter(d => d.kind === "audioinput").map(d => (
                            <button
                              key={d.deviceId}
                              onClick={() => saveMicSelection(d.deviceId)}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all border ${selectedMic === d.deviceId ? "border-black bg-black text-white" : "border-border hover:bg-secondary"}`}
                            >
                              <Mic className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{d.label || t("settings.audio.default")}</span>
                              {selectedMic === d.deviceId && <CheckCircle2 className="w-4 h-4 ml-auto shrink-0" />}
                            </button>
                          ))
                        ) : (
                          <div className="text-sm text-muted-foreground p-3 bg-secondary/50 rounded-xl">
                            {t("settings.audio.noDevices")}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <Button variant="outline" size="sm" className="rounded-xl gap-1.5 text-xs" onClick={testMicrophone}>
                          {micTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mic className="w-3.5 h-3.5" />}
                          {micTesting ? t("settings.audio.testing") : t("settings.audio.testMic")}
                        </Button>
                        {micTesting && (
                          <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                            <motion.div
                              className="h-full bg-black rounded-full"
                              animate={{ width: `${micLevel}%` }}
                              transition={{ duration: 0.1 }}
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="h-px bg-border" />

                    <div className="space-y-3">
                      <Label className="text-sm font-semibold flex items-center gap-2"><Volume2 className="w-3.5 h-3.5" /> {t("settings.audio.speaker")}</Label>
                      <div className="space-y-2">
                        {audioDevices.filter(d => d.kind === "audiooutput").length > 0 ? (
                          audioDevices.filter(d => d.kind === "audiooutput").map(d => (
                            <button
                              key={d.deviceId}
                              onClick={() => saveSpeakerSelection(d.deviceId)}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all border ${selectedSpeaker === d.deviceId ? "border-black bg-black text-white" : "border-border hover:bg-secondary"}`}
                            >
                              <Volume2 className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{d.label || t("settings.audio.default")}</span>
                              {selectedSpeaker === d.deviceId && <CheckCircle2 className="w-4 h-4 ml-auto shrink-0" />}
                            </button>
                          ))
                        ) : (
                          <div className="text-sm text-muted-foreground p-3 bg-secondary/50 rounded-xl">
                            {t("settings.audio.noDevices")}
                          </div>
                        )}
                      </div>
                    </div>

                    {audioDevices.length === 0 && (
                      <Button variant="outline" className="w-full rounded-xl gap-2" onClick={loadAudioDevices}>
                        <Mic className="w-4 h-4" /> {t("settings.audio.selectMic")}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {active === "about" && (
              <div className="space-y-5">
                <Card className="rounded-2xl border border-border shadow-sm overflow-hidden">
                  <div className="h-24 bg-gradient-to-br from-black via-zinc-800 to-zinc-900 flex items-center justify-center">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center">
                        <Zap className="w-5 h-5 text-black" />
                      </div>
                      <span className="text-white text-2xl font-bold tracking-tight">Limited.Ink</span>
                    </div>
                  </div>
                  <CardContent className="p-5 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 bg-secondary/50 rounded-xl">
                        <p className="text-xs text-muted-foreground font-semibold">{t("about.version")}</p>
                        <p className="font-bold text-sm mt-0.5">1.1.0</p>
                      </div>
                      <div className="p-3 bg-secondary/50 rounded-xl">
                        <p className="text-xs text-muted-foreground font-semibold">{t("about.env")}</p>
                        <p className="font-bold text-sm mt-0.5 capitalize">{import.meta.env.MODE}</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {[
                        { label: "Catalog Copy Tool", desc: "Browse and copy Roblox marketplace clothing" },
                        { label: "Sales Analytics", desc: "Real-time sales monitoring and reporting" },
                        { label: "Featured Groups", desc: "Discover active Roblox groups on the platform" },
                        { label: "Community Hub", desc: "Connect with Roblox developers worldwide" },
                        { label: "Alt Account Manager", desc: "Upload clothing with multiple accounts" },
                      ].map(f => (
                        <div key={f.label} className="flex items-center gap-3 p-3 rounded-xl border border-border">
                          <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                          <div>
                            <p className="text-sm font-semibold">{f.label}</p>
                            <p className="text-xs text-muted-foreground">{f.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                      <Globe className="w-4 h-4 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">{t("about.footer")}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

          </motion.div>
        </div>
      </div>
    </div>
  );
}
