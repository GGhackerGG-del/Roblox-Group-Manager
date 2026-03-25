import { Router, type IRouter } from "express";

const router: IRouter = Router();

const GROUPS_API = "https://groups.roblox.com";
const USERS_API = "https://users.roblox.com";
const TWO_STEP_API = "https://twostepverification.roblox.com";
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

async function getSafeCsrf(cookie: string): Promise<string> {
  const hdrs: Record<string, string> = {
    "Cookie": `.ROBLOSECURITY=${cookie}`,
    "Content-Length": "0",
    "User-Agent": UA,
    "Referer": "https://www.roblox.com/",
    "Origin": "https://www.roblox.com",
  };

  const endpoints = [
    { url: "https://auth.roblox.com/v2/logout", method: "POST" },
    { url: "https://catalog.roblox.com/v1/catalog/items/details", method: "POST" },
    { url: "https://auth.roblox.com/v2/metadata", method: "POST" },
  ];

  for (let attempt = 0; attempt < 3; attempt++) {
    for (const ep of endpoints) {
      try {
        const r = await fetch(ep.url, { method: ep.method, headers: hdrs });
        const token = r.headers.get("x-csrf-token");
        if (token) {
          console.log(`[Automation] CSRF obtained from ${ep.url} (attempt ${attempt + 1})`);
          return token;
        }
      } catch {}
    }
    if (attempt < 2) {
      await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
    }
  }
  console.error("[Automation] Failed to get CSRF after all attempts");
  return "";
}

async function fetchWithCsrfRetry(url: string, cookie: string, opts: RequestInit): Promise<Response> {
  const csrf = await getSafeCsrf(cookie);
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

router.get("/automation/search-member/:groupId", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  if (!cookie) { res.status(401).json({ error: "No active Roblox session." }); return; }
  const { groupId } = req.params;
  const username = (req.query.username as string || "").trim();
  if (!username) { res.status(400).json({ error: "username required" }); return; }
  try {
    const userResp = await fetch("https://users.roblox.com/v1/usernames/users", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }),
    });
    if (!userResp.ok) { res.status(userResp.status).json({ error: `Roblox Users API ${userResp.status}` }); return; }
    const userData = await userResp.json() as { data: Array<{ requestedUsername: string; id: number; name: string; displayName: string }> };
    if (!userData.data?.length) { res.json({ members: [] }); return; }

    const members: Array<{ user: { userId: number; username: string; displayName: string }; role: { id: number; name: string; rank: number } }> = [];
    for (const u of userData.data) {
      const grpResp = await fetch(`${GROUPS_API}/v2/users/${u.id}/groups/roles`, {
        headers: { "User-Agent": UA, "Accept": "application/json" },
      });
      if (!grpResp.ok) continue;
      const grpData = await grpResp.json() as { data: Array<{ group: { id: number }; role: { id: number; name: string; rank: number } }> };
      const membership = grpData.data?.find(g => String(g.group.id) === String(groupId));
      if (membership) {
        members.push({
          user: { userId: u.id, username: u.name, displayName: u.displayName },
          role: membership.role,
        });
      }
    }
    res.json({ members });
  } catch (err) {
    console.error("[Automation] search-member error:", err);
    res.status(502).json({ error: "Failed to search member." });
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
  const rawCookie = req.session.robloxCookie;
  if (!rawCookie) { res.status(401).json({ error: "No active Roblox session." }); return; }
  const cookie = rawCookie.startsWith(".ROBLOSECURITY=") ? rawCookie.slice(".ROBLOSECURITY=".length) : rawCookie;
  const { groupId } = req.params;
  const { payouts, payoutType = "FixedAmount", challengeId, verificationToken } = req.body as {
    payouts?: Array<{ recipientId: number; amount: number }>;
    payoutType?: "FixedAmount" | "Percentage";
    challengeId?: string;
    verificationToken?: string;
  };
  if (!payouts?.length) { res.status(400).json({ error: "payouts array required." }); return; }
  try {
    const verifyResp = await fetch("https://users.roblox.com/v1/users/authenticated", {
      headers: { "Cookie": `.ROBLOSECURITY=${cookie}`, "User-Agent": UA },
    });
    console.log(`[Payout] Cookie verify: status=${verifyResp.status}`);
    if (!verifyResp.ok) {
      res.status(401).json({ error: "Roblox cookie expired. Please re-login." });
      return;
    }
    const body = {
      PayoutType: payoutType,
      Recipients: payouts.map(p => ({ recipientId: p.recipientId, recipientType: "User", amount: p.amount })),
    };
    let csrf = await getSafeCsrf(cookie);
    console.log(`[Payout] Got CSRF: ${csrf ? "yes" : "no"}`);
    const payoutHeaders: Record<string, string> = {
      "Cookie": `.ROBLOSECURITY=${cookie}`,
      "X-CSRF-TOKEN": csrf || "",
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": UA,
      "Referer": "https://www.roblox.com/",
      "Origin": "https://www.roblox.com",
    };
    if (challengeId && verificationToken) {
      payoutHeaders["rblx-challenge-id"] = challengeId;
      payoutHeaders["rblx-challenge-type"] = "twostepverification";
      payoutHeaders["rblx-challenge-metadata"] = Buffer.from(JSON.stringify({
        verificationToken,
        rememberDevice: false,
        challengeId,
      })).toString("base64");
    }
    console.log(`[Payout] Sending to ${GROUPS_API}/v1/groups/${groupId}/payouts, body=${JSON.stringify(body)}`);
    let resp: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      resp = await fetch(`${GROUPS_API}/v1/groups/${groupId}/payouts`, { method: "POST", headers: payoutHeaders, body: JSON.stringify(body) });
      console.log(`[Payout] Attempt ${attempt + 1}: status=${resp.status}`);
      if (resp.status === 403) {
        const newCsrf = resp.headers.get("x-csrf-token");
        if (newCsrf) {
          csrf = newCsrf;
          payoutHeaders["X-CSRF-TOKEN"] = newCsrf;
          console.log(`[Payout] Got new CSRF from 403 response, retrying...`);
          continue;
        }
      }
      if (resp.status === 401) {
        const freshCsrf = await getSafeCsrf(cookie);
        if (freshCsrf && attempt < 2) {
          csrf = freshCsrf;
          payoutHeaders["X-CSRF-TOKEN"] = freshCsrf;
          console.log(`[Payout] Re-fetched CSRF after 401, retrying...`);
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
      }
      break;
    }
    if (!resp) { res.status(500).json({ error: "Failed to send payout" }); return; }
    if (resp.status === 403) {
      const rblxChallengeId = resp.headers.get("rblx-challenge-id");
      const rblxChallengeType = resp.headers.get("rblx-challenge-type");
      if (rblxChallengeId && rblxChallengeType === "twostepverification") {
        const metaRaw = resp.headers.get("rblx-challenge-metadata");
        let metadata: any = {};
        if (metaRaw) { try { metadata = JSON.parse(Buffer.from(metaRaw, "base64").toString()); } catch {} }
        res.status(403).json({
          error: "2FA required",
          requires2FA: true,
          challengeId: rblxChallengeId,
          userId: metadata.userId,
          mediaType: metadata.mediaType || "Email",
        });
        return;
      }
    }
    if (!resp.ok) {
      const raw = await resp.text().catch(() => "");
      console.error(`[Payout] Roblox API error: status=${resp.status} body=${raw.slice(0, 500)}`);
      const payoutErrors: Record<number, string> = {
        1: "Group is invalid or does not exist",
        12: "Insufficient Robux in group funds",
        23: "Insufficient permissions to make payouts",
        24: "Payout amount is too small",
        25: "Too many payout recipients",
        29: "Recipient must be a group member",
      };
      let errMsg = "";
      try {
        const err = JSON.parse(raw) as { errors?: Array<{ message: string; code?: number }>; message?: string };
        const robloxErr = err.errors?.[0];
        if (robloxErr) {
          const friendlyMsg = robloxErr.code !== undefined ? payoutErrors[robloxErr.code] : undefined;
          errMsg = friendlyMsg || robloxErr.message || "";
        }
        if (!errMsg) errMsg = err.message || "";
      } catch {}
      if (!errMsg) {
        if (resp.status === 429) errMsg = "Rate limited by Roblox. Try again in a few seconds.";
        else if (resp.status === 401) errMsg = "Roblox session expired. Please re-login.";
        else errMsg = `Roblox API error (HTTP ${resp.status})`;
      }
      res.status(resp.status).json({ error: errMsg }); return;
    }
    res.json({ success: true, message: `Выплата отправлена ${payouts.length} участникам` });
  } catch (err) {
    console.error(`[Payout] Exception:`, err);
    res.status(502).json({ error: err instanceof Error ? err.message : "Failed to send payout." });
  }
});

