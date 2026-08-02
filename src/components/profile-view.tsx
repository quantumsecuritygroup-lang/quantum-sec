"use client";

import { useState, useTransition } from "react";
import { toggleFollow, updateProfile } from "@/lib/actions";
import type { ProfileStats } from "@/lib/data";
import { Avatar } from "./ui/avatar";
import { RoleBadge } from "./ui/role-badge";

export function ProfileView({
  stats,
  signedIn,
}: {
  stats: ProfileStats;
  signedIn: boolean;
}) {
  const { profile, followers, following, isFollowing, isSelf } = stats;
  const [msg, setMsg] = useState<{ ok?: boolean; error?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const doFollow = () => {
    const fd = new FormData();
    fd.set("username", profile.username);
    startTransition(async () => {
      const res = await toggleFollow(fd);
      if (res?.error) setMsg({ error: res.error });
      else setMsg({ ok: true });
    });
  };

  return (
    <div className="space-y-6">
      <div className="border border-edge bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar size="lg" name={profile.display_name || profile.username} imageUrl={profile.avatar_url} />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-mono text-xl font-bold text-ink">
                  {profile.display_name || profile.username}
                </h1>
                <RoleBadge role={profile.role} />
              </div>
              <p className="mt-1 font-mono text-xs text-muted">
                @{profile.username}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isSelf && signedIn && (
              <button
                onClick={doFollow}
                disabled={pending}
                className={`border px-4 py-2 font-mono text-xs transition-colors disabled:opacity-50 ${
                  isFollowing
                    ? "border-edge text-muted hover:text-glow"
                    : "border-glow/60 bg-glow/10 text-glow hover:bg-glow/20"
                }`}
              >
                {pending ? "..." : isFollowing ? "FOLLOWING" : "FOLLOW"}
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-4 font-mono text-xs text-muted">
          <span>
            <span className="text-glow">{followers}</span> followers
          </span>
          <span>
            <span className="text-glow">{following}</span> following
          </span>
        </div>

        {profile.bio && (
          <p className="mt-4 whitespace-pre-wrap text-sm text-ink/80">{profile.bio}</p>
        )}
      </div>

      {isSelf && (
        <div className="border border-glow/40 bg-panel p-4">
          <p className="mb-3 font-mono text-xs text-glow">$ edit profile</p>
          <form
            action={(fd) => {
              startTransition(async () => {
                const res = await updateProfile(fd);
                if (res?.error) setMsg({ error: res.error });
                else {
                  setMsg({ ok: true });
                }
              });
            }}
            className="space-y-3"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block font-mono text-xs text-muted">
                  NICKNAME
                </span>
                <input
                  name="display_name"
                  defaultValue={profile.display_name}
                  placeholder="e.g. Admiral_Luna"
                  maxLength={50}
                  className="w-full border border-edge bg-base px-3 py-2 font-mono text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-glow/50"
                />
                <span className="mt-1 block font-mono text-[11px] leading-snug text-faint">
                  This name is shown when you post, comment, and react.
                </span>
              </label>
              <label className="block">
                <span className="mb-1 block font-mono text-xs text-muted">
                  USERNAME
                </span>
                <input
                  name="username"
                  defaultValue={profile.username}
                  placeholder="e.g. admiral_luna"
                  maxLength={20}
                  className="w-full border border-edge bg-base px-3 py-2 font-mono text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-glow/50"
                />
                <span className="mt-1 block font-mono text-[11px] leading-snug text-faint">
                  Your unique handle used in your profile URL. Letters, numbers
                  and underscores only. The random suffix keeps it unique.
                </span>
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block font-mono text-xs text-muted">BIO</span>
              <textarea
                name="bio"
                defaultValue={profile.bio}
                placeholder="e.g. Member of QSG. Terminal enthusiast."
                rows={3}
                maxLength={300}
                className="w-full resize-y border border-edge bg-base px-3 py-2 font-mono text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-glow/50"
              />
              <span className="mt-1 block font-mono text-[11px] leading-snug text-faint">
                Optional. Shown on your profile page under your name.
              </span>
            </label>
            <button
              disabled={pending}
              className="bg-glow px-4 py-2 font-mono text-xs font-bold text-black transition-colors hover:bg-glowdim disabled:opacity-50"
            >
              {pending ? "SAVING..." : "SAVE PROFILE"}
            </button>
          </form>
          {msg?.ok && <p className="mt-2 font-mono text-xs text-glow">Saved.</p>}
          {msg?.error && (
            <p className="mt-2 font-mono text-xs text-danger">{msg.error}</p>
          )}
        </div>
      )}
    </div>
  );
}
