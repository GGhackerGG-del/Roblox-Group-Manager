import { useState, useEffect, useRef, useCallback } from "react";
import { getAuthCredentials } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Heart, MessageCircle, UserPlus, Users, Send, Image as ImageIcon,
  ChevronRight, Loader2, UserCheck, X, Check, Clock, Trash2,
  Globe, MessageSquare, Search, RefreshCw, Star, ExternalLink, Pencil,
  Lightbulb, Coffee, HelpCircle, Trophy, Bell, BellOff, ThumbsUp, ThumbsDown,
  MessageCircleQuestion, Plus, ArrowLeft, CheckCircle2, Crown, Award, Flame
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function getAuthHeaders(): Record<string, string> {
  const { token, fingerprint } = getAuthCredentials();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (fingerprint) headers["X-Device-Fingerprint"] = fingerprint;
  return headers;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      ...getAuthHeaders(),
      "Content-Type": "application/json",
      ...(options?.headers as Record<string, string> || {}),
    },
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: "Network error" })) as { error?: string };
    throw new Error(err.error || "Request failed");
  }
  return r.json() as Promise<T>;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlatformUser {
  id: number;
  robloxUserId: number;
  robloxUsername: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  createdAt: string;
  friendship?: { status: string; isRequester: boolean; id: number } | null;
  isMe?: boolean;
}

interface Post {
  id: number;
  authorId: number;
  content: string;
  imageUrl: string | null;
  likesCount: number;
  commentsCount: number;
  createdAt: string;
  author: PlatformUser;
  isLiked: boolean;
}

interface Comment {
  id: number;
  postId: number;
  content: string;
  createdAt: string;
  author: PlatformUser;
}

interface DmConversation {
  conversation: { id: number; user1Id: number; user2Id: number; lastMessageAt: string };
  otherUser: PlatformUser;
  lastMessage: { content: string; senderId: number; createdAt: string } | null;
  unreadCount: number;
}

interface DmMessage {
  id: number;
  conversationId: number;
  senderId: number;
  content: string;
  isRead: boolean;
  createdAt: string;
}

