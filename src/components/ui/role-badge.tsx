export function RoleBadge({ role }: { role: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    admin: {
      label: "ADMIN",
      cls: "text-glow border-glow/50 bg-glow/10",
    },
    member: {
      label: "MEMBER",
      cls: "text-update border-update/40 bg-update/5",
    },
    follower: {
      label: "FOLLOWER",
      cls: "text-muted border-edge bg-panel",
    },
  };
  const m = map[role] ?? map.follower;
  return (
    <span
      className={`inline-block border px-1.5 py-0.5 font-mono text-[10px] tracking-wider ${m.cls}`}
    >
      {m.label}
    </span>
  );
}
