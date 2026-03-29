import express from "express";
import cors from "cors";
import session from "express-session";
import path from "path";
import crypto from "crypto";
import { FileSessionStore } from "../db/session-store.js";
import { getStoreValue, setStoreValue } from "../db/index.js";

const REMOTE_API = process.env.REMOTE_API_URL || "https://Limited-ink.replit.app";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function solveChefPoWDirect(sessionId: string, difficulty: number): Promise<string> {
  const targetZeroBytes = difficulty;
  const target = Buffer.alloc(targetZeroBytes, 0);
  const MAX = 100_000_000;
  const BATCH = 10000;
  const start = Date.now();
  for (let nonce = 0; nonce < MAX; nonce++) {
    const candidate = `${sessionId}.${nonce}`;
    const hash = crypto.createHash("sha256").update(candidate).digest();
    if (hash.subarray(0, targetZeroBytes).equals(target)) {
      console.log(`[ChefPoW] Solved in ${Date.now() - start}ms, nonce=${nonce} (${targetZeroBytes} zero bytes)`);
      return String(nonce);
    }
    if (nonce % BATCH === 0 && nonce > 0) {
      await new Promise<void>(r => setImmediate(r));
    }
  }
  throw new Error("PoW nonce search exhausted");
}

async function solveChefChallenge(
  challengeId: string,
  metadata: any,
  cookieValue: string,
  fetchFn: any
): Promise<{ solutionB64: string; continued: boolean } | null> {
  const chefHeaders: Record<string, string> = {
    "Cookie": `.ROBLOSECURITY=${cookieValue}`,
    "User-Agent": UA,
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Origin": "https://www.roblox.com",
    "Referer": "https://www.roblox.com/",
  };

  for (let round = 0; round < 3; round++) {
    try {
      const sessionId = metadata.sessionId || metadata.challengeId || challengeId;
      const difficulty = metadata.difficulty ?? 5;
      console.log(`[ChefPoW] Round ${round + 1}: sessionId=${sessionId}, difficulty=${difficulty}, challengeId=${challengeId}`);
      console.log(`[ChefPoW] Full metadata: ${JSON.stringify(metadata)}`);

      const nonce = await solveChefPoWDirect(sessionId, Number(difficulty));

      const formats = [
        { sessionId, nonce },
        { sessionId, redemptionToken: nonce, answer: nonce },
        { sessionId, nonce, answer: nonce },
      ];

      for (const fmt of formats) {
        const payload = JSON.stringify(fmt);
        const b64 = Buffer.from(payload).toString("base64");

        const chefCtrl = new AbortController();
        const chefT = setTimeout(() => chefCtrl.abort(), 15000);
        const continueResp = await fetchFn("https://apis.roblox.com/challenge/v1/continue", {
          method: "POST",
          headers: chefHeaders,
          body: JSON.stringify({
            challengeId,
            challengeType: "chef",
            challengeMetadata: payload,
          }),
          signal: chefCtrl.signal,
        });
        clearTimeout(chefT);
        const continueText = await continueResp.text();
        console.log(`[ChefPoW] continue (fmt=${JSON.stringify(fmt).slice(0, 80)}): status=${continueResp.status} body=${continueText.slice(0, 300)}`);

        if (continueResp.ok) {
          return { solutionB64: b64, continued: true };
        }
      }

      const directB64 = Buffer.from(JSON.stringify({ sessionId, nonce })).toString("base64");
      console.log(`[ChefPoW] All continue formats failed, will try direct header approach`);
      return { solutionB64: directB64, continued: false };
    } catch (err: any) {
      console.error(`[ChefPoW] Round ${round + 1} error:`, err.message);
    }
  }
  console.error("[ChefPoW] All rounds exhausted");
  return null;
}

let remoteSessionCookie: string | null = null;
let authInFlight: Promise<void> | null = null;
let authResolve: (() => void) | null = null;

function initCookieStore() {
  const saved = getStoreValue("remote_session_cookie");
  if (saved) {
    remoteSessionCookie = saved;
    console.log("[Proxy] Restored remote session cookie from disk");
  }
}

function persistCookie(cookie: string) {
  remoteSessionCookie = cookie;
  setStoreValue("remote_session_cookie", cookie);
}

function beginAuthLock(): void {
  if (!authInFlight) {
    authInFlight = new Promise<void>(resolve => { authResolve = resolve; });
  }
}

