import { Router, type IRouter } from "express";

const router: IRouter = Router();

const GROUPS_API = "https://groups.roblox.com";
const ECONOMY_API = "https://economy.roblox.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function rHeaders(cookie: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    "Cookie": `.ROBLOSECURITY=${cookie}`,
    "User-Agent": UA,
    "Accept": "application/json",
    "Referer": "https://www.roblox.com/",
    "Origin": "https://www.roblox.com",
    ...extra,
  };
}

async function getCsrf(cookie: string): Promise<string> {
  try {
    const r = await fetch("https://auth.roblox.com/v2/logout", {
      method: "POST",
      headers: { "Cookie": `.ROBLOSECURITY=${cookie}`, "Content-Length": "0", "User-Agent": UA },
    });
    return r.headers.get("x-csrf-token") || "";
  } catch { return ""; }
}

async function fetchWithCsrfRetry(url: string, cookie: string, opts: RequestInit): Promise<Response> {
  const csrf = await getCsrf(cookie);
  const headers: Record<string, string> = { ...rHeaders(cookie, { "Content-Type": "application/json" }) };
  if (csrf) headers["X-CSRF-TOKEN"] = csrf;
  let resp = await fetch(url, { ...opts, headers });
  if (resp.status === 403) {
    const newCsrf = resp.headers.get("x-csrf-token");
    if (newCsrf) {
      headers["X-CSRF-TOKEN"] = newCsrf;
      resp = await fetch(url, { ...opts, headers });
    }
  }
  return resp;
}

interface ScheduledShout {
  id: string;
  groupId: string;
  message: string;
  scheduledAt: number;
  posted: boolean;
}

const scheduledShouts: ScheduledShout[] = [];

setInterval(async () => {
  const now = Date.now();
  const pending = scheduledShouts.filter(s => !s.posted && s.scheduledAt <= now);
  for (const shout of pending) {
    console.log(`[Automation] Posting scheduled shout for group ${shout.groupId}`);
    shout.posted = true;
  }
}, 30_000);

router.get("/automation/join-requests/:groupId", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  if (!cookie) { res.status(401).json({ error: "No active Roblox session." }); return; }
  const { groupId } = req.params;
  try {
    const resp = await fetch(`${GROUPS_API}/v1/groups/${groupId}/join-requests?limit=100&sortOrder=Asc`, { headers: rHeaders(cookie) });
    if (!resp.ok) { res.status(resp.status).json({ error: `Roblox API ${resp.status}` }); return; }
    const data = await resp.json() as { data: Array<{ requester: { userId: number; username: string; displayName: string }; created: string }> };
    res.json({ requests: data.data || [] });
  } catch (err) {
    console.error("[Automation] Join requests error:", err);
    res.status(502).json({ error: "Failed to fetch join requests." });
  }
});

router.post("/automation/join-requests/:groupId/accept", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  if (!cookie) { res.status(401).json({ error: "No active Roblox session." }); return; }
  const { groupId } = req.params;
  const { userIds } = req.body as { userIds?: number[] };
  if (!userIds?.length) { res.status(400).json({ error: "userIds required." }); return; }
  try {
    let accepted = 0;
    for (let i = 0; i < userIds.length; i += 20) {
      const batch = userIds.slice(i, i + 20);
      const resp = await fetchWithCsrfRetry(`${GROUPS_API}/v1/groups/${groupId}/join-requests`, cookie, {
        method: "POST",
        body: JSON.stringify({ UserIds: batch }),
      });
      if (resp.ok) accepted += batch.length;
      if (i + 20 < userIds.length) await new Promise(r => setTimeout(r, 500));
    }
    res.json({ accepted, message: `Принято ${accepted} из ${userIds.length} запросов` });
  } catch (err) {
    console.error("[Automation] Accept error:", err);
    res.status(502).json({ error: "Failed to accept join requests." });
  }
});

