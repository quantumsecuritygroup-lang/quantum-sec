"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { searchPosts, type PostSearchResult } from "@/lib/actions";

export function PostSearch() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PostSearchResult[] | null>(null);
  const [searched, setSearched] = useState(false);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      seq.current += 1;
    };
  }, []);

  const runSearch = (value: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (!value.trim()) {
      seq.current += 1;
      setResults(null);
      setSearched(false);
      return;
    }
    timer.current = setTimeout(() => {
      const mySeq = ++seq.current;
      startTransition(async () => {
        try {
          const res = await searchPosts(value);
          if (mySeq === seq.current) {
            setResults(res);
            setSearched(true);
          }
        } catch {
          if (mySeq === seq.current) {
            setResults(null);
            setSearched(false);
          }
        }
      });
    }, 250);
  };

  return (
    <div className="border border-edge bg-card p-4">
      <label htmlFor="post-search" className="mb-2 block font-mono text-xs text-glow">
        $ find posts
      </label>
      <div className="flex items-center border border-edge bg-base px-2 font-mono text-xs">
        <span className="mr-1 text-glow">$</span>
        <input
          id="post-search"
          type="text"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            runSearch(e.target.value);
          }}
          placeholder="grep -i ..."
          aria-label="Search posts"
          className="w-full bg-transparent py-1.5 text-ink outline-none placeholder:text-faint"
        />
      </div>
      {pending && (
        <p className="mt-2 font-mono text-[11px] text-faint">~ searching...</p>
      )}
      {!pending && searched && results && results.length === 0 && (
        <p className="mt-2 font-mono text-[11px] text-faint">~ no matches.</p>
      )}
      {!pending && results && results.length > 0 && (
        <ul className="mt-2 space-y-1">
          {results.map((r) => (
            <li key={r.id}>
              <Link
                href={`/post/${r.id}`}
                className="block truncate font-mono text-[11px] text-muted transition-colors hover:text-glow"
              >
                <span className={r.scope === "lobby" ? "text-lobby" : "text-glow"}>›</span>{" "}
                {r.title}
              </Link>
              <span className="block truncate font-mono text-[10px] text-faint">
                by {r.authorName}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}