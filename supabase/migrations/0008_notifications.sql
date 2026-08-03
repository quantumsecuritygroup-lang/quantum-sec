-- ============================================================
-- QSG Community — Notifications
-- Per-user notification feed plus a site-wide activity feed for
-- admins. All reads/writes go through the service_role key
-- server-side (Clerk is auth), same as every other table.
-- Idempotent.
-- ============================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (
    type in (
      'post_reaction',
      'comment_reaction',
      'post_comment',
      'comment_reply',
      'follow',
      'moderation'
    )
  ),
  post_id uuid references public.posts(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  detail text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- Personal feed: newest first.
create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

-- Global activity feed (admin view): newest first.
create index if not exists notifications_created_idx
  on public.notifications (created_at desc);

-- Unread badge counter per user.
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id) where read_at is null;

-- RLS as defense-in-depth: no client read/write via anon.
alter table public.notifications enable row level security;

-- No anon/authenticated access at all (service-role only).
REVOKE ALL ON public.notifications FROM anon, authenticated;
