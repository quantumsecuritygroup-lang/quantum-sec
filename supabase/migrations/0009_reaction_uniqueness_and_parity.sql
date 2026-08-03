-- ============================================================
-- QSG Community — Reaction uniqueness + schema parity
-- 1. Replace the ineffective `unique (user_id, post_id, comment_id)`
--    constraint (breaks for NULL targets: post reactions leave
--    comment_id NULL, so every post reaction was treated as distinct)
--    with true per-target partial unique indexes.
-- 2. Backfill columns/constraints that only ever existed in the live
--    database so fresh projects reproduce the production schema.
-- Idempotent.
-- ============================================================

-- --- 1. Partial unique indexes for reactions -----------------

-- The old constraint is ineffective (post reactions leave comment_id NULL,
-- so unique(user_id, post_id, comment_id) never deduped them).
alter table public.reactions
  drop constraint if exists reactions_user_id_post_id_comment_id_key;

create unique index if not exists reactions_post_unique
  on public.reactions (user_id, post_id) where comment_id is null;
create unique index if not exists reactions_comment_unique
  on public.reactions (user_id, comment_id) where post_id is null;

-- --- 2. Profile parity columns --------------------------------
-- Live DB carries these (added post-migration); bring fresh installs in line.

alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists banned boolean not null default false;
alter table public.profiles add column if not exists banned_at timestamptz;

-- --- 3. security_events parity constraints --------------------
-- The live table enforces allowed type/severity; make migrations match.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'security_events_type_check'
      and conrelid = 'public.security_events'::regclass
  ) then
    alter table public.security_events
      add constraint security_events_type_check
      check (type in ('ddos','tamper','rate_limit','unauthorized','banned_attempt','blocked_ip','manual'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'security_events_severity_check'
      and conrelid = 'public.security_events'::regclass
  ) then
    alter table public.security_events
      add constraint security_events_severity_check
      check (severity in ('info','warn','critical'));
  end if;
end $$;