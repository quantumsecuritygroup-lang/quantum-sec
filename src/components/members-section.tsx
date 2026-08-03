import { getRosterMembers } from "@/lib/data";

export async function MembersSection({
  variant = "full",
}: {
  variant?: "full" | "rail";
}) {
  const members = await getRosterMembers();
  return (
    <section className="border border-edge bg-card p-4">
      <div className="mb-3 border-b border-edge pb-2">
        <p className="font-mono text-xs text-glow">
          <span className="text-muted">(quantum㉿qsg)-[~]$ </span>
          <span className="text-ink">cat members.txt</span>
        </p>
      </div>
      <ol
        className={`grid gap-x-8 gap-y-1.5 font-mono text-xs ${
          variant === "full" ? "sm:grid-cols-3" : "grid-cols-1"
        }`}
      >
        {members.map((m, i) => (
          <li key={m.id} className="flex items-baseline gap-2">
            <span className="w-5 shrink-0 text-right text-faint">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="text-glow">›</span>
            <span className="text-ink/80">{m.name}</span>
          </li>
        ))}
        {members.length === 0 && (
          <li className="col-span-full py-2 font-mono text-xs text-faint">
            $ no operators on the roster yet.
          </li>
        )}
      </ol>
      <p className="mt-3 border-t border-edge pt-2 font-mono text-[11px] text-faint">
        $ {members.length} operators on the roster.
      </p>
    </section>
  );
}