"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  getNotifications,
  getGlobalActivity,
  markNotificationsRead,
  markNotificationRead,
  type NotificationItem,
  type GlobalActivityItem,
} from "@/lib/actions";
import { getBrowserClient, NOTIFICATIONS_REALTIME_CHANNEL, REACTION_META } from "@/lib/supabase";
import { Avatar } from "@/components/ui/avatar";
import { timeAgo } from "@/lib/utils";

const POLL_MS = 30000;

function notificationIcon(type: NotificationItem["type"], detail: string): string {
  switch (type) {
    case "post_reaction":
    case "comment_reaction":
      return REACTION_META[detail as keyof typeof REACTION_META]?.icon ?? "👀";
    case "post_comment":
      return "💬";
    case "comment_reply":
      return "↩️";
    case "follow":
      return "➕";
    case "moderation":
      switch (detail) {
        case "banned":
          return "⛔";
        case "muted":
          return "🔇";
        case "unbanned":
          return "✅";
        case "comment_hidden":
        case "post_hidden":
          return "🚫";
        default:
          return "🛠️";
      }
  }
}

function mineTitle(n: NotificationItem): string {
  switch (n.type) {
    case "post_reaction":
      return "reacted to your post";
    case "comment_reaction":
      return "reacted to your comment";
    case "post_comment":
      return "commented on your post";
    case "comment_reply":
      return "replied to your comment";
    case "follow":
      return "started following you";
    case "moderation":
      switch (n.detail) {
        case "post_hidden":
          return "your post was hidden";
        case "comment_hidden":
          return "your comment was hidden";
        case "banned":
          return "your account was banned";
        case "unbanned":
          return "your account was unbanned";
        case "muted":
          return "you were muted";
        default:
          return "moderation action";
      }
  }
}

function globalTitle(a: GlobalActivityItem): string {
  const actor = a.actorName;
  const target = a.recipientName;
  switch (a.type) {
    case "post_reaction":
      return `${actor} reacted to ${target}'s post`;
    case "comment_reaction":
      return `${actor} reacted to ${target}'s comment`;
    case "post_comment":
      return `${actor} commented on ${target}'s post`;
    case "comment_reply":
      return `${actor} replied to ${target}'s comment`;
    case "follow":
      return `${actor} followed ${target}`;
    case "moderation":
      switch (a.detail) {
        case "post_hidden":
          return `hidden: ${target}'s post`;
        case "comment_hidden":
          return `hidden: ${target}'s comment`;
        case "banned":
          return `banned ${target}`;
        case "unbanned":
          return `unbanned ${target}`;
        case "muted":
          return `muted ${target}`;
        default:
          return `moderated ${target}`;
      }
  }
}

