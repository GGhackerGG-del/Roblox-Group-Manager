import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { robloxHeadshot } from "@/lib/roblox";
import { getAuthCredentials } from "@workspace/api-client-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Users, UserCheck, Calendar, Shield, Star, Eye, Palette, Check, Sparkles, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import AvatarWithFrame, { AVATAR_FRAMES, FRAME_NAMES, FRAME_RARITIES } from "@/components/AvatarWithFrame";
import { useToast } from "@/hooks/use-toast";

interface ProfileData {
  id: number;
  name: string;
  displayName: string;
  description: string;
  created: string;
  isBanned: boolean;
  hasVerifiedBadge: boolean;
  friendsCount: number;
  followersCount: number;
  followingCount: number;
  avatarUrl: string | null;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const RARITY_COLORS: Record<string, string> = {
  common: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  rare: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  epic: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  legendary: "bg-amber-500/15 text-amber-400 border-amber-500/30",
};

const RARITY_LABELS: Record<string, Record<string, string>> = {
  common: { en: "Common", ru: "Обычный", es: "Común" },
  rare: { en: "Rare", ru: "Редкий", es: "Raro" },
  epic: { en: "Epic", ru: "Эпический", es: "Épico" },
  legendary: { en: "Legendary", ru: "Легендарный", es: "Legendario" },
};

export default function Profile() {
  useAuth();
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentFrame, setCurrentFrame] = useState("none");
  const [previewFrame, setPreviewFrame] = useState("none");
  const [savingFrame, setSavingFrame] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const getHeaders = useCallback(() => {
    const { token, fingerprint } = getAuthCredentials();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (fingerprint) headers["X-Device-Fingerprint"] = fingerprint;
    return headers;
  }, []);

  useEffect(() => {
    const headers = getHeaders();
    Promise.all([
      fetch(`${BASE}/api/roblox/profile`, { credentials: "include", headers }).then(r => r.ok ? r.json() : Promise.reject(r)),
      fetch(`${BASE}/api/social/me`, { credentials: "include", headers }).then(r => r.ok ? r.json() : null).catch(() => null),
    ])
      .then(([profile, socialMe]: [ProfileData, any]) => {
        setProfileData(profile);
        const frame = socialMe?.avatarFrame || "none";
        setCurrentFrame(frame);
        setPreviewFrame(frame);
      })
      .catch(() => setError("Failed to load profile."))
      .finally(() => setLoading(false));
  }, [getHeaders]);

