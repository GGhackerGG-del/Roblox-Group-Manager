import { pgTable, serial, text, timestamp, integer, bigint, uniqueIndex } from "drizzle-orm/pg-core";

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
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("gamification_profiles_roblox_user_id_idx").on(table.robloxUserId),
]);

export type GamificationProfile = typeof gamificationProfiles.$inferSelect;
