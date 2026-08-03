"use client";

import Link from "next/link";

const URL_RE = /(https?:\/\/[^\s]+)/;

export function LinkPreview({ text, limit = 140 }: { text: string; limit?: number }) {
  const truncated =
    text.length > limit ? `${text.slice(0, limit)}...` : text;
  const parts = truncated.split(URL_RE);
  return (
    <>
      {parts.map((part, i) =>
        URL_RE.test(part) ? (
          <Link
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-glow underline decoration-glow/40 hover:decoration-glow"
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </Link>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}
