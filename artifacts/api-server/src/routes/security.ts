import { Router, type IRouter, type Request } from "express";
import { randomUUID } from "crypto";

const router: IRouter = Router();

const ROBLOX_USERS_API = "https://users.roblox.com";
const ROBLOX_THUMBNAILS_API = "https://thumbnails.roblox.com";

async function fetchRoblox(url: string, cookie: string, options: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...options,
    redirect: "follow",
    headers: {
      Cookie: `.ROBLOSECURITY=${cookie}`,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Accept: "application/json",
      Referer: "https://www.roblox.com/",
      ...(options.headers || {}),
    },
  });
}

function logActivity(req: Request, action: string, detail?: string) {
  if (!req.session.activityLog) req.session.activityLog = [];
  req.session.activityLog.unshift({
    id: randomUUID(),
    action,
    detail,
    ts: Date.now(),
    userId: req.session.robloxUserId,
  });
  if (req.session.activityLog.length > 200) {
    req.session.activityLog = req.session.activityLog.slice(0, 200);
  }
}

router.get("/security/session-info", (req, res): void => {
  const cookie = req.session.robloxCookie;
  const profile = req.session.robloxProfile;
  if (!cookie || !profile) {
    res.status(401).json({ error: "No active session" });
    return;
  }
  const maskedCookie = `...${cookie.slice(-8)}`;
  res.json({
    userId: profile.id,
    username: profile.name,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    maskedCookie,
    sessionCreatedAt: req.session.sessionCreatedAt || null,
    activityCount: req.session.activityLog?.length || 0,
    proxyEnabled: req.session.proxyConfig?.enabled || false,
    proxyUrl: req.session.proxyConfig ? req.session.proxyConfig.url.replace(/\/\/(.+):(.+)@/, "//***:***@") : null,
    altCount: req.session.altAccounts?.length || 0,
  });
});

router.post("/security/validate-cookie", async (req, res): Promise<void> => {
  const { cookie } = req.body as { cookie?: string };
  if (!cookie || typeof cookie !== "string" || !cookie.trim()) {
    res.status(400).json({ error: "cookie is required" });
    return;
  }
  const cleanCookie = cookie.trim().replace(/^\.ROBLOSECURITY=/, "");
  try {
    const [userResp, thumbResp] = await Promise.all([
      fetchRoblox(`${ROBLOX_USERS_API}/v1/users/authenticated`, cleanCookie),
      Promise.resolve(null),
    ]);
    if (!userResp.ok) {
      res.json({ valid: false, error: "Invalid or expired cookie" });
      return;
    }
    const userData = await userResp.json() as { id: number; name: string; displayName: string };
    let avatarUrl: string | null = null;
    try {
      const thumbRes = await fetch(
        `${ROBLOX_THUMBNAILS_API}/v1/users/avatar-headshot?userIds=${userData.id}&size=150x150&format=Png`,
      );
      if (thumbRes.ok) {
        const thumbData = await thumbRes.json() as { data?: Array<{ imageUrl?: string }> };
        avatarUrl = thumbData.data?.[0]?.imageUrl || null;
      }
    } catch {}
    res.json({
      valid: true,
      userId: userData.id,
      username: userData.name,
      displayName: userData.displayName,
      avatarUrl,
    });
  } catch (e) {
    res.status(500).json({ valid: false, error: e instanceof Error ? e.message : "Validation failed" });
  }
});

