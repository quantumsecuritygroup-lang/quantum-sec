import Link from "next/link";
import type { PostWithMeta } from "@/lib/data";
import { Avatar } from "./ui/avatar";
import { AdminPostControls } from "./admin-post-controls";
import { timeAgo } from "@/lib/utils";

function totalReactions(r: PostWithMeta["reactions"]): number {
  return Object.values(r).reduce((a, b) => a + b, 0);
}

export function AdminPostRow({ item }: { item: PostWithMeta }) {
  const { post, author } = item;
  return (
    <tr className="border-b border-edge text-sm transition-colors hover:bg-panel/50">
      <td className="max-w-[280px] py-2 px-2">
        <Link
          href={`/post/${post.id}`}
          className="block truncate font-mono text-xs text-ink transition-colors hover:text-glow"
        >
          {post.title || "(untitled)"}
        </Link>
        <p className="mt-0.5 truncate font-mono text-[10px] text-faint">
          {post.content.slice(0, 60)}
        </p>
      </td>
      <td className="py-2 px-2">
        <span className="inline-flex items-center gap-2 font-mono text-xs text-ink">
          <Avatar size="sm" name={author.display_name || author.username} imageUrl={author.avatar_url} />
          <span className="max-w-[120px] truncate">
            {author.display_name || author.username}
          </span>
        </span>
      </td>
      <td className="py-2 px-2 font-mono text-[11px]">
        {post.pinned && <span className="mr-1 text-amber">📌</span>}
        {post.hidden ? (
          <span className="text-amber">HIDDEN</span>
        ) : (
          <span className="text-muted">LIVE</span>
        )}
      </td>
      <td className="py-2 px-2 text-center font-mono text-xs text-muted">
        {item.commentCount}
      </td>
      <td className="py-2 px-2 text-center font-mono text-xs text-muted">
        {totalReactions(item.reactions)}
      </td>
      <td className="py-2 px-2 font-mono text-[11px] text-faint">
        {timeAgo(post.created_at)}
      </td>
      <td className="py-2 px-2">
        <AdminPostControls postId={post.id} pinned={post.pinned} hidden={post.hidden} />
      </td>
    </tr>
  );
}
