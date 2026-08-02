"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function MobileMenu({
  username,
  isAdmin,
}: {
  username?: string;
  isAdmin?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const isActive = (href: string) =>
    href === "/" ? path === "/" : path.startsWith(href);

  const close = () => setOpen(false);

  return (
    <div className="relative sm:hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Toggle menu"
        aria-expanded={open}
        className="border border-edge px-2.5 py-1.5 font-mono text-xs text-muted transition-colors hover:text-glow"
      >
        {open ? "✕" : "☰"}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-52 border border-edge bg-panel p-2 font-mono text-xs">
          <Link
            href="/"
            onClick={close}
            className={`block px-3 py-2 transition-colors ${
              isActive("/")
                ? "bg-glow/15 text-glow"
                : "text-muted hover:text-glow"
            }`}
          >
            INDEX
          </Link>
          <Link
            href="/lobby"
            onClick={close}
            className={`block px-3 py-2 transition-colors ${
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
            onClick={close}
            className="block px-3 py-2 text-[#00d0ff] transition-colors hover:bg-[#00d0ff]/10"
          >
            DATA BREACHES ↗
          </a>
          {username && (
            <>
              <div className="my-2 border-t border-edge" />
              <Link
                href={`/profile/${username}`}
                onClick={close}
                className={`block px-3 py-2 transition-colors ${
                  isActive(`/profile/${username}`)
                    ? "bg-glow/15 text-glow"
                    : "text-muted hover:text-glow"
                }`}
              >
                MY PROFILE
              </Link>
              {isAdmin && (
                <Link
                  href="/root_qsg"
                  onClick={close}
                  className="block px-3 py-2 text-amber transition-colors hover:bg-amber/10"
                >
                  ADMIN PANEL
                </Link>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
