import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
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
  Loader2, CheckCircle2, Globe, Info, Zap, RefreshCw
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
    applyTheme(t);
  };

  useEffect(() => {
    applyTheme(theme);
  }, []);

  return { theme, setTheme };
}

export default function Settings() {
  const { profile, logoutRoblox, logoutLicense, licenseDetails } = useAuth();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();

  const [bio, setBio] = useState(() => localStorage.getItem("limitedink_bio") || "");
  const [savingBio, setSavingBio] = useState(false);
  const [notifSound, setNotifSound] = useState(() => localStorage.getItem("limitedink_notif_sound") !== "false");
  const [compactMode, setCompactMode] = useState(() => localStorage.getItem("limitedink_compact") === "true");
  const [autoRefreshSales, setAutoRefreshSales] = useState(() => localStorage.getItem("limitedink_auto_refresh") === "true");

  const handleSaveBio = async () => {
    setSavingBio(true);
    try {
      await apiFetch("/api/social/me", {
        method: "PATCH",
        body: JSON.stringify({ bio: bio.trim() }),
      });
      localStorage.setItem("limitedink_bio", bio.trim());
      toast({ title: "Bio saved!", description: "Your community profile has been updated." });
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
      },
      savedPrompts: Object.keys(localStorage)
        .filter(k => k.startsWith("limitedink_prompt_"))
        .reduce((acc, k) => ({ ...acc, [k]: localStorage.getItem(k) }), {}),
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `limitedink_export_${Date.now()}.json`;
    a.click();
    toast({ title: "Exported!", description: "Your data has been saved as a JSON file." });
  };

  const handleClearPrompts = () => {
    const keys = Object.keys(localStorage).filter(k => k.startsWith("limitedink_prompt_") || k.startsWith("limitedink_ctype_"));
    keys.forEach(k => localStorage.removeItem(k));
    toast({ title: "Cleared!", description: `${keys.length} saved prompts have been cleared.` });
  };

  const sections = [
    { id: "profile", label: "Profile", icon: User },
    { id: "appearance", label: "Appearance", icon: Palette },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "privacy", label: "Privacy & Security", icon: Shield },
    { id: "data", label: "Data & Storage", icon: Download },
    { id: "license", label: "License", icon: Key },
    { id: "about", label: "About", icon: Info },
  ];

  const [active, setActive] = useState("profile");

  return (
    <div className="p-6 lg:p-10 w-full max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <SettingsIcon className="w-7 h-7" /> Settings
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">Manage your account, appearance, and preferences.</p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
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

        {/* Content */}
        <div className="flex-1 min-w-0">
          <motion.div key={active} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>

            {/* ── Profile ── */}
            {active === "profile" && (
              <div className="space-y-5">
                <Card className="rounded-2xl border border-border shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base">Your Profile</CardTitle>
                    <CardDescription>Your Roblox identity and community presence.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="flex items-center gap-4">
                      <Avatar className="w-16 h-16 border border-border shadow-sm">
                        <AvatarImage src={profile?.avatarUrl || undefined} />
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
                          View on Roblox ↗
                        </a>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-bold uppercase tracking-wider">Community Bio</Label>
                      <Textarea
                        value={bio}
                        onChange={e => setBio(e.target.value)}
                        placeholder="Tell other developers about yourself..."
                        className="resize-none min-h-[100px] rounded-xl"
                        maxLength={250}
                      />
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">{bio.length}/250 characters</p>
                        <Button onClick={handleSaveBio} disabled={savingBio} size="sm" className="rounded-xl gap-2">
                          {savingBio ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                          Save Bio
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border border-destructive/30 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base text-destructive">Session Actions</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <Button variant="outline" onClick={logoutRoblox} className="justify-start gap-2 rounded-xl border-border">
                      <LogOut className="w-4 h-4" /> Disconnect Roblox Account
                    </Button>
                    <Button variant="outline" onClick={logoutLicense} className="justify-start gap-2 rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive">
                      <Key className="w-4 h-4" /> Revoke License Key
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* ── Appearance ── */}
            {active === "appearance" && (
              <div className="space-y-5">
                <Card className="rounded-2xl border border-border shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base">Theme</CardTitle>
                    <CardDescription>Choose how Limited.Ink looks for you.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-3">
                      {([
                        { value: "light", label: "Light", icon: Sun },
                        { value: "dark", label: "Dark", icon: Moon },
                        { value: "system", label: "System", icon: Monitor },
                      ] as Array<{ value: Theme; label: string; icon: React.FC<{ className?: string }> }>).map(({ value, label, icon: Icon }) => (
                        <button
                          key={value}
                          onClick={() => setTheme(value)}
                          className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${theme === value ? "border-black bg-black/5" : "border-border hover:border-black/30"}`}
                        >
                          <Icon className="w-6 h-6" />
                          <span className="text-sm font-semibold">{label}</span>
                          {theme === value && <Badge className="text-[10px] bg-black text-white border-0">Active</Badge>}
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border border-border shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base">Interface</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between py-2">
                      <div>
                        <p className="font-semibold text-sm">Compact Mode</p>
                        <p className="text-xs text-muted-foreground">Reduce spacing for more content on screen.</p>
                      </div>
                      <Switch
                        checked={compactMode}
                        onCheckedChange={v => {
                          setCompactMode(v);
                          localStorage.setItem("limitedink_compact", String(v));
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between py-2 border-t border-border">
                      <div>
                        <p className="font-semibold text-sm">Auto-refresh Sales</p>
                        <p className="text-xs text-muted-foreground">Automatically refresh sales data every 30 seconds.</p>
                      </div>
                      <Switch
                        checked={autoRefreshSales}
                        onCheckedChange={v => {
                          setAutoRefreshSales(v);
                          localStorage.setItem("limitedink_auto_refresh", String(v));
                        }}
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* ── Notifications ── */}
            {active === "notifications" && (
              <Card className="rounded-2xl border border-border shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Notifications</CardTitle>
                  <CardDescription>Control how you get notified.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <p className="font-semibold text-sm">Sound Effects</p>
                      <p className="text-xs text-muted-foreground">Play sounds for actions and events.</p>
                    </div>
                    <Switch
                      checked={notifSound}
                      onCheckedChange={v => {
                        setNotifSound(v);
                        localStorage.setItem("limitedink_notif_sound", String(v));
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between py-2 border-t border-border">
                    <div>
                      <p className="font-semibold text-sm">Upload Notifications</p>
                      <p className="text-xs text-muted-foreground">Show toast notifications for clothing uploads.</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between py-2 border-t border-border">
                    <div>
                      <p className="font-semibold text-sm">Chat Notifications</p>
                      <p className="text-xs text-muted-foreground">Show notifications for new messages.</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Privacy ── */}
            {active === "privacy" && (
              <div className="space-y-5">
                <Card className="rounded-2xl border border-border shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base">Privacy</CardTitle>
                    <CardDescription>Control your visibility on the platform.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between py-2">
                      <div>
                        <p className="font-semibold text-sm">Show Profile in Discover</p>
                        <p className="text-xs text-muted-foreground">Let other developers find you in the Community tab.</p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between py-2 border-t border-border">
                      <div>
                        <p className="font-semibold text-sm">Show My Groups</p>
                        <p className="text-xs text-muted-foreground">Display your Roblox groups on your community profile.</p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between py-2 border-t border-border">
                      <div>
                        <p className="font-semibold text-sm">Allow Friend Requests</p>
                        <p className="text-xs text-muted-foreground">Let others send you friend requests.</p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border border-border shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base">Security Info</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                      <Shield className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Cookie Security</p>
                        <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">Your Roblox cookie is stored in an encrypted server session (PostgreSQL-backed, 7-day TTL) and is cleared when you disconnect. You stay signed in across page refreshes automatically.</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded-xl">
                      <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-green-800 dark:text-green-200">License Protected</p>
                        <p className="text-xs text-green-700 dark:text-green-300 mt-0.5">All API endpoints are protected by your license key. Unauthorized access is blocked.</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* ── Data ── */}
            {active === "data" && (
              <div className="space-y-5">
                <Card className="rounded-2xl border border-border shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base">Export Your Data</CardTitle>
                    <CardDescription>Download a copy of your settings and saved prompts.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button onClick={handleExportData} className="rounded-xl gap-2">
                      <Download className="w-4 h-4" /> Export Data as JSON
                    </Button>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border border-border shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base">Local Storage</CardTitle>
                    <CardDescription>Manage data stored locally on this device.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-secondary/50 rounded-xl">
                      <div>
                        <p className="text-sm font-semibold">Saved AI Prompts</p>
                        <p className="text-xs text-muted-foreground">Prompts saved per group</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={handleClearPrompts} className="rounded-lg gap-1.5 text-xs">
                        <Trash2 className="w-3.5 h-3.5" /> Clear
                      </Button>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-secondary/50 rounded-xl">
                      <div>
                        <p className="text-sm font-semibold">UI Preferences</p>
                        <p className="text-xs text-muted-foreground">Theme, tab states, and more</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-lg gap-1.5 text-xs"
                        onClick={() => {
                          const keys = Object.keys(localStorage).filter(k => k.startsWith("limitedink_") && !k.includes("prompt") && !k.includes("bio"));
                          keys.forEach(k => localStorage.removeItem(k));
                          toast({ title: "Cleared", description: "UI preferences have been reset." });
                        }}
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> Reset
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* ── License ── */}
            {active === "license" && (
              <Card className="rounded-2xl border border-border shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">License Information</CardTitle>
                  <CardDescription>Details about your current Limited.Ink plan.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-secondary/50 rounded-xl">
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Plan</p>
                      <p className="text-xl font-bold capitalize">{licenseDetails?.plan || "—"}</p>
                    </div>
                    <div className="p-4 bg-secondary/50 rounded-xl">
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Status</p>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${licenseDetails?.valid ? "bg-green-500" : "bg-red-500"}`} />
                        <p className="text-xl font-bold">{licenseDetails?.valid ? "Active" : "Invalid"}</p>
                      </div>
                    </div>
                  </div>

                  {licenseDetails?.expiresAt && (
                    <div className="p-4 bg-secondary/50 rounded-xl">
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Expires</p>
                      <p className="font-semibold">{new Date(licenseDetails.expiresAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
                    </div>
                  )}

                  <div className="flex items-center gap-3 p-4 bg-black text-white rounded-xl">
                    <Zap className="w-5 h-5 shrink-0" />
                    <div>
                      <p className="font-semibold text-sm">Upgrade Your Plan</p>
                      <p className="text-xs text-white/70 mt-0.5">Get access to more features with a higher tier plan.</p>
                    </div>
                    <ChevronRight className="w-4 h-4 ml-auto shrink-0" />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── About ── */}
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
                        <p className="text-xs text-muted-foreground font-semibold">Version</p>
                        <p className="font-bold text-sm mt-0.5">1.0.0</p>
                      </div>
                      <div className="p-3 bg-secondary/50 rounded-xl">
                        <p className="text-xs text-muted-foreground font-semibold">Environment</p>
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
                      <p className="text-xs text-muted-foreground">Limited.Ink — Professional Roblox Group Management Platform</p>
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
