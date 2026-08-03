import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { clerkConfigured, supabaseConfigured } from "@/lib/config";
import { ensureProfile } from "@/lib/auth";
import { getFeedPage } from "@/lib/data";
import { PostComposer } from "@/components/post-composer";
import { PostFeed } from "@/components/post-feed";
import { SideRailLeft } from "@/components/side-rail-left";
import { SideRailRight } from "@/components/side-rail-right";
import { SetupScreen } from "@/components/setup-screen";

export default async function HomePage() {
  if (!clerkConfigured()) return <SetupScreen what="clerk" />;

  const { userId } = await auth();
  const profile = userId ? await ensureProfile() : null;
  const initial = await getFeedPage("main", profile?.id ?? null);

  const canPost = profile?.role === "admin" || profile?.role === "member";

  return (
    <div className="grid justify-center gap-6 lg:grid-cols-[15rem_minmax(0,60rem)_15rem] xl:grid-cols-[17rem_minmax(0,60rem)_17rem]">
      <SideRailLeft />

      <div className="min-w-0 space-y-6">
        <section className="border border-glow/40 bg-panel p-5">
          <p className="font-mono text-sm text-glow">
            (quantum㉿qsg)-[~]$ <span className="text-ink">Hello World.</span>
          </p>
          <p className="mt-2 font-mono text-xs leading-6 text-muted">
            Our Facebook page keeps getting banned recently, so we built this site to
            host all of our work where it can&apos;t be taken down. It&apos;s a secure site —
            you can use your dumped email to join, react, and comment.
          </p>
          {!userId && (
            <p className="mt-2 font-mono text-xs text-amber">
              Join to comment, react and follow.{" "}
              <Link href="/sign-up" className="text-glow underline">
                Create an account
              </Link>
              .
            </p>
          )}
        </section>

        {canPost && <PostComposer />}

        {initial.pinned.length === 0 && initial.items.length === 0 && !initial.nextCursor ? (
          <div className="border border-edge bg-card p-8 text-center">
            <p className="font-mono text-sm text-muted">$ No posts yet.</p>
            <p className="mt-2 font-mono text-xs text-faint">
              When your team publishes, the archive appears here.
            </p>
          </div>
        ) : (
          <PostFeed
            scope="main"
            canModerate={profile?.role === "admin"}
            signedIn={!!userId}
            initial={initial}
          />
        )}

        {!supabaseConfigured() && (
          <p className="font-mono text-[11px] text-faint">
            Note: Supabase not configured — running in preview mode. Set up your
            database to go live.
          </p>
        )}
      </div>

      <SideRailRight />
    </div>
  );
}
