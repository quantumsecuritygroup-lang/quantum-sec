import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { clerkConfigured } from "@/lib/config";
import { ensureProfile } from "@/lib/auth";
import { getProfileStats } from "@/lib/data";
import { ProfileView } from "@/components/profile-view";
import { PostCard } from "@/components/post-card";
import { SetupScreen } from "@/components/setup-screen";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  if (!clerkConfigured()) return <SetupScreen what="clerk" />;

  const { userId } = await auth();
  const me = userId ? await ensureProfile() : null;
  const stats = await getProfileStats(username, me?.id ?? null);

  if (!stats) notFound();

  return (
    <div className="space-y-6">
      <ProfileView stats={stats} signedIn={!!userId} />
      <div className="space-y-4">
        <h2 className="font-mono text-sm text-glow">
          $ posts by {stats.profile.display_name || stats.profile.username}
        </h2>
        {stats.posts.length === 0 ? (
          <p className="font-mono text-xs text-faint">
            No posts yet.
          </p>
        ) : (
          stats.posts.map((item) => (
            <PostCard
              key={item.post.id}
              item={item}
              canModerate={me?.role === "admin"}
              signedIn={!!userId}
            />
          ))
        )}
      </div>
    </div>
  );
}
