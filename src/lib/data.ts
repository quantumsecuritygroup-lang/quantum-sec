import {
  getServerClient,
  type Comment,
  type Post,
  type Profile,
  type ReactionEmoji,
  type SecurityEvent,
  type BlockedIp,
  emptyReactions,
} from "./supabase";

export interface PostWithMeta {
  post: Post;
  author: Profile;
  reactions: Record<ReactionEmoji, number>;
  myReaction: ReactionEmoji | null;
  commentCount: number;
}

export interface CommentNode extends Comment {
  author: Profile;
  reactions: Record<ReactionEmoji, number>;
  myReaction: ReactionEmoji | null;
  replies: CommentNode[];
}

export interface PostDetail {
  item: PostWithMeta;
  comments: CommentNode[];
}

export interface ProfileStats {
  profile: Profile;
  posts: PostWithMeta[];
  followers: number;
  following: number;
  isFollowing: boolean;
  isSelf: boolean;
}

export interface AdminCommentRow extends Comment {
  author: Profile;
}

export interface AdminFilters {
  q?: string;
  status?: "all" | "visible" | "hidden" | "pinned";
  page?: number;
}

export interface AdminData {
  stats: {
    users: number;
    posts: number;
    comments: number;
    reactions: number;
    follows: number;
  };
  users: Profile[];
  mainPosts: PostWithMeta[];
  lobbyPosts: PostWithMeta[];
  comments: AdminCommentRow[];
  mainTotal: number;
  lobbyTotal: number;
  postPage: number;
  perPage: number;
  filters: AdminFilters;
}

function fallbackProfile(): Profile {
  return {
    id: "",
    clerk_id: "",
    username: "unknown",
    display_name: "Unknown",
    bio: "",
    role: "follower",
    avatar_url: null,
    banned: false,
    banned_at: null,
    created_at: new Date().toISOString(),
  };
}

async function buildPostMeta(
  posts: Post[],
  myProfileId: string | null
): Promise<PostWithMeta[]> {
  const sb = getServerClient();
  if (!sb || posts.length === 0) return [];

  const authorIds = [...new Set(posts.map((p) => p.author_id))];
  const postIds = posts.map((p) => p.id);

  const { data: authors } = await sb
    .from("profiles")
    .select("*")
    .in("id", authorIds);
  const authorMap = new Map((authors ?? []).map((a) => [a.id, a]));

  const { data: reactions } = await sb
    .from("reactions")
    .select("post_id, emoji, user_id")
    .in("post_id", postIds);
  const { data: comments } = await sb
    .from("comments")
    .select("post_id")
    .eq("hidden", false)
    .in("post_id", postIds);

  const rCounts = new Map<string, Record<ReactionEmoji, number>>();
  const rMine = new Map<string, ReactionEmoji>();
  for (const r of (reactions ?? []) as {
    post_id: string;
    emoji: ReactionEmoji;
    user_id: string;
  }[]) {
    const m = rCounts.get(r.post_id) ?? emptyReactions();
    m[r.emoji] += 1;
    rCounts.set(r.post_id, m);
    if (myProfileId && r.user_id === myProfileId) {
      rMine.set(r.post_id, r.emoji);
    }
  }
  const cCounts = new Map<string, number>();
  for (const c of (comments ?? []) as { post_id: string }[]) {
    cCounts.set(c.post_id, (cCounts.get(c.post_id) ?? 0) + 1);
  }

  return posts
    .filter((p) => authorMap.has(p.author_id))
    .map((p) => ({
      post: p,
      author: authorMap.get(p.author_id) as Profile,
      reactions: rCounts.get(p.id) ?? emptyReactions(),
      myReaction: rMine.get(p.id) ?? null,
      commentCount: cCounts.get(p.id) ?? 0,
    }));
}

export async function getFeed(
  myProfileId: string | null,
  includeHidden = false,
  scope: "main" | "lobby" = "main"
): Promise<PostWithMeta[]> {
  const sb = getServerClient();
  if (!sb) return [];

  let query = sb
    .from("posts")
    .select("*")
    .eq("scope", scope)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);
  if (!includeHidden) query = query.eq("hidden", false);

  const { data: posts } = await query;
  if (!posts?.length) return [];
  return buildPostMeta(posts as Post[], myProfileId);
}

export async function getLobbyFeed(myProfileId: string | null) {
  return getFeed(myProfileId, false, "lobby");
}

