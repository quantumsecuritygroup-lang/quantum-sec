-- ============================================================
-- QSG Community — Chat presence + moderation
-- presence: heartbeat for online counter
-- chat_restrictions: admin-set mute / per-minute limit
-- ============================================================

create table if not exists public.presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  last_seen timestamptz not null default now()
);

alter table public.presence enable row level security;

create table if not exists public.chat_restrictions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  muted_until timestamptz,
  limit_per_min integer check (limit_per_min is null or limit_per_min between 1 and 60),
  reason text not null default '',
  set_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.chat_restrictions enable row level security;

create or replace function public.chat_restrictions_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists chat_restrictions_updated_at_trg on public.chat_restrictions;
create trigger chat_restrictions_updated_at_trg
  before update on public.chat_restrictions
  for each row execute function public.chat_restrictions_updated_at();