router.delete("/automation/join-requests/:groupId/:userId", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  if (!cookie) { res.status(401).json({ error: "No active Roblox session." }); return; }
  const { groupId, userId } = req.params;
  try {
    const resp = await fetchWithCsrfRetry(`${GROUPS_API}/v1/groups/${groupId}/join-requests/users/${userId}`, cookie, { method: "DELETE" });
    if (!resp.ok) { res.status(resp.status).json({ error: "Failed to decline request." }); return; }
    res.json({ success: true });
  } catch (err) {
    res.status(502).json({ error: "Failed to decline join request." });
  }
});

router.get("/automation/roles/:groupId", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  if (!cookie) { res.status(401).json({ error: "No active Roblox session." }); return; }
  const { groupId } = req.params;
  try {
    const resp = await fetch(`${GROUPS_API}/v1/groups/${groupId}/roles`, { headers: rHeaders(cookie) });
    if (!resp.ok) { res.status(resp.status).json({ error: `Roblox API ${resp.status}` }); return; }
    const data = await resp.json() as { roles: Array<{ id: number; name: string; rank: number; memberCount: number }> };
    res.json({ roles: data.roles || [] });
  } catch (err) {
    res.status(502).json({ error: "Failed to fetch roles." });
  }
});

router.get("/automation/members/:groupId", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  if (!cookie) { res.status(401).json({ error: "No active Roblox session." }); return; }
  const { groupId } = req.params;
  const roleId = req.query.roleId as string | undefined;
  const limit = Math.min(parseInt(req.query.limit as string || "100", 10), 100);
  const cursor = req.query.cursor as string | undefined;
  try {
    let url = `${GROUPS_API}/v1/groups/${groupId}/users?limit=${limit}&sortOrder=Asc`;
    if (roleId) url += `&roleId=${roleId}`;
    if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;
    const resp = await fetch(url, { headers: rHeaders(cookie) });
    if (!resp.ok) { res.status(resp.status).json({ error: `Roblox API ${resp.status}` }); return; }
    const data = await resp.json() as {
      data: Array<{ user: { userId: number; username: string; displayName: string }; role: { id: number; name: string; rank: number } }>;
      nextPageCursor?: string;
      previousPageCursor?: string;
    };
    res.json({ members: data.data || [], nextPageCursor: data.nextPageCursor });
  } catch (err) {
    res.status(502).json({ error: "Failed to fetch members." });
  }
});

router.patch("/automation/rank/:groupId/:userId", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  if (!cookie) { res.status(401).json({ error: "No active Roblox session." }); return; }
  const { groupId, userId } = req.params;
  const { roleId } = req.body as { roleId?: number };
  if (!roleId) { res.status(400).json({ error: "roleId required." }); return; }
  try {
    const resp = await fetchWithCsrfRetry(`${GROUPS_API}/v1/groups/${groupId}/users/${userId}`, cookie, {
      method: "PATCH",
      body: JSON.stringify({ roleId }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({})) as { errors?: Array<{ message: string }> };
      res.status(resp.status).json({ error: err.errors?.[0]?.message || "Failed to change rank." }); return;
    }
    res.json({ success: true, message: "Ранг успешно изменён" });
  } catch (err) {
    res.status(502).json({ error: "Failed to change rank." });
  }
});

router.delete("/automation/exile/:groupId/:userId", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  if (!cookie) { res.status(401).json({ error: "No active Roblox session." }); return; }
  const { groupId, userId } = req.params;
  try {
    const resp = await fetchWithCsrfRetry(`${GROUPS_API}/v1/groups/${groupId}/users/${userId}`, cookie, { method: "DELETE" });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({})) as { errors?: Array<{ message: string }> };
      res.status(resp.status).json({ error: err.errors?.[0]?.message || "Failed to exile." }); return;
    }
    res.json({ success: true, message: "Участник удалён из группы" });
  } catch (err) {
    res.status(502).json({ error: "Failed to exile member." });
  }
});

