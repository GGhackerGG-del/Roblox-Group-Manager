import { useState } from "react";
import { getAuthCredentials } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search, Users, ShoppingBag, DollarSign, Calendar,
  TrendingUp, Crown, Globe, Loader2, AlertCircle
} from "lucide-react";
import { motion } from "framer-motion";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface CompetitorData {
  group: {
    id: number;
    name: string;
    description: string;
    memberCount: number;
    owner?: { userId: number; username: string; displayName: string };
    created: string;
    publicEntryAllowed: boolean;
    thumbnailUrl: string | null;
  };
  clothing: {
    totalCount: number;
    averagePrice: number;
    topItems: Array<{ id: number; name: string; price: number | null }>;
  };
}

export default function Competitors() {
  const [groupId, setGroupId] = useState("");
  const [data, setData] = useState<CompetitorData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyze() {
    const id = groupId.trim();
    if (!id) return;

    setLoading(true);
    setError(null);
    setData(null);

    try {
      const { token, fingerprint } = getAuthCredentials();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      if (fingerprint) headers["X-Device-Fingerprint"] = fingerprint;

      const resp = await fetch(`${BASE}/api/competitor/analyze/${id}`, {
        credentials: "include",
        headers,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Request failed" })) as { error?: string };
        throw new Error(err.error || "Failed to analyze");
      }

      setData(await resp.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Search className="w-6 h-6" /> Competitor Tracker
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Analyze any Roblox group to see their clothing stats and strategy
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <Input
              placeholder="Enter competitor Group ID"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && analyze()}
              className="font-mono"
            />
            <Button onClick={analyze} disabled={loading || !groupId.trim()} className="shrink-0">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
              Analyze
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6 flex items-center gap-2 text-destructive">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
          </CardContent>
        </Card>
      )}

      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      )}

      {data && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                {data.group.thumbnailUrl ? (
                  <img src={data.group.thumbnailUrl} className="w-16 h-16 rounded-xl object-cover border border-border" alt="" />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-secondary flex items-center justify-center">
                    <Users className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold">{data.group.name}</h2>
                  {data.group.owner && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Crown className="w-3 h-3" /> {data.group.owner.displayName} (@{data.group.owner.username})
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{data.group.description}</p>
                </div>
                <Badge variant={data.group.publicEntryAllowed ? "default" : "secondary"} className="shrink-0">
                  {data.group.publicEntryAllowed ? "Open" : "Closed"}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <Users className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
                <p className="text-2xl font-bold">{data.group.memberCount.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Members</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <ShoppingBag className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
                <p className="text-2xl font-bold">{data.clothing.totalCount}</p>
                <p className="text-xs text-muted-foreground">Clothing Items</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <DollarSign className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
                <p className="text-2xl font-bold">{data.clothing.averagePrice} R$</p>
                <p className="text-xs text-muted-foreground">Avg Price</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <Calendar className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
                <p className="text-2xl font-bold">{new Date(data.group.created).toLocaleDateString("ru-RU", { month: "short", year: "numeric" })}</p>
                <p className="text-xs text-muted-foreground">Created</p>
              </CardContent>
            </Card>
          </div>

          {data.clothing.topItems.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" /> Top Clothing Items
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.clothing.topItems.map((item, i) => (
                    <div key={item.id} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground font-mono w-5">{i + 1}.</span>
                        <span className="text-sm font-medium">{item.name}</span>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {item.price != null ? `${item.price} R$` : "Off-sale"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </motion.div>
      )}
    </div>
  );
}
