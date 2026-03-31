import { app, BrowserWindow, shell, dialog, Tray, Menu, nativeImage, session as electronSession, ipcMain, Notification, desktopCapturer } from "electron";
import path from "path";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

function getAutoLaunchEnabled(): boolean {
  try {
    const { getStoreValue } = require("./db/index.js");
    return getStoreValue("auto_launch_enabled") === "true";
  } catch { return false; }
}

function setAutoLaunchEnabled(enabled: boolean): void {
  try {
    const { setStoreValue } = require("./db/index.js");
    setStoreValue("auto_launch_enabled", enabled ? "true" : "false");
    setStoreValue("auto_launch_initialized", "true");
  } catch {}

  if (process.platform === "win32") {
    try {
      const { execSync } = require("child_process");
      const exePath = app.isPackaged ? process.execPath : `"${process.execPath}"`;
      const regKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
      if (enabled) {
        execSync(`reg add "${regKey}" /v "LimitedInk" /t REG_SZ /d "${exePath}" /f`, { stdio: "ignore" });
      } else {
        execSync(`reg delete "${regKey}" /v "LimitedInk" /f`, { stdio: "ignore" });
      }
      console.log(`[AutoLaunch] Registry ${enabled ? "added" : "removed"} successfully`);
    } catch (err: any) {
      console.error("[AutoLaunch] Registry update failed:", err.message);
    }
  } else {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: app.isPackaged ? process.execPath : undefined,
    });
  }
}

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

  const buildTrayMenu = () => {
    const autoLaunch = getAutoLaunchEnabled();
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
        label: "Run at Startup",
        type: "checkbox",
        checked: autoLaunch,
        click: (menuItem) => {
          setAutoLaunchEnabled(menuItem.checked);
          buildTrayMenu();
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
    tray?.setContextMenu(contextMenu);
  };
  buildTrayMenu();

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

    electronSession.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      const allowed = ["media", "mediaKeySystem", "display-capture", "notifications"];
      const url = webContents?.getURL() || "";
      const isTrusted = url.startsWith("http://localhost:") || url.startsWith("http://127.0.0.1:");
      callback(isTrusted && allowed.includes(permission));
    });

    electronSession.defaultSession.setPermissionCheckHandler((webContents, permission) => {
      const allowed = ["media", "mediaKeySystem", "display-capture", "notifications"];
      const url = webContents?.getURL() || "";
      const isTrusted = url.startsWith("http://localhost:") || url.startsWith("http://127.0.0.1:");
      return isTrusted && allowed.includes(permission);
    });

    const { initStore } = require("./db/index.js");
    const userDataPath = app.getPath("userData");
    console.log(`[Limited.Ink] Data path: ${userDataPath}`);
    initStore(userDataPath);

    const { startServer } = require("./server/start.js");
    const port = await startServer();
    console.log(`[Limited.Ink] Server running on http://localhost:${port}`);

    const { getStoreValue } = require("./db/index.js");
    const autoLaunchInitialized = getStoreValue("auto_launch_initialized");
    if (!autoLaunchInitialized) {
      setAutoLaunchEnabled(true);
    } else {
      const savedAutoLaunch = getAutoLaunchEnabled();
      if (savedAutoLaunch) {
        setAutoLaunchEnabled(true);
      }
    }

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

ipcMain.on("show-call-notification", (event, data: { callerName: string; callerAvatar?: string }) => {
  if (!mainWindow) return;
  const senderUrl = event.senderFrame?.url || "";
  if (!senderUrl.startsWith("http://localhost:") && !senderUrl.startsWith("http://127.0.0.1:")) return;
  if (typeof data?.callerName !== "string" || data.callerName.length > 200) return;

  if (mainWindow.isFocused()) return;

  const notification = new Notification({
    title: "Incoming Call",
    body: `${data.callerName} is calling you`,
    icon: app.isPackaged
      ? path.join(process.resourcesPath, "icon.png")
      : path.join(__dirname, "..", "resources", "icon.png"),
    urgency: "critical",
    silent: true,
  });

  notification.on("click", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  notification.show();

  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }
  mainWindow.flashFrame(true);
});

ipcMain.on("show-notification", (event, data: { title: string; body: string; type?: string }) => {
  if (!mainWindow) return;
  const senderUrl = event.senderFrame?.url || "";
  if (!senderUrl.startsWith("http://localhost:") && !senderUrl.startsWith("http://127.0.0.1:")) return;
  if (typeof data?.title !== "string" || data.title.length > 200) return;
  if (typeof data?.body !== "string" || data.body.length > 500) return;

  if (mainWindow.isFocused()) return;

  const notification = new Notification({
    title: data.title,
    body: data.body,
    icon: app.isPackaged
      ? path.join(process.resourcesPath, "icon.png")
      : path.join(__dirname, "..", "resources", "icon.png"),
    silent: false,
  });

  notification.on("click", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
      mainWindow.flashFrame(false);
    }
  });

  notification.show();

  if (mainWindow.isVisible()) {
    mainWindow.flashFrame(true);
  }
});

ipcMain.handle("is-window-focused", (event) => {
  const senderUrl = event.senderFrame?.url || "";
  if (!senderUrl.startsWith("http://localhost:") && !senderUrl.startsWith("http://127.0.0.1:")) return false;
  return mainWindow?.isFocused() ?? false;
});

ipcMain.handle("get-desktop-sources", async (event) => {
  const senderUrl = event.senderFrame?.url || "";
  if (!senderUrl.startsWith("http://localhost:") && !senderUrl.startsWith("http://127.0.0.1:")) return [];
  try {
    const sources = await desktopCapturer.getSources({
      types: ["window", "screen"],
      thumbnailSize: { width: 320, height: 180 },
    });
    return sources.map(s => ({
      id: s.id,
      name: s.name,
      thumbnail: s.thumbnail.toDataURL(),
    }));
  } catch {
    return [];
  }
});

ipcMain.on("store-setting", (event, data: { key: string; value: string }) => {
  const senderUrl = event.senderFrame?.url || "";
  if (!senderUrl.startsWith("http://localhost:") && !senderUrl.startsWith("http://127.0.0.1:")) return;
  if (typeof data?.key !== "string" || typeof data?.value !== "string") return;
  try {
    const { setStoreValue } = require("./db/index.js");
    setStoreValue(`setting_${data.key}`, data.value);
  } catch {}
});

ipcMain.handle("get-setting", (event, key: string) => {
  const senderUrl = event.senderFrame?.url || "";
  if (!senderUrl.startsWith("http://localhost:") && !senderUrl.startsWith("http://127.0.0.1:")) return undefined;
  if (typeof key !== "string") return undefined;
  try {
    const { getStoreValue } = require("./db/index.js");
    return getStoreValue(`setting_${key}`);
  } catch { return undefined; }
});

ipcMain.on("focus-window", (event) => {
  const senderUrl = event.senderFrame?.url || "";
  if (!senderUrl.startsWith("http://localhost:") && !senderUrl.startsWith("http://127.0.0.1:")) return;
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.flashFrame(false);
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
