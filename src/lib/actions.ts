"use server";

import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { getServerClient, type AppNotification, type Category, type ChatRestriction, type ReactionEmoji, type Role, type RosterMember } from "./supabase";
import { ensureProfile } from "./auth";
import { logSecurityEvent } from "./security";
import { getFeedPage, type PostWithMeta } from "./data";

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 2048;
const IMAGE_QUALITY = 82;
const ALLOWED_MIME: Record<string, string[]> = {
  "image/jpeg": ["ffd8ff"],
  "image/png": ["89504e47"],
  "image/gif": ["47494638"],
  "image/webp": ["52494646"],
};

function validateImage(buf: Uint8Array, mime: string): boolean {
  const hex = Array.from(buf.slice(0, 12))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (mime === "image/webp") {
    return hex.startsWith("52494646") && hex.slice(16, 24) === "57454250";
  }
  const magics = ALLOWED_MIME[mime];
  if (!magics) return false;
  return magics.some((m) => hex.startsWith(m));
}

function extFor(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/gif") return "gif";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

async function compressImage(buf: Uint8Array, mime: string): Promise<{ data: Buffer; mime: string }> {
  const image = sharp(buf, { animated: mime === "image/gif", limitInputPixels: 40_000_000 });
  const meta = await image.metadata();

  let pipeline = image;
  const needsResize =
    typeof meta.width === "number" &&
    typeof meta.height === "number" &&
    Math.max(meta.width, meta.height) > MAX_IMAGE_DIMENSION;

  if (needsResize) {
    pipeline = image.resize({
      width: MAX_IMAGE_DIMENSION,
      height: MAX_IMAGE_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  let out: Buffer;
  if (mime === "image/gif") {
    out = await pipeline.jpeg({ quality: IMAGE_QUALITY, mozjpeg: true }).toBuffer();
  } else if (mime === "image/png") {
    out = await pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  } else if (mime === "image/webp") {
    out = await pipeline.webp({ quality: IMAGE_QUALITY }).toBuffer();
  } else {
    out = await pipeline.jpeg({ quality: IMAGE_QUALITY, mozjpeg: true }).toBuffer();
  }

  return { data: out, mime: mime === "image/gif" ? "image/jpeg" : mime };
}

type ActionResult = { ok?: boolean; error?: string; member?: RosterMember };

type RateKey = "post" | "lobby_post" | "comment" | "reaction" | "follow";

const RATE_LIMITS: Record<RateKey, { limit: number; windowMs: number }> = {
  post: { limit: 5, windowMs: 60 * 60 * 1000 },
  lobby_post: { limit: 3, windowMs: 2 * 60 * 60 * 1000 },
  comment: { limit: 30, windowMs: 60 * 60 * 1000 },
  reaction: { limit: 60, windowMs: 60 * 60 * 1000 },
  follow: { limit: 30, windowMs: 60 * 60 * 1000 },
};

async function checkRate(
  sb: NonNullable<ReturnType<typeof getServerClient>>,
  profileId: string,
  key: RateKey
): Promise<string | null> {
  const { limit, windowMs } = RATE_LIMITS[key];
  const since = new Date(Date.now() - windowMs).toISOString();
  const table =
    key === "post" || key === "lobby_post"
      ? "posts"
      : key === "comment"
        ? "comments"
        : key === "reaction"
          ? "reactions"
          : "follows";
  const col =
    key === "post" || key === "lobby_post"
      ? "author_id"
      : key === "comment"
        ? "author_id"
        : key === "reaction"
          ? "user_id"
          : "follower_id";
  const { count } = await sb
    .from(table as "posts")
    .select("id", { count: "exact", head: true })
    .eq(col as never, profileId)
    .gte("created_at", since);
  if ((count ?? 0) >= limit) {
    await logSecurityEvent({
      type: "rate_limit",
      severity: "warn",
      userId: profileId,
      detail: `Rate limit exceeded for ${key} (${count}/${limit})`,
    });
    return "Too many requests. Please slow down.";
  }
  return null;
}

async function bannedError(profile: { banned: boolean }): Promise<string | null> {
  if (!profile.banned) return null;
  await logSecurityEvent({ type: "banned_attempt", severity: "info", userId: (profile as { id?: string }).id });
  return "Your account has been banned.";
}

// Escape LIKE metacharacters so user input can't inject wildcards, and strip
// characters that would break PostgREST's `or`/`ilike` filter grammar
// (comma, dot, parens, negation).
function escapeSearchTerm(raw: string): string {
  return raw
    .replace(/[\\%_]/g, (m) => `\\${m}`)
    .replace(/[,.()!]/g, " ");
}

export interface PostSearchResult {
  id: string;
  title: string;
  scope: "main" | "lobby";
  authorName: string;
}

export async function loadMorePosts(
  scope: "main" | "lobby",
  cursor: { createdAt: string; id: string }
): Promise<{ items: PostWithMeta[]; nextCursor: { createdAt: string; id: string } | null }> {
  const profile = await ensureProfile();
  const res = await getFeedPage(scope, profile?.id ?? null, cursor);
  return { items: res.items, nextCursor: res.nextCursor };
}

export async function searchPosts(q: string): Promise<PostSearchResult[]> {
  const sb = getServerClient();
  const query = escapeSearchTerm(q.trim().slice(0, 80));
  if (!sb || !query) return [];
  const { data } = await sb
    .from("posts")
    .select("id, title, scope, author_id, hidden")
    .eq("hidden", false)
    .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
    .order("created_at", { ascending: false })
    .limit(8);
  const posts = (data ?? []) as { id: string; title: string; scope: "main" | "lobby"; author_id: string }[];
  if (!posts.length) return [];
  const authorIds = [...new Set(posts.map((p) => p.author_id))];
  const { data: authors } = await sb
    .from("profiles")
    .select("id, display_name, username")
    .in("id", authorIds);
  const amap = new Map((authors ?? []).map((a) => [a.id, a]));
  return posts.map((p) => ({
    id: p.id,
    title: p.title || "(untitled)",
    scope: p.scope,
    authorName:
      (amap.get(p.author_id)?.display_name as string) ||
      (amap.get(p.author_id)?.username as string) ||
      "unknown",
  }));
}

export interface ReactionUser {
  emoji: ReactionEmoji;
  name: string;
  username: string;
  avatar_url: string | null;
}

export async function getReactionUsers(
  target: { postId?: string | null; commentId?: string | null }
): Promise<ReactionUser[]> {
  const sb = getServerClient();
  if (!sb) return [];
  let q = sb.from("reactions").select("emoji, user_id");
  if (target.postId) q = q.eq("post_id", target.postId);
  else if (target.commentId) q = q.eq("comment_id", target.commentId);
  else return [];
  const { data } = await q.limit(200);
  const reactions = (data ?? []) as { emoji: ReactionEmoji; user_id: string }[];
  if (!reactions.length) return [];
  const userIds = [...new Set(reactions.map((r) => r.user_id))];
  const { data: profiles } = await sb
    .from("profiles")
    .select("id, display_name, username, avatar_url")
    .in("id", userIds);
  const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));
  return reactions.map((r) => {
    const p = pmap.get(r.user_id) as { display_name?: string; username?: string; avatar_url?: string | null } | undefined;
    return {
      emoji: r.emoji,
      name: p?.display_name || p?.username || "?",
      username: p?.username ?? "?",
      avatar_url: p?.avatar_url ?? null,
    };
  });
}

export async function createPost(formData: FormData): Promise<ActionResult> {
  const profile = await ensureProfile();
  if (!profile) return { error: "You must be signed in." };
  const banErr = await bannedError(profile);
  if (banErr) return { error: banErr };
  const sb = getServerClient();
  if (!sb) return { error: "Database is not configured yet." };

  const scopeRaw = String(formData.get("scope") ?? "main");
  const scope: "main" | "lobby" = scopeRaw === "lobby" ? "lobby" : "main";
  const canMain =
    profile.role === "admin" || profile.role === "member";
  if (scope === "main" && !canMain) {
    return { error: "Only org members can create main feed posts." };
  }

  const rateErr = await checkRate(sb, profile.id, scope === "lobby" ? "lobby_post" : "post");
  if (rateErr) return { error: rateErr };

  const title = String(formData.get("title") ?? "").trim().slice(0, 120);
  const content = String(formData.get("content") ?? "").trim();
  const category = String(formData.get("category") ?? "announcement") as Category;
  const validCats: Category[] = ["announcement", "update", "discussion", "event"];
  if (!validCats.includes(category)) {
    await logSecurityEvent({
      type: "tamper",
      severity: "warn",
      userId: profile.id,
      detail: `Invalid post category attempted: ${String(category).slice(0, 100)}`,
    });
    return { error: "Invalid category." };
  }
  if (!title && !content) return { error: "Post cannot be empty." };
  if (content.length > 5000) {
    await logSecurityEvent({
      type: "tamper",
      severity: "warn",
      userId: profile.id,
      detail: `Post content too long: ${content.length} chars`,
    });
    return { error: "Post is too long." };
  }

  const maxImages = scope === "lobby" ? 1 : 12;
  const files = (formData.getAll("images") as FormDataEntryValue[]).filter(
    (f): f is File => f instanceof File && f.size > 0
  );
  if (files.length > maxImages) {
    await logSecurityEvent({
      type: "tamper",
      severity: "warn",
      userId: profile.id,
      detail: `Image count exceeded: ${files.length} files for ${scope} post (max ${maxImages})`,
    });
    return { error: `Maximum ${maxImages} image${maxImages === 1 ? "" : "s"} per post.` };
  }

  const paths: string[] = [];
  for (const file of files) {
    if (file.size > MAX_IMAGE_SIZE) {
      await logSecurityEvent({
        type: "tamper",
        severity: "warn",
        userId: profile.id,
        detail: `Oversized image upload: ${file.size} bytes (max ${MAX_IMAGE_SIZE}), type=${file.type}, name=${String(file.name).slice(0, 100)}`,
      });
      return { error: "Each image must be under 10MB." };
    }
    const buf = new Uint8Array(await file.arrayBuffer());
    if (!validateImage(buf, file.type)) {
      await logSecurityEvent({
        type: "tamper",
        severity: "warn",
        userId: profile.id,
        detail: `Suspicious image upload rejected: claimed type=${file.type}, name=${String(file.name).slice(0, 100)}, size=${file.size}`,
      });
      return { error: "Only JPG, PNG, GIF, or WEBP images are allowed." };
    }
    let uploadBuf: Uint8Array;
    let uploadMime: string;
    try {
      const compressed = await compressImage(buf, file.type);
      uploadBuf = new Uint8Array(compressed.data);
      uploadMime = compressed.mime;
    } catch {
      await logSecurityEvent({
        type: "tamper",
        severity: "critical",
        userId: profile.id,
        detail: `Malformed image failed to process (possible decompression-bomb or polyglot): type=${file.type}, name=${String(file.name).slice(0, 100)}, size=${file.size}`,
      });
      return { error: "Image could not be validated. Try a different file." };
    }
    const path = `posts/${crypto.randomUUID()}.${extFor(uploadMime)}`;
    const { error: upErr } = await sb.storage
      .from("qsc-images")
      .upload(path, uploadBuf, { contentType: uploadMime, upsert: false });
    if (upErr) {
      await logSecurityEvent({
        type: "manual",
        severity: "warn",
        userId: profile.id,
        detail: `Image upload to storage failed: ${upErr.message}`,
      });
      for (const p of paths) await sb.storage.from("qsc-images").remove([p]);
      return { error: "Image upload failed: " + upErr.message };
    }
    paths.push(path);
  }

  const { error } = await sb.from("posts").insert({
    author_id: profile.id,
    title,
    content,
    category,
    image_paths: paths,
    scope,
  });
  if (error) return { error: "Failed to save post." };
  revalidatePath("/");
  revalidatePath("/lobby");
  revalidatePath("/root_qsg");
  return { ok: true };
}

export async function addComment(formData: FormData): Promise<ActionResult> {
  const profile = await ensureProfile();
  if (!profile) return { error: "You must be signed in." };
  const banErr = await bannedError(profile);
  if (banErr) return { error: banErr };
  const sb = getServerClient();
  if (!sb) return { error: "Database is not configured yet." };
  const rateErr = await checkRate(sb, profile.id, "comment");
  if (rateErr) return { error: rateErr };

  const postId = String(formData.get("post_id") ?? "");
  const parentIdRaw = formData.get("parent_id");
  const parentId = parentIdRaw ? String(parentIdRaw) : null;
  const content = String(formData.get("content") ?? "").trim();
  if (!postId) return { error: "Missing post." };
  if (!content) return { error: "Comment cannot be empty." };
  if (content.length > 2000) return { error: "Comment is too long." };

  const { data: post } = await sb
    .from("posts")
    .select("id, hidden, author_id")
    .eq("id", postId)
    .single();
  if (!post || post.hidden) return { error: "Post not found." };

  if (parentId) {
    const { data: parent } = await sb
      .from("comments")
      .select("id, author_id")
      .eq("id", parentId)
      .eq("post_id", postId)
      .maybeSingle();
    if (!parent) return { error: "Reply target not found." };

    const { error } = await sb.from("comments").insert({
      post_id: postId,
      author_id: profile.id,
      parent_id: parentId,
      content,
    });
    if (error) return { error: "Failed to add comment." };

    // Reply → notify the parent comment's author (skip self).
    if (parent.author_id !== profile.id) {
      await createNotification(sb, {
        actorId: profile.id,
        type: "comment_reply",
        userId: parent.author_id,
        postId,
        commentId: parentId,
        detail: content.slice(0, 300),
      });
    }
  } else {
    const { error } = await sb.from("comments").insert({
      post_id: postId,
      author_id: profile.id,
      parent_id: parentId,
      content,
    });
    if (error) return { error: "Failed to add comment." };

    // Top-level comment → notify the post author (skip self).
    if (post.author_id !== profile.id) {
      await createNotification(sb, {
        actorId: profile.id,
        type: "post_comment",
        userId: post.author_id,
        postId,
        detail: content.slice(0, 300),
      });
    }
  }
  revalidatePath(`/post/${postId}`);
  revalidatePath("/");
  return { ok: true };
}

export async function toggleReaction(formData: FormData): Promise<ActionResult> {
  const profile = await ensureProfile();
  if (!profile) return { error: "You must be signed in." };
  const banErr = await bannedError(profile);
  if (banErr) return { error: banErr };
  const sb = getServerClient();
  if (!sb) return { error: "Database is not configured yet." };
  const rateErr = await checkRate(sb, profile.id, "reaction");
  if (rateErr) return { error: rateErr };

  const postIdRaw = formData.get("post_id");
  const commentIdRaw = formData.get("comment_id");
  const postId = postIdRaw ? String(postIdRaw) : null;
  const commentId = commentIdRaw ? String(commentIdRaw) : null;
  const emoji = String(formData.get("emoji") ?? "") as ReactionEmoji;
  if (!postId && !commentId) return { error: "Missing target." };
  if (!["like", "love", "care", "wow"].includes(emoji)) {
    await logSecurityEvent({ type: "tamper", severity: "info", userId: profile.id, detail: "Invalid reaction emoji while toggling reaction" });
    return { error: "Invalid reaction." };
  }

  const q = sb
    .from("reactions")
    .select("id, emoji")
    .eq("user_id", profile.id);
  if (postId) q.eq("post_id", postId);
  else q.eq("comment_id", commentId);
  const { data: existing } = await q.maybeSingle();

  if (existing) {
    if (existing.emoji === emoji) {
      await sb.from("reactions").delete().eq("id", existing.id);
    } else {
      await sb.from("reactions").update({ emoji }).eq("id", existing.id);
    }
  } else {
    const { error: insErr } = await sb.from("reactions").insert({
      user_id: profile.id,
      post_id: postId,
      comment_id: commentId,
      emoji,
    });
    if (insErr && insErr.code !== "23505") {
      return { error: "Failed to save reaction." };
    }
    // New reaction → notify the target's author (skip self).
    if (postId) {
      const { data: post } = await sb
        .from("posts")
        .select("author_id")
        .eq("id", postId)
        .maybeSingle();
      if (post && post.author_id !== profile.id) {
        await createNotification(sb, {
          actorId: profile.id,
          type: "post_reaction",
          userId: post.author_id,
          postId,
          detail: emoji,
        });
      }
    } else if (commentId) {
      const { data: comment } = await sb
        .from("comments")
        .select("author_id, post_id")
        .eq("id", commentId)
        .maybeSingle();
      if (comment && comment.author_id !== profile.id) {
        await createNotification(sb, {
          actorId: profile.id,
          type: "comment_reaction",
          userId: comment.author_id,
          postId: comment.post_id,
          commentId,
          detail: emoji,
        });
      }
    }
  }

  if (postId) {
    revalidatePath(`/post/${postId}`);
    revalidatePath("/");
  } else if (commentId) {
    const { data: c } = await sb
      .from("comments")
      .select("post_id")
      .eq("id", commentId)
      .maybeSingle();
    if (c) revalidatePath(`/post/${c.post_id}`);
  }
  return { ok: true };
}

export async function toggleFollow(formData: FormData): Promise<ActionResult> {
  const profile = await ensureProfile();
  if (!profile) return { error: "You must be signed in." };
  const banErr = await bannedError(profile);
  if (banErr) return { error: banErr };
  const sb = getServerClient();
  if (!sb) return { error: "Database is not configured yet." };
  const rateErr = await checkRate(sb, profile.id, "follow");
  if (rateErr) return { error: rateErr };

  const username = String(formData.get("username") ?? "");
  const { data: target } = await sb
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (!target) return { error: "Profile not found." };
  if (target.id === profile.id) return { error: "You cannot follow yourself." };

  const { data: existing } = await sb
    .from("follows")
    .select("follower_id")
    .eq("follower_id", profile.id)
    .eq("following_id", target.id)
    .maybeSingle();

  if (existing) {
    await sb
      .from("follows")
      .delete()
      .eq("follower_id", profile.id)
      .eq("following_id", target.id);
  } else {
    await sb
      .from("follows")
      .insert({ follower_id: profile.id, following_id: target.id });
    // New follow → notify the followed user.
    await createNotification(sb, {
      actorId: profile.id,
      type: "follow",
      userId: target.id,
    });
  }
  revalidatePath(`/profile/${username}`);
  return { ok: true };
}

export async function updateProfile(formData: FormData): Promise<ActionResult> {
  const profile = await ensureProfile();
  if (!profile) return { error: "You must be signed in." };
  const banErr = await bannedError(profile);
  if (banErr) return { error: banErr };
  const sb = getServerClient();
  if (!sb) return { error: "Database is not configured yet." };

  const displayName = String(formData.get("display_name") ?? "").trim().slice(0, 50);
  const bio = String(formData.get("bio") ?? "").trim().slice(0, 300);
  const username = String(formData.get("username") ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 20);
  if (!username) return { error: "Username cannot be empty." };

  const { error } = await sb
    .from("profiles")
    .update({ display_name: displayName, bio, username })
    .eq("id", profile.id);
  if (error) {
    return { error: "Failed to update profile. Username may already be taken." };
  }
  revalidatePath(`/profile/${username}`);
  revalidatePath(`/profile/${profile.username}`);
  revalidatePath("/");
  return { ok: true };
}

export async function adminSetPost(formData: FormData): Promise<ActionResult> {
  const profile = await ensureProfile();
  if (!profile || profile.role !== "admin") {
    await logSecurityEvent({ type: "unauthorized", severity: "warn", userId: profile?.id, detail: "Non-admin attempted adminSetPost" });
    return { error: "Unauthorized." };
  }
  const sb = getServerClient();
  if (!sb) return { error: "Database is not configured yet." };

  const id = String(formData.get("id") ?? "");
  const action = String(formData.get("action") ?? "");
  if (!id) return { error: "Missing post id." };

  if (action === "pin" || action === "unpin") {
    const { error } = await sb
      .from("posts")
      .update({ pinned: action === "pin" })
      .eq("id", id);
    if (error) return { error: "Failed to update post." };
  } else if (action === "hide" || action === "unhide") {
    const { data: post } = await sb
      .from("posts")
      .select("author_id")
      .eq("id", id)
      .maybeSingle();
    if (!post) return { error: "Post not found." };
    const { error } = await sb
      .from("posts")
      .update({ hidden: action === "hide" })
      .eq("id", id);
    if (error) return { error: "Failed to update post." };
    if (action === "hide" && post.author_id !== profile.id) {
      await createNotification(sb, {
        actorId: profile.id,
        type: "moderation",
        userId: post.author_id,
        postId: id,
        detail: "post_hidden",
      });
    }
  } else if (action === "delete") {
    const { data: post } = await sb
      .from("posts")
      .select("image_paths")
      .eq("id", id)
      .single();
    if (post?.image_paths?.length) {
      await sb.storage.from("qsc-images").remove(post.image_paths);
    }
    const { error } = await sb.from("posts").delete().eq("id", id);
    if (error) return { error: "Failed to delete post." };
  } else {
    return { error: "Unknown action." };
  }
  revalidatePath("/");
  revalidatePath("/lobby");
  revalidatePath("/post");
  revalidatePath("/root_qsg");
  return { ok: true };
}

export async function adminSetComment(formData: FormData): Promise<ActionResult> {
  const profile = await ensureProfile();
  if (!profile || profile.role !== "admin") {
    await logSecurityEvent({ type: "unauthorized", severity: "warn", userId: profile?.id, detail: "Non-admin attempted adminSetComment" });
    return { error: "Unauthorized." };
  }
  const sb = getServerClient();
  if (!sb) return { error: "Database is not configured yet." };

  const id = String(formData.get("id") ?? "");
  const action = String(formData.get("action") ?? "");
  if (!id) return { error: "Missing comment id." };

  if (action === "hide") {
    const { data: comment } = await sb
      .from("comments")
      .select("author_id, post_id")
      .eq("id", id)
      .maybeSingle();
    const { error } = await sb.from("comments").update({ hidden: true }).eq("id", id);
    if (error) return { error: "Failed to hide comment." };
    if (comment && comment.author_id !== profile.id) {
      await createNotification(sb, {
        actorId: profile.id,
        type: "moderation",
        userId: comment.author_id,
        postId: comment.post_id,
        commentId: id,
        detail: "comment_hidden",
      });
    }
  } else if (action === "unhide") {
    const { error } = await sb.from("comments").update({ hidden: false }).eq("id", id);
    if (error) return { error: "Failed to restore comment." };
  } else if (action === "delete") {
    const { error } = await sb.from("comments").delete().eq("id", id);
    if (error) return { error: "Failed to delete comment." };
  }
  revalidatePath("/root_qsg");
  revalidatePath("/post");
  return { ok: true };
}

export async function adminSetRole(formData: FormData): Promise<ActionResult> {
  const profile = await ensureProfile();
  if (!profile || profile.role !== "admin") {
    await logSecurityEvent({ type: "unauthorized", severity: "warn", userId: profile?.id, detail: "Non-admin attempted adminSetRole" });
    return { error: "Unauthorized." };
  }
  const sb = getServerClient();
  if (!sb) return { error: "Database is not configured yet." };

  const id = String(formData.get("id") ?? "");
  const role = String(formData.get("role") ?? "") as Role;
  if (!["admin", "member", "follower"].includes(role)) {
    await logSecurityEvent({ type: "tamper", severity: "info", userId: profile.id, detail: "Invalid role value: " + role });
    return { error: "Invalid role." };
  }

  const { data: target } = await sb
    .from("profiles")
    .select("id, role")
    .eq("id", id)
    .maybeSingle();
  if (!target) return { error: "User not found." };
  if (target.id === profile.id) return { error: "You cannot change your own role." };

  if (target.role === "admin" && role !== "admin") {
    // Never demote the last admin — that would leave the org without moderation.
    const { count } = await sb
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if ((count ?? 0) <= 1) {
      return { error: "Cannot demote the last admin." };
    }
  }

  const { error } = await sb.from("profiles").update({ role }).eq("id", id);
  if (error) {
    await logSecurityEvent({
      type: "manual",
      severity: "warn",
      userId: profile.id,
      detail: `adminSetRole update failed: ${error.message}`,
    });
    return { error: "Failed to update role." };
  }
  await logSecurityEvent({
    type: "manual",
    severity: "info",
    userId: profile.id,
    detail: `Changed role of ${id} to ${role}`,
  });
  revalidatePath("/root_qsg");
  return { ok: true };
}

export async function adminSetBan(formData: FormData): Promise<ActionResult> {
  const profile = await ensureProfile();
  if (!profile || profile.role !== "admin") {
    await logSecurityEvent({ type: "unauthorized", severity: "warn", userId: profile?.id, detail: "Non-admin attempted adminSetBan" });
    return { error: "Unauthorized." };
  }
  const sb = getServerClient();
  if (!sb) return { error: "Database is not configured yet." };

  const id = String(formData.get("id") ?? "");
  const banned = formData.get("banned") === "1";
  if (!id) return { error: "Missing user id." };

  const { data: target } = await sb
    .from("profiles")
    .select("id, role, banned")
    .eq("id", id)
    .maybeSingle();
  if (!target) return { error: "User not found." };
  if (target.role === "admin") return { error: "Cannot ban another admin." };
  if (target.id === profile.id) return { error: "You cannot ban yourself." };

  const { error } = await sb
    .from("profiles")
    .update({ banned, banned_at: banned ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) return { error: "Failed to update user." };
  await createNotification(sb, {
    actorId: profile.id,
    type: "moderation",
    userId: target.id,
    detail: banned ? "banned" : "unbanned",
  });
  await logSecurityEvent({
    type: "manual",
    severity: banned ? "critical" : "info",
    userId: profile.id,
    detail: `${banned ? "Banned" : "Unbanned"} user ${id}`,
  });
  revalidatePath("/root_qsg");
  revalidatePath("/");
  return { ok: true };
}

export async function adminBlockIp(formData: FormData): Promise<ActionResult> {
  const profile = await ensureProfile();
  if (!profile || profile.role !== "admin") {
    await logSecurityEvent({ type: "unauthorized", severity: "warn", userId: profile?.id, detail: "Non-admin attempted adminBlockIp" });
    return { error: "Unauthorized." };
  }
  const sb = getServerClient();
  if (!sb) return { error: "Database is not configured yet." };

  const ip = String(formData.get("ip") ?? "").trim().slice(0, 45);
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 200);
  if (!ip) return { error: "Missing IP." };
  if (isLoopbackIp(ip)) return { error: "Cannot block a loopback IP." };

  const { error } = await sb.from("blocked_ips").upsert({ ip, reason }, { onConflict: "ip" });
  if (error) return { error: "Failed to block IP." };
  await logSecurityEvent({
    type: "blocked_ip",
    severity: "critical",
    ip,
    userId: profile.id,
    detail: `Admin blocked IP ${ip}${reason ? " — " + reason : ""}`,
  });
  revalidatePath("/root_qsg");
  return { ok: true };
}

export async function adminUnblockIp(formData: FormData): Promise<ActionResult> {
  const profile = await ensureProfile();
  if (!profile || profile.role !== "admin") {
    await logSecurityEvent({ type: "unauthorized", severity: "warn", userId: profile?.id, detail: "Non-admin attempted adminUnblockIp" });
    return { error: "Unauthorized." };
  }
  const sb = getServerClient();
  if (!sb) return { error: "Database is not configured yet." };

  const ip = String(formData.get("ip") ?? "").trim();
  if (!ip) return { error: "Missing IP." };

  await sb.from("blocked_ips").delete().eq("ip", ip);
  revalidatePath("/root_qsg");
  return { ok: true };
}

export async function adminClearEvents(): Promise<ActionResult> {
  const profile = await ensureProfile();
  if (!profile || profile.role !== "admin") {
    await logSecurityEvent({ type: "unauthorized", severity: "warn", userId: profile?.id, detail: "Non-admin attempted adminClearEvents" });
    return { error: "Unauthorized." };
  }
  const sb = getServerClient();
  if (!sb) return { error: "Database is not configured yet." };
  await sb.from("security_events").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  revalidatePath("/root_qsg");
  return { ok: true };
}

// ---- Roster (members.txt) CRUD ---------------------------------

function sanitizeRosterName(raw: string): string {
  return raw.trim().slice(0, 40);
}

function isLoopbackIp(ip: string): boolean {
  return ip === "::1" || ip === "::" || ip === "127.0.0.1" || ip.startsWith("127.");
}

export async function adminAddRosterMember(formData: FormData): Promise<ActionResult> {
  const profile = await ensureProfile();
  if (!profile || profile.role !== "admin") {
    await logSecurityEvent({ type: "unauthorized", severity: "warn", userId: profile?.id, detail: "Non-admin attempted adminAddRosterMember" });
    return { error: "Unauthorized." };
  }
  const sb = getServerClient();
  if (!sb) return { error: "Database is not configured yet." };

  const name = sanitizeRosterName(String(formData.get("name") ?? ""));
  if (!name) return { error: "Name cannot be empty." };

  const { data: maxRow } = await sb
    .from("roster_members")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((maxRow?.sort_order as number) ?? 0) + 1;

  const { data: created, error } = await sb
    .from("roster_members")
    .insert({ name, sort_order: nextOrder })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") return { error: "That name is already on the roster." };
    await logSecurityEvent({ type: "manual", severity: "warn", userId: profile.id, detail: `adminAddRosterMember failed: ${error.message}` });
    return { error: "Failed to add member." };
  }
  await logSecurityEvent({ type: "manual", severity: "info", userId: profile.id, detail: `Added roster member: ${name}` });
  revalidatePath("/root_qsg");
  revalidatePath("/");
  revalidatePath("/lobby");
  return { ok: true, member: created as RosterMember };
}

export async function adminUpdateRosterMember(formData: FormData): Promise<ActionResult> {
  const profile = await ensureProfile();
  if (!profile || profile.role !== "admin") {
    await logSecurityEvent({ type: "unauthorized", severity: "warn", userId: profile?.id, detail: "Non-admin attempted adminUpdateRosterMember" });
    return { error: "Unauthorized." };
  }
  const sb = getServerClient();
  if (!sb) return { error: "Database is not configured yet." };

  const id = String(formData.get("id") ?? "");
  const name = sanitizeRosterName(String(formData.get("name") ?? ""));
  if (!name) return { error: "Name cannot be empty." };

  const { error } = await sb
    .from("roster_members")
    .update({ name })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "That name is already on the roster." };
    await logSecurityEvent({ type: "manual", severity: "warn", userId: profile.id, detail: `adminUpdateRosterMember failed: ${error.message}` });
    return { error: "Failed to update member." };
  }
  revalidatePath("/root_qsg");
  revalidatePath("/");
  revalidatePath("/lobby");
  return { ok: true };
}