router.post("/automation/payout/:groupId/verify-2fa", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  if (!cookie) { res.status(401).json({ error: "No active Roblox session." }); return; }
  const { challengeId, code, mediaType = "Authenticator" } = req.body as { challengeId?: string; code?: string; mediaType?: string };
  if (!challengeId || !code) { res.status(400).json({ error: "challengeId and code required." }); return; }
  try {
    const meResp = await fetch(`${USERS_API}/v1/users/authenticated`, {
      headers: { Cookie: `.ROBLOSECURITY=${cookie}`, "User-Agent": UA },
    });
    if (!meResp.ok) { res.status(401).json({ error: "Could not resolve Roblox user." }); return; }
    const me = await meResp.json() as { id: number };
    const verifyMethod = mediaType === "Email" ? "email" : mediaType === "SMS" ? "sms" : "authenticator";
    const verifyResp = await fetch(`${TWO_STEP_API}/v1/users/${me.id}/challenges/${verifyMethod}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `.ROBLOSECURITY=${cookie}`, "User-Agent": UA },
      body: JSON.stringify({ challengeId, actionType: "Generic", code }),
    });
    if (!verifyResp.ok) {
      const err = await verifyResp.json().catch(() => ({})) as any;
      res.status(verifyResp.status).json({ error: err.errors?.[0]?.message || "Invalid 2FA code." }); return;
    }
    const verifyData = await verifyResp.json() as { verificationToken?: string };
    if (!verifyData.verificationToken) {
      res.status(400).json({ error: "No verification token received." }); return;
    }
    res.json({ verificationToken: verifyData.verificationToken });
  } catch {
    res.status(502).json({ error: "Failed to verify 2FA code." });
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
