-- ============================================================
-- Lobby feature — followers can post to a community lounge.
-- ============================================================

alter table public.posts
  add column if not exists scope text not null default 'main'
  check (scope in ('main', 'lobby'));

create index if not exists posts_scope_idx
  on public.posts (scope, pinned desc, created_at desc);
