import express, { type Express } from "express";
import cors from "cors";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "@workspace/db";
import router from "./routes";

const __dirname_safe = typeof __dirname !== "undefined" ? __dirname : path.dirname(fileURLToPath(import.meta.url));

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable is required but was not provided.");
}

const PgStore = connectPgSimple(session);

const app: Express = express();

app.use(cors({
  origin: true,
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization", "X-Device-Fingerprint"],
}));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use(session({
  store: new PgStore({
    pool,
    tableName: "user_sessions",
    createTableIfMissing: true,
  }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}));

app.use("/api", router);
app.use("/", router);
app.use("/uploads", express.static(path.join(__dirname_safe, "..", "uploads")));

if (process.env.NODE_ENV === "production") {
  const frontendDir = path.join(__dirname_safe, "..", "..", "limited-ink", "dist", "public");
  app.use(express.static(frontendDir));
  app.use((_req, res) => {
    res.sendFile(path.join(frontendDir, "index.html"));
  });
}

export default app;
