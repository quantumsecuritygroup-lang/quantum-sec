"use client";

import { useState } from "react";
import Image from "next/image";

export function ImageGrid({ urls }: { urls: string[] }) {
  const [open, setOpen] = useState<string | null>(null);

  if (!urls?.length) return null;
  const cols = urls.length === 1 ? "grid-cols-1" : "grid-cols-2";

  return (
    <>
      <div className={`mt-3 grid gap-2 ${cols}`}>
        {urls.map((url) => (
          <button
            key={url}
            type="button"
            onClick={() => setOpen(url)}
            aria-label="View image full size"
            className="block border border-edge transition-colors hover:border-glow/50"
          >
            <Image
              src={url}
              alt="post image"
              width={800}
              height={600}
              className="h-auto w-full object-cover"
            />
          </button>
        ))}
      </div>
      {open && (
        <div
          onClick={() => setOpen(null)}
          className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={open}
            alt="post image full size"
            className="max-h-[90vh] max-w-full object-contain"
          />
        </div>
      )}
    </>
  );
}