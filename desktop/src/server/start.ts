import type { Server } from "http";
import net from "net";
import http from "http";
import { getStoreValue } from "../db/index.js";

let server: Server | null = null;

const REMOTE_API = process.env.REMOTE_API_URL || "https://Limited-ink.replit.app";

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
  const port = await findFreePort();

  process.env.PORT = String(port);
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || "limited-ink-desktop-" + Math.random().toString(36).slice(2);
  process.env.JWT_SECRET = process.env.JWT_SECRET || "limited-ink-jwt-" + Math.random().toString(36).slice(2);
  process.env.ADMIN_SECRET = process.env.ADMIN_SECRET || "limited-ink-admin-" + Math.random().toString(36).slice(2);
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
