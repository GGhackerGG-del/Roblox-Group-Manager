import { app, BrowserWindow, shell } from "electron";
import path from "path";
import { initDatabase, closeDatabase, getSqlite } from "./db/index.js";
import { startServer, stopServer } from "./server/start.js";

let mainWindow: BrowserWindow | null = null;

function getDbPath(): string {
  const userDataPath = app.getPath("userData");
  return path.join(userDataPath, "limited-ink.db");
}

function createWindow(serverPort: number): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "Limited.Ink",
    backgroundColor: "#000000",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadURL(`http://localhost:${serverPort}`);

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    if (app.isPackaged) {
      process.env.ELECTRON_IS_PACKAGED = "true";
    }

    const dbPath = getDbPath();
    console.log(`[Limited.Ink] Database path: ${dbPath}`);
    const drizzleDb = initDatabase(dbPath);
    (globalThis as any).__limitedInkDb = drizzleDb;
    const sqlite = getSqlite();

    const port = await startServer(sqlite);
    console.log(`[Limited.Ink] Server running on http://localhost:${port}`);

    createWindow(port);

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow(port);
      }
    });
  } catch (err) {
    console.error("[Limited.Ink] Failed to start:", err);
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  stopServer();
  closeDatabase();
});
