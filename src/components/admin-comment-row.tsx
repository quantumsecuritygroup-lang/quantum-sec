"use client";

import { useTransition } from "react";
import { adminSetComment } from "@/lib/actions";
import type { AdminCommentRow } from "@/lib/data";
import { LinkPreview } from "./link-preview";

export function AdminCommentRow({
  comment,
}: {
  comment: AdminCommentRow;
}) {
  const [pending, startTransition] = useTransition();
  const run = (action: string) => {
    const fd = new FormData();
    fd.set("id", comment.id);
    fd.set("action", action);
    startTransition(async () => {
      await adminSetComment(fd);
    });
  };
  return (
    <tr className="border-b border-edge text-sm">
      <td className="py-2 px-2 font-mono text-xs text-muted">
        {comment.author.display_name || comment.author.username}
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
            className={comment.hidden ? "text-glow" : "text-amber hover:opacity-70"}
          >
            {comment.hidden ? "RESTORE" : "HIDE"}
          </button>
          <button onClick={() => run("delete")} className="text-danger hover:opacity-70">
            DELETE
          </button>
          {pending && <span className="text-faint">...</span>}
        </div>
      </td>
    </tr>
  );
}
