import Link from "next/link";
import { getSiteStats } from "@/lib/data";
import { PostSearch } from "./post-search";

export async function SideRailRight({ variant = "home" }: { variant?: "home" | "lobby" }) {
  const stats = await getSiteStats();
  const rows: { label: string; value: number }[] = [
    { label: "MEMBERS", value: stats.users },
    { label: "POSTS", value: stats.posts },
    { label: "COMMENTS", value: stats.comments },
    { label: "REACTIONS", value: stats.reactions },
  ];

  return (
    <aside className="hidden w-full space-y-4 lg:block">
      {variant === "home" && <PostSearch />}

      <div className="border border-edge bg-card p-4">
        <p className="mb-3 font-mono text-xs text-glow">$ uptime &amp; stats</p>
        <div className="space-y-2">
          {rows.map((r) => (
            <div
              key={r.label}
              className="flex items-center justify-between font-mono text-xs"
            >
              <span className="text-muted">{r.label}</span>
              <span className="text-glow">{r.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="border border-edge bg-card p-4">
        <p className="mb-2 font-mono text-xs text-glow">$ quick nav</p>
        <nav className="flex flex-col gap-1 font-mono text-xs">
          <Link href="/" className="text-muted transition-colors hover:text-glow">
            ./index
          </Link>
          <Link href="/lobby" className="text-muted transition-colors hover:text-lobby">
            ./lobby
          </Link>
          <a
            href="https://quantum-sec-group.blogspot.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted transition-colors hover:text-glow"
          >
            ./data-breaches ↗
          </a>
        </nav>
      </div>

      {variant === "home" && (
        <div className="border border-edge bg-card p-4">
          <p className="mb-3 font-mono text-xs text-glow">$ mission</p>
          <ul className="space-y-2 font-mono text-[11px] leading-5 text-muted">
            <li className="flex items-start gap-2">
              <span className="text-glow">›</span>
              <span>Share &amp; archive work</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-glow">›</span>
              <span>Open lobby for the community</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-glow">›</span>
              <span>Stay off the platform kill switch</span>
            </li>
          </ul>
        </div>
      )}

      <div className="border border-edge bg-card p-4">
        <p className="mb-2 font-mono text-xs text-glow">$ channels</p>
        <nav className="flex flex-col gap-1.5 font-mono text-xs">
          <a
            href="https://www.facebook.com/quantumsecuritygroup"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-muted transition-colors hover:text-glow"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5 shrink-0 fill-current opacity-80"
              aria-hidden="true"
            >
              <path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0 0 22 12Z" />
            </svg>
            facebook
          </a>
          <a
            href="https://x.com/QuantumSecPH"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-muted transition-colors hover:text-glow"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5 shrink-0 fill-current opacity-80"
              aria-hidden="true"
            >
              <path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3l-4.9-6.4L6.4 22H3.3l7.3-8.3L1.6 2H8l4.4 5.8L18.9 2Zm-1.1 18h1.7L7.1 3.9H5.3L17.8 20Z" />
            </svg>
            x (twitter)
          </a>
          <a
            href="https://t.me/QuantumSecPH"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-muted transition-colors hover:text-glow"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5 shrink-0 fill-current opacity-80"
              aria-hidden="true"
            >
              <path d="M21.9 4.3 18.9 19c-.2 1-.8 1.2-1.7.8l-4.6-3.4-2.2 2.1c-.2.3-.5.5-.9.5l.3-4.7L18.3 6c.4-.3-.1-.5-.6-.2L6.6 12.4l-4.5-1.4c-1-.3-1-1 .2-1.4L20.7 2.9c.8-.3 1.6.2 1.2 1.4Z" />
            </svg>
            telegram
          </a>
        </nav>
      </div>
    </aside>
  );
}
