import express from "express";
import cors from "cors";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";
import type Database from "better-sqlite3";
import { SQLiteSessionStore } from "../db/session-store.cjs";

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

  const routesBundle = require(path.join(__dirname, "..", "server", "_routes-entry.js"));
  const router = routesBundle.default || routesBundle;
  app.use("/api", router);

  try {
    require(path.join(__dirname, "..", "server", "_bot-entry.js"));
    console.log("[Desktop] Telegram bot loaded");
  } catch (err) {
    console.warn("[Desktop] Telegram bot not available:", (err as Error).message);
  }

  const uploadsPath = path.join(__dirname, "..", "uploads");
  app.use("/uploads", express.static(uploadsPath));

  app.use(express.static(frontendPath));

  app.get("*", (_req, res) => {
    res.sendFile(path.join(frontendPath, "index.html"));
  });

  return app;
}
