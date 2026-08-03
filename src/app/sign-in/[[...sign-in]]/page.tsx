import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="mx-auto max-w-3xl gap-4 px-4 py-10 grid md:grid-cols-2 items-center">
      <section className="border border-glow/40 bg-panel p-5 items-center">
        <p className="font-mono text-sm text-glow">
          (quantum㉿qsg)-[~]$ <span className="text-ink">why sign in?</span>
        </p>
        <ul className="mt-3 space-y-1.5 font-mono text-xs leading-6 text-muted">
          <li>
            <span className="text-glow">./post</span> — share dumps, findings & links
          </li>
          <li>
            <span className="text-glow">./chat</span> — comment on posts and threads
          </li>
          <li>
            <span className="text-glow">./react</span> — react to posts and help rank them
          </li>
          <li>
            <span className="text-glow">./follow</span> — keep up with members&apos; feeds
          </li>
          <li>
            <span className="text-glow">./lobby</span> — lounge is members-only
          </li>
        </ul>
        <p className="mt-3 font-mono text-xs text-amber">
          It&apos;s a secure site — no bots, no burnout. Read-only guests see posts, but
          sign in to take part.
        </p>
      </section>

      <SignIn
        appearance={{
          variables: {
            colorPrimary: "#00d0ff",
            colorBackground: "#0b0d0b",
            colorForeground: "#d6e3d6",
            colorInput: "#0f120f",
            colorInputForeground: "#d6e3d6",
            colorNeutral: "#6e7f6e",
          },
          elements: {
            card: "border border-edge shadow-none",
            footer: "text-muted",
          },
        }}
      />
    </div>
  );
}
