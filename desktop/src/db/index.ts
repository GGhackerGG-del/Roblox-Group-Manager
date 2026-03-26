import fs from "fs";
import path from "path";

let storePath = "";
let store: Record<string, string> = {};

export function initStore(dataDir: string): void {
  storePath = path.join(dataDir, "limited-ink-store.json");
  try {
    if (fs.existsSync(storePath)) {
      store = JSON.parse(fs.readFileSync(storePath, "utf-8"));
    }
  } catch {
    store = {};
  }
}

export function getStoreValue(key: string): string | undefined {
  return store[key];
}

export function setStoreValue(key: string, value: string): void {
  store[key] = value;
  try {
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2), "utf-8");
  } catch (err) {
    console.error("[Store] Failed to persist:", err);
  }
}

export function closeDatabase(): void {
  store = {};
}
