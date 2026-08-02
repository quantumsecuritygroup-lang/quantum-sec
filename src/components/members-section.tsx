const MEMBERS = [
  "Admiral_Luna",
  "Zeu$",
  "Ch4nc3ll0rX_1337",
  "BalutP3noy",
  "Cyber Frost",
  "L3l0uch_X",
  "Z0NR&§",
  "WYS1WYG030",
  "Kr0vm4k",
  "Mr.GW4P$",
  "Asm0d3usX_",
];

export function MembersSection({ variant = "full" }: { variant?: "full" | "rail" }) {
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
        {MEMBERS.map((name, i) => (
          <li key={name} className="flex items-baseline gap-2">
            <span className="w-5 shrink-0 text-right text-faint">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="text-glow">›</span>
            <span className="text-ink/80">{name}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 border-t border-edge pt-2 font-mono text-[11px] text-faint">
        $ {MEMBERS.length} operators online.
      </p>
    </section>
  );
}
