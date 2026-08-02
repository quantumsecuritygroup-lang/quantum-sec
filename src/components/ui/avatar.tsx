import { LetterBadge } from "./letter-badge";

export function Avatar({
  name,
  imageUrl,
  size = "md",
}: {
  name: string;
  imageUrl?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const dims =
    size === "sm"
      ? "h-6 w-6"
      : size === "lg"
        ? "h-12 w-12"
        : "h-9 w-9";
  if (!imageUrl) {
    return <LetterBadge name={name} size={size} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageUrl}
      alt={name || "avatar"}
      className={`inline-block shrink-0 rounded-sm border border-edge object-cover ${dims}`}
    />
  );
}