export async function getPostDetail(
  postId: string,
  myProfileId: string | null
): Promise<PostDetail | null> {
  const sb = getServerClient();
  if (!sb) return null;

  const { data: post } = await sb
    .from("posts")
    .select("*")
    .eq("id", postId)
    .maybeSingle();
  if (!post || post.hidden) return null;

  const { data: author } = await sb
    .from("profiles")
    .select("*")
    .eq("id", post.author_id)
    .maybeSingle();
  if (!author) return null;

  const { data: comments } = await sb
    .from("comments")
    .select("*")
    .eq("post_id", postId)
    .eq("hidden", false)
    .order("created_at", { ascending: true });
  const cids = (comments ?? []).map((c) => c.id);

  const { data: reactions } = cids.length
    ? await sb.from("reactions").select("*").in("comment_id", cids)
    : { data: [] };

  const commentAuthorIds = [
    ...new Set((comments ?? []).map((c) => c.author_id)),
  ];
  const { data: profs } = commentAuthorIds.length
    ? await sb.from("profiles").select("*").in("id", commentAuthorIds)
    : { data: [] };
  const profMap = new Map((profs ?? []).map((p) => [p.id, p]));

  const byId = new Map<string, CommentNode>();
  for (const c of comments ?? []) {
    byId.set(c.id, {
      ...c,
      author: (profMap.get(c.author_id) ?? fallbackProfile()) as Profile,
      reactions: emptyReactions(),
      myReaction: null,
      replies: [],
    });
  }
  for (const r of (reactions ?? []) as {
    comment_id: string | null;
    emoji: ReactionEmoji;
    user_id: string;
  }[]) {
    const node = r.comment_id ? byId.get(r.comment_id) : undefined;
    if (node) {
      node.reactions[r.emoji] += 1;
      if (myProfileId && r.user_id === myProfileId) {
        node.myReaction = r.emoji;
      }
    }
  }
  const roots: CommentNode[] = [];
  for (const node of byId.values()) {
    if (node.parent_id && byId.has(node.parent_id)) {
      byId.get(node.parent_id)!.replies.push(node);
    } else {
      roots.push(node);
    }
  }

  const { data: postReactions } = await sb
    .from("reactions")
    .select("emoji, user_id")
    .eq("post_id", postId);
  const pr = emptyReactions();
  let myReaction: ReactionEmoji | null = null;
  for (const r of (postReactions ?? []) as {
    emoji: ReactionEmoji;
    user_id: string;
  }[]) {
    pr[r.emoji] += 1;
    if (myProfileId && r.user_id === myProfileId) myReaction = r.emoji;
  }

  const item: PostWithMeta = {
    post: post as Post,
    author: author as Profile,
    reactions: pr,
    myReaction,
    commentCount: byId.size,
  };
  return { item, comments: roots };
}

export async function getProfileStats(
  username: string,
  myProfileId: string | null
): Promise<ProfileStats | null> {
  const sb = getServerClient();
  if (!sb) return null;

  const { data: profile } = await sb
    .from("profiles")
    .select("*")
    .eq("username", username)
    .maybeSingle();
  if (!profile) return null;

  const { data: posts } = await sb
    .from("posts")
    .select("*")
    .eq("author_id", profile.id)
    .eq("hidden", false)
    .order("created_at", { ascending: false })
    .limit(20);

  const meta = await buildPostMeta((posts ?? []) as Post[], myProfileId);

  const [followers, following, isFollowing] = await Promise.all([
    sb
      .from("follows")
      .select("follower_id", { count: "exact", head: true })
      .eq("following_id", profile.id)
      .then((r) => r.count ?? 0),
    sb
      .from("follows")
      .select("following_id", { count: "exact", head: true })
      .eq("follower_id", profile.id)
      .then((r) => r.count ?? 0),
    myProfileId
      ? sb
          .from("follows")
          .select("follower_id")
          .eq("follower_id", myProfileId)
          .eq("following_id", profile.id)
          .maybeSingle()
          .then((r) => !!r.data)
      : Promise.resolve(false),
  ]);

  return {
    profile: profile as Profile,
    posts: meta,
    followers,
    following,
    isFollowing,
    isSelf: !!myProfileId && myProfileId === profile.id,
  };
}

