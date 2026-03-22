import { useState } from "react";
import { motion } from "framer-motion";
import { useRobloxAuth } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Loader2, ShieldCheck, Eye, EyeOff, ArrowRight, Lock, Monitor, FolderOpen, Cookie } from "lucide-react";

export default function RobloxLogin() {
  const [cookie, setCookie] = useState("");
  const [showCookie, setShowCookie] = useState(false);
  const { mutateAsync: authenticate, isPending } = useRobloxAuth();
  const { loginRoblox } = useAuth();
  const { toast } = useToast();
  const { t } = useLanguage();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cookie.trim()) return;

    try {
      const res = await authenticate({ data: { cookie: cookie.trim() } });
      loginRoblox(res);
      toast({ title: t("roblox.connected"), description: `${t("roblox.connectedAs")} ${res.displayName || res.name}` });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("roblox.invalidCookie");
      toast({ variant: "destructive", title: t("roblox.failed"), description: message });
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-background">
      {/* ── Left form panel ── */}
      <div className="flex-1 flex items-center justify-center p-8 lg:p-14 relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-blue-50/40 via-transparent to-transparent dark:from-blue-950/15 pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-md relative"
        >
          {/* header */}
          <div className="mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-foreground text-background rounded-2xl shadow-2xl mb-6">
              <ShieldCheck className="w-7 h-7" strokeWidth={1.5} />
            </div>
            <h2 className="text-3xl font-display font-bold text-foreground mb-2">{t("roblox.connect")}</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {t("roblox.desc")}
            </p>
          </div>

          {/* how-to steps */}
          <div className="mb-7 p-4 rounded-2xl bg-secondary/50 border border-border/50">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              {t("roblox.howTo")}
            </p>
            <div className="space-y-3">
              {[
                { icon: Monitor, label: t("roblox.step1"), desc: t("roblox.step1.desc") },
                { icon: FolderOpen, label: t("roblox.step2"), desc: t("roblox.step2.desc") },
                { icon: Cookie, label: t("roblox.step3"), desc: t("roblox.step3.desc") },
              ].map((s, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-background border border-border flex items-center justify-center shrink-0">
                    <s.icon className="w-3.5 h-3.5 text-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground">{s.label}</p>
                    <p className="text-xs text-muted-foreground">{s.desc}</p>
                  </div>
                  {i < 2 && (
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* cookie path hint */}
          <div className="mb-5 px-3.5 py-2.5 rounded-xl bg-secondary/30 border border-border/30 font-mono text-xs text-muted-foreground">
            <span className="text-foreground/50">DevTools</span>
            <span className="mx-1.5 text-muted-foreground/30">›</span>
            <span className="text-foreground/50">Application</span>
            <span className="mx-1.5 text-muted-foreground/30">›</span>
            <span className="text-foreground/50">Cookies</span>
            <span className="mx-1.5 text-muted-foreground/30">›</span>
            <span className="text-foreground/70">roblox.com</span>
            <span className="mx-1.5 text-muted-foreground/30">›</span>
            <span className="text-foreground font-semibold">.ROBLOSECURITY</span>
          </div>

          {/* form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Input
                type={showCookie ? "text" : "password"}
                placeholder="_|WARNING:-DO-NOT-SHARE-THIS-..."
                value={cookie}
                onChange={(e) => setCookie(e.target.value)}
                className="h-14 font-mono text-xs pr-12 bg-secondary/50 border-border/50 focus:border-foreground/30 focus:ring-0 focus:ring-offset-0 rounded-2xl transition-all placeholder:text-muted-foreground/30"
              />
              <button
                type="button"
                onClick={() => setShowCookie((v) => !v)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-secondary"
              >
                {showCookie ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <Button
              type="submit"
              className="w-full h-13 rounded-2xl text-base font-semibold shadow-xl shadow-black/8 hover:-translate-y-0.5 transition-all duration-300"
              disabled={isPending || !cookie.trim()}
            >
              {isPending ? (
                <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> {t("roblox.connecting")}</>
              ) : (
                <span className="flex items-center gap-2">{t("roblox.connectBtn")} <ArrowRight className="w-4 h-4" /></span>
              )}
            </Button>
          </form>

          {/* security note */}
          <div className="mt-5 flex items-start gap-2.5 p-3.5 rounded-2xl bg-green-50/80 dark:bg-green-950/20 border border-green-200/60 dark:border-green-800/30">
            <Lock className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
            <p className="text-xs text-green-700 dark:text-green-400 leading-relaxed">
              {t("roblox.security")}
            </p>
          </div>
        </motion.div>
      </div>

      {/* ── Right decorative panel ── */}
      <div className="hidden lg:flex lg:w-[42%] relative overflow-hidden flex-col">
        <div className="absolute inset-0 bg-gradient-to-bl from-zinc-950 via-zinc-900 to-zinc-800" />

        {/* animated orbs */}
        <motion.div
          animate={{ y: [0, -20, 0], x: [0, 10, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[15%] right-[15%] w-72 h-72 rounded-full bg-blue-500/8 blur-3xl"
        />
        <motion.div
          animate={{ y: [0, 18, 0], x: [0, -12, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-[25%] left-[10%] w-56 h-56 rounded-full bg-white/5 blur-3xl"
        />

        <div className="relative z-10 flex flex-col justify-center h-full p-14">
          {/* shield graphic */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="mb-10"
          >
            <div className="w-20 h-20 rounded-3xl bg-white/10 border border-white/10 flex items-center justify-center mb-6 shadow-2xl">
              <ShieldCheck className="w-10 h-10 text-white/80" strokeWidth={1} />
            </div>
            <h3 className="text-4xl font-display font-bold text-white leading-tight mb-4">
              {t("roblox.privacy.title")}
            </h3>
            <p className="text-white/50 leading-relaxed text-base">
              {t("roblox.privacy.desc")}
            </p>
          </motion.div>

          {/* trust points */}
          <div className="space-y-4">
            {[
              t("roblox.privacy.1"),
              t("roblox.privacy.2"),
              t("roblox.privacy.3"),
              t("roblox.privacy.4"),
            ].map((point, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.07, duration: 0.4 }}
                className="flex items-center gap-3"
              >
                <div className="w-5 h-5 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center shrink-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                </div>
                <p className="text-white/60 text-sm">{point}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
