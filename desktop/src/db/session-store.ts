import session from "express-session";

interface SessionEntry {
  sess: session.SessionData;
  expire: number;
}

export class MemorySessionStore extends session.Store {
  private sessions: Map<string, SessionEntry> = new Map();

  get(sid: string, callback: (err?: Error | null, session?: session.SessionData | null) => void): void {
    const entry = this.sessions.get(sid);
    if (!entry || entry.expire < Date.now()) {
      if (entry) this.sessions.delete(sid);
      callback(null, null);
      return;
    }
    callback(null, entry.sess);
  }

  set(sid: string, sessionData: session.SessionData, callback?: (err?: Error | null) => void): void {
    const maxAge = sessionData.cookie?.maxAge || 86400000;
    this.sessions.set(sid, { sess: sessionData, expire: Date.now() + maxAge });
    callback?.(null);
  }

  destroy(sid: string, callback?: (err?: Error | null) => void): void {
    this.sessions.delete(sid);
    callback?.(null);
  }

  touch(sid: string, sessionData: session.SessionData, callback?: (err?: Error | null) => void): void {
    const entry = this.sessions.get(sid);
    if (entry) {
      const maxAge = sessionData.cookie?.maxAge || 86400000;
      entry.expire = Date.now() + maxAge;
    }
    callback?.(null);
  }

  clear(callback?: (err?: Error | null) => void): void {
    this.sessions.clear();
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