export async function adminDeleteRosterMember(formData: FormData): Promise<ActionResult> {
  const profile = await ensureProfile();
  if (!profile || profile.role !== "admin") {
    await logSecurityEvent({ type: "unauthorized", severity: "warn", userId: profile?.id, detail: "Non-admin attempted adminDeleteRosterMember" });
    return { error: "Unauthorized." };
  }
  const sb = getServerClient();
  if (!sb) return { error: "Database is not configured yet." };

  const id = String(formData.get("id") ?? "");
  await sb.from("roster_members").delete().eq("id", id);
  await logSecurityEvent({ type: "manual", severity: "info", userId: profile.id, detail: `Deleted roster member id=${id}` });
  revalidatePath("/root_qsg");
  revalidatePath("/");
  revalidatePath("/lobby");
  return { ok: true };
}

export async function adminReorderRosterMember(formData: FormData): Promise<ActionResult> {
  const profile = await ensureProfile();
  if (!profile || profile.role !== "admin") {
    await logSecurityEvent({ type: "unauthorized", severity: "warn", userId: profile?.id, detail: "Non-admin attempted adminReorderRosterMember" });
    return { error: "Unauthorized." };
  }
  const sb = getServerClient();
  if (!sb) return { error: "Database is not configured yet." };

  const id = String(formData.get("id") ?? "");
  const rawDir = String(formData.get("dir") ?? "");
  if (rawDir !== "up" && rawDir !== "down") return { error: "Invalid direction." };
  const dir = rawDir === "up" ? -1 : 1;
  const { data } = await sb
    .from("roster_members")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!data) return { error: "Member not found." };

  // Neighbor to swap with: moving up → the member directly above
  // (largest sort_order smaller than ours); moving down → the one directly
  // below (smallest sort_order greater than ours).
  const gt = dir === 1;
  let neighbor = sb
    .from("roster_members")
    .select("id, sort_order")
    .order("sort_order", { ascending: !gt })
    .limit(1);
  neighbor = gt
    ? neighbor.gt("sort_order", data.sort_order)
    : neighbor.lt("sort_order", data.sort_order);
  const { data: nbr } = await neighbor.maybeSingle();
  if (!nbr) return { ok: true };

  const temp = data.sort_order;
  const [a, b] = await Promise.all([
    sb.from("roster_members").update({ sort_order: nbr.sort_order }).eq("id", id),
    sb.from("roster_members").update({ sort_order: temp }).eq("id", nbr.id),
  ]);
  if (a.error || b.error) {
    await logSecurityEvent({ type: "manual", severity: "warn", userId: profile.id, detail: `adminReorderRosterMember failed: ${a.error?.message ?? b.error?.message}` });
    return { error: "Failed to reorder member." };
  }
  revalidatePath("/root_qsg");
  revalidatePath("/");
  revalidatePath("/lobby");
  return { ok: true };
}

