import * as esbuild from "esbuild";
import path from "path";
import fs from "fs";

const ROOT = path.resolve(import.meta.dirname, "..");
const API_SERVER = path.join(ROOT, "artifacts", "api-server");
const DESKTOP = path.join(ROOT, "desktop");

async function buildServer() {
  console.log("[build-server] Bundling api-server routes with SQLite shim...");

  const entryContent = `
// Re-export the routes index from api-server
export { default } from "${path.join(API_SERVER, "src", "routes", "index.ts").replace(/\\/g, "/")}";
`;
  const entryPath = path.join(DESKTOP, "dist", "_routes-entry.ts");
  fs.mkdirSync(path.join(DESKTOP, "dist"), { recursive: true });
  fs.writeFileSync(entryPath, entryContent);

  const botEntryContent = `
export { default as initBot } from "${path.join(API_SERVER, "src", "bot.ts").replace(/\\/g, "/")}";
`;
  const botEntryPath = path.join(DESKTOP, "dist", "_bot-entry.ts");
  fs.writeFileSync(botEntryPath, botEntryContent);

  const shimPath = path.join(DESKTOP, "src", "db", "workspace-db-shim.ts");

  await esbuild.build({
    entryPoints: [entryPath, botEntryPath],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outdir: path.join(DESKTOP, "dist", "server"),
    sourcemap: true,
    minify: false,
    nodePaths: [path.join(DESKTOP, "node_modules")],
    alias: {
      "@workspace/db": shimPath,
      "@workspace/api-zod": path.join(ROOT, "lib", "api-zod", "src", "index.ts"),
    },
    external: [
      "better-sqlite3",
      "sharp",
      "electron",
      "express",
      "express-session",
      "cors",
      "archiver",
      "node-telegram-bot-api",
      "openai",
      "jsonwebtoken",
      "cookie-parser",
      "connect-pg-simple",
      "pg",
      "drizzle-orm",
      "drizzle-orm/*",
      "node-fetch",
      "crypto",
    ],
    define: {
      "import.meta.dirname": "__dirname",
      "import.meta.filename": "__filename",
    },
    loader: {
      ".ts": "ts",
    },
  });

  fs.unlinkSync(entryPath);
  fs.unlinkSync(botEntryPath);

  console.log("[build-server] Server routes bundled successfully.");
}

buildServer().catch((err) => {
  console.error("[build-server] Build failed:", err);
  process.exit(1);
});
