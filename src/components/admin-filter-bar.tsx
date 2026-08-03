"use client";

import { useRouter } from "next/navigation";

export function AdminFilterBar({
  q,
  status,
}: {
  q: string;
  status: string;
}) {
  const router = useRouter();

  const apply = (patch: Record<string, string>) => {
    const sp = new URLSearchParams();
    const next = { q, status, ...patch };
    if (next.q) sp.set("q", next.q);
    if (next.status !== "all") sp.set("status", next.status);
    const qs = sp.toString();
    router.push(qs ? `/root_qsg?${qs}` : "/root_qsg");
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          apply({ q: String(fd.get("q") ?? "") });
        }}
        className="flex items-center gap-2"
      >
        <input
          key={q}
          name="q"
          defaultValue={q}
          placeholder="search posts..."
          className="w-56 border border-edge bg-base px-3 py-1.5 font-mono text-xs text-ink outline-none transition-colors placeholder:text-faint focus:border-glow/50"
        />
        <button
          type="submit"
          className="border border-glow/40 bg-glow/10 px-3 py-1.5 font-mono text-xs text-glow transition-colors hover:bg-glow/20"
        >
          SEARCH
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-1 font-mono text-[11px]">
        {(["all", "visible", "hidden", "pinned"] as const).map((s) => (
          <button
            key={s}
            onClick={() => apply({ status: s })}
            className={`px-2 py-1 transition-colors ${
              status === s
                ? "bg-glow/20 text-glow"
                : "text-muted hover:text-glow"
            }`}
          >
            {s.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}
