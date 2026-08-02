"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks() {
  const path = usePathname();
  const isActive = (href: string) =>
    href === "/" ? path === "/" : path.startsWith(href);

  return (
    <div className="hidden items-center gap-1 font-mono text-xs sm:flex">
      <Link
        href="/"
        aria-current={isActive("/") ? "page" : undefined}
        className={`px-3 py-1.5 transition-colors ${
          isActive("/")
            ? "bg-glow/15 text-glow"
            : "text-muted hover:text-glow"
        }`}
      >
        INDEX
      </Link>
      <Link
        href="/lobby"
        aria-current={isActive("/lobby") ? "page" : undefined}
        className={`px-3 py-1.5 transition-colors ${
          isActive("/lobby")
            ? "bg-lobby/15 text-lobby"
            : "text-muted hover:text-lobby"
        }`}
      >
        LOBBY
      </Link>
      <a
        href="https://quantum-sec-group.blogspot.com/"
        target="_blank"
        rel="noopener noreferrer"
        className="px-3 py-1.5 text-[#00d0ff] transition-colors hover:bg-[#00d0ff]/10"
      >
        DATA BREACHES ↗
      </a>
    </div>
  );
}
