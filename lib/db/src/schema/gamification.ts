import { pgTable, serial, text, timestamp, integer, bigint, uniqueIndex, json } from "drizzle-orm/pg-core";

export const gamificationProfiles = pgTable("gamification_profiles", {
  id: serial("id").primaryKey(),
  robloxUserId: bigint("roblox_user_id", { mode: "number" }).notNull(),
  username: text("username").notNull(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  xp: integer("xp").notNull().default(0),
  level: integer("level").notNull().default(1),
  streak: integer("streak").notNull().default(0),
  invoices: integer("invoices").notNull().default(0),
  drafts: integer("drafts").notNull().default(0),
  achievementsCount: integer("achievements_count").notNull().default(0),
  currentStreak: integer("current_streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  totalLogins: integer("total_logins").notNull().default(0),
  lastLoginDate: text("last_login_date"),
  streakStartDate: text("streak_start_date"),
  visitedSections: json("visited_sections").$type<string[]>().default([]),
  claimedMilestones: json("claimed_milestones").$type<string[]>().default([]),
  unlockedAchievements: json("unlocked_achievements").$type<string[]>().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("gamification_profiles_roblox_user_id_idx").on(table.robloxUserId),
]);

export type GamificationProfile = typeof gamificationProfiles.$inferSelect;
