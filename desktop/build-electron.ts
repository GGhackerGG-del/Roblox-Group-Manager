import * as esbuild from "esbuild";
import path from "path";

const DESKTOP = path.resolve(import.meta.dirname);

async function buildElectron() {
  console.log("[build-electron] Compiling Electron main + preload...");

  await esbuild.build({
    entryPoints: [
      path.join(DESKTOP, "src", "main.ts"),
      path.join(DESKTOP, "src", "preload.ts"),
      path.join(DESKTOP, "src", "server", "start.ts"),
      path.join(DESKTOP, "src", "server", "app.ts"),
      path.join(DESKTOP, "src", "db", "index.ts"),
      path.join(DESKTOP, "src", "db", "schema.ts"),
      path.join(DESKTOP, "src", "db", "session-store.ts"),
      path.join(DESKTOP, "src", "db", "workspace-db-shim.ts"),
    ],
    bundle: false,
    platform: "node",
    target: "node20",
    format: "cjs",
    outdir: path.join(DESKTOP, "dist"),
    sourcemap: true,
    loader: {
      ".ts": "ts",
    },
    define: {
      "import.meta.dirname": "__dirname",
      "import.meta.filename": "__filename",
    },
  });

  console.log("[build-electron] Electron files compiled successfully.");
}

buildElectron().catch((err) => {
  console.error("[build-electron] Build failed:", err);
  process.exit(1);
});
