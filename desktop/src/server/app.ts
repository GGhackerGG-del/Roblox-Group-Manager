import express from "express";
import cors from "cors";
import session from "express-session";
import path from "path";
import type Database from "better-sqlite3";
import { SQLiteSessionStore } from "../db/session-store.js";

const REMOTE_API = process.env.REMOTE_API_URL || "https://Limited-ink.replit.app";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

let remoteSessionCookie: string | null = null;
let _sqliteDb: Database.Database | null = null;

function initCookieTable(db: Database.Database) {
  _sqliteDb = db;
  db.exec(`CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT)`);
  const row = db.prepare(`SELECT value FROM kv_store WHERE key = 'remote_session_cookie'`).get() as { value: string } | undefined;
  if (row?.value) {
    remoteSessionCookie = row.value;
    console.log("[Proxy] Restored remote session cookie from disk");
  }
}

function persistCookie(cookie: string) {
  remoteSessionCookie = cookie;
  if (_sqliteDb) {
    _sqliteDb.prepare(`INSERT OR REPLACE INTO kv_store (key, value) VALUES ('remote_session_cookie', ?)`).run(cookie);
  }
}

async function fetchRobloxCookieFromRemote(authHeaders: Record<string, string>): Promise<string | null> {
  try {
    const fetchFn = (globalThis as any).fetch || (await import("node-fetch")).default;
    const headers: Record<string, string> = { ...authHeaders };
    if (remoteSessionCookie) {
      headers["Cookie"] = remoteSessionCookie;
    }
    const resp = await fetchFn(`${REMOTE_API}/api/roblox/session-cookie`, { headers });
    if (!resp.ok) return null;
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
        const r = await fetchFn(ep.url, { method: ep.method, headers: hdrs, body: ep.body });
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

    const verifyResp = await fetchFn("https://users.roblox.com/v1/users/authenticated", {
      headers: { "Cookie": `.ROBLOSECURITY=${cookieValue}`, "User-Agent": UA },
    });
    console.log(`[DirectPayout] Cookie verify: status=${verifyResp.status}`);
    if (!verifyResp.ok) {
      res.status(401).json({ error: "Roblox cookie expired. Please re-login." });
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

    for (let attempt = 0; attempt < 2; attempt++) {
      resp = await fetchFn(payoutUrl, { method: "POST", headers: payoutHeaders, body: JSON.stringify(body) });
      respBody = await resp.text();
      console.log(`[DirectPayout] Attempt ${attempt + 1}: status=${resp.status}`);
      console.log(`[DirectPayout] Response: ${respBody.slice(0, 500)}`);

      if (resp.status === 403) {
        const rblxChallengeId = resp.headers.get("rblx-challenge-id");
        const rblxChallengeType = resp.headers.get("rblx-challenge-type");
        const metaRaw = resp.headers.get("rblx-challenge-metadata");
        let metadata: any = {};
        if (metaRaw) { try { metadata = JSON.parse(Buffer.from(metaRaw, "base64").toString()); } catch {} }

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

    res.json({ success: true, message: `Выплата отправлена ${payouts.length} участникам` });
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

    const meResp = await fetchFn("https://users.roblox.com/v1/users/authenticated", {
      headers: { Cookie: `.ROBLOSECURITY=${cookieValue}`, "User-Agent": UA },
    });
    if (!meResp.ok) {
      res.status(401).json({ error: "Could not resolve Roblox user." });
      return;
    }
    const me = await meResp.json() as { id: number };

    const verifyMethod = mediaType === "Email" ? "email" : mediaType === "SMS" ? "sms" : "authenticator";
    const verifyUrl = `https://twostepverification.roblox.com/v1/users/${me.id}/challenges/${verifyMethod}/verify`;

    const csrf = await getDirectCsrf(cookieValue);

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
    });

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
    });
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

    const hasBody = req.method !== "GET" && req.method !== "HEAD" && req.method !== "DELETE";
    if (hasBody && req.body != null) {
      headers["Content-Type"] = "application/json";
    }

    if (remoteSessionCookie) {
      headers["Cookie"] = remoteSessionCookie;
    }

    const url = `${REMOTE_API}${remotePath}`;
    console.log(`[Proxy] ${req.method} ${url}`);

    const response = await fetchFn(url, {
      method: req.method,
      headers,
      body: hasBody && req.body != null ? JSON.stringify(req.body) : undefined,
      redirect: "manual",
    });

    const setCookieHeaders = response.headers.getSetCookie
      ? response.headers.getSetCookie()
      : (response.headers.raw?.()?.["set-cookie"] || []);

    if (setCookieHeaders && setCookieHeaders.length > 0) {
      const isAuthRoute = remotePath.includes("/roblox/auth") || remotePath.includes("/license/");
      for (const sc of setCookieHeaders) {
        const match = sc.match(/^(connect\.sid=[^;]+)/);
        if (match) {
          if (isAuthRoute || !remoteSessionCookie) {
            persistCookie(match[1]);
            console.log("[Proxy] Remote session cookie captured & persisted from", remotePath);
          } else {
            if (match[1] !== remoteSessionCookie) {
              console.warn("[Proxy] Ignoring new session cookie from non-auth route:", remotePath, "- keeping existing session");
            }
          }
        }
      }
    }

    const contentType = response.headers.get("content-type") || "";
    const status = response.status;

    if (contentType.includes("application/json")) {
      const data = await response.json();
      res.status(status).json(data);
    } else {
      const text = await response.text();
      res.status(status).type(contentType.split(";")[0] || "text/plain").send(text);
    }
  } catch (err: any) {
    console.error("[Proxy] Error:", err.message);
    res.status(502).json({ error: "Cannot connect to license server. Check internet connection." });
  }
}

export function createApp(sqlite: Database.Database): express.Express {
  initCookieTable(sqlite);
  const app = express();

  app.use(cors({
    origin: true,
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-Device-Fingerprint"],
  }));
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  const sessionStore = new SQLiteSessionStore({ db: sqlite });

  app.use(session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || "limited-ink-desktop-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
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

  app.use("/api", (req, res) => {
    const remotePath = `/api${req.url}`;
    proxyToRemote(remotePath, req, res);
  });

  const uploadsPath = path.join(__dirname, "..", "uploads");
  app.use("/uploads", express.static(uploadsPath));

  app.use(express.static(frontendPath));

  app.use((_req, res) => {
    res.sendFile(path.join(frontendPath, "index.html"));
  });

  return app;
}
