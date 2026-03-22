import { useState } from "react";
import { motion } from "framer-motion";
import { useVerifyLicense } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { getDeviceFingerprint } from "@/lib/fingerprint";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Loader2, Bot, ArrowRight, Sparkles, Copy } from "lucide-react";

export default function Activation() {
  const [code, setCode] = useState("");
  const { mutateAsync: verify, isPending } = useVerifyLicense();
  const { loginLicense } = useAuth();
  const { toast } = useToast();
  const { t } = useLanguage();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;

    try {
      const fingerprint = await getDeviceFingerprint();
      const res = await verify({ data: { code: code.trim(), deviceFingerprint: fingerprint } });
      await loginLicense(res.token);
      toast({ title: t("activation.success"), description: `${t("activation.welcomePlan")} ${res.plan.toUpperCase()}` });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("activation.invalidCode");
      toast({ variant: "destructive", title: t("activation.failed"), description: message });
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setCode(text.trim());
    } catch {
      // ignore
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-background">
      {/* ── Left decorative panel ── */}
      <div className="hidden lg:flex lg:w-[45%] relative overflow-hidden flex-col">
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-800" />

        {/* animated orbs */}
        <motion.div
          animate={{ y: [0, -24, 0], x: [0, 14, 0] }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[12%] left-[18%] w-64 h-64 rounded-full bg-white/5 blur-3xl"
        />
        <motion.div
          animate={{ y: [0, 20, 0], x: [0, -10, 0] }}
          transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-[20%] right-[10%] w-48 h-48 rounded-full bg-violet-500/10 blur-3xl"
        />
        <motion.div
          animate={{ y: [0, 16, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[50%] right-[20%] w-32 h-32 rounded-full bg-amber-400/8 blur-2xl"
        />

        {/* content */}
        <div className="relative z-10 flex flex-col justify-between h-full p-12">
          <div>
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Limited.Ink" className="w-16 h-16 rounded-2xl mb-6 object-contain" />
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/10 rounded-full text-white/70 text-xs font-medium mb-8">
              <Sparkles className="w-3 h-3" />
              {t("activation.platform")}
            </div>
            <h1 className="text-5xl font-display font-bold text-white leading-tight mb-4">
              Limited<span className="text-white/40">.</span>Ink
            </h1>
            <p className="text-white/50 text-lg leading-relaxed max-w-xs">
              {t("activation.tagline")}
            </p>
          </div>

          {/* feature pills */}
          <div className="space-y-3">
            {[t("activation.features.catalog"), t("activation.features.analytics"), t("activation.features.alts"), t("activation.features.featured")].map((f) => (
              <motion.div
                key={f}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
                className="flex items-center gap-3"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-white/30" />
                <span className="text-white/50 text-sm">{f}</span>
              </motion.div>
            ))}
          </div>

          <p className="text-white/20 text-xs">© 2026 Limited.Ink</p>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex items-center justify-center p-8 lg:p-14 relative">
        {/* subtle bg pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-violet-50/30 via-transparent to-transparent dark:from-violet-950/20 pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-md relative"
        >
          {/* header */}
          <div className="mb-10">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-foreground text-background rounded-2xl shadow-2xl mb-6">
              <Bot className="w-7 h-7" strokeWidth={1.5} />
            </div>
            <h2 className="text-3xl font-display font-bold text-foreground mb-2">{t("activation.title")}</h2>
            <p className="text-muted-foreground">{t("activation.desc")}</p>
          </div>

          {/* steps */}
          <div className="grid grid-cols-3 gap-3 mb-8">
            {[
              { num: "1", label: t("activation.step1"), desc: t("activation.step1.desc") },
              { num: "2", label: t("activation.step2"), desc: t("activation.step2.desc") },
              { num: "3", label: t("activation.step3"), desc: t("activation.step3.desc") },
            ].map((s, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * i, duration: 0.4, ease: "easeOut" }}
                className="p-3.5 rounded-2xl bg-secondary/60 border border-border/50 hover:border-border transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-foreground text-background flex items-center justify-center text-xs font-bold mb-2">
                  {s.num}
                </div>
                <p className="text-xs font-semibold text-foreground leading-tight mb-0.5">{s.label}</p>
                <p className="text-xs text-muted-foreground leading-tight">{s.desc}</p>
              </motion.div>
            ))}
          </div>

          {/* Telegram bot link */}
          <a
            href="https://t.me/limitedink_bot"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between w-full px-4 py-3.5 mb-6 rounded-2xl border border-border bg-secondary/40 hover:bg-secondary/80 transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#229ED9]/15 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-[#229ED9]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.941z"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">@limitedink_bot</p>
                <p className="text-xs text-muted-foreground">{t("activation.botLink")}</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
          </a>

          {/* form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Input
                placeholder="XXXX-XXXX-XXXX-XXXX"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="h-14 text-base font-mono pr-12 bg-secondary/50 border-border/50 focus:border-foreground/30 focus:ring-0 focus:ring-offset-0 rounded-2xl transition-all placeholder:text-muted-foreground/40"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={handlePaste}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-secondary"
                title="Paste from clipboard"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>

            <Button
              type="submit"
              className="w-full h-13 rounded-2xl text-base font-semibold shadow-xl shadow-black/8 hover:-translate-y-0.5 transition-all duration-300"
              disabled={isPending || !code.trim()}
            >
              {isPending ? (
                <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> {t("activation.verifying")}</>
              ) : (
                <span className="flex items-center gap-2">{t("activation.activate")} <ArrowRight className="w-4 h-4" /></span>
              )}
            </Button>
          </form>

          <p className="text-center text-xs text-muted-foreground mt-6">
            {t("activation.terms")}
          </p>
        </motion.div>
      </div>
    </div>
  );
}