export interface ChatReactionCount {
  emoji: string;
  count: number;
  mine: boolean;
}

export interface ChatMessageWithAuthor {
  id: string;
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorAvatar: string | null;
  isAdmin: boolean;
  content: string;
  createdAt: string;
  editedAt: string | null;
  replyToId: string | null;
  replyPreview: {
    authorName: string;
    content: string;
  } | null;
  reactions: ChatReactionCount[];
}

export interface ChatUserInfo {
  userId: string;
  username: string;
  name: string;
  avatar: string | null;
  role: string;
  banned: boolean;
  restriction: {
    mutedUntil: string | null;
    limitPerMin: number | null;
    reason: string;
  } | null;
}

const ONLINE_WINDOW_MS = 3 * 60 * 1000;
const DEFAULT_CHAT_LIMIT_PER_MIN = 30;
const CHAT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const PRESENCE_RETENTION_MS = 60 * 60 * 1000;
const NOTIFICATION_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const SECURITY_EVENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const CHAT_PAGE_SIZE = 50;
const CHAT_REACT_LIMIT_PER_MIN = 30;
const CHAT_REALTIME_CHANNEL = "chat-room";
const CHAT_REALTIME_EVENT = "chat-changed";
const NOTIFICATIONS_CHANNEL = "notifications";
const NOTIFICATIONS_EVENT = "notifications-changed";