export async function getAdminData(filters: AdminFilters = {}): Promise<AdminData | null> {
  const sb = getServerClient();
  if (!sb) return null;

  const q = (filters.q ?? "").trim();
  const status = filters.status ?? "all";
  const perPage = 25;
  const postPage = Math.max(1, filters.page ?? 1);
  const from = (postPage - 1) * perPage;
  const to = from + perPage - 1;

  const applyFilters = <T,>(query: T): T => {
    let qx = query;
    if (q)
      qx = (qx as { or: (f: string) => T }).or(
        `title.ilike.%${q}%,content.ilike.%${q}%`
      );
    if (status === "visible") qx = (qx as { eq: (c: string, v: unknown) => T }).eq("hidden", false);
    else if (status === "hidden") qx = (qx as { eq: (c: string, v: unknown) => T }).eq("hidden", true);
    else if (status === "pinned") qx = (qx as { eq: (c: string, v: unknown) => T }).eq("pinned", true);
    return qx;
  };

  const [usersRes, reactRes, followRes, postCountRes] = await Promise.all([
    sb.from("profiles").select("*").order("created_at", { ascending: false }).limit(100),
    sb.from("reactions").select("id", { count: "exact", head: true }),
    sb.from("follows").select("follower_id", { count: "exact", head: true }),
    sb.from("posts").select("id", { count: "exact", head: true }),
  ]);

  const [mainCountRes, lobbyCountRes, mainPostsRes, lobbyPostsRes, commentCountRes] =
    await Promise.all([
      applyFilters(sb.from("posts").select("id", { count: "exact", head: true })).eq("scope", "main"),
      applyFilters(sb.from("posts").select("id", { count: "exact", head: true })).eq("scope", "lobby"),
      applyFilters(sb.from("posts").select("*").order("created_at", { ascending: false }).eq("scope", "main")).range(from, to),
      applyFilters(sb.from("posts").select("*").order("created_at", { ascending: false }).eq("scope", "lobby")).range(from, to),
      sb.from("comments").select("id", { count: "exact", head: true }),
    ]);

  const users = (usersRes.data ?? []) as Profile[];

  const [mainMeta, lobbyMeta] = await Promise.all([
    buildPostMeta((mainPostsRes.data ?? []) as Post[], null),
    buildPostMeta((lobbyPostsRes.data ?? []) as Post[], null),
  ]);

  const { data: allComments } = await sb
    .from("comments")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  const comments = (allComments ?? []) as Comment[];
  const authorIds = [...new Set(comments.map((c) => c.author_id))];
  const { data: profs } = authorIds.length
    ? await sb.from("profiles").select("*").in("id", authorIds)
    : { data: [] };
  const pmap = new Map((profs ?? []).map((p) => [p.id, p]));

  return {
    stats: {
      users: users.length,
      posts: postCountRes.count ?? 0,
      comments: commentCountRes.count ?? 0,
      reactions: reactRes.count ?? 0,
      follows: followRes.count ?? 0,
    },
    users,
    mainPosts: mainMeta,
    lobbyPosts: lobbyMeta,
    comments: comments.map((c) => ({
      ...c,
      author: (pmap.get(c.author_id) ?? fallbackProfile()) as Profile,
    })),
    mainTotal: mainCountRes.count ?? 0,
    lobbyTotal: lobbyCountRes.count ?? 0,
    postPage,
    perPage,
    filters: { q, status },
  };
}

export interface SecurityData {
  events: SecurityEvent[];
  blockedIps: BlockedIp[];
}

export async function getSecurityData(): Promise<SecurityData | null> {
  const sb = getServerClient();
  if (!sb) return null;

  const [eventsRes, blockedRes] = await Promise.all([
    sb
      .from("security_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100),
    sb
      .from("blocked_ips")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  return {
    events: (eventsRes.data ?? []) as SecurityEvent[],
    blockedIps: (blockedRes.data ?? []) as BlockedIp[],
  };
}

export interface SiteStats {
  posts: number;
  comments: number;
  reactions: number;
  users: number;
  online: number;
  threats: number;
}

export async function getSiteStats(): Promise<SiteStats> {
  const sb = getServerClient();
  if (!sb) return { posts: 0, comments: 0, reactions: 0, users: 0, online: 0, threats: 0 };

  const [postRes, commentRes, reactRes, userRes, eventRes] = await Promise.all([
    sb.from("posts").select("id", { count: "exact", head: true }),
    sb.from("comments").select("id", { count: "exact", head: true }),
    sb.from("reactions").select("id", { count: "exact", head: true }),
    sb.from("profiles").select("id", { count: "exact", head: true }),
    sb.from("security_events").select("id", { count: "exact", head: true }),
  ]);

  return {
    posts: postRes.count ?? 0,
    comments: commentRes.count ?? 0,
    reactions: reactRes.count ?? 0,
    users: userRes.count ?? 0,
    online: 0,
    threats: eventRes.count ?? 0,
  };
}
