import session from "express-session";
import fs from "fs";
import path from "path";

interface SessionEntry {
  sess: session.SessionData;
  expire: number;
}

export class FileSessionStore extends session.Store {
  private sessions: Map<string, SessionEntry> = new Map();
  private filePath: string;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(dataDir: string) {
    super();
    this.filePath = path.join(dataDir, "limited-ink-sessions.json");
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = JSON.parse(fs.readFileSync(this.filePath, "utf-8")) as Record<string, SessionEntry>;
        const now = Date.now();
        for (const [sid, entry] of Object.entries(raw)) {
          if (entry.expire > now) {
            this.sessions.set(sid, entry);
          }
        }
      }
    } catch {
      this.sessions = new Map();
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveToDisk();
    }, 500);
  }

  private saveToDisk(): void {
    try {
      const obj: Record<string, SessionEntry> = {};
      const now = Date.now();
      for (const [sid, entry] of this.sessions.entries()) {
        if (entry.expire > now) obj[sid] = entry;
      }
      fs.writeFileSync(this.filePath, JSON.stringify(obj), "utf-8");
    } catch (err) {
      console.error("[SessionStore] Failed to persist:", err);
    }
  }

  get(sid: string, callback: (err?: Error | null, session?: session.SessionData | null) => void): void {
    const entry = this.sessions.get(sid);
    if (!entry || entry.expire < Date.now()) {
      if (entry) {
        this.sessions.delete(sid);
        this.scheduleSave();
      }
      callback(null, null);
      return;
    }
    callback(null, entry.sess);
  }

  set(sid: string, sessionData: session.SessionData, callback?: (err?: Error | null) => void): void {
    const maxAge = sessionData.cookie?.maxAge || 86400000 * 30;
    this.sessions.set(sid, { sess: sessionData, expire: Date.now() + maxAge });
    this.scheduleSave();
    callback?.(null);
  }

  destroy(sid: string, callback?: (err?: Error | null) => void): void {
    this.sessions.delete(sid);
    this.scheduleSave();
    callback?.(null);
  }

  touch(sid: string, sessionData: session.SessionData, callback?: (err?: Error | null) => void): void {
    const entry = this.sessions.get(sid);
    if (entry) {
      const maxAge = sessionData.cookie?.maxAge || 86400000 * 30;
      entry.expire = Date.now() + maxAge;
      this.scheduleSave();
    }
    callback?.(null);
  }

  clear(callback?: (err?: Error | null) => void): void {
    this.sessions.clear();
    this.scheduleSave();
    callback?.(null);
  }

  length(callback: (err?: Error | null, length?: number) => void): void {
    const now = Date.now();
    let count = 0;
    for (const entry of this.sessions.values()) {
      if (entry.expire > now) count++;
    }
    callback(null, count);
  }
}
