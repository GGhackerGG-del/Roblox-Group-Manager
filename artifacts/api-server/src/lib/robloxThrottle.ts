let _lastGlobalRequest = 0;
const GLOBAL_MIN_GAP = 500;

let _downloadModeRefCount = 0;
let _downloadModeUntil = 0;

export function setDownloadMode(active: boolean) {
  if (active) {
    _downloadModeRefCount++;
    _downloadModeUntil = Date.now() + 5 * 60_000;
  } else {
    _downloadModeRefCount = Math.max(0, _downloadModeRefCount - 1);
    if (_downloadModeRefCount === 0) {
      _downloadModeUntil = 0;
    }
  }
}

export function isDownloadMode(): boolean {
  if (_downloadModeRefCount > 0 && Date.now() > _downloadModeUntil) {
    _downloadModeRefCount = 0;
    _downloadModeUntil = 0;
  }
  return _downloadModeRefCount > 0;
}

let _queueTail: Promise<void> = Promise.resolve();

export async function globalRobloxFetch(
  url: string,
  init?: RequestInit,
  priority: "high" | "normal" | "low" = "normal"
): Promise<Response> {
  if (isDownloadMode() && priority === "low") {
    await new Promise(r => setTimeout(r, 3000));
  }

  const gap = priority === "high" ? 300 : priority === "low" ? 800 : GLOBAL_MIN_GAP;

  await new Promise<void>(resolve => {
    _queueTail = _queueTail.then(async () => {
      const now = Date.now();
      const wait = gap - (now - _lastGlobalRequest);
      if (wait > 0) await new Promise(r => setTimeout(r, wait));
      _lastGlobalRequest = Date.now();
      resolve();
    });
  });

  return fetch(url, init);
}
