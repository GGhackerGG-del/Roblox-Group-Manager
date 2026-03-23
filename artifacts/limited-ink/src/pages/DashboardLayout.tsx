import { ReactNode, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { LogOut, Users, Key, Loader2, Sparkles, UserCircle, Settings, MessageSquare, Bot, Search, Crosshair, Cog, ShieldCheck, Megaphone, Gamepad2, Share2, Receipt } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useGetRobloxGroups, getAuthCredentials } from "@workspace/api-client-react";

import { playHover, playClick } from "@/hooks/useSounds";
import { usePageCache } from "@/contexts/PageCacheContext";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface NavItemProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  badge?: string;
}

function NavItem({ href, icon, label, isActive, badge }: NavItemProps) {
  return (
    <Link href={href}>
      <div
        onMouseEnter={playHover}
        onClick={playClick}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all cursor-pointer ${isActive ? "bg-black text-white shadow-md shadow-black/10 font-medium" : "text-muted-foreground hover:bg-secondary hover:text-foreground font-medium"}`}
      >
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isActive ? "bg-white/15" : "bg-secondary/70 border border-border"}`}>
          {icon}
        </div>
        <span className="text-sm flex-1">{label}</span>
        {badge && (
          <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md ${isActive ? "bg-white/20 text-white" : "bg-violet-500/10 text-violet-500"}`}>
            {badge}
          </span>
        )}
      </div>
    </Link>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { profile, logoutRoblox, logoutLicense, licenseDetails } = useAuth();
  const { t } = useLanguage();
  const cache = usePageCache();
  const prefetchedRef = useRef<Set<string>>(new Set());

  const { data: groupsData, isLoading: isLoadingGroups } = useGetRobloxGroups();

  useEffect(() => {
    if (!groupsData?.groups?.length) return;
    const { token, fingerprint } = getAuthCredentials();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (fingerprint) headers["X-Device-Fingerprint"] = fingerprint;

    const prefetchPnL = async (groupId: string) => {
      if (prefetchedRef.current.has(`pnl_${groupId}`)) return;
      if (cache.get(`pnl_${groupId}`)) return;
      prefetchedRef.current.add(`pnl_${groupId}`);
      try {
        const resp = await fetch(`${BASE}/api/pnl/group/${groupId}`, { credentials: "include", headers });
        if (resp.ok) {
          const data = await resp.json();
          cache.set(`pnl_${groupId}`, data);
        }
      } catch {}
    };

    const groups = groupsData.groups.slice(0, 5);
    groups.forEach((g, i) => {
      setTimeout(() => prefetchPnL(String(g.id)), i * 400);
    });
  }, [groupsData?.groups?.length]);

  return (
    <div className="flex h-screen w-full bg-secondary/30 overflow-hidden">
      <div className="w-72 bg-card border-r border-border/60 flex flex-col shadow-2xl shadow-black/5 z-20">
        <div className="p-5 border-b border-border/50">
          <Link href="/" className="flex items-center gap-3 group">
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Limited.Ink" className="w-9 h-9 rounded-xl shadow-md shadow-black/10 group-hover:scale-105 transition-transform duration-300 object-contain" />
            <span className="font-display font-bold text-xl tracking-tight">Limited.Ink</span>
          </Link>
        </div>

        <div className="px-4 pt-4 space-y-1">
          <NavItem href="/profile" icon={<UserCircle className="w-4 h-4" />} label={t("nav.profile")} isActive={location === "/profile"} />
          <NavItem href="/community" icon={<MessageSquare className="w-4 h-4" />} label={t("nav.community")} isActive={location === "/community"} />
        </div>

        <div className="px-4 pt-3 space-y-1">
          <h3 className="px-2 text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
            <Sparkles className="w-3 h-3" /> {t("nav.tools")}
          </h3>
          <NavItem href="/assistant" icon={<Bot className="w-4 h-4" />} label={t("nav.assistant")} isActive={location === "/assistant"} badge="AI" />
          <NavItem href="/competitors" icon={<Search className="w-4 h-4" />} label={t("nav.competitors")} isActive={location === "/competitors"} />
          <NavItem href="/sniper" icon={<Crosshair className="w-4 h-4" />} label={t("nav.sniper")} isActive={location === "/sniper"} />
          <NavItem href="/automation" icon={<Cog className="w-4 h-4" />} label="Автоматизация" isActive={location === "/automation"} badge="BOT" />
          <NavItem href="/ai-tools" icon={<Sparkles className="w-4 h-4" />} label="AI Инструменты" isActive={location === "/ai-tools"} badge="NEW" />
          <NavItem href="/security" icon={<ShieldCheck className="w-4 h-4" />} label="Безопасность" isActive={location === "/security"} />
          <NavItem href="/marketing" icon={<Megaphone className="w-4 h-4" />} label="Маркетинг" isActive={location === "/marketing"} />
          <NavItem href="/game-manager" icon={<Gamepad2 className="w-4 h-4" />} label="Game Manager" isActive={location === "/game-manager"} badge="NEW" />
          <NavItem href="/social-media" icon={<Share2 className="w-4 h-4" />} label="Social Media" isActive={location === "/social-media"} badge="NEW" />
          <NavItem href="/finance" icon={<Receipt className="w-4 h-4" />} label="Finance" isActive={location === "/finance"} badge="NEW" />
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1 custom-scrollbar">
          <h3 className="px-2 text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 mt-3 flex items-center gap-2">
            <Users className="w-3.5 h-3.5" /> {t("nav.groups")}
          </h3>

          {isLoadingGroups ? (
            <div className="px-2 py-4 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : groupsData?.groups && groupsData.groups.length > 0 ? (
            <ul className="space-y-1">
              {groupsData.groups.map(group => {
                const isActive = location === `/group/${group.id}`;
                return (
                  <li key={group.id}>
                    <Link href={`/group/${group.id}`}>
                      <div onMouseEnter={playHover} onClick={playClick} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all cursor-pointer ${isActive ? "bg-black text-white shadow-md shadow-black/10 font-medium" : "text-muted-foreground hover:bg-secondary hover:text-foreground font-medium"}`}>
                        <div className={`w-8 h-8 rounded-lg overflow-hidden flex-shrink-0 ${!isActive ? "bg-background border border-border" : "bg-white/10"}`}>
                          {group.thumbnailUrl ? (
                            <img src={group.thumbnailUrl} alt={group.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-muted text-xs font-bold">
                              {group.name.substring(0, 2).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="truncate text-sm block">{group.name}</span>
                          <span className={`text-[10px] ${isActive ? "text-white/60" : "text-muted-foreground/70"}`}>
                            {group.memberCount.toLocaleString()} {t("nav.members")}
                          </span>
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-2 text-sm text-muted-foreground py-2">{t("nav.noGroups")}</p>
          )}
        </div>

        <div className="p-4 border-t border-border/50 bg-card space-y-3">
          <Link href="/settings">
            <div onMouseEnter={playHover} onClick={playClick} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all cursor-pointer ${location === "/settings" ? "bg-black text-white" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${location === "/settings" ? "bg-white/15" : "bg-secondary/70 border border-border"}`}>
                <Settings className="w-3.5 h-3.5" />
              </div>
              <span className="text-sm font-medium">{t("nav.settings")}</span>
            </div>
          </Link>

          <div className="flex items-center gap-3 px-2">
            <Avatar className="w-10 h-10 border border-border shadow-sm">
              <AvatarImage src={profile?.avatarUrl || undefined} />
              <AvatarFallback className="bg-primary text-primary-foreground font-bold">
                {profile?.displayName?.charAt(0) || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground truncate">{profile?.displayName}</p>
              <p className="text-xs text-muted-foreground truncate">@{profile?.name}</p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="px-2 py-2 rounded-lg bg-secondary/50 border border-border/50 flex justify-between items-center">
              <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5" /> {t("nav.license")}
              </span>
              <span className="text-xs font-bold uppercase">{licenseDetails?.plan}</span>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={logoutRoblox} className="flex-1 text-xs font-semibold rounded-lg shadow-none">
                <LogOut className="w-3.5 h-3.5 mr-1.5" /> {t("nav.disconnect")}
              </Button>
              <Button variant="ghost" size="sm" onClick={logoutLicense} className="flex-1 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg">
                {t("nav.revoke")}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <main className="flex-1 relative overflow-hidden bg-background">
        <div className="w-full h-full overflow-y-auto custom-scrollbar">
          {children}
        </div>
      </main>
    </div>
  );
}
