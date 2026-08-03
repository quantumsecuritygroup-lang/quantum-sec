"use client";

import { useState, useTransition } from "react";
import {
  adminAddRosterMember,
  adminUpdateRosterMember,
  adminDeleteRosterMember,
  adminReorderRosterMember,
} from "@/lib/actions";
import type { RosterMember } from "@/lib/supabase";

export function AdminRosterManager({ initial }: { initial: RosterMember[] }) {
  const [members, setMembers] = useState<RosterMember[]>(initial);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ ok?: boolean; error?: string; member?: RosterMember }>) => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fn();
        if (res?.error) setError(res.error);
      } catch {
        setError("Action failed. Try again.");
      }
    });
  };

  const add = () => {
    const name = draft.trim();
    if (!name) return;
    const fd = new FormData();
    fd.set("name", name);
    run(async () => {
      const res = await adminAddRosterMember(fd);
      if (!res.error && res.member) {
        setMembers((prev) => [...prev, res.member!]);
        setDraft("");
      }
      return res;
    });
  };

  const saveEdit = () => {
    if (!editingId) return;
    const name = editDraft.trim();
    if (!name) return;
    const fd = new FormData();
    fd.set("id", editingId);
    fd.set("name", name);
    run(async () => {
      const res = await adminUpdateRosterMember(fd);
      if (!res.error) {
        setMembers((prev) =>
          prev.map((x) => (x.id === editingId ? { ...x, name } : x))
        );
        setEditingId(null);
        setEditDraft("");
      }
      return res;
    });
  };

  const remove = (m: RosterMember) => {
    if (!window.confirm(`Remove ${m.name} from the roster?`)) return;
    const fd = new FormData();
    fd.set("id", m.id);
    run(async () => {
      const res = await adminDeleteRosterMember(fd);
      if (!res.error) setMembers((prev) => prev.filter((x) => x.id !== m.id));
      return res;
    });
  };

  const reorder = (m: RosterMember, dir: "up" | "down") => {
    const fd = new FormData();
    fd.set("id", m.id);
    fd.set("dir", dir);
    run(async () => {
      const res = await adminReorderRosterMember(fd);
      if (!res.error) {
        setMembers((prev) => {
          const idx = prev.findIndex((x) => x.id === m.id);
          if (idx === -1) return prev;
          const swap = dir === "up" ? idx - 1 : idx + 1;
          if (swap < 0 || swap >= prev.length) return prev;
          const next = prev.slice();
          [next[idx], next[swap]] = [next[swap], next[idx]];
          return next;
        });
      }
      return res;
    });
  };

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-mono text-sm text-glow">
          $ operators roster <span className="text-faint">(members.txt)</span>
        </h2>
        <span className="font-mono text-[10px] tracking-widest text-muted">
          {members.length} total
        </span>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 border border-glow/30 bg-panel/50 p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="operator handle…"
          maxLength={40}
          className="min-w-0 flex-1 border border-edge bg-card px-2 py-1.5 font-mono text-xs text-ink placeholder:text-faint focus:border-glow/50 focus:outline-none"
        />
        <button
          onClick={add}
          disabled={pending || !draft.trim()}
          className="border border-glow/50 px-3 py-1.5 font-mono text-xs text-glow transition-colors hover:bg-glow/10 disabled:opacity-30"
        >
          + ADD
        </button>
      </div>

      {error && (
        <p className="mb-3 border border-danger/40 bg-danger/5 px-2 py-1.5 font-mono text-xs text-danger">
          ! {error}
        </p>
      )}

      <div className="overflow-x-auto border border-edge bg-card">
        <table className="w-full text-left">
          <thead className="border-b border-edge font-mono text-[10px] tracking-widest text-muted">
            <tr>
              <th className="py-2 px-2">#</th>
              <th className="py-2 px-2">NAME</th>
              <th className="py-2 px-2">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {members.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-4 px-2 font-mono text-xs text-faint">
                  Roster is empty — add an operator.
                </td>
              </tr>
            ) : (
              members.map((m, i) => (
                <tr key={m.id} className="border-b border-edge text-sm">
                  <td className="py-2 px-2 font-mono text-xs text-faint">
                    {String(i + 1).padStart(2, "0")}
                  </td>
                  <td className="py-2 px-2 font-mono text-xs text-ink">
                    {editingId === m.id ? (
                      <input
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit();
                          if (e.key === "Escape") {
                            setEditingId(null);
                            setEditDraft("");
                          }
                        }}
                        maxLength={40}
                        autoFocus
                        className="w-full border border-glow/50 bg-card px-2 py-1 text-xs text-ink focus:outline-none"
                      />
                    ) : (
                      m.name
                    )}
                  </td>
                  <td className="py-2 px-2">
                    <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                      {editingId === m.id ? (
                        <>
                          <button
                            onClick={saveEdit}
                            disabled={pending || !editDraft.trim()}
                            className="text-glow hover:opacity-70 disabled:opacity-30"
                          >
                            SAVE
                          </button>
                          <button
                            onClick={() => {
                              setEditingId(null);
                              setEditDraft("");
                            }}
                            className="text-muted hover:opacity-70"
                          >
                            CANCEL
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              setEditingId(m.id);
                              setEditDraft(m.name);
                            }}
                            disabled={pending}
                            className="text-amber hover:opacity-70 disabled:opacity-30"
                          >
                            EDIT
                          </button>
                          <button
                            onClick={() => remove(m)}
                            disabled={pending}
                            className="text-danger hover:opacity-70 disabled:opacity-30"
                          >
                            DELETE
                          </button>
                          <span className="text-faint">|</span>
                          <button
                            onClick={() => reorder(m, "up")}
                            disabled={pending || i === 0}
                            className="text-muted hover:opacity-70 disabled:opacity-30"
                          >
                            ▲
                          </button>
                          <button
                            onClick={() => reorder(m, "down")}
                            disabled={pending || i === members.length - 1}
                            className="text-muted hover:opacity-70 disabled:opacity-30"
                          >
                            ▼
                          </button>
                        </>
                      )}
                      {pending && <span className="text-faint">...</span>}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}