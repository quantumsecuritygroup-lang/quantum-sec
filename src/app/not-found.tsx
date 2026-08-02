import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl border border-edge bg-card p-8 text-center">
      <p className="font-mono text-sm text-danger">$ 404 — not found</p>
      <p className="mt-2 font-mono text-xs text-muted">
        This record does not exist or has been hidden.
      </p>
      <Link
        href="/"
        className="mt-4 inline-block border border-glow/50 bg-glow/10 px-4 py-2 font-mono text-xs text-glow transition-colors hover:bg-glow/20"
      >
        RETURN TO OVERVIEW
      </Link>
    </div>
  );
}
