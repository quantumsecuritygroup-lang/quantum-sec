-- ============================================================
-- QSG Community — Production hardening
-- Defines objects that previously existed only in the live
-- database (so migrations are self-contained and reproducible),
-- plus missing indexes and search_path hardening on trigger
-- functions. Idempotent.
-- ============================================================

-- Security event log ----------------------------------------
create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  severity text not null default 'warn',
  ip text not null default '',
  user_agent text not null default '',
  path text not null default '',
  method text not null default '',
  detail text not null default '',
  user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists security_events_created_idx on public.security_events (created_at desc);
create index if not exists security_events_type_idx on public.security_events (type);
create index if not exists security_events_ip_idx on public.security_events (ip);

alter table public.security_events enable row level security;

-- Blocked IPs -------------------------------------------------
create table if not exists public.blocked_ips (
  ip text primary key,
  reason text not null default '',
  created_at timestamptz not null default now()
);

alter table public.blocked_ips enable row level security;

-- First user to sign up becomes admin ------------------------
-- Serializes concurrent first-signup races with an advisory lock.
create or replace function public.create_profile(
  p_clerk_id text,
  p_username text,
  p_display_name text,
  p_bio text,
  p_avatar_url text
) returns profiles
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_profile public.profiles;
  v_admin_count bigint;
begin
  perform pg_advisory_xact_lock(903452129);

  select count(*) into v_admin_count
  from public.profiles
  where role = 'admin';

  insert into public.profiles
    (clerk_id, username, display_name, bio, role, avatar_url)
  values
    (p_clerk_id, p_username, p_display_name, p_bio,
     case when v_admin_count = 0 then 'admin' else 'follower' end,
     p_avatar_url)
  returning * into v_profile;

  return v_profile;
end;
$function$;

-- search_path hardening on trigger functions ------------------
create or replace function public.chat_message_length()
returns trigger language plpgsql set search_path = '' as $function$
begin
  if length(new.content) > 400 then
    raise exception 'chat message too long';
  end if;
  return new;
end;
$function$;

create or replace function public.chat_restrictions_updated_at()
returns trigger language plpgsql set search_path = '' as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

-- Missing indexes ----------------------------------------------
-- Online counter scan (getChatRoomInfo) filters presence.last_seen
create index if not exists presence_last_seen_idx on public.presence (last_seen);

-- Chat rate-limit count filters author_id + created_at
create index if not exists chat_messages_author_created_idx
  on public.chat_messages (author_id, created_at desc);

-- Unindexed foreign keys reported by the database linter
create index if not exists posts_author_idx on public.posts (author_id);
create index if not exists comments_author_idx on public.comments (author_id);
create index if not exists follows_following_idx on public.follows (following_id);
create index if not exists security_events_user_id_idx on public.security_events (user_id);
create index if not exists chat_restrictions_set_by_idx on public.chat_restrictions (set_by);