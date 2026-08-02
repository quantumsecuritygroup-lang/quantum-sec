import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { clerkConfigured } from "@/lib/config";
import { ensureProfile } from "@/lib/auth";
import { getPostDetail } from "@/lib/data";
import { PostCard } from "@/components/post-card";
import { CommentSection } from "@/components/comment-section";
import { SetupScreen } from "@/components/setup-screen";

export default async function PostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!clerkConfigured()) return <SetupScreen what="clerk" />;

  const { userId } = await auth();
  const profile = userId ? await ensureProfile() : null;
  const detail = await getPostDetail(id, profile?.id ?? null);

  if (!detail) notFound();

  return (
    <div>
      <PostCard
        item={detail.item}
        canModerate={profile?.role === "admin"}
        signedIn={!!userId}
        full
      />
      <CommentSection
        postId={id}
        comments={detail.comments}
        signedIn={!!userId}
      />
    </div>
  );
}
