import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LayoutDashboard, Star, TrendingUp, Search, Sparkles, Users, X, Calendar, Globe, Crown, ExternalLink, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";

interface FeaturedGroup {
  groupId: number;
  name: string;
  memberCount: number;
  thumbnailUrl: string | null;
  lastActiveAt: string;
}

interface GroupDetail {
  groupId: number;
  name: string;
  memberCount: number;
  thumbnailUrl: string | null;
  lastActiveAt: string;
  description: string;
  owner: { id: number; name: string; displayName: string; avatar: string | null } | null;
  created: string | null;
  publicEntryAllowed: boolean | null;
}

function GroupModal({ groupId, onClose }: { groupId: number; onClose: () => void }) {
  const { t } = useLanguage();
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}api/featured-groups/${groupId}`, { credentials: "include" })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => {
        if (data && data.name && typeof data.memberCount === "number") setDetail(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [groupId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-background rounded-3xl border border-border shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {loading ? (
          <div className="p-12 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : detail ? (
          <>
            <div className="relative">
              <div className="h-32 bg-gradient-to-br from-black via-gray-900 to-gray-800 relative overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(#ffffff10_1px,transparent_1px)] [background-size:20px_20px]" />
              </div>
              <div className="absolute -bottom-10 left-6">
                <div className="w-20 h-20 rounded-2xl overflow-hidden border-4 border-background bg-muted shadow-lg">
                  {detail.thumbnailUrl ? (
                    <img src={detail.thumbnailUrl} alt={detail.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-lg font-bold text-muted-foreground">
                      {detail.name.substring(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={onClose}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="pt-14 px-6 pb-6 space-y-5">
              <div>
                <h2 className="text-xl font-bold text-foreground">{detail.name}</h2>
                {detail.description && (
                  <p className="text-sm text-muted-foreground mt-1.5 line-clamp-3">{detail.description}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-secondary/50 rounded-xl p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Users className="w-3.5 h-3.5" />
                    <span className="text-[11px] font-medium uppercase tracking-wider">{t("home.members")}</span>
                  </div>
                  <p className="text-lg font-bold">{detail.memberCount.toLocaleString()}</p>
                </div>
                <div className="bg-secondary/50 rounded-xl p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Globe className="w-3.5 h-3.5" />
                    <span className="text-[11px] font-medium uppercase tracking-wider">{t("home.access")}</span>
                  </div>
                  <p className="text-lg font-bold">{detail.publicEntryAllowed === true ? t("home.public") : detail.publicEntryAllowed === false ? t("home.private") : t("home.unknown")}</p>
                </div>
              </div>

              {detail.owner && (
                <div className="flex items-center gap-3 bg-secondary/50 rounded-xl p-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-muted border border-border shrink-0">
                    {detail.owner.avatar ? (
                      <img src={detail.owner.avatar} alt={detail.owner.displayName} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs font-bold text-muted-foreground">
                        {detail.owner.displayName.substring(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Crown className="w-3 h-3 text-amber-500" />
                      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{t("home.owner")}</span>
                    </div>
                    <p className="text-sm font-semibold truncate">{detail.owner.displayName}</p>
                  </div>
                </div>
              )}

              {detail.created && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{t("home.created")} {new Date(detail.created).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</span>
                </div>
              )}

              <Button
                className="w-full h-11 rounded-xl font-bold gap-2"
                onClick={() => window.open(`https://www.roblox.com/groups/${detail.groupId}`, "_blank")}
              >
                <ExternalLink className="w-4 h-4" />
                {t("home.openRoblox")}
              </Button>
            </div>
          </>
        ) : (
          <div className="p-12 text-center text-muted-foreground">
            <p>{t("home.failedLoad")}</p>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

export default function Home() {
  const { t } = useLanguage();
  const [groups, setGroups] = useState<FeaturedGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<number | null>(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}api/featured-groups`, { credentials: "include" })
      .then(r => r.json())
      .then(data => setGroups(data.groups ?? []))
      .catch(() => setGroups([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-8 lg:p-12 w-full max-w-6xl mx-auto space-y-14">

      <AnimatePresence>
        {selectedGroup !== null && (
          <GroupModal groupId={selectedGroup} onClose={() => setSelectedGroup(null)} />
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center text-center pt-6 space-y-5"
      >
        <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Limited.Ink" className="w-20 h-20 rounded-3xl shadow-2xl shadow-black/20 object-contain" />
        <div className="space-y-2 max-w-lg">
          <h1 className="text-4xl font-display font-bold text-foreground tracking-tight">
            {t("home.welcome")} <span className="underline decoration-2 underline-offset-4 decoration-black/30">Limited.Ink</span>
          </h1>
          <p className="text-muted-foreground text-lg leading-relaxed">
            {t("home.subtitle")}
          </p>
        </div>

        <div className="flex items-center gap-6 pt-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5"><LayoutDashboard className="w-4 h-4" /> {t("home.groupMgmt")}</span>
          <span className="flex items-center gap-1.5"><Search className="w-4 h-4" /> {t("home.catalogBrowser")}</span>
          <span className="flex items-center gap-1.5"><TrendingUp className="w-4 h-4" /> {t("home.salesAnalytics")}</span>
        </div>
      </motion.div>

      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-black text-white rounded-lg flex items-center justify-center">
            <Star className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">{t("home.featured")}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t("home.featured.desc")}</p>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="rounded-2xl border border-border shadow-none animate-pulse">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl bg-muted shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-3/4" />
                    <div className="h-3 bg-muted rounded w-1/2" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : groups.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {groups.map((group, i) => (
              <motion.div
                key={group.groupId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Card
                  className="rounded-2xl border border-border shadow-none hover:border-foreground/20 hover:shadow-md transition-all cursor-pointer"
                  onClick={() => setSelectedGroup(group.groupId)}
                >
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="w-14 h-14 rounded-xl overflow-hidden bg-muted border border-border shrink-0">
                      {group.thumbnailUrl ? (
                        <img
                          src={group.thumbnailUrl}
                          alt={group.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-sm font-bold text-muted-foreground">
                          {group.name.substring(0, 2).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground truncate">{group.name}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Users className="w-3 h-3" />
                        {group.memberCount.toLocaleString()} {t("nav.members")}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        ) : (
          <Card className="rounded-2xl border border-dashed border-border shadow-none">
            <CardContent className="py-16 flex flex-col items-center text-center text-muted-foreground/60 gap-3">
              <Star className="w-10 h-10 opacity-30" strokeWidth={1} />
              <p className="font-medium text-sm">{t("home.noFeatured")}</p>
              <p className="text-xs max-w-xs">{t("home.noFeatured.desc")}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
