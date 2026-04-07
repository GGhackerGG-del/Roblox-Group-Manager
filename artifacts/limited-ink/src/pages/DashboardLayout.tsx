import { ReactNode, useEffect, useRef, useState, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { robloxHeadshot } from "@/lib/roblox";
import { useLanguage } from "@/contexts/LanguageContext";
import { LogOut, Users, Key, Loader2, Sparkles, UserCircle, Settings, MessageSquare, Bot, Search, Crosshair, Cog, ShieldCheck, Megaphone, Gamepad2, Share2, Receipt, CalendarDays, Trophy, Plug, FlaskConical, Film } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useGetRobloxGroups, getAuthCredentials } from "@workspace/api-client-react";
import AvatarWithFrame from "@/components/AvatarWithFrame";

import { playHover, playClick } from "@/hooks/useSounds";
import { usePageCache } from "@/contexts/PageCacheContext";
import { PresenceProvider } from "@/contexts/PresenceContext";
import { VoiceCallProvider } from "@/contexts/VoiceCallContext";
import RobuxParticles from "@/components/RobuxParticles";
import { useTilt } from "@/hooks/useTilt";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const SECTION_MAP: Record<string, string> = {
  "/profile": "profile",
  "/community": "community",
  "/assistant": "assistant",

  "/sniper": "sniper",
  "/automation": "automation",
  "/ai-tools": "ai-tools",
  "/security": "security",
  "/marketing": "marketing",
  "/game-manager": "game-manager",
  "/social-media": "social-media",
  "/finance": "finance",
  "/content-planner": "content-planner",
  "/gamification": "gamification",
  "/integrations": "integrations",
  "/testing": "testing",
  "/shorts": "shorts",
  "/settings": "settings",
};

interface NavItemProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  badge?: string;
  unreadCount?: number;
}

