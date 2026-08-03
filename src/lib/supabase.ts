import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type Category = "announcement" | "update" | "discussion" | "event";
export type Role = "admin" | "member" | "follower";
export type ReactionEmoji = "like" | "love" | "care" | "wow";

export interface Profile {
  id: string;
  clerk_id: string;
  username: string;
  display_name: string;
  bio: string;
  role: Role;
  avatar_url: string | null;
  banned: boolean;
  banned_at: string | null;
  created_at: string;
}

export interface Post {
  id: string;
  author_id: string;
  category: Category;
  title: string;
  content: string;
  image_paths: string[];
  pinned: boolean;
  hidden: boolean;
  scope: "main" | "lobby";
  created_at: string;
}

export interface Comment {
  id: string;
  post_id: string;
  author_id: string;
  parent_id: string | null;
  content: string;
  hidden: boolean;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  author_id: string;
  content: string;
  reply_to_id: string | null;
  edited_at: string | null;
  created_at: string;
}

export interface ChatReaction {
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface ChatRestriction {
  user_id: string;
  muted_until: string | null;
  limit_per_min: number | null;
  reason: string;
  set_by: string | null;
  updated_at: string;
}

export interface Reaction {
  id: string;
  user_id: string;
  post_id: string | null;
  comment_id: string | null;
  emoji: ReactionEmoji;
  created_at: string;
}

export type ReactionMap = Record<ReactionEmoji, number>;

export interface SecurityEvent {
  id: string;
  type: string;
  severity: string;
  ip: string;
  user_agent: string;
  path: string;
  method: string;
  detail: string;
  user_id: string | null;
  created_at: string;
}

export interface BlockedIp {
  ip: string;
  reason: string;
  created_at: string;
}

export interface AppNotification {
  id: string;
  user_id: string;
  actor_id: string;
  type:
    | "post_reaction"
    | "comment_reaction"
    | "post_comment"
    | "comment_reply"
    | "follow"
    | "moderation";
  post_id: string | null;
  comment_id: string | null;
  detail: string;
  read_at: string | null;
  created_at: string;
}

export interface RosterMember {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export function emptyReactions(): ReactionMap {
  return { like: 0, love: 0, care: 0, wow: 0 };
}

let client: SupabaseClient | null = null;

export function getServerClient(): SupabaseClient | null {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

let browserClient: SupabaseClient | null = null;

export function getBrowserClient(): SupabaseClient | null {
  if (browserClient) return browserClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  browserClient = createClient(url, key);
  return browserClient;
}

export const CHAT_REALTIME_CHANNEL = "chat-room";
export const NOTIFICATIONS_REALTIME_CHANNEL = "notifications";

// Used from client components, so it must reference the NEXT_PUBLIC URL
// (server-only env vars are inlined as empty in the browser bundle).
export function imageUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!url) return path;
  return `${url}/storage/v1/object/public/qsc-images/${path}`;
}

export const REACTION_META: Record<ReactionEmoji, { label: string; icon: string }> = {
  like: { label: "Like", icon: "👍" },
  love: { label: "Love", icon: "❤️" },
  care: { label: "Care", icon: "🤗" },
  wow: { label: "Wow", icon: "😮" },
};

export const REACTION_EMOJIS: ReactionEmoji[] = ["like", "love", "care", "wow"];

export const CATEGORY_META: Record<Category, { label: string; color: string }> = {
  announcement: {
    label: "ANNOUNCEMENT",
    color: "text-glow border-glow/40 bg-glow/5",
  },
  update: {
    label: "UPDATE",
    color: "text-update border-update/40 bg-update/5",
  },
  discussion: {
    label: "DISCUSSION",
    color: "text-lobby border-lobby/40 bg-lobby/5",
  },
  event: {
    label: "EVENT",
    color: "text-amber border-amber/40 bg-amber/5",
  },
};

export const CATEGORIES: Category[] = [
  "announcement",
  "update",
  "discussion",
  "event",
];
