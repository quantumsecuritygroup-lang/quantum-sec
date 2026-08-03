import { auth } from "@clerk/nextjs/server";
import { clerkConfigured } from "@/lib/config";
import { ensureProfile } from "@/lib/auth";
import { getFeedPage } from "@/lib/data";
import { LobbyComposer } from "@/components/lobby-composer";
import { LobbyChat } from "@/components/lobby-chat";
import { PostFeed } from "@/components/post-feed";
import { SideRailLeft } from "@/components/side-rail-left";

export const dynamic = "force-dynamic";

export default async function LobbyPage() {
  if (!clerkConfigured()) return null;

  const { userId, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn();

  const profile = await ensureProfile();
  const initial = await getFeedPage("lobby", profile?.id ?? null);

  return (
    <div className="grid justify-center gap-6 lg:h-[calc(100dvh-7.5rem)] lg:grid-cols-[15rem_minmax(0,60rem)_22rem] lg:overflow-hidden xl:grid-cols-[17rem_minmax(0,60rem)_22rem]">
      <SideRailLeft variant="lobby" />

      <div className="min-w-0 space-y-6 lg:overflow-y-auto lg:pr-1">
        <section className="border border-lobby/40 bg-panel p-5">
          <p className="font-mono text-sm text-lobby">
            (quantum㉿qsg)-[~]$ <span className="text-ink">./lobby</span>
          </p>
          <p className="mt-2 font-mono text-xs leading-6 text-muted">
            Community lounge. Anyone signed in can post here — introduce
            yourself, share your dumps, or start a discussion.
          </p>
        </section>

        <LobbyComposer />

        {initial.pinned.length === 0 && initial.items.length === 0 && !initial.nextCursor ? (
          <div className="flex items-center justify-between border border-dashed border-edge px-5 py-3">
            <p className="font-mono text-xs text-muted">$ Lobby is empty.</p>
            <p className="font-mono text-[11px] text-faint">
              Be the first to post something.
            </p>
          </div>
        ) : (
          <PostFeed
            scope="lobby"
            canModerate={profile?.role === "admin"}
            signedIn={!!userId}
            initial={initial}
          />
        )}
      </div>

      <aside className="min-w-0 lg:h-full">
        <LobbyChat myUsername={profile?.username} isAdmin={profile?.role === "admin"} />
      </aside>
    </div>
  );
}
