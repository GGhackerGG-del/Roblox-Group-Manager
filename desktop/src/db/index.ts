import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

let dbInstance: ReturnType<typeof drizzle> | null = null;
let sqliteInstance: Database.Database | null = null;

export function initDatabase(dbPath: string): ReturnType<typeof drizzle> {
  if (dbInstance) return dbInstance;

  sqliteInstance = new Database(dbPath);

  sqliteInstance.pragma("journal_mode = WAL");
  sqliteInstance.pragma("foreign_keys = ON");
  sqliteInstance.pragma("busy_timeout = 5000");

  dbInstance = drizzle(sqliteInstance, { schema });

  createTables(sqliteInstance);

  return dbInstance;
}

export function getDb(): ReturnType<typeof drizzle> {
  if (!dbInstance) throw new Error("Database not initialized. Call initDatabase() first.");
  return dbInstance;
}

export function getSqlite(): Database.Database {
  if (!sqliteInstance) throw new Error("Database not initialized. Call initDatabase() first.");
  return sqliteInstance;
}

export function closeDatabase(): void {
  if (sqliteInstance) {
    sqliteInstance.close();
    sqliteInstance = null;
    dbInstance = null;
  }
}

function createTables(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS licenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      plan TEXT NOT NULL,
      device_fingerprint TEXT,
      activated INTEGER NOT NULL DEFAULT 0,
      activated_at TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS gamification_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      roblox_user_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      display_name TEXT NOT NULL,
      avatar_url TEXT,
      xp INTEGER NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 1,
      streak INTEGER NOT NULL DEFAULT 0,
      invoices INTEGER NOT NULL DEFAULT 0,
      drafts INTEGER NOT NULL DEFAULT 0,
      achievements_count INTEGER NOT NULL DEFAULT 0,
      current_streak INTEGER NOT NULL DEFAULT 0,
      longest_streak INTEGER NOT NULL DEFAULT 0,
      total_logins INTEGER NOT NULL DEFAULT 0,
      last_login_date TEXT,
      streak_start_date TEXT,
      visited_sections TEXT DEFAULT '[]',
      claimed_milestones TEXT DEFAULT '[]',
      unlocked_achievements TEXT DEFAULT '[]',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS gamification_profiles_roblox_user_id_idx ON gamification_profiles(roblox_user_id);

    CREATE TABLE IF NOT EXISTS platform_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      roblox_user_id INTEGER NOT NULL UNIQUE,
      roblox_username TEXT NOT NULL,
      display_name TEXT NOT NULL,
      avatar_url TEXT,
      bio TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS platform_users_roblox_idx ON platform_users(roblox_user_id);

    CREATE TABLE IF NOT EXISTS friendships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requester_id INTEGER NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
      addressee_id INTEGER NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS friendships_requester_idx ON friendships(requester_id);
    CREATE INDEX IF NOT EXISTS friendships_addressee_idx ON friendships(addressee_id);

    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      author_id INTEGER NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      image_url TEXT,
      likes_count INTEGER NOT NULL DEFAULT 0,
      comments_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS posts_author_idx ON posts(author_id);

    CREATE TABLE IF NOT EXISTS post_likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS post_likes_post_idx ON post_likes(post_id);

    CREATE TABLE IF NOT EXISTS post_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      author_id INTEGER NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS post_comments_post_idx ON post_comments(post_id);

    CREATE TABLE IF NOT EXISTS dm_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user1_id INTEGER NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
      user2_id INTEGER NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
      last_message_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS dm_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
      sender_id INTEGER NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      image_url TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS dm_messages_conv_idx ON dm_messages(conversation_id);

    CREATE TABLE IF NOT EXISTS featured_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL UNIQUE,
      name TEXT NOT NULL,
      member_count INTEGER NOT NULL DEFAULT 0,
      thumbnail_url TEXT,
      owner_user_id INTEGER,
      last_active_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS featured_groups_last_active_idx ON featured_groups(last_active_at);

    CREATE TABLE IF NOT EXISTS forum_topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      author_id INTEGER NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'suggestions',
      is_pinned INTEGER NOT NULL DEFAULT 0,
      is_closed INTEGER NOT NULL DEFAULT 0,
      votes_up INTEGER NOT NULL DEFAULT 0,
      votes_down INTEGER NOT NULL DEFAULT 0,
      replies_count INTEGER NOT NULL DEFAULT 0,
      last_activity_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS forum_topics_author_idx ON forum_topics(author_id);
    CREATE INDEX IF NOT EXISTS forum_topics_category_idx ON forum_topics(category);
    CREATE INDEX IF NOT EXISTS forum_topics_last_activity_idx ON forum_topics(last_activity_at);

    CREATE TABLE IF NOT EXISTS forum_replies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic_id INTEGER NOT NULL REFERENCES forum_topics(id) ON DELETE CASCADE,
      author_id INTEGER NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      is_answer INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS forum_replies_topic_idx ON forum_replies(topic_id);
    CREATE INDEX IF NOT EXISTS forum_replies_author_idx ON forum_replies(author_id);

    CREATE TABLE IF NOT EXISTS topic_votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic_id INTEGER NOT NULL REFERENCES forum_topics(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
      value INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS topic_votes_topic_idx ON topic_votes(topic_id);
    CREATE INDEX IF NOT EXISTS topic_votes_user_idx ON topic_votes(user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS topic_votes_unique ON topic_votes(topic_id, user_id);

    CREATE TABLE IF NOT EXISTS group_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
      roblox_group_id INTEGER NOT NULL,
      group_name TEXT NOT NULL,
      group_thumbnail_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS group_subs_user_idx ON group_subscriptions(user_id);
    CREATE INDEX IF NOT EXISTS group_subs_group_idx ON group_subscriptions(roblox_group_id);
    CREATE UNIQUE INDEX IF NOT EXISTS group_subs_unique ON group_subscriptions(user_id, roblox_group_id);

    CREATE TABLE IF NOT EXISTS group_workspaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      roblox_group_id INTEGER NOT NULL UNIQUE,
      group_name TEXT NOT NULL,
      group_thumbnail_url TEXT,
      owner_id INTEGER NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
      description TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS group_workspaces_owner_idx ON group_workspaces(owner_id);

    CREATE TABLE IF NOT EXISTS workspace_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL REFERENCES group_workspaces(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member',
      status TEXT NOT NULL DEFAULT 'active',
      invited_by INTEGER REFERENCES platform_users(id),
      joined_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS workspace_members_unique ON workspace_members(workspace_id, user_id);

    CREATE TABLE IF NOT EXISTS group_chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_by_id INTEGER NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
      workspace_id INTEGER REFERENCES group_workspaces(id) ON DELETE SET NULL,
      avatar_color TEXT DEFAULT '#6366f1',
      last_message_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS group_chats_created_idx ON group_chats(created_by_id);

    CREATE TABLE IF NOT EXISTS group_chat_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER NOT NULL REFERENCES group_chats(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member',
      joined_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS group_chat_members_unique ON group_chat_members(chat_id, user_id);
    CREATE INDEX IF NOT EXISTS group_chat_members_user_idx ON group_chat_members(user_id);

    CREATE TABLE IF NOT EXISTS group_chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER NOT NULL REFERENCES group_chats(id) ON DELETE CASCADE,
      sender_id INTEGER NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS group_chat_msgs_chat_idx ON group_chat_messages(chat_id);

    CREATE TABLE IF NOT EXISTS collaboration_projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL REFERENCES group_workspaces(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      created_by_id INTEGER NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS collab_projects_workspace_idx ON collaboration_projects(workspace_id);

    CREATE TABLE IF NOT EXISTS collaboration_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES collaboration_projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      assigned_to_id INTEGER REFERENCES platform_users(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'todo',
      priority TEXT NOT NULL DEFAULT 'medium',
      created_by_id INTEGER NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
      due_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS collab_tasks_project_idx ON collaboration_tasks(project_id);

    CREATE TABLE IF NOT EXISTS reputation_endorsements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_user_id INTEGER NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
      to_user_id INTEGER NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
      skill TEXT NOT NULL DEFAULT 'general',
      message TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS endorsements_to_idx ON reputation_endorsements(to_user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS endorsements_unique ON reputation_endorsements(from_user_id, to_user_id, skill);

    CREATE TABLE IF NOT EXISTS marketplace_listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seller_id INTEGER NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'template',
      preview_url TEXT,
      download_url TEXT,
      price INTEGER NOT NULL DEFAULT 0,
      tags_json TEXT DEFAULT '[]',
      download_count INTEGER NOT NULL DEFAULT 0,
      likes_count INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS marketplace_seller_idx ON marketplace_listings(seller_id);
    CREATE INDEX IF NOT EXISTS marketplace_category_idx ON marketplace_listings(category);

    CREATE TABLE IF NOT EXISTS marketplace_likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      listing_id INTEGER NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS marketplace_likes_unique ON marketplace_likes(listing_id, user_id);

    CREATE TABLE IF NOT EXISTS game_visit_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      universe_id INTEGER NOT NULL,
      playing INTEGER NOT NULL DEFAULT 0,
      visits INTEGER NOT NULL DEFAULT 0,
      ts TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS game_visit_snapshots_universe_idx ON game_visit_snapshots(universe_id);
    CREATE INDEX IF NOT EXISTS game_visit_snapshots_ts_idx ON game_visit_snapshots(ts);

    CREATE TABLE IF NOT EXISTS user_sessions (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expire TEXT NOT NULL
    );
  `);
}

export * from "./schema.js";
