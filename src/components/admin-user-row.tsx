"use client";

import { useTransition } from "react";
import { adminSetRole, adminSetBan } from "@/lib/actions";
import type { Profile } from "@/lib/supabase";
import { Avatar } from "./ui/avatar";

export function AdminUserRow({ user }: { user: Profile }) {
  const [pending, startTransition] = useTransition();
  const run = (role: string) => {
    const fd = new FormData();
    fd.set("id", user.id);
    fd.set("role", role);
    startTransition(async () => {
      await adminSetRole(fd);
    });
  };
  const setBan = (banned: boolean) => {
    const fd = new FormData();
    fd.set("id", user.id);
    fd.set("banned", banned ? "1" : "0");
    startTransition(async () => {
      await adminSetBan(fd);
    });
  };
  return (
    <tr
      className={`border-b border-edge text-sm ${
        user.banned ? "bg-danger/5" : ""
      }`}
    >
      <td className="py-2 px-2 font-mono text-xs text-ink">
        <span className="inline-flex items-center gap-2">
          <Avatar size="sm" name={user.display_name || user.username} imageUrl={user.avatar_url} />
          {user.display_name || user.username}
        </span>
        <span className="ml-2 text-faint">@{user.username}</span>
        {user.banned && (
          <span className="ml-2 border border-danger/50 bg-danger/10 px-1.5 py-0.5 text-[9px] tracking-wider text-danger">
            BANNED
          </span>
        )}
      </td>
      <td className="py-2 px-2 font-mono text-[10px] uppercase tracking-wider text-muted">
        {user.role}
      </td>
      <td className="py-2 px-2">
        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
          <button
            onClick={() => run("member")}
            disabled={user.role === "member" || pending}
            className="text-update hover:opacity-70 disabled:opacity-30"
          >
            MEMBER
          </button>
          <button
            onClick={() => run("admin")}
            disabled={user.role === "admin" || pending}
            className="text-glow hover:opacity-70 disabled:opacity-30"
          >
            ADMIN
          </button>
          <button
            onClick={() => run("follower")}
            disabled={user.role === "follower" || pending}
            className="text-muted hover:opacity-70 disabled:opacity-30"
          >
            FOLLOWER
          </button>
          <button
            onClick={() => setBan(!user.banned)}
            disabled={pending || user.role === "admin"}
            className={
              user.banned
                ? "text-glow hover:opacity-70 disabled:opacity-30"
                : "text-danger hover:opacity-70 disabled:opacity-30"
            }
          >
            {user.banned ? "UNBAN" : "BAN"}
          </button>
          {pending && <span className="text-faint">...</span>}
        </div>
      </td>
    </tr>
  );
}