export function NotificationBell({
  isAdmin,
  canUseRealtime = true,
}: {
  isAdmin?: boolean;
  canUseRealtime?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"mine" | "global">("mine");
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [globalItems, setGlobalItems] = useState<GlobalActivityItem[]>([]);
  const [unread, setUnread] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [rect, setRect] = useState<{ right: number; top: number } | null>(null);
  const seq = useRef(0);
  const openRef = useRef(false);
  const tabRef = useRef<"mine" | "global">("mine");

  useEffect(() => {
    openRef.current = open;
    tabRef.current = tab;
  }, [open, tab]);

  const refreshMine = useCallback(async () => {
    const s = ++seq.current;
    try {
      const res = await getNotifications();
      if (s !== seq.current) return;
      setItems(res.items);
      setUnread(res.unread);
    } catch {
      // ignore transient errors
    }
  }, []);

  const refreshGlobal = useCallback(async () => {
    if (!isAdmin) return;
    const s = ++seq.current;
    try {
      const res = await getGlobalActivity();
      if (s !== seq.current) return;
      setGlobalItems(res.items);
    } catch {
      // ignore
    }
  }, [isAdmin]);

  const refresh = useCallback(() => {
    void refreshMine();
    if (isAdmin && openRef.current && tabRef.current === "global") void refreshGlobal();
  }, [refreshMine, refreshGlobal, isAdmin]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      // Only mark personal notifications read when the user is actually
      // viewing their own feed — opening the admin GLOBAL tab must not
      // clear a user's unread badge.
      if (tabRef.current === "mine") {
        await markNotificationsRead();
        if (cancelled) return;
      }
      refresh();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    const initial = setTimeout(() => {
      void refreshMine();
      if (isAdmin) void refreshGlobal();
    }, 0);
    let channel: ReturnType<NonNullable<ReturnType<typeof getBrowserClient>>["channel"]> | null = null;
    const browser = getBrowserClient();
    if (canUseRealtime && browser) {
      channel = browser
        .channel(NOTIFICATIONS_REALTIME_CHANNEL)
        .on("broadcast", { event: "notifications-changed" }, () => refresh())
        .subscribe();
    }
    return () => {
      clearTimeout(initial);
      if (browser && channel) browser.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && menuRef.current.contains(e.target as Node)) return;
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

  const openNotification = (item: NotificationItem) => {
    setOpen(false);
    void markNotificationRead(item.id);
    router.push(item.href);
  };

  const openGlobal = (a: GlobalActivityItem) => {
    setOpen(false);
    router.push(a.href);
  };

  // Recompute position on scroll/resize while open so the portal doesn't
  // drift away from the bell.
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

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          if (!open && buttonRef.current) {
            const r = buttonRef.current.getBoundingClientRect();
            setRect({ right: window.innerWidth - r.right, top: r.bottom + 4 });
          }
          setOpen((v) => !v);
        }}
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
        aria-expanded={open}
        className="relative border border-edge px-2.5 py-1.5 font-mono text-sm text-muted transition-colors hover:text-glow"
      >
        <span aria-hidden="true">🔔</span>
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 font-mono text-[10px] font-bold text-black">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open &&
        typeof document !== "undefined" &&
        rect &&
        createPortal(
          (() => {
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const right = Math.max(8, Math.min(rect.right, vw - 8));
            const spaceBelow = vh - rect.top;
            const flipUp = spaceBelow < 280 && rect.top > 280;
            const style: React.CSSProperties = flipUp
              ? { right, bottom: vh - rect.top + 8 }
              : { right, top: Math.min(rect.top, vh - 8) };
            return (
              <div
                ref={menuRef}
                className="fixed z-[100] flex max-h-[min(70vh,28rem)] w-[min(22rem,calc(100vw-1rem))] flex-col border border-edge bg-panel shadow-2xl"
                style={style}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex shrink-0 items-center justify-between border-b border-edge px-3 py-2">
                  <p className="font-mono text-xs text-glow">$ notifications</p>
                  <div className="flex items-center gap-2">
                    {isAdmin && (
                      <div className="flex gap-1 font-mono text-[10px]">
                        <button
                          type="button"
                          onClick={() => setTab("mine")}
                          className={`border px-2 py-0.5 transition-colors ${
                            tab === "mine"
                              ? "border-glow/60 bg-glow/10 text-glow"
                              : "border-edge text-muted hover:text-glow"
                          }`}
                        >
                          MINE
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setTab("global");
                            refreshGlobal();
                          }}
                          className={`border px-2 py-0.5 transition-colors ${
                            tab === "global"
                              ? "border-glow/60 bg-glow/10 text-glow"
                              : "border-edge text-muted hover:text-glow"
                          }`}
                        >
                          GLOBAL
                        </button>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      aria-label="Close notifications"
                      className="font-mono text-xs text-muted transition-colors hover:text-glow"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-2">
                  {tab === "mine" ? (
                    items.length === 0 ? (
                      <p className="py-6 text-center font-mono text-xs text-faint">
                        No notifications yet.
                      </p>
                    ) : (
                      <ul className="space-y-1">
                        {items.map((n) => (
                          <li key={n.id}>
                            <button
                              type="button"
                              onClick={() => openNotification(n)}
                              className="flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-glow/10"
                            >
                              <Avatar size="sm" name={n.actorName} imageUrl={n.actorAvatar} />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-mono text-[11px] text-ink">
                                  <span className="font-bold text-glow">{n.actorName}</span>{" "}
                                  {mineTitle(n)}
                                </span>
                                <span className="mt-0.5 block font-mono text-[10px] text-faint">
                                  {timeAgo(n.createdAt)}
                                  {n.detail && (n.type === "post_reaction" || n.type === "comment_reaction") ? (
                                    <>
                                      {" · "}
                                      {REACTION_META[n.detail as keyof typeof REACTION_META]?.label ?? ""}
                                    </>
                                  ) : null}
                                </span>
                              </span>
                              <span aria-hidden="true" className="shrink-0 text-base">
                                {notificationIcon(n.type, n.detail)}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )
                  ) : globalItems.length === 0 ? (
                    <p className="py-6 text-center font-mono text-xs text-faint">
                      No recent activity.
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {globalItems.map((a) => (
                        <li key={a.id}>
                          <button
                            type="button"
                            onClick={() => openGlobal(a)}
                            className="flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-glow/10"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block break-words font-mono text-[11px] text-ink">
                                {globalTitle(a)}
                              </span>
                              <span className="mt-0.5 block font-mono text-[10px] text-faint">
                                {timeAgo(a.createdAt)}
                              </span>
                            </span>
                            <span aria-hidden="true" className="shrink-0 text-base">
                              {notificationIcon(a.type, a.detail)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            );
          })(),
          document.body
        )}
    </div>
  );
}