"use client";

import { useState, useTransition } from "react";
import { loadMorePosts } from "@/lib/actions";
import { PostCard } from "@/components/post-card";
import type { PostWithMeta } from "@/lib/data";

export interface PostFeedCursor {
  createdAt: string;
  id: string;
}

export interface PostFeedInitial {
  pinned: PostWithMeta[];
  items: PostWithMeta[];
  nextCursor: PostFeedCursor | null;
}

export function PostFeed({
  scope,
  canModerate,
  signedIn,
  initial,
}: {
  scope: "main" | "lobby";
  canModerate: boolean;
  signedIn: boolean;
  initial: PostFeedInitial;
}) {
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const loadMore = () => {
    if (!cursor) return;
    startTransition(async () => {
      try {
        const res = await loadMorePosts(scope, cursor);
        setItems((prev) => [...prev, ...res.items]);
        setCursor(res.nextCursor);
      } catch {
        setError("Failed to load more posts.");
      }
    });
  };

  return (
    <>
      {initial.pinned.length > 0 && (
        <div className="space-y-4">
          {initial.pinned.map((item) => (
            <PostCard
              key={item.post.id}
              item={item}
              canModerate={canModerate}
              signedIn={signedIn}
            />
          ))}
        </div>
      )}
      <div className="space-y-4">
        {items.map((item) => (
          <PostCard
            key={item.post.id}
            item={item}
            canModerate={canModerate}
            signedIn={signedIn}
          />
        ))}
      </div>
      {cursor ? (
        <div className="pt-1 text-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={pending}
            className="border border-edge bg-card px-6 py-2 font-mono text-xs text-glow transition-colors hover:border-glow/40 disabled:opacity-50"
          >
            {pending ? "LOADING..." : "LOAD MORE"}
          </button>
        </div>
      ) : null}
      {error && (
        <p className="pt-2 text-center font-mono text-xs text-danger">{error}</p>
      )}
    </>
  );
}