function NavItem({ href, icon, label, isActive, badge, unreadCount }: NavItemProps) {
  return (
    <Link href={href}>
      <div
        onMouseEnter={playHover}
        onClick={playClick}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all cursor-pointer ${isActive ? "bg-black text-white shadow-md shadow-black/10 font-medium" : "text-muted-foreground hover:bg-secondary hover:text-foreground font-medium"}`}
      >
        <div className={`relative w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isActive ? "bg-white/15" : "bg-secondary/70 border border-border"}`}>
          {icon}
          {!!unreadCount && unreadCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 shadow-sm">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
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
  return (
    <PresenceProvider>
      <VoiceCallProvider>
        <DashboardLayoutInner>{children}</DashboardLayoutInner>
      </VoiceCallProvider>
    </PresenceProvider>
  );
}

function DashboardLayoutInner({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { profile, logoutRoblox, logoutLicense, licenseDetails } = useAuth();
  const { t } = useLanguage();
  const cache = usePageCache();
  const prefetchedRef = useRef<Set<string>>(new Set());
  const trackedSectionsRef = useRef<Set<string>>(new Set());
  const [unreadCount, setUnreadCount] = useState(0);
  const [myFrame, setMyFrame] = useState("none");

  const loadFrame = useCallback(() => {
    const { token, fingerprint } = getAuthCredentials();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (fingerprint) headers["X-Device-Fingerprint"] = fingerprint;
    fetch(`${BASE}/api/social/me`, { credentials: "include", headers })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.avatarFrame) setMyFrame(data.avatarFrame); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadFrame();
    const handler = () => loadFrame();
    window.addEventListener("avatar-frame-changed", handler);
    return () => window.removeEventListener("avatar-frame-changed", handler);
  }, [loadFrame]);

  const fetchUnread = useCallback(async () => {
    try {
      const { token, fingerprint } = getAuthCredentials();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      if (fingerprint) headers["X-Device-Fingerprint"] = fingerprint;
      const res = await fetch(`${BASE}/api/social/unread-count`, { credentials: "include", headers });
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.count || 0);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (location === "/community") return;
    fetchUnread();
    const iv = setInterval(fetchUnread, 15000);
    return () => clearInterval(iv);
  }, [fetchUnread, location]);

  useEffect(() => {
    const section = SECTION_MAP[location] || (location.startsWith("/group/") ? "groups" : null);
    if (!section) return;
    if (trackedSectionsRef.current.has(section)) return;
    const { token, fingerprint } = getAuthCredentials();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (fingerprint) headers["X-Device-Fingerprint"] = fingerprint;
    fetch(`${BASE}/api/gamification/visit`, {
      method: "POST",
      credentials: "include",
      headers,
      body: JSON.stringify({ section }),
    }).then(r => {
      if (r.ok) trackedSectionsRef.current.add(section);
    }).catch(() => {});
  }, [location]);

  const tiltRef = useTilt<HTMLDivElement>({ maxTilt: 1.5, perspective: 2000, scale: 1.0 });
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

        <div className="flex-1 overflow-y-auto px-4 pb-4 custom-scrollbar">
        <div className="pt-4 space-y-1">
          <NavItem href="/profile" icon={<UserCircle className="w-4 h-4" />} label={t("nav.profile")} isActive={location === "/profile"} />
          <NavItem href="/community" icon={<MessageSquare className="w-4 h-4" />} label={t("nav.community")} isActive={location === "/community"} unreadCount={unreadCount} />
        </div>

        <div className="pt-3 space-y-1">
          <h3 className="px-2 text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
            <Sparkles className="w-3 h-3" /> {t("nav.tools")}
          </h3>
          <NavItem href="/assistant" icon={<Bot className="w-4 h-4" />} label={t("nav.assistant")} isActive={location === "/assistant"} badge="AI" />

          <NavItem href="/sniper" icon={<Crosshair className="w-4 h-4" />} label={t("nav.sniper")} isActive={location === "/sniper"} />
          <NavItem href="/automation" icon={<Cog className="w-4 h-4" />} label={t("nav.automation")} isActive={location === "/automation"} badge="BOT" />
          <NavItem href="/ai-tools" icon={<Sparkles className="w-4 h-4" />} label={t("nav.aiTools")} isActive={location === "/ai-tools"} />
          <NavItem href="/security" icon={<ShieldCheck className="w-4 h-4" />} label={t("nav.security")} isActive={location === "/security"} />
          <NavItem href="/marketing" icon={<Megaphone className="w-4 h-4" />} label={t("nav.marketing")} isActive={location === "/marketing"} />
          <NavItem href="/game-manager" icon={<Gamepad2 className="w-4 h-4" />} label={t("nav.gameManager")} isActive={location === "/game-manager"} />
          <NavItem href="/social-media" icon={<Share2 className="w-4 h-4" />} label={t("nav.socialMedia")} isActive={location === "/social-media"} />
          <NavItem href="/finance" icon={<Receipt className="w-4 h-4" />} label={t("nav.finance")} isActive={location === "/finance"} />
          <NavItem href="/content-planner" icon={<CalendarDays className="w-4 h-4" />} label={t("nav.contentPlanner")} isActive={location === "/content-planner"} />
          <NavItem href="/gamification" icon={<Trophy className="w-4 h-4" />} label={t("nav.gamification")} isActive={location === "/gamification"} />
          <NavItem href="/integrations" icon={<Plug className="w-4 h-4" />} label={t("nav.integrations")} isActive={location === "/integrations"} />
          <NavItem href="/testing" icon={<FlaskConical className="w-4 h-4" />} label={t("nav.testing")} isActive={location === "/testing"} />
          <NavItem href="/shorts" icon={<Film className="w-4 h-4" />} label="Shorts" isActive={location === "/shorts"} />
        </div>

        <div className="space-y-1">
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
            <AvatarWithFrame
              src={profile?.avatarUrl || robloxHeadshot(profile?.id || 0)}
              fallbackText={profile?.displayName?.charAt(0) || "U"}
              frameId={myFrame}
              size="sm"
            />
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
        <RobuxParticles />
        <div ref={tiltRef} className="relative z-10 w-full h-full overflow-y-auto custom-scrollbar tilt-card">
          {children}
        </div>
      </main>
    </div>
  );
}
