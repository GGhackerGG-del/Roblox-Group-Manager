import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename_local = typeof __filename !== "undefined" ? __filename : fileURLToPath(import.meta.url);
const __dirname_local = path.dirname(__filename_local);
const DESKTOP = path.resolve(__dirname_local);

async function buildServer() {
  console.log("[build-server] Desktop now proxies all API calls to remote server — no local route bundling needed.");
  fs.mkdirSync(path.join(DESKTOP, "dist"), { recursive: true });
  console.log("[build-server] Done.");
}

buildServer().catch((err) => {
  console.error("[build-server] Build failed:", err);
  process.exit(1);
});