function releaseAuthLock(): void {
  if (authResolve) { authResolve(); }
  authInFlight = null;
  authResolve = null;
}

async function waitForAuth(): Promise<void> {
  if (authInFlight) {
    await Promise.race([authInFlight, new Promise<void>(r => setTimeout(r, 15000))]);
  }
}

async function fetchRobloxCookieFromRemote(authHeaders: Record<string, string>): Promise<string | null> {
  try {
    const fetchFn = (globalThis as any).fetch || (await import("node-fetch")).default;
    const headers: Record<string, string> = { ...authHeaders };
    if (remoteSessionCookie) {
      headers["Cookie"] = remoteSessionCookie;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const resp = await fetchFn(`${REMOTE_API}/api/roblox/session-cookie`, {
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!resp.ok) {
      console.error(`[DirectPayout] session-cookie returned ${resp.status}`);
      return null;
    }
    const data = await resp.json() as { cookie?: string };
    return data.cookie || null;
  } catch (err: any) {
    console.error("[DirectPayout] Failed to fetch cookie from remote:", err.message);
    return null;
  }
}

async function getDirectCsrf(robloxCookie: string): Promise<string> {
  const fetchFn = (globalThis as any).fetch || (await import("node-fetch")).default;
  const hdrs: Record<string, string> = {
    "Cookie": `.ROBLOSECURITY=${robloxCookie}`,
    "Content-Type": "application/json",
    "User-Agent": UA,
  };

  const endpoints = [
    { url: "https://groups.roblox.com/v1/groups/configuration/metadata", method: "GET" },
    { url: "https://auth.roblox.com/v2/metadata", method: "GET" },
    { url: "https://catalog.roblox.com/v1/catalog/items/details", method: "POST", body: JSON.stringify({ items: [] }) },
  ];

  for (let attempt = 0; attempt < 3; attempt++) {
    for (const ep of endpoints) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 10000);
        const r = await fetchFn(ep.url, { method: ep.method, headers: hdrs, body: ep.body, signal: ctrl.signal });
        clearTimeout(t);
        const token = r.headers.get("x-csrf-token");
        if (token) {
          console.log(`[DirectPayout] CSRF obtained from ${ep.url}`);
          return token;
        }
      } catch {}
    }
    if (attempt < 2) await new Promise(r => setTimeout(r, (attempt + 1) * 1000));
  }
  return "";
}

