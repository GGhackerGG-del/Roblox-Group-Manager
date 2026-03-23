import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { robloxHeadshot } from "@/lib/roblox";
import { getAuthCredentials } from "@workspace/api-client-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, UserCheck, Calendar, Shield, Star, Eye } from "lucide-react";
import { motion } from "framer-motion";

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

export default function Profile() {
  useAuth();
  const { t } = useLanguage();
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    const { token, fingerprint } = getAuthCredentials();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (fingerprint) headers["X-Device-Fingerprint"] = fingerprint;

    fetch(`${base}/api/roblox/profile`, { credentials: "include", headers })
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then((data: ProfileData) => setProfileData(data))
      .catch(() => setError("Failed to load profile."))
      .finally(() => setLoading(false));
  }, []);

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

  return (
    <div className="p-8 lg:p-12 w-full max-w-4xl mx-auto space-y-8">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>

        {/* Hero */}
        <Card className="rounded-3xl border border-border shadow-xl overflow-hidden">
          <div className="h-32 bg-gradient-to-br from-black via-zinc-800 to-zinc-900" />
          <CardContent className="px-8 pb-8">
            <div className="flex items-end gap-6 -mt-14 mb-6">
              <Avatar className="w-28 h-28 border-4 border-background shadow-2xl">
                <AvatarImage src={profileData.avatarUrl || robloxHeadshot(profileData.id)} />
                <AvatarFallback className="text-3xl font-bold bg-secondary">{profileData.displayName.charAt(0)}</AvatarFallback>
              </Avatar>
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

        {/* Stats Row */}
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

        {/* Bio */}
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
