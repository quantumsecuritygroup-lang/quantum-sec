import { auth, currentUser } from "@clerk/nextjs/server";
import { getServerClient, type Profile } from "./supabase";

export async function getCurrentUser() {
  const { userId } = await auth();
  if (!userId) return null;
  const user = await currentUser();
  return { userId, user };
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const session = await getCurrentUser();
  if (!session) return null;
  const sb = getServerClient();
  if (!sb) return null;
  const { data } = await sb
    .from("profiles")
    .select("*")
    .eq("clerk_id", session.userId)
    .maybeSingle();
  const profile = (data as Profile) ?? null;
  if (!profile) return null;

  const clerkImage = session.user?.imageUrl ?? null;
  if (profile.avatar_url !== clerkImage) {
    await sb
      .from("profiles")
      .update({ avatar_url: clerkImage })
      .eq("id", profile.id);
    profile.avatar_url = clerkImage;
  }
  return profile;
}

export async function ensureProfile(): Promise<Profile | null> {
  const session = await getCurrentUser();
  if (!session) return null;
  const existing = await getCurrentProfile();
  if (existing) return existing;

  const sb = getServerClient();
  if (!sb) return null;

  const handle =
    session.user?.username ??
    session.user?.primaryEmailAddress?.emailAddress.split("@")[0] ??
    "member";

  const { data, error } = await sb.rpc("create_profile", {
    p_clerk_id: session.userId,
    p_username: sanitizeUsername(handle),
    p_display_name:
      session.user?.firstName && session.user?.lastName
        ? `${session.user.firstName} ${session.user.lastName}`
        : handle,
    p_bio: "",
    p_avatar_url: session.user?.imageUrl ?? null,
  });
  if (error) return null;
  return data as Profile;
}

function sanitizeUsername(s: string): string {
  const base =
    s
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 20) || "member";
  return `${base}_${Math.random().toString(36).slice(2, 7)}`;
}
