"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  chatHeartbeat,
  getChatRoomInfo,
  getChatUserInfo,
  sendChatMessage,
  toggleChatReaction,
  editChatMessage,
  deleteChatMessage,
  getMoreChatMessages,
  searchChatUsernames,
  adminSetChatRestriction,
  adminDeleteChatMessage,
  type ChatMessageWithAuthor,
  type ChatUserInfo,
} from "@/lib/actions";
import { timeAgo } from "@/lib/utils";
import { getBrowserClient, CHAT_REALTIME_CHANNEL } from "@/lib/supabase";
import { Avatar } from "@/components/ui/avatar";

const POLL_MS = 30000;
const HEARTBEAT_MS = 30000;
const BASE_KEEP = 50;

const CHAT_EMOJIS = ["👍", "❤️", "😂", "🔥", "🎉", "😮", "🤔", "👀"];

interface TextToken {
  type: "text" | "link" | "mention";
  value: string;
}

function splitTokens(text: string): TextToken[] {
  const tokens: TextToken[] = [];
  const re = /(https?:\/\/[^\s]+|www\.[^\s]+|@[A-Za-z0-9_]{1,30})/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) tokens.push({ type: "text", value: text.slice(last, m.index) });
    const v = m[0];
    tokens.push(
      v.startsWith("@")
        ? { type: "mention", value: v }
        : { type: "link", value: v.replace(/[.,;:!?)]+$/, "") }
    );
    last = m.index + v.length;
  }
  if (last < text.length) tokens.push({ type: "text", value: text.slice(last) });
  return tokens;
}

function cleanLink(href: string): string {
  const h = href.startsWith("www.") ? `https://${href}` : href;
  try {
    const u = new URL(h);
    if (u.protocol !== "http:" && u.protocol !== "https:") return h;
    return u.href;
  } catch {
    return h;
  }
}

