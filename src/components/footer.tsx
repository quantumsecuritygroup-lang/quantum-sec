import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-10 border-t border-edge">
      <div className="mx-auto max-w-8xl px-4 py-8 font-mono text-xs text-muted sm:px-6 lg:px-8">
        <p className="mb-3">
          <span className="text-glow">$</span> echo &quot;Quantum Security Group ©{" "}
          {new Date().getFullYear()} — stay COLD.&quot;
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <Link
            href="https://www.facebook.com/quantumsecuritygroup"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-glow"
          >
            FACEBOOK
          </Link>
          <Link
            href="https://x.com/QuantumSecPH"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-glow"
          >
            X (TWITTER)
          </Link>
          <Link
            href="https://t.me/QuantumSecPH"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-glow"
          >
            TELEGRAM
          </Link>
          <a
            href="mailto:quantumsecuritygroup@proton.me"
            className="transition-colors hover:text-glow"
          >
            CONTACT
          </a>
        </div>
      </div>
    </footer>
  );
}
