"use client";

import { useState, useTransition } from "react";
import { adminSetPost } from "@/lib/actions";

export function AdminPostControls({
  postId,
  pinned,
  hidden,
}: {
  postId: string;
  pinned: boolean;
  hidden: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (action: string) => {
    if (action === "delete" && !window.confirm("Delete this post permanently?")) {
      return;
    }
    const fd = new FormData();
    fd.set("id", postId);
    fd.set("action", action);
    setError(null);
    startTransition(async () => {
      try {
        const res = await adminSetPost(fd);
        if (res?.error) setError(res.error);
      } catch {
        setError("Action failed. Try again.");
      }
    });
  };

  return (
    <div className="flex items-center gap-2 font-mono text-[11px]">
      {pinned ? (
        <button onClick={() => run("unpin")} className="text-amber hover:opacity-70">
          UNPIN
        </button>
      ) : (
        <button onClick={() => run("pin")} className="text-glow hover:opacity-70">
          PIN
        </button>
      )}
      <button
        onClick={() => run(hidden ? "unhide" : "hide")}
        className={hidden ? "text-glow hover:opacity-70" : "text-amber hover:opacity-70"}
      >
        {hidden ? "RESTORE" : "HIDE"}
      </button>
      <button onClick={() => run("delete")} className="text-danger hover:opacity-70">
        DELETE
      </button>
      {pending && <span className="text-faint">...</span>}
      {error && <span className="text-danger">!</span>}
    </div>
  );
}