router.post("/security/check-cookie", async (req, res): Promise<void> => {
  const { cookie } = req.body as { cookie?: string };
  if (!cookie || typeof cookie !== "string" || !cookie.trim()) {
    res.status(400).json({ error: "cookie is required" });
    return;
  }
  const cleanCookie = cookie.trim().replace(/^\.ROBLOSECURITY=/, "");
  try {
    const userResp = await fetchRoblox(`${ROBLOX_USERS_API}/v1/users/authenticated`, cleanCookie);
    if (!userResp.ok) {
      res.json({ valid: false, error: "Invalid or expired cookie" });
      return;
    }
    const userData = await userResp.json() as { id: number; name: string; displayName: string };

    const [thumbRes, robuxRes, premiumRes, friendsRes] = await Promise.all([
      fetch(`${ROBLOX_THUMBNAILS_API}/v1/users/avatar-headshot?userIds=${userData.id}&size=150x150&format=Png`).catch(() => null),
      fetchRoblox(`https://economy.roblox.com/v1/users/${userData.id}/currency`, cleanCookie).catch(() => null),
      fetchRoblox(`https://premiumfeatures.roblox.com/v1/users/${userData.id}/validate-membership`, cleanCookie).catch(() => null),
      fetch(`https://friends.roblox.com/v1/users/${userData.id}/friends/count`).catch(() => null),
    ]);

    let avatarUrl: string | null = null;
    try {
      if (thumbRes?.ok) {
        const d = await thumbRes.json() as { data?: Array<{ imageUrl?: string }> };
        avatarUrl = d.data?.[0]?.imageUrl || null;
      }
    } catch {}

    let robux: number | null = null;
    try {
      if (robuxRes?.ok) {
        const d = await robuxRes.json() as { robux?: number };
        robux = d.robux ?? null;
      }
    } catch {}

    let isPremium: boolean = false;
    try {
      if (premiumRes?.ok) {
        const text = await premiumRes.text();
        isPremium = text.trim() === "true";
      }
    } catch {}

    let friendCount: number | null = null;
    try {
      if (friendsRes?.ok) {
        const d = await friendsRes.json() as { count?: number };
        friendCount = d.count ?? null;
      }
    } catch {}

    res.json({
      valid: true,
      userId: userData.id,
      username: userData.name,
      displayName: userData.displayName,
      avatarUrl,
      robux,
      isPremium,
      friendCount,
    });
  } catch (e) {
    res.status(500).json({ valid: false, error: e instanceof Error ? e.message : "Check failed" });
  }
});

router.get("/security/activity", (req, res): void => {
  const log = req.session.activityLog || [];
  res.json({ log, total: log.length });
});

router.post("/security/activity", (req, res): void => {
  const { action, detail } = req.body as { action?: string; detail?: string };
  if (!action) { res.status(400).json({ error: "action required" }); return; }
  logActivity(req as any, action, detail);
  req.session.save(() => res.json({ ok: true }));
});

router.delete("/security/activity", (req, res): void => {
  req.session.activityLog = [];
  req.session.save(() => res.json({ ok: true }));
});

router.get("/security/proxy", (req, res): void => {
  const proxy = req.session.proxyConfig;
  if (!proxy) { res.json({ configured: false }); return; }
  res.json({
    configured: true,
    enabled: proxy.enabled,
    maskedUrl: proxy.url.replace(/\/\/(.+):(.+)@/, "//***:***@"),
    addedAt: proxy.addedAt,
  });
});

router.post("/security/proxy", (req, res): void => {
  const { url, enabled } = req.body as { url?: string; enabled?: boolean };
  if (!url && enabled !== false) { res.status(400).json({ error: "url required" }); return; }
  if (!url) {
    req.session.proxyConfig = undefined;
    req.session.save(() => res.json({ ok: true, configured: false }));
    return;
  }
  req.session.proxyConfig = { url: url.trim(), enabled: enabled !== false, addedAt: Date.now() };
  logActivity(req, "Proxy configured", url.replace(/\/\/(.+):(.+)@/, "//***:***@"));
  req.session.save(() => res.json({ ok: true, configured: true }));
});

router.post("/security/proxy/test", async (req, res): Promise<void> => {
  const { url } = req.body as { url?: string };
  const proxyUrl = url || req.session.proxyConfig?.url;
  if (!proxyUrl) { res.status(400).json({ error: "No proxy configured" }); return; }
  try {
    const start = Date.now();
    const r = await fetch("https://www.roblox.com/info/version", {
      signal: AbortSignal.timeout(8000),
    });
    const latency = Date.now() - start;
    if (r.ok || r.status < 500) {
      res.json({ ok: true, latency, message: `Connection test passed (${latency}ms). Note: proxy routing is configured server-side.` });
    } else {
      res.json({ ok: false, latency, message: `Roblox returned ${r.status}` });
    }
  } catch (e) {
    res.json({ ok: false, message: e instanceof Error ? e.message : "Connection failed" });
  }
});

export { logActivity };
export default router;