async function handleDirectPayout(
  req: express.Request,
  res: express.Response
): Promise<void> {
  try {
    const fetchFn = (globalThis as any).fetch || (await import("node-fetch")).default;
    const groupId = req.params.groupId;
    const { payouts, payoutType = "FixedAmount", challengeId, verificationToken, challengeType: reqChallengeType } = req.body as {
      payouts?: Array<{ recipientId: number; amount: number }>;
      payoutType?: string;
      challengeId?: string;
      verificationToken?: string;
      challengeType?: string;
    };

    if (!payouts?.length) {
      res.status(400).json({ error: "payouts array required." });
      return;
    }

    const authHdrs: Record<string, string> = {};
    if (req.headers.authorization) authHdrs["Authorization"] = req.headers.authorization as string;
    if (req.headers["x-device-fingerprint"]) authHdrs["X-Device-Fingerprint"] = req.headers["x-device-fingerprint"] as string;

    const robloxCookie = await fetchRobloxCookieFromRemote(authHdrs);
    if (!robloxCookie) {
      res.status(401).json({ error: "No active Roblox session." });
      return;
    }

    const cookieValue = robloxCookie.startsWith(".ROBLOSECURITY=")
      ? robloxCookie.slice(".ROBLOSECURITY=".length)
      : robloxCookie;

    console.log(`[DirectPayout] Got Roblox cookie (len=${cookieValue.length}), making direct payout for group ${groupId}`);

    const verifyCtrl = new AbortController();
    const verifyTimeout = setTimeout(() => verifyCtrl.abort(), 15000);
    const verifyResp = await fetchFn("https://users.roblox.com/v1/users/authenticated", {
      headers: { "Cookie": `.ROBLOSECURITY=${cookieValue}`, "User-Agent": UA },
      signal: verifyCtrl.signal,
    });
    clearTimeout(verifyTimeout);
    console.log(`[DirectPayout] Cookie verify: status=${verifyResp.status}`);
    if (!verifyResp.ok) {
      if (verifyResp.status === 401) {
        res.status(401).json({ error: "Roblox cookie expired. Please re-login." });
      } else {
        res.status(502).json({ error: "Roblox API unavailable. Please try again." });
      }
      return;
    }
    const verifyData = await verifyResp.json() as { id?: number; name?: string };
    console.log(`[DirectPayout] Verified user: ${verifyData.name} (${verifyData.id})`);

    const csrf = await getDirectCsrf(cookieValue);
    console.log(`[DirectPayout] Got CSRF: ${csrf ? `yes (len=${csrf.length})` : "no"}`);

    const body = {
      PayoutType: payoutType,
      Recipients: payouts.map(p => ({ recipientId: p.recipientId, recipientType: "User", amount: p.amount })),
    };

    const payoutHeaders: Record<string, string> = {
      "Cookie": `.ROBLOSECURITY=${cookieValue}`,
      "X-CSRF-TOKEN": csrf || "",
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": UA,
    };

    if (challengeId && verificationToken) {
      const ct = reqChallengeType || "twostepverification";
      payoutHeaders["rblx-challenge-id"] = challengeId;
      payoutHeaders["rblx-challenge-type"] = ct;
      payoutHeaders["rblx-challenge-metadata"] = Buffer.from(JSON.stringify({
        verificationToken,
        rememberDevice: false,
        actionType: "Generic",
        challengeId,
      })).toString("base64");
      console.log(`[DirectPayout] Retrying with challenge: type=${ct}`);
    }

    const payoutUrl = `https://groups.roblox.com/v1/groups/${groupId}/payouts`;
    console.log(`[DirectPayout] Sending to ${payoutUrl}`);

    let resp: any = null;
    let respBody = "";

    for (let attempt = 0; attempt < 5; attempt++) {
      const payCtrl = new AbortController();
      const payTimeout = setTimeout(() => payCtrl.abort(), 30000);
      resp = await fetchFn(payoutUrl, { method: "POST", headers: payoutHeaders, body: JSON.stringify(body), signal: payCtrl.signal });
      clearTimeout(payTimeout);
      respBody = await resp.text();
      const allHeaders = Object.fromEntries(resp.headers.entries());
      console.log(`[DirectPayout] Attempt ${attempt + 1}: status=${resp.status}`);
      console.log(`[DirectPayout] Response body: ${respBody.slice(0, 500)}`);
      console.log(`[DirectPayout] Response headers: ${JSON.stringify(allHeaders)}`);

      if (resp.status === 403) {
        const rblxChallengeId = resp.headers.get("rblx-challenge-id");
        const rblxChallengeType = resp.headers.get("rblx-challenge-type");
        const metaRaw = resp.headers.get("rblx-challenge-metadata");
        let metadata: any = {};
        if (metaRaw) { try { metadata = JSON.parse(Buffer.from(metaRaw, "base64").toString()); } catch {} }

        if (rblxChallengeId && rblxChallengeType === "chef") {
          console.log(`[DirectPayout] Chef PoW challenge detected, solving...`);
          const solution = await solveChefChallenge(rblxChallengeId, metadata, cookieValue, fetchFn);
          if (solution) {
            payoutHeaders["rblx-challenge-id"] = rblxChallengeId;
            payoutHeaders["rblx-challenge-type"] = "chef";
            payoutHeaders["rblx-challenge-metadata"] = solution.solutionB64;
            console.log(`[DirectPayout] Chef PoW solved (continued=${solution.continued}), retrying payout...`);
            continue;
          } else {
            res.status(403).json({ error: "Failed to solve Roblox security challenge. Please try again." });
            return;
          }
        }

        if (rblxChallengeId && (rblxChallengeType === "twostepverification" || rblxChallengeType === "reauthentication")) {
          res.status(403).json({
            error: "2FA required",
            requires2FA: true,
            challengeId: rblxChallengeId,
            challengeType: rblxChallengeType,
            userId: metadata.userId || verifyData.id,
            mediaType: metadata.mediaType || "Authenticator",
          });
          return;
        }

        if (rblxChallengeId) {
          res.status(403).json({ error: `Roblox security challenge required (${rblxChallengeType || "unknown"}). Try making a payout on the Roblox website first, then retry here.` });
          return;
        }

        const newCsrf = resp.headers.get("x-csrf-token");
        if (newCsrf) {
          payoutHeaders["X-CSRF-TOKEN"] = newCsrf;
          console.log(`[DirectPayout] Got fresh CSRF from 403, retrying...`);
          continue;
        }
      }

      if (resp.status === 401) {
        const postCheck = await fetchFn("https://users.roblox.com/v1/users/authenticated", {
          headers: { "Cookie": `.ROBLOSECURITY=${cookieValue}`, "User-Agent": UA },
        });
        console.log(`[DirectPayout] Post-401 verify: status=${postCheck.status} (cookie ${postCheck.ok ? "ALIVE" : "DEAD"})`);
      }
      break;
    }

    if (!resp) {
      res.status(500).json({ error: "Failed to send payout" });
      return;
    }

    if (!resp.ok) {
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
        const err = JSON.parse(respBody) as { errors?: Array<{ message: string; code?: number }>; message?: string };
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
      res.status(resp.status).json({ error: errMsg });
      return;
    }

    res.json({ success: true, message: `Payout sent to ${payouts.length} recipients` });
  } catch (err: any) {
    console.error("[DirectPayout] Exception:", err);
    res.status(502).json({ error: err instanceof Error ? err.message : "Failed to send payout." });
  }
}

