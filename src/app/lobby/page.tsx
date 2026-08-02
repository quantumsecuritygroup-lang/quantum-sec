import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { clerkConfigured } from "@/lib/config";
import { ensureProfile } from "@/lib/auth";
import { getLobbyFeed } from "@/lib/data";
import { PostCard } from "@/components/post-card";
import { LobbyComposer } from "@/components/lobby-composer";
import { SideRailLeft } from "@/components/side-rail-left";
import { SideRailRight } from "@/components/side-rail-right";

export const dynamic = "force-dynamic";

export default async function LobbyPage() {
  if (!clerkConfigured()) return null;

  const { userId } = await auth();
  const profile = userId ? await ensureProfile() : null;
  const items = await getLobbyFeed(profile?.id ?? null);

  return (
    <div className="grid justify-center gap-6 lg:grid-cols-[15rem_minmax(0,60rem)_15rem] xl:grid-cols-[17rem_minmax(0,60rem)_17rem]">
      <SideRailLeft />

      <div className="min-w-0 space-y-6">
        <section className="border border-lobby/40 bg-panel p-5">
          <p className="font-mono text-sm text-lobby">
            (quantum㉿qsg)-[~]$ <span className="text-ink">./lobby</span>
          </p>
          <p className="mt-2 font-mono text-xs leading-6 text-muted">
            Community lounge. Anyone signed in can post here — introduce
            yourself, share your dumps, or start a discussion.
          </p>
          {!userId && (
            <p className="mt-2 font-mono text-xs text-amber">
              Sign in to post in the lobby.{" "}
              <Link href="/sign-up" className="text-glow underline">
                Create an account
              </Link>
              .
            </p>
          )}
        </section>

        {userId && <LobbyComposer />}

        <div className="space-y-4">
          {items.length === 0 ? (
            <div className="border border-edge bg-card p-8 text-center">
              <p className="font-mono text-sm text-muted">$ Lobby is empty.</p>
              <p className="mt-2 font-mono text-xs text-faint">
                Be the first to post something.
              </p>
            </div>
          ) : (
            items.map((item) => (
              <PostCard
                key={item.post.id}
                item={item}
                canModerate={profile?.role === "admin"}
                signedIn={!!userId}
              />
            ))
          )}
        </div>
      </div>

      <SideRailRight />
    </div>
  );
}
