import express from "express";
import cors from "cors";
import session from "express-session";
import path from "path";
import type Database from "better-sqlite3";
import { SQLiteSessionStore } from "../db/session-store.js";

const REMOTE_API = process.env.REMOTE_API_URL || "https://Limited-ink.replit.app";

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
      for (const sc of setCookieHeaders) {
        const match = sc.match(/^(connect\.sid=[^;]+)/);
        if (match) {
          persistCookie(match[1]);
          console.log("[Proxy] Remote session cookie captured & persisted");
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