async function notifyChatChanged(sb: NonNullable<ReturnType<typeof getServerClient>>) {
  try {
    await sb.channel(CHAT_REALTIME_CHANNEL).httpSend(CHAT_REALTIME_EVENT, {
      ts: Date.now(),
    });
  } catch {
    // broadcast is best-effort; polling remains the fallback
  }
}

async function notifyNotificationsChanged(sb: NonNullable<ReturnType<typeof getServerClient>>) {
  try {
    await sb.channel(NOTIFICATIONS_CHANNEL).httpSend(NOTIFICATIONS_EVENT, {
      ts: Date.now(),
    });
  } catch {
    // best-effort
  }
}

type NotifyType = NonNullable<AppNotification["type"]>;

// Best-effort per-user notification insert. Skips self-interactions.
async function createNotification(
  sb: NonNullable<ReturnType<typeof getServerClient>>,
  opts: {
    actorId: string;
    type: NotifyType;
    userId?: string | null;
    postId?: string | null;
    commentId?: string | null;
    detail?: string;
  }
): Promise<void> {
  try {
    const { actorId, type, postId, commentId, detail } = opts;
    const userId = opts.userId ?? "";
    if (!userId || userId === actorId) return;
    const { error } = await sb.from("notifications").insert({
      user_id: userId,
      actor_id: actorId,
      type,
      post_id: postId ?? null,
      comment_id: commentId ?? null,
      detail: detail ?? "",
    });
    if (error) return;
    await notifyNotificationsChanged(sb);
  } catch {
    // best-effort; never break the caller
  }
}

