import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { clerkConfigured } from "@/lib/config";
import { getCurrentProfile } from "@/lib/auth";
import { NavLinks } from "./nav-links";
import { MobileMenu } from "./mobile-menu";
import { NotificationBell } from "./notification-bell";

export async function Navbar() {
  const configured = clerkConfigured();
  const { userId } = await auth();
  const profile = userId ? await getCurrentProfile() : null;

  return (
    <header className="sticky top-0 z-40 border-b border-edge bg-base/80 backdrop-blur">
      <nav className="mx-auto flex h-14 max-w-8xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="font-mono text-sm text-glow transition-colors hover:text-glowdim"
          >
            <span className="text-muted">(quantum㉿qsg)</span>
            <span className="hidden text-ink sm:inline">-[</span>
            <span className="hidden sm:inline">~</span>
            <span className="hidden text-ink sm:inline">]$ </span>
            <span className="text-glow">QSG</span>
          </Link>
          <NavLinks />
        </div>

        <div className="flex items-center gap-3">
          {configured ? (
            <SignedInControls userId={userId} profile={profile} />
          ) : (
            <span className="font-mono text-[11px] text-amber">
              CONFIG REQUIRED
            </span>
          )}
          <MobileMenu
            username={profile?.username}
            isAdmin={profile?.role === "admin"}
          />
        </div>
      </nav>
    </header>
  );
}

function SignedInControls({
  userId,
  profile,
}: {
  userId: string | null;
  profile: Awaited<ReturnType<typeof getCurrentProfile>>;
}) {
  if (!userId) {
    return (
      <div className="flex items-center gap-2 font-mono text-xs">
        <Link
          href="/sign-in"
          className="border border-edge px-3 py-1.5 text-muted transition-colors hover:border-glow/50 hover:text-glow"
        >
          SIGN IN
        </Link>
        <Link
          href="/sign-up"
          className="bg-glow px-3 py-1.5 text-black transition-colors hover:bg-glowdim"
        >
          JOIN
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {profile && (
        <div className="hidden items-center gap-2 font-mono text-xs md:flex">
          {profile.banned && (
            <span className="border border-danger/50 bg-danger/10 px-2 py-0.5 text-[10px] tracking-wider text-danger">
              BANNED
            </span>
          )}
          <span
            className={`border px-2 py-0.5 text-[10px] tracking-wider ${
              profile.role === "admin"
                ? "border-glow/50 bg-glow/10 text-glow"
                : profile.role === "member"
                  ? "border-update/40 bg-update/5 text-update"
                  : "border-edge bg-panel text-muted"
            }`}
          >
            {profile.role.toUpperCase()}
          </span>
          <Link
            href={`/profile/${profile.username}`}
            className="text-muted transition-colors hover:text-glow"
          >
            {profile.display_name || profile.username}
          </Link>
        </div>
      )}
      {profile?.role === "admin" && (
        <Link
          href="/root_qsg"
          className="border border-amber/40 bg-amber/5 px-2.5 py-1.5 font-mono text-xs text-amber transition-colors hover:border-amber/70"
        >
          ADMIN
        </Link>
      )}
      {profile && <NotificationBell isAdmin={profile.role === "admin"} />}
      <UserButton />
    </div>
  );
}
