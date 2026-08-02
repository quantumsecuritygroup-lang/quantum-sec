"use client";

import { useState } from "react";

export function ExpandableContent({
  content,
  maxLength = 500,
  full = false,
}: {
  content: string;
  maxLength?: number;
  full?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isTruncated = !full && content.length > maxLength;
  const shown =
    !isTruncated || expanded ? content : `${content.slice(0, maxLength).trimEnd()}…`;

  return (
    <>
      <pre className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink/80">
        {shown}
      </pre>
      {isTruncated && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              setExpanded((v) => !v);
            }
          }}
          className="mt-2 inline-block cursor-pointer font-mono text-xs text-glow underline transition-colors hover:text-glowdim"
        >
          {expanded ? "see less" : "see more"}
        </span>
      )}
    </>
  );
}