export function LobbyChat({
  myUsername,
  isAdmin = false,
}: {
  myUsername?: string | null;
  isAdmin?: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessageWithAuthor[]>([]);
  const [online, setOnline] = useState(0);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLInputElement>(null);

  const [selected, setSelected] = useState<ChatMessageWithAuthor | null>(null);
  const [userInfo, setUserInfo] = useState<ChatUserInfo | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [modMsg, setModMsg] = useState<string | null>(null);
  const [mutedNow, setMutedNow] = useState(false);
  const [muteMinutes, setMuteMinutes] = useState(60);
  const [limitPerMin, setLimitPerMin] = useState("");
  const [reason, setReason] = useState("");

  const [replyTarget, setReplyTarget] = useState<ChatMessageWithAuthor | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [olderCount, setOlderCount] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<{ id: string; x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionResults, setMentionResults] = useState<
    { username: string; name: string; isAdmin: boolean }[]
  >([]);
  const mentionSeq = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const room = await getChatRoomInfo();
      setMessages((prev) => {
        const byId = new Map(prev.map((m) => [m.id, m]));
        for (const m of room.messages) byId.set(m.id, m);
        const merged = [...byId.values()];
        return merged.slice(-(BASE_KEEP + olderCount));
      });
      setOnline(room.online);
    } catch {
      // transient error — keep last known state
    }
  }, [olderCount]);

  useEffect(() => {
    const initial = setTimeout(refresh, 0);
    const t = setInterval(refresh, POLL_MS);
    void chatHeartbeat();
    const hb = setInterval(() => void chatHeartbeat(), HEARTBEAT_MS);

    let channel: ReturnType<NonNullable<ReturnType<typeof getBrowserClient>>["channel"]> | null = null;
    const browser = getBrowserClient();
    if (browser) {
      channel = browser
        .channel(CHAT_REALTIME_CHANNEL)
        .on("broadcast", { event: "chat-changed" }, () => refresh())
        .subscribe();
    }

    return () => {
      clearTimeout(initial);
      clearInterval(t);
      clearInterval(hb);
      if (browser && channel) browser.removeChannel(channel);
    };
  }, [refresh]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    if (editingId && editRef.current) editRef.current.focus();
  }, [editingId]);

  useEffect(() => {
    if (!menuFor) return;
    const close = () => setMenuFor(null);
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
  }, [menuFor]);

  const loadOlder = () => {
    const oldest = messages[0];
    if (!oldest || loadingOlder) return;
    setLoadingOlder(true);
    startTransition(async () => {
      try {
        const res = await getMoreChatMessages({ createdAt: oldest.createdAt, id: oldest.id });
        setMessages((prev) => {
          const has = new Set(prev.map((m) => m.id));
          const fresh = res.messages.filter((m) => !has.has(m.id));
          return [...fresh, ...prev];
        });
        setOlderCount((c) => c + res.messages.length);
      } catch {
        // no-op
      } finally {
        setLoadingOlder(false);
      }
    });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    setError(null);
    setReplyTarget(null);
    const targetId = replyTarget?.id ?? null;
    startTransition(async () => {
      try {
        const res = await sendChatMessage(body, targetId);
        if (res?.error) {
          setError(res.error);
          setDraft(body);
          setReplyTarget(targetId ? replyTarget : null);
        } else {
          refresh();
        }
      } catch {
        setError("Could not send message. Try again.");
        setDraft(body);
      }
    });
  };

  const toggleReact = (m: ChatMessageWithAuthor, emoji: string) => {
    if (!myUsername) return;
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("message_id", m.id);
      fd.set("emoji", emoji);
      try {
        const res = await toggleChatReaction(fd);
        if (res?.error) setError(res.error);
        else refresh();
      } catch {
        setError("Failed to react.");
      }
    });
  };

  const startEdit = (m: ChatMessageWithAuthor) => {
    setEditingId(m.id);
    setEditDraft(m.content);
  };

  const saveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    const body = editDraft.trim();
    if (!body) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await editChatMessage(editingId, body);
        if (res?.error) {
          setError(res.error);
        } else {
          setEditingId(null);
          setEditDraft("");
          refresh();
        }
      } catch {
        setError("Failed to edit message.");
      }
    });
  };

  const deleteMessage = (m: ChatMessageWithAuthor) => {
    const own = myUsername != null && m.authorUsername === myUsername;
    const prompt = own ? "Delete this message?" : "Delete this message? (admin)";
    if (!window.confirm(prompt)) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = own
          ? await deleteChatMessage(m.id)
          : await adminDeleteChatMessage(m.id);
        if (res?.error) {
          setError(res.error);
        } else {
          refresh();
        }
      } catch {
        setError("Failed to delete message.");
      }
    });
  };

  const openUser = (m: ChatMessageWithAuthor) => {
    setSelected(m);
    setUserInfo(null);
    setInfoError(null);
    setModMsg(null);
    setReason("");
    setLimitPerMin("");
    startTransition(async () => {
      try {
        const res = await getChatUserInfo(m.authorUsername);
        if (res?.ok && res.user) {
          setUserInfo(res.user);
          setMutedNow(
            res.user.restriction?.mutedUntil != null &&
              new Date(res.user.restriction.mutedUntil).getTime() > Date.now()
          );
          if (res.user.restriction?.limitPerMin != null) {
            setLimitPerMin(String(res.user.restriction.limitPerMin));
          }
        } else {
          setInfoError(res?.error ?? "Could not load user.");
        }
      } catch {
        setInfoError("Could not load user.");
      }
    });
  };

  const runModeration = (fd: FormData) => {
    fd.set("user_id", selected?.authorId ?? "");
    startTransition(async () => {
      try {
        const res = await adminSetChatRestriction(fd);
        if (res?.error) {
          setModMsg(`error: ${res.error}`);
        } else {
          setModMsg("done — restriction saved.");
          if (selected) openUser(selected);
        }
      } catch {
        setModMsg("error: request failed.");
      }
    });
  };

  const onDraftChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setDraft(value);
    const caret = e.target.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const match = before.match(/@([a-zA-Z0-9_]*)$/);
    if (match) {
      const q = match[1];
      setMentionQuery(q);
      const seq = ++mentionSeq.current;
      searchChatUsernames(q).then((res) => {
        if (seq === mentionSeq.current) setMentionResults(res);
      });
    } else {
      mentionSeq.current++;
      setMentionQuery(null);
      setMentionResults([]);
    }
  };

  const insertMention = (username: string) => {
    if (!mentionQuery || inputRef.current == null) return;
    const el = inputRef.current;
    const caret = el.selectionStart ?? draft.length;
    const before = draft.slice(0, caret);
    const after = draft.slice(caret);
    const replaced = before.replace(/@[a-zA-Z0-9_]*$/, `@${username}`);
    const next = `${replaced} ${after}`.replace(/\s+ /g, " ").replace(/^ /, "");
    setDraft(next);
    setMentionQuery(null);
    setMentionResults([]);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(next.length, next.length);
    });
  };

  const oldest = messages[0];
  const myIdIsSet = !!myUsername;

  return (
    <div className="flex h-full flex-col border border-lobby/40 bg-panel">
      <div className="flex items-center justify-between gap-3 border-b border-edge px-4 py-2">
        <p className="whitespace-nowrap font-mono text-[11px] text-lobby">
          $ ./chat — lobby room
        </p>
        <div className="flex shrink-0 items-center gap-3 font-mono text-[11px] text-faint">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-glow" />
            live
          </span>
          <span>
            {online} online
          </span>
          <span>
            {messages.length} msg{messages.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <div className="border-b border-edge bg-lobby/5 px-4 py-1.5 font-mono text-[11px] text-muted">
        Be cool to each other. Bullying &amp; abuse get you muted or blocked.
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="space-y-3">
          {oldest && (
            <div className="text-center">
              <button
                type="button"
                disabled={loadingOlder}
                onClick={loadOlder}
                className="font-mono text-[11px] text-faint transition-colors hover:text-glow disabled:opacity-50"
              >
                {loadingOlder ? "~ loading older..." : "$ load older messages"}
              </button>
            </div>
          )}

          {messages.length === 0 ? (
            <p className="py-6 text-center font-mono text-xs text-faint">
              No messages yet. Say something.
            </p>
          ) : (
            messages.map((m) => {
              const mine = myUsername != null && m.authorUsername === myUsername;
              return (
                <div
                  key={m.id}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (!myIdIsSet) return;
                    setMenuFor({ id: m.id, x: e.clientX, y: e.clientY });
                  }}
                  className={
                    mine
                      ? "rounded-sm bg-glow/5 px-1.5 py-1"
                      : "px-1.5 py-1"
                  }
                >
                  {m.replyPreview && (
                    <div className="mb-1 ml-8 border-l-2 border-edge pl-2 font-mono text-[10px] text-faint">
                      <span className="text-lobby">↩ {m.replyPreview.authorName}</span>{" "}
                      <span className="line-clamp-1 break-all">
                        {m.replyPreview.content}
                      </span>
                    </div>
                  )}

                  <div className="flex items-baseline gap-2">
                    <Avatar name={m.authorName} imageUrl={m.authorAvatar} size="sm" />
                    <button
                      type="button"
                      onClick={() => openUser(m)}
                      title={
                        isAdmin
                          ? "Click to moderate"
                          : `View ${m.authorName}`
                      }
                      className={
                        mine
                          ? "max-w-[9rem] shrink-0 truncate font-mono text-[11px] font-bold text-glow focus-visible:outline focus-visible:outline-1 focus-visible:outline-glow/60"
                          : m.isAdmin
                            ? "max-w-[9rem] shrink-0 truncate font-mono text-[11px] font-bold text-glow focus-visible:outline focus-visible:outline-1 focus-visible:outline-glow/60"
                            : "max-w-[9rem] shrink-0 truncate font-mono text-[11px] font-bold text-lobby transition-colors hover:text-glow focus-visible:outline focus-visible:outline-1 focus-visible:outline-glow/60"
                      }
                    >
                      {m.authorName}
                    </button>
                    {mine ? (
                      <span className="shrink-0 font-mono text-[10px] font-bold text-glow">
                        (you)
                      </span>
                    ) : (
                      m.isAdmin && (
                        <span className="shrink-0 font-mono text-[10px] text-glow">
                          [ADMIN]
                        </span>
                      )
                    )}
                    {m.editedAt && (
                      <span className="shrink-0 font-mono text-[10px] text-faint">
                        (edited)
                      </span>
                    )}
                    <span className="shrink-0 font-mono text-[10px] text-faint">
                      {timeAgo(m.createdAt)}
                    </span>
                    <span className="min-w-0 flex-1 break-words whitespace-pre-wrap font-mono text-xs leading-5 text-ink">
                      {editingId === m.id ? (
                        <form onSubmit={saveEdit} className="flex items-center gap-2">
                          <input
                            ref={editRef}
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            maxLength={400}
                            className="min-w-0 flex-1 border border-glow/50 bg-base px-2 py-0.5 font-mono text-xs text-ink outline-none focus:border-glow"
                          />
                          <button
                            type="submit"
                            disabled={pending || !editDraft.trim()}
                            className="shrink-0 bg-glow px-2 py-0.5 font-mono text-[11px] font-bold text-black disabled:opacity-50"
                          >
                            SAVE
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(null);
                              setEditDraft("");
                            }}
                            className="shrink-0 font-mono text-[11px] text-muted hover:text-glow"
                          >
                            cancel
                          </button>
                        </form>
                      ) : (
                        <MessageText content={m.content} />
                      )}
                    </span>
                  </div>

                    <div className="mt-0.5 flex items-center gap-1 pl-8">
                      {m.reactions
                        .filter((r) => r.count > 0)
                        .map((r) => (
                          <span
                            key={r.emoji}
                            className={`flex items-center gap-0.5 rounded-sm border px-1 py-0.5 font-mono text-[10px] leading-none ${
                              r.mine
                                ? "border-glow/60 bg-glow/10 text-glow"
                                : "border-edge text-muted"
                            }`}
                          >
                            <span>{r.emoji}</span>
                            <span>{r.count}</span>
                          </span>
                        ))}
                    </div>
                </div>
              );
            })
          )}
        </div>
        <div ref={bottomRef} />
      </div>

      {replyTarget && (
        <div className="flex items-center gap-2 border-t border-edge bg-lobby/5 px-3 py-1.5">
          <span className="font-mono text-[10px] text-lobby">
            ↩ replying to {replyTarget.authorName}
          </span>
          <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-faint">
            {replyTarget.content}
          </span>
          <button
            type="button"
            onClick={() => setReplyTarget(null)}
            className="font-mono text-[10px] text-muted transition-colors hover:text-glow"
          >
            ✕
          </button>
        </div>
      )}

      <form
        onSubmit={submit}
        className="relative flex items-center gap-2 border-t border-edge px-3 py-2"
      >
        <span className="font-mono text-xs text-lobby">❯</span>
        <input
          ref={inputRef}
          value={draft}
          onChange={onDraftChange}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setMentionQuery(null);
              setMentionResults([]);
            }
            if (e.key === "Enter" && mentionResults.length > 0) {
              e.preventDefault();
              insertMention(mentionResults[0].username);
            }
          }}
          disabled={pending}
          maxLength={400}
          placeholder="Type a message... (@mention, or URLs auto-link)"
          className="min-w-0 flex-1 border border-edge bg-base px-3 py-1.5 font-mono text-xs text-ink outline-none transition-colors placeholder:text-faint focus:border-glow/50"
        />
        <button
          type="button"
          onClick={() => setEmojiOpen((v) => !v)}
          title="Insert emoji"
          className="shrink-0 border border-edge px-2 py-1 font-mono text-xs text-muted transition-colors hover:border-glow/40 hover:text-glow"
        >
          ☺
        </button>
        <button
          type="submit"
          disabled={pending || !draft.trim()}
          className="shrink-0 bg-glow px-3 py-1.5 font-mono text-xs font-bold text-black transition-colors hover:bg-glowdim disabled:opacity-50"
        >
          {pending ? "SEND..." : "SEND"}
        </button>

        {mentionQuery != null && mentionResults.length > 0 && (
          <div className="absolute bottom-full left-12 z-40 mb-1 max-h-56 w-64 overflow-y-auto border border-edge bg-panel shadow-lg">
            {mentionResults.map((u) => (
              <button
                key={u.username}
                type="button"
                onClick={() => insertMention(u.username)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-xs text-ink transition-colors hover:bg-glow/10"
              >
                <span className="text-lobby">@{u.username}</span>
                {u.isAdmin && <span className="text-[10px] text-glow">[ADMIN]</span>}
                <span className="ml-auto truncate text-[11px] text-faint">{u.name}</span>
              </button>
            ))}
          </div>
        )}

        {emojiOpen && (
          <div className="absolute bottom-full right-3 z-40 mb-1 flex flex-wrap gap-1 border border-edge bg-panel p-2 shadow-lg">
            {CHAT_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  setDraft((d) => d + emoji);
                  setEmojiOpen(false);
                  inputRef.current?.focus();
                }}
                className="px-1.5 py-0.5 text-base transition-colors hover:bg-glow/10"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </form>
      {error && (
        <p className="border-t border-edge px-3 py-1.5 font-mono text-xs text-danger">
          {error}
        </p>
      )}

      {menuFor && (() => {
        const target = messages.find((m) => m.id === menuFor.id);
        if (!target) return null;
        const mine = myUsername != null && target.authorUsername === myUsername;
        const canDelete = mine || isAdmin;
        const menuX = Math.min(menuFor.x, window.innerWidth - 168);
        const menuY = Math.min(menuFor.y, window.innerHeight - 220);
        return (
          <div
            ref={menuRef}
            className="fixed z-50 w-40 border border-edge bg-panel shadow-lg"
            style={{ left: menuX, top: menuY }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap gap-1 border-b border-edge p-1.5">
              {CHAT_EMOJIS.map((emoji) => {
                const active = target.reactions.find((x) => x.emoji === emoji)?.mine;
                return (
                  <button
                    key={emoji}
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setMenuFor(null);
                      toggleReact(target, emoji);
                    }}
                    title={active ? "Remove reaction" : "React"}
                    aria-pressed={active}
                    className={`px-1 py-0.5 text-base transition-colors hover:bg-glow/10 disabled:opacity-50 ${
                      active ? "bg-glow/10" : ""
                    }`}
                  >
                    {emoji}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setMenuFor(null);
                setReplyTarget(target);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-xs text-ink transition-colors hover:bg-glow/10 disabled:opacity-50"
            >
              ↩ reply
            </button>
            {mine && (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setMenuFor(null);
                  startEdit(target);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-xs text-ink transition-colors hover:bg-glow/10 disabled:opacity-50"
              >
                ✎ edit
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setMenuFor(null);
                  deleteMessage(target);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-xs text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
              >
                ✕ delete
              </button>
            )}
          </div>
        );
      })()}

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="w-full max-w-sm border border-lobby/40 bg-panel p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <p className="font-mono text-xs text-lobby">
                $ ./users/{selected.authorUsername}
              </p>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="font-mono text-xs text-muted transition-colors hover:text-glow"
              >
                ✕ close
              </button>
            </div>

            {infoError ? (
              <p className="font-mono text-xs text-danger">{infoError}</p>
            ) : !userInfo ? (
              <p className="font-mono text-xs text-faint">~ loading...</p>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <Avatar
                    name={userInfo.name}
                    imageUrl={userInfo.avatar}
                    size="md"
                  />
                  <div>
                    <p className="font-mono text-sm text-ink">{userInfo.name}</p>
                    <p className="font-mono text-[11px] text-muted">
                      @{userInfo.username}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 font-mono text-[11px]">
                  <span
                    className={`border px-2 py-0.5 ${
                      userInfo.role === "admin"
                        ? "border-glow/50 bg-glow/10 text-glow"
                        : "border-edge bg-base text-muted"
                    }`}
                  >
                    {userInfo.role.toUpperCase()}
                  </span>
                  {userInfo.banned && (
                    <span className="border border-danger/50 bg-danger/10 px-2 py-0.5 text-danger">
                      BANNED
                    </span>
                  )}
                  {mutedNow && (
                    <span className="border border-amber/40 bg-amber/5 px-2 py-0.5 text-amber">
                      MUTED
                    </span>
                  )}
                  {userInfo.restriction?.limitPerMin != null && (
                    <span className="border border-amber/40 bg-amber/5 px-2 py-0.5 text-amber">
                      {userInfo.restriction.limitPerMin}/MIN
                    </span>
                  )}
                </div>

                {isAdmin ? (
                  <div className="mt-4 space-y-3 border-t border-edge pt-3">
                    <p className="font-mono text-[11px] text-glow">
                      $ moderation
                    </p>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] text-muted">
                        mute:
                      </span>
                      <select
                        value={muteMinutes}
                        onChange={(e) => setMuteMinutes(Number(e.target.value))}
                        className="border border-edge bg-base px-2 py-1 font-mono text-xs text-ink outline-none focus:border-glow/50"
                      >
                        <option value={15}>15 min</option>
                        <option value={60}>1 hour</option>
                        <option value={360}>6 hours</option>
                        <option value={1440}>24 hours</option>
                        <option value={10080}>7 days</option>
                        <option value={43200}>30 days</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-muted">
                        limit /min:
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={limitPerMin}
                        onChange={(e) => setLimitPerMin(e.target.value)}
                        placeholder="30"
                        className="w-20 border border-edge bg-base px-2 py-1 font-mono text-xs text-ink outline-none placeholder:text-faint focus:border-glow/50"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-muted">
                        reason:
                      </span>
                      <input
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        maxLength={200}
                        placeholder="optional"
                        className="min-w-0 flex-1 border border-edge bg-base px-2 py-1 font-mono text-xs text-ink outline-none placeholder:text-faint focus:border-glow/50"
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          const fd = new FormData();
                          fd.set("mode", "mute");
                          fd.set("minutes", String(muteMinutes));
                          fd.set("reason", reason);
                          runModeration(fd);
                        }}
                        className="border border-amber/40 bg-amber/5 px-3 py-1.5 font-mono text-xs text-amber transition-colors hover:border-amber/70 disabled:opacity-50"
                      >
                        MUTE
                      </button>
                      <button
                        type="button"
                        disabled={pending || !limitPerMin}
                        onClick={() => {
                          const fd = new FormData();
                          fd.set("mode", "limit");
                          fd.set("limit_per_min", limitPerMin);
                          fd.set("reason", reason);
                          runModeration(fd);
                        }}
                        className="border border-amber/40 bg-amber/5 px-3 py-1.5 font-mono text-xs text-amber transition-colors hover:border-amber/70 disabled:opacity-50"
                      >
                        SET LIMIT
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          const fd = new FormData();
                          fd.set("mode", "clear");
                          fd.set("reason", reason);
                          runModeration(fd);
                        }}
                        className="border border-edge bg-base px-3 py-1.5 font-mono text-xs text-muted transition-colors hover:border-glow/40 hover:text-glow disabled:opacity-50"
                      >
                        CLEAR
                      </button>
                    </div>

                    {modMsg && (
                      <p className="font-mono text-[11px] text-glow">{modMsg}</p>
                    )}
                  </div>
                ) : (
                  <p className="mt-4 border-t border-edge pt-3 font-mono text-[11px] text-faint">
                    Admins can view and moderate this profile.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MessageText({ content }: { content: string }) {
  const tokens = useMemo(() => splitTokens(content), [content]);
  return (
    <>
      {tokens.map((t, i) => {
        if (t.type === "link") {
          return (
            <a
              key={i}
              href={cleanLink(t.value)}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-glow underline underline-offset-2 hover:text-glowdim"
            >
              {t.value}
            </a>
          );
        }
        if (t.type === "mention") {
          return (
            <span key={i} className="text-lobby">
              {t.value}
            </span>
          );
        }
        return <span key={i}>{t.value}</span>;
      })}
    </>
  );
}