  const saveFrame = async (frameId: string) => {
    setSavingFrame(true);
    try {
      const res = await fetch(`${BASE}/api/social/me`, {
        method: "PATCH",
        credentials: "include",
        headers: getHeaders(),
        body: JSON.stringify({ avatarFrame: frameId }),
      });
      if (res.ok) {
        setCurrentFrame(frameId);
        setPreviewFrame(frameId);
        setDialogOpen(false);
        window.dispatchEvent(new Event("avatar-frame-changed"));
        toast({ title: language === "ru" ? "Рамка обновлена!" : language === "es" ? "Marco actualizado!" : "Frame updated!" });
      } else {
        toast({ variant: "destructive", title: language === "ru" ? "Не удалось сохранить" : language === "es" ? "No se pudo guardar" : "Failed to save" });
      }
    } catch {
      toast({ variant: "destructive", title: language === "ru" ? "Ошибка сети" : language === "es" ? "Error de red" : "Network error" });
    } finally {
      setSavingFrame(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 lg:p-12 w-full max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-40 w-full rounded-3xl" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    );
  }

  if (error || !profileData) {
    return <div className="p-12 text-center text-muted-foreground">{error || t("profile.failedLoad")}</div>;
  }

  const createdDate = new Date(profileData.created).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  const stats = [
    { label: t("profile.friends"), value: profileData.friendsCount.toLocaleString(), icon: Users },
    { label: t("profile.followers"), value: profileData.followersCount.toLocaleString(), icon: Eye },
    { label: t("profile.following"), value: profileData.followingCount.toLocaleString(), icon: UserCheck },
  ];

  const frameKeys = Object.keys(AVATAR_FRAMES);

  return (
    <div className="p-8 lg:p-12 w-full max-w-4xl mx-auto space-y-8">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>

        <Card className="rounded-3xl border border-border shadow-xl overflow-hidden">
          <div className="h-32 bg-gradient-to-br from-black via-zinc-800 to-zinc-900" />
          <CardContent className="px-8 pb-8">
            <div className="flex items-end gap-6 -mt-14 mb-6">
              <div className="relative group">
                <AvatarWithFrame
                  src={profileData.avatarUrl || robloxHeadshot(profileData.id)}
                  fallbackText={profileData.displayName.charAt(0)}
                  frameId={currentFrame}
                  size="xl"
                  className="border-4 border-background shadow-2xl"
                />
                <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (open) setPreviewFrame(currentFrame); }}>
                  <DialogTrigger asChild>
                    <button className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:scale-110 transition-transform z-10">
                      <Palette className="w-4 h-4" />
                    </button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5" />
                        {language === "ru" ? "Аксессуары профиля" : language === "es" ? "Accesorios de perfil" : "Profile Accessories"}
                      </DialogTitle>
                    </DialogHeader>

                    <div className="flex justify-center py-4">
                      <AvatarWithFrame
                        src={profileData.avatarUrl || robloxHeadshot(profileData.id)}
                        fallbackText={profileData.displayName.charAt(0)}
                        frameId={previewFrame}
                        size="xl"
                      />
                    </div>
                    <p className="text-center text-sm text-muted-foreground -mt-2 mb-4">
                      {FRAME_NAMES[previewFrame]?.[language] || FRAME_NAMES[previewFrame]?.en || previewFrame}
                    </p>

                    <div className="grid grid-cols-4 gap-3">
                      {frameKeys.map(key => {
                        const rarity = FRAME_RARITIES[key] || "common";
                        const isSelected = previewFrame === key;
                        const isCurrent = currentFrame === key;
                        return (
                          <motion.button
                            key={key}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setPreviewFrame(key)}
                            className={`relative flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${
                              isSelected
                                ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                                : "border-border bg-card hover:border-primary/50 hover:bg-secondary/50"
                            }`}
                          >
                            {isCurrent && (
                              <div className="absolute top-1 right-1">
                                <Check className="w-3.5 h-3.5 text-green-500" />
                              </div>
                            )}
                            <AvatarWithFrame
                              src={profileData.avatarUrl || robloxHeadshot(profileData.id)}
                              fallbackText={profileData.displayName.charAt(0)}
                              frameId={key}
                              size="sm"
                            />
                            <span className="text-[10px] font-medium text-center leading-tight line-clamp-1">
                              {FRAME_NAMES[key]?.[language] || FRAME_NAMES[key]?.en || key}
                            </span>
                            <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-md border ${RARITY_COLORS[rarity]}`}>
                              {RARITY_LABELS[rarity]?.[language] || RARITY_LABELS[rarity]?.en}
                            </span>
                          </motion.button>
                        );
                      })}
                    </div>

                    <div className="flex gap-2 pt-4">
                      <Button
                        variant="outline"
                        className="flex-1 rounded-xl"
                        onClick={() => { setDialogOpen(false); setPreviewFrame(currentFrame); }}
                      >
                        {language === "ru" ? "Отмена" : language === "es" ? "Cancelar" : "Cancel"}
                      </Button>
                      <Button
                        className="flex-1 rounded-xl gap-2"
                        disabled={savingFrame || previewFrame === currentFrame}
                        onClick={() => saveFrame(previewFrame)}
                      >
                        {savingFrame && <Loader2 className="w-4 h-4 animate-spin" />}
                        {language === "ru" ? "Применить" : language === "es" ? "Aplicar" : "Apply"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
              <div className="pb-2 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-3xl font-bold tracking-tight">{profileData.displayName}</h1>
                  {profileData.hasVerifiedBadge && (
                    <Badge className="bg-blue-500/15 text-blue-600 border-blue-500/20 flex items-center gap-1 text-xs">
                      <Star className="w-3 h-3" /> {t("profile.verified")}
                    </Badge>
                  )}
                  {profileData.isBanned && (
                    <Badge variant="destructive" className="text-xs flex items-center gap-1">
                      <Shield className="w-3 h-3" /> {t("profile.banned")}
                    </Badge>
                  )}
                </div>
                <p className="text-muted-foreground text-sm mt-0.5">@{profileData.name} · ID: {profileData.id}</p>
              </div>
              <a
                href={`https://www.roblox.com/users/${profileData.id}/profile`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/70 transition-colors border border-border shrink-0"
              >
                {t("profile.openRoblox")}
              </a>
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="w-4 h-4 shrink-0" />
              <span>{t("profile.created")} {createdDate}</span>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          {stats.map((stat) => (
            <Card key={stat.label} className="rounded-2xl border border-border shadow-md">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-11 h-11 bg-secondary rounded-xl flex items-center justify-center shrink-0">
                  <stat.icon className="w-5 h-5 text-foreground" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-bold">{stat.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {profileData.description && (
          <Card className="rounded-2xl border border-border shadow-md mt-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-bold">{t("profile.about")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{profileData.description}</p>
            </CardContent>
          </Card>
        )}

      </motion.div>
    </div>
  );
}
