import Link from "next/link";
import type { PostWithMeta } from "@/lib/data";
import { CategoryTag } from "./ui/category-tag";
import { Avatar } from "./ui/avatar";
import { RoleBadge } from "./ui/role-badge";
import { ImageGrid } from "./image-grid";
import { ReactionBar } from "./reaction-bar";
import { AdminPostControls } from "./admin-post-controls";
import { ExpandableContent } from "./expandable-content";
import { imageUrl } from "@/lib/supabase";
import { formatDate } from "@/lib/utils";

export function PostCard({
  item,
  canModerate,
  signedIn,
  full = false,
}: {
  item: PostWithMeta;
  canModerate: boolean;
  signedIn: boolean;
  full?: boolean;
}) {
  const { post, author } = item;

  const body = (
    <>
      {post.title && (
        <p className="text-sm text-glow">
          <span className="text-muted">(quantum㉿qsg)-[~]$ </span>
          <span className="text-ink">{post.title}</span>
        </p>
      )}
      <ExpandableContent content={post.content} full={full} />
    </>
  );

  return (
    <article
      id="archive"
      className="border border-edge bg-card p-5 transition-colors hover:border-glow/30"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 font-mono text-xs">
          {post.scope === "lobby" && (
            <span className="border border-lobby/40 bg-lobby/5 px-1.5 py-0.5 text-[10px] tracking-wider text-lobby">
              LOBBY
            </span>
          )}
          <CategoryTag category={post.category} />
          <span className="text-faint">{formatDate(post.created_at)}</span>
          {post.pinned && <span className="text-amber">📌 PINNED</span>}
          {post.hidden && <span className="text-danger">🚫 HIDDEN</span>}
        </div>
        {canModerate && (
          <AdminPostControls
            postId={post.id}
            pinned={post.pinned}
            hidden={post.hidden}
          />
        )}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Link href={`/profile/${author.username}`}>
          <Avatar name={author.display_name || author.username} imageUrl={author.avatar_url} />
        </Link>
        <div className="text-sm">
          <Link
            href={`/profile/${author.username}`}
            className="font-semibold text-ink transition-colors hover:text-glow"
          >
            {author.display_name || author.username}
          </Link>
          <span className="ml-2">
            <RoleBadge role={author.role} />
          </span>
        </div>
      </div>

      <div className="mt-4 border border-edge bg-base">
        <div className="flex items-center gap-2 border-b border-edge bg-panel px-3 py-2">
          <span className="text-[10px] text-faint">●</span>
          <CategoryTag category={post.category} />
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
            qsg@terminal:~$
          </span>
        </div>
        <div className="px-4 py-3 font-mono">
          {full ? (
            body
          ) : (
            <Link
              href={`/post/${post.id}`}
              className="block cursor-pointer"
              aria-label={`View post: ${post.title || "untitled"}`}
            >
              {body}
            </Link>
          )}
        </div>
      </div>
      <ImageGrid urls={post.image_paths.map(imageUrl)} />

      <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-edge pt-3">
        <ReactionBar
          postId={post.id}
          reactions={item.reactions}
          myReaction={item.myReaction}
          signedIn={signedIn}
        />
        <Link
          href={`/post/${post.id}`}
          className="font-mono text-xs text-muted transition-colors hover:text-glow"
        >
          💬 {item.commentCount} comment{item.commentCount === 1 ? "" : "s"}
        </Link>
      </div>
    </article>
  );
}
