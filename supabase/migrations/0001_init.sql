-- ============================================================
-- QSG Community — Database schema
-- Run this in your Supabase project's SQL editor, OR
-- as a migration file. All reads/writes happen server-side
-- via the service_role key (Clerk is the auth provider).
-- ============================================================

-- Tables ------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  clerk_id text unique not null,
  username text unique not null,
  display_name text not null default '',
  bio text not null default '',
  role text not null default 'follower'
    check (role in ('admin', 'member', 'follower')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  category text not null default 'announcement'
    check (category in ('announcement', 'update', 'discussion', 'event')),
  title text not null default '',
  content text not null,
  image_paths text[] not null default '{}',
  pinned boolean not null default false,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists posts_feed_idx
  on public.posts (pinned desc, created_at desc);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.comments(id) on delete cascade,
  content text not null,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists comments_post_idx on public.comments (post_id);
create index if not exists comments_parent_idx on public.comments (parent_id);

create table if not exists public.reactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  emoji text not null check (emoji in ('like', 'love', 'care', 'wow')),
  created_at timestamptz not null default now(),
  constraint reactions_one_target check (
    (post_id is not null) <> (comment_id is not null)
  ),
  unique (user_id, post_id, comment_id)
);

create index if not exists reactions_post_idx on public.reactions (post_id);
create index if not exists reactions_comment_idx on public.reactions (comment_id);

create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint follows_no_self check (follower_id <> following_id)
);

-- updated_at trigger ------------------------------------------

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists posts_set_updated_at on public.posts;
create trigger posts_set_updated_at
  before update on public.posts
  for each row execute function public.set_updated_at();

-- Row Level Security ------------------------------------------
-- The app accesses these tables with the service_role key from
-- server code only. RLS is enabled as defense-in-depth and to
-- keep the anon key locked down.

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.reactions enable row level security;
alter table public.follows enable row level security;

create policy "profiles readable by all" on public.profiles
  for select to anon, authenticated using (true);

create policy "posts readable by all" on public.posts
  for select to anon, authenticated using (not hidden);

create policy "comments readable by all" on public.comments
  for select to anon, authenticated using (not hidden);

create policy "reactions readable by all" on public.reactions
  for select to anon, authenticated using (true);

create policy "follows readable by all" on public.follows
  for select to anon, authenticated using (true);

-- Storage bucket for post images ------------------------------
-- Public read (images render for everyone), uploads happen
-- server-side via service_role only, so no write policies are
-- granted to anon/authenticated.
insert into storage.buckets (id, name, public)
values ('qsc-images', 'qsc-images', true)
on conflict (id) do nothing;

create policy "qsc-images public read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'qsc-images');