const CHAT_EMOJIS = ["👍", "❤️", "😂", "🔥", "🎉", "😮", "🤔", "👀"];

type ChatRateKind = "msg" | "react";

async function checkChatRate(
  sb: NonNullable<ReturnType<typeof getServerClient>>,
  profileId: string,
  kind: ChatRateKind
): Promise<string | null> {
  const since = new Date(Date.now() - 60 * 1000).toISOString();
  const { count } =
    kind === "msg"
      ? await sb
          .from("chat_messages")
          .select("id", { count: "exact", head: true })
          .eq("author_id", profileId)
          .gte("created_at", since)
      : await sb
          .from("chat_reactions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", profileId)
          .gte("created_at", since);
  let limit = kind === "msg" ? DEFAULT_CHAT_LIMIT_PER_MIN : CHAT_REACT_LIMIT_PER_MIN;
  if (kind === "msg") {
    const r = await getChatRestriction(sb, profileId);
    if (r?.limit_per_min != null) limit = r.limit_per_min;
  }
  if ((count ?? 0) >= limit) {
    await logSecurityEvent({
      type: "rate_limit",
      severity: "info",
      userId: profileId,
      detail: `Chat ${kind} rate limited (${count}/${limit} per min)`,
    });
    return `Slow down — chat ${kind === "msg" ? "messages" : "reactions"} are limited to ${limit} per minute.`;
  }
  return null;
}

async function getChatRestriction(
  sb: NonNullable<ReturnType<typeof getServerClient>>,
  userId: string
): Promise<ChatRestriction | null> {
  const { data } = await sb
    .from("chat_restrictions")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as ChatRestriction) ?? null;
}

