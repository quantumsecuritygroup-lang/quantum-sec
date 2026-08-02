"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toggleReaction, getReactionUsers, type ReactionUser } from "@/lib/actions";
import {
  REACTION_EMOJIS,
  REACTION_META,
  type ReactionEmoji,
  type ReactionMap,
} from "@/lib/supabase";
import { Avatar } from "./ui/avatar";

export function ReactionBar({
  postId,
  commentId,
  reactions,
  myReaction,
  signedIn,
  onError,
}: {
  postId?: string;
  commentId?: string;
  reactions: ReactionMap;
  myReaction: ReactionEmoji | null;
  signedIn: boolean;
  onError?: (msg: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<ReactionUser[]>([]);
  const total = Object.values(reactions).reduce((a, b) => a + b, 0);

  const [activeFilter, setActiveFilter] = useState<ReactionEmoji | null>(null);

  const handle = (emoji: ReactionEmoji) => {
    if (!signedIn) {
      onError?.("You must be signed in to react.");
      return;
    }
    const fd = new FormData();
    if (postId) fd.set("post_id", postId);
    if (commentId) fd.set("comment_id", commentId);
    fd.set("emoji", emoji);
    startTransition(async () => {
      const res = await toggleReaction(fd);
      if (res?.error) onError?.(res.error);
    });
  };

  const loadUsers = async (emoji: ReactionEmoji | null) => {
    if (!targetKey) return;
    setOpen(true);
    setActiveFilter(emoji);
    setLoadingUsers(true);
    const res = await getReactionUsers(
      postId ? { postId } : { commentId }
    );
    setUsers(res);
    setLoadingUsers(false);
  };

  const targetKey = postId ? `post:${postId}` : commentId ? `comment:${commentId}` : null;

  const filtered = activeFilter ? users.filter((u) => u.emoji === activeFilter) : users;

  return (
    <div className="relative">
      <div className="flex items-center gap-1">
        {REACTION_EMOJIS.map((emoji) => {
          const active = myReaction === emoji;
          const count = reactions[emoji] ?? 0;
          return (
            <button
              key={emoji}
              type="button"
              disabled={pending}
              onClick={() => handle(emoji)}
              onMouseEnter={() => loadUsers(emoji)}
              onFocus={() => loadUsers(emoji)}
              title={REACTION_META[emoji].label}
              aria-label={`React with ${REACTION_META[emoji].label}`}
              aria-pressed={active}
              className={`flex items-center gap-1 rounded-sm border px-2 py-1 font-mono text-xs transition-colors disabled:opacity-50 ${
                active
                  ? "border-glow/70 bg-glow/15 text-glow"
                  : "border-edge text-muted hover:border-glow/40 hover:text-glow"
              }`}
            >
              <span>{REACTION_META[emoji].icon}</span>
              {count > 0 && <span>{count}</span>}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => loadUsers(null)}
          aria-label="View who reacted"
          className="ml-2 font-mono text-[11px] text-faint transition-colors hover:text-glow"
        >
          {total} reaction{total === 1 ? "" : "s"}
        </button>
      </div>

      {open && (
        <div
          className="absolute left-0 top-full z-40 mt-2 w-64 max-w-[80vw] border border-edge bg-panel shadow-lg"
          role="dialog"
          aria-label="Reactions"
          onMouseLeave={() => setOpen(false)}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-edge px-3 py-2 font-mono text-xs text-muted">
            <span>
              {activeFilter ? (
                <>
                  {REACTION_META[activeFilter].icon} {REACTION_META[activeFilter].label}
                </>
              ) : (
                "reactions"
              )}
            </span>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="text-faint transition-colors hover:text-glow"
            >
              ✕
            </button>
          </div>
          <div className="flex gap-1 border-b border-edge px-2 py-1.5">
            <FilterChip
              active={activeFilter === null}
              label={`all ${total}`}
              onClick={() => {
                setActiveFilter(null);
              }}
            />
            {REACTION_EMOJIS.map((e) => {
              const c = reactions[e] ?? 0;
              if (c === 0) return null;
              return (
                <FilterChip
                  key={e}
                  active={activeFilter === e}
                  label={`${REACTION_META[e].icon} ${c}`}
                  onClick={() => setActiveFilter(e)}
                />
              );
            })}
          </div>
          <ul className="max-h-56 overflow-y-auto p-1">
            {loadingUsers ? (
              <li className="px-2 py-1 font-mono text-[11px] text-faint">~ loading...</li>
            ) : filtered.length === 0 ? (
              <li className="px-2 py-1 font-mono text-[11px] text-faint">
                no reactions yet
              </li>
            ) : (
              filtered.map((u, i) => (
                <li key={`${u.emoji}-${u.username}-${i}`}>
                  <Link
                    href={`/profile/${u.username}`}
                    className="flex items-center gap-2 rounded-sm px-2 py-1.5 transition-colors hover:bg-panel"
                  >
                    <Avatar size="sm" name={u.name} imageUrl={u.avatar_url} />
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink">
                      {u.name}
                    </span>
                    <span className="font-mono text-sm">{REACTION_META[u.emoji].icon}</span>
                  </Link>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-sm border px-1.5 py-0.5 font-mono text-[10px] transition-colors ${
        active
          ? "border-glow/60 bg-glow/15 text-glow"
          : "border-edge text-muted hover:text-glow"
      }`}
    >
      {label}
    </button>
  );
}