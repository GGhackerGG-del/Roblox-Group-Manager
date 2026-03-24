import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const licensesTable = sqliteTable("licenses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  plan: text("plan").notNull(),
  deviceFingerprint: text("device_fingerprint"),
  activated: integer("activated", { mode: "boolean" }).notNull().default(false),
  activatedAt: text("activated_at"),
  expiresAt: text("expires_at"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const gamificationProfiles = sqliteTable("gamification_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  robloxUserId: integer("roblox_user_id").notNull(),
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
  visitedSections: text("visited_sections", { mode: "json" }).$type<string[]>().default([]),
  claimedMilestones: text("claimed_milestones", { mode: "json" }).$type<string[]>().default([]),
  unlockedAchievements: text("unlocked_achievements", { mode: "json" }).$type<string[]>().default([]),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
}, (table) => [
  uniqueIndex("gamification_profiles_roblox_user_id_idx").on(table.robloxUserId),
]);

export const platformUsers = sqliteTable("platform_users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  robloxUserId: integer("roblox_user_id").notNull().unique(),
  robloxUsername: text("roblox_username").notNull(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  bio: text("bio").default("").notNull(),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
}, (t) => [
  index("platform_users_roblox_idx").on(t.robloxUserId),
]);

export const friendships = sqliteTable("friendships", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  requesterId: integer("requester_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  addresseeId: integer("addressee_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
}, (t) => [
  index("friendships_requester_idx").on(t.requesterId),
  index("friendships_addressee_idx").on(t.addresseeId),
]);

export const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  authorId: integer("author_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  imageUrl: text("image_url"),
  likesCount: integer("likes_count").notNull().default(0),
  commentsCount: integer("comments_count").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
}, (t) => [
  index("posts_author_idx").on(t.authorId),
]);

export const postLikes = sqliteTable("post_likes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  postId: integer("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
}, (t) => [
  index("post_likes_post_idx").on(t.postId),
]);

export const postComments = sqliteTable("post_comments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  postId: integer("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  authorId: integer("author_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
}, (t) => [
  index("post_comments_post_idx").on(t.postId),
]);

export const dmConversations = sqliteTable("dm_conversations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  user1Id: integer("user1_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  user2Id: integer("user2_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  lastMessageAt: text("last_message_at").notNull().default(sql`(datetime('now'))`),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const dmMessages = sqliteTable("dm_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  conversationId: integer("conversation_id").notNull().references(() => dmConversations.id, { onDelete: "cascade" }),
  senderId: integer("sender_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  imageUrl: text("image_url"),
  isRead: integer("is_read", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
}, (t) => [
  index("dm_messages_conv_idx").on(t.conversationId),
]);

export const featuredGroups = sqliteTable("featured_groups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  groupId: integer("group_id").notNull().unique(),
  name: text("name").notNull(),
  memberCount: integer("member_count").notNull().default(0),
  thumbnailUrl: text("thumbnail_url"),
  ownerUserId: integer("owner_user_id"),
  lastActiveAt: text("last_active_at").notNull().default(sql`(datetime('now'))`),
}, (t) => [
  index("featured_groups_last_active_idx").on(t.lastActiveAt),
]);

export const forumTopics = sqliteTable("forum_topics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  authorId: integer("author_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  category: text("category").notNull().default("suggestions"),
  isPinned: integer("is_pinned", { mode: "boolean" }).notNull().default(false),
  isClosed: integer("is_closed", { mode: "boolean" }).notNull().default(false),
  votesUp: integer("votes_up").notNull().default(0),
  votesDown: integer("votes_down").notNull().default(0),
  repliesCount: integer("replies_count").notNull().default(0),
  lastActivityAt: text("last_activity_at").notNull().default(sql`(datetime('now'))`),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
}, (t) => [
  index("forum_topics_author_idx").on(t.authorId),
  index("forum_topics_category_idx").on(t.category),
  index("forum_topics_last_activity_idx").on(t.lastActivityAt),
]);

export const forumReplies = sqliteTable("forum_replies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  topicId: integer("topic_id").notNull().references(() => forumTopics.id, { onDelete: "cascade" }),
  authorId: integer("author_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  isAnswer: integer("is_answer", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
}, (t) => [
  index("forum_replies_topic_idx").on(t.topicId),
  index("forum_replies_author_idx").on(t.authorId),
]);

export const topicVotes = sqliteTable("topic_votes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  topicId: integer("topic_id").notNull().references(() => forumTopics.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  value: integer("value").notNull(),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
}, (t) => [
  index("topic_votes_topic_idx").on(t.topicId),
  index("topic_votes_user_idx").on(t.userId),
  uniqueIndex("topic_votes_unique").on(t.topicId, t.userId),
]);

export const groupSubscriptions = sqliteTable("group_subscriptions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  robloxGroupId: integer("roblox_group_id").notNull(),
  groupName: text("group_name").notNull(),
  groupThumbnailUrl: text("group_thumbnail_url"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
}, (t) => [
  index("group_subs_user_idx").on(t.userId),
  index("group_subs_group_idx").on(t.robloxGroupId),
  uniqueIndex("group_subs_unique").on(t.userId, t.robloxGroupId),
]);

