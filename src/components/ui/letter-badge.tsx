const PALETTE = [
  "bg-glow text-black",
  "bg-glow text-black",
  "bg-amber text-black",
  "bg-danger text-white",
  "bg-lobby text-black",
  "bg-[#ff9a3b] text-black",
];

export function LetterBadge({
  name,
  size = "md",
}: {
  name: string;
  size?: "sm" | "md" | "lg";
}) {
  const label = name.trim() || "?";
  const letter = label.charAt(0).toUpperCase() || "?";
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  }
  const color = PALETTE[hash % PALETTE.length];
  const dims =
    size === "sm"
      ? "h-6 w-6 text-xs"
      : size === "lg"
        ? "h-12 w-12 text-xl"
        : "h-9 w-9 text-sm";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-sm font-mono font-bold ${color} ${dims}`}
      aria-hidden="true"
    >
      {letter}
    </span>
  );
}
