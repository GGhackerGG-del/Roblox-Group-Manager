import { execSync } from "child_process";
import path from "path";
import fs from "fs";

const ROOT = path.resolve(import.meta.dirname, "..");
const DESKTOP = path.resolve(import.meta.dirname);
const FRONTEND_SRC = path.join(ROOT, "artifacts", "limited-ink");
const FRONTEND_DIST = path.join(DESKTOP, "dist", "frontend");

function buildFrontend() {
  console.log("[build-frontend] Building React frontend...");

  fs.mkdirSync(FRONTEND_DIST, { recursive: true });

  const env = {
    ...process.env,
    PORT: "3000",
    BASE_PATH: "/",
    NODE_ENV: "production",
  };

  try {
    execSync("npx vite build --config vite.config.ts", {
      cwd: FRONTEND_SRC,
      stdio: "inherit",
      env,
    });
  } catch {
    console.log("[build-frontend] Trying pnpm build...");
    execSync("pnpm run build", {
      cwd: FRONTEND_SRC,
      stdio: "inherit",
      env,
    });
  }

  const buildOutput = path.join(FRONTEND_SRC, "dist", "public");
  if (fs.existsSync(buildOutput)) {
    copyDirSync(buildOutput, FRONTEND_DIST);
    console.log(`[build-frontend] Copied from ${buildOutput} to ${FRONTEND_DIST}`);
  } else {
    const altBuild = path.join(FRONTEND_SRC, "dist");
    if (fs.existsSync(altBuild)) {
      copyDirSync(altBuild, FRONTEND_DIST);
      console.log(`[build-frontend] Copied from ${altBuild} to ${FRONTEND_DIST}`);
    } else {
      throw new Error("Frontend build output not found");
    }
  }

  console.log("[build-frontend] Frontend built successfully.");
}

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

buildFrontend();
