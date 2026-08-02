"use client";

import { useTransition } from "react";
import { adminBlockIp, adminUnblockIp, adminSetBan } from "@/lib/actions";
import type { SecurityEvent } from "@/lib/supabase";
import { timeAgo } from "@/lib/utils";

const SEVERITY_STYLES: Record<string, string> = {
  critical: "border-danger/50 bg-danger/10 text-danger",
  warn: "border-amber/50 bg-amber/10 text-amber",
  info: "border-edge bg-panel text-muted",
};

const TYPE_LABEL: Record<string, string> = {
  ddos: "DDoS",
  tamper: "TAMPER",
  rate_limit: "RATE LIMIT",
  unauthorized: "UNAUTHORIZED",
  banned_attempt: "BANNED USER",
  blocked_ip: "IP BLOCKED",
  manual: "MANUAL",
};

export function SecurityMonitor({
  events,
  blockedIps,
}: {
  events: SecurityEvent[];
  blockedIps: { ip: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const blocked = new Set(blockedIps.map((b) => b.ip));

  const block = (ip: string) => {
    const fd = new FormData();
    fd.set("ip", ip);
    fd.set("reason", "blocked from security monitor");
    startTransition(async () => {
      await adminBlockIp(fd);
    });
  };
  const unblock = (ip: string) => {
    const fd = new FormData();
    fd.set("ip", ip);
    startTransition(async () => {
      await adminUnblockIp(fd);
    });
  };
  const banUser = (userId: string) => {
    const fd = new FormData();
    fd.set("id", userId);
    fd.set("banned", "1");
    startTransition(async () => {
      await adminSetBan(fd);
    });
  };

  return (
    <div className="space-y-4">
      {blockedIps.length > 0 && (
        <div className="border border-danger/40 bg-danger/5 p-3">
          <p className="mb-2 font-mono text-xs text-danger">$ blocked IPs</p>
          <div className="flex flex-wrap gap-2">
            {blockedIps.map((b) => (
              <span
                key={b.ip}
                className="inline-flex items-center gap-2 border border-danger/40 bg-base px-2 py-1 font-mono text-[11px] text-danger"
              >
                {b.ip}
                <button
                  onClick={() => unblock(b.ip)}
                  disabled={pending}
                  className="text-glow hover:opacity-70 disabled:opacity-30"
                >
                  UNBLOCK
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {events.length === 0 ? (
        <p className="py-6 text-center font-mono text-xs text-faint">
          No security events logged yet.
        </p>
      ) : (
        <div className="overflow-x-auto border border-edge bg-card">
          <table className="w-full text-left">
            <thead className="border-b border-edge font-mono text-[10px] tracking-widest text-muted">
              <tr>
                <th className="py-2 px-2">TIME</th>
                <th className="py-2 px-2">TYPE</th>
                <th className="py-2 px-2">SEVERITY</th>
                <th className="py-2 px-2">IP</th>
                <th className="py-2 px-2">DETAIL</th>
                <th className="py-2 px-2">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-b border-edge text-sm">
                  <td className="py-2 px-2 whitespace-nowrap font-mono text-[11px] text-faint">
                    {timeAgo(e.created_at)}
                  </td>
                  <td className="py-2 px-2 font-mono text-[10px] tracking-wider text-ink">
                    {TYPE_LABEL[e.type] ?? e.type}
                  </td>
                  <td className="py-2 px-2">
                    <span
                      className={`border px-1.5 py-0.5 font-mono text-[9px] tracking-wider uppercase ${
                        SEVERITY_STYLES[e.severity] ?? SEVERITY_STYLES.info
                      }`}
                    >
                      {e.severity}
                    </span>
                  </td>
                  <td className="py-2 px-2 font-mono text-[11px] text-ink">
                    {e.ip || "—"}
                  </td>
                  <td className="max-w-[320px] py-2 px-2 font-mono text-[11px] text-ink/70">
                    <span className="line-clamp-2">{e.detail || e.path}</span>
                  </td>
                  <td className="py-2 px-2">
                    <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                      {e.ip && !blocked.has(e.ip) && (
                        <button
                          onClick={() => block(e.ip!)}
                          disabled={pending}
                          className="text-danger hover:opacity-70 disabled:opacity-30"
                        >
                          BLOCK IP
                        </button>
                      )}
                      {e.ip && blocked.has(e.ip) && (
                        <span className="text-danger">BLOCKED</span>
                      )}
                      {e.user_id && (
                        <button
                          onClick={() => banUser(e.user_id!)}
                          disabled={pending}
                          className="text-amber hover:opacity-70 disabled:opacity-30"
                        >
                          BAN USER
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
