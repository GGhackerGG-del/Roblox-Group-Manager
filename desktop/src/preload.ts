import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  isElectron: true,
  showCallNotification: (callerName: string, callerAvatar?: string) => {
    ipcRenderer.send("show-call-notification", { callerName, callerAvatar });
  },
  focusWindow: () => {
    ipcRenderer.send("focus-window");
  },
});
