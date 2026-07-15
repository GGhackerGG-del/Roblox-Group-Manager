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

async function ensureSessionTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "user_sessions" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL,
        CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("sid")
      ) WITH (OIDS=FALSE);
      CREATE INDEX IF NOT EXISTS "IDX_user_sessions_expire" ON "user_sessions" ("expire");
    `);
  } catch (e) {
    console.error("[Session] Failed to ensure session table:", e);
  }
}
ensureSessionTable();

const app: Express = express();

app.set("trust proxy", 1);

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

// Self-hosted deployments (deploy/docker-compose.yml sets SELF_HOSTED=true) serve
// plain HTTP on localhost — a `secure` cookie is silently dropped by the browser
// over HTTP, which breaks session persistence entirely (login, saved Roblox
// cookie, etc. never stick). Replit itself is always served over HTTPS, so it
// keeps the stricter secure/cross-site cookie settings.
const isSelfHosted = process.env.SELF_HOSTED === "true";

app.use(session({
  store: new PgStore({
    pool,
    tableName: "user_sessions",
    createTableIfMissing: false,
  }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: !isSelfHosted,
    sameSite: isSelfHosted ? ("lax" as const) : ("none" as const),
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
