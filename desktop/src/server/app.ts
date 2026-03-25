import express from "express";
import cors from "cors";
import session from "express-session";
import path from "path";
import type Database from "better-sqlite3";
import { SQLiteSessionStore } from "../db/session-store.js";

const REMOTE_API = process.env.REMOTE_API_URL || "https://Limited-ink.replit.app";

async function proxyToRemote(
  remotePath: string,
  req: express.Request,
  res: express.Response
): Promise<void> {
  try {
    const fetch = (globalThis as any).fetch || (await import("node-fetch")).default;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (req.headers.authorization) {
      headers["Authorization"] = req.headers.authorization as string;
    }
    if (req.headers["x-device-fingerprint"]) {
      headers["X-Device-Fingerprint"] = req.headers["x-device-fingerprint"] as string;
    }

    const response = await fetch(`${REMOTE_API}${remotePath}`, {
      method: req.method,
      headers,
      body: req.method !== "GET" ? JSON.stringify(req.body) : undefined,
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err: any) {
    console.error("[License Proxy] Error:", err.message);
    res.status(502).json({ error: "Cannot connect to license server. Check internet connection." });
  }
}

export function createApp(sqlite: Database.Database): express.Express {
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
