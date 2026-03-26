import { app, BrowserWindow, shell, dialog, Tray, Menu, nativeImage } from "electron";
import path from "path";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

function getTrayIconPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "icon.png");
  }
  return path.join(__dirname, "..", "resources", "icon.png");
}

function createTray(): void {
  const iconPath = getTrayIconPath();
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip("Limited.Ink");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Open Limited.Ink",
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    { type: "separator" },
    {
      label: "Exit",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on("double-click", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
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

  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
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

    const { initStore } = require("./db/index.js");
    const userDataPath = app.getPath("userData");
    console.log(`[Limited.Ink] Data path: ${userDataPath}`);
    initStore(userDataPath);

    const { startServer } = require("./server/start.js");
    const port = await startServer();
    console.log(`[Limited.Ink] Server running on http://localhost:${port}`);

    createTray();
    createWindow(port);

    app.on("activate", () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      } else {
        createWindow(port);
      }
    });
  } catch (err: any) {
    console.error("[Limited.Ink] Failed to start:", err);
    dialog.showErrorBox(
      "Limited.Ink — Startup Error",
      `Failed to start the application:\n\n${err?.message || err}\n\n${err?.stack || ""}`
    );
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (process.platform === "darwin") {
    return;
  }
});

app.on("before-quit", () => {
  isQuitting = true;
  try {
    const { stopServer } = require("./server/start.js");
    stopServer();
  } catch {}
  try {
    const { closeDatabase } = require("./db/index.js");
    closeDatabase();
  } catch {}
});
