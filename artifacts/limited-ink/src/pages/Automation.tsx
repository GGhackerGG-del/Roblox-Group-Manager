import React, { useState, useCallback, useEffect, useRef } from "react";
import { getAuthCredentials, useGetRobloxGroups } from "@workspace/api-client-react";
import { robloxHeadshot } from "@/lib/roblox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Cog, UserCheck, UserMinus, Users, Megaphone, Shield, MessageSquareX,
  Coins, Activity, Loader2, RefreshCw, ExternalLink, Trash2, Check,
  X, ChevronDown, Clock, Search, Plus, AlertTriangle, TrendingUp,
  TrendingDown, Calendar, Zap, ShieldCheck, KeyRound,
} from "lucide-react";
import { playClick, playSuccess, playError } from "@/hooks/useSounds";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function getAuthHeaders(): Record<string, string> {
  const { token, fingerprint } = getAuthCredentials();
  const h: Record<string, string> = {};
  if (token) h["Authorization"] = `Bearer ${token}`;
  if (fingerprint) h["X-Device-Fingerprint"] = fingerprint;
  return h;
}

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${url}`, {
    credentials: "include", ...opts,
    headers: { ...getAuthHeaders(), ...(opts?.headers || {}) },
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({ error: r.statusText })) as { error?: string };
    throw new Error(e.error || `HTTP ${r.status}`);
  }
  return r.json() as Promise<T>;
}

function timeAgo(dateStr: string | null, t: (k: string) => string): string {
  if (!dateStr) return t("common.unknown") || "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return t("common.justNow");
  if (m < 60) return `${m} ${t("common.minAgo")}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ${t("common.hAgo")}`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} ${t("common.dAgo")}`;
  const mo = Math.floor(d / 30);
  return `${mo} ${t("common.monthAgo")}`;
}

interface JoinRequest { requester: { userId: number; username: string; displayName: string }; created: string }
interface Role { id: number; name: string; rank: number; memberCount: number }
interface Member { user: { userId: number; username: string; displayName: string }; role: { id: number; name: string; rank: number }; lastOnline?: string | null }
interface WallPost { id: number; body: string; created: string; poster: { user: { userId: number; username: string; displayName: string } } | null }
interface ScheduledShout { id: string; groupId: string; message: string; scheduledAt: number; posted: boolean }
interface PayoutEntry { userId: number; username: string; amount: number }

