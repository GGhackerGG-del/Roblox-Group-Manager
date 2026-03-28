import { pgTable, serial, text, timestamp, integer, bigint, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const platformUsers = pgTable("platform_users", {
  id: serial("id").primaryKey(),
  robloxUserId: bigint("roblox_user_id", { mode: "number" }).notNull().unique(),
  robloxUsername: text("roblox_username").notNull(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  bio: text("bio").default("").notNull(),
  lastSeen: timestamp("last_seen", { withTimezone: true }),
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
  isDeleted: boolean("is_deleted").notNull().default(false),
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

export const forumTopics = pgTable("forum_topics", {
  id: serial("id").primaryKey(),
  authorId: integer("author_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  category: text("category").notNull().default("suggestions"),
  isPinned: boolean("is_pinned").notNull().default(false),
  isClosed: boolean("is_closed").notNull().default(false),
  votesUp: integer("votes_up").notNull().default(0),
  votesDown: integer("votes_down").notNull().default(0),
  repliesCount: integer("replies_count").notNull().default(0),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("forum_topics_author_idx").on(t.authorId),
  index("forum_topics_category_idx").on(t.category),
  index("forum_topics_last_activity_idx").on(t.lastActivityAt),
]);

export const forumReplies = pgTable("forum_replies", {
  id: serial("id").primaryKey(),
  topicId: integer("topic_id").notNull().references(() => forumTopics.id, { onDelete: "cascade" }),
  authorId: integer("author_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  isAnswer: boolean("is_answer").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("forum_replies_topic_idx").on(t.topicId),
  index("forum_replies_author_idx").on(t.authorId),
]);

export const topicVotes = pgTable("topic_votes", {
  id: serial("id").primaryKey(),
  topicId: integer("topic_id").notNull().references(() => forumTopics.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  value: integer("value").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("topic_votes_topic_idx").on(t.topicId),
  index("topic_votes_user_idx").on(t.userId),
  uniqueIndex("topic_votes_unique").on(t.topicId, t.userId),
]);

export const groupSubscriptions = pgTable("group_subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  robloxGroupId: bigint("roblox_group_id", { mode: "number" }).notNull(),
  groupName: text("group_name").notNull(),
  groupThumbnailUrl: text("group_thumbnail_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("group_subs_user_idx").on(t.userId),
  index("group_subs_group_idx").on(t.robloxGroupId),
  uniqueIndex("group_subs_unique").on(t.userId, t.robloxGroupId),
]);

export const insertPlatformUserSchema = createInsertSchema(platformUsers).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPlatformUser = z.infer<typeof insertPlatformUserSchema>;
export type PlatformUser = typeof platformUsers.$inferSelect;

export type Friendship = typeof friendships.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type PostLike = typeof postLikes.$inferSelect;
export type PostComment = typeof postComments.$inferSelect;
export type DmConversation = typeof dmConversations.$inferSelect;
export type DmMessage = typeof dmMessages.$inferSelect;
export type ForumTopic = typeof forumTopics.$inferSelect;
export type ForumReply = typeof forumReplies.$inferSelect;
export type TopicVote = typeof topicVotes.$inferSelect;
export type GroupSubscription = typeof groupSubscriptions.$inferSelect;

// ── Team Management ────────────────────────────────────────────────────────────

export const groupWorkspaces = pgTable("group_workspaces", {
  id: serial("id").primaryKey(),
  robloxGroupId: bigint("roblox_group_id", { mode: "number" }).notNull().unique(),
  groupName: text("group_name").notNull(),
  groupThumbnailUrl: text("group_thumbnail_url"),
  ownerId: integer("owner_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  description: text("description").default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("group_workspaces_owner_idx").on(t.ownerId),
]);

export const workspaceMembers = pgTable("workspace_members", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull().references(() => groupWorkspaces.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  status: text("status").notNull().default("active"),
  invitedBy: integer("invited_by").references(() => platformUsers.id),
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("workspace_members_unique").on(t.workspaceId, t.userId),
]);

// ── Group Chats ────────────────────────────────────────────────────────────────

export const groupChats = pgTable("group_chats", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  createdById: integer("created_by_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  workspaceId: integer("workspace_id").references(() => groupWorkspaces.id, { onDelete: "set null" }),
  avatarColor: text("avatar_color").default("#6366f1"),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("group_chats_created_idx").on(t.createdById),
]);

export const groupChatMembers = pgTable("group_chat_members", {
  id: serial("id").primaryKey(),
  chatId: integer("chat_id").notNull().references(() => groupChats.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("group_chat_members_unique").on(t.chatId, t.userId),
  index("group_chat_members_user_idx").on(t.userId),
]);

export const groupChatMessages = pgTable("group_chat_messages", {
  id: serial("id").primaryKey(),
  chatId: integer("chat_id").notNull().references(() => groupChats.id, { onDelete: "cascade" }),
  senderId: integer("sender_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("group_chat_msgs_chat_idx").on(t.chatId),
]);

// ── Collaboration ──────────────────────────────────────────────────────────────

export const collaborationProjects = pgTable("collaboration_projects", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull().references(() => groupWorkspaces.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").default(""),
  status: text("status").notNull().default("active"),
  createdById: integer("created_by_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("collab_projects_workspace_idx").on(t.workspaceId),
]);

export const collaborationTasks = pgTable("collaboration_tasks", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => collaborationProjects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").default(""),
  assignedToId: integer("assigned_to_id").references(() => platformUsers.id, { onDelete: "set null" }),
  status: text("status").notNull().default("todo"),
  priority: text("priority").notNull().default("medium"),
  createdById: integer("created_by_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  dueAt: timestamp("due_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("collab_tasks_project_idx").on(t.projectId),
]);

// ── Reputation ─────────────────────────────────────────────────────────────────

export const reputationEndorsements = pgTable("reputation_endorsements", {
  id: serial("id").primaryKey(),
  fromUserId: integer("from_user_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  toUserId: integer("to_user_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  skill: text("skill").notNull().default("general"),
  message: text("message").default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("endorsements_to_idx").on(t.toUserId),
  uniqueIndex("endorsements_unique").on(t.fromUserId, t.toUserId, t.skill),
]);

// ── Marketplace ────────────────────────────────────────────────────────────────

export const marketplaceListings = pgTable("marketplace_listings", {
  id: serial("id").primaryKey(),
  sellerId: integer("seller_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull().default("template"),
  previewUrl: text("preview_url"),
  downloadUrl: text("download_url"),
  price: integer("price").notNull().default(0),
  tagsJson: text("tags_json").default("[]"),
  downloadCount: integer("download_count").notNull().default(0),
  likesCount: integer("likes_count").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("marketplace_seller_idx").on(t.sellerId),
  index("marketplace_category_idx").on(t.category),
]);

export const marketplaceLikes = pgTable("marketplace_likes", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id").notNull().references(() => marketplaceListings.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("marketplace_likes_unique").on(t.listingId, t.userId),
]);

export const gameVisitSnapshots = pgTable("game_visit_snapshots", {
  id: serial("id").primaryKey(),
  universeId: bigint("universe_id", { mode: "number" }).notNull(),
  playing: integer("playing").notNull().default(0),
  visits: bigint("visits", { mode: "number" }).notNull().default(0),
  ts: timestamp("ts", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("game_visit_snapshots_universe_idx").on(t.universeId),
  index("game_visit_snapshots_ts_idx").on(t.ts),
]);

export type GameVisitSnapshot = typeof gameVisitSnapshots.$inferSelect;

export type GroupWorkspace = typeof groupWorkspaces.$inferSelect;
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type GroupChat = typeof groupChats.$inferSelect;
export type GroupChatMember = typeof groupChatMembers.$inferSelect;
export type GroupChatMessage = typeof groupChatMessages.$inferSelect;
export type CollaborationProject = typeof collaborationProjects.$inferSelect;
export type CollaborationTask = typeof collaborationTasks.$inferSelect;
export type ReputationEndorsement = typeof reputationEndorsements.$inferSelect;
export type MarketplaceListing = typeof marketplaceListings.$inferSelect;
export type MarketplaceLike = typeof marketplaceLikes.$inferSelect;
