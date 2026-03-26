import { useState, useEffect, useRef, useCallback } from "react";
import { getAuthCredentials, useGetRobloxGroups } from "@workspace/api-client-react";
import { robloxHeadshot } from "@/lib/roblox";
import { useLanguage } from "@/contexts/LanguageContext";
import { useVoiceCall } from "@/hooks/useVoiceCall";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Heart, MessageCircle, UserPlus, Users, Send, Image as ImageIcon,
  ChevronRight, Loader2, UserCheck, X, Check, Clock, Trash2,
  Globe, MessageSquare, Search, RefreshCw, Star, ExternalLink, Pencil,
  Lightbulb, Coffee, HelpCircle, Trophy, Bell, BellOff, ThumbsUp, ThumbsDown,
  MessageCircleQuestion, Plus, ArrowLeft, CheckCircle2, Crown, Award, Flame,
  Briefcase, UserCog, ShieldCheck, Store, Download, ThumbsUp as Endorse,
  Columns, ListTodo, Tag, Package, ChevronDown, Hash, Settings2,
  Phone, PhoneOff, Mic, MicOff, Volume2, Paperclip, FileText,
  LogOut, MoreVertical, Shield,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import AccessoriesTab, { UserEquippedAccessories } from "@/components/AccessoriesTab";
import { Sparkles, Gamepad2 } from "lucide-react";

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

interface Attachment {
  name: string;
  type: string;
  dataUrl: string;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function parseAttachments(imageUrl: string | null): Attachment[] {
  if (!imageUrl) return [];
  if (imageUrl.startsWith("[attachments:")) {
    try {
      const json = imageUrl.slice(13, -1);
      return JSON.parse(json) as Attachment[];
    } catch { return []; }
  }
  return [{ name: "image", type: "image", dataUrl: imageUrl }];
}

function isImageType(type: string): boolean {
  return type.startsWith("image/") || type === "image";
}

const MAX_FILE_SIZE = 5 * 1024 * 1024;

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

function timeAgo(date: string, t: (k: string) => string): string {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return t("community.timeJustNow");
  if (minutes < 60) return `${minutes} ${t("community.timeMinAgo")}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${t("community.timeHourAgo")}`;
  return `${Math.floor(hours / 24)} ${t("community.timeDayAgo")}`;
}

// ── User Profile Modal ────────────────────────────────────────────────────────

function UserProfileModal({ userId, myUser, onClose, onChat }: {
  userId: number;
  myUser: PlatformUser | null;
  onClose: () => void;
  onChat?: (user: PlatformUser) => void;
}) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [friendStatus, setFriendStatus] = useState<{ id: number; status: string; requesterId: number } | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [equippedAccessories, setEquippedAccessories] = useState<any[]>([]);

