type NotificationType = "message" | "call" | "action";

interface NotifyOptions {
  title: string;
  body: string;
  type?: NotificationType;
}

const ea = () => (window as any).electronAPI;

export function isDesktop(): boolean {
  return !!ea()?.isElectron;
}

export function desktopNotify(opts: NotifyOptions): void {
  const api = ea();
  if (!api?.showNotification) return;
  api.showNotification({
    title: opts.title,
    body: opts.body,
    type: opts.type || "message",
  });
}

export function notifyNewMessage(senderName: string, preview: string): void {
  desktopNotify({
    title: `💬 ${senderName}`,
    body: preview.length > 100 ? preview.slice(0, 100) + "…" : preview,
    type: "message",
  });
}

export function notifyGroupMessage(groupName: string, senderName: string, preview: string): void {
  desktopNotify({
    title: `👥 ${groupName}`,
    body: `${senderName}: ${preview.length > 80 ? preview.slice(0, 80) + "…" : preview}`,
    type: "message",
  });
}

export function notifyGroupCall(callerName: string, groupName?: string): void {
  desktopNotify({
    title: "📞 Групповой звонок",
    body: groupName
      ? `${callerName} начал звонок в ${groupName}`
      : `${callerName} начал групповой звонок`,
    type: "call",
  });
}

export function notifyAction(title: string, body: string): void {
  desktopNotify({ title: `✅ ${title}`, body, type: "action" });
}
