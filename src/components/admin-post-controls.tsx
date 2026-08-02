"use client";

import { useTransition } from "react";
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

  const run = (action: string) => {
    const fd = new FormData();
    fd.set("id", postId);
    fd.set("action", action);
    startTransition(async () => {
      await adminSetPost(fd);
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
    </div>
  );
}