  useEffect(() => {
    apiFetch<UserProfile>(`/api/social/users/${userId}`)
      .then(d => {
        setProfile(d);
        setFriendStatus(d.friendship);
      })
      .catch(() => toast({ variant: "destructive", title: t("community.error"), description: t("community.failedLoadProfile") }))
      .finally(() => setLoading(false));
    apiFetch<any[]>(`/api/accessories/user/${userId}`)
      .then(setEquippedAccessories)
      .catch(() => {});
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
        toast({ title: t("community.friendSent") });
      } else if (friendStatus.status === "accepted") {
        await apiFetch(`/api/social/friends/${friendStatus.id}`, { method: "DELETE" });
        setFriendStatus(null);
        toast({ title: t("community.unfriended") });
      } else if (friendStatus.status === "pending" && friendStatus.requesterId !== myUser.id) {
        await apiFetch(`/api/social/friends/${friendStatus.id}`, {
          method: "PUT",
          body: JSON.stringify({ action: "accept" }),
        });
        setFriendStatus({ ...friendStatus, status: "accepted" });
        toast({ title: t("community.friendAdded") });
      }
    } catch (err) {
      toast({ variant: "destructive", title: t("community.error"), description: err instanceof Error ? err.message : t("community.failed") });
    } finally {
      setRequesting(false);
    }
  };

  const getFriendButtonLabel = () => {
    if (!friendStatus) return { label: t("community.addFriend"), icon: <UserPlus className="w-4 h-4 mr-1.5" /> };
    if (friendStatus.status === "accepted") return { label: t("community.friendsCheck"), icon: <UserCheck className="w-4 h-4 mr-1.5" /> };
    if (friendStatus.status === "pending" && friendStatus.requesterId === myUser?.id) return { label: t("community.requestSent"), icon: <Clock className="w-4 h-4 mr-1.5" /> };
    if (friendStatus.status === "pending") return { label: t("community.acceptRequest"), icon: <Check className="w-4 h-4 mr-1.5" /> };
    return { label: t("community.addFriend"), icon: <UserPlus className="w-4 h-4 mr-1.5" /> };
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
                  <AvatarImage src={profile.user.avatarUrl || robloxHeadshot(profile.user.robloxUserId)} />
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
                  {equippedAccessories.length > 0 && (
                    <div className="mt-1">
                      <UserEquippedAccessories accessories={equippedAccessories} />
                    </div>
                  )}
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
                          <span>{timeAgo(p.createdAt, t)}</span>
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
  const { t } = useLanguage();
  const isOwn = myUserId === post.authorId;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="rounded-2xl border border-border shadow-sm hover:shadow-md transition-all">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <button className="flex items-center gap-3 text-left" onClick={() => onUserClick(post.authorId)}>
              <Avatar className="w-10 h-10 border border-border">
                <AvatarImage src={post.author?.avatarUrl || robloxHeadshot(post.author?.robloxUserId || 0)} />
                <AvatarFallback className="font-bold text-sm">{post.author?.displayName?.charAt(0) || "?"}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold text-sm hover:underline">{post.author?.displayName}</p>
                <p className="text-xs text-muted-foreground">@{post.author?.robloxUsername} · {timeAgo(post.createdAt, t)}</p>
              </div>
            </button>
            {isOwn && (
              <button onClick={() => onDelete(post.id)} className="text-muted-foreground hover:text-destructive transition-colors p-1.5 rounded-lg hover:bg-destructive/10">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <p className="text-sm leading-relaxed whitespace-pre-wrap">{post.content}</p>

          {post.imageUrl && (() => {
            const atts = parseAttachments(post.imageUrl);
            if (atts.length === 0) return null;
            const images = atts.filter(a => isImageType(a.type));
            const files = atts.filter(a => !isImageType(a.type));
            return (
              <div className="space-y-2">
                {images.length > 0 && (
                  <div className={`grid gap-2 ${images.length === 1 ? "grid-cols-1" : images.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
                    {images.map((img, i) => (
                      <div key={i} className="rounded-xl overflow-hidden border border-border">
                        <img src={img.dataUrl} alt={img.name} className={`w-full object-cover ${images.length === 1 ? "max-h-80" : "h-40"}`} />
                      </div>
                    ))}
                  </div>
                )}
                {files.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {files.map((file, i) => (
                      <a key={i} href={file.dataUrl} download={file.name} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-secondary/40 hover:bg-secondary/80 transition-colors text-sm">
                        <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="truncate max-w-[150px]">{file.name}</span>
                        <Download className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

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
  const { t } = useLanguage();
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
                  <AvatarImage src={c.author?.avatarUrl || robloxHeadshot(c.author?.robloxUserId || 0)} />
                  <AvatarFallback className="text-xs font-bold">{c.author?.displayName?.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 bg-secondary/60 rounded-xl px-3 py-2.5">
                  <p className="text-xs font-semibold">{c.author?.displayName} <span className="font-normal text-muted-foreground">· {timeAgo(c.createdAt, t)}</span></p>
                  <p className="text-sm mt-1">{c.content}</p>
                </div>
              </div>
            ))
          )}
        </div>
        {myUser && (
          <div className="p-4 border-t border-border flex gap-2 items-center">
            <Avatar className="w-8 h-8 shrink-0 border border-border">
              <AvatarImage src={myUser.avatarUrl || robloxHeadshot(myUser.robloxUserId)} />
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
  const { t } = useLanguage();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [newContent, setNewContent] = useState("");
  const [posting, setPosting] = useState(false);
  const [commentPost, setCommentPost] = useState<Post | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchFeed = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const d = await apiFetch<{ posts: Post[] }>("/api/social/feed");
      setPosts(d.posts);
    } catch {} finally { if (!silent) setLoading(false); }
  }, []);

  useEffect(() => { fetchFeed(); }, [fetchFeed]);

  useEffect(() => {
    const iv = setInterval(() => fetchFeed(true), 8000);
    return () => clearInterval(iv);
  }, [fetchFeed]);

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newAtts: Attachment[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_SIZE) {
        toast({ variant: "destructive", title: t("com.fileTooLarge"), description: `${file.name} > 5MB` });
        continue;
      }
      const dataUrl = await fileToDataUrl(file);
      newAtts.push({ name: file.name, type: file.type, dataUrl });
    }
    setAttachments(prev => [...prev, ...newAtts]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = (idx: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx));
  };

  const handlePost = async () => {
    if (!newContent.trim() && attachments.length === 0) return;
    setPosting(true);
    try {
      let imageUrl: string | undefined;
      if (attachments.length > 0) {
        imageUrl = `[attachments:${JSON.stringify(attachments)}]`;
      }
      const d = await apiFetch<{ post: Post }>("/api/social/posts", {
        method: "POST",
        body: JSON.stringify({ content: newContent.trim() || " ", imageUrl }),
      });
      setPosts(prev => [d.post, ...prev]);
      setNewContent(""); setAttachments([]);
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
                <AvatarImage src={myUser.avatarUrl || robloxHeadshot(myUser.robloxUserId)} />
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
                  {attachments.length > 0 && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="flex flex-wrap gap-2">
                      {attachments.map((att, idx) => (
                        <div key={idx} className="relative group">
                          {isImageType(att.type) ? (
                            <img src={att.dataUrl} alt={att.name} className="w-20 h-20 object-cover rounded-xl border border-border" />
                          ) : (
                            <div className="w-20 h-20 rounded-xl border border-border bg-secondary/60 flex flex-col items-center justify-center gap-1 px-1">
                              <FileText className="w-5 h-5 text-muted-foreground" />
                              <span className="text-[10px] text-muted-foreground truncate w-full text-center">{att.name}</span>
                            </div>
                          )}
                          <button onClick={() => removeAttachment(idx)} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
                <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.txt,.zip" className="hidden" onChange={handleFilePick} />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { if (fileInputRef.current) { fileInputRef.current.accept = "image/*"; fileInputRef.current.click(); } }}
                      className="text-xs flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    >
                      <ImageIcon className="w-3.5 h-3.5" /> {t("com.attachImage")}
                    </button>
                    <button
                      onClick={() => { if (fileInputRef.current) { fileInputRef.current.accept = ".pdf,.doc,.docx,.txt,.zip,.rar,.7z,.xls,.xlsx"; fileInputRef.current.click(); } }}
                      className="text-xs flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    >
                      <Paperclip className="w-3.5 h-3.5" /> {t("com.attachFile")}
                    </button>
                  </div>
                  <Button onClick={handlePost} disabled={posting || (!newContent.trim() && attachments.length === 0)} size="sm" className="rounded-xl gap-2 h-8">
                    {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    {t("com.publish")}
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
  const { t } = useLanguage();
  const [users, setUsers] = useState<Array<PlatformUser & { isMe?: boolean }>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [requesting, setRequesting] = useState<number | null>(null);
  const [featuredGroups, setFeaturedGroups] = useState<any[]>([]);
  const [fgLoading, setFgLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<any | null>(null);
  const [groupDetail, setGroupDetail] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [votes, setVotes] = useState<{ likes: number; dislikes: number; myVote: "like" | "dislike" | null }>({ likes: 0, dislikes: 0, myVote: null });
  const [voting, setVoting] = useState(false);

  const fetchDiscover = useCallback(async (silent = false) => {
    try {
      const d = await apiFetch<{ users: Array<PlatformUser & { isMe?: boolean }> }>("/api/social/users");
      setUsers(d.users);
    } catch {} finally { if (!silent) setLoading(false); }
    try {
      const d = await apiFetch<{ groups: any[] }>("/api/featured-groups");
      setFeaturedGroups(d.groups);
    } catch {} finally { if (!silent) setFgLoading(false); }
  }, []);

  useEffect(() => { fetchDiscover(); }, [fetchDiscover]);

  useEffect(() => {
    const iv = setInterval(() => fetchDiscover(true), 20000);
    return () => clearInterval(iv);
  }, [fetchDiscover]);

  const openGroupDetail = async (group: any) => {
    setSelectedGroup(group);
    setDetailLoading(true);
    setGroupDetail(null);
    try {
      const [detail, votesData] = await Promise.all([
        apiFetch<any>(`/api/featured-groups/${group.groupId}`),
        apiFetch<{ likes: number; dislikes: number; myVote: "like" | "dislike" | null }>(`/api/featured-groups/${group.groupId}/votes`),
      ]);
      setGroupDetail(detail);
      setVotes(votesData);
    } catch {} finally { setDetailLoading(false); }
  };

  const handleVote = async (vote: "like" | "dislike") => {
    if (!selectedGroup || voting) return;
    setVoting(true);
    const newVote = votes.myVote === vote ? null : vote;
    try {
      const result = await apiFetch<{ likes: number; dislikes: number; myVote: "like" | "dislike" | null }>(`/api/featured-groups/${selectedGroup.groupId}/vote`, {
        method: "POST", body: JSON.stringify({ vote: newVote }),
      });
      setVotes(result);
    } catch (e) {
      toast({ variant: "destructive", title: t("com.error"), description: e instanceof Error ? e.message : "" });
    } finally { setVoting(false); }
  };

  const filtered = users.filter(u =>
    !search ||
    u.displayName.toLowerCase().includes(search.toLowerCase()) ||
    u.robloxUsername.toLowerCase().includes(search.toLowerCase())
  );

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

  if (selectedGroup) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" className="rounded-xl gap-1.5" onClick={() => { setSelectedGroup(null); setGroupDetail(null); }}>
          <ArrowLeft className="w-4 h-4" /> {t("com.back")}
        </Button>
        {detailLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
        ) : groupDetail ? (
          <div className="space-y-4">
            <Card className="rounded-2xl border-border/50">
              <CardContent className="pt-5 space-y-4">
                <div className="flex items-center gap-4">
                  {groupDetail.thumbnailUrl ? (
                    <img src={groupDetail.thumbnailUrl} alt={groupDetail.name} className="w-20 h-20 rounded-2xl border border-border object-cover" />
                  ) : (
                    <div className="w-20 h-20 rounded-2xl bg-secondary flex items-center justify-center text-2xl font-bold text-muted-foreground">{groupDetail.name?.charAt(0)}</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-bold">{groupDetail.name}</h2>
                    <div className="flex items-center gap-3 mt-1">
                      <Badge variant="outline" className="text-xs"><Users className="w-3 h-3 mr-1" />{(groupDetail.memberCount || 0).toLocaleString()} {t("com.members")}</Badge>
                      {groupDetail.publicEntryAllowed !== null && (
                        <Badge variant="outline" className="text-xs">{groupDetail.publicEntryAllowed ? t("com.open") : t("com.closed")}</Badge>
                      )}
                    </div>
                    {groupDetail.created && (
                      <p className="text-[10px] text-muted-foreground mt-1">{t("com.created")}: {new Date(groupDetail.created).toLocaleDateString("ru-RU")}</p>
                    )}
                  </div>
                </div>
                {groupDetail.description && (
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{groupDetail.description}</p>
                )}
                {groupDetail.owner && (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary/40 border border-border/50">
                    {groupDetail.owner.avatar ? (
                      <img src={groupDetail.owner.avatar} className="w-10 h-10 rounded-full border border-border" alt="" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-sm font-bold">{groupDetail.owner.displayName?.charAt(0)}</div>
                    )}
                    <div>
                      <p className="text-xs font-semibold">{groupDetail.owner.displayName}</p>
                      <p className="text-[10px] text-muted-foreground">{t("com.groupOwner")}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-border/50">
              <CardContent className="pt-5">
                <p className="text-sm font-semibold mb-3">{t("com.groupRating")}</p>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => handleVote("like")}
                    disabled={voting}
                    className={`flex items-center gap-2 px-5 py-3 rounded-xl border-2 transition-all ${votes.myVote === "like" ? "border-green-500 bg-green-500/10 text-green-600" : "border-border hover:border-green-500/50"}`}
                  >
                    <ThumbsUp className="w-5 h-5" />
                    <span className="font-bold text-lg">{votes.likes}</span>
                  </button>
                  <button
                    onClick={() => handleVote("dislike")}
                    disabled={voting}
                    className={`flex items-center gap-2 px-5 py-3 rounded-xl border-2 transition-all ${votes.myVote === "dislike" ? "border-red-500 bg-red-500/10 text-red-600" : "border-border hover:border-red-500/50"}`}
                  >
                    <ThumbsDown className="w-5 h-5" />
                    <span className="font-bold text-lg">{votes.dislikes}</span>
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">{t("com.removeVote")}</p>
              </CardContent>
            </Card>

            <a href={`https://www.roblox.com/groups/${groupDetail.groupId}`} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" className="w-full rounded-xl gap-2"><ExternalLink className="w-4 h-4" /> {t("com.openRoblox")}</Button>
            </a>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">{t("com.groupNotFound")}</div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {!fgLoading && featuredGroups.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Star className="w-4 h-4" /> Featured Groups</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {featuredGroups.map(g => (
              <Card key={g.groupId} className="rounded-2xl border-border/50 hover:border-black/20 cursor-pointer transition-all hover:shadow-md" onClick={() => openGroupDetail(g)}>
                <CardContent className="p-3 flex items-center gap-3">
                  {g.thumbnailUrl ? (
                    <img src={g.thumbnailUrl} alt={g.name} className="w-11 h-11 rounded-xl border border-border object-cover shrink-0" />
                  ) : (
                    <div className="w-11 h-11 rounded-xl bg-secondary flex items-center justify-center text-sm font-bold shrink-0">{g.name?.charAt(0)}</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">{g.name}</p>
                    <p className="text-[10px] text-muted-foreground">{(g.memberCount || 0).toLocaleString()} {t("com.members")}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

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
                      <AvatarImage src={user.avatarUrl || robloxHeadshot(user.robloxUserId)} />
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
  const { t } = useLanguage();
  const [friends, setFriends] = useState<Array<{ friendship: { id: number; status: string }; user: PlatformUser }>>([]);
  const [pending, setPending] = useState<Array<{ friendship: { id: number; status: string }; user: PlatformUser }>>([]);
  const [loading, setLoading] = useState(true);

  const fetchFriends = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const d = await apiFetch<{
        friends: Array<{ friendship: { id: number; status: string }; user: PlatformUser }>;
        pending: Array<{ friendship: { id: number; status: string }; user: PlatformUser }>;
      }>("/api/social/friends");
      setFriends(d.friends);
      setPending(d.pending);
    } catch {} finally { if (!silent) setLoading(false); }
  }, []);

  useEffect(() => { fetchFriends(); }, [fetchFriends]);

  useEffect(() => {
    const iv = setInterval(() => fetchFriends(true), 15000);
    return () => clearInterval(iv);
  }, [fetchFriends]);

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
                      <AvatarImage src={user?.avatarUrl || robloxHeadshot(user?.robloxUserId || 0)} />
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
                      <AvatarImage src={user?.avatarUrl || robloxHeadshot(user?.robloxUserId || 0)} />
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

// ── Chat Tab (unified: DMs + Group Chats) ────────────────────────────────────

type ActiveChatTarget =
  | { kind: "dm"; user: PlatformUser }
  | { kind: "group"; chat: any };

function ChatTab({ myUser, initialChatUser, onClearInitial }: {
  myUser: PlatformUser | null;
  initialChatUser: PlatformUser | null;
  onClearInitial: () => void;
}) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const { data: groupsData } = useGetRobloxGroups();
  const [conversations, setConversations] = useState<DmConversation[]>([]);
  const [groupChats, setGroupChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<ActiveChatTarget | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [chatName, setChatName] = useState("");
  const [memberInput, setMemberInput] = useState("");
  const [pendingMembers, setPendingMembers] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  const [chatMembers, setChatMembers] = useState<any[]>([]);
  const [showAddMember, setShowAddMember] = useState(false);
  const [addMemberInput, setAddMemberInput] = useState("");
  const [robloxGroupChatCreated, setRobloxGroupChatCreated] = useState(false);
  const [showMembersPanel, setShowMembersPanel] = useState(false);
  const [memberActionId, setMemberActionId] = useState<number | null>(null);
  const [dmSectionOpen, setDmSectionOpen] = useState(true);
  const [gcSectionOpen, setGcSectionOpen] = useState(true);

  const voiceCall = useVoiceCall(
    myUser?.id ?? null,
    myUser?.displayName ?? "",
    myUser?.avatarUrl || robloxHeadshot(myUser?.robloxUserId || 0),
  );

  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      recordStreamRef.current?.getTracks().forEach(t => t.stop());
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.ondataavailable = null;
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.stop();
      }
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    };
  }, []);
  const COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6"];

  const fetchAll = useCallback(async (silent = false) => {
    try {
      const [dmData, gcData] = await Promise.all([
        apiFetch<{ conversations: DmConversation[] }>("/api/social/messages").catch(() => ({ conversations: [] as DmConversation[] })),
        apiFetch<{ chats: any[] }>("/api/community/group-chats").catch(() => ({ chats: [] as any[] })),
      ]);
      setConversations(dmData.conversations);
      setGroupChats(gcData.chats);
    } catch {} finally { if (!silent) setLoading(false); }
  }, []);

  useEffect(() => {
    if (!robloxGroupChatCreated && groupsData?.groups?.length && myUser) {
      setRobloxGroupChatCreated(true);
      fetchAll();
    }
  }, [groupsData, myUser, robloxGroupChatCreated, fetchAll]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    const iv = setInterval(() => fetchAll(true), 10000);
    return () => clearInterval(iv);
  }, [fetchAll]);

  const activeRef = useRef(active);
  activeRef.current = active;

  const lastMsgCountRef = useRef(0);

  useEffect(() => {
    let inFlight = false;
    const iv = setInterval(async () => {
      const cur = activeRef.current;
      if (!cur || inFlight) return;
      inFlight = true;
      try {
        if (cur.kind === "dm") {
          const d = await apiFetch<{ messages: DmMessage[] }>(`/api/social/messages/${cur.user.id}`);
          if (d.messages.length !== lastMsgCountRef.current) {
            setMessages(d.messages);
            lastMsgCountRef.current = d.messages.length;
          }
        } else {
          const d = await apiFetch<{ messages: any[] }>(`/api/community/group-chats/${cur.chat.id}/messages`);
          if (d.messages.length !== lastMsgCountRef.current) {
            setMessages(d.messages);
            lastMsgCountRef.current = d.messages.length;
          }
        }
      } catch {} finally { inFlight = false; }
    }, 3000);
    return () => clearInterval(iv);
  }, []);

  const openDm = useCallback(async (user: PlatformUser) => {
    setActive({ kind: "dm", user });
    setLoadingMsgs(true);
    setShowAddMember(false);
    try {
      const d = await apiFetch<{ messages: DmMessage[] }>(`/api/social/messages/${user.id}`);
      setMessages(d.messages);
    } catch {} finally { setLoadingMsgs(false); }
  }, []);

  const openGroup = useCallback(async (chat: any) => {
    setActive({ kind: "group", chat });
    setLoadingMsgs(true);
    setShowAddMember(false);
    try {
      const [msgsData, membersData] = await Promise.all([
        apiFetch<{ messages: any[] }>(`/api/community/group-chats/${chat.id}/messages`),
        apiFetch<{ members: any[] }>(`/api/community/group-chats/${chat.id}/members`),
      ]);
      setMessages(msgsData.messages);
      setChatMembers(membersData.members);
    } catch {} finally { setLoadingMsgs(false); }
  }, []);

  useEffect(() => {
    if (initialChatUser) { openDm(initialChatUser); onClearInitial(); }
  }, [initialChatUser, openDm, onClearInitial]);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);

  const handleChatScroll = useCallback(() => {
    const el = chatContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    shouldAutoScrollRef.current = atBottom;
  }, []);

  useEffect(() => {
    if (shouldAutoScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleStartCall = async () => {
    if (active?.kind !== "dm") return;
    try {
      await voiceCall.startCall(active.user.id);
    } catch {
      toast({ variant: "destructive", title: t("com.noMicAccess"), description: t("com.micPermissionDenied") });
    }
  };

  const handleEndCall = async () => {
    const timer = voiceCall.endCall();
    const duration = formatCallTime(timer);
    const wasMissed = timer === 0;
    toast({ title: t("com.callEnded") });

    if (active) {
      const callContent = wasMissed ? "[call:missed:]" : `[call:outgoing:${duration}]`;
      try {
        if (active.kind === "dm") {
          const d = await apiFetch<{ message: DmMessage }>(`/api/social/messages/${active.user.id}`, {
            method: "POST", body: JSON.stringify({ content: callContent }),
          });
          setMessages(prev => [...prev, d.message]);
        } else {
          const { message } = await apiFetch<{ message: any }>(`/api/community/group-chats/${active.chat.id}/messages`, {
            method: "POST", body: JSON.stringify({ content: callContent }),
          });
          setMessages(prev => [...prev, message]);
        }
      } catch {}
    }
  };

  const formatCallTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const startRecording = async () => {
    try {
      const micId = localStorage.getItem("limitedink_mic_id");
      const constraints: MediaStreamConstraints = { audio: micId ? { deviceId: { exact: micId } } : true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      recordStreamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4" });
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        setVoiceBlob(blob);
        recordStreamRef.current?.getTracks().forEach(t => t.stop());
        recordStreamRef.current = null;
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordTimerRef.current = setInterval(() => setRecordingTime(p => p + 1), 1000);
    } catch {
      toast({ variant: "destructive", title: t("com.noMicAccess"), description: t("com.micPermissionDenied") });
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    recordTimerRef.current = null;
    setIsRecording(false);
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    recordStreamRef.current?.getTracks().forEach(t => t.stop());
    recordStreamRef.current = null;
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    recordTimerRef.current = null;
    setIsRecording(false);
    setRecordingTime(0);
    setVoiceBlob(null);
  };

  const sendVoiceMessage = async () => {
    if (!voiceBlob || !active) return;
    setSending(true);
    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(voiceBlob);
      });
      const content = `[voice:${dataUrl}]`;
      if (active.kind === "dm") {
        const d = await apiFetch<{ message: DmMessage }>(`/api/social/messages/${active.user.id}`, {
          method: "POST", body: JSON.stringify({ content }),
        });
        setMessages(prev => [...prev, d.message]);
      } else {
        const { message } = await apiFetch<{ message: any }>(`/api/community/group-chats/${active.chat.id}/messages`, {
          method: "POST", body: JSON.stringify({ content }),
        });
        setMessages(prev => [...prev, message]);
      }
      setVoiceBlob(null);
      setRecordingTime(0);
    } catch {
      toast({ variant: "destructive", title: t("com.error"), description: t("com.sendFailed") });
    } finally { setSending(false); }
  };

  const handleSendDm = async () => {
    if (!text.trim() || !active || active.kind !== "dm") return;
    setSending(true);
    try {
      const d = await apiFetch<{ message: DmMessage }>(`/api/social/messages/${active.user.id}`, {
        method: "POST", body: JSON.stringify({ content: text.trim() }),
      });
      setMessages(prev => [...prev, d.message]);
      setText("");
      fetchAll();
    } catch {
      toast({ variant: "destructive", title: t("com.error"), description: t("com.sendFailed") });
    } finally { setSending(false); }
  };

  const handleSendGroup = async () => {
    if (!text.trim() || !active || active.kind !== "group") return;
    setSending(true);
    try {
      const { message } = await apiFetch<{ message: any }>(`/api/community/group-chats/${active.chat.id}/messages`, {
        method: "POST", body: JSON.stringify({ content: text.trim() }),
      });
      setMessages(prev => [...prev, message]);
      setText("");
    } catch {} finally { setSending(false); }
  };

  const handleSend = () => {
    if (!active) return;
    if (active.kind === "dm") handleSendDm();
    else handleSendGroup();
  };

  const searchUser = async (username: string) => {
    if (!username.trim()) return null;
    try {
      const users = await apiFetch<any[]>(`/api/social/users/search?q=${encodeURIComponent(username)}`);
      return (users as any[]).find((u: any) => u.robloxUsername.toLowerCase() === username.toLowerCase() || u.displayName.toLowerCase() === username.toLowerCase());
    } catch { return null; }
  };

  const addPendingMember = async () => {
    const user = await searchUser(memberInput);
    if (!user) { toast({ variant: "destructive", title: t("com.userNotFound") }); return; }
    if (pendingMembers.find(m => m.id === user.id)) return;
    setPendingMembers(p => [...p, user]);
    setMemberInput("");
  };

  const createGroupChat = async () => {
    if (!chatName.trim() || pendingMembers.length < 2) return;
    setCreating(true);
    try {
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      const { chat } = await apiFetch<{ chat: any }>("/api/community/group-chats", {
        method: "POST",
        body: JSON.stringify({ name: chatName.trim(), memberIds: pendingMembers.map(m => m.id), avatarColor: color }),
      });
      setGroupChats(p => [chat, ...p]);
      setShowCreate(false); setChatName(""); setPendingMembers([]);
      openGroup(chat);
      toast({ title: t("com.groupChatCreated") });
    } catch (e) { toast({ variant: "destructive", title: t("com.error"), description: e instanceof Error ? e.message : "" }); }
    finally { setCreating(false); }
  };

  const addMemberToChat = async () => {
    if (!active || active.kind !== "group" || !addMemberInput.trim()) return;
    const user = await searchUser(addMemberInput);
    if (!user) { toast({ variant: "destructive", title: t("com.userNotFound") }); return; }
    try {
      await apiFetch(`/api/community/group-chats/${active.chat.id}/members`, { method: "POST", body: JSON.stringify({ targetUserId: user.id }) });
      const { members } = await apiFetch<{ members: any[] }>(`/api/community/group-chats/${active.chat.id}/members`);
      setChatMembers(members);
      setAddMemberInput(""); setShowAddMember(false);
      toast({ title: t("com.memberAdded") });
    } catch (e) { toast({ variant: "destructive", title: t("com.error"), description: e instanceof Error ? e.message : "" }); }
  };

  const myMembership = chatMembers.find((m: any) => m.userId === myUser?.id);
  const myRole = myMembership?.role || "member";
  const isAdmin = myRole === "admin";
  const isModerator = myRole === "moderator";

  const removeMember = async (userId: number) => {
    if (!active || active.kind !== "group") return;
    try {
      const res = await apiFetch<{ ok: boolean; left?: boolean }>(`/api/community/group-chats/${active.chat.id}/members/${userId}`, { method: "DELETE" });
      if (res.left) {
        setActive(null);
        setShowMembersPanel(false);
        fetchAll();
        toast({ title: t("com.leftChat") });
        return;
      }
      const { members } = await apiFetch<{ members: any[] }>(`/api/community/group-chats/${active.chat.id}/members`);
      setChatMembers(members);
      setMemberActionId(null);
      toast({ title: t("com.memberRemoved") });
    } catch (e) { toast({ variant: "destructive", title: t("com.error"), description: e instanceof Error ? e.message : "" }); }
  };

  const changeMemberRole = async (userId: number, role: string) => {
    if (!active || active.kind !== "group") return;
    try {
      await apiFetch(`/api/community/group-chats/${active.chat.id}/members/${userId}/role`, { method: "PATCH", body: JSON.stringify({ role }) });
      const { members } = await apiFetch<{ members: any[] }>(`/api/community/group-chats/${active.chat.id}/members`);
      setChatMembers(members);
      setMemberActionId(null);
      toast({ title: t("com.roleChanged") });
    } catch (e) { toast({ variant: "destructive", title: t("com.error"), description: e instanceof Error ? e.message : "" }); }
  };

  const getRoleIcon = (role: string) => {
    if (role === "admin") return <Crown className="w-3 h-3 text-yellow-500" />;
    if (role === "moderator") return <Shield className="w-3 h-3 text-blue-500" />;
    return null;
  };

  const getRoleLabel = (role: string) => {
    if (role === "admin") return t("com.roleAdmin");
    if (role === "moderator") return t("com.roleModerator");
    return t("com.roleMember");
  };

  const timeAgoShort = (date: string) => {
    const d = Date.now() - new Date(date).getTime();
    const m = Math.floor(d / 60000);
    if (m < 1) return t("com.now");
    if (m < 60) return `${m}м`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}ч`;
    return `${Math.floor(h / 24)}д`;
  };

  const isVoiceMsg = (content: string) => content.startsWith("[voice:") && content.endsWith("]");
  const getVoiceSrc = (content: string) => content.slice(7, -1);

  const isCallMsg = (content: string) => content.startsWith("[call:") && content.endsWith("]");
  const parseCallMsg = (content: string) => {
    const inner = content.slice(6, -1);
    const [type, duration] = inner.split(":");
    return { type: type as "outgoing" | "missed" | "declined", duration: duration || "" };
  };

  const VoicePlayer = ({ src, isOwn }: { src: string; isOwn: boolean }) => {
    const [playing, setPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    return (
      <div className="flex items-center gap-2 min-w-[160px]">
        <button
          onClick={() => {
            if (!audioRef.current) {
              audioRef.current = new Audio(src);
              const speakerId = localStorage.getItem("limitedink_speaker_id");
              if (speakerId && (audioRef.current as any).setSinkId) {
                (audioRef.current as any).setSinkId(speakerId).catch(() => {});
              }
              audioRef.current.onended = () => setPlaying(false);
            }
            if (playing) { audioRef.current.pause(); audioRef.current.currentTime = 0; setPlaying(false); }
            else { audioRef.current.play(); setPlaying(true); }
          }}
          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${isOwn ? "bg-white/20 hover:bg-white/30" : "bg-black/10 hover:bg-black/15"}`}
        >
          {playing ? (
            <div className="flex items-center gap-0.5">
              <span className={`w-0.5 h-3 rounded-full animate-pulse ${isOwn ? "bg-white" : "bg-black"}`} />
              <span className={`w-0.5 h-4 rounded-full animate-pulse delay-75 ${isOwn ? "bg-white" : "bg-black"}`} />
              <span className={`w-0.5 h-2 rounded-full animate-pulse delay-150 ${isOwn ? "bg-white" : "bg-black"}`} />
            </div>
          ) : (
            <Volume2 className={`w-3.5 h-3.5 ${isOwn ? "text-white" : "text-black"}`} />
          )}
        </button>
        <div className="flex-1 flex items-center gap-1">
          {[...Array(12)].map((_, i) => (
            <div key={i} className={`w-1 rounded-full ${isOwn ? "bg-white/40" : "bg-black/20"} ${playing ? "animate-pulse" : ""}`} style={{ height: `${6 + Math.random() * 12}px`, animationDelay: `${i * 50}ms` }} />
          ))}
        </div>
        <Mic className={`w-3 h-3 shrink-0 ${isOwn ? "text-white/50" : "text-muted-foreground"}`} />
      </div>
    );
  };

  return (
    <div className="space-y-3 relative">
      <AnimatePresence>
        {voiceCall.incomingCall && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-0 left-1/2 -translate-x-1/2 z-50 w-80 bg-black text-white rounded-2xl shadow-2xl overflow-hidden border border-white/10"
          >
            <div className="p-5 flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-white/20">
                <img src={voiceCall.incomingCall.callerAvatar} alt="" className="w-full h-full object-cover" />
              </div>
              <div className="text-center">
                <p className="font-bold text-sm">{voiceCall.incomingCall.callerName}</p>
                <p className="text-xs text-white/60">{t("com.incomingCall")}</p>
              </div>
              <div className="flex gap-4 mt-2">
                <button
                  onClick={voiceCall.rejectCall}
                  className="w-12 h-12 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors"
                >
                  <PhoneOff className="w-5 h-5" />
                </button>
                <button
                  onClick={voiceCall.acceptCall}
                  className="w-12 h-12 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center transition-colors animate-pulse"
                >
                  <Phone className="w-5 h-5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex gap-4 h-[620px]">
        {/* Sidebar */}
        <div className="w-72 shrink-0 flex flex-col border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="p-3 border-b border-border bg-secondary/40 flex items-center justify-between">
            <p className="font-bold text-sm">{t("com.chats")}</p>
            <Button size="sm" variant="ghost" className="rounded-xl h-7 w-7 p-0" onClick={() => setShowCreate(p => !p)} title={t("com.createGroupChat")}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-3 space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
            ) : (
              <>
                {conversations.length > 0 && (
                  <div>
                    <button
                      onClick={() => setDmSectionOpen(p => !p)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:bg-secondary/30 transition-colors"
                    >
                      <ChevronDown className={`w-3 h-3 transition-transform ${dmSectionOpen ? "" : "-rotate-90"}`} />
                      <MessageCircle className="w-3 h-3" />
                      {t("com.directMessages") || "Direct Messages"}
                      <Badge variant="outline" className="text-[8px] h-4 px-1 ml-auto">{conversations.length}</Badge>
                    </button>
                    {dmSectionOpen && [...conversations]
                      .sort((a, b) => {
                        const ta = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
                        const tb = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
                        return tb - ta;
                      })
                      .map(({ conversation, otherUser, lastMessage, unreadCount }) => (
                      <div
                        key={`dm-${conversation.id}`}
                        onClick={() => openDm(otherUser)}
                        className={`flex items-center gap-2.5 p-3 cursor-pointer hover:bg-secondary/40 transition-colors border-b border-border/40 ${active?.kind === "dm" && active.user.id === otherUser?.id ? "bg-secondary/70" : ""}`}
                      >
                        <div className="relative">
                          <Avatar className="w-9 h-9 border border-border shrink-0">
                            <AvatarImage src={otherUser?.avatarUrl || robloxHeadshot(otherUser?.robloxUserId || 0)} />
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
                        {lastMessage && <span className="text-[9px] text-muted-foreground shrink-0">{timeAgoShort(lastMessage.createdAt)}</span>}
                      </div>
                    ))}
                  </div>
                )}

                {groupChats.length > 0 && (
                  <div>
                    <button
                      onClick={() => setGcSectionOpen(p => !p)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:bg-secondary/30 transition-colors"
                    >
                      <ChevronDown className={`w-3 h-3 transition-transform ${gcSectionOpen ? "" : "-rotate-90"}`} />
                      <Users className="w-3 h-3" />
                      {t("com.groupChatsFolder") || "Group Chats"}
                      <Badge variant="outline" className="text-[8px] h-4 px-1 ml-auto">{groupChats.length}</Badge>
                    </button>
                    {gcSectionOpen && [...groupChats]
                      .sort((a, b) => {
                        const ta = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
                        const tb = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
                        return tb - ta;
                      })
                      .map(gc => (
                      <div
                        key={`gc-${gc.id}`}
                        onClick={() => openGroup(gc)}
                        className={`flex items-center gap-2.5 p-3 cursor-pointer hover:bg-secondary/40 transition-colors border-b border-border/40 ${active?.kind === "group" && active.chat.id === gc.id ? "bg-secondary/70" : ""}`}
                      >
                        {gc.groupThumbnailUrl ? (
                          <img src={gc.groupThumbnailUrl} alt={gc.name} className="w-9 h-9 rounded-full object-cover shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ background: gc.robloxGroupId ? "#000" : (gc.avatarColor || "#6366f1") }}>
                            {gc.robloxGroupId ? <Users className="w-4 h-4" /> : gc.name.charAt(0)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs font-semibold truncate">{gc.name}</p>
                            {gc.robloxGroupId && <Badge className="text-[8px] h-4 px-1 shrink-0 bg-black text-white border-0">Roblox</Badge>}
                            <Badge variant="outline" className="text-[8px] h-4 px-1 shrink-0">{gc.memberCount || "?"}</Badge>
                          </div>
                          {gc.lastMessage && <p className="text-[10px] text-muted-foreground truncate">{gc.lastMessage.isDeleted ? <span className="italic">{t("com.deletedMessage")}</span> : isCallMsg(gc.lastMessage.content) ? <span className="inline-flex items-center gap-1">{parseCallMsg(gc.lastMessage.content).type === "missed" ? <><PhoneOff className="w-3 h-3 text-red-400 inline" /> {t("com.callMissed")}</> : <><Phone className="w-3 h-3 text-green-400 inline" /> {t("com.callOutgoing")}</>}</span> : isVoiceMsg(gc.lastMessage.content) ? `🎤 ${t("com.voiceMessage")}` : gc.lastMessage.content}</p>}
                        </div>
                        {gc.lastMessage && <span className="text-[9px] text-muted-foreground shrink-0">{timeAgoShort(gc.lastMessage.createdAt)}</span>}
                      </div>
                    ))}
                  </div>
                )}

                {groupChats.length === 0 && conversations.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4 text-center">
                    <MessageSquare className="w-8 h-8 mb-2 opacity-30" strokeWidth={1} />
                    <p className="text-xs font-medium">{t("com.noChats")}</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">{t("com.createChatHint")}</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Main area */}
        <div className="flex-1 flex flex-col border border-border rounded-2xl overflow-hidden shadow-sm">
          {showCreate ? (
            <div className="flex-1 flex flex-col p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">{t("com.createGroupChat")}</h3>
                <Button size="sm" variant="ghost" className="rounded-xl h-7 w-7 p-0" onClick={() => setShowCreate(false)}><X className="w-4 h-4" /></Button>
              </div>
              <Input placeholder={t("com.chatNamePlaceholder")} value={chatName} onChange={e => setChatName(e.target.value)} className="rounded-xl" />
              <div className="flex gap-2">
                <Input placeholder={t("com.addMemberPlaceholder")} value={memberInput} onChange={e => setMemberInput(e.target.value)} onKeyDown={e => e.key === "Enter" && addPendingMember()} className="rounded-xl flex-1 text-sm" />
                <Button variant="outline" className="rounded-xl" onClick={addPendingMember}><Plus className="w-4 h-4" /></Button>
              </div>
              {pendingMembers.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {pendingMembers.map(m => (
                    <Badge key={m.id} variant="secondary" className="gap-1.5 text-xs">
                      {m.displayName}
                      <button onClick={() => setPendingMembers(p => p.filter(x => x.id !== m.id))}><X className="w-3 h-3" /></button>
                    </Badge>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">{t("com.minMembers")}</p>
              <Button className="rounded-xl" onClick={createGroupChat} disabled={creating || !chatName.trim() || pendingMembers.length < 2}>
                {creating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />} {t("com.create")}
              </Button>
            </div>
          ) : !active ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <MessageSquare className="w-12 h-12 mb-3 opacity-30" strokeWidth={1} />
              <p className="font-medium">{t("com.selectChat")}</p>
              <p className="text-sm mt-1 text-muted-foreground/70">{t("com.orCreateChat")}</p>
            </div>
          ) : active.kind === "dm" ? (
            <>
              <div className="p-4 border-b border-border bg-secondary/30 flex items-center gap-3">
                <Avatar className="w-8 h-8 border border-border">
                  <AvatarImage src={active.user.avatarUrl || robloxHeadshot(active.user.robloxUserId)} />
                  <AvatarFallback className="text-xs font-bold">{active.user.displayName.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{active.user.displayName}</p>
                  <p className="text-xs text-muted-foreground">@{active.user.robloxUsername}</p>
                </div>
                <Button size="sm" variant="ghost" className="rounded-xl h-8 w-8 p-0" onClick={voiceCall.callActive ? handleEndCall : handleStartCall} disabled={voiceCall.callConnecting} title={t("com.voiceCall")}>
                  {voiceCall.callConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : voiceCall.callActive ? <PhoneOff className="w-4 h-4 text-red-500" /> : <Phone className="w-4 h-4" />}
                </Button>
              </div>
              <AnimatePresence>
                {(voiceCall.callActive || voiceCall.callConnecting) && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-b border-border overflow-hidden">
                    <div className="px-4 py-3 bg-black text-white flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium">{voiceCall.callConnecting ? t("com.calling") : `${t("com.callWith")} ${active.user.displayName}`}</p>
                        {voiceCall.callActive && <p className="text-[10px] text-white/60 font-mono">{formatCallTime(voiceCall.callTimer)}</p>}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button onClick={voiceCall.toggleMute} className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${voiceCall.callMuted ? "bg-red-500/80" : "bg-white/20 hover:bg-white/30"}`}>
                          {voiceCall.callMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={handleEndCall} className="w-8 h-8 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors">
                          <PhoneOff className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <div ref={chatContainerRef} onScroll={handleChatScroll} className="flex-1 overflow-y-auto p-4 space-y-3">
                {loadingMsgs ? (
                  <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">{t("com.noMessages")}</div>
                ) : (
                  messages.map(msg => {
                    const isOwn = myUser && msg.senderId === myUser.id;
                    return (
                      <div key={msg.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[75%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${isOwn ? "bg-black text-white rounded-br-md" : "bg-secondary rounded-bl-md"}`}>
                          {isCallMsg(msg.content) ? (() => { const c = parseCallMsg(msg.content); return (<span className="flex items-center gap-1.5 text-xs"><span>{c.type === "missed" ? <PhoneOff className="w-3.5 h-3.5 text-red-400 inline" /> : <Phone className="w-3.5 h-3.5 text-green-400 inline" />}</span><span>{c.type === "missed" ? t("com.callMissed") : `${t("com.callOutgoing")} ${c.duration}`}</span></span>); })() : isVoiceMsg(msg.content) ? <VoicePlayer src={getVoiceSrc(msg.content)} isOwn={!!isOwn} /> : msg.content}
                          <p className={`text-[10px] mt-1 ${isOwn ? "text-white/50" : "text-muted-foreground"}`}>{timeAgo(msg.createdAt, t)}</p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>
              {myUser && (
                <div className="p-3 border-t border-border">
                  <AnimatePresence>
                    {isRecording && (
                      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="flex items-center gap-3 mb-2 px-2">
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        <p className="text-xs font-medium text-red-500">{t("com.recording")} {formatCallTime(recordingTime)}</p>
                        <div className="flex-1" />
                        <Button size="sm" variant="ghost" className="rounded-xl h-7 text-xs" onClick={cancelRecording}>{t("com.cancelRecording")}</Button>
                        <Button size="sm" className="rounded-xl h-7 text-xs" onClick={stopRecording}><Check className="w-3 h-3 mr-1" /> {t("com.endCall")}</Button>
                      </motion.div>
                    )}
                    {voiceBlob && !isRecording && (
                      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="flex items-center gap-2 mb-2 px-1 py-1.5 bg-secondary/50 rounded-xl">
                        <Mic className="w-4 h-4 text-muted-foreground ml-2" />
                        <p className="text-xs font-medium flex-1">{t("com.voiceMessage")} ({formatCallTime(recordingTime)})</p>
                        <Button size="sm" variant="ghost" className="rounded-xl h-7 text-xs" onClick={() => { setVoiceBlob(null); setRecordingTime(0); }}><X className="w-3 h-3" /></Button>
                        <Button size="sm" className="rounded-xl h-7 text-xs gap-1" onClick={sendVoiceMessage} disabled={sending}>
                          {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} {t("com.sendVoice")}
                        </Button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <div className="flex gap-2 items-center">
                    <Button size="sm" variant="ghost" className="rounded-xl h-9 w-9 p-0 shrink-0" onClick={isRecording ? stopRecording : startRecording} title={t("com.recordVoice")} disabled={!!voiceBlob}>
                      <Mic className={`w-4 h-4 ${isRecording ? "text-red-500" : ""}`} />
                    </Button>
                    <Input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()} placeholder={`${t("com.messagePlaceholder")} ${active.user.displayName}`} className="rounded-xl flex-1" disabled={isRecording || !!voiceBlob} />
                    <Button onClick={handleSend} disabled={sending || !text.trim() || isRecording || !!voiceBlob} size="sm" className="rounded-xl px-3 h-9 shrink-0">
                      {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="p-4 border-b border-border bg-secondary/30 flex items-center gap-3">
                {active.chat.groupThumbnailUrl ? (
                  <img src={active.chat.groupThumbnailUrl} alt={active.chat.name} className="w-8 h-8 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ background: active.chat.robloxGroupId ? "#000" : (active.chat.avatarColor || "#6366f1") }}>
                    {active.chat.robloxGroupId ? <Users className="w-4 h-4" /> : active.chat.name.charAt(0)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="font-semibold text-sm">{active.chat.name}</p>
                    {active.chat.robloxGroupId && <Badge className="text-[8px] h-4 px-1 shrink-0 bg-black text-white border-0">Roblox</Badge>}
                  </div>
                  <p className="text-[10px] text-muted-foreground">{chatMembers.length} {t("com.members")} {active.chat.robloxGroupId ? `· ${t("com.workChat")}` : ""}</p>
                </div>
                <Button size="sm" variant="ghost" className="rounded-xl gap-1 h-8 text-xs" onClick={() => setShowAddMember(p => !p)}><UserPlus className="w-3.5 h-3.5" /></Button>
                <Button size="sm" variant="ghost" className={`rounded-xl gap-1 h-8 text-xs ${showMembersPanel ? "bg-secondary" : ""}`} onClick={() => setShowMembersPanel(p => !p)}><Users className="w-3.5 h-3.5" /></Button>
                {!isAdmin && (
                  <Button size="sm" variant="ghost" className="rounded-xl gap-1 h-8 text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10" onClick={() => myUser && removeMember(myUser.id)} title={t("com.leaveChat")}>
                    <LogOut className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
              {showAddMember && (
                <div className="flex gap-2 px-4 py-2 border-b border-border">
                  <Input placeholder={t("com.addMember")} value={addMemberInput} onChange={e => setAddMemberInput(e.target.value)} onKeyDown={e => e.key === "Enter" && addMemberToChat()} className="rounded-xl flex-1 text-xs h-8" />
                  <Button size="sm" className="rounded-xl h-8" onClick={addMemberToChat}><Check className="w-3.5 h-3.5" /></Button>
                </div>
              )}
              <AnimatePresence>
                {showMembersPanel && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-b border-border overflow-hidden">
                    <div className="px-4 py-3 max-h-[220px] overflow-y-auto space-y-1">
                      <p className="text-xs font-medium text-muted-foreground mb-2">{t("com.members")} ({chatMembers.length})</p>
                      {chatMembers
                        .sort((a: any, b: any) => { const order: Record<string, number> = { admin: 0, moderator: 1, member: 2 }; return (order[a.role] ?? 2) - (order[b.role] ?? 2); })
                        .map((m: any) => {
                        const u = m.user;
                        const isMe = u?.id === myUser?.id;
                        return (
                          <div key={m.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-secondary/40 transition-colors group/member">
                            <Avatar className="w-6 h-6 border border-border shrink-0">
                              <AvatarImage src={u?.avatarUrl || robloxHeadshot(u?.robloxUserId || 0)} />
                              <AvatarFallback className="text-[9px]">{u?.displayName?.charAt(0) || "?"}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1">
                                <p className="text-xs font-medium truncate">{u?.displayName || "?"}{isMe && <span className="text-muted-foreground ml-1">({t("com.you")})</span>}</p>
                                {getRoleIcon(m.role)}
                              </div>
                              <p className="text-[10px] text-muted-foreground">{getRoleLabel(m.role)}</p>
                            </div>
                            {!isMe && (isAdmin || isModerator) && m.role !== "admin" && (
                              <div className="flex items-center gap-0.5 opacity-0 group-hover/member:opacity-100 transition-opacity">
                                {isAdmin && (
                                  <Select value={m.role} onValueChange={(val) => changeMemberRole(m.userId, val)}>
                                    <SelectTrigger className="h-6 w-auto text-[10px] border-0 bg-transparent px-1.5 gap-0.5">
                                      <UserCog className="w-3 h-3" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="admin" className="text-xs">{t("com.roleAdmin")}</SelectItem>
                                      <SelectItem value="moderator" className="text-xs">{t("com.roleModerator")}</SelectItem>
                                      <SelectItem value="member" className="text-xs">{t("com.roleMember")}</SelectItem>
                                    </SelectContent>
                                  </Select>
                                )}
                                <button onClick={() => removeMember(m.userId)} className="p-1 rounded-full hover:bg-red-500/10 text-red-500" title={t("com.kickMember")}>
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <div ref={chatContainerRef} onScroll={handleChatScroll} className="flex-1 overflow-y-auto p-4 space-y-3">
                {loadingMsgs ? (
                  <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">{t("com.noMessagesStart")}</div>
                ) : (
                  messages.map(msg => {
                    const isMe = myUser && msg.senderId === myUser.id;
                    const deleted = msg.isDeleted;
                    return (
                      <div key={msg.id} className={`flex items-end gap-2 group/msg ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                        {!isMe && <Avatar className="w-7 h-7 border border-border shrink-0 mb-0.5"><AvatarImage src={msg.sender?.avatarUrl || robloxHeadshot(msg.sender?.robloxUserId || 0)} /><AvatarFallback className="text-[10px]">{msg.sender?.displayName?.charAt(0) || "?"}</AvatarFallback></Avatar>}
                        <div className={`max-w-[70%] ${isMe ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                          {!isMe && <p className="text-[10px] text-muted-foreground px-1">{msg.sender?.displayName}</p>}
                          <div className="flex items-center gap-1">
                            {isMe && !deleted && (
                              <button
                                className="opacity-0 group-hover/msg:opacity-100 transition-opacity p-1 rounded-full hover:bg-secondary"
                                onClick={async () => {
                                  const chatId = active?.kind === "group" ? active.chat.id : null;
                                  if (!chatId) return;
                                  try {
                                    await apiFetch(`/api/community/group-chats/${chatId}/messages/${msg.id}`, { method: "DELETE" });
                                    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, isDeleted: true } : m));
                                  } catch {}
                                }}
                                title={t("com.deleteMessage")}
                              >
                                <Trash2 className="w-3 h-3 text-muted-foreground" />
                              </button>
                            )}
                            <div className={`rounded-2xl px-3 py-2 text-sm ${deleted ? "bg-secondary/50 border border-dashed border-border" : isMe ? "bg-black text-white rounded-br-sm" : "bg-secondary rounded-bl-sm"}`}>
                              {deleted ? <span className="italic text-muted-foreground text-xs">{t("com.deletedMessage")}</span> : isCallMsg(msg.content) ? (() => { const c = parseCallMsg(msg.content); return (<span className="flex items-center gap-1.5 text-xs"><span>{c.type === "missed" ? <PhoneOff className="w-3.5 h-3.5 text-red-400 inline" /> : <Phone className="w-3.5 h-3.5 text-green-400 inline" />}</span><span>{c.type === "missed" ? t("com.callMissed") : `${t("com.callOutgoing")} ${c.duration}`}</span></span>); })() : isVoiceMsg(msg.content) ? <VoicePlayer src={getVoiceSrc(msg.content)} isOwn={!!isMe} /> : msg.content}
                            </div>
                            
                          </div>
                          <p className="text-[10px] text-muted-foreground px-1">{timeAgoShort(msg.createdAt)}</p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>
              {myUser && (
                <div className="p-3 border-t border-border">
                  <AnimatePresence>
                    {isRecording && (
                      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="flex items-center gap-3 mb-2 px-2">
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        <p className="text-xs font-medium text-red-500">{t("com.recording")} {formatCallTime(recordingTime)}</p>
                        <div className="flex-1" />
                        <Button size="sm" variant="ghost" className="rounded-xl h-7 text-xs" onClick={cancelRecording}>{t("com.cancelRecording")}</Button>
                        <Button size="sm" className="rounded-xl h-7 text-xs" onClick={stopRecording}><Check className="w-3 h-3 mr-1" /> {t("com.endCall")}</Button>
                      </motion.div>
                    )}
                    {voiceBlob && !isRecording && (
                      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="flex items-center gap-2 mb-2 px-1 py-1.5 bg-secondary/50 rounded-xl">
                        <Mic className="w-4 h-4 text-muted-foreground ml-2" />
                        <p className="text-xs font-medium flex-1">{t("com.voiceMessage")} ({formatCallTime(recordingTime)})</p>
                        <Button size="sm" variant="ghost" className="rounded-xl h-7 text-xs" onClick={() => { setVoiceBlob(null); setRecordingTime(0); }}><X className="w-3 h-3" /></Button>
                        <Button size="sm" className="rounded-xl h-7 text-xs gap-1" onClick={sendVoiceMessage} disabled={sending}>
                          {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} {t("com.sendVoice")}
                        </Button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <div className="flex gap-2 items-center">
                    <Button size="sm" variant="ghost" className="rounded-xl h-9 w-9 p-0 shrink-0" onClick={isRecording ? stopRecording : startRecording} title={t("com.recordVoice")} disabled={!!voiceBlob}>
                      <Mic className={`w-4 h-4 ${isRecording ? "text-red-500" : ""}`} />
                    </Button>
                    <Input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()} placeholder={t("com.messagePlaceholder")} className="rounded-xl flex-1" disabled={isRecording || !!voiceBlob} />
                    <Button onClick={handleSend} disabled={sending || !text.trim() || isRecording || !!voiceBlob} size="sm" className="rounded-xl px-3 h-9 shrink-0">
                      {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
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
  const { t } = useLanguage();
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

  const fetchTopics = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await apiFetch<{ topics: ForumTopic[] }>(`/api/forum/topics?category=${category}`);
      setTopics(data.topics);
    } catch {
      if (!silent) toast({ variant: "destructive", title: "Error", description: "Failed to load topics" });
    } finally { if (!silent) setLoading(false); }
  }, [category]);

  useEffect(() => { fetchTopics(); }, [fetchTopics]);

  useEffect(() => {
    const iv = setInterval(() => fetchTopics(true), 15000);
    return () => clearInterval(iv);
  }, [fetchTopics]);

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
      setTopics(prev => prev.map(tp => tp.id === topicId ? { ...tp, votesUp: data.votesUp, votesDown: data.votesDown, myVote: data.myVote } : tp));
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

  const selectedTopicRef = useRef(selectedTopic);
  selectedTopicRef.current = selectedTopic;

  useEffect(() => {
    const iv = setInterval(async () => {
      const st = selectedTopicRef.current;
      if (!st) return;
      try {
        const data = await apiFetch<{ topic: ForumTopic; replies: ForumReply[] }>(`/api/forum/topics/${st.id}`);
        setSelectedTopic(data.topic);
        setReplies(data.replies);
      } catch {}
    }, 5000);
    return () => clearInterval(iv);
  }, []);

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
      setTopics(prev => prev.map(tp => tp.id === selectedTopic.id ? { ...tp, repliesCount: tp.repliesCount + 1 } : tp));
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
                <AvatarImage src={selectedTopic.author?.avatarUrl || robloxHeadshot(selectedTopic.author?.robloxUserId || 0)} />
                <AvatarFallback className="text-xs font-bold">{selectedTopic.author?.displayName?.charAt(0) || "?"}</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-semibold hover:underline">{selectedTopic.author?.displayName}</p>
                <p className="text-xs text-muted-foreground">{timeAgo(selectedTopic.createdAt, t)}</p>
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
                          <AvatarImage src={r.author?.avatarUrl || robloxHeadshot(r.author?.robloxUserId || 0)} />
                          <AvatarFallback className="text-[10px] font-bold">{r.author?.displayName?.charAt(0) || "?"}</AvatarFallback>
                        </Avatar>
                        <span className="text-xs font-semibold hover:underline">{r.author?.displayName}</span>
                        <span className="text-[10px] text-muted-foreground">{timeAgo(r.createdAt, t)}</span>
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
                        <span>{timeAgo(topic.lastActivityAt, t)}</span>
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

  const fetchLeaderboard = useCallback(async (silent = false) => {
    try {
      const d = await apiFetch<{ topPosters: LeaderboardEntry[]; topHelpers: LeaderboardEntry[]; topContributors: LeaderboardEntry[] }>("/api/forum/leaderboard");
      setData(d);
    } catch {} finally { if (!silent) setLoading(false); }
  }, []);

  useEffect(() => { fetchLeaderboard(); }, [fetchLeaderboard]);

  useEffect(() => {
    const iv = setInterval(() => fetchLeaderboard(true), 30000);
    return () => clearInterval(iv);
  }, [fetchLeaderboard]);

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
                  <AvatarImage src={entry.user?.avatarUrl || robloxHeadshot(entry.user?.robloxUserId || 0)} />
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
  const { t } = useLanguage();
  const [subs, setSubs] = useState<GroupSub[]>([]);
  const [loading, setLoading] = useState(true);
  const [addGroupId, setAddGroupId] = useState("");
  const [adding, setAdding] = useState(false);

  const fetchSubs = useCallback(async (silent = false) => {
    try {
      const d = await apiFetch<{ subscriptions: GroupSub[] }>("/api/forum/subscriptions");
      setSubs(d.subscriptions);
    } catch {} finally { if (!silent) setLoading(false); }
  }, []);

  useEffect(() => { fetchSubs(); }, [fetchSubs]);

  useEffect(() => {
    const iv = setInterval(() => fetchSubs(true), 20000);
    return () => clearInterval(iv);
  }, [fetchSubs]);

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
                    <p className="text-[10px] text-muted-foreground">Subscribed {timeAgo(sub.createdAt, t)}</p>
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

// ── Main Community Page ───────────────────────────────────────────────────────

// ── TeamsTab ───────────────────────────────────────────────────────────────────
function TeamsTab({ myUser }: { myUser: PlatformUser | null }) {
  const { toast } = useToast();
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [invites, setInvites] = useState<any[]>([]);
  const [activeWs, setActiveWs] = useState<any | null>(null);
  const [wsMembers, setWsMembers] = useState<any[]>([]);
  const [wsProjects, setWsProjects] = useState<any[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ robloxGroupId: "", groupName: "", description: "" });
  const [creating, setCreating] = useState(false);
  const [showInviteInput, setShowInviteInput] = useState(false);
  const [inviteUsername, setInviteUsername] = useState("");
  const [inviting, setInviting] = useState(false);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [{ workspaces: ws }, { invites: inv }] = await Promise.all([
        apiFetch<{ workspaces: any[] }>("/api/community/workspaces"),
        apiFetch<{ invites: any[] }>("/api/community/invites"),
      ]);
      setWorkspaces(ws); setInvites(inv);
    } catch {}
    finally { if (!silent) setLoading(false); }
  };

  useEffect(() => { if (myUser) load(); else setLoading(false); }, [myUser]);

  useEffect(() => {
    const iv = setInterval(() => { if (myUser) load(true); }, 15000);
    return () => clearInterval(iv);
  }, [myUser]);

  const openWs = async (ws: any) => {
    setActiveWs(ws); setMembersLoading(true);
    try {
      const { members } = await apiFetch<{ members: any[] }>(`/api/community/workspaces/${ws.id}/members`);
      setWsMembers(members);
      const { projects } = await apiFetch<{ projects: any[] }>(`/api/community/workspaces/${ws.id}/projects`);
      setWsProjects(projects);
    } catch {}
    finally { setMembersLoading(false); }
  };

  const createWorkspace = async () => {
    if (!createForm.robloxGroupId || !createForm.groupName) return;
    setCreating(true);
    try {
      const { workspace } = await apiFetch<{ workspace: any }>("/api/community/workspaces", {
        method: "POST",
        body: JSON.stringify({ robloxGroupId: parseInt(createForm.robloxGroupId), groupName: createForm.groupName, description: createForm.description }),
      });
      setWorkspaces(p => [workspace, ...p]);
      setShowCreate(false); setCreateForm({ robloxGroupId: "", groupName: "", description: "" });
      toast({ title: t("com.wsCreated") });
    } catch (e) { toast({ variant: "destructive", title: t("com.error"), description: e instanceof Error ? e.message : t("com.error") }); }
    finally { setCreating(false); }
  };

  const acceptInvite = async (inviteId: number) => {
    try {
      await apiFetch(`/api/community/workspaces/invite/${inviteId}/accept`, { method: "POST" });
      setInvites(p => p.filter(i => i.id !== inviteId));
      load(); toast({ title: t("com.joinedTeam") });
    } catch {}
  };

  const inviteMember = async () => {
    if (!activeWs || !inviteUsername.trim()) return;
    setInviting(true);
    try {
      const users = await apiFetch<any[]>(`/api/social/users/search?q=${encodeURIComponent(inviteUsername)}`).catch(() => []);
      const target = (users as any[]).find((u: any) => u.robloxUsername.toLowerCase() === inviteUsername.toLowerCase() || u.displayName.toLowerCase() === inviteUsername.toLowerCase());
      if (!target) { toast({ variant: "destructive", title: t("com.userNotFound") }); return; }
      await apiFetch(`/api/community/workspaces/${activeWs.id}/invite`, { method: "POST", body: JSON.stringify({ targetUserId: target.id }) });
      toast({ title: t("com.inviteSent") });
      setInviteUsername(""); setShowInviteInput(false);
      const { members } = await apiFetch<{ members: any[] }>(`/api/community/workspaces/${activeWs.id}/members`);
      setWsMembers(members);
    } catch (e) { toast({ variant: "destructive", title: t("com.error"), description: e instanceof Error ? e.message : "" }); }
    finally { setInviting(false); }
  };

  const kickMember = async (memberId: number) => {
    if (!activeWs) return;
    try {
      await apiFetch(`/api/community/workspaces/${activeWs.id}/members/${memberId}`, { method: "DELETE" });
      setWsMembers(p => p.filter(m => m.id !== memberId));
    } catch (e) { toast({ variant: "destructive", title: t("com.error"), description: e instanceof Error ? e.message : "" }); }
  };

  const ROLE_LABELS: Record<string, string> = { owner: t("com.roleOwner"), admin: t("com.roleAdmin"), member: t("com.roleMember"), pending: t("com.roleInvited") };
  const ROLE_COLORS: Record<string, string> = { owner: "border-amber-500/30 text-amber-600", admin: "border-blue-500/30 text-blue-600", member: "border-border text-muted-foreground", pending: "border-purple-500/30 text-purple-600" };

  if (!myUser) return <div className="text-center py-16 text-muted-foreground"><Users className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>{t("com.registerForTeams")}</p></div>;

  if (activeWs) return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" className="rounded-xl gap-2" onClick={() => setActiveWs(null)}><ArrowLeft className="w-4 h-4" /> {t("com.back")}</Button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {activeWs.groupThumbnailUrl && <img src={activeWs.groupThumbnailUrl} className="w-8 h-8 rounded-lg object-cover" />}
          <div className="min-w-0">
            <h2 className="font-bold text-lg truncate">{activeWs.groupName}</h2>
            {activeWs.description && <p className="text-xs text-muted-foreground truncate">{activeWs.description}</p>}
          </div>
          <Badge variant="outline" className="shrink-0">{activeWs.myRole}</Badge>
        </div>
        {["owner", "admin"].includes(activeWs.myRole) && (
          <Button size="sm" className="rounded-xl gap-1.5" onClick={() => setShowInviteInput(p => !p)}><UserPlus className="w-3.5 h-3.5" /> {t("com.invite")}</Button>
        )}
      </div>

      {showInviteInput && (
        <Card className="rounded-2xl border-blue-500/20 bg-blue-500/5">
          <CardContent className="pt-4 flex gap-2">
            <Input placeholder={t("com.invitePlaceholder")} value={inviteUsername} onChange={e => setInviteUsername(e.target.value)} onKeyDown={e => e.key === "Enter" && inviteMember()} className="rounded-xl flex-1" />
            <Button className="rounded-xl" onClick={inviteMember} disabled={inviting}>{inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}</Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2 space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t("com.members")} ({wsMembers.length})</h3>
          {membersLoading ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />) : wsMembers.map(m => (
            <Card key={m.id} className="rounded-2xl border-border/50">
              <CardContent className="p-3 flex items-center gap-3">
                <Avatar className="w-10 h-10 border border-border shrink-0">
                  <AvatarImage src={m.user?.avatarUrl || robloxHeadshot(m.user?.robloxUserId || 0)} />
                  <AvatarFallback>{m.user?.displayName?.charAt(0) || "?"}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{m.user?.displayName || "Unknown"}</p>
                  <p className="text-xs text-muted-foreground">@{m.user?.robloxUsername}</p>
                </div>
                <Badge variant="outline" className={`text-[10px] shrink-0 ${ROLE_COLORS[m.status === "pending" ? "pending" : m.role] || ""}`}>
                  {ROLE_LABELS[m.status === "pending" ? "pending" : m.role] || m.role}
                </Badge>
                {activeWs.myRole === "owner" && m.user?.id !== myUser?.id && m.status !== "pending" && (
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500 hover:bg-red-500/10 shrink-0" onClick={() => kickMember(m.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t("com.projects")} ({wsProjects.length})</h3>
          {wsProjects.map(p => (
            <Card key={p.id} className="rounded-2xl border-border/50">
              <CardContent className="p-3">
                <p className="font-semibold text-sm">{p.title}</p>
                {p.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{p.description}</p>}
                <Badge variant="outline" className={`text-[9px] mt-1.5 ${p.status === "active" ? "border-green-500/30 text-green-600" : "border-border"}`}>{p.status}</Badge>
              </CardContent>
            </Card>
          ))}
          {wsProjects.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">{t("com.noProjects")}</p>}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {invites.length > 0 && (
        <Card className="rounded-2xl border-blue-500/20 bg-blue-500/5">
          <CardContent className="pt-4 space-y-2">
            <p className="text-sm font-semibold text-blue-600">{t("com.teamInvites")} ({invites.length})</p>
            {invites.map(inv => (
              <div key={inv.id} className="flex items-center gap-3 rounded-xl border border-blue-500/20 bg-card p-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{inv.workspace?.groupName}</p>
                  <p className="text-xs text-muted-foreground">{t("com.teamInvite")}</p>
                </div>
                <Button size="sm" className="rounded-xl gap-1.5 h-8" onClick={() => acceptInvite(inv.id)}><Check className="w-3.5 h-3.5" /> {t("com.accept")}</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">{t("com.myWorkspaces")}</h2>
        <Button size="sm" className="rounded-xl gap-1.5" onClick={() => setShowCreate(p => !p)}><Plus className="w-3.5 h-3.5" /> {t("com.create")}</Button>
      </div>

      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <Card className="rounded-2xl border-black/20 bg-secondary/30">
              <CardContent className="pt-4 space-y-3">
                <p className="text-sm font-semibold">{t("com.createWs")}</p>
                <Input placeholder={t("com.groupIdPlaceholder")} value={createForm.robloxGroupId} onChange={e => setCreateForm(p => ({ ...p, robloxGroupId: e.target.value }))} className="rounded-xl" />
                <Input placeholder={t("com.groupNamePlaceholder")} value={createForm.groupName} onChange={e => setCreateForm(p => ({ ...p, groupName: e.target.value }))} className="rounded-xl" />
                <Textarea placeholder={t("com.teamDescPlaceholder")} value={createForm.description} onChange={e => setCreateForm(p => ({ ...p, description: e.target.value }))} className="rounded-xl resize-none" rows={2} />
                <div className="flex gap-2">
                  <Button className="flex-1 rounded-xl" onClick={createWorkspace} disabled={creating || !createForm.robloxGroupId || !createForm.groupName}>
                    {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {t("com.create")}
              </Button>
                  <Button variant="ghost" className="rounded-xl" onClick={() => setShowCreate(false)}><X className="w-4 h-4" /></Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />) : workspaces.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-muted-foreground gap-2">
          <Briefcase className="w-12 h-12 opacity-20" />
          <p className="text-sm">{t("com.noWorkspaces")}</p>
          <p className="text-xs">{t("com.noWsHint")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {workspaces.map(ws => (
            <Card key={ws.id} className="rounded-2xl border-border/50 hover:border-black/30 transition-colors cursor-pointer" onClick={() => openWs(ws)}>
              <CardContent className="p-4 flex items-center gap-3">
                {ws.groupThumbnailUrl ? <img src={ws.groupThumbnailUrl} className="w-12 h-12 rounded-xl object-cover shrink-0" /> : <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center shrink-0"><Briefcase className="w-5 h-5 text-muted-foreground" /></div>}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-sm truncate">{ws.groupName}</p>
                    <Badge variant="outline" className="text-[9px] shrink-0">{ws.myRole}</Badge>
                  </div>
                  {ws.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{ws.description}</p>}
                  <p className="text-xs text-muted-foreground mt-1">{ws.memberCount} {t("com.members")}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── GroupChatTab ───────────────────────────────────────────────────────────────
function GroupChatTab({ myUser }: { myUser: PlatformUser | null }) {
  const { toast } = useToast();
  const [chats, setChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeChat, setActiveChat] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [msgsLoading, setMsgsLoading] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [chatName, setChatName] = useState("");
  const [memberInput, setMemberInput] = useState("");
  const [pendingMembers, setPendingMembers] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  const [chatMembers, setChatMembers] = useState<any[]>([]);
  const [showAddMember, setShowAddMember] = useState(false);
  const [addMemberInput, setAddMemberInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6"];

  const loadChats = async (silent = false) => {
    try {
      const { chats: c } = await apiFetch<{ chats: any[] }>("/api/community/group-chats");
      setChats(c);
    } catch {}
    finally { if (!silent) setLoading(false); }
  };

  useEffect(() => { if (myUser) loadChats(); else setLoading(false); }, [myUser]);

  useEffect(() => {
    const iv = setInterval(() => loadChats(true), 10000);
    return () => clearInterval(iv);
  }, []);

  const activeChatRef = useRef(activeChat);
  activeChatRef.current = activeChat;

  const gcLastCountRef = useRef(0);

  useEffect(() => {
    let inFlight = false;
    const iv = setInterval(async () => {
      const cur = activeChatRef.current;
      if (!cur || inFlight) return;
      inFlight = true;
      try {
        const { messages: msgs } = await apiFetch<{ messages: any[] }>(`/api/community/group-chats/${cur.id}/messages`);
        if (msgs.length !== gcLastCountRef.current) {
          setMessages(msgs);
          gcLastCountRef.current = msgs.length;
        }
      } catch {} finally { inFlight = false; }
    }, 3000);
    return () => clearInterval(iv);
  }, []);

  const gcContainerRef = useRef<HTMLDivElement>(null);
  const gcAutoScrollRef = useRef(true);

  const handleGcScroll = useCallback(() => {
    const el = gcContainerRef.current;
    if (!el) return;
    gcAutoScrollRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  useEffect(() => {
    if (gcAutoScrollRef.current && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const openChat = async (chat: any) => {
    setActiveChat(chat); setMsgsLoading(true); setMessages([]);
    try {
      const { messages: msgs } = await apiFetch<{ messages: any[] }>(`/api/community/group-chats/${chat.id}/messages`);
      setMessages(msgs);
      const { members } = await apiFetch<{ members: any[] }>(`/api/community/group-chats/${chat.id}/members`);
      setChatMembers(members);
    } catch {}
    finally { setMsgsLoading(false); }
  };

  const sendMessage = async () => {
    if (!text.trim() || !activeChat || sending) return;
    setSending(true);
    try {
      const { message } = await apiFetch<{ message: any }>(`/api/community/group-chats/${activeChat.id}/messages`, {
        method: "POST", body: JSON.stringify({ content: text.trim() }),
      });
      setMessages(p => [...p, message]);
      setText("");
    } catch {}
    finally { setSending(false); }
  };

  const searchUser = async (username: string) => {
    if (!username.trim()) return null;
    try {
      const users = await apiFetch<any[]>(`/api/social/users/search?q=${encodeURIComponent(username)}`);
      return (users as any[]).find((u: any) => u.robloxUsername.toLowerCase() === username.toLowerCase() || u.displayName.toLowerCase() === username.toLowerCase());
    } catch { return null; }
  };

  const addPendingMember = async () => {
    const user = await searchUser(memberInput);
    if (!user) { toast({ variant: "destructive", title: t("com.userNotFound") }); return; }
    if (pendingMembers.find(m => m.id === user.id)) return;
    setPendingMembers(p => [...p, user]);
    setMemberInput("");
  };

  const createChat = async () => {
    if (!chatName.trim() || pendingMembers.length < 2) return;
    setCreating(true);
    try {
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      const { chat } = await apiFetch<{ chat: any }>("/api/community/group-chats", {
        method: "POST",
        body: JSON.stringify({ name: chatName.trim(), memberIds: pendingMembers.map(m => m.id), avatarColor: color }),
      });
      setChats(p => [chat, ...p]);
      setShowCreate(false); setChatName(""); setPendingMembers([]);
      openChat(chat); toast({ title: t("com.groupChatCreated2") });
    } catch (e) { toast({ variant: "destructive", title: t("com.error"), description: e instanceof Error ? e.message : "" }); }
    finally { setCreating(false); }
  };

  const addMemberToChat = async () => {
    if (!activeChat || !addMemberInput.trim()) return;
    const user = await searchUser(addMemberInput);
    if (!user) { toast({ variant: "destructive", title: t("com.userNotFound") }); return; }
    try {
      await apiFetch(`/api/community/group-chats/${activeChat.id}/members`, { method: "POST", body: JSON.stringify({ targetUserId: user.id }) });
      const { members } = await apiFetch<{ members: any[] }>(`/api/community/group-chats/${activeChat.id}/members`);
      setChatMembers(members);
      setAddMemberInput(""); setShowAddMember(false);
      toast({ title: t("com.memberAdded2") });
    } catch (e) { toast({ variant: "destructive", title: t("com.error"), description: e instanceof Error ? e.message : "" }); }
  };

  const timeAgoShort = (date: string) => {
    const d = Date.now() - new Date(date).getTime();
    const m = Math.floor(d / 60000);
    if (m < 1) return t("com.now");
    if (m < 60) return `${m}м`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}ч`;
    return `${Math.floor(h / 24)}д`;
  };

  if (!myUser) return <div className="text-center py-16 text-muted-foreground"><MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>{t("com.needRegChat")}</p></div>;

  if (activeChat) return (
    <div className="flex flex-col h-[600px]">
      <div className="flex items-center gap-3 pb-3 border-b border-border">
        <Button variant="ghost" size="sm" className="rounded-xl gap-1.5" onClick={() => setActiveChat(null)}><ArrowLeft className="w-4 h-4" /> {t("com.back")}</Button>
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ background: activeChat.avatarColor || "#6366f1" }}>
          {activeChat.name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">{activeChat.name}</p>
          <p className="text-[10px] text-muted-foreground">{activeChat.memberCount || chatMembers.length} {t("com.members")}</p>
        </div>
        <Button size="sm" variant="ghost" className="rounded-xl gap-1 h-8 text-xs" onClick={() => setShowAddMember(p => !p)}><UserPlus className="w-3.5 h-3.5" /></Button>
      </div>
      {showAddMember && (
        <div className="flex gap-2 py-2 border-b border-border">
          <Input placeholder={t("com.addMember")} value={addMemberInput} onChange={e => setAddMemberInput(e.target.value)} onKeyDown={e => e.key === "Enter" && addMemberToChat()} className="rounded-xl flex-1 text-xs h-8" />
          <Button size="sm" className="rounded-xl h-8" onClick={addMemberToChat}><Check className="w-3.5 h-3.5" /></Button>
        </div>
      )}
      <div ref={gcContainerRef} onScroll={handleGcScroll} className="flex-1 overflow-y-auto py-3 space-y-3 min-h-0">
        {msgsLoading ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div> : messages.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-8">{t("com.noMessagesStart")}</p>
        ) : messages.map(msg => {
          const isMe = msg.senderId === myUser.id;
          return (
            <div key={msg.id} className={`flex items-end gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
              {!isMe && <Avatar className="w-7 h-7 border border-border shrink-0 mb-0.5"><AvatarImage src={msg.sender?.avatarUrl || robloxHeadshot(msg.sender?.robloxUserId || 0)} /><AvatarFallback className="text-[10px]">{msg.sender?.displayName?.charAt(0) || "?"}</AvatarFallback></Avatar>}
              <div className={`max-w-[70%] ${isMe ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                {!isMe && <p className="text-[10px] text-muted-foreground px-1">{msg.sender?.displayName}</p>}
                <div className={`rounded-2xl px-3 py-2 text-sm ${isMe ? "bg-black text-white rounded-br-sm" : "bg-secondary rounded-bl-sm"}`}>{msg.content}</div>
                <p className="text-[10px] text-muted-foreground px-1">{timeAgoShort(msg.createdAt)}</p>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
      <div className="flex gap-2 pt-3 border-t border-border">
        <Input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()} placeholder={t("com.messagePlaceholder")} className="rounded-xl flex-1" />
        <Button className="rounded-xl" onClick={sendMessage} disabled={sending || !text.trim()}>
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">{t("com.groupChats")}</h2>
        <Button size="sm" className="rounded-xl gap-1.5" onClick={() => setShowCreate(p => !p)}><Plus className="w-3.5 h-3.5" /> {t("com.createChat")}</Button>
      </div>

      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <Card className="rounded-2xl border-indigo-500/20 bg-indigo-500/5">
              <CardContent className="pt-4 space-y-3">
                <p className="text-sm font-semibold">{t("com.createGroupChat3")}</p>
                <Input placeholder={t("com.chatNamePlaceholder")} value={chatName} onChange={e => setChatName(e.target.value)} className="rounded-xl" />
                <div className="flex gap-2">
                  <Input placeholder={t("com.addMemberPlaceholder")} value={memberInput} onChange={e => setMemberInput(e.target.value)} onKeyDown={e => e.key === "Enter" && addPendingMember()} className="rounded-xl flex-1 text-sm" />
                  <Button variant="outline" className="rounded-xl" onClick={addPendingMember}><Plus className="w-4 h-4" /></Button>
                </div>
                {pendingMembers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {pendingMembers.map(m => (
                      <Badge key={m.id} variant="secondary" className="gap-1.5 text-xs">
                        {m.displayName}
                        <button onClick={() => setPendingMembers(p => p.filter(x => x.id !== m.id))}><X className="w-3 h-3" /></button>
                      </Badge>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">{t("com.minMembers")}</p>
                <div className="flex gap-2">
                  <Button className="flex-1 rounded-xl" onClick={createChat} disabled={creating || !chatName.trim() || pendingMembers.length < 2}>
                    {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {t("com.create")}
              </Button>
                  <Button variant="ghost" className="rounded-xl" onClick={() => setShowCreate(false)}><X className="w-4 h-4" /></Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-18 rounded-2xl" />) : chats.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-muted-foreground gap-2">
          <MessageSquare className="w-12 h-12 opacity-20" />
          <p className="text-sm">{t("com.noGroupChats")}</p>
          <p className="text-xs">{t("com.noGroupChatsHint")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {chats.map(chat => (
            <Card key={chat.id} className="rounded-2xl border-border/50 hover:border-black/20 transition-colors cursor-pointer" onClick={() => openChat(chat)}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0" style={{ background: chat.avatarColor || "#6366f1" }}>{chat.name.charAt(0)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm truncate">{chat.name}</p>
                    <Badge variant="outline" className="text-[9px] shrink-0">{chat.memberCount} {t("com.membersShort")}</Badge>
                  </div>
                  {chat.lastMessage && <p className="text-xs text-muted-foreground truncate mt-0.5">{chat.lastMessage.content}</p>}
                </div>
                {chat.lastMessage && <p className="text-[10px] text-muted-foreground shrink-0">{timeAgoShort(chat.lastMessage.createdAt)}</p>}
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── CollabTab ──────────────────────────────────────────────────────────────────
function CollabTab({ myUser }: { myUser: PlatformUser | null }) {
  const { toast } = useToast();
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [selectedWs, setSelectedWs] = useState<string>("");
  const [projects, setProjects] = useState<any[]>([]);
  const [activeProject, setActiveProject] = useState<any | null>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [projectTitle, setProjectTitle] = useState("");
  const [projectDesc, setProjectDesc] = useState("");
  const [showNewTask, setShowNewTask] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: "", description: "", priority: "medium" });
  const [savingTask, setSavingTask] = useState(false);
  const [wsMembers, setWsMembers] = useState<any[]>([]);

  const STATUSES = ["todo", "in_progress", "review", "done"] as const;
  const STATUS_LABELS: Record<string, string> = { todo: t("com.statusTodo"), in_progress: t("com.statusInProgress"), review: t("com.statusReview"), done: t("com.statusDone") };
  const PRIORITY_COLORS: Record<string, string> = { low: "border-gray-500/30 text-gray-500", medium: "border-blue-500/30 text-blue-600", high: "border-red-500/30 text-red-600" };

  useEffect(() => {
    if (!myUser) { setLoading(false); return; }
    apiFetch<{ workspaces: any[] }>("/api/community/workspaces")
      .then(({ workspaces: ws }) => { setWorkspaces(ws); if (ws.length) setSelectedWs(String(ws[0].id)); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [myUser]);

  useEffect(() => {
    if (!selectedWs) return;
    apiFetch<{ projects: any[] }>(`/api/community/workspaces/${selectedWs}/projects`)
      .then(({ projects: p }) => { setProjects(p); setActiveProject(null); setTasks([]); })
      .catch(() => {});
    apiFetch<{ members: any[] }>(`/api/community/workspaces/${selectedWs}/members`)
      .then(({ members: m }) => setWsMembers(m.filter(m => m.status === "active")))
      .catch(() => {});
  }, [selectedWs]);

  const activeProjectRef = useRef(activeProject);
  activeProjectRef.current = activeProject;
  const selectedWsRef = useRef(selectedWs);
  selectedWsRef.current = selectedWs;

  useEffect(() => {
    const iv = setInterval(async () => {
      const ws = selectedWsRef.current;
      const proj = activeProjectRef.current;
      if (ws) {
        try {
          const { projects: p } = await apiFetch<{ projects: any[] }>(`/api/community/workspaces/${ws}/projects`);
          setProjects(p);
        } catch {}
      }
      if (proj) {
        try {
          const { tasks: t } = await apiFetch<{ tasks: any[] }>(`/api/community/projects/${proj.id}/tasks`);
          setTasks(t);
        } catch {}
      }
    }, 10000);
    return () => clearInterval(iv);
  }, []);

  const openProject = async (project: any) => {
    setActiveProject(project); setTasksLoading(true); setTasks([]);
    try {
      const { tasks: t } = await apiFetch<{ tasks: any[] }>(`/api/community/projects/${project.id}/tasks`);
      setTasks(t);
    } catch {}
    finally { setTasksLoading(false); }
  };

  const createProject = async () => {
    if (!projectTitle.trim() || !selectedWs) return;
    try {
      const { project } = await apiFetch<{ project: any }>(`/api/community/workspaces/${selectedWs}/projects`, {
        method: "POST", body: JSON.stringify({ title: projectTitle.trim(), description: projectDesc }),
      });
      setProjects(p => [project, ...p]);
      setShowNewProject(false); setProjectTitle(""); setProjectDesc("");
      toast({ title: t("com.projectCreated") });
    } catch (e) { toast({ variant: "destructive", title: t("com.error"), description: e instanceof Error ? e.message : "" }); }
  };

  const createTask = async () => {
    if (!taskForm.title.trim() || !activeProject) return;
    setSavingTask(true);
    try {
      const { task } = await apiFetch<{ task: any }>(`/api/community/projects/${activeProject.id}/tasks`, {
        method: "POST", body: JSON.stringify({ title: taskForm.title.trim(), description: taskForm.description, priority: taskForm.priority }),
      });
      setTasks(p => [task, ...p]);
      setShowNewTask(false); setTaskForm({ title: "", description: "", priority: "medium" });
    } catch (e) { toast({ variant: "destructive", title: t("com.error"), description: e instanceof Error ? e.message : "" }); }
    finally { setSavingTask(false); }
  };

  const updateTaskStatus = async (taskId: number, status: string) => {
    try {
      await apiFetch(`/api/community/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ status }) });
      setTasks(p => p.map(t => t.id === taskId ? { ...t, status } : t));
    } catch {}
  };

  const assignTask = async (taskId: number, assignedToId: number | null) => {
    try {
      await apiFetch(`/api/community/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ assignedToId }) });
      const assignee = wsMembers.find(m => m.userId === assignedToId)?.user || null;
      setTasks(p => p.map(t => t.id === taskId ? { ...t, assignedToId, assignee } : t));
    } catch {}
  };

  if (!myUser) return <div className="text-center py-16 text-muted-foreground"><Columns className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>{t("com.needRegistration")}</p></div>;
  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (!workspaces.length) return <div className="text-center py-16 text-muted-foreground"><Columns className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="text-sm">{t("com.noWorkspaces")}</p><p className="text-xs">{t("com.createWsFirst")} "Teams"</p></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={selectedWs} onValueChange={setSelectedWs}>
          <SelectTrigger className="w-52 rounded-xl h-9"><SelectValue placeholder={t("com.selectWorkspace")} /></SelectTrigger>
          <SelectContent>{workspaces.map(ws => <SelectItem key={ws.id} value={String(ws.id)}>{ws.groupName}</SelectItem>)}</SelectContent>
        </Select>
        <Button size="sm" className="rounded-xl gap-1.5" onClick={() => setShowNewProject(p => !p)}><Plus className="w-3.5 h-3.5" /> {t("com.project")}</Button>
      </div>

      <AnimatePresence>
        {showNewProject && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <Card className="rounded-2xl border-green-500/20 bg-green-500/5">
              <CardContent className="pt-4 space-y-3">
                <Input placeholder={t("com.projectNamePlaceholder")} value={projectTitle} onChange={e => setProjectTitle(e.target.value)} className="rounded-xl" />
                <Textarea placeholder={t("com.projectDescPlaceholder")} value={projectDesc} onChange={e => setProjectDesc(e.target.value)} className="rounded-xl resize-none" rows={2} />
                <div className="flex gap-2">
                  <Button className="flex-1 rounded-xl" onClick={createProject}><Check className="w-4 h-4 mr-1.5" /> {t("com.create")}</Button>
                  <Button variant="ghost" className="rounded-xl" onClick={() => setShowNewProject(false)}><X className="w-4 h-4" /></Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {!activeProject ? (
        projects.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground"><ListTodo className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm">{t("com.noProjectsInWs")}</p></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {projects.map(p => (
              <Card key={p.id} className="rounded-2xl border-border/50 hover:border-black/20 cursor-pointer transition-colors" onClick={() => openProject(p)}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-semibold">{p.title}</p>
                    <Badge variant="outline" className={`text-[9px] ${p.status === "active" ? "border-green-500/30 text-green-600" : "border-border text-muted-foreground"}`}>{p.status}</Badge>
                  </div>
                  {p.description && <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>}
                  <p className="text-[10px] text-muted-foreground mt-2"><ChevronRight className="w-3 h-3 inline" /> {t("com.openTasks")}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="rounded-xl gap-1.5" onClick={() => setActiveProject(null)}><ArrowLeft className="w-4 h-4" /> {t("com.projectsTab")}</Button>
            <p className="font-semibold flex-1">{activeProject.title}</p>
            <Button size="sm" className="rounded-xl gap-1.5" onClick={() => setShowNewTask(p => !p)}><Plus className="w-3.5 h-3.5" /> {t("com.task")}</Button>
          </div>

          <AnimatePresence>
            {showNewTask && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <Card className="rounded-2xl border-blue-500/20 bg-blue-500/5">
                  <CardContent className="pt-4 space-y-2">
                    <Input placeholder={t("com.taskNamePlaceholder")} value={taskForm.title} onChange={e => setTaskForm(p => ({ ...p, title: e.target.value }))} className="rounded-xl" />
                    <Textarea placeholder={t("com.projectDescPlaceholder")} value={taskForm.description} onChange={e => setTaskForm(p => ({ ...p, description: e.target.value }))} className="rounded-xl resize-none" rows={2} />
                    <Select value={taskForm.priority} onValueChange={v => setTaskForm(p => ({ ...p, priority: v }))}>
                      <SelectTrigger className="rounded-xl h-9"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="low">{t("com.priorityLow")}</SelectItem><SelectItem value="medium">{t("com.priorityMed")}</SelectItem><SelectItem value="high">{t("com.priorityHigh")}</SelectItem></SelectContent>
                    </Select>
                    <div className="flex gap-2">
                      <Button className="flex-1 rounded-xl" onClick={createTask} disabled={savingTask || !taskForm.title}>{savingTask ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {t("com.create")}</Button>
                      <Button variant="ghost" className="rounded-xl" onClick={() => setShowNewTask(false)}><X className="w-4 h-4" /></Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {tasksLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {STATUSES.map(status => (
                <div key={status} className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">{STATUS_LABELS[status]} ({tasks.filter(t => t.status === status).length})</p>
                  {tasks.filter(t => t.status === status).map(task => (
                    <Card key={task.id} className="rounded-xl border-border/50 shadow-sm">
                      <CardContent className="p-3 space-y-2">
                        <p className="text-xs font-semibold leading-tight">{task.title}</p>
                        {task.description && <p className="text-[10px] text-muted-foreground line-clamp-2">{task.description}</p>}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant="outline" className={`text-[9px] ${PRIORITY_COLORS[task.priority] || ""}`}>{task.priority}</Badge>
                          {task.assignee && (
                            <div className="flex items-center gap-1">
                              <Avatar className="w-4 h-4"><AvatarImage src={task.assignee.avatarUrl || robloxHeadshot(task.assignee.robloxUserId || 0)} /><AvatarFallback className="text-[8px]">{task.assignee.displayName?.charAt(0)}</AvatarFallback></Avatar>
                              <span className="text-[9px] text-muted-foreground">{task.assignee.displayName}</span>
                            </div>
                          )}
                        </div>
                        <Select value={task.status} onValueChange={v => updateTaskStatus(task.id, v)}>
                          <SelectTrigger className="h-6 text-[10px] rounded-lg border-border/50"><SelectValue /></SelectTrigger>
                          <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s} className="text-xs">{STATUS_LABELS[s]}</SelectItem>)}</SelectContent>
                        </Select>
                      </CardContent>
                    </Card>
                  ))}
                  {tasks.filter(t => t.status === status).length === 0 && (
                    <div className="border-2 border-dashed border-border/30 rounded-xl p-3 text-center"><p className="text-[10px] text-muted-foreground/50">{t("com.empty")}</p></div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── ReputationTab ──────────────────────────────────────────────────────────────
const SKILLS_INFO_KEYS: Record<string, string> = {
  designer: "com.roleDesigner",
  developer: "com.roleDeveloper",
  manager: "com.roleManager",
  marketer: "com.roleMarketer",
  seller: "com.roleSeller",
  creative: "com.roleCreative",
  general: "com.skillGeneral",
};
const SKILLS_INFO_COLORS: Record<string, string> = {
  designer: "text-purple-600 bg-purple-500/10 border-purple-500/20",
  developer: "text-blue-600 bg-blue-500/10 border-blue-500/20",
  manager: "text-amber-600 bg-amber-500/10 border-amber-500/20",
  marketer: "text-rose-600 bg-rose-500/10 border-rose-500/20",
  seller: "text-green-600 bg-green-500/10 border-green-500/20",
  creative: "text-indigo-600 bg-indigo-500/10 border-indigo-500/20",
  general: "text-gray-600 bg-gray-500/10 border-gray-500/20",
};
const SKILLS_IDS = ["designer", "developer", "manager", "marketer", "seller", "creative", "general"];

function ReputationTab({ myUser }: { myUser: PlatformUser | null }) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [viewUser, setViewUser] = useState<any | null>(null);
  const [repData, setRepData] = useState<any | null>(null);
  const [repLoading, setRepLoading] = useState(false);
  const [endorseSkill, setEndorseSkill] = useState("");
  const [endorseMsg, setEndorseMsg] = useState("");
  const [endorsing, setEndorsing] = useState(false);

  const searchUsers = async () => {
    if (!searchQ.trim()) return;
    setSearching(true);
    try {
      const users = await apiFetch<any[]>(`/api/social/users/search?q=${encodeURIComponent(searchQ)}`).catch(() => []);
      setSearchResults(users as any[]);
    } catch {}
    finally { setSearching(false); }
  };

  const viewRep = async (user: any) => {
    setViewUser(user); setRepData(null); setRepLoading(true); setEndorseSkill(""); setEndorseMsg("");
    try {
      const data = await apiFetch<any>(`/api/community/reputation/${user.id}`);
      setRepData(data);
    } catch {}
    finally { setRepLoading(false); }
  };

  const endorse = async () => {
    if (!endorseSkill || !viewUser || endorsing) return;
    setEndorsing(true);
    try {
      await apiFetch("/api/community/reputation/endorse", {
        method: "POST", body: JSON.stringify({ toUserId: viewUser.id, skill: endorseSkill, message: endorseMsg }),
      });
      toast({ title: t("com.repBoosted") });
      viewRep(viewUser);
      setEndorseSkill(""); setEndorseMsg("");
    } catch (e) { toast({ variant: "destructive", title: t("com.error"), description: e instanceof Error ? e.message : "" }); }
    finally { setEndorsing(false); }
  };

  if (!myUser) return <div className="text-center py-16 text-muted-foreground"><Trophy className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>{t("com.needRegistration")}</p></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={searchQ} onChange={e => setSearchQ(e.target.value)} onKeyDown={e => e.key === "Enter" && searchUsers()} placeholder={t("com.findMemberPlaceholder")} className="pl-9 rounded-xl" />
        </div>
        <Button className="rounded-xl" onClick={searchUsers} disabled={searching}>{searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}</Button>
      </div>

      {searchResults.length > 0 && !viewUser && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {searchResults.map(u => (
            <Card key={u.id} className="rounded-2xl border-border/50 hover:border-black/20 cursor-pointer transition-colors" onClick={() => viewRep(u)}>
              <CardContent className="p-3 flex items-center gap-3">
                <Avatar className="w-10 h-10 border border-border"><AvatarImage src={u.avatarUrl || robloxHeadshot(u.robloxUserId)} /><AvatarFallback>{u.displayName?.charAt(0)}</AvatarFallback></Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{u.displayName}</p>
                  <p className="text-xs text-muted-foreground">@{u.robloxUsername}</p>
                </div>
                <Trophy className="w-4 h-4 text-amber-500" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {viewUser && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="rounded-xl gap-1.5" onClick={() => { setViewUser(null); setRepData(null); }}><ArrowLeft className="w-4 h-4" /> {t("com.back")}</Button>
          </div>
          <Card className="rounded-2xl border-border/50">
            <CardContent className="pt-4 flex items-center gap-4">
              <Avatar className="w-16 h-16 border-2 border-amber-500/20"><AvatarImage src={viewUser.avatarUrl || robloxHeadshot(viewUser.robloxUserId)} /><AvatarFallback className="text-xl">{viewUser.displayName?.charAt(0)}</AvatarFallback></Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-lg">{viewUser.displayName}</p>
                <p className="text-sm text-muted-foreground">@{viewUser.robloxUsername}</p>
                {viewUser.bio && <p className="text-xs text-muted-foreground/70 mt-1 line-clamp-2">{viewUser.bio}</p>}
              </div>
              <div className="text-center shrink-0">
                <p className="text-3xl font-bold text-amber-500">{repData?.total || 0}</p>
                <p className="text-xs text-muted-foreground">{t("com.endorsements")}</p>
              </div>
            </CardContent>
          </Card>

          {repLoading ? <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div> : repData && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {SKILLS_IDS.filter(sid => (repData.bySkill[sid] || 0) > 0).map(sid => (
                  <Card key={sid} className={`rounded-xl border ${SKILLS_INFO_COLORS[sid]}`}>
                    <CardContent className="p-3 text-center">
                      <p className="text-2xl font-bold">{repData.bySkill[sid]}</p>
                      <p className="text-xs font-medium mt-0.5">{t(SKILLS_INFO_KEYS[sid])}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
              {repData.endorsements.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("com.recentEndorsements")}</p>
                  {repData.endorsements.slice(0, 5).map((e: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 rounded-xl border border-border/50 p-3">
                      <Avatar className="w-8 h-8 border border-border shrink-0"><AvatarImage src={e.from?.avatarUrl || robloxHeadshot(e.from?.robloxUserId || 0)} /><AvatarFallback className="text-xs">{e.from?.displayName?.charAt(0)}</AvatarFallback></Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-semibold">{e.from?.displayName}</p>
                          <Badge className={`text-[9px] border ${SKILLS_INFO_COLORS[e.skill] || ""}`}>{SKILLS_INFO_KEYS[e.skill] ? t(SKILLS_INFO_KEYS[e.skill]) : e.skill}</Badge>
                        </div>
                        {e.message && <p className="text-xs text-muted-foreground mt-0.5">"{e.message}"</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {viewUser.id !== myUser?.id && (
            <Card className="rounded-2xl border-green-500/20 bg-green-500/5">
              <CardContent className="pt-4 space-y-3">
                <p className="text-sm font-semibold">{t("com.addEndorsement")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {SKILLS_IDS.map(sid => (
                    <button key={sid} onClick={() => setEndorseSkill(sid)}
                      className={`text-xs rounded-lg px-2.5 py-1.5 border transition-colors ${endorseSkill === sid ? "bg-black text-white border-black" : `border-border text-muted-foreground hover:border-border/80 ${SKILLS_INFO_COLORS[sid]}`}`}>
                      {t(SKILLS_INFO_KEYS[sid])}
                    </button>
                  ))}
                </div>
                <Input placeholder={t("com.commentPlaceholder")} value={endorseMsg} onChange={e => setEndorseMsg(e.target.value)} className="rounded-xl" />
                <Button className="w-full rounded-xl gap-2 bg-green-600 hover:bg-green-700" onClick={endorse} disabled={!endorseSkill || endorsing}>
                  {endorsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />} {t("com.confirmSkill")}
                </Button>
                <p className="text-[10px] text-center text-muted-foreground">{t("com.endorsementLimit")}</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {!viewUser && !searchResults.length && (
        <div className="flex flex-col items-center py-12 text-muted-foreground gap-2">
          <Trophy className="w-12 h-12 opacity-20" />
          <p className="text-sm">{t("com.repSystem")}</p>
          <p className="text-xs text-center">{t("com.repSystemHint")}</p>
          {myUser && (
            <Button size="sm" variant="outline" className="rounded-xl mt-2 gap-1.5" onClick={() => viewRep(myUser)}>
              <Trophy className="w-3.5 h-3.5" /> {t("com.myRep")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ── MarketplaceTab ─────────────────────────────────────────────────────────────
const CATEGORIES = ["template", "design", "shader", "avatar", "plugin", "asset", "script"];
const CATEGORY_LABEL_KEYS: Record<string, string> = {
  template: "com.catTemplate", design: "com.catDesign", shader: "com.catShader",
  avatar: "com.catAvatar", plugin: "com.catPlugin", asset: "com.catAsset", script: "com.catScript",
};

function MarketplaceTab({ myUser, onChatUser }: { myUser: PlatformUser | null; onChatUser: (user: PlatformUser) => void }) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("newest");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", category: "template", previewUrl: "", downloadUrl: "", tags: "" });
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  const loadListings = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (category !== "all") params.set("category", category);
      if (sort !== "newest") params.set("sort", sort);
      const { listings: l } = await apiFetch<{ listings: any[] }>(`/api/community/marketplace?${params}`);
      setListings(l);
    } catch {}
    finally { if (!silent) setLoading(false); }
  };

  useEffect(() => { loadListings(); }, [category, sort]);

  useEffect(() => {
    const iv = setInterval(() => loadListings(true), 20000);
    return () => clearInterval(iv);
  }, [category, sort]);

  const toggleLike = async (id: number) => {
    if (!myUser) return;
    try {
      const { liked } = await apiFetch<{ liked: boolean }>(`/api/community/marketplace/${id}/like`, { method: "POST" });
      setListings(p => p.map(l => l.id === id ? { ...l, isLiked: liked, likesCount: l.likesCount + (liked ? 1 : -1) } : l));
    } catch {}
  };

  const download = async (listing: any) => {
    try {
      const { downloadUrl } = await apiFetch<{ downloadUrl: string | null }>(`/api/community/marketplace/${listing.id}/download`, { method: "POST" });
      setListings(p => p.map(l => l.id === listing.id ? { ...l, downloadCount: l.downloadCount + 1 } : l));
      if (downloadUrl) { window.open(downloadUrl, "_blank"); }
      else { toast({ title: t("com.uploaded"), description: t("com.fileUploaded") }); }
    } catch {}
  };

  const createListing = async () => {
    if (!form.title || !form.description) return;
    setCreating(true);
    try {
      const tags = form.tags.split(",").map(t => t.trim()).filter(Boolean);
      const { listing } = await apiFetch<{ listing: any }>("/api/community/marketplace", {
        method: "POST",
        body: JSON.stringify({ ...form, price: 0, tags }),
      });
      setListings(p => [listing, ...p]);
      setShowCreate(false); setForm({ title: "", description: "", category: "template", previewUrl: "", downloadUrl: "", tags: "" });
      toast({ title: t("com.listingPublished") });
    } catch (e) { toast({ variant: "destructive", title: t("com.error"), description: e instanceof Error ? e.message : "" }); }
    finally { setCreating(false); }
  };

  const deleteListing = async (id: number) => {
    setDeleting(id);
    try {
      await apiFetch(`/api/community/marketplace/${id}`, { method: "DELETE" });
      setListings(p => p.filter(l => l.id !== id));
      toast({ title: t("com.listingDeleted") });
    } catch (e) { toast({ variant: "destructive", title: t("com.error"), description: e instanceof Error ? e.message : "" }); }
    finally { setDeleting(null); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1.5 flex-wrap flex-1">
          <button onClick={() => setCategory("all")} className={`text-xs rounded-lg px-2.5 py-1.5 border transition-colors ${category === "all" ? "bg-black text-white border-black" : "border-border text-muted-foreground hover:border-border/80"}`}>{t("com.filterAll")}</button>
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => setCategory(c)} className={`text-xs rounded-lg px-2.5 py-1.5 border transition-colors ${category === c ? "bg-black text-white border-black" : "border-border text-muted-foreground hover:border-border/80"}`}>{t(CATEGORY_LABEL_KEYS[c])}</button>
          ))}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-32 h-9 rounded-xl text-xs"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="newest">{t("com.filterNew")}</SelectItem><SelectItem value="popular">{t("com.filterPopular")}</SelectItem><SelectItem value="likes">{t("com.likes")}</SelectItem></SelectContent>
          </Select>
          {myUser && <Button size="sm" className="rounded-xl gap-1.5" onClick={() => setShowCreate(p => !p)}><Plus className="w-3.5 h-3.5" /> {t("com.sell")}</Button>}
        </div>
      </div>

      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <Card className="rounded-2xl border-indigo-500/20 bg-indigo-500/5">
              <CardContent className="pt-4 space-y-3">
                <p className="text-sm font-semibold">{t("com.publishToMarketplace")}</p>
                <div className="grid grid-cols-2 gap-3">
                  <Input placeholder={t("com.namePlaceholder")} value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} className="rounded-xl" />
                  <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{t(CATEGORY_LABEL_KEYS[c])}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <Textarea placeholder={t("com.projectDescPlaceholder")} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="rounded-xl resize-none" rows={3} />
                <div className="grid grid-cols-2 gap-3">
                  <Input placeholder={t("com.previewUrlPlaceholder")} value={form.previewUrl} onChange={e => setForm(p => ({ ...p, previewUrl: e.target.value }))} className="rounded-xl text-xs" />
                  <Input placeholder={t("com.downloadUrlPlaceholder")} value={form.downloadUrl} onChange={e => setForm(p => ({ ...p, downloadUrl: e.target.value }))} className="rounded-xl text-xs" />
                </div>
                <Input placeholder={t("com.tagsPlaceholder")} value={form.tags} onChange={e => setForm(p => ({ ...p, tags: e.target.value }))} className="rounded-xl text-xs" />
                <div className="flex gap-2">
                  <Button className="flex-1 rounded-xl" onClick={createListing} disabled={creating || !form.title || !form.description}>
                    {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />} {t("com.publish")}
                  </Button>
                  <Button variant="ghost" className="rounded-xl" onClick={() => setShowCreate(false)}><X className="w-4 h-4" /></Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}
        </div>
      ) : listings.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-muted-foreground gap-2">
          <Store className="w-12 h-12 opacity-20" />
          <p className="text-sm">{t("com.emptyMarketplace")}</p>
          <p className="text-xs">{t("com.beFirst")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {listings.map(item => {
            const tags = (() => { try { return JSON.parse(item.tagsJson || "[]") as string[]; } catch { return [] as string[]; } })();
            return (
              <Card key={item.id} className="rounded-2xl border-border/50 overflow-hidden flex flex-col">
                {item.previewUrl ? (
                  <div className="h-32 bg-secondary overflow-hidden">
                    <img src={item.previewUrl} alt={item.title} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  </div>
                ) : (
                  <div className="h-20 bg-gradient-to-br from-secondary to-background flex items-center justify-center">
                    <Package className="w-8 h-8 text-muted-foreground/30" />
                  </div>
                )}
                <CardContent className="p-3 flex-1 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm leading-tight">{item.title}</p>
                      <Badge variant="outline" className="text-[9px] mt-0.5">{CATEGORY_LABEL_KEYS[item.category] ? t(CATEGORY_LABEL_KEYS[item.category]) : item.category}</Badge>
                    </div>
                    {myUser && item.sellerId === myUser.id && (
                      <button
                        onClick={() => deleteListing(item.id)}
                        disabled={deleting === item.id}
                        className="text-muted-foreground hover:text-red-500 transition-colors shrink-0 p-1"
                        title={t("com.deleteListing")}
                      >
                        {deleting === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 flex-1">{item.description}</p>
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {tags.slice(0, 3).map((t: string) => <span key={t} className="text-[9px] rounded bg-secondary px-1.5 py-0.5 text-muted-foreground">#{t}</span>)}
                    </div>
                  )}
                  {myUser && item.seller && item.sellerId !== myUser.id && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-xl text-xs gap-1.5 w-full"
                      onClick={() => onChatUser(item.seller as PlatformUser)}
                    >
                      <MessageSquare className="w-3.5 h-3.5" /> {t("com.writeToSeller")}
                    </Button>
                  )}
                  <div className="flex items-center gap-2 pt-1 border-t border-border/50">
                    {item.seller && (
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <Avatar className="w-5 h-5 border border-border shrink-0"><AvatarImage src={item.seller.avatarUrl || robloxHeadshot(item.seller.robloxUserId || 0)} /><AvatarFallback className="text-[9px]">{item.seller.displayName?.charAt(0)}</AvatarFallback></Avatar>
                        <p className="text-[10px] text-muted-foreground truncate">{item.seller.displayName}</p>
                      </div>
                    )}
                    <div className="flex items-center gap-2 shrink-0">
                      <button className={`flex items-center gap-0.5 text-[10px] transition-colors ${item.isLiked ? "text-red-500" : "text-muted-foreground hover:text-red-400"}`} onClick={() => toggleLike(item.id)}>
                        <Heart className={`w-3.5 h-3.5 ${item.isLiked ? "fill-red-500" : ""}`} /> {item.likesCount}
                      </button>
                      <button className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-blue-500 transition-colors" onClick={() => download(item)}>
                        <Download className="w-3.5 h-3.5" /> {item.downloadCount}
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Community() {
  const { toast } = useToast();
  const { t } = useLanguage();
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
      toast({ title: t("profile.bio.saved") });
    } catch {
      toast({ variant: "destructive", title: t("assistant.error"), description: "Failed to save bio" });
    } finally { setSavingBio(false); }
  };

  if (registering) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p className="text-sm font-medium">{t("community.loading") || "Setting up your community profile..."}</p>
        </div>
      </div>
    );
  }

  const navItems = [
    { id: "feed", icon: Globe, label: t("community.feed") },
    { id: "chat", icon: MessageSquare, label: t("community.chat") },
    { id: "friends", icon: Users, label: t("community.friends") },
    { id: "discover", icon: Search, label: t("community.discover") },
    { id: "forum", icon: MessageCircleQuestion, label: t("community.forum") || "Forum" },
    { id: "marketplace", icon: Store, label: t("com.marketplace") },
    { id: "accessories", icon: Sparkles, label: t("acc.title") || "Accessories" },
  ];

  return (
    <div className="flex w-full max-w-[1200px] mx-auto min-h-[calc(100vh-80px)]">
      <div className="w-56 shrink-0 border-r border-border/50 py-4 pr-2 pl-4 flex flex-col gap-1">
        {myUser && (
          <button
            onClick={() => setEditingBio(true)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary/60 transition-colors mb-3"
          >
            <Avatar className="w-9 h-9 border border-border/50">
              <AvatarImage src={myUser.avatarUrl || robloxHeadshot(myUser.robloxUserId)} />
              <AvatarFallback className="text-sm font-bold">{myUser.displayName.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-semibold truncate leading-tight">{myUser.displayName}</p>
              <p className="text-[11px] text-muted-foreground truncate">@{myUser.robloxUsername}</p>
            </div>
          </button>
        )}

        <div className="h-px bg-border/50 mx-2 mb-1" />

        <nav role="tablist" aria-orientation="vertical" className="flex flex-col gap-1">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                role="tab"
                aria-selected={isActive}
                aria-controls={`panel-${item.id}`}
                onClick={() => handleTabChange(item.id)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all w-full text-left ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                }`}
              >
                <Icon className="w-[18px] h-[18px] shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {myUser && (
          <>
            <div className="h-px bg-border/50 mx-2 my-2" />
            <div className="px-3 mt-auto">
              {myUser.bio ? (
                <p className="text-[11px] text-muted-foreground/70 line-clamp-3 leading-relaxed">{myUser.bio}</p>
              ) : (
                <p className="text-[11px] text-muted-foreground/40 italic">{t("profile.bio.placeholder")}</p>
              )}
            </div>
          </>
        )}
      </div>

      <div className="flex-1 min-w-0 overflow-hidden">
        <div id={`panel-${activeTab}`} role="tabpanel" className="p-5 h-full overflow-y-auto">
          {activeTab === "feed" && <FeedTab myUser={myUser} onUserClick={setProfileModalUserId} />}
          {activeTab === "forum" && <ForumTab myUser={myUser} onUserClick={setProfileModalUserId} />}
          {activeTab === "discover" && <DiscoverTab myUser={myUser} onUserClick={setProfileModalUserId} onChat={handleChatUser} />}
          {activeTab === "friends" && <FriendsTab myUser={myUser} onChat={handleChatUser} onUserClick={setProfileModalUserId} />}
          {activeTab === "chat" && <ChatTab myUser={myUser} initialChatUser={chatInitUser} onClearInitial={() => setChatInitUser(null)} />}
          {activeTab === "marketplace" && <MarketplaceTab myUser={myUser} onChatUser={handleChatUser} />}
          {activeTab === "accessories" && <AccessoriesTab />}
        </div>
      </div>

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

      <AnimatePresence>
        {editingBio && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setEditingBio(false)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="bg-background rounded-2xl border border-border shadow-2xl w-full max-w-md p-6 space-y-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-lg">{t("community.editBio") || "Edit Bio"}</h3>
                <button onClick={() => setEditingBio(false)} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <Textarea
                value={bioText}
                onChange={e => setBioText(e.target.value)}
                placeholder={t("profile.bio.placeholder")}
                className="min-h-[120px] resize-none rounded-xl"
                maxLength={250}
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{bioText.length}/250</p>
                <Button onClick={handleSaveBio} disabled={savingBio} className="rounded-xl gap-2">
                  {savingBio ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {t("profile.bio.save")}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