async function checkChatMute(sb: NonNullable<ReturnType<typeof getServerClient>>, userId: string): Promise<string | null> {
  const r = await getChatRestriction(sb, userId);
  if (!r?.muted_until) return null;
  const until = new Date(r.muted_until).getTime();
  if (until <= Date.now()) return null;
  const mins = Math.ceil((until - Date.now()) / 60000);
  const when = mins >= 60
    ? `${Math.floor(mins / 60)}h ${mins % 60}m`
    : `${mins}m`;
  return `You are muted for ${when}.${r.reason ? ` (${r.reason})` : ""}`;
}

let lastMaintenance = 0;

export async function chatHeartbeat(): Promise<ActionResult> {
  const profile = await ensureProfile();
  if (!profile) return { error: "You must be signed in." };
  if (profile.banned) return { ok: true };
  const sb = getServerClient();
  if (!sb) return { error: "Database is not configured yet." };
  try {
    await sb.from("presence").upsert({ user_id: profile.id, last_seen: new Date().toISOString() });
    const now = Date.now();
    if (now - lastMaintenance > 60 * 60 * 1000) {
      lastMaintenance = now;
      await sb
        .from("presence")
        .delete()
        .lt("last_seen", new Date(Date.now() - PRESENCE_RETENTION_MS).toISOString());
      await sb
        .from("chat_messages")
        .delete()
        .lt("created_at", new Date(Date.now() - CHAT_RETENTION_MS).toISOString());
      // Age out old notifications and security events so they can't grow
      // unbounded. Runs alongside the existing hourly chat cleanup.
      await sb
        .from("notifications")
        .delete()
        .lt("created_at", new Date(Date.now() - NOTIFICATION_RETENTION_MS).toISOString());
      await sb
        .from("security_events")
        .delete()
        .lt("created_at", new Date(Date.now() - SECURITY_EVENT_RETENTION_MS).toISOString());
    }
  } catch {
    // non-fatal
  }
  return { ok: true };
}

export async function sendChatMessage(
  content: string,
  replyToId?: string | null
): Promise<ActionResult> {
  const profile = await ensureProfile();
  if (!profile) return { error: "You must be signed in." };
  const banErr = await bannedError(profile);
  if (banErr) return { error: banErr };
  const sb = getServerClient();
  if (!sb) return { error: "Database is not configured yet." };

  const body = String(content ?? "").trim();
  if (!body) return { error: "Message cannot be empty." };
  if (body.length > 400) return { error: "Message is too long (400 max)." };

  const muteErr = await checkChatMute(sb, profile.id);
  if (muteErr) return { error: muteErr };

  const rateErr = await checkChatRate(sb, profile.id, "msg");
  if (rateErr) return { error: rateErr };

  let reply_to_id: string | null = null;
  if (replyToId) {
    const rid = String(replyToId).trim();
    if (/^[0-9a-f-]{36}$/i.test(rid)) {
      const { data: target } = await sb
        .from("chat_messages")
        .select("id")
        .eq("id", rid)
        .maybeSingle();
      if (target) reply_to_id = rid;
    }
  }

  const { error } = await sb.from("chat_messages").insert({
    author_id: profile.id,
    content: body,
    reply_to_id,
  });
  if (error) return { error: "Failed to send message." };
  await notifyChatChanged(sb);
  return { ok: true };
}

export async function toggleChatReaction(formData: FormData): Promise<ActionResult> {
  const profile = await ensureProfile();
  if (!profile) return { error: "You must be signed in." };
  const banErr = await bannedError(profile);
  if (banErr) return { error: banErr };
  const sb = getServerClient();
  if (!sb) return { error: "Database is not configured yet." };

  const messageId = String(formData.get("message_id") ?? "");
  const emoji = String(formData.get("emoji") ?? "").slice(0, 8);
  if (!messageId) return { error: "Missing message." };
  if (!CHAT_EMOJIS.includes(emoji)) {
    await logSecurityEvent({ type: "tamper", severity: "info", userId: profile.id, detail: "Invalid chat reaction emoji" });
    return { error: "Invalid reaction." };
  }

  const { data: msg } = await sb
    .from("chat_messages")
    .select("id")
    .eq("id", messageId)
    .maybeSingle();
  if (!msg) return { error: "Message not found." };

  const { data: mine } = await sb
    .from("chat_reactions")
    .select("emoji")
    .eq("message_id", messageId)
    .eq("user_id", profile.id)
    .maybeSingle();

  if (mine) {
    await sb
      .from("chat_reactions")
      .delete()
      .eq("message_id", messageId)
      .eq("user_id", profile.id);
    if (mine.emoji === emoji) {
      // clicked the same emoji again → unreact
      await notifyChatChanged(sb);
      return { ok: true };
    }
  }

  const rateErr = await checkChatRate(sb, profile.id, "react");
  if (rateErr) return { error: rateErr };

  const { error } = await sb.from("chat_reactions").insert({
    message_id: messageId,
    user_id: profile.id,
    emoji,
  });
  if (error && error.code !== "23505") {
    return { error: "Failed to save reaction." };
  }
  await notifyChatChanged(sb);
  return { ok: true };
}

export async function editChatMessage(messageId: string, content: string): Promise<ActionResult> {
  const profile = await ensureProfile();
  if (!profile) return { error: "You must be signed in." };
  const banErr = await bannedError(profile);
  if (banErr) return { error: banErr };
  const sb = getServerClient();
  if (!sb) return { error: "Database is not configured yet." };

  const body = String(content ?? "").trim();
  if (!body) return { error: "Message cannot be empty." };
  if (body.length > 400) return { error: "Message is too long (400 max)." };

  const { data: msg } = await sb
    .from("chat_messages")
    .select("id, author_id")
    .eq("id", messageId)
    .maybeSingle();
  if (!msg) return { error: "Message not found." };
  if (msg.author_id !== profile.id && profile.role !== "admin") {
    await logSecurityEvent({ type: "unauthorized", severity: "warn", userId: profile.id, detail: "Non-author tried to edit a chat message" });
    return { error: "You can only edit your own messages." };
  }

  const { error } = await sb
    .from("chat_messages")
    .update({ content: body, edited_at: new Date().toISOString() })
    .eq("id", messageId);
  if (error) return { error: "Failed to edit message." };
  await notifyChatChanged(sb);
  return { ok: true };
}

export async function deleteChatMessage(messageId: string): Promise<ActionResult> {
  const profile = await ensureProfile();
  if (!profile) return { error: "You must be signed in." };
  const sb = getServerClient();
  if (!sb) return { error: "Database is not configured yet." };

  const { data: msg } = await sb
    .from("chat_messages")
    .select("id, author_id")
    .eq("id", messageId)
    .maybeSingle();
  if (!msg) return { error: "Message not found." };
  if (msg.author_id !== profile.id && profile.role !== "admin") {
    await logSecurityEvent({ type: "unauthorized", severity: "warn", userId: profile.id, detail: "Non-author tried to delete a chat message" });
    return { error: "You can only delete your own messages." };
  }

  await sb
    .from("chat_messages")
    .update({ content: "[deleted]", reply_to_id: null })
    .eq("id", messageId);
  if (profile.role === "admin") {
    await logSecurityEvent({ type: "manual", severity: "warn", userId: profile.id, detail: `Soft-deleted chat message ${messageId}` });
  }
  await notifyChatChanged(sb);
  return { ok: true };
}

