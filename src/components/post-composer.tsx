"use client";

import { useRef, useState, useTransition } from "react";
import { createPost } from "@/lib/actions";
import { CATEGORIES } from "@/lib/supabase";

export function PostComposer() {
  const [images, setImages] = useState<File[]>([]);
  const [msg, setMsg] = useState<{ ok?: boolean; error?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const submit = (fd: FormData) => {
    startTransition(async () => {
      const res = await createPost(fd);
      if (res?.error) {
        setMsg({ error: res.error });
      } else {
        setMsg({ ok: true });
        setImages([]);
        formRef.current?.reset();
      }
    });
  };

  return (
    <div className="border border-glow/40 bg-panel p-4">
      <p className="mb-3 font-mono text-xs text-glow">$ compose new post</p>
      <form ref={formRef} action={submit} className="space-y-3">
        <input
          name="title"
          placeholder="Title (optional)"
          maxLength={120}
          className="w-full border border-edge bg-base px-3 py-2 font-mono text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-glow/50"
        />
        <textarea
          name="content"
          required
          placeholder="Write your post... (authorized members only)"
          rows={4}
          maxLength={5000}
          className="w-full resize-y border border-edge bg-base px-3 py-2 font-mono text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-glow/50"
        />
        <div className="flex flex-wrap items-center gap-3">
          <select
            name="category"
            defaultValue="announcement"
            className="border border-edge bg-base px-3 py-2 font-mono text-xs text-ink outline-none transition-colors focus:border-glow/50"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c} className="bg-base">
                {c.toUpperCase()}
              </option>
            ))}
          </select>
          <label className="cursor-pointer border border-edge px-3 py-2 font-mono text-xs text-muted transition-colors hover:border-glow/40 hover:text-glow">
            + IMAGE(S)
            <input
              type="file"
              name="images"
              accept="image/jpeg,image/png,image/gif,image/webp"
              multiple
              className="hidden"
              onChange={(e) =>
                setImages(Array.from(e.target.files ?? []).slice(0, 12))
              }
            />
          </label>
          {images.length > 0 && (
            <span className="font-mono text-[11px] text-muted">
              {images.length}/12 images
            </span>
          )}
          <button
            type="submit"
            disabled={pending}
            className="ml-auto bg-glow px-4 py-2 font-mono text-xs font-bold text-black transition-colors hover:bg-glowdim disabled:opacity-50"
          >
            {pending ? "POSTING..." : "POST"}
          </button>
        </div>
        {msg?.ok && (
          <p className="font-mono text-xs text-glow">Post published.</p>
        )}
        {msg?.error && (
          <p className="font-mono text-xs text-danger">{msg.error}</p>
        )}
      </form>
    </div>
  );
}
