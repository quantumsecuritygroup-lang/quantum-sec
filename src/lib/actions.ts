"use server";

import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { getServerClient, type Category, type ReactionEmoji, type Role } from "./supabase";
import { ensureProfile } from "./auth";
import { logSecurityEvent } from "./security";

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
  const image = sharp(buf, { animated: mime === "image/gif" });
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
    out = await pipeline.toBuffer();
  } else if (mime === "image/png") {
    out = await pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  } else if (mime === "image/webp") {
    out = await pipeline.webp({ quality: IMAGE_QUALITY }).toBuffer();
  } else {
    out = await pipeline.jpeg({ quality: IMAGE_QUALITY, mozjpeg: true }).toBuffer();
  }

  if (out.length >= buf.length) return { data: buf as Buffer, mime };
  return { data: out, mime };
}

type ActionResult = { ok?: boolean; error?: string };

type RateKey = "post" | "comment" | "reaction" | "follow";

const RATE_LIMITS: Record<RateKey, { limit: number; windowMs: number }> = {
  post: { limit: 5, windowMs: 60 * 60 * 1000 },
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
    key === "post" ? "posts" : key === "comment" ? "comments" : key === "reaction" ? "reactions" : "follows";
  const col =
    key === "post"
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

export interface PostSearchResult {
  id: string;
  title: string;
  scope: "main" | "lobby";
  authorName: string;
}

export async function searchPosts(q: string): Promise<PostSearchResult[]> {
  const sb = getServerClient();
  const query = q.trim().slice(0, 80);
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

  const rateErr = await checkRate(sb, profile.id, "post");
  if (rateErr) return { error: rateErr };

  const title = String(formData.get("title") ?? "").trim().slice(0, 120);
  const content = String(formData.get("content") ?? "").trim();
  const category = String(formData.get("category") ?? "announcement") as Category;
  const validCats: Category[] = ["announcement", "update", "discussion", "event"];
  if (!validCats.includes(category)) return { error: "Invalid category." };
  if (!title && !content) return { error: "Post cannot be empty." };
  if (content.length > 5000) return { error: "Post is too long." };

  const maxImages = scope === "lobby" ? 1 : 12;
  const files = (formData.getAll("images") as FormDataEntryValue[]).filter(
    (f): f is File => f instanceof File && f.size > 0
  );
  if (files.length > maxImages) {
    return { error: `Maximum ${maxImages} image${maxImages === 1 ? "" : "s"} per post.` };
  }

  const paths: string[] = [];
  for (const file of files) {
    if (file.size > MAX_IMAGE_SIZE) {
      return { error: "Each image must be under 10MB." };
    }
    const buf = new Uint8Array(await file.arrayBuffer());
    if (!validateImage(buf, file.type)) {
      return { error: "Only JPG, PNG, GIF, or WEBP images are allowed." };
    }
    let uploadBuf: Uint8Array;
    let uploadMime: string;
    try {
      const compressed = await compressImage(buf, file.type);
      uploadBuf = new Uint8Array(compressed.data);
      uploadMime = compressed.mime;
    } catch {
      return { error: "Image could not be validated. Try a different file." };
    }
    const path = `posts/${crypto.randomUUID()}.${extFor(uploadMime)}`;
    const { error: upErr } = await sb.storage
      .from("qsc-images")
      .upload(path, uploadBuf, { contentType: uploadMime, upsert: false });
    if (upErr) {
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
    .select("id, hidden")
    .eq("id", postId)
    .single();
  if (!post || post.hidden) return { error: "Post not found." };

  if (parentId) {
    const { data: parent } = await sb
      .from("comments")
      .select("id")
      .eq("id", parentId)
      .eq("post_id", postId)
      .maybeSingle();
    if (!parent) return { error: "Reply target not found." };
  }

  const { error } = await sb.from("comments").insert({
    post_id: postId,
    author_id: profile.id,
    parent_id: parentId,
    content,
  });
  if (error) return { error: "Failed to add comment." };
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
    await sb.from("posts").update({ pinned: action === "pin" }).eq("id", id);
  } else if (action === "hide" || action === "unhide") {
    await sb.from("posts").update({ hidden: action === "hide" }).eq("id", id);
  } else if (action === "delete") {
    const { data: post } = await sb
      .from("posts")
      .select("image_paths")
      .eq("id", id)
      .single();
    if (post?.image_paths?.length) {
      await sb.storage.from("qsc-images").remove(post.image_paths);
    }
    await sb.from("posts").delete().eq("id", id);
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
    await sb.from("comments").update({ hidden: true }).eq("id", id);
  } else if (action === "unhide") {
    await sb.from("comments").update({ hidden: false }).eq("id", id);
  } else if (action === "delete") {
    await sb.from("comments").delete().eq("id", id);
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
  await sb.from("profiles").update({ role }).eq("id", id);
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

  await sb
    .from("profiles")
    .update({ banned, banned_at: banned ? new Date().toISOString() : null })
    .eq("id", id);
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

  await sb.from("blocked_ips").upsert({ ip, reason }, { onConflict: "ip" });
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
