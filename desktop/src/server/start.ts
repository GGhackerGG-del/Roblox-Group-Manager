import type Database from "better-sqlite3";
import type { Server } from "http";
import net from "net";

let server: Server | null = null;

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const addr = srv.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        reject(new Error("Could not get port"));
      }
    });
    srv.on("error", reject);
  });
}

export async function startServer(sqlite: Database.Database): Promise<number> {
  const port = await findFreePort();

  process.env.PORT = String(port);
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || "limited-ink-desktop-" + Math.random().toString(36).slice(2);
  process.env.JWT_SECRET = process.env.JWT_SECRET || "limited-ink-jwt-" + Math.random().toString(36).slice(2);
  process.env.NODE_ENV = "production";
  process.env.DESKTOP_MODE = "true";
  process.env.SQLITE_DB_READY = "true";

  const { createApp } = await import("./app.js");
  const app = createApp(sqlite);

  return new Promise((resolve, reject) => {
    server = app.listen(port, "127.0.0.1", () => {
      resolve(port);
    });
    server.on("error", reject);
  });
}

export function stopServer(): void {
  if (server) {
    server.close();
    server = null;
  }
}
