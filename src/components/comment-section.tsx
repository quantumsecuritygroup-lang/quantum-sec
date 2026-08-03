"use client";

import { useState, useTransition, useRef } from "react";
import Link from "next/link";
import { addComment } from "@/lib/actions";
import type { CommentNode } from "@/lib/data";
import { Avatar } from "./ui/avatar";
import { RoleBadge } from "./ui/role-badge";
import { ReactionBar } from "./reaction-bar";
import { timeAgo } from "@/lib/utils";

export function CommentSection({
  postId,
  comments,
  signedIn,
}: {
  postId: string;
  comments: CommentNode[];
  signedIn: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);

  const submit = (fd: FormData, parentId: string | null = null) => {
    if (inFlight.current) return;
    inFlight.current = true;
    fd.set("post_id", postId);
    if (parentId) fd.set("parent_id", parentId);
    startTransition(async () => {
      try {
        const res = await addComment(fd);
        if (res?.error) setError(res.error);
        else {
          setError(null);
          setReplyingTo(null);
        }
      } catch {
        setError("Could not reach the server. Try again.");
      } finally {
        inFlight.current = false;
      }
    });
  };

  const renderNode = (node: CommentNode, depth: number) => (
    <div key={node.id} className={depth > 0 ? "ml-6 mt-3 border-l border-edge pl-4" : "mt-4"}>
      <div className="border border-edge bg-panel/60 p-3">
        <div className="flex items-center gap-2">
          <Avatar size="sm" name={node.author.display_name || node.author.username} imageUrl={node.author.avatar_url} />
          <Link
            href={`/profile/${node.author.username}`}
            className="font-mono text-xs text-glow hover:underline"
          >
            {node.author.display_name || node.author.username}
          </Link>
          <RoleBadge role={node.author.role} />
          <span className="font-mono text-[10px] text-faint">
            {timeAgo(node.created_at)}
          </span>
        </div>
        <p className="mt-2 whitespace-pre-wrap text-sm text-ink/80">{node.content}</p>
        <div className="mt-2 flex items-center gap-3">
          <ReactionBar
            commentId={node.id}
            reactions={node.reactions}
            myReaction={node.myReaction}
            signedIn={signedIn}
            onError={(m) => setError(m)}
          />
          {signedIn && (
            <button
              type="button"
              onClick={() => setReplyingTo(replyingTo === node.id ? null : node.id)}
              className="font-mono text-[11px] text-muted transition-colors hover:text-glow"
            >
              {replyingTo === node.id ? "CANCEL" : "REPLY"}
            </button>
          )}
        </div>
        {replyingTo === node.id && (
          <CommentForm parentId={node.id} autoFocus />
        )}
        {node.replies.map((r) => renderNode(r, depth + 1))}
      </div>
    </div>
  );

  const CommentForm = ({
    parentId,
    autoFocus,
  }: {
    parentId: string | null;
    autoFocus?: boolean;
  }) => (
    <form
      className="mt-2 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit(new FormData(e.currentTarget), parentId);
        e.currentTarget.reset();
      }}
    >
      <input
        name="content"
        required
        placeholder={parentId ? "Write a reply..." : "Write a comment..."}
        autoFocus={autoFocus}
        maxLength={2000}
        className="flex-1 border border-edge bg-base px-3 py-1.5 font-mono text-xs text-ink outline-none transition-colors placeholder:text-faint focus:border-glow/50"
      />
      <button
        disabled={pending}
        className="bg-glow px-3 py-1.5 font-mono text-xs text-black transition-colors hover:bg-glowdim disabled:opacity-50"
      >
        {pending ? "..." : parentId ? "REPLY" : "POST"}
      </button>
    </form>
  );

  return (
    <section className="mt-8">
      <h3 className="mb-2 font-mono text-sm text-glow">
        $ comments ({comments.length})
      </h3>
      {!signedIn && (
        <p className="mb-3 font-mono text-xs text-muted">
          <Link href="/sign-in" className="text-glow hover:underline">
            Sign in
          </Link>{" "}
          to join the discussion.
        </p>
      )}
      {signedIn && <CommentForm parentId={null} />}
      {error && <p className="mt-2 font-mono text-xs text-danger">{error}</p>}
      {comments.length === 0 ? (
        <p className="mt-4 font-mono text-xs text-faint">
          No comments yet. Be the first.
        </p>
      ) : (
        comments.map((c) => renderNode(c, 0))
      )}
    </section>
  );
}
