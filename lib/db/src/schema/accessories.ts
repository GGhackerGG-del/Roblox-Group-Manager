import { pgTable, serial, text, timestamp, integer, bigint, boolean, index, uniqueIndex, json } from "drizzle-orm/pg-core";
import { platformUsers } from "./social";

export const accessories = pgTable("accessories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  nameRu: text("name_ru"),
  nameEs: text("name_es"),
  description: text("description").notNull().default(""),
  descriptionRu: text("description_ru"),
  descriptionEs: text("description_es"),
  icon: text("icon").notNull(),
  category: text("category").notNull(),
  rarity: text("rarity").notNull().default("common"),
  obtainMethod: text("obtain_method").notNull().default("minigame"),
  eventTag: text("event_tag"),
  availableFrom: timestamp("available_from", { withTimezone: true }),
  availableUntil: timestamp("available_until", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const userAccessories = pgTable("user_accessories", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  accessoryId: integer("accessory_id").notNull().references(() => accessories.id, { onDelete: "cascade" }),
  equipped: boolean("equipped").notNull().default(false),
  obtainedAt: timestamp("obtained_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("user_accessories_user_idx").on(t.userId),
  uniqueIndex("user_accessories_unique_idx").on(t.userId, t.accessoryId),
]);

export const minigamePlays = pgTable("minigame_plays", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  gameId: text("game_id").notNull(),
  playedAt: timestamp("played_at", { withTimezone: true }).defaultNow().notNull(),
  won: boolean("won").notNull().default(false),
  rewardAccessoryId: integer("reward_accessory_id"),
}, (t) => [
  index("minigame_plays_user_idx").on(t.userId),
]);

export const gameChallenges = pgTable("game_challenges", {
  id: serial("id").primaryKey(),
  gameType: text("game_type").notNull(),
  challengerId: integer("challenger_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  opponentId: integer("opponent_id").references(() => platformUsers.id, { onDelete: "cascade" }),
  challengerMove: json("challenger_move"),
  opponentMove: json("opponent_move"),
  winnerId: integer("winner_id").references(() => platformUsers.id),
  rewardAccessoryId: integer("reward_accessory_id").references(() => accessories.id),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
}, (t) => [
  index("game_challenges_challenger_idx").on(t.challengerId),
  index("game_challenges_opponent_idx").on(t.opponentId),
  index("game_challenges_status_idx").on(t.status),
]);

export const quests = pgTable("quests", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  nameRu: text("name_ru"),
  nameEs: text("name_es"),
  description: text("description").notNull(),
  descriptionRu: text("description_ru"),
  descriptionEs: text("description_es"),
  icon: text("icon").notNull().default("⭐"),
  type: text("type").notNull(),
  target: integer("target").notNull(),
  rewardAccessoryId: integer("reward_accessory_id").notNull().references(() => accessories.id, { onDelete: "cascade" }),
  rarity: text("rarity").notNull().default("common"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const userQuests = pgTable("user_quests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  questId: integer("quest_id").notNull().references(() => quests.id, { onDelete: "cascade" }),
  progress: integer("progress").notNull().default(0),
  completed: boolean("completed").notNull().default(false),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("user_quests_user_idx").on(t.userId),
  uniqueIndex("user_quests_unique_idx").on(t.userId, t.questId),
]);

export type Accessory = typeof accessories.$inferSelect;
export type UserAccessory = typeof userAccessories.$inferSelect;
export type GameChallenge = typeof gameChallenges.$inferSelect;
export type Quest = typeof quests.$inferSelect;
export type UserQuest = typeof userQuests.$inferSelect;