export async function searchChatUsernames(
  q: string
): Promise<{ username: string; name: string; isAdmin: boolean }[]> {
  const profile = await ensureProfile();
  const sb = getServerClient();
  if (!sb || !profile) return [];
  const query = escapeSearchTerm(
    String(q ?? "")
      .trim()
      .toLowerCase()
      .replace(/^@/, "")
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 30)
  );
  if (query.length < 1) return [];
  const { data } = await sb
    .from("profiles")
    .select("username, display_name, role")
    .or(`username.ilike.${query}%,display_name.ilike.${query}%`)
    .order("role", { ascending: false })
    .limit(8);
  return ((data ?? []) as { username: string; display_name: string; role: string }[])
    .filter((p) => p.username)
    .map((p) => ({
      username: p.username,
      name: p.display_name || p.username,
      isAdmin: p.role === "admin",
    }));
}

export async function getChatRoomInfo(): Promise<{ messages: ChatMessageWithAuthor[]; online: number }> {
  const viewer = await ensureProfile();
  if (!viewer) return { messages: [], online: 0 };
  const sb = getServerClient();
  if (!sb) return { messages: [], online: 0 };

  try {
    const [msgs, onlineRes] = await Promise.all([
      fetchChatMessages(sb, viewer.id, null),
      sb
        .from("presence")
        .select("user_id", { count: "exact", head: true })
        .gte("last_seen", new Date(Date.now() - ONLINE_WINDOW_MS).toISOString())
        .then((r) => r.count ?? 0),
    ]);
    return { messages: msgs, online: onlineRes };
  } catch {
    return { messages: [], online: 0 };
  }
}

export async function getMoreChatMessages(
  cursor: { createdAt: string; id: string }
): Promise<{ messages: ChatMessageWithAuthor[]; nextCursor: { createdAt: string; id: string } | null }> {
  const viewer = await ensureProfile();
  const sb = getServerClient();
  if (!viewer || !sb) return { messages: [], nextCursor: null };
  try {
    const page = await fetchChatMessages(sb, viewer.id, cursor);
    const last = page[page.length - 1];
    return {
      messages: page,
      nextCursor: page.length === CHAT_PAGE_SIZE && last
        ? { createdAt: last.createdAt, id: last.id }
        : null,
    };
  } catch {
    return { messages: [], nextCursor: null };
  }
}