export const groupWorkspaces = sqliteTable("group_workspaces", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  robloxGroupId: integer("roblox_group_id").notNull().unique(),
  groupName: text("group_name").notNull(),
  groupThumbnailUrl: text("group_thumbnail_url"),
  ownerId: integer("owner_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  description: text("description").default(""),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
}, (t) => [
  index("group_workspaces_owner_idx").on(t.ownerId),
]);

export const workspaceMembers = sqliteTable("workspace_members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspace_id").notNull().references(() => groupWorkspaces.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  status: text("status").notNull().default("active"),
  invitedBy: integer("invited_by").references(() => platformUsers.id),
  joinedAt: text("joined_at").notNull().default(sql`(datetime('now'))`),
}, (t) => [
  uniqueIndex("workspace_members_unique").on(t.workspaceId, t.userId),
]);

export const groupChats = sqliteTable("group_chats", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  createdById: integer("created_by_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  workspaceId: integer("workspace_id").references(() => groupWorkspaces.id, { onDelete: "set null" }),
  avatarColor: text("avatar_color").default("#6366f1"),
  lastMessageAt: text("last_message_at").notNull().default(sql`(datetime('now'))`),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
}, (t) => [
  index("group_chats_created_idx").on(t.createdById),
]);

export const groupChatMembers = sqliteTable("group_chat_members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  chatId: integer("chat_id").notNull().references(() => groupChats.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  joinedAt: text("joined_at").notNull().default(sql`(datetime('now'))`),
}, (t) => [
  uniqueIndex("group_chat_members_unique").on(t.chatId, t.userId),
  index("group_chat_members_user_idx").on(t.userId),
]);

export const groupChatMessages = sqliteTable("group_chat_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  chatId: integer("chat_id").notNull().references(() => groupChats.id, { onDelete: "cascade" }),
  senderId: integer("sender_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  isDeleted: integer("is_deleted", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
}, (t) => [
  index("group_chat_msgs_chat_idx").on(t.chatId),
]);

export const collaborationProjects = sqliteTable("collaboration_projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspace_id").notNull().references(() => groupWorkspaces.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").default(""),
  status: text("status").notNull().default("active"),
  createdById: integer("created_by_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
}, (t) => [
  index("collab_projects_workspace_idx").on(t.workspaceId),
]);

export const collaborationTasks = sqliteTable("collaboration_tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull().references(() => collaborationProjects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").default(""),
  assignedToId: integer("assigned_to_id").references(() => platformUsers.id, { onDelete: "set null" }),
  status: text("status").notNull().default("todo"),
  priority: text("priority").notNull().default("medium"),
  createdById: integer("created_by_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  dueAt: text("due_at"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
}, (t) => [
  index("collab_tasks_project_idx").on(t.projectId),
]);

export const reputationEndorsements = sqliteTable("reputation_endorsements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fromUserId: integer("from_user_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  toUserId: integer("to_user_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  skill: text("skill").notNull().default("general"),
  message: text("message").default(""),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
}, (t) => [
  index("endorsements_to_idx").on(t.toUserId),
  uniqueIndex("endorsements_unique").on(t.fromUserId, t.toUserId, t.skill),
]);

export const marketplaceListings = sqliteTable("marketplace_listings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
}, (t) => [
  index("marketplace_seller_idx").on(t.sellerId),
  index("marketplace_category_idx").on(t.category),
]);

export const marketplaceLikes = sqliteTable("marketplace_likes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  listingId: integer("listing_id").notNull().references(() => marketplaceListings.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
}, (t) => [
  uniqueIndex("marketplace_likes_unique").on(t.listingId, t.userId),
]);

export const gameVisitSnapshots = sqliteTable("game_visit_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  universeId: integer("universe_id").notNull(),
  playing: integer("playing").notNull().default(0),
  visits: integer("visits").notNull().default(0),
  ts: text("ts").notNull().default(sql`(datetime('now'))`),
}, (t) => [
  index("game_visit_snapshots_universe_idx").on(t.universeId),
  index("game_visit_snapshots_ts_idx").on(t.ts),
]);

export const userSessions = sqliteTable("user_sessions", {
  sid: text("sid").primaryKey(),
  sess: text("sess").notNull(),
  expire: text("expire").notNull(),
});

export type License = typeof licensesTable.$inferSelect;
export type GamificationProfile = typeof gamificationProfiles.$inferSelect;
export type PlatformUser = typeof platformUsers.$inferSelect;
export type Friendship = typeof friendships.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type PostLike = typeof postLikes.$inferSelect;
export type PostComment = typeof postComments.$inferSelect;
export type DmConversation = typeof dmConversations.$inferSelect;
export type DmMessage = typeof dmMessages.$inferSelect;
export type FeaturedGroup = typeof featuredGroups.$inferSelect;
export type ForumTopic = typeof forumTopics.$inferSelect;
export type ForumReply = typeof forumReplies.$inferSelect;
export type TopicVote = typeof topicVotes.$inferSelect;
export type GroupSubscription = typeof groupSubscriptions.$inferSelect;
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
export type GameVisitSnapshot = typeof gameVisitSnapshots.$inferSelect;