export default function Automation() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [tab, setTab] = useState("join-requests");

  const { data: groupsData, isLoading: groupsLoading } = useGetRobloxGroups();
  const groups = groupsData?.groups || [];
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");

  useEffect(() => {
    if (groups.length > 0 && !selectedGroupId) {
      setSelectedGroupId(String(groups[0].id));
    }
  }, [groups, selectedGroupId]);

  const groupId = selectedGroupId;

  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [joinLoading, setJoinLoading] = useState(false);
  const [acceptingAll, setAcceptingAll] = useState(false);
  const [decliningId, setDecliningId] = useState<number | null>(null);

  const [roles, setRoles] = useState<Role[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberSearchResults, setMemberSearchResults] = useState<Member[]>([]);
  const [memberSearchLoading, setMemberSearchLoading] = useState(false);
  const [rankingId, setRankingId] = useState<number | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");

  const [exileSearch, setExileSearch] = useState("");
  const [exileResults, setExileResults] = useState<Member[]>([]);
  const [exileLoading, setExileLoading] = useState(false);
  const [exilingId, setExilingId] = useState<number | null>(null);
  const [exileRoleFilter, setExileRoleFilter] = useState<string>("");

  const [currentShout, setCurrentShout] = useState<{ body: string; poster: { username: string }; updated: string } | null>(null);
  const [shoutLoading, setShoutLoading] = useState(false);
  const [shoutMessage, setShoutMessage] = useState("");
  const [posting, setPosting] = useState(false);
  const [scheduledShouts, setScheduledShouts] = useState<ScheduledShout[]>([]);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [scheduling, setScheduling] = useState(false);

  const [wallPosts, setWallPosts] = useState<WallPost[]>([]);
  const [wallLoading, setWallLoading] = useState(false);
  const [deletingPostId, setDeletingPostId] = useState<number | null>(null);
  const [wallNextCursor, setWallNextCursor] = useState<string | undefined>();

  const [spamKeywords, setSpamKeywords] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState("");
  const [moderating, setModerating] = useState(false);
  const [lastModResult, setLastModResult] = useState<{ deleted: number; checked: number } | null>(null);

  const [payoutEntries, setPayoutEntries] = useState<PayoutEntry[]>([]);
  const [payoutUserSearch, setPayoutUserSearch] = useState("");
  const [payoutSearchResults, setPayoutSearchResults] = useState<Member[]>([]);
  const [payoutSearchLoading, setPayoutSearchLoading] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState("100");
  const [sendingPayout, setSendingPayout] = useState(false);
  const [twoFA, setTwoFA] = useState<{ open: boolean; challengeId: string; mediaType: string; code: string; verifying: boolean }>({ open: false, challengeId: "", mediaType: "Authenticator", code: "", verifying: false });

  const [activityMembers, setActivityMembers] = useState<Member[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityRoleFilter, setActivityRoleFilter] = useState<string>("");
  const [activityNextCursor, setActivityNextCursor] = useState<string | undefined>();

  const loadRoles = useCallback(async () => {
    if (!groupId) return;
    setRolesLoading(true);
    try {
      const data = await apiFetch<{ roles: Role[] }>(`/api/automation/roles/${groupId}`);
      setRoles(data.roles || []);
    } catch (e: unknown) {
      toast({ title: t("common.error"), description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally { setRolesLoading(false); }
  }, [groupId, toast, t]);

  const loadJoinRequests = useCallback(async () => {
    if (!groupId) return;
    setJoinLoading(true);
    try {
      const data = await apiFetch<{ requests: JoinRequest[] }>(`/api/automation/join-requests/${groupId}`);
      setJoinRequests(data.requests || []);
    } catch (e: unknown) {
      toast({ title: t("common.error"), description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally { setJoinLoading(false); }
  }, [groupId, toast, t]);

  const acceptAll = async () => {
    if (!joinRequests.length) return;
    setAcceptingAll(true);
    try {
      const data = await apiFetch<{ accepted: number; message: string }>(`/api/automation/join-requests/${groupId}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: joinRequests.map(r => r.requester.userId) }),
      });
      playSuccess();
      toast({ title: "✅", description: data.message });
      setJoinRequests([]);
    } catch (e: unknown) {
      playError();
      toast({ title: t("common.error"), description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally { setAcceptingAll(false); }
  };

  const declineRequest = async (userId: number) => {
    setDecliningId(userId);
    try {
      await apiFetch(`/api/automation/join-requests/${groupId}/${userId}`, { method: "DELETE" });
      setJoinRequests(prev => prev.filter(r => r.requester.userId !== userId));
      toast({ title: "✅" });
    } catch (e: unknown) {
      toast({ title: t("common.error"), description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally { setDecliningId(null); }
  };

  const searchMembers = useCallback(async (q: string, forExile = false) => {
    if (!q.trim() || !groupId) return;
    if (forExile) setExileLoading(true); else setMemberSearchLoading(true);
    try {
      const params = new URLSearchParams({ username: q.trim() });
      const data = await apiFetch<{ members: Member[] }>(`/api/automation/search-member/${groupId}?${params}`);
      const results = data.members || [];
      if (forExile) setExileResults(results.slice(0, 10));
      else setMemberSearchResults(results.slice(0, 10));
      if (results.length === 0) {
        toast({ title: t("common.error"), description: t("auto.notInGroup"), variant: "destructive" });
      }
    } catch (e) {
      toast({ title: t("common.error"), description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
    finally {
      if (forExile) setExileLoading(false); else setMemberSearchLoading(false);
    }
  }, [groupId, t]);

  const changeRank = async (userId: number, roleId: number) => {
    setRankingId(userId);
    try {
      const data = await apiFetch<{ message: string }>(`/api/automation/rank/${groupId}/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId }),
      });
      playSuccess();
      toast({ title: "✅", description: data.message });
      setMemberSearchResults(prev => prev.map(m => m.user.userId === userId ? { ...m, role: { ...m.role, id: roleId } } : m));
    } catch (e: unknown) {
      playError();
      toast({ title: t("common.error"), description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally { setRankingId(null); }
  };

  const exileMember = async (userId: number, username: string) => {
    if (!confirm(`${t("auto.exile")} ${username}?`)) return;
    setExilingId(userId);
    try {
      const data = await apiFetch<{ message: string }>(`/api/automation/exile/${groupId}/${userId}`, { method: "DELETE" });
      playSuccess();
      toast({ title: "✅", description: data.message });
      setExileResults(prev => prev.filter(m => m.user.userId !== userId));
    } catch (e: unknown) {
      playError();
      toast({ title: t("common.error"), description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally { setExilingId(null); }
  };

  const loadShout = useCallback(async () => {
    if (!groupId) return;
    setShoutLoading(true);
    try {
      const data = await apiFetch<{ shout: typeof currentShout; scheduled: ScheduledShout[] }>(`/api/automation/shout/${groupId}`);
      setCurrentShout(data.shout);
      setScheduledShouts(data.scheduled || []);
    } catch (e: unknown) {
      toast({ title: t("common.error"), description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally { setShoutLoading(false); }
  }, [groupId, toast, t]);

  const postShout = async () => {
    if (!shoutMessage.trim() && shoutMessage !== "") return;
    setPosting(true);
    try {
      await apiFetch(`/api/automation/shout/${groupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: shoutMessage }),
      });
      playSuccess();
      toast({ title: "✅" });
      setShoutMessage("");
      loadShout();
    } catch (e: unknown) {
      playError();
      toast({ title: t("common.error"), description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally { setPosting(false); }
  };

  const scheduleShout = async () => {
    if (!shoutMessage.trim() || !scheduleDate || !scheduleTime) return;
    const scheduledAt = new Date(`${scheduleDate}T${scheduleTime}`).getTime();
    if (scheduledAt <= Date.now()) { toast({ title: t("common.error"), description: t("auto.timeMustBeFuture"), variant: "destructive" }); return; }
    setScheduling(true);
    try {
      await apiFetch(`/api/automation/shout/${groupId}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: shoutMessage, scheduledAt }),
      });
      playSuccess();
      toast({ title: "✅" });
      setShoutMessage("");
      setScheduleDate("");
      setScheduleTime("");
      loadShout();
    } catch (e: unknown) {
      playError();
      toast({ title: t("common.error"), description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally { setScheduling(false); }
  };

  const cancelScheduledShout = async (id: string) => {
    try {
      await apiFetch(`/api/automation/shout/scheduled/${id}`, { method: "DELETE" });
      setScheduledShouts(prev => prev.filter(s => s.id !== id));
      toast({ title: "✅" });
    } catch { }
  };

  const loadWall = useCallback(async (cursor?: string) => {
    if (!groupId) return;
    setWallLoading(true);
    try {
      const params = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      const data = await apiFetch<{ posts: WallPost[]; nextPageCursor?: string }>(`/api/automation/wall/${groupId}${params}`);
      if (cursor) setWallPosts(prev => [...prev, ...(data.posts || [])]);
      else setWallPosts(data.posts || []);
      setWallNextCursor(data.nextPageCursor);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const is429 = msg.includes("429") || msg.includes("rate");
      toast({ title: t("common.error"), description: is429 ? t("auto.rateLimited") : msg, variant: "destructive" });
    } finally { setWallLoading(false); }
  }, [groupId, toast, t]);

  const deletePost = async (postId: number) => {
    setDeletingPostId(postId);
    try {
      await apiFetch(`/api/automation/wall/${groupId}/${postId}`, { method: "DELETE" });
      setWallPosts(prev => prev.filter(p => p.id !== postId));
    } catch (e: unknown) {
      toast({ title: t("common.error"), description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally { setDeletingPostId(null); }
  };

  const runSpamFilter = async () => {
    if (!spamKeywords.length) return;
    setModerating(true);
    try {
      const data = await apiFetch<{ deleted: number; checked: number; message: string }>(`/api/automation/wall/${groupId}/moderate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords: spamKeywords }),
      });
      playSuccess();
      setLastModResult({ deleted: data.deleted, checked: data.checked });
      toast({ title: `✅ ${t("auto.modDone")}`, description: data.message });
    } catch (e: unknown) {
      playError();
      toast({ title: t("common.error"), description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally { setModerating(false); }
  };

  const searchPayoutUser = useCallback(async (q: string) => {
    if (!q.trim() || !groupId) return;
    setPayoutSearchLoading(true);
    try {
      const data = await apiFetch<{ members: Member[] }>(`/api/automation/members/${groupId}?limit=50`);
      const filtered = (data.members || []).filter(m =>
        m.user.username.toLowerCase().includes(q.toLowerCase()) ||
        m.user.displayName.toLowerCase().includes(q.toLowerCase())
      ).slice(0, 8);
      setPayoutSearchResults(filtered);
    } catch { }
    finally { setPayoutSearchLoading(false); }
  }, [groupId]);

  const sendPayout = async (challengeId?: string, verificationToken?: string) => {
    if (!payoutEntries.length) return;
    setSendingPayout(true);
    try {
      const reqBody: any = { payouts: payoutEntries.map(p => ({ recipientId: p.userId, amount: p.amount })) };
      if (challengeId && verificationToken) {
        reqBody.challengeId = challengeId;
        reqBody.verificationToken = verificationToken;
      }
      const resp = await fetch(`${BASE}/api/automation/payout/${groupId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify(reqBody),
      });
      const data = await resp.json();
      if (!resp.ok) {
        if (data.requires2FA) {
          setTwoFA({ open: true, challengeId: data.challengeId, mediaType: data.mediaType || "Authenticator", code: "", verifying: false });
          return;
        }
        throw new Error(data.error || "Failed to send payout");
      }
      playSuccess();
      toast({ title: "✅", description: data.message });
      setPayoutEntries([]);
      setTwoFA({ open: false, challengeId: "", mediaType: "Authenticator", code: "", verifying: false });
    } catch (e: unknown) {
      playError();
      toast({ title: t("common.error"), description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally { setSendingPayout(false); }
  };

  const verify2FA = async () => {
    if (!twoFA.code || !twoFA.challengeId) return;
    setTwoFA(p => ({ ...p, verifying: true }));
    try {
      const resp = await fetch(`${BASE}/api/automation/payout/${groupId}/verify-2fa`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ challengeId: twoFA.challengeId, code: twoFA.code, mediaType: twoFA.mediaType }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Invalid 2FA code");
      setTwoFA(p => ({ ...p, open: false }));
      await sendPayout(twoFA.challengeId, data.verificationToken);
    } catch (e: unknown) {
      playError();
      toast({ title: t("common.error"), description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally { setTwoFA(p => ({ ...p, verifying: false })); }
  };

  const loadActivity = useCallback(async (cursor?: string) => {
    if (!groupId) return;
    setActivityLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (activityRoleFilter) params.set("roleId", activityRoleFilter);
      if (cursor) params.set("cursor", cursor);
      const data = await apiFetch<{ members: Member[]; nextPageCursor?: string }>(`/api/automation/activity/${groupId}?${params}`);
      if (cursor) setActivityMembers(prev => [...prev, ...(data.members || [])]);
      else setActivityMembers(data.members || []);
      setActivityNextCursor(data.nextPageCursor);
    } catch (e: unknown) {
      toast({ title: t("common.error"), description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally { setActivityLoading(false); }
  }, [groupId, activityRoleFilter, toast, t]);

  const prevGroupIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!groupId) return;
    if (prevGroupIdRef.current !== groupId) {
      prevGroupIdRef.current = groupId;
      setJoinRequests([]); setWallPosts([]); setMemberSearchResults([]); setExileResults([]);
      setCurrentShout(null); setScheduledShouts([]); setActivityMembers([]); setRoles([]);
    }
    if (tab === "join-requests") loadJoinRequests();
    else if (tab === "auto-rank" || tab === "auto-exile" || tab === "payout") loadRoles();
    else if (tab === "shout") loadShout();
    else if (tab === "wall" || tab === "spam") loadWall();
    else if (tab === "activity") { loadRoles(); loadActivity(); }
  }, [groupId, tab]);

  const GroupSelector = (
    <div className="flex items-center gap-3 rounded-xl border border-border/50 p-3 bg-card mb-5">
      <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
        <Users className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground font-medium mb-1">{t("common.group") || "Group"}</p>
        {groupsLoading ? (
          <Skeleton className="h-5 w-40" />
        ) : (
          <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
            <SelectTrigger className="h-8 text-sm border-0 p-0 shadow-none focus:ring-0 bg-transparent font-semibold">
              <SelectValue placeholder={t("common.selectGroup")} />
            </SelectTrigger>
            <SelectContent>
              {groups.map(g => (
                <SelectItem key={g.id} value={String(g.id)}>
                  <div className="flex items-center gap-2">
                    {g.thumbnailUrl && <img src={g.thumbnailUrl} alt="" className="w-5 h-5 rounded object-cover" />}
                    <span>{g.name}</span>
                    <span className="text-xs text-muted-foreground">({g.memberCount.toLocaleString()})</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      {selectedGroupId && (
        <a href={`https://www.roblox.com/groups/${selectedGroupId}`} target="_blank" rel="noreferrer">
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 shrink-0"><ExternalLink className="w-3.5 h-3.5" /></Button>
        </a>
      )}
    </div>
  );

  const tabs = [
    { id: "join-requests", icon: <UserCheck className="w-3.5 h-3.5" />, label: t("auto.joinRequests") },
    { id: "auto-rank", icon: <TrendingUp className="w-3.5 h-3.5" />, label: t("auto.autoRank") },
    { id: "auto-exile", icon: <UserMinus className="w-3.5 h-3.5" />, label: t("auto.autoExile") },
    { id: "shout", icon: <Megaphone className="w-3.5 h-3.5" />, label: t("auto.shout") },
    { id: "wall", icon: <Shield className="w-3.5 h-3.5" />, label: t("auto.wall") },
    { id: "spam", icon: <MessageSquareX className="w-3.5 h-3.5" />, label: t("auto.spam") },
    { id: "payout", icon: <Coins className="w-3.5 h-3.5" />, label: t("auto.payout") },
    { id: "activity", icon: <Activity className="w-3.5 h-3.5" />, label: t("auto.activity") },
  ];

  return (
    <div className="p-4 lg:p-8 w-full max-w-5xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Cog className="w-7 h-7 text-foreground" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("auto.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("auto.desc")}</p>
        </div>
      </div>

      {GroupSelector}

      {!selectedGroupId ? (
        <div className="flex flex-col items-center py-20 text-muted-foreground gap-3">
          <Cog className="w-12 h-12 opacity-20" />
          <p className="text-sm">{t("auto.selectGroup")}</p>
        </div>
      ) : (
        <Tabs value={tab} onValueChange={v => { playClick(); setTab(v); }}>
          <div className="overflow-x-auto pb-1">
            <TabsList className="rounded-xl bg-secondary/50 border border-border p-1 h-auto gap-1 flex-nowrap inline-flex">
              {tabs.map(tb => (
                <TabsTrigger key={tb.id} value={tb.id} className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-3 py-2 gap-1.5 whitespace-nowrap">
                  {tb.icon} {tb.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="join-requests" className="mt-4">
            <Card className="rounded-2xl border-border/50">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="text-base flex items-center gap-2"><UserCheck className="w-4 h-4 text-green-500" /> {t("auto.joinRequests")}</CardTitle>
                  <CardDescription>{t("auto.joinDesc")}</CardDescription>
                </div>
                <div className="flex gap-2">
                  {joinRequests.length > 0 && (
                    <Button size="sm" className="rounded-xl gap-1.5 bg-green-600 hover:bg-green-700" onClick={acceptAll} disabled={acceptingAll}>
                      {acceptingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      {t("auto.acceptAll")} ({joinRequests.length})
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="rounded-xl gap-1.5" onClick={loadJoinRequests} disabled={joinLoading}>
                    <RefreshCw className={`w-3.5 h-3.5 ${joinLoading ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {joinLoading ? (
                  <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
                ) : joinRequests.length === 0 ? (
                  <div className="flex flex-col items-center py-10 text-muted-foreground gap-2">
                    <UserCheck className="w-10 h-10 opacity-20" />
                    <p className="text-sm">{t("auto.noRequests")}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {joinRequests.map(req => (
                      <div key={req.requester.userId} className="flex items-center gap-3 rounded-xl border border-border/50 p-3">
                        <img src={robloxHeadshot(req.requester.userId)} alt={req.requester.displayName} className="w-10 h-10 rounded-full bg-secondary shrink-0 object-cover" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{req.requester.displayName}</p>
                          <p className="text-xs text-muted-foreground">@{req.requester.username} • {timeAgo(req.created, t)}</p>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <a href={`https://www.roblox.com/users/${req.requester.userId}/profile`} target="_blank" rel="noreferrer">
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0"><ExternalLink className="w-3.5 h-3.5" /></Button>
                          </a>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500 hover:bg-red-500/10" onClick={() => declineRequest(req.requester.userId)} disabled={decliningId === req.requester.userId}>
                            {decliningId === req.requester.userId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="auto-rank" className="mt-4">
            <Card className="rounded-2xl border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="w-4 h-4 text-blue-500" /> {t("auto.autoRank")}</CardTitle>
                <CardDescription>{t("auto.autoRankDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder={t("auto.memberName")}
                    value={memberSearch}
                    onChange={e => setMemberSearch(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && searchMembers(memberSearch)}
                    className="rounded-xl"
                  />
                  <Button onClick={() => searchMembers(memberSearch)} disabled={memberSearchLoading} className="rounded-xl gap-1.5">
                    {memberSearchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </Button>
                </div>

                {rolesLoading ? <Skeleton className="h-8 w-full" /> : roles.length === 0 ? (
                  <Button variant="outline" size="sm" className="rounded-xl" onClick={loadRoles}>{t("common.refresh")}</Button>
                ) : null}

                {memberSearchResults.length > 0 && (
                  <div className="space-y-2">
                    {memberSearchResults.map(member => (
                      <div key={member.user.userId} className="flex items-center gap-3 rounded-xl border border-border/50 p-3">
                        <img src={robloxHeadshot(member.user.userId)} alt={member.user.displayName} className="w-9 h-9 rounded-full bg-secondary shrink-0 object-cover" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{member.user.displayName}</p>
                          <p className="text-xs text-muted-foreground">@{member.user.username} • {member.role.name}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
                            <SelectTrigger className="w-36 h-8 text-xs rounded-lg">
                              <SelectValue placeholder={t("auto.selectRank")} />
                            </SelectTrigger>
                            <SelectContent>
                              {roles.filter(r => r.rank > 0).map(r => (
                                <SelectItem key={r.id} value={String(r.id)}>
                                  [{r.rank}] {r.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            className="rounded-lg h-8"
                            disabled={!selectedRoleId || rankingId === member.user.userId}
                            onClick={() => changeRank(member.user.userId, parseInt(selectedRoleId))}
                          >
                            {rankingId === member.user.userId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {roles.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("common.allRoles")}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {roles.filter(r => r.rank > 0).map(r => (
                        <div key={r.id} className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2 text-xs">
                          <span className="font-medium">[{r.rank}] {r.name}</span>
                          <Badge variant="outline" className="text-[9px]">{r.memberCount}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="auto-exile" className="mt-4">
            <Card className="rounded-2xl border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><UserMinus className="w-4 h-4 text-red-500" /> {t("auto.autoExile")}</CardTitle>
                <CardDescription>{t("auto.autoExileDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  {roles.length > 0 && (
                    <Select value={exileRoleFilter} onValueChange={v => setExileRoleFilter(v === "all" ? "" : v)}>
                      <SelectTrigger className="w-36 h-10 text-xs rounded-xl">
                        <SelectValue placeholder={t("common.allRoles")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t("common.allRoles")}</SelectItem>
                        {roles.filter(r => r.rank > 0).map(r => (
                          <SelectItem key={r.id} value={String(r.id)}>[{r.rank}] {r.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Input
                    placeholder={t("auto.memberName")}
                    value={exileSearch}
                    onChange={e => setExileSearch(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && searchMembers(exileSearch, true)}
                    className="rounded-xl flex-1"
                  />
                  <Button onClick={() => searchMembers(exileSearch, true)} disabled={exileLoading} className="rounded-xl gap-1.5">
                    {exileLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </Button>
                </div>

                {exileResults.length > 0 && (
                  <div className="space-y-2">
                    {exileResults.map(member => (
                      <div key={member.user.userId} className="flex items-center gap-3 rounded-xl border border-red-500/20 p-3 bg-red-500/5">
                        <img src={robloxHeadshot(member.user.userId)} alt={member.user.displayName} className="w-9 h-9 rounded-full bg-secondary shrink-0 object-cover" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{member.user.displayName}</p>
                          <p className="text-xs text-muted-foreground">@{member.user.username} • {member.role.name}</p>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <a href={`https://www.roblox.com/users/${member.user.userId}/profile`} target="_blank" rel="noreferrer">
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0"><ExternalLink className="w-3.5 h-3.5" /></Button>
                          </a>
                          <Button
                            size="sm"
                            className="rounded-lg h-8 gap-1 bg-red-600 hover:bg-red-700"
                            disabled={exilingId === member.user.userId}
                            onClick={() => exileMember(member.user.userId, member.user.username)}
                          >
                            {exilingId === member.user.userId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserMinus className="w-3.5 h-3.5" />}
                            {t("auto.exile")}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-700 dark:text-amber-300 flex gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p>{t("auto.exileWarning")}</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="shout" className="mt-4">
            <Card className="rounded-2xl border-border/50">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="text-base flex items-center gap-2"><Megaphone className="w-4 h-4 text-violet-500" /> {t("auto.shout")}</CardTitle>
                  <CardDescription>{t("auto.shoutDesc")}</CardDescription>
                </div>
                <Button size="sm" variant="outline" className="rounded-xl gap-1.5" onClick={loadShout} disabled={shoutLoading}>
                  <RefreshCw className={`w-3.5 h-3.5 ${shoutLoading ? "animate-spin" : ""}`} />
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {currentShout && (
                  <div className="rounded-xl border border-border/50 p-3 bg-card space-y-1.5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("auto.currentShout")}</p>
                    <p className="text-sm">{currentShout.body}</p>
                    <p className="text-xs text-muted-foreground">— {currentShout.poster?.username} • {timeAgo(currentShout.updated, t)}</p>
                  </div>
                )}

                <div className="space-y-3">
                  <Textarea
                    placeholder={t("auto.shoutPlaceholder")}
                    value={shoutMessage}
                    onChange={e => setShoutMessage(e.target.value.slice(0, 255))}
                    className="rounded-xl resize-none"
                    rows={3}
                  />
                  <div className="flex justify-between items-center text-xs text-muted-foreground">
                    <span>{shoutMessage.length}/255</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Button onClick={postShout} disabled={posting || !shoutMessage.trim()} className="rounded-xl gap-1.5">
                      {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                      {t("auto.publishNow")}
                    </Button>
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} className="rounded-xl text-xs h-9 flex-1" />
                        <Input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} className="rounded-xl text-xs h-9 w-24" />
                      </div>
                      <Button variant="outline" onClick={scheduleShout} disabled={scheduling || !shoutMessage.trim() || !scheduleDate || !scheduleTime} className="rounded-xl gap-1.5 w-full">
                        {scheduling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
                        {t("auto.schedule")}
                      </Button>
                    </div>
                  </div>
                </div>

                {scheduledShouts.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("auto.scheduled")} ({scheduledShouts.length})</p>
                    {scheduledShouts.map(shout => (
                      <div key={shout.id} className="flex items-start gap-3 rounded-xl border border-violet-500/20 p-3 bg-violet-500/5">
                        <Clock className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{shout.message}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {new Date(shout.scheduledAt).toLocaleString()}
                          </p>
                        </div>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 shrink-0" onClick={() => cancelScheduledShout(shout.id)}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="wall" className="mt-4">
            <Card className="rounded-2xl border-border/50">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="text-base flex items-center gap-2"><Shield className="w-4 h-4 text-blue-500" /> {t("auto.wall")}</CardTitle>
                  <CardDescription>{t("auto.wallDesc")}</CardDescription>
                </div>
                <Button size="sm" variant="outline" className="rounded-xl gap-1.5" onClick={() => loadWall()} disabled={wallLoading}>
                  <RefreshCw className={`w-3.5 h-3.5 ${wallLoading ? "animate-spin" : ""}`} /> {t("common.refresh")}
                </Button>
              </CardHeader>
              <CardContent>
                {wallLoading && wallPosts.length === 0 ? (
                  <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
                ) : wallPosts.length === 0 ? (
                  <div className="flex flex-col items-center py-10 text-muted-foreground gap-2">
                    <Shield className="w-10 h-10 opacity-20" />
                    <p className="text-sm">{t("auto.wallEmpty")}</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                    {wallPosts.map(post => (
                      <div key={post.id} className="flex items-start gap-3 rounded-xl border border-border/50 p-3">
                        {post.poster ? (
                          <img src={robloxHeadshot(post.poster.user.userId)} alt={post.poster.user.displayName} className="w-8 h-8 rounded-full bg-secondary shrink-0 object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-secondary shrink-0 flex items-center justify-center text-[10px] text-muted-foreground">?</div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-semibold">{post.poster?.user.displayName || t("auto.deletedUser")}</p>
                            <p className="text-[10px] text-muted-foreground">{timeAgo(post.created, t)}</p>
                          </div>
                          <p className="text-sm mt-0.5 break-words">{post.body}</p>
                        </div>
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 w-7 p-0 text-red-500 hover:bg-red-500/10 shrink-0"
                          onClick={() => deletePost(post.id)}
                          disabled={deletingPostId === post.id}
                        >
                          {deletingPostId === post.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </Button>
                      </div>
                    ))}
                    {wallNextCursor && (
                      <Button variant="outline" className="w-full rounded-xl" onClick={() => loadWall(wallNextCursor)} disabled={wallLoading}>
                        {wallLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} {t("common.loadMore")}
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="spam" className="mt-4">
            <Card className="rounded-2xl border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><MessageSquareX className="w-4 h-4 text-orange-500" /> {t("auto.spam")}</CardTitle>
                <CardDescription>{t("auto.spamDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder={t("auto.addKeyword")}
                    value={newKeyword}
                    onChange={e => setNewKeyword(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && newKeyword.trim()) {
                        setSpamKeywords(prev => [...new Set([...prev, newKeyword.trim().toLowerCase()])]);
                        setNewKeyword("");
                      }
                    }}
                    className="rounded-xl"
                  />
                  <Button variant="outline" className="rounded-xl gap-1.5" onClick={() => {
                    if (newKeyword.trim()) {
                      setSpamKeywords(prev => [...new Set([...prev, newKeyword.trim().toLowerCase()])]);
                      setNewKeyword("");
                    }
                  }}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>

                {spamKeywords.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {spamKeywords.map(kw => (
                      <Badge key={kw} variant="secondary" className="gap-1.5 py-1 pl-3 pr-2">
                        {kw}
                        <button onClick={() => setSpamKeywords(prev => prev.filter(k => k !== kw))} className="hover:text-red-500 transition-colors">
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}

                {lastModResult && (
                  <div className="rounded-xl bg-green-500/10 border border-green-500/20 p-3 text-sm">
                    <p className="font-semibold text-green-700 dark:text-green-300">✅ {t("auto.modDone")}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t("auto.modResult").replace("{d}", String(lastModResult.deleted)).replace("{c}", String(lastModResult.checked))}</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button
                    className="flex-1 rounded-xl gap-1.5 bg-orange-600 hover:bg-orange-700"
                    disabled={moderating || !spamKeywords.length}
                    onClick={runSpamFilter}
                  >
                    {moderating ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquareX className="w-4 h-4" />}
                    {t("auto.runFilter")}
                  </Button>
                  <Button variant="outline" size="sm" className="rounded-xl" onClick={() => { setSpamKeywords([]); setLastModResult(null); }}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                <div className="rounded-xl bg-secondary/50 border border-border/50 p-3 text-xs text-muted-foreground space-y-1">
                  <p className="font-semibold text-foreground">{t("auto.howWorks")}</p>
                  <p>• {t("auto.howWorks1")}</p>
                  <p>• {t("auto.howWorks2")}</p>
                  <p>• {t("auto.howWorks3")}</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payout" className="mt-4">
            <Card className="rounded-2xl border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Coins className="w-4 h-4 text-amber-500" /> {t("auto.payout")}</CardTitle>
                <CardDescription>{t("auto.payoutDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder={t("auto.memberName")}
                    value={payoutUserSearch}
                    onChange={e => { setPayoutUserSearch(e.target.value); if (e.target.value.length >= 2) searchPayoutUser(e.target.value); else setPayoutSearchResults([]); }}
                    className="rounded-xl flex-1"
                  />
                  <Input
                    type="number"
                    placeholder={t("auto.amountRS")}
                    value={payoutAmount}
                    onChange={e => setPayoutAmount(e.target.value)}
                    className="rounded-xl w-24"
                  />
                  {payoutSearchLoading && <Loader2 className="w-4 h-4 animate-spin self-center" />}
                </div>

                {payoutSearchResults.length > 0 && (
                  <div className="rounded-xl border border-border/50 overflow-hidden">
                    {payoutSearchResults.map((m, i) => (
                      <button
                        key={m.user.userId}
                        className={`w-full flex items-center gap-3 p-2.5 text-left hover:bg-accent/50 transition-colors text-sm ${i > 0 ? "border-t border-border/50" : ""}`}
                        onClick={() => {
                          const amount = parseInt(payoutAmount) || 100;
                          setPayoutEntries(prev => prev.find(p => p.userId === m.user.userId) ? prev : [...prev, { userId: m.user.userId, username: m.user.username, amount }]);
                          setPayoutSearchResults([]);
                          setPayoutUserSearch("");
                        }}
                      >
                        <img src={robloxHeadshot(m.user.userId)} alt={m.user.displayName} className="w-8 h-8 rounded-full bg-secondary shrink-0 object-cover" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{m.user.displayName}</p>
                          <p className="text-xs text-muted-foreground">@{m.user.username} • {m.role.name}</p>
                        </div>
                        <Plus className="w-4 h-4 text-muted-foreground shrink-0" />
                      </button>
                    ))}
                  </div>
                )}

                {payoutEntries.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("common.recipients")}</p>
                    {payoutEntries.map(entry => (
                      <div key={entry.userId} className="flex items-center gap-3 rounded-xl border border-amber-500/20 p-3 bg-amber-500/5">
                        <img src={robloxHeadshot(entry.userId)} alt={entry.username} className="w-8 h-8 rounded-full bg-secondary shrink-0 object-cover" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold">@{entry.username}</p>
                        </div>
                        <Input
                          type="number"
                          value={entry.amount}
                          onChange={e => setPayoutEntries(prev => prev.map(p => p.userId === entry.userId ? { ...p, amount: parseInt(e.target.value) || 0 } : p))}
                          className="w-24 h-8 text-xs rounded-lg"
                        />
                        <span className="text-xs font-semibold">R$</span>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500" onClick={() => setPayoutEntries(prev => prev.filter(p => p.userId !== entry.userId))}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                    <div className="flex items-center justify-between rounded-xl bg-secondary/50 p-3 text-sm">
                      <span className="text-muted-foreground">{t("common.total")}:</span>
                      <span className="font-bold">{payoutEntries.reduce((s, p) => s + p.amount, 0).toLocaleString()} R$</span>
                    </div>
                    <Button className="w-full rounded-xl gap-1.5 bg-amber-600 hover:bg-amber-700" onClick={sendPayout} disabled={sendingPayout}>
                      {sendingPayout ? <Loader2 className="w-4 h-4 animate-spin" /> : <Coins className="w-4 h-4" />}
                      {t("auto.sendPayouts")} ({payoutEntries.length} {t("common.persons")})
                    </Button>
                  </div>
                )}

                <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-700 dark:text-amber-300 flex gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p>{t("auto.payoutWarning")}</p>
                </div>
              </CardContent>
            </Card>

            {twoFA.open && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setTwoFA(p => ({ ...p, open: false }))}>
                <div className="w-full max-w-sm mx-4 rounded-2xl border border-border bg-background p-6 shadow-2xl space-y-4" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                      <ShieldCheck className="w-5 h-5 text-amber-500" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm">{t("auto.2faTitle")}</h3>
                      <p className="text-xs text-muted-foreground">{twoFA.mediaType === "Email" ? t("auto.2faDescEmail") : twoFA.mediaType === "SMS" ? t("auto.2faDescSms") : t("auto.2faDesc")}</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <KeyRound className="w-4 h-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{t("auto.2faCodeLabel")}</span>
                    </div>
                    <Input
                      autoFocus
                      placeholder="000000"
                      value={twoFA.code}
                      onChange={e => setTwoFA(p => ({ ...p, code: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                      onKeyDown={e => { if (e.key === "Enter" && twoFA.code.length === 6) verify2FA(); }}
                      className="rounded-xl text-center text-lg tracking-[0.3em] font-mono"
                      maxLength={6}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setTwoFA(p => ({ ...p, open: false }))} disabled={twoFA.verifying}>
                      {t("common.cancel")}
                    </Button>
                    <Button className="flex-1 rounded-xl bg-amber-600 hover:bg-amber-700 gap-1.5" onClick={verify2FA} disabled={twoFA.code.length !== 6 || twoFA.verifying}>
                      {twoFA.verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                      {t("auto.2faVerify")}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="activity" className="mt-4">
            <Card className="rounded-2xl border-border/50">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="text-base flex items-center gap-2"><Activity className="w-4 h-4 text-green-500" /> {t("auto.activity")}</CardTitle>
                  <CardDescription>{t("auto.activityDesc")}</CardDescription>
                </div>
                <div className="flex gap-2">
                  {roles.length > 0 && (
                    <Select value={activityRoleFilter} onValueChange={v => { setActivityRoleFilter(v === "all" ? "" : v); setActivityMembers([]); }}>
                      <SelectTrigger className="w-32 h-8 text-xs rounded-xl">
                        <SelectValue placeholder={t("common.allRoles")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t("common.allRoles")}</SelectItem>
                        {roles.filter(r => r.rank > 0).map(r => (
                          <SelectItem key={r.id} value={String(r.id)}>[{r.rank}] {r.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Button size="sm" variant="outline" className="rounded-xl gap-1.5" onClick={() => { setActivityMembers([]); loadActivity(); }} disabled={activityLoading}>
                    <RefreshCw className={`w-3.5 h-3.5 ${activityLoading ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {activityLoading && activityMembers.length === 0 ? (
                  <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
                ) : activityMembers.length === 0 ? (
                  <div className="flex flex-col items-center py-10 text-muted-foreground gap-2">
                    <Activity className="w-10 h-10 opacity-20" />
                    <p className="text-sm">{t("auto.pressRefresh")}</p>
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-[550px] overflow-y-auto pr-1">
                    {activityMembers.map(member => {
                      const lastOnline = member.lastOnline;
                      const diff = lastOnline ? Date.now() - new Date(lastOnline).getTime() : null;
                      const days = diff ? Math.floor(diff / 86400000) : null;
                      const isActive = diff !== null && diff < 7 * 86400000;
                      const isInactive = days !== null && days > 30;
                      return (
                        <div key={member.user.userId} className="flex items-center gap-3 rounded-xl border border-border/50 p-2.5">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${isActive ? "bg-green-500" : isInactive ? "bg-red-500" : "bg-amber-500"}`} />
                          <img src={robloxHeadshot(member.user.userId)} alt={member.user.displayName} className="w-8 h-8 rounded-full bg-secondary shrink-0 object-cover" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{member.user.displayName}</p>
                            <p className="text-xs text-muted-foreground">@{member.user.username}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <Badge variant="outline" className="text-[9px] mb-0.5">{member.role.name}</Badge>
                            <p className="text-[10px] text-muted-foreground">{timeAgo(lastOnline || null, t)}</p>
                          </div>
                          <a href={`https://www.roblox.com/users/${member.user.userId}/profile`} target="_blank" rel="noreferrer">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0"><ExternalLink className="w-3 h-3" /></Button>
                          </a>
                        </div>
                      );
                    })}
                    {activityNextCursor && (
                      <Button variant="outline" className="w-full rounded-xl mt-2" onClick={() => loadActivity(activityNextCursor)} disabled={activityLoading}>
                        {activityLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} {t("common.loadMore")}
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