interface UserProfile {
  user: PlatformUser;
  groups: Array<{ id: number; name: string; memberCount: number; thumbnailUrl: string | null }>;
  posts: Post[];
  friendship: { id: number; status: string; requesterId: number } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ── User Profile Modal ────────────────────────────────────────────────────────

function UserProfileModal({ userId, myUser, onClose, onChat }: {
  userId: number;
  myUser: PlatformUser | null;
  onClose: () => void;
  onChat?: (user: PlatformUser) => void;
}) {
  const { toast } = useToast();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [friendStatus, setFriendStatus] = useState<{ id: number; status: string; requesterId: number } | null>(null);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    apiFetch<UserProfile>(`/api/social/users/${userId}`)
      .then(d => {
        setProfile(d);
        setFriendStatus(d.friendship);
      })
      .catch(() => toast({ variant: "destructive", title: "Error", description: "Failed to load profile" }))
      .finally(() => setLoading(false));
  }, [userId]);

  const isMe = profile?.user.id === myUser?.id;

  const handleFriendAction = async () => {
    if (!profile || !myUser) return;
    setRequesting(true);
    try {
      if (!friendStatus) {
        await apiFetch("/api/social/friends/request", {
          method: "POST",
          body: JSON.stringify({ targetUserId: profile.user.id }),
        });
        setFriendStatus({ id: -1, status: "pending", requesterId: myUser.id });
        toast({ title: "Friend request sent!" });
      } else if (friendStatus.status === "accepted") {
        await apiFetch(`/api/social/friends/${friendStatus.id}`, { method: "DELETE" });
        setFriendStatus(null);
        toast({ title: "Unfriended" });
      } else if (friendStatus.status === "pending" && friendStatus.requesterId !== myUser.id) {
        await apiFetch(`/api/social/friends/${friendStatus.id}`, {
          method: "PUT",
          body: JSON.stringify({ action: "accept" }),
        });
        setFriendStatus({ ...friendStatus, status: "accepted" });
        toast({ title: "Friend added!" });
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: err instanceof Error ? err.message : "Failed" });
    } finally {
      setRequesting(false);
    }
  };

  const getFriendButtonLabel = () => {
    if (!friendStatus) return { label: "Add Friend", icon: <UserPlus className="w-4 h-4 mr-1.5" /> };
    if (friendStatus.status === "accepted") return { label: "Friends ✓", icon: <UserCheck className="w-4 h-4 mr-1.5" /> };
    if (friendStatus.status === "pending" && friendStatus.requesterId === myUser?.id) return { label: "Request Sent", icon: <Clock className="w-4 h-4 mr-1.5" /> };
    if (friendStatus.status === "pending") return { label: "Accept Request", icon: <Check className="w-4 h-4 mr-1.5" /> };
    return { label: "Add Friend", icon: <UserPlus className="w-4 h-4 mr-1.5" /> };
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-background rounded-3xl border border-border shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : profile ? (
          <>
            {/* Cover + Avatar */}
            <div className="relative">
              <div className="h-28 bg-gradient-to-br from-zinc-800 via-zinc-700 to-zinc-900 rounded-t-3xl" />
              <div className="absolute -bottom-10 left-6">
                <Avatar className="w-20 h-20 border-4 border-background shadow-xl">
                  <AvatarImage src={profile.user.avatarUrl || undefined} />
                  <AvatarFallback className="text-2xl font-bold">{profile.user.displayName.charAt(0)}</AvatarFallback>
                </Avatar>
              </div>
              <button onClick={onClose} className="absolute top-3 right-3 w-8 h-8 bg-black/50 text-white rounded-full flex items-center justify-center hover:bg-black/80">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="pt-14 px-6 pb-6 space-y-5">
              {/* Profile Info */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-2xl font-bold">{profile.user.displayName}</h2>
                    {isMe && <Badge className="text-xs bg-black text-white border-0">You</Badge>}
                    {friendStatus?.status === "accepted" && !isMe && (
                      <Badge className="text-xs bg-green-500/15 text-green-600 border-green-500/20">Friends</Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground text-sm">@{profile.user.robloxUsername}</p>
                  <a
                    href={`https://www.roblox.com/users/${profile.user.robloxUserId}/profile`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-500 hover:underline flex items-center gap-1 mt-0.5"
                  >
                    View on Roblox <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                {!isMe && myUser && (
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant={friendStatus?.status === "accepted" ? "outline" : "default"}
                      className="rounded-xl gap-1"
                      onClick={handleFriendAction}
                      disabled={requesting || (friendStatus?.status === "pending" && friendStatus.requesterId === myUser.id)}
                    >
                      {requesting ? <Loader2 className="w-4 h-4 animate-spin" /> : getFriendButtonLabel().icon}
                      {getFriendButtonLabel().label}
                    </Button>
                    {friendStatus?.status === "accepted" && onChat && (
                      <Button size="sm" variant="outline" className="rounded-xl gap-1" onClick={() => { onChat(profile.user); onClose(); }}>
                        <MessageSquare className="w-4 h-4" /> Chat
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {profile.user.bio && (
                <p className="text-sm text-muted-foreground bg-secondary/50 rounded-xl p-3">{profile.user.bio}</p>
              )}

              {/* Groups */}
              {profile.groups.length > 0 && (
                <div>
                  <h3 className="font-bold text-sm flex items-center gap-2 mb-3">
                    <Users className="w-4 h-4" /> Groups ({profile.groups.length})
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {profile.groups.map(g => (
                      <a key={g.id} href={`https://www.roblox.com/groups/${g.id}`} target="_blank" rel="noopener noreferrer">
                        <div className="flex items-center gap-2 p-3 rounded-xl border border-border hover:bg-secondary/50 transition-colors">
                          <div className="w-10 h-10 rounded-lg overflow-hidden border border-border shrink-0">
                            {g.thumbnailUrl ? (
                              <img src={g.thumbnailUrl} alt={g.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-secondary flex items-center justify-center text-xs font-bold">
                                {g.name.substring(0, 2).toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold truncate">{g.name}</p>
                            <p className="text-[10px] text-muted-foreground">{g.memberCount.toLocaleString()} members</p>
                          </div>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Posts */}
              {profile.posts.length > 0 && (
                <div>
                  <h3 className="font-bold text-sm flex items-center gap-2 mb-3">
                    <MessageSquare className="w-4 h-4" /> Posts ({profile.posts.length})
                  </h3>
                  <div className="space-y-2">
                    {profile.posts.slice(0, 5).map(p => (
                      <div key={p.id} className="bg-secondary/50 rounded-xl p-3">
                        <p className="text-sm line-clamp-3">{p.content}</p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{p.likesCount}</span>
                          <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" />{p.commentsCount}</span>
                          <span>{timeAgo(p.createdAt)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!profile.user.bio && profile.groups.length === 0 && profile.posts.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Star className="w-8 h-8 mx-auto mb-2 opacity-30" strokeWidth={1} />
                  <p className="text-sm">This developer hasn't shared anything yet.</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="text-center py-12 text-muted-foreground">Profile not found</div>
        )}
      </motion.div>
    </div>
  );
}

// ── Post Card ─────────────────────────────────────────────────────────────────

function PostCard({ post, myUserId, onLike, onDelete, onComment, onUserClick }: {
  post: Post;
  myUserId: number | null;
  onLike: (id: number) => void;
  onDelete: (id: number) => void;
  onComment: (post: Post) => void;
  onUserClick: (userId: number) => void;
}) {
  const isOwn = myUserId === post.authorId;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="rounded-2xl border border-border shadow-sm hover:shadow-md transition-all">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <button className="flex items-center gap-3 text-left" onClick={() => onUserClick(post.authorId)}>
              <Avatar className="w-10 h-10 border border-border">
                <AvatarImage src={post.author?.avatarUrl || undefined} />
                <AvatarFallback className="font-bold text-sm">{post.author?.displayName?.charAt(0) || "?"}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold text-sm hover:underline">{post.author?.displayName}</p>
                <p className="text-xs text-muted-foreground">@{post.author?.robloxUsername} · {timeAgo(post.createdAt)}</p>
              </div>
            </button>
            {isOwn && (
              <button onClick={() => onDelete(post.id)} className="text-muted-foreground hover:text-destructive transition-colors p-1.5 rounded-lg hover:bg-destructive/10">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <p className="text-sm leading-relaxed whitespace-pre-wrap">{post.content}</p>

          {post.imageUrl && (
            <div className="rounded-xl overflow-hidden border border-border">
              <img src={post.imageUrl} alt="post" className="w-full max-h-80 object-cover" />
            </div>
          )}

          <div className="flex items-center gap-5 pt-1 border-t border-border/50">
            <button
              onClick={() => onLike(post.id)}
              className={`flex items-center gap-1.5 text-sm font-medium transition-all pt-2 ${post.isLiked ? "text-red-500" : "text-muted-foreground hover:text-red-400"}`}
            >
              <Heart className={`w-4 h-4 ${post.isLiked ? "fill-red-500" : ""}`} />
              {post.likesCount > 0 && <span>{post.likesCount}</span>}
            </button>
            <button
              onClick={() => onComment(post)}
              className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors pt-2"
            >
              <MessageCircle className="w-4 h-4" />
              {post.commentsCount > 0 && <span>{post.commentsCount}</span>}
              <span>Comment</span>
            </button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ── Comments Panel ────────────────────────────────────────────────────────────

function CommentsPanel({ post, myUser, onClose }: { post: Post; myUser: PlatformUser | null; onClose: () => void }) {
  const { toast } = useToast();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    apiFetch<{ comments: Comment[] }>(`/api/social/posts/${post.id}/comments`)
      .then(d => setComments(d.comments))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [post.id]);

  const handleSend = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      const d = await apiFetch<{ comment: Comment }>(`/api/social/posts/${post.id}/comments`, {
        method: "POST",
        body: JSON.stringify({ content: text.trim() }),
      });
      setComments(prev => [...prev, d.comment]);
      setText("");
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: "Failed to comment" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end md:items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 30 }}
        className="bg-background rounded-3xl border border-border shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h3 className="font-bold">Comments</h3>
            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{post.content}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/70">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : comments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">No comments yet. Be the first!</div>
          ) : (
            comments.map(c => (
              <div key={c.id} className="flex items-start gap-3">
                <Avatar className="w-8 h-8 shrink-0 border border-border">
                  <AvatarImage src={c.author?.avatarUrl || undefined} />
                  <AvatarFallback className="text-xs font-bold">{c.author?.displayName?.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 bg-secondary/60 rounded-xl px-3 py-2.5">
                  <p className="text-xs font-semibold">{c.author?.displayName} <span className="font-normal text-muted-foreground">· {timeAgo(c.createdAt)}</span></p>
                  <p className="text-sm mt-1">{c.content}</p>
                </div>
              </div>
            ))
          )}
        </div>
        {myUser && (
          <div className="p-4 border-t border-border flex gap-2 items-center">
            <Avatar className="w-8 h-8 shrink-0 border border-border">
              <AvatarImage src={myUser.avatarUrl || undefined} />
              <AvatarFallback className="text-xs font-bold">{myUser.displayName.charAt(0)}</AvatarFallback>
            </Avatar>
            <Input
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
              placeholder="Write a comment..."
              className="rounded-xl flex-1"
            />
            <Button onClick={handleSend} disabled={sending || !text.trim()} size="sm" className="rounded-xl px-3 shrink-0">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ── Feed Tab ──────────────────────────────────────────────────────────────────

function FeedTab({ myUser, onUserClick }: { myUser: PlatformUser | null; onUserClick: (userId: number) => void }) {
  const { toast } = useToast();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [newContent, setNewContent] = useState("");
  const [posting, setPosting] = useState(false);
  const [commentPost, setCommentPost] = useState<Post | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [showImageInput, setShowImageInput] = useState(false);

  const fetchFeed = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiFetch<{ posts: Post[] }>("/api/social/feed");
      setPosts(d.posts);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchFeed(); }, [fetchFeed]);

  const handlePost = async () => {
    if (!newContent.trim()) return;
    setPosting(true);
    try {
      const d = await apiFetch<{ post: Post }>("/api/social/posts", {
        method: "POST",
        body: JSON.stringify({ content: newContent.trim(), imageUrl: imageUrl.trim() || undefined }),
      });
      setPosts(prev => [d.post, ...prev]);
      setNewContent(""); setImageUrl(""); setShowImageInput(false);
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: err instanceof Error ? err.message : "Failed to post" });
    } finally { setPosting(false); }
  };

  const handleLike = async (postId: number) => {
    if (!myUser) return;
    try {
      const d = await apiFetch<{ liked: boolean }>(`/api/social/posts/${postId}/like`, { method: "POST" });
      setPosts(prev => prev.map(p => p.id === postId ? {
        ...p, isLiked: d.liked, likesCount: d.liked ? p.likesCount + 1 : p.likesCount - 1
      } : p));
    } catch {}
  };

  const handleDelete = async (postId: number) => {
    try {
      await apiFetch(`/api/social/posts/${postId}`, { method: "DELETE" });
      setPosts(prev => prev.filter(p => p.id !== postId));
    } catch {}
  };

  return (
    <div className="space-y-5">
      {/* Composer */}
      {myUser && (
        <Card className="rounded-2xl border border-border shadow-sm">
          <CardContent className="p-4 space-y-3">
            <div className="flex gap-3">
              <Avatar className="w-9 h-9 shrink-0 border border-border mt-0.5">
                <AvatarImage src={myUser.avatarUrl || undefined} />
                <AvatarFallback className="font-bold text-xs">{myUser.displayName.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-2">
                <Textarea
                  value={newContent}
                  onChange={e => setNewContent(e.target.value)}
                  placeholder={`What's on your mind, ${myUser.displayName.split(" ")[0]}?`}
                  className="resize-none min-h-[80px] rounded-xl text-sm border-0 bg-secondary/50 focus-visible:ring-1"
                />
                <AnimatePresence>
                  {showImageInput && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                      <Input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="Image URL (https://...)" className="rounded-xl text-sm" />
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setShowImageInput(p => !p)}
                    className={`text-xs flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-colors ${showImageInput ? "border-black text-foreground bg-secondary" : "border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary"}`}
                  >
                    <ImageIcon className="w-3.5 h-3.5" /> Attach image
                  </button>
                  <Button onClick={handlePost} disabled={posting || !newContent.trim()} size="sm" className="rounded-xl gap-2 h-8">
                    {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    Publish
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Recent Posts</p>
        <Button size="sm" variant="ghost" onClick={fetchFeed} className="rounded-lg text-xs gap-1.5 h-8">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>

      {loading ? (
        <div className="space-y-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div>
      ) : posts.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Globe className="w-12 h-12 mx-auto mb-3 opacity-30" strokeWidth={1} />
          <p className="font-medium">No posts yet</p>
          <p className="text-sm mt-1">Be the first to share something!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map(p => (
            <PostCard
              key={p.id}
              post={p}
              myUserId={myUser?.id || null}
              onLike={handleLike}
              onDelete={handleDelete}
              onComment={setCommentPost}
              onUserClick={onUserClick}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {commentPost && (
          <CommentsPanel post={commentPost} myUser={myUser} onClose={() => setCommentPost(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Discover Tab ──────────────────────────────────────────────────────────────

function DiscoverTab({ myUser, onUserClick, onChat }: {
  myUser: PlatformUser | null;
  onUserClick: (userId: number) => void;
  onChat: (user: PlatformUser) => void;
}) {
  const { toast } = useToast();
  const [users, setUsers] = useState<Array<PlatformUser & { isMe?: boolean }>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [requesting, setRequesting] = useState<number | null>(null);

  useEffect(() => {
    apiFetch<{ users: Array<PlatformUser & { isMe?: boolean }> }>("/api/social/users")
      .then(d => setUsers(d.users))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = users.filter(u =>
    !search ||
    u.displayName.toLowerCase().includes(search.toLowerCase()) ||
    u.robloxUsername.toLowerCase().includes(search.toLowerCase())
  );

  // Sort: current user first, then others
  const sorted = [...filtered].sort((a, b) => {
    if (a.isMe) return -1;
    if (b.isMe) return 1;
    return 0;
  });

  const handleSendRequest = async (targetUserId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setRequesting(targetUserId);
    try {
      await apiFetch("/api/social/friends/request", {
        method: "POST",
        body: JSON.stringify({ targetUserId }),
      });
      setUsers(prev => prev.map(u => u.id === targetUserId ? {
        ...u, friendship: { status: "pending", isRequester: true, id: -1 }
      } : u));
      toast({ title: "Request sent!" });
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: err instanceof Error ? err.message : "Failed" });
    } finally { setRequesting(null); }
  };

  const getFriendChip = (user: PlatformUser & { isMe?: boolean }) => {
    if (user.isMe) return <Badge className="text-[10px] bg-black text-white border-0">You</Badge>;
    if (!user.friendship) return null;
    if (user.friendship.status === "accepted") return <Badge className="text-[10px] bg-green-500/15 text-green-600 border-green-500/20">Friends</Badge>;
    if (user.friendship.status === "pending" && user.friendship.isRequester) return <Badge variant="outline" className="text-[10px]">Pending</Badge>;
    if (user.friendship.status === "pending") return <Badge className="text-[10px] bg-blue-500/15 text-blue-600 border-blue-500/20">Wants to friend</Badge>;
    return null;
  };

  return (
    <div className="space-y-5">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search developers by name..."
          className="pl-9 rounded-xl"
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" strokeWidth={1} />
          <p className="font-medium">{search ? "No users found" : "No developers registered yet"}</p>
          <p className="text-sm mt-1">Visit Community to register your profile and appear here.</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{sorted.length} developers found</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sorted.map(user => (
              <motion.div key={user.id} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
                <Card
                  className={`rounded-2xl border shadow-sm hover:shadow-md transition-all cursor-pointer ${user.isMe ? "border-black/20 bg-secondary/30" : "border-border"}`}
                  onClick={() => onUserClick(user.id)}
                >
                  <CardContent className="p-4 flex items-center gap-3">
                    <Avatar className="w-12 h-12 border border-border shrink-0">
                      <AvatarImage src={user.avatarUrl || undefined} />
                      <AvatarFallback className="font-bold">{user.displayName.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <p className="font-semibold text-sm">{user.displayName}</p>
                        {getFriendChip(user)}
                      </div>
                      <p className="text-xs text-muted-foreground">@{user.robloxUsername}</p>
                      {user.bio && <p className="text-xs text-muted-foreground/70 line-clamp-1 mt-0.5">{user.bio}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {myUser && !user.isMe && !user.friendship && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-lg h-7 px-2.5 text-xs gap-1"
                          onClick={e => handleSendRequest(user.id, e)}
                          disabled={requesting === user.id}
                        >
                          {requesting === user.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
                        </Button>
                      )}
                      {user.friendship?.status === "accepted" && !user.isMe && onChat && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-lg h-7 px-2.5 text-xs"
                          onClick={e => { e.stopPropagation(); onChat(user); }}
                        >
                          <MessageSquare className="w-3 h-3" />
                        </Button>
                      )}
                      <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Friends Tab ───────────────────────────────────────────────────────────────

function FriendsTab({ myUser, onChat, onUserClick }: {
  myUser: PlatformUser | null;
  onChat: (user: PlatformUser) => void;
  onUserClick: (userId: number) => void;
}) {
  const { toast } = useToast();
  const [friends, setFriends] = useState<Array<{ friendship: { id: number; status: string }; user: PlatformUser }>>([]);
  const [pending, setPending] = useState<Array<{ friendship: { id: number; status: string }; user: PlatformUser }>>([]);
  const [loading, setLoading] = useState(true);

  const fetchFriends = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiFetch<{
        friends: Array<{ friendship: { id: number; status: string }; user: PlatformUser }>;
        pending: Array<{ friendship: { id: number; status: string }; user: PlatformUser }>;
      }>("/api/social/friends");
      setFriends(d.friends);
      setPending(d.pending);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchFriends(); }, [fetchFriends]);

  const handleAction = async (friendshipId: number, action: "accept" | "reject") => {
    try {
      await apiFetch(`/api/social/friends/${friendshipId}`, {
        method: "PUT",
        body: JSON.stringify({ action }),
      });
      fetchFriends();
      toast({ title: action === "accept" ? "Friend added!" : "Request declined" });
    } catch {}
  };

  const handleUnfriend = async (friendshipId: number) => {
    try {
      await apiFetch(`/api/social/friends/${friendshipId}`, { method: "DELETE" });
      fetchFriends();
    } catch {}
  };

  if (loading) {
    return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>;
  }

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <div>
          <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4" /> Incoming Requests ({pending.length})
          </h3>
          <div className="space-y-3">
            {pending.map(({ friendship: f, user }) => (
              <Card key={f.id} className="rounded-2xl border border-border shadow-sm">
                <CardContent className="p-4 flex items-center gap-3">
                  <button onClick={() => onUserClick(user.id)}>
                    <Avatar className="w-11 h-11 border border-border">
                      <AvatarImage src={user?.avatarUrl || undefined} />
                      <AvatarFallback className="font-bold">{user?.displayName?.charAt(0)}</AvatarFallback>
                    </Avatar>
                  </button>
                  <div className="flex-1 min-w-0">
                    <button className="text-sm font-semibold hover:underline" onClick={() => onUserClick(user.id)}>{user?.displayName}</button>
                    <p className="text-xs text-muted-foreground">@{user?.robloxUsername}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="rounded-xl gap-1.5 h-8 text-xs" onClick={() => handleAction(f.id, "accept")}>
                      <Check className="w-3.5 h-3.5" /> Accept
                    </Button>
                    <Button size="sm" variant="outline" className="rounded-xl h-8 text-xs" onClick={() => handleAction(f.id, "reject")}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <UserCheck className="w-4 h-4" /> Friends ({friends.length})
        </h3>
        {friends.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-30" strokeWidth={1} />
            <p className="font-medium">No friends yet</p>
            <p className="text-sm mt-1">Find developers in the Discover tab</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {friends.map(({ friendship: f, user }) => (
              <Card key={f.id} className="rounded-2xl border border-border shadow-sm">
                <CardContent className="p-4 flex items-center gap-3">
                  <button onClick={() => onUserClick(user.id)}>
                    <Avatar className="w-11 h-11 border border-border">
                      <AvatarImage src={user?.avatarUrl || undefined} />
                      <AvatarFallback className="font-bold">{user?.displayName?.charAt(0)}</AvatarFallback>
                    </Avatar>
                  </button>
                  <div className="flex-1 min-w-0">
                    <button className="text-sm font-semibold hover:underline" onClick={() => onUserClick(user.id)}>{user?.displayName}</button>
                    <p className="text-xs text-muted-foreground">@{user?.robloxUsername}</p>
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" className="rounded-xl h-8 px-3 text-xs gap-1.5" onClick={() => onChat(user)}>
                      <MessageSquare className="w-3.5 h-3.5" /> Chat
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="rounded-xl h-8 px-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleUnfriend(f.id)}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Chat Tab ──────────────────────────────────────────────────────────────────

function ChatTab({ myUser, initialChatUser, onClearInitial }: {
  myUser: PlatformUser | null;
  initialChatUser: PlatformUser | null;
  onClearInitial: () => void;
}) {
  const { toast } = useToast();
  const [conversations, setConversations] = useState<DmConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeChat, setActiveChat] = useState<PlatformUser | null>(null);
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchConversations = useCallback(async () => {
    try {
      const d = await apiFetch<{ conversations: DmConversation[] }>("/api/social/messages");
      setConversations(d.conversations);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  const openChat = useCallback(async (user: PlatformUser) => {
    setActiveChat(user);
    setLoadingMsgs(true);
    try {
      const d = await apiFetch<{ messages: DmMessage[] }>(`/api/social/messages/${user.id}`);
      setMessages(d.messages);
    } catch {} finally { setLoadingMsgs(false); }
  }, []);

  useEffect(() => {
    if (initialChatUser) { openChat(initialChatUser); onClearInitial(); }
  }, [initialChatUser, openChat, onClearInitial]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!text.trim() || !activeChat) return;
    setSending(true);
    try {
      const d = await apiFetch<{ message: DmMessage }>(`/api/social/messages/${activeChat.id}`, {
        method: "POST",
        body: JSON.stringify({ content: text.trim() }),
      });
      setMessages(prev => [...prev, d.message]);
      setText("");
      fetchConversations();
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to send message" });
    } finally { setSending(false); }
  };

  return (
    <div className="flex gap-4 h-[620px]">
      {/* Sidebar */}
      <div className="w-72 shrink-0 flex flex-col border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="p-3 border-b border-border bg-secondary/40">
          <p className="font-bold text-sm">Messages</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-3 space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4 text-center">
              <MessageSquare className="w-8 h-8 mb-2 opacity-30" strokeWidth={1} />
              <p className="text-xs font-medium">No chats yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Go to Friends → Chat to start</p>
            </div>
          ) : (
            conversations.map(({ conversation, otherUser, lastMessage, unreadCount }) => (
              <div
                key={conversation.id}
                onClick={() => openChat(otherUser)}
                className={`flex items-center gap-2.5 p-3 cursor-pointer hover:bg-secondary/40 transition-colors border-b border-border/40 ${activeChat?.id === otherUser?.id ? "bg-secondary/70" : ""}`}
              >
                <div className="relative">
                  <Avatar className="w-9 h-9 border border-border shrink-0">
                    <AvatarImage src={otherUser?.avatarUrl || undefined} />
                    <AvatarFallback className="text-xs font-bold">{otherUser?.displayName?.charAt(0)}</AvatarFallback>
                  </Avatar>
                  {unreadCount > 0 && (
                    <div className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-black rounded-full flex items-center justify-center text-[9px] text-white font-bold">
                      {unreadCount}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{otherUser?.displayName}</p>
                  {lastMessage && <p className="text-[10px] text-muted-foreground truncate">{lastMessage.content}</p>}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat window */}
      <div className="flex-1 flex flex-col border border-border rounded-2xl overflow-hidden shadow-sm">
        {!activeChat ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
            <MessageSquare className="w-12 h-12 mb-3 opacity-30" strokeWidth={1} />
            <p className="font-medium">Select a conversation</p>
            <p className="text-sm mt-1 text-muted-foreground/70">Choose a chat from the list</p>
          </div>
        ) : (
          <>
            <div className="p-4 border-b border-border bg-secondary/30 flex items-center gap-3">
              <Avatar className="w-8 h-8 border border-border">
                <AvatarImage src={activeChat.avatarUrl || undefined} />
                <AvatarFallback className="text-xs font-bold">{activeChat.displayName.charAt(0)}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold text-sm">{activeChat.displayName}</p>
                <p className="text-xs text-muted-foreground">@{activeChat.robloxUsername}</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingMsgs ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : messages.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">No messages yet. Say hello! 👋</div>
              ) : (
                messages.map(msg => {
                  const isOwn = myUser && msg.senderId === myUser.id;
                  return (
                    <div key={msg.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${isOwn ? "bg-black text-white rounded-br-md" : "bg-secondary rounded-bl-md"}`}>
                        {msg.content}
                        <p className={`text-[10px] mt-1 ${isOwn ? "text-white/50" : "text-muted-foreground"}`}>{timeAgo(msg.createdAt)}</p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {myUser && (
              <div className="p-3 border-t border-border flex gap-2 items-center">
                <Input
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
                  placeholder={`Message ${activeChat.displayName}...`}
                  className="rounded-xl flex-1"
                />
                <Button onClick={handleSend} disabled={sending || !text.trim()} size="sm" className="rounded-xl px-3 h-9 shrink-0">
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Forum Types ──────────────────────────────────────────────────────────────

interface ForumTopic {
  id: number;
  authorId: number;
  title: string;
  content: string;
  category: string;
  isPinned: boolean;
  isClosed: boolean;
  votesUp: number;
  votesDown: number;
  repliesCount: number;
  lastActivityAt: string;
  createdAt: string;
  author: PlatformUser;
  myVote: number;
}

interface ForumReply {
  id: number;
  topicId: number;
  authorId: number;
  content: string;
  isAnswer: boolean;
  createdAt: string;
  author: PlatformUser;
}

interface GroupSub {
  id: number;
  userId: number;
  robloxGroupId: number;
  groupName: string;
  groupThumbnailUrl: string | null;
  createdAt: string;
}

interface LeaderboardEntry {
  user: PlatformUser;
  count: number;
}

const FORUM_CATEGORIES = [
  { key: "suggestions", label: "Suggestions", icon: <Lightbulb className="w-4 h-4" />, desc: "Suggest features for the platform" },
  { key: "offtopic", label: "Off-topic", icon: <Coffee className="w-4 h-4" />, desc: "Chat about anything" },
  { key: "qa", label: "Q&A", icon: <HelpCircle className="w-4 h-4" />, desc: "Ask questions, get answers" },
];

// ── Forum Tab ────────────────────────────────────────────────────────────────

function ForumTab({ myUser, onUserClick }: { myUser: PlatformUser | null; onUserClick: (id: number) => void }) {
  const { toast } = useToast();
  const [category, setCategory] = useState("suggestions");
  const [topics, setTopics] = useState<ForumTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<ForumTopic | null>(null);
  const [replies, setReplies] = useState<ForumReply[]>([]);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

  const fetchTopics = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ topics: ForumTopic[] }>(`/api/forum/topics?category=${category}`);
      setTopics(data.topics);
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to load topics" });
    } finally { setLoading(false); }
  }, [category]);

  useEffect(() => { fetchTopics(); }, [fetchTopics]);

  const handleCreate = async () => {
    if (!newTitle.trim() || !newContent.trim()) return;
    setSubmitting(true);
    try {
      const data = await apiFetch<{ topic: ForumTopic }>("/api/forum/topics", {
        method: "POST",
        body: JSON.stringify({ title: newTitle.trim(), content: newContent.trim(), category }),
      });
      setTopics(prev => [data.topic, ...prev]);
      setNewTitle("");
      setNewContent("");
      setCreating(false);
      toast({ title: "Topic created!" });
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: err instanceof Error ? err.message : "Failed" });
    } finally { setSubmitting(false); }
  };

  const handleVote = async (topicId: number, value: number) => {
    try {
      const data = await apiFetch<{ votesUp: number; votesDown: number; myVote: number }>(`/api/forum/topics/${topicId}/vote`, {
        method: "POST",
        body: JSON.stringify({ value }),
      });
      setTopics(prev => prev.map(t => t.id === topicId ? { ...t, votesUp: data.votesUp, votesDown: data.votesDown, myVote: data.myVote } : t));
      if (selectedTopic?.id === topicId) {
        setSelectedTopic(prev => prev ? { ...prev, votesUp: data.votesUp, votesDown: data.votesDown, myVote: data.myVote } : prev);
      }
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Vote failed" });
    }
  };

  const handleDelete = async (topicId: number) => {
    try {
      await apiFetch(`/api/forum/topics/${topicId}`, { method: "DELETE" });
      setTopics(prev => prev.filter(t => t.id !== topicId));
      if (selectedTopic?.id === topicId) setSelectedTopic(null);
      toast({ title: "Topic deleted" });
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to delete" });
    }
  };

  const openTopic = async (topic: ForumTopic) => {
    setSelectedTopic(topic);
    setLoadingReplies(true);
    try {
      const data = await apiFetch<{ topic: ForumTopic; replies: ForumReply[] }>(`/api/forum/topics/${topic.id}`);
      setSelectedTopic(data.topic);
      setReplies(data.replies);
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to load topic" });
    } finally { setLoadingReplies(false); }
  };

  const handleReply = async () => {
    if (!replyText.trim() || !selectedTopic) return;
    setSendingReply(true);
    try {
      const data = await apiFetch<{ reply: ForumReply }>(`/api/forum/topics/${selectedTopic.id}/replies`, {
        method: "POST",
        body: JSON.stringify({ content: replyText.trim() }),
      });
      setReplies(prev => [...prev, data.reply]);
      setReplyText("");
      setTopics(prev => prev.map(t => t.id === selectedTopic.id ? { ...t, repliesCount: t.repliesCount + 1 } : t));
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: err instanceof Error ? err.message : "Failed" });
    } finally { setSendingReply(false); }
  };

  const handleMarkAnswer = async (replyId: number) => {
    if (!selectedTopic) return;
    try {
      await apiFetch(`/api/forum/topics/${selectedTopic.id}/replies/${replyId}/answer`, { method: "POST" });
      setReplies(prev => prev.map(r => ({ ...r, isAnswer: r.id === replyId })));
      toast({ title: "Answer marked!" });
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed" });
    }
  };

  if (selectedTopic) {
    return (
      <div className="space-y-4">
        <button onClick={() => setSelectedTopic(null)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to topics
        </button>

        <Card className="rounded-2xl border border-border shadow-sm">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  {selectedTopic.isPinned && <Badge className="text-[10px] bg-yellow-500/15 text-yellow-600 border-yellow-500/20">Pinned</Badge>}
                  {selectedTopic.isClosed && <Badge className="text-[10px] bg-red-500/15 text-red-600 border-red-500/20">Closed</Badge>}
                  <Badge variant="outline" className="text-[10px]">{FORUM_CATEGORIES.find(c => c.key === selectedTopic.category)?.label || selectedTopic.category}</Badge>
                </div>
                <h2 className="text-xl font-bold">{selectedTopic.title}</h2>
              </div>
              <div className="flex flex-col items-center gap-1 shrink-0">
                <button onClick={() => handleVote(selectedTopic.id, selectedTopic.myVote === 1 ? 0 : 1)} className={`p-1 rounded transition-colors ${selectedTopic.myVote === 1 ? "text-green-600" : "text-muted-foreground hover:text-green-600"}`}>
                  <ThumbsUp className="w-5 h-5" />
                </button>
                <span className="text-sm font-bold">{selectedTopic.votesUp - selectedTopic.votesDown}</span>
                <button onClick={() => handleVote(selectedTopic.id, selectedTopic.myVote === -1 ? 0 : -1)} className={`p-1 rounded transition-colors ${selectedTopic.myVote === -1 ? "text-red-600" : "text-muted-foreground hover:text-red-600"}`}>
                  <ThumbsDown className="w-5 h-5" />
                </button>
              </div>
            </div>

            <button className="flex items-center gap-2 text-left" onClick={() => onUserClick(selectedTopic.authorId)}>
              <Avatar className="w-8 h-8 border border-border">
                <AvatarImage src={selectedTopic.author?.avatarUrl || undefined} />
                <AvatarFallback className="text-xs font-bold">{selectedTopic.author?.displayName?.charAt(0) || "?"}</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-semibold hover:underline">{selectedTopic.author?.displayName}</p>
                <p className="text-xs text-muted-foreground">{timeAgo(selectedTopic.createdAt)}</p>
              </div>
            </button>

            <p className="text-sm whitespace-pre-wrap leading-relaxed">{selectedTopic.content}</p>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <h3 className="font-bold text-sm flex items-center gap-2">
            <MessageCircle className="w-4 h-4" /> Replies ({selectedTopic.repliesCount})
          </h3>

          {loadingReplies ? (
            <div className="space-y-3">
              {[1, 2].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)}
            </div>
          ) : replies.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-30" strokeWidth={1} />
              <p className="text-sm">No replies yet. Be the first!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {replies.map(r => (
                <Card key={r.id} className={`rounded-2xl border shadow-sm ${r.isAnswer ? "border-green-500/40 bg-green-500/5" : "border-border"}`}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <button className="flex items-center gap-2 text-left" onClick={() => onUserClick(r.authorId)}>
                        <Avatar className="w-7 h-7 border border-border">
                          <AvatarImage src={r.author?.avatarUrl || undefined} />
                          <AvatarFallback className="text-[10px] font-bold">{r.author?.displayName?.charAt(0) || "?"}</AvatarFallback>
                        </Avatar>
                        <span className="text-xs font-semibold hover:underline">{r.author?.displayName}</span>
                        <span className="text-[10px] text-muted-foreground">{timeAgo(r.createdAt)}</span>
                      </button>
                      <div className="flex items-center gap-2">
                        {r.isAnswer && (
                          <Badge className="text-[10px] bg-green-500/15 text-green-600 border-green-500/20 gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Answer
                          </Badge>
                        )}
                        {selectedTopic.category === "qa" && selectedTopic.authorId === myUser?.id && !r.isAnswer && (
                          <button onClick={() => handleMarkAnswer(r.id)} className="text-[10px] text-muted-foreground hover:text-green-600 transition-colors flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Mark answer
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{r.content}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {!selectedTopic.isClosed && myUser && (
            <Card className="rounded-2xl border border-border shadow-sm">
              <CardContent className="p-4 space-y-3">
                <Textarea
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  placeholder="Write your reply..."
                  className="min-h-[80px] resize-none rounded-xl text-sm"
                  maxLength={2000}
                />
                <div className="flex justify-end">
                  <Button onClick={handleReply} disabled={sendingReply || !replyText.trim()} className="rounded-xl gap-2 text-xs">
                    {sendingReply ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Reply
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {FORUM_CATEGORIES.map(cat => (
          <button
            key={cat.key}
            onClick={() => { setCategory(cat.key); setCreating(false); }}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border transition-all whitespace-nowrap ${
              category === cat.key ? "bg-black text-white border-black" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/20"
            }`}
          >
            {cat.icon} {cat.label}
          </button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">{FORUM_CATEGORIES.find(c => c.key === category)?.desc}</p>

      {!creating ? (
        <Button onClick={() => setCreating(true)} className="rounded-xl gap-2 text-xs w-full" variant="outline">
          <Plus className="w-4 h-4" /> New Topic
        </Button>
      ) : (
        <Card className="rounded-2xl border border-border shadow-sm">
          <CardContent className="p-4 space-y-3">
            <Input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="Topic title"
              className="rounded-xl text-sm font-semibold"
              maxLength={200}
            />
            <Textarea
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              placeholder={category === "qa" ? "Describe your question in detail..." : category === "suggestions" ? "Describe your feature suggestion..." : "What's on your mind?"}
              className="min-h-[100px] resize-none rounded-xl text-sm"
              maxLength={5000}
            />
            <div className="flex items-center justify-between">
              <Button size="sm" variant="ghost" onClick={() => setCreating(false)} className="rounded-xl text-xs">Cancel</Button>
              <Button size="sm" onClick={handleCreate} disabled={submitting || !newTitle.trim() || !newContent.trim()} className="rounded-xl gap-2 text-xs">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Post
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-2xl" />)}
        </div>
      ) : topics.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <MessageCircleQuestion className="w-10 h-10 mx-auto mb-3 opacity-30" strokeWidth={1} />
          <p className="text-sm font-medium">No topics yet</p>
          <p className="text-xs mt-1">Be the first to start a discussion!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {topics.map(topic => (
            <motion.div key={topic.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="rounded-2xl border border-border shadow-sm hover:shadow-md transition-all cursor-pointer" onClick={() => openTopic(topic)}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col items-center gap-0.5 shrink-0 pt-0.5">
                      <button onClick={e => { e.stopPropagation(); handleVote(topic.id, topic.myVote === 1 ? 0 : 1); }} className={`p-0.5 rounded transition-colors ${topic.myVote === 1 ? "text-green-600" : "text-muted-foreground hover:text-green-600"}`}>
                        <ThumbsUp className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-xs font-bold">{topic.votesUp - topic.votesDown}</span>
                      <button onClick={e => { e.stopPropagation(); handleVote(topic.id, topic.myVote === -1 ? 0 : -1); }} className={`p-0.5 rounded transition-colors ${topic.myVote === -1 ? "text-red-600" : "text-muted-foreground hover:text-red-600"}`}>
                        <ThumbsDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        {topic.isPinned && <Badge className="text-[10px] bg-yellow-500/15 text-yellow-600 border-yellow-500/20">Pinned</Badge>}
                        {topic.isClosed && <Badge className="text-[10px] bg-red-500/15 text-red-600 border-red-500/20">Closed</Badge>}
                      </div>
                      <h3 className="font-semibold text-sm truncate">{topic.title}</h3>
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{topic.content}</p>
                      <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                        <button onClick={e => { e.stopPropagation(); onUserClick(topic.authorId); }} className="hover:underline font-medium">{topic.author?.displayName}</button>
                        <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" />{topic.repliesCount}</span>
                        <span>{timeAgo(topic.lastActivityAt)}</span>
                      </div>
                    </div>
                    {topic.authorId === myUser?.id && (
                      <button onClick={e => { e.stopPropagation(); handleDelete(topic.id); }} className="text-muted-foreground hover:text-destructive p-1 rounded-lg hover:bg-destructive/10 transition-colors shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Leaderboard Tab ──────────────────────────────────────────────────────────

function LeaderboardTab({ onUserClick }: { onUserClick: (id: number) => void }) {
  const [data, setData] = useState<{ topPosters: LeaderboardEntry[]; topHelpers: LeaderboardEntry[]; topContributors: LeaderboardEntry[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ topPosters: LeaderboardEntry[]; topHelpers: LeaderboardEntry[]; topContributors: LeaderboardEntry[] }>("/api/forum/leaderboard")
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-64 rounded-2xl" />)}
      </div>
    );
  }

  const renderBoard = (title: string, icon: React.ReactNode, entries: LeaderboardEntry[], label: string) => (
    <Card className="rounded-2xl border border-border shadow-sm">
      <CardHeader className="pb-2 p-5">
        <CardTitle className="text-sm font-bold flex items-center gap-2">{icon} {title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {entries.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Trophy className="w-8 h-8 mx-auto mb-2 opacity-30" strokeWidth={1} />
            <p className="text-xs">No data yet</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {entries.map((entry, i) => (
              <button key={entry.user?.id || i} onClick={() => entry.user && onUserClick(entry.user.id)} className="w-full flex items-center gap-3 px-5 py-3 hover:bg-secondary/40 transition-colors text-left">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  i === 0 ? "bg-yellow-500/20 text-yellow-600" : i === 1 ? "bg-zinc-300/30 text-zinc-500" : i === 2 ? "bg-orange-500/15 text-orange-600" : "bg-secondary text-muted-foreground"
                }`}>
                  {i === 0 ? <Crown className="w-3.5 h-3.5" /> : i === 1 ? <Award className="w-3.5 h-3.5" /> : i === 2 ? <Flame className="w-3.5 h-3.5" /> : i + 1}
                </div>
                <Avatar className="w-8 h-8 border border-border shrink-0">
                  <AvatarImage src={entry.user?.avatarUrl || undefined} />
                  <AvatarFallback className="text-xs font-bold">{entry.user?.displayName?.charAt(0) || "?"}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate hover:underline">{entry.user?.displayName || "Unknown"}</p>
                  <p className="text-[10px] text-muted-foreground">@{entry.user?.robloxUsername || "?"}</p>
                </div>
                <Badge variant="outline" className="text-[10px] shrink-0">{entry.count} {label}</Badge>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {renderBoard("Most Active", <Flame className="w-4 h-4 text-orange-500" />, data?.topPosters || [], "posts")}
        {renderBoard("Top Helpers", <HelpCircle className="w-4 h-4 text-blue-500" />, data?.topHelpers || [], "replies")}
        {renderBoard("Top Suggesters", <Lightbulb className="w-4 h-4 text-yellow-500" />, data?.topContributors || [], "ideas")}
      </div>
    </div>
  );
}

// ── Subscriptions Tab ────────────────────────────────────────────────────────

function SubscriptionsTab({ myUser }: { myUser: PlatformUser | null }) {
  const { toast } = useToast();
  const [subs, setSubs] = useState<GroupSub[]>([]);
  const [loading, setLoading] = useState(true);
  const [addGroupId, setAddGroupId] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    apiFetch<{ subscriptions: GroupSub[] }>("/api/forum/subscriptions")
      .then(d => setSubs(d.subscriptions))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSubscribe = async () => {
    const groupId = parseInt(addGroupId, 10);
    if (!groupId || isNaN(groupId)) {
      toast({ variant: "destructive", title: "Error", description: "Enter a valid group ID" });
      return;
    }
    setAdding(true);
    try {
      const groupResp = await fetch(`https://groups.roblox.com/v1/groups/${groupId}`);
      if (!groupResp.ok) throw new Error("Group not found");
      const groupData = await groupResp.json() as { id: number; name: string };

      let thumbnailUrl: string | undefined;
      try {
        const thumbResp = await fetch(`https://thumbnails.roblox.com/v1/groups/icons?groupIds=${groupId}&size=150x150&format=Png&isCircular=false`);
        if (thumbResp.ok) {
          const td = await thumbResp.json() as { data: Array<{ imageUrl: string }> };
          thumbnailUrl = td.data?.[0]?.imageUrl || undefined;
        }
      } catch {}

      const data = await apiFetch<{ subscription: GroupSub }>("/api/forum/subscriptions", {
        method: "POST",
        body: JSON.stringify({ robloxGroupId: groupData.id, groupName: groupData.name, groupThumbnailUrl: thumbnailUrl }),
      });

      setSubs(prev => [data.subscription, ...prev]);
      setAddGroupId("");
      toast({ title: "Subscribed!", description: `Now following ${groupData.name}` });
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: err instanceof Error ? err.message : "Failed to subscribe" });
    } finally { setAdding(false); }
  };

  const handleUnsubscribe = async (subId: number) => {
    try {
      await apiFetch(`/api/forum/subscriptions/${subId}`, { method: "DELETE" });
      setSubs(prev => prev.filter(s => s.id !== subId));
      toast({ title: "Unsubscribed" });
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to unsubscribe" });
    }
  };

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border border-border shadow-sm">
        <CardContent className="p-4">
          <div className="flex gap-3">
            <Input
              value={addGroupId}
              onChange={e => setAddGroupId(e.target.value)}
              placeholder="Enter Roblox Group ID to subscribe"
              className="rounded-xl text-sm flex-1"
            />
            <Button onClick={handleSubscribe} disabled={adding || !addGroupId.trim()} className="rounded-xl gap-2 text-xs shrink-0">
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
              Subscribe
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-2xl" />)}
        </div>
      ) : subs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Bell className="w-10 h-10 mx-auto mb-3 opacity-30" strokeWidth={1} />
          <p className="text-sm font-medium">No subscriptions yet</p>
          <p className="text-xs mt-1">Subscribe to Roblox groups to follow their updates</p>
        </div>
      ) : (
        <div className="space-y-2">
          {subs.map(sub => (
            <Card key={sub.id} className="rounded-2xl border border-border shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl overflow-hidden border border-border shrink-0 bg-secondary">
                    {sub.groupThumbnailUrl ? (
                      <img src={sub.groupThumbnailUrl} alt={sub.groupName} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs font-bold text-muted-foreground">
                        {sub.groupName.substring(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <a href={`https://www.roblox.com/groups/${sub.robloxGroupId}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-sm hover:underline">
                      {sub.groupName}
                    </a>
                    <p className="text-[10px] text-muted-foreground">Subscribed {timeAgo(sub.createdAt)}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => handleUnsubscribe(sub.id)} className="rounded-xl text-xs gap-1.5 shrink-0 text-muted-foreground hover:text-destructive">
                    <BellOff className="w-3.5 h-3.5" /> Unsubscribe
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── My Profile Banner ─────────────────────────────────────────────────────────

function MyProfileBanner({ myUser, onEdit }: { myUser: PlatformUser; onEdit: () => void }) {
  return (
    <Card className="rounded-2xl border border-border shadow-sm overflow-hidden">
      <div className="h-14 bg-gradient-to-r from-zinc-800 to-zinc-700" />
      <CardContent className="px-5 pb-5">
        <div className="flex items-end justify-between -mt-7">
          <Avatar className="w-14 h-14 border-4 border-background shadow-md">
            <AvatarImage src={myUser.avatarUrl || undefined} />
            <AvatarFallback className="text-xl font-bold">{myUser.displayName.charAt(0)}</AvatarFallback>
          </Avatar>
          <Button size="sm" variant="outline" onClick={onEdit} className="rounded-xl gap-1.5 text-xs h-8 mb-0.5">
            <Pencil className="w-3.5 h-3.5" /> Edit Profile
          </Button>
        </div>
        <div className="mt-3">
          <p className="font-bold text-lg leading-tight">{myUser.displayName}</p>
          <p className="text-sm text-muted-foreground">@{myUser.robloxUsername}</p>
          {myUser.bio && <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">{myUser.bio}</p>}
          {!myUser.bio && <p className="text-sm text-muted-foreground/50 mt-1.5 italic">No bio yet — click Edit to add one</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Community Page ───────────────────────────────────────────────────────

export default function Community() {
  const { toast } = useToast();
  const [myUser, setMyUser] = useState<PlatformUser | null>(null);
  const [registering, setRegistering] = useState(true);
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem("limitedink_community_tab") || "feed");
  const [chatInitUser, setChatInitUser] = useState<PlatformUser | null>(null);
  const [profileModalUserId, setProfileModalUserId] = useState<number | null>(null);
  const [editingBio, setEditingBio] = useState(false);
  const [bioText, setBioText] = useState("");
  const [savingBio, setSavingBio] = useState(false);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    localStorage.setItem("limitedink_community_tab", tab);
  };

  useEffect(() => {
    apiFetch<PlatformUser>("/api/social/register", { method: "POST" })
      .then(u => { setMyUser(u); setBioText(u.bio || ""); })
      .catch(() => {})
      .finally(() => setRegistering(false));
  }, []);

  const handleChatUser = (user: PlatformUser) => {
    setChatInitUser(user);
    handleTabChange("chat");
  };

  const handleSaveBio = async () => {
    setSavingBio(true);
    try {
      const updated = await apiFetch<PlatformUser>("/api/social/me", {
        method: "PATCH",
        body: JSON.stringify({ bio: bioText.trim() }),
      });
      setMyUser(updated);
      setEditingBio(false);
      toast({ title: "Bio updated!" });
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to save bio" });
    } finally { setSavingBio(false); }
  };

  if (registering) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p className="text-sm font-medium">Setting up your community profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10 w-full max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Community</h1>
        <p className="text-muted-foreground mt-1 text-sm">Connect with other Roblox developers, share your work, and grow together.</p>
      </div>

      {/* Profile banner for current user */}
      {myUser && (
        <MyProfileBanner myUser={myUser} onEdit={() => setEditingBio(true)} />
      )}

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="rounded-xl bg-secondary/50 border border-border p-1 h-auto gap-1 flex-wrap">
          <TabsTrigger value="feed" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-4 py-2 flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5" /> Feed
          </TabsTrigger>
          <TabsTrigger value="forum" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-4 py-2 flex items-center gap-1.5">
            <MessageCircleQuestion className="w-3.5 h-3.5" /> Forum
          </TabsTrigger>
          <TabsTrigger value="discover" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-4 py-2 flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5" /> Discover
          </TabsTrigger>
          <TabsTrigger value="friends" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-4 py-2 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> Friends
          </TabsTrigger>
          <TabsTrigger value="chat" className="rounded-lg text-xs font-semibold data-[state=active]:bg-black data-[state=active]:text-white px-4 py-2 flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5" /> Chat
          </TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="feed" className="mt-0">
            <FeedTab myUser={myUser} onUserClick={setProfileModalUserId} />
          </TabsContent>
          <TabsContent value="forum" className="mt-0">
            <ForumTab myUser={myUser} onUserClick={setProfileModalUserId} />
          </TabsContent>
          <TabsContent value="discover" className="mt-0">
            <DiscoverTab myUser={myUser} onUserClick={setProfileModalUserId} onChat={handleChatUser} />
          </TabsContent>
          <TabsContent value="friends" className="mt-0">
            <FriendsTab myUser={myUser} onChat={handleChatUser} onUserClick={setProfileModalUserId} />
          </TabsContent>
          <TabsContent value="chat" className="mt-0">
            <ChatTab myUser={myUser} initialChatUser={chatInitUser} onClearInitial={() => setChatInitUser(null)} />
          </TabsContent>
        </div>
      </Tabs>

      {/* Profile Modal */}
      <AnimatePresence>
        {profileModalUserId !== null && (
          <UserProfileModal
            userId={profileModalUserId}
            myUser={myUser}
            onClose={() => setProfileModalUserId(null)}
            onChat={handleChatUser}
          />
        )}
      </AnimatePresence>

      {/* Bio Edit Modal */}
      <AnimatePresence>
        {editingBio && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setEditingBio(false)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="bg-background rounded-3xl border border-border shadow-2xl w-full max-w-md p-6 space-y-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-lg">Edit Bio</h3>
                <button onClick={() => setEditingBio(false)} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <Textarea
                value={bioText}
                onChange={e => setBioText(e.target.value)}
                placeholder="Tell other developers about yourself — your skills, what groups you manage, what you're building..."
                className="min-h-[120px] resize-none rounded-xl"
                maxLength={250}
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{bioText.length}/250</p>
                <Button onClick={handleSaveBio} disabled={savingBio} className="rounded-xl gap-2">
                  {savingBio ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Save
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