async function handleDirectVerify2fa(
  req: express.Request,
  res: express.Response
): Promise<void> {
  try {
    const fetchFn = (globalThis as any).fetch || (await import("node-fetch")).default;
    const groupId = req.params.groupId;
    const { challengeId, code, mediaType = "Authenticator", challengeType } = req.body as {
      challengeId?: string; code?: string; mediaType?: string; challengeType?: string;
    };

    if (!challengeId || !code) {
      res.status(400).json({ error: "challengeId and code required." });
      return;
    }

    const authHdrs: Record<string, string> = {};
    if (req.headers.authorization) authHdrs["Authorization"] = req.headers.authorization as string;
    if (req.headers["x-device-fingerprint"]) authHdrs["X-Device-Fingerprint"] = req.headers["x-device-fingerprint"] as string;

    const robloxCookie = await fetchRobloxCookieFromRemote(authHdrs);
    if (!robloxCookie) {
      res.status(401).json({ error: "No active Roblox session." });
      return;
    }

    const cookieValue = robloxCookie.startsWith(".ROBLOSECURITY=")
      ? robloxCookie.slice(".ROBLOSECURITY=".length)
      : robloxCookie;

    const meCtrl = new AbortController();
    const meTimeout = setTimeout(() => meCtrl.abort(), 15000);
    const meResp = await fetchFn("https://users.roblox.com/v1/users/authenticated", {
      headers: { Cookie: `.ROBLOSECURITY=${cookieValue}`, "User-Agent": UA },
      signal: meCtrl.signal,
    });
    clearTimeout(meTimeout);
    if (!meResp.ok) {
      res.status(401).json({ error: "Could not resolve Roblox user." });
      return;
    }
    const me = await meResp.json() as { id: number };

    const verifyMethod = mediaType === "Email" ? "email" : mediaType === "SMS" ? "sms" : "authenticator";
    const verifyUrl = `https://twostepverification.roblox.com/v1/users/${me.id}/challenges/${verifyMethod}/verify`;

    const csrf = await getDirectCsrf(cookieValue);

    const vfCtrl = new AbortController();
    const vfTimeout = setTimeout(() => vfCtrl.abort(), 15000);
    const verifyResp = await fetchFn(verifyUrl, {
      method: "POST",
      headers: {
        "Cookie": `.ROBLOSECURITY=${cookieValue}`,
        "X-CSRF-TOKEN": csrf || "",
        "Content-Type": "application/json",
        "User-Agent": UA,
      },
      body: JSON.stringify({
        challengeId,
        actionType: "Generic",
        code,
      }),
      signal: vfCtrl.signal,
    });
    clearTimeout(vfTimeout);

    if (!verifyResp.ok) {
      const errData = await verifyResp.json().catch(() => ({})) as any;
      res.status(verifyResp.status).json({ error: errData?.errors?.[0]?.message || "2FA verification failed." });
      return;
    }

    const verifyData = await verifyResp.json() as { verificationToken?: string };

    if (!verifyData.verificationToken) {
      res.status(500).json({ error: "No verification token received." });
      return;
    }

    const ct = challengeType || "twostepverification";
    const contCtrl = new AbortController();
    const contTimeout = setTimeout(() => contCtrl.abort(), 15000);
    const continueResp = await fetchFn("https://apis.roblox.com/challenge/v1/continue", {
      method: "POST",
      headers: {
        "Cookie": `.ROBLOSECURITY=${cookieValue}`,
        "X-CSRF-TOKEN": csrf || "",
        "Content-Type": "application/json",
        "User-Agent": UA,
      },
      body: JSON.stringify({
        challengeId,
        challengeType: ct,
        challengeMetadata: JSON.stringify({
          verificationToken: verifyData.verificationToken,
          rememberDevice: false,
          actionType: "Generic",
          challengeId,
        }),
      }),
      signal: contCtrl.signal,
    });
    clearTimeout(contTimeout);
    console.log(`[DirectPayout] Challenge continue: status=${continueResp.status}`);

    res.json({
      success: true,
      verificationToken: verifyData.verificationToken,
      challengeId,
      challengeType: ct,
      message: "2FA verified. Retrying payout...",
    });
  } catch (err: any) {
    console.error("[DirectPayout] 2FA Exception:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "2FA verification failed." });
  }
}

async function proxyToRemote(
  remotePath: string,
  req: express.Request,
  res: express.Response
): Promise<void> {
  try {
    const fetchFn = (globalThis as any).fetch || (await import("node-fetch")).default;

    const headers: Record<string, string> = {};

    if (req.headers.authorization) {
      headers["Authorization"] = req.headers.authorization as string;
    }
    if (req.headers["x-device-fingerprint"]) {
      headers["X-Device-Fingerprint"] = req.headers["x-device-fingerprint"] as string;
    }

    const cookieSnapshot = remoteSessionCookie;
    if (cookieSnapshot) {
      headers["Cookie"] = cookieSnapshot;
    }

    const hasBody = req.method !== "GET" && req.method !== "HEAD" && req.method !== "DELETE";
    const contentTypeLower = (req.headers["content-type"] || "").toLowerCase();
    const isMultipart = contentTypeLower.startsWith("multipart/form-data");
    const contentTypeOriginal = req.headers["content-type"] || "";

    let body: any = undefined;
    if (hasBody) {
      if (isMultipart) {
        headers["Content-Type"] = contentTypeOriginal;
        const chunks: Buffer[] = [];
        await new Promise<void>((resolve, reject) => {
          req.on("data", (chunk: Buffer) => chunks.push(chunk));
          req.on("end", () => resolve());
          req.on("error", reject);
        });
        body = Buffer.concat(chunks);
        headers["Content-Length"] = String(body.length);
      } else if (req.body != null && Object.keys(req.body).length > 0) {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(req.body);
      }
    }

    const url = `${REMOTE_API}${remotePath}`;
    if (isMultipart) {
      console.log(`[Proxy] ${req.method} ${url} (multipart, ${body?.length || 0} bytes, ct=${contentTypeOriginal.slice(0, 80)})`);
    } else {
      console.log(`[Proxy] ${req.method} ${url} (json)`);
    }

    const isLongRunning = remotePath.includes("/clothing/upload") || remotePath.includes("/automation/payout");
    const proxyCtrl = new AbortController();
    const proxyTimeout = setTimeout(() => proxyCtrl.abort(), isLongRunning ? 180000 : 60000);
    const response = await fetchFn(url, {
      method: req.method,
      headers,
      body,
      redirect: "manual",
      signal: proxyCtrl.signal,
    });
    clearTimeout(proxyTimeout);

    const setCookieHeaders = response.headers.getSetCookie
      ? response.headers.getSetCookie()
      : (response.headers.raw?.()?.["set-cookie"] || []);

    const COOKIE_ACCEPT_ROUTES = [
      "/api/roblox/auth",
      "/api/license/activate",
      "/api/license/verify",
    ];
    const isCookieAcceptRoute = COOKIE_ACCEPT_ROUTES.some(r => remotePath.startsWith(r));

    if (setCookieHeaders && setCookieHeaders.length > 0 && response.status < 500) {
      for (const sc of setCookieHeaders) {
        const match = sc.match(/^(connect\.sid=[^;]+)/);
        if (match && match[1] !== remoteSessionCookie) {
          if (!remoteSessionCookie) {
            persistCookie(match[1]);
            console.log("[Proxy] Initial session cookie set from", remotePath);
          } else if (isCookieAcceptRoute && response.status < 400) {
            persistCookie(match[1]);
            console.log("[Proxy] Session cookie updated from auth route", remotePath);
          } else {
            console.log("[Proxy] Ignoring session cookie change from", remotePath, `(status=${response.status}, accept=${isCookieAcceptRoute})`);
          }
        }
      }
    }

    if (
      (response.status === 401 || response.status === 502) &&
      remoteSessionCookie &&
      cookieSnapshot !== remoteSessionCookie &&
      req.method === "GET"
    ) {
      console.log("[Proxy] Session mismatch detected, retrying with updated cookie:", remotePath);
      headers["Cookie"] = remoteSessionCookie;
      const retryResp = await fetchFn(url, {
        method: req.method,
        headers,
        redirect: "manual",
      });
      const retryType = retryResp.headers.get("content-type") || "";
      const retryStatus = retryResp.status;
      if (retryType.includes("application/json")) {
        const data = await retryResp.json();
        res.status(retryStatus).json(data);
      } else {
        const text = await retryResp.text();
        res.status(retryStatus).type(retryType.split(";")[0] || "text/plain").send(text);
      }
      return;
    }

    const respContentType = response.headers.get("content-type") || "";
    const status = response.status;

    if (res.writableEnded || res.destroyed) return;

    if (respContentType.includes("application/json")) {
      const data = await response.json();
      if (!res.writableEnded) res.status(status).json(data);
    } else if (
      respContentType.includes("application/octet-stream") ||
      respContentType.includes("video/") ||
      respContentType.includes("audio/") ||
      respContentType.includes("image/")
    ) {
      res.status(status).type(respContentType.split(";")[0]);
      const cd = response.headers.get("content-disposition");
      if (cd) res.setHeader("content-disposition", cd);
      const arrayBuf = await response.arrayBuffer();
      if (!res.writableEnded) res.send(Buffer.from(arrayBuf));
    } else {
      const text = await response.text();
      if (!res.writableEnded) res.status(status).type(respContentType.split(";")[0] || "text/plain").send(text);
    }
  } catch (err: any) {
    if (res.writableEnded || res.destroyed) return;
    console.error("[Proxy] Error:", err.message);
    res.status(502).json({ error: "Cannot connect to license server. Check internet connection." });
  }
}

export function createApp(): express.Express {
  initCookieStore();
  const app = express();

  app.use(cors({
    origin: true,
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-Device-Fingerprint"],
  }));
  app.use((req, _res, next) => {
    const ct = (req.headers["content-type"] || "").toLowerCase();
    if (ct.startsWith("multipart/form-data")) return next();
    express.json({ limit: "50mb" })(req, _res, next);
  });
  app.use((req, _res, next) => {
    const ct = (req.headers["content-type"] || "").toLowerCase();
    if (ct.startsWith("multipart/form-data")) return next();
    express.urlencoded({ extended: true, limit: "50mb" })(req, _res, next);
  });

  let dataDir: string;
  try {
    const { app: electronApp } = require("electron");
    dataDir = electronApp.getPath("userData");
  } catch {
    dataDir = process.cwd();
  }
  const sessionStore = new FileSessionStore(dataDir);

  app.use(session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || "limited-ink-desktop-secret",
    resave: true,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    },
  }));

  let frontendPath: string;
  if (process.env.ELECTRON_IS_PACKAGED === "true") {
    frontendPath = path.join(process.resourcesPath!, "frontend");
  } else {
    frontendPath = path.join(__dirname, "..", "frontend");
  }

  app.post("/api/automation/payout/:groupId/verify-2fa", (req, res) => {
    handleDirectVerify2fa(req, res);
  });

  app.post("/api/automation/payout/:groupId", (req, res) => {
    handleDirectPayout(req, res);
  });

  app.use("/api", async (req, res) => {
    const remotePath = `/api${req.url}`;
    const isAuthRequest = remotePath === "/api/roblox/auth" && req.method === "POST";
    if (isAuthRequest) {
      beginAuthLock();
      try {
        await proxyToRemote(remotePath, req, res);
      } finally {
        releaseAuthLock();
      }
    } else {
      await waitForAuth();
      await proxyToRemote(remotePath, req, res);
    }
  });

  const uploadsPath = path.join(__dirname, "..", "uploads");
  app.use("/uploads", express.static(uploadsPath));

  app.use(express.static(frontendPath));

  app.use((_req, res) => {
    res.sendFile(path.join(frontendPath, "index.html"));
  });

  return app;
}
