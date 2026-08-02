"use client";

import { useRef, useState, useTransition } from "react";
import { createPost } from "@/lib/actions";

export function LobbyComposer() {
  const [open, setOpen] = useState(false);
  const [image, setImage] = useState<File | null>(null);
  const [msg, setMsg] = useState<{ ok?: boolean; error?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const submit = (fd: FormData) => {
    fd.set("scope", "lobby");
    startTransition(async () => {
      const res = await createPost(fd);
      if (res?.error) {
        setMsg({ error: res.error });
      } else {
        setMsg({ ok: true });
        setImage(null);
        formRef.current?.reset();
        setOpen(false);
      }
    });
  };

  return (
    <div className="border border-lobby/40 bg-panel p-4">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="w-full text-left font-mono text-xs text-lobby transition-colors hover:text-glow"
        >
          $ create a post 
        </button>
      ) : (
        <form ref={formRef} action={submit} className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-mono text-xs text-lobby">$ post to the lobby</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="font-mono text-xs text-muted transition-colors hover:text-glow"
            >
              ✕ close
            </button>
          </div>
        <input
          name="title"
          placeholder="Title (optional)"
          maxLength={120}
          className="w-full border border-edge bg-base px-3 py-2 font-mono text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-glow/50"
        />
        <textarea
          name="content"
          required
          placeholder="Say something to the community..."
          rows={4}
          maxLength={5000}
          className="w-full resize-y border border-edge bg-base px-3 py-2 font-mono text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-glow/50"
        />
        <div className="flex flex-wrap items-center gap-3">
          <select
            name="category"
            defaultValue="discussion"
            className="border border-edge bg-base px-3 py-2 font-mono text-xs text-ink outline-none transition-colors focus:border-glow/50"
          >
            <option value="discussion" className="bg-base">
              DISCUSSION
            </option>
            <option value="event" className="bg-base">
              EVENT
            </option>
            <option value="announcement" className="bg-base">
              ANNOUNCEMENT
            </option>
          </select>
          <label className="cursor-pointer border border-edge px-3 py-2 font-mono text-xs text-muted transition-colors hover:border-glow/40 hover:text-glow">
            + IMAGE
            <input
              type="file"
              name="images"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="hidden"
              onChange={(e) => setImage(e.target.files?.[0] ?? null)}
            />
          </label>
          {image && (
            <span className="font-mono text-[11px] text-muted">
              1/1 image selected
            </span>
          )}
          <button
            type="submit"
            disabled={pending}
            className="ml-auto bg-glow px-4 py-2 font-mono text-xs font-bold text-black transition-colors hover:bg-glowdim disabled:opacity-50"
          >
            {pending ? "POSTING..." : "POST TO LOBBY"}
          </button>
        </div>
        {msg?.ok && (
          <p className="font-mono text-xs text-glow">Posted to the lobby.</p>
        )}
        {msg?.error && (
          <p className="font-mono text-xs text-danger">{msg.error}</p>
        )}
        </form>
      )}
    </div>
  );
}
