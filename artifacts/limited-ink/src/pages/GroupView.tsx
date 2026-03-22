import { useState, useEffect, useRef, useCallback } from "react";
import { getAuthCredentials } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2, Users,
  UserPlus, Trash2, RefreshCw,
  ChevronRight, DollarSign
} from "lucide-react";
import { playClick, playSuccess, playError, playTabSwitch } from "@/hooks/useSounds";
import PnL from "./PnL";


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

// ─── Types ───────────────────────────────────────────────────────────────────

interface AltAccount {
  index: number;
  userId: number;
  name: string;
  displayName: string;
  avatarUrl: string | null;
}


interface FullStats {
  id: number;
  name: string;
  description: string;
  memberCount: number;
  funds: number;
  pendingRobux: number;
  salesRevenue24h: number;
  salesCount24h: number;
  joinPolicy: string;
  isLocked: boolean;
  publicEntryAllowed: boolean;
  thumbnailUrl: string | null;
}

// ─── Sub-components ───────────────────────────────────────────────────────────


// ─── Alt Accounts Tab ─────────────────────────────────────────────────────────

function AltAccountsTab() {
  const { toast } = useToast();
  const [alts, setAlts] = useState<AltAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCookie, setNewCookie] = useState("");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);

  useEffect(() => {
    apiFetch<{ accounts: AltAccount[] }>("/api/roblox/alt")
      .then(d => setAlts(d.accounts))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleAdd = async () => {
    if (!newCookie.trim()) return;
    setAdding(true);
    try {
      const data = await apiFetch<AltAccount>("/api/roblox/alt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookie: newCookie.trim() }),
      });
      setAlts(prev => [...prev, data]);
      setNewCookie("");
      toast({ title: "Account added", description: `@${data.name} is ready to use.` });
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: err instanceof Error ? err.message : "Failed to add account." });
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (alt: AltAccount) => {
    setRemoving(alt.index);
    try {
      await apiFetch(`/api/roblox/alt/${alt.index}`, { method: "DELETE" });
      setAlts(prev => prev.filter(a => a.userId !== alt.userId).map((a, i) => ({ ...a, index: i })));
      toast({ title: "Removed", description: `@${alt.name} has been removed.` });
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to remove account." });
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="space-y-5">
      <Card className="rounded-2xl border border-border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2"><UserPlus className="w-5 h-5" /> Add Alt Account</CardTitle>
          <CardDescription>Alt accounts are used to upload clothing instead of the main account. Stored only for the current session.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Cookie (.ROBLOSECURITY)</Label>
            <Textarea
              value={newCookie}
              onChange={e => setNewCookie(e.target.value)}
              placeholder="_|WARNING:-DO-NOT-SHARE-THIS..."
              className="resize-none min-h-[80px] rounded-xl font-mono text-xs"
            />
          </div>
          <Button onClick={handleAdd} disabled={adding || !newCookie.trim()} className="rounded-xl w-full gap-2">
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            {adding ? "Verifying..." : "Add Account"}
          </Button>
          <p className="text-xs text-muted-foreground">
            The cookie is not stored permanently — only in server memory for the current session.
          </p>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map(i => <Skeleton key={i} className="h-20 rounded-2xl" />)}
        </div>
      ) : alts.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" strokeWidth={1} />
          <p className="font-medium">No alt accounts added</p>
          <p className="text-sm mt-1">Add an account cookie above</p>
        </div>
      ) : (
        <div className="space-y-3">
          {alts.map(alt => (
            <Card key={alt.userId} className="rounded-2xl border border-border shadow-sm">
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Avatar className="w-12 h-12 border border-border">
                    <AvatarImage src={alt.avatarUrl || undefined} />
                    <AvatarFallback className="font-bold">{alt.displayName.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-bold">{alt.displayName}</p>
                    <p className="text-xs text-muted-foreground">@{alt.name} · ID: {alt.userId}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="text-xs bg-green-500/15 text-green-600 border-green-500/20">Active</Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg"
                    onClick={() => handleRemove(alt)}
                    disabled={removing === alt.index}
                  >
                    {removing === alt.index ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main GroupView ───────────────────────────────────────────────────────────

export default function GroupView({ id }: { id: string }) {
  const [stats, setStats] = useState<FullStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem(`limitedink_tab_${id}`) || "pnl";
  });

  const handleTabChange = (tab: string) => {
    playTabSwitch();
    setActiveTab(tab);
    localStorage.setItem(`limitedink_tab_${id}`, tab);
  };

  useEffect(() => {
    setIsLoading(true);
    setIsError(false);
    setStats(null);
    apiFetch<FullStats>(`/api/roblox/groups/${id}/stats`)
      .then(d => setStats(d))
      .catch(() => setIsError(true))
      .finally(() => setIsLoading(false));
  }, [id]);

  useEffect(() => {
    const saved = localStorage.getItem(`limitedink_tab_${id}`);
    const validTabs = ["pnl", "alts"];
    if (saved && validTabs.includes(saved)) setActiveTab(saved);
    else setActiveTab("pnl");
  }, [id]);

  if (isLoading || (!stats && !isError)) {
    return (
      <div className="p-8 lg:p-12 w-full max-w-6xl mx-auto space-y-8">
        <div className="flex items-center gap-4">
          <Skeleton className="w-20 h-20 rounded-2xl" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
        </div>
        <div className="grid grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  if (isError || !stats) {
    return <div className="p-12 text-center text-muted-foreground">Failed to load group stats.</div>;
  }

  return (
    <div className="p-6 lg:p-10 w-full max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-5">
        {stats.thumbnailUrl && (
          <img src={stats.thumbnailUrl} alt={stats.name} className="w-20 h-20 rounded-2xl shadow-lg border border-border/50 shrink-0" />
        )}
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-foreground leading-tight">{stats.name}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            ID: {stats.id} · {stats.memberCount.toLocaleString()} members
          </p>
        </div>
        <a
          href={`https://www.roblox.com/groups/${stats.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-xs font-semibold px-3 py-2 rounded-xl bg-secondary hover:bg-secondary/70 transition-colors border border-border flex items-center gap-1.5 shrink-0"
        >
          Roblox <ChevronRight className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* Tabs */}
      <Tabs value={["pnl", "alts"].includes(activeTab) ? activeTab : "pnl"} onValueChange={handleTabChange} className="w-full">
        <TabsList className="rounded-xl bg-secondary/50 border border-border p-1 h-auto flex-wrap gap-1 w-full">
          <TabsTrigger value="pnl" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-sm px-3 py-2 flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5" /> P&L
          </TabsTrigger>
          <TabsTrigger value="alts" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-sm px-3 py-2 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> Alt Accounts
          </TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="pnl" className="mt-0 data-[state=inactive]:hidden" forceMount>
            <PnL groupId={String(stats.id)} />
          </TabsContent>
          <TabsContent value="alts" className="mt-0 data-[state=inactive]:hidden" forceMount>
            <AltAccountsTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
