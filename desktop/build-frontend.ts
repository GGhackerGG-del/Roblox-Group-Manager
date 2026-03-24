import path from "path";
import fs from "fs";

const DESKTOP = path.resolve(import.meta.dirname);
const PRE_BUILT = path.join(DESKTOP, "frontend-build");
const FRONTEND_DIST = path.join(DESKTOP, "dist", "frontend");

function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function buildFrontend() {
  if (!fs.existsSync(PRE_BUILT)) {
    console.error("[build-frontend] ERROR: frontend-build/ directory not found.");
    console.error("[build-frontend] The frontend must be pre-built on the development server.");
    process.exit(1);
  }

  fs.mkdirSync(FRONTEND_DIST, { recursive: true });
  copyDirSync(PRE_BUILT, FRONTEND_DIST);
  console.log(`[build-frontend] Copied pre-built frontend to ${FRONTEND_DIST}`);
}

buildFrontend();
