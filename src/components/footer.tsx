import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-10 border-t border-edge">
      <div className="mx-auto flex max-w-8xl flex-col gap-3 px-4 py-6 font-mono text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <p>
          <span className="text-glow">$</span> echo &quot;Quantum Security
          Group © {new Date().getFullYear()} — stay COLD.&quot;
        </p>

        <nav className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-faint">
          <Link
            href="https://www.facebook.com/quantumsecuritygroup"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-glow"
          >
            FACEBOOK
          </Link>
          <span aria-hidden="true" className="text-edge">
            /
          </span>
          <Link
            href="https://x.com/QuantumSecPH"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-glow"
          >
            X
          </Link>
          <span aria-hidden="true" className="text-edge">
            /
          </span>
          <Link
            href="https://t.me/QuantumSecPH"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-glow"
          >
            TELEGRAM
          </Link>
          <span aria-hidden="true" className="text-edge">
            /
          </span>
          <a
            href="mailto:quantumsecuritygroup@proton.me"
            className="transition-colors hover:text-glow"
          >
            CONTACT
          </a>
        </nav>
      </div>
    </footer>
  );
}
