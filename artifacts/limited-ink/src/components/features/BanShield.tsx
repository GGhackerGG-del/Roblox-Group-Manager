import { useState } from "react";
import { getAuthCredentials } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, Loader2, CheckCircle2, AlertTriangle, XCircle, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface BanShieldResult {
  riskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  issues: Array<{ type: string; description: string; severity: "warning" | "danger" }>;
  suggestion: string;
  safeName: string | null;
  safeDescription: string | null;
}

interface BanShieldProps {
  name: string;
  description?: string;
  clothingType?: string;
  onUseSafeName?: (name: string) => void;
  onUseSafeDescription?: (desc: string) => void;
}

export default function BanShield({ name, description, clothingType, onUseSafeName, onUseSafeDescription }: BanShieldProps) {
  const [result, setResult] = useState<BanShieldResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function analyze() {
    if (!name.trim()) return;
    setLoading(true);
    setResult(null);

    try {
      const { token, fingerprint } = getAuthCredentials();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      if (fingerprint) headers["X-Device-Fingerprint"] = fingerprint;

      const resp = await fetch(`${BASE}/api/banshield/analyze`, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({ name, description, clothingType }),
      });

      if (!resp.ok) throw new Error("Analysis failed");
      setResult(await resp.json());
      setExpanded(true);
    } catch {
      setResult({
        riskScore: -1,
        riskLevel: "low",
        issues: [{ type: "error", description: "Failed to analyze. Try again.", severity: "warning" }],
        suggestion: "Could not connect to BanShield service.",
        safeName: null,
        safeDescription: null,
      });
      setExpanded(true);
    } finally {
      setLoading(false);
    }
  }

  const riskConfig = {
    low: { color: "text-green-600", bg: "bg-green-500/10", border: "border-green-500/20", icon: CheckCircle2, label: "Safe" },
    medium: { color: "text-yellow-600", bg: "bg-yellow-500/10", border: "border-yellow-500/20", icon: AlertTriangle, label: "Review" },
    high: { color: "text-orange-600", bg: "bg-orange-500/10", border: "border-orange-500/20", icon: AlertTriangle, label: "Risky" },
    critical: { color: "text-red-600", bg: "bg-red-500/10", border: "border-red-500/20", icon: XCircle, label: "Danger" },
  };

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        size="sm"
        onClick={analyze}
        disabled={loading || !name.trim()}
        className="rounded-lg text-xs gap-1.5"
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Shield className="w-3.5 h-3.5" />
        )}
        BanShield Check
      </Button>

      <AnimatePresence>
        {result && expanded && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <Card className={`rounded-xl ${riskConfig[result.riskLevel]?.border || "border-border"} ${riskConfig[result.riskLevel]?.bg || ""}`}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {(() => {
                      const Icon = riskConfig[result.riskLevel]?.icon || Shield;
                      return <Icon className={`w-4 h-4 ${riskConfig[result.riskLevel]?.color || ""}`} />;
                    })()}
                    <span className={`text-sm font-bold ${riskConfig[result.riskLevel]?.color || ""}`}>
                      {riskConfig[result.riskLevel]?.label || "Unknown"} — Risk Score: {result.riskScore >= 0 ? `${result.riskScore}/100` : "N/A"}
                    </span>
                  </div>
                  <button onClick={() => setExpanded(false)} className="text-muted-foreground hover:text-foreground">
                    <ChevronUp className="w-4 h-4" />
                  </button>
                </div>

                {result.issues.length > 0 && (
                  <div className="space-y-1">
                    {result.issues.map((issue, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        {issue.severity === "danger" ? (
                          <XCircle className="w-3 h-3 text-red-500 shrink-0 mt-0.5" />
                        ) : (
                          <AlertTriangle className="w-3 h-3 text-yellow-500 shrink-0 mt-0.5" />
                        )}
                        <span>{issue.description}</span>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-xs text-muted-foreground">{result.suggestion}</p>

                {(result.safeName || result.safeDescription) && (
                  <div className="flex gap-2 pt-1 flex-wrap">
                    {result.safeName && onUseSafeName && (
                      <Button variant="outline" size="sm" className="text-[10px] h-6 rounded-md gap-1" onClick={() => onUseSafeName(result.safeName!)}>
                        <Sparkles className="w-3 h-3" /> Use safe name
                      </Button>
                    )}
                    {result.safeDescription && onUseSafeDescription && (
                      <Button variant="outline" size="sm" className="text-[10px] h-6 rounded-md gap-1" onClick={() => onUseSafeDescription(result.safeDescription!)}>
                        <Sparkles className="w-3 h-3" /> Use safe description
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {result && !expanded && (
          <button onClick={() => setExpanded(true)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            {(() => {
              const Icon = riskConfig[result.riskLevel]?.icon || Shield;
              return <Icon className={`w-3 h-3 ${riskConfig[result.riskLevel]?.color || ""}`} />;
            })()}
            <span className={riskConfig[result.riskLevel]?.color}>{riskConfig[result.riskLevel]?.label}</span>
            <ChevronDown className="w-3 h-3" />
          </button>
        )}
      </AnimatePresence>
    </div>
  );
}
