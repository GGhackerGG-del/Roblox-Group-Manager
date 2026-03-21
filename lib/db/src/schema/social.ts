import { pgTable, serial, text, timestamp, integer, bigint, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const platformUsers = pgTable("platform_users", {
  id: serial("id").primaryKey(),
  robloxUserId: bigint("roblox_user_id", { mode: "number" }).notNull().unique(),
  robloxUsername: text("roblox_username").notNull(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  bio: text("bio").default("").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("platform_users_roblox_idx").on(t.robloxUserId),
]);

export const friendships = pgTable("friendships", {
  id: serial("id").primaryKey(),
  requesterId: integer("requester_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  addresseeId: integer("addressee_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("friendships_requester_idx").on(t.requesterId),
  index("friendships_addressee_idx").on(t.addresseeId),
]);

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  authorId: integer("author_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  imageUrl: text("image_url"),
  likesCount: integer("likes_count").notNull().default(0),
  commentsCount: integer("comments_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("posts_author_idx").on(t.authorId),
]);

export const postLikes = pgTable("post_likes", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("post_likes_post_idx").on(t.postId),
]);

export const postComments = pgTable("post_comments", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  authorId: integer("author_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("post_comments_post_idx").on(t.postId),
]);

export const dmConversations = pgTable("dm_conversations", {
  id: serial("id").primaryKey(),
  user1Id: integer("user1_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  user2Id: integer("user2_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const dmMessages = pgTable("dm_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => dmConversations.id, { onDelete: "cascade" }),
  senderId: integer("sender_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  imageUrl: text("image_url"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("dm_messages_conv_idx").on(t.conversationId),
]);

export const featuredGroups = pgTable("featured_groups", {
  id: serial("id").primaryKey(),
  groupId: bigint("group_id", { mode: "number" }).notNull().unique(),
  name: text("name").notNull(),
  memberCount: integer("member_count").notNull().default(0),
  thumbnailUrl: text("thumbnail_url"),
  ownerUserId: bigint("owner_user_id", { mode: "number" }),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("featured_groups_last_active_idx").on(t.lastActiveAt),
]);

export type FeaturedGroup = typeof featuredGroups.$inferSelect;

export const insertPlatformUserSchema = createInsertSchema(platformUsers).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPlatformUser = z.infer<typeof insertPlatformUserSchema>;
export type PlatformUser = typeof platformUsers.$inferSelect;

export type Friendship = typeof friendships.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type PostLike = typeof postLikes.$inferSelect;
export type PostComment = typeof postComments.$inferSelect;
export type DmConversation = typeof dmConversations.$inferSelect;
export type DmMessage = typeof dmMessages.$inferSelect;
