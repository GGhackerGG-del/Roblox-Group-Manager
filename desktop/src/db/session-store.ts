import session from "express-session";
import type Database from "better-sqlite3";

interface StoreOptions {
  db: Database.Database;
  tableName?: string;
}

export class SQLiteSessionStore extends session.Store {
  private db: Database.Database;
  private tableName: string;

  constructor(options: StoreOptions) {
    super();
    this.db = options.db;
    this.tableName = options.tableName || "user_sessions";
  }

  get(sid: string, callback: (err?: Error | null, session?: session.SessionData | null) => void): void {
    try {
      const now = Date.now().toString();
      const row = this.db.prepare(
        `SELECT sess FROM ${this.tableName} WHERE sid = ? AND CAST(expire AS INTEGER) > CAST(? AS INTEGER)`
      ).get(sid, now) as { sess: string } | undefined;

      if (!row) {
        callback(null, null);
        return;
      }

      callback(null, JSON.parse(row.sess));
    } catch (err) {
      callback(err as Error);
    }
  }

  set(sid: string, sessionData: session.SessionData, callback?: (err?: Error | null) => void): void {
    try {
      const maxAge = sessionData.cookie?.maxAge || 86400000;
      const expire = (Date.now() + maxAge).toString();
      const sess = JSON.stringify(sessionData);

      this.db.prepare(
        `INSERT OR REPLACE INTO ${this.tableName} (sid, sess, expire) VALUES (?, ?, ?)`
      ).run(sid, sess, expire);

      callback?.(null);
    } catch (err) {
      callback?.(err as Error);
    }
  }

  destroy(sid: string, callback?: (err?: Error | null) => void): void {
    try {
      this.db.prepare(`DELETE FROM ${this.tableName} WHERE sid = ?`).run(sid);
      callback?.(null);
    } catch (err) {
      callback?.(err as Error);
    }
  }

  touch(sid: string, sessionData: session.SessionData, callback?: (err?: Error | null) => void): void {
    try {
      const maxAge = sessionData.cookie?.maxAge || 86400000;
      const expire = (Date.now() + maxAge).toString();

      this.db.prepare(
        `UPDATE ${this.tableName} SET expire = ? WHERE sid = ?`
      ).run(expire, sid);

      callback?.(null);
    } catch (err) {
      callback?.(err as Error);
    }
  }

  clear(callback?: (err?: Error | null) => void): void {
    try {
      this.db.prepare(`DELETE FROM ${this.tableName}`).run();
      callback?.(null);
    } catch (err) {
      callback?.(err as Error);
    }
  }

  length(callback: (err?: Error | null, length?: number) => void): void {
    try {
      const now = Date.now().toString();
      const row = this.db.prepare(
        `SELECT COUNT(*) as count FROM ${this.tableName} WHERE CAST(expire AS INTEGER) > CAST(? AS INTEGER)`
      ).get(now) as { count: number };
      callback(null, row.count);
    } catch (err) {
      callback(err as Error);
    }
  }
}