router.get("/automation/wall/:groupId", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  if (!cookie) { res.status(401).json({ error: "No active Roblox session." }); return; }
  const { groupId } = req.params;
  const cursor = req.query.cursor as string | undefined;
  try {
    let url = `${GROUPS_API}/v2/groups/${groupId}/wall/posts?limit=100&sortOrder=Desc`;
    if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;
    const resp = await fetch(url, { headers: rHeaders(cookie) });
    if (!resp.ok) { res.status(resp.status).json({ error: `Roblox API ${resp.status}` }); return; }
    const data = await resp.json() as {
      data: Array<{ id: number; body: string; created: string; updated: string; poster: { user: { userId: number; username: string; displayName: string } } | null }>;
      nextPageCursor?: string;
    };
    res.json({ posts: data.data || [], nextPageCursor: data.nextPageCursor });
  } catch (err) {
    res.status(502).json({ error: "Failed to fetch wall posts." });
  }
});

router.delete("/automation/wall/:groupId/:postId", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  if (!cookie) { res.status(401).json({ error: "No active Roblox session." }); return; }
  const { groupId, postId } = req.params;
  try {
    const resp = await fetchWithCsrfRetry(`${GROUPS_API}/v2/groups/${groupId}/wall/posts/${postId}`, cookie, { method: "DELETE" });
    if (!resp.ok) { res.status(resp.status).json({ error: "Failed to delete post." }); return; }
    res.json({ success: true });
  } catch (err) {
    res.status(502).json({ error: "Failed to delete post." });
  }
});

router.post("/automation/wall/:groupId/moderate", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  if (!cookie) { res.status(401).json({ error: "No active Roblox session." }); return; }
  const { groupId } = req.params;
  const { keywords = [] } = req.body as { keywords?: string[] };
  if (!keywords.length) { res.status(400).json({ error: "keywords required." }); return; }
  try {
    const wallResp = await fetch(`${GROUPS_API}/v2/groups/${groupId}/wall/posts?limit=100&sortOrder=Desc`, { headers: rHeaders(cookie) });
    if (!wallResp.ok) { res.status(wallResp.status).json({ error: "Failed to fetch wall." }); return; }
    const data = await wallResp.json() as { data: Array<{ id: number; body: string }> };
    const lc = keywords.map(k => k.toLowerCase());
    const toDelete = (data.data || []).filter(p => lc.some(kw => p.body.toLowerCase().includes(kw)));
    let deleted = 0;
    for (const post of toDelete) {
      const dr = await fetchWithCsrfRetry(`${GROUPS_API}/v2/groups/${groupId}/wall/posts/${post.id}`, cookie, { method: "DELETE" });
      if (dr.ok) deleted++;
      await new Promise(r => setTimeout(r, 300));
    }
    res.json({ deleted, checked: data.data?.length || 0, message: `Удалено ${deleted} постов из ${data.data?.length || 0}` });
  } catch (err) {
    res.status(502).json({ error: "Failed to moderate wall." });
  }
});

router.get("/automation/shout/:groupId", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  if (!cookie) { res.status(401).json({ error: "No active Roblox session." }); return; }
  const { groupId } = req.params;
  try {
    const resp = await fetch(`${GROUPS_API}/v1/groups/${groupId}`, { headers: rHeaders(cookie) });
    if (!resp.ok) { res.status(resp.status).json({ error: `Roblox API ${resp.status}` }); return; }
    const data = await resp.json() as { shout?: { body: string; poster: { userId: number; username: string }; created: string; updated: string } | null };
    const scheduled = scheduledShouts.filter(s => s.groupId === groupId && !s.posted);
    res.json({ shout: data.shout || null, scheduled });
  } catch (err) {
    res.status(502).json({ error: "Failed to fetch shout." });
  }
});

router.patch("/automation/shout/:groupId", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  if (!cookie) { res.status(401).json({ error: "No active Roblox session." }); return; }
  const { groupId } = req.params;
  const { message } = req.body as { message?: string };
  if (!message && message !== "") { res.status(400).json({ error: "message required." }); return; }
  try {
    const resp = await fetchWithCsrfRetry(`${GROUPS_API}/v1/groups/${groupId}/status`, cookie, {
      method: "PATCH",
      body: JSON.stringify({ message }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({})) as { errors?: Array<{ message: string }> };
      res.status(resp.status).json({ error: err.errors?.[0]?.message || "Failed to post shout." }); return;
    }
    res.json({ success: true, message: "Shout опубликован" });
  } catch (err) {
    res.status(502).json({ error: "Failed to post shout." });
  }
});

