"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";

export function MobileMenu({
  username,
  isAdmin,
}: {
  username?: string;
  isAdmin?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ right: number; top: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const path = usePathname();
  const isActive = (href: string) =>
    href === "/" ? path === "/" : path.startsWith(href);

  const close = () => setOpen(false);

  // Recompute position on scroll/resize while open so the portal doesn't
  // drift away from the button.
  useEffect(() => {
    if (!open) return;
    const update = () => {
      if (buttonRef.current) {
        const r = buttonRef.current.getBoundingClientRect();
        setRect({ right: window.innerWidth - r.right, top: r.bottom + 4 });
      }
    };
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  // Close on outside click/tap or Escape while open.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && menuRef.current.contains(e.target as Node)) return;
      if (buttonRef.current && buttonRef.current.contains(e.target as Node)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("touchstart", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("touchstart", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const openMenu = () => {
    if (buttonRef.current) {
      const r = buttonRef.current.getBoundingClientRect();
      setRect({ right: window.innerWidth - r.right, top: r.bottom + 4 });
    }
    setOpen((o) => !o);
  };

  return (
    <div className="relative sm:hidden">
      <button
        ref={buttonRef}
        onClick={openMenu}
        aria-label="Toggle menu"
        aria-expanded={open}
        className="border border-edge px-2.5 py-1.5 font-mono text-xs text-muted transition-colors hover:text-glow"
      >
        {open ? "✕" : "☰"}
      </button>
      {open &&
        typeof document !== "undefined" &&
        rect &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[100] w-[min(14rem,calc(100vw-1rem))] border border-edge bg-panel p-2 font-mono text-xs shadow-2xl"
            style={{
              right: Math.max(8, Math.min(rect.right, window.innerWidth - 8)),
              top: Math.min(rect.top, window.innerHeight - 8),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <Link
              href="/"
              onClick={close}
              className={`block px-3 py-2 transition-colors ${
                isActive("/") ? "bg-glow/15 text-glow" : "text-muted hover:text-glow"
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
          </div>,
          document.body,
        )}
    </div>
  );
}
