-- ============================================================
-- QSG Community — Operator roster (members.txt)
-- DB-backed roster that replaces the hardcoded list in
-- members-section.tsx. Admins CRUD it via server actions
-- (service-role only); public can read it (RLS select).
-- Idempotent.
-- ============================================================

create table if not exists public.roster_members (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists roster_members_sort_idx
  on public.roster_members (sort_order, name);

-- updated_at trigger (same pattern as set_updated_at on other tables)
create or replace function public.roster_members_updated_at()
returns trigger language plpgsql set search_path = '' as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

drop trigger if exists roster_members_set_updated_at on public.roster_members;
create trigger roster_members_set_updated_at
  before update on public.roster_members
  for each row execute function public.roster_members_updated_at();

-- Seed the original roster from members.txt (idempotent).
insert into public.roster_members (name, sort_order) values
  ('Admiral_Luna', 1),
  ('Zeu$', 2),
  ('Ch4nc3ll0rX_1337', 3),
  ('BalutP3noy', 4),
  ('Cyber Frost', 5),
  ('L3l0uch_X', 6),
  ('Z0NR&§', 7),
  ('WYS1WYG030', 8),
  ('Kr0vm4k', 9),
  ('Mr.GW4P$', 10),
  ('Asm0d3usX_', 11)
on conflict (name) do nothing;

-- RLS: public can read the roster, but only the service role writes it.
alter table public.roster_members enable row level security;

create policy "roster readable by all" on public.roster_members
  for select to anon, authenticated using (true);

-- Least-privilege grants: SELECT to anon/authenticated, nothing else.
REVOKE ALL ON public.roster_members FROM anon, authenticated;
GRANT SELECT ON public.roster_members TO anon, authenticated;