router.post("/automation/shout/:groupId/schedule", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  if (!cookie) { res.status(401).json({ error: "No active Roblox session." }); return; }
  const { groupId } = req.params;
  const { message, scheduledAt } = req.body as { message?: string; scheduledAt?: number };
  if (!message || !scheduledAt) { res.status(400).json({ error: "message and scheduledAt required." }); return; }
  if (scheduledAt <= Date.now()) { res.status(400).json({ error: "scheduledAt must be in the future." }); return; }
  const shout: ScheduledShout = {
    id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
    groupId,
    message,
    scheduledAt,
    posted: false,
  };
  scheduledShouts.push(shout);
  res.json({ success: true, shout, message: "Shout запланирован" });
});

router.delete("/automation/shout/scheduled/:id", async (req, res): Promise<void> => {
  const { id } = req.params;
  const idx = scheduledShouts.findIndex(s => s.id === id);
  if (idx === -1) { res.status(404).json({ error: "Shout not found." }); return; }
  scheduledShouts.splice(idx, 1);
  res.json({ success: true });
});

router.post("/automation/payout/:groupId", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  if (!cookie) { res.status(401).json({ error: "No active Roblox session." }); return; }
  const { groupId } = req.params;
  const { payouts, payoutType = "FixedAmount" } = req.body as {
    payouts?: Array<{ recipientId: number; amount: number }>;
    payoutType?: "FixedAmount" | "Percentage";
  };
  if (!payouts?.length) { res.status(400).json({ error: "payouts array required." }); return; }
  try {
    const body = {
      PayoutType: payoutType,
      Recipients: payouts.map(p => ({ recipientId: p.recipientId, recipientType: "User", amount: p.amount })),
    };
    const resp = await fetchWithCsrfRetry(`${ECONOMY_API}/v1/groups/${groupId}/payouts`, cookie, {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({})) as { errors?: Array<{ message: string }> };
      res.status(resp.status).json({ error: err.errors?.[0]?.message || "Failed to send payout." }); return;
    }
    res.json({ success: true, message: `Выплата отправлена ${payouts.length} участникам` });
  } catch (err) {
    res.status(502).json({ error: "Failed to send payout." });
  }
});

router.get("/automation/activity/:groupId", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  if (!cookie) { res.status(401).json({ error: "No active Roblox session." }); return; }
  const { groupId } = req.params;
  const roleId = req.query.roleId as string | undefined;
  try {
    let url = `${GROUPS_API}/v1/groups/${groupId}/users?limit=100&sortOrder=Desc`;
    if (roleId) url += `&roleId=${roleId}`;
    const resp = await fetch(url, { headers: rHeaders(cookie) });
    if (!resp.ok) { res.status(resp.status).json({ error: `Roblox API ${resp.status}` }); return; }
    const data = await resp.json() as {
      data: Array<{ user: { userId: number; username: string; displayName: string }; role: { id: number; name: string; rank: number } }>;
      nextPageCursor?: string;
    };

    const members = data.data || [];
    const userIds = members.map(m => m.user.userId).slice(0, 50);
    let lastOnline: Record<number, string> = {};

    if (userIds.length > 0) {
      try {
        const presResp = await fetch("https://presence.roblox.com/v1/presence/users", {
          method: "POST",
          headers: { ...rHeaders(cookie), "Content-Type": "application/json" },
          body: JSON.stringify({ userIds }),
        });
        if (presResp.ok) {
          const presData = await presResp.json() as { userPresences: Array<{ userId: number; lastOnline: string; userPresenceType: number }> };
          for (const p of (presData.userPresences || [])) {
            lastOnline[p.userId] = p.lastOnline;
          }
        }
      } catch {}
    }

    res.json({
      members: members.map(m => ({
        ...m,
        lastOnline: lastOnline[m.user.userId] || null,
      })),
      nextPageCursor: data.nextPageCursor,
    });
  } catch (err) {
    res.status(502).json({ error: "Failed to fetch activity." });
  }
});

export default router;
