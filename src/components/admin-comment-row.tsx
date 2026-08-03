"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { adminSetComment } from "@/lib/actions";
import type { AdminCommentWithAuthor } from "@/lib/data";
import { LinkPreview } from "./link-preview";
import { timeAgo } from "@/lib/utils";

export function AdminCommentRow({
  comment,
}: {
  comment: AdminCommentWithAuthor;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (action: string) => {
    if (action === "delete" && !window.confirm("Delete this comment permanently?")) return;
    const fd = new FormData();
    fd.set("id", comment.id);
    fd.set("action", action);
    setError(null);
    startTransition(async () => {
      try {
        const res = await adminSetComment(fd);
        if (res?.error) setError(res.error);
      } catch {
        setError("Action failed. Try again.");
      }
    });
  };
  return (
    <tr className="border-b border-edge text-sm">
      <td className="py-2 px-2 font-mono text-xs text-muted">
        {comment.author.display_name || comment.author.username}
        <p className="mt-0.5 text-[10px] text-faint">{timeAgo(comment.created_at)}</p>
      </td>
      <td className="py-2 px-2 text-xs text-ink/80">
        {comment.hidden ? (
          <span className="text-amber">[HIDDEN] </span>
        ) : null}
        <LinkPreview text={comment.content} />
      </td>
      <td className="py-2 px-2">
        <div className="flex items-center gap-2 font-mono text-[11px]">
          <button
            onClick={() => run(comment.hidden ? "unhide" : "hide")}
            disabled={pending}
            className={comment.hidden ? "text-glow hover:opacity-70" : "text-amber hover:opacity-70 disabled:opacity-30"}
          >
            {comment.hidden ? "RESTORE" : "HIDE"}
          </button>
          <button
            onClick={() => run("delete")}
            disabled={pending}
            className="text-danger hover:opacity-70 disabled:opacity-30"
          >
            DELETE
          </button>
          {comment.post_id && (
            <Link
              href={`/post/${comment.post_id}`}
              className="text-faint underline hover:text-glow"
            >
              VIEW POST
            </Link>
          )}
          {pending && <span className="text-faint">...</span>}
        </div>
        {error && (
          <p className="mt-1 font-mono text-[10px] text-danger">! {error}</p>
        )}
      </td>
    </tr>
  );
}
