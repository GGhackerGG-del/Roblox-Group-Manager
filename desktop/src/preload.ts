import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  isElectron: true,
  showCallNotification: (callerName: string, callerAvatar?: string) => {
    ipcRenderer.send("show-call-notification", { callerName, callerAvatar });
  },
  showNotification: (data: { title: string; body: string; type?: string }) => {
    ipcRenderer.send("show-notification", data);
  },
  focusWindow: () => {
    ipcRenderer.send("focus-window");
  },
  getDesktopSources: () => {
    return ipcRenderer.invoke("get-desktop-sources");
  },
  isWindowFocused: () => {
    return ipcRenderer.invoke("is-window-focused");
  },
  storeSetting: (key: string, value: string) => {
    ipcRenderer.send("store-setting", { key, value });
  },
  getSetting: (key: string): Promise<string | undefined> => {
    return ipcRenderer.invoke("get-setting", key);
  },
});