// Keyset pagination over chat_messages (created_at desc, then id desc).
// Fetches one page + the cursor page's newest author/reaction context,
// then assembles author names, reaction counts, and reply previews.
async function fetchChatMessages(
  sb: NonNullable<ReturnType<typeof getServerClient>>,
  viewerId: string,
  cursor: { createdAt: string; id: string } | null
): Promise<ChatMessageWithAuthor[]> {
  let q = sb
    .from("chat_messages")
    .select("id, author_id, content, reply_to_id, edited_at, created_at")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(CHAT_PAGE_SIZE);
  if (cursor) {
    q = q.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`
    );
  }
  const { data } = await q;
  const rows = (data ?? []) as {
    id: string;
    author_id: string;
    content: string;
    reply_to_id: string | null;
    edited_at: string | null;
    created_at: string;
  }[];

  const authorIds = [...new Set(rows.map((m) => m.author_id))];
  const replyIds = [...new Set(rows.map((m) => m.reply_to_id).filter((r): r is string => !!r))];

  const [authorsRes, reactionsRes, repliesRes] = await Promise.all([
    authorIds.length
      ? sb
          .from("profiles")
          .select("id, display_name, username, avatar_url, role")
          .in("id", authorIds)
      : Promise.resolve({ data: [] }),
    rows.length
      ? sb
          .from("chat_reactions")
          .select("message_id, user_id, emoji")
          .in("message_id", rows.map((r) => r.id))
      : Promise.resolve({ data: [] }),
    replyIds.length
      ? sb
          .from("chat_messages")
          .select("id, author_id, content")
          .in("id", replyIds)
      : Promise.resolve({ data: [] }),
  ]);

  const amap = new Map(
    (authorsRes.data ?? []).map((a) => [
      a.id,
      a as {
        display_name: string;
        username: string;
        avatar_url: string | null;
        role: string;
      },
    ])
  );

  const rmap = new Map<string, Map<string, number>>();
  const rmine = new Map<string, Set<string>>();
  for (const r of (reactionsRes.data ?? []) as {
    message_id: string;
    user_id: string;
    emoji: string;
  }[]) {
    let m = rmap.get(r.message_id);
    if (!m) {
      m = new Map();
      rmap.set(r.message_id, m);
    }
    m.set(r.emoji, (m.get(r.emoji) ?? 0) + 1);
    if (r.user_id === viewerId) {
      let s = rmine.get(r.message_id);
      if (!s) {
        s = new Set();
        rmine.set(r.message_id, s);
      }
      s.add(r.emoji);
    }
  }

  const rp = new Map(
    (repliesRes.data ?? []).map((t) => [
      t.id,
      t as { id: string; author_id: string; content: string },
    ])
  );

  return rows
    .slice()
    .reverse()
    .map((m) => {
      const a = amap.get(m.author_id);
      const counts = rmap.get(m.id) ?? new Map<string, number>();
      const mineSet = rmine.get(m.id) ?? new Set<string>();
      const target = m.reply_to_id ? rp.get(m.reply_to_id) : undefined;
      const targetAuthor = target ? amap.get(target.author_id) : undefined;
      return {
        id: m.id,
        authorId: m.author_id,
        content: m.content,
        createdAt: m.created_at,
        editedAt: m.edited_at,
        replyToId: m.reply_to_id,
        replyPreview:
          target && targetAuthor
            ? {
                authorName: targetAuthor.display_name || targetAuthor.username || "unknown",
                content: target.content,
              }
            : null,
        reactions: CHAT_EMOJIS.map((emoji) => ({
          emoji,
          count: counts.get(emoji) ?? 0,
          mine: mineSet.has(emoji),
        })),
        authorName: a?.display_name || a?.username || "unknown",
        authorUsername: a?.username || "?",
        authorAvatar: a?.avatar_url ?? null,
        isAdmin: a?.role === "admin",
      };
    });
}

export async function getChatUserInfo(username: string): Promise<{ ok?: boolean; user?: ChatUserInfo; error?: string }> {
  const viewer = await ensureProfile();
  if (!viewer) return { error: "You must be signed in." };
  const sb = getServerClient();
  if (!sb) return { error: "Database is not configured yet." };

  const { data: profile } = await sb
    .from("profiles")
    .select("id, username, display_name, avatar_url, role, banned")
    .eq("username", username)
    .maybeSingle();
  if (!profile) return { error: "User not found." };

  const isViewerAdmin = viewer.role === "admin";
  let restriction: ChatUserInfo["restriction"] = null;
  if (isViewerAdmin || profile.id === viewer.id) {
    const r = await getChatRestriction(sb, profile.id);
    if (r) {
      restriction = {
        mutedUntil: r.muted_until,
        limitPerMin: r.limit_per_min,
        reason: r.reason,
      };
    }
  }

  return {
    ok: true,
    user: {
      userId: profile.id,
      username: profile.username,
      name: profile.display_name || profile.username,
      avatar: profile.avatar_url ?? null,
      role: profile.role,
      banned: profile.banned,
      restriction,
    },
  };
}

export async function adminSetChatRestriction(formData: FormData): Promise<ActionResult> {
  const actor = await ensureProfile();
  if (!actor || actor.role !== "admin") {
    await logSecurityEvent({ type: "unauthorized", severity: "warn", userId: actor?.id, detail: "Non-admin attempted adminSetChatRestriction" });
    return { error: "Unauthorized." };
  }
  const sb = getServerClient();
  if (!sb) return { error: "Database is not configured yet." };

  const userId = String(formData.get("user_id") ?? "");
  const mode = String(formData.get("mode") ?? ""); // clear | mute | limit
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 200);

  const { data: target } = await sb
    .from("profiles")
    .select("id, role")
    .eq("id", userId)
    .maybeSingle();
  if (!target) return { error: "User not found." };
  if (target.role === "admin") return { error: "Cannot restrict another admin." };

  if (mode === "clear") {
    await sb.from("chat_restrictions").delete().eq("user_id", userId);
    await logSecurityEvent({ type: "manual", severity: "info", userId: actor.id, detail: `Cleared chat restriction for ${userId}` });
    return { ok: true };
  }

  if (mode === "mute") {
    const minsRaw = Number(formData.get("minutes") ?? 0);
    const minutes = Number.isFinite(minsRaw) && minsRaw > 0 ? minsRaw : 60;
    const muted_until = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    await sb.from("chat_restrictions").upsert(
      { user_id: userId, muted_until, reason, set_by: actor.id },
      { onConflict: "user_id" }
    );
    await createNotification(sb, {
      actorId: actor.id,
      type: "moderation",
      userId,
      detail: "muted",
    });
    await logSecurityEvent({ type: "manual", severity: "warn", userId: actor.id, detail: `Muted ${userId} for ${minutes}min (${reason || "no reason"})` });
    return { ok: true };
  }

  if (mode === "limit") {
    const limitRaw = Number(formData.get("limit_per_min") ?? "");
    const limit_per_min = Number.isFinite(limitRaw) && limitRaw >= 1 && limitRaw <= 60
      ? Math.floor(limitRaw)
      : null;
    await sb.from("chat_restrictions").upsert(
      { user_id: userId, limit_per_min, reason, set_by: actor.id },
      { onConflict: "user_id" }
    );
    await logSecurityEvent({ type: "manual", severity: "warn", userId: actor.id, detail: `Set chat limit ${limit_per_min}/min for ${userId}` });
    return { ok: true };
  }

  return { error: "Invalid mode." };
}

export async function adminDeleteChatMessage(messageId: string): Promise<ActionResult> {
  const actor = await ensureProfile();
  if (!actor || actor.role !== "admin") {
    await logSecurityEvent({ type: "unauthorized", severity: "warn", userId: actor?.id, detail: "Non-admin attempted adminDeleteChatMessage" });
    return { error: "Unauthorized." };
  }
  const sb = getServerClient();
  if (!sb) return { error: "Database is not configured yet." };

  const { data: msg } = await sb
    .from("chat_messages")
    .select("author_id")
    .eq("id", messageId)
    .maybeSingle();
  if (!msg) return { error: "Message not found." };

  await sb.from("chat_messages").delete().eq("id", messageId);
  await logSecurityEvent({
    type: "manual",
    severity: "warn",
    userId: actor.id,
    detail: `Deleted chat message ${messageId} from user ${msg.author_id}`,
  });
  await notifyChatChanged(sb);
  return { ok: true };
}

export interface NotificationItem {
  id: string;
  type: AppNotification["type"];
  actorName: string;
  actorUsername: string;
  actorAvatar: string | null;
  postId: string | null;
  commentId: string | null;
  detail: string;
  read: boolean;
  createdAt: string;
  href: string;
}

function mapNotificationHref(
  n: Pick<AppNotification, "type" | "post_id" | "comment_id" | "detail">,
  actorUsername: string
): string {
  switch (n.type) {
    case "post_reaction":
    case "post_comment":
    case "comment_reaction":
    case "comment_reply":
      return n.post_id ? `/post/${n.post_id}` : "/";
    case "follow":
      return actorUsername ? `/profile/${actorUsername}` : "/";
    case "moderation":
      if (n.detail === "post_hidden" && n.post_id) return `/post/${n.post_id}`;
      if (n.detail === "comment_hidden" && n.post_id) return `/post/${n.post_id}`;
      return "/";
  }
}

export async function getNotifications(): Promise<{
  items: NotificationItem[];
  unread: number;
}> {
  const profile = await ensureProfile();
  const sb = getServerClient();
  if (!profile || !sb) return { items: [], unread: 0 };
  try {
    const [res, unreadRes] = await Promise.all([
      sb
        .from("notifications")
        .select("id, actor_id, type, post_id, comment_id, detail, read_at, created_at")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(40),
      sb
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", profile.id)
        .is("read_at", null),
    ]);
    const rows = (res.data ?? []) as AppNotification[];
    const actorIds = [...new Set(rows.map((r) => r.actor_id))];
    const { data: actors } = actorIds.length
      ? await sb
          .from("profiles")
          .select("id, display_name, username, avatar_url")
          .in("id", actorIds)
      : { data: [] };
    const amap = new Map((actors ?? []).map((a) => [a.id, a]));
    return {
      unread: unreadRes.count ?? 0,
      items: rows.map((r) => {
        const actor = amap.get(r.actor_id) as
          | { display_name?: string; username?: string; avatar_url?: string | null }
          | undefined;
        return {
          id: r.id,
          type: r.type,
          actorName: actor?.display_name || actor?.username || "unknown",
          actorUsername: actor?.username || "",
          actorAvatar: actor?.avatar_url ?? null,
          postId: r.post_id,
          commentId: r.comment_id,
          detail: r.detail,
          read: !!r.read_at,
          createdAt: r.created_at,
          href: mapNotificationHref(r, actor?.username ?? ""),
        };
      }),
    };
  } catch {
    return { items: [], unread: 0 };
  }
}

export interface GlobalActivityItem {
  id: string;
  type: AppNotification["type"];
  actorName: string;
  actorUsername: string;
  recipientName: string;
  recipientUsername: string;
  postId: string | null;
  commentId: string | null;
  detail: string;
  createdAt: string;
  href: string;
}

export async function getGlobalActivity(): Promise<{ items: GlobalActivityItem[] }> {
  const profile = await ensureProfile();
  if (!profile || profile.role !== "admin") return { items: [] };
  const sb = getServerClient();
  if (!sb) return { items: [] };
  try {
    const { data } = await sb
      .from("notifications")
      .select("id, user_id, actor_id, type, post_id, comment_id, detail, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    const rows = (data ?? []) as AppNotification[];
    const ids = [
      ...new Set([...rows.map((r) => r.actor_id), ...rows.map((r) => r.user_id)]),
    ];
    const { data: profs } = ids.length
      ? await sb
          .from("profiles")
          .select("id, display_name, username, avatar_url")
          .in("id", ids)
      : { data: [] };
    const pmap = new Map((profs ?? []).map((p) => [p.id, p]));
    return {
      items: rows.map((r) => {
        const actor = pmap.get(r.actor_id) as
          | { display_name?: string; username?: string }
          | undefined;
        const recipient = pmap.get(r.user_id) as
          | { display_name?: string; username?: string }
          | undefined;
        return {
          id: r.id,
          type: r.type,
          actorName: actor?.display_name || actor?.username || "unknown",
          actorUsername: actor?.username || "",
          recipientName: recipient?.display_name || recipient?.username || "unknown",
          recipientUsername: recipient?.username || "",
          postId: r.post_id,
          commentId: r.comment_id,
          detail: r.detail,
          createdAt: r.created_at,
          href: mapNotificationHref(r, actor?.username ?? ""),
        };
      }),
    };
  } catch {
    return { items: [] };
  }
}

export async function markNotificationsRead(): Promise<ActionResult> {
  const profile = await ensureProfile();
  if (!profile) return { error: "You must be signed in." };
  const sb = getServerClient();
  if (!sb) return { error: "Database is not configured yet." };
  await sb
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", profile.id)
    .is("read_at", null);
  return { ok: true };
}

export async function markNotificationRead(id: string): Promise<ActionResult> {
  const profile = await ensureProfile();
  if (!profile) return { error: "You must be signed in." };
  const sb = getServerClient();
  if (!sb) return { error: "Database is not configured yet." };
  await sb
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", profile.id);
  return { ok: true };
}
