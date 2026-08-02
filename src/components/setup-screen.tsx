export function SetupScreen({ what }: { what: "clerk" | "database" }) {
  const isClerk = what === "clerk";
  return (
    <div className="mx-auto max-w-2xl border border-amber/40 bg-panel p-8">
      <p className="font-mono text-sm text-amber">$ config check failed</p>
      <p className="mt-3 text-sm text-ink">
        {isClerk
          ? "Authentication (Clerk) is not configured yet."
          : "The database (Supabase) is not connected yet."}
      </p>
      <div className="mt-4 whitespace-pre-line font-mono text-xs leading-6 text-muted">
        {isClerk ? (
          <>
            {`1. Create a free app at clerk.com
2. Copy NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY into .env.local
3. Restart \`npm run dev\``}
          </>
        ) : (
          <>
            {`1. Create a Supabase project at supabase.com
2. Open SQL editor and run supabase/migrations/0001_init.sql
3. Copy SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY into .env.local
4. Restart \`npm run dev\``}
          </>
        )}
      </div>
    </div>
  );
}
