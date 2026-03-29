import type { Server } from "http";
import net from "net";
import http from "http";
import crypto from "crypto";
import { getStoreValue, setStoreValue } from "../db/index.js";

let server: Server | null = null;

const REMOTE_API = process.env.REMOTE_API_URL || "https://Limited-ink.replit.app";
const PREFERRED_PORT = 17483;

function getOrCreateSecret(key: string): string {
  const existing = getStoreValue(key);
  if (existing) return existing;
  const secret = crypto.randomBytes(32).toString("hex");
  setStoreValue(key, secret);
  return secret;
}

async function findFreePort(preferred: number): Promise<number> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(preferred, "127.0.0.1", () => {
      srv.close(() => resolve(preferred));
    });
    srv.on("error", () => {
      const fallback = net.createServer();
      fallback.listen(0, () => {
        const addr = fallback.address();
        if (addr && typeof addr === "object") {
          const port = addr.port;
          fallback.close(() => resolve(port));
        } else {
          resolve(preferred + 1);
        }
      });
      fallback.on("error", () => resolve(preferred + 1));
    });
  });
}

function setupWebSocketProxy(httpServer: Server): void {
  httpServer.on("upgrade", (req: http.IncomingMessage, socket: net.Socket, head: Buffer) => {
    if (!req.url?.startsWith("/ws/")) {
      socket.destroy();
      return;
    }

    const remoteUrl = new URL(REMOTE_API);
    const isSecure = remoteUrl.protocol === "https:";
    const remoteHost = remoteUrl.hostname;
    const remotePort = remoteUrl.port ? parseInt(remoteUrl.port) : (isSecure ? 443 : 80);

    const remoteCookie = getStoreValue("remote_session_cookie") || "";

    const headers = [
      `GET ${req.url} HTTP/1.1`,
      `Host: ${remoteHost}`,
      `Upgrade: websocket`,
      `Connection: Upgrade`,
      `Sec-WebSocket-Key: ${req.headers["sec-websocket-key"] || ""}`,
      `Sec-WebSocket-Version: ${req.headers["sec-websocket-version"] || "13"}`,
      `Origin: ${REMOTE_API}`,
    ];

    if (req.headers["sec-websocket-protocol"]) {
      headers.push(`Sec-WebSocket-Protocol: ${req.headers["sec-websocket-protocol"]}`);
    }

    if (remoteCookie) {
      headers.push(`Cookie: ${remoteCookie}`);
    }

    const requestData = Buffer.from(headers.join("\r\n") + "\r\n\r\n");

    let remoteSocket: net.Socket;

    if (isSecure) {
      const tls = require("tls");
      remoteSocket = tls.connect({
        host: remoteHost,
        port: remotePort,
        servername: remoteHost,
      }, () => {
        remoteSocket.write(requestData);
        if (head.length > 0) remoteSocket.write(head);
      });
    } else {
      remoteSocket = net.connect({ host: remoteHost, port: remotePort }, () => {
        remoteSocket.write(requestData);
        if (head.length > 0) remoteSocket.write(head);
      });
    }

    let handshakeComplete = false;
    let handshakeBuffer = Buffer.alloc(0);

    remoteSocket.on("data", (chunk: Buffer) => {
      if (!handshakeComplete) {
        handshakeBuffer = Buffer.concat([handshakeBuffer, chunk]);
        const headerEnd = handshakeBuffer.indexOf("\r\n\r\n");
        if (headerEnd !== -1) {
          handshakeComplete = true;
          const responseHeader = handshakeBuffer.subarray(0, headerEnd + 4);
          const remaining = handshakeBuffer.subarray(headerEnd + 4);
          const statusLine = responseHeader.toString().split("\r\n")[0];

          if (statusLine.includes("101")) {
            socket.write(responseHeader);
            if (remaining.length > 0) socket.write(remaining);
            remoteSocket.pipe(socket);
            socket.pipe(remoteSocket);
          } else {
            console.error("[WS Proxy] Remote rejected WebSocket upgrade:", statusLine);
            socket.destroy();
            remoteSocket.destroy();
          }
        }
      }
    });

    remoteSocket.on("error", (err: Error) => {
      console.error("[WS Proxy] Remote socket error:", err.message);
      socket.destroy();
    });

    socket.on("error", (err: Error) => {
      console.error("[WS Proxy] Local socket error:", err.message);
      remoteSocket.destroy();
    });

    remoteSocket.on("close", () => socket.destroy());
    socket.on("close", () => remoteSocket.destroy());
  });
}

export async function startServer(): Promise<number> {
  const port = await findFreePort(PREFERRED_PORT);

  process.env.PORT = String(port);
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || getOrCreateSecret("desktop_session_secret");
  process.env.JWT_SECRET = process.env.JWT_SECRET || getOrCreateSecret("desktop_jwt_secret");
  process.env.ADMIN_SECRET = process.env.ADMIN_SECRET || getOrCreateSecret("desktop_admin_secret");
  process.env.NODE_ENV = "production";
  process.env.DESKTOP_MODE = "true";

  const { createApp } = require("./app.js");
  const app = createApp();

  return new Promise((resolve, reject) => {
    const httpServer = http.createServer(app);
    setupWebSocketProxy(httpServer);
    server = httpServer;
    httpServer.listen(port, "127.0.0.1", () => {
      resolve(port);
    });
    httpServer.on("error", reject);
  });
}

export function stopServer(): void {
  if (server) {
    server.close();
    server = null;
  }
}
