-- ============================================================
-- QSG Community — Lobby chat
-- Live thread for signed-in users on the lobby page.
-- Text only. Writes/reads go through the service_role key
-- server-side (Clerk is auth), same as every other table.
-- ============================================================

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_created_idx
  on public.chat_messages (created_at desc);

-- RLS as defense-in-depth: no client write/read via anon.
alter table public.chat_messages enable row level security;

-- Max message length guard
create or replace function public.chat_message_length()
returns trigger language plpgsql as $$
begin
  if length(new.content) > 400 then
    raise exception 'chat message too long';
  end if;
  return new;
end;
$$;

drop trigger if exists chat_message_length_trg on public.chat_messages;
create trigger chat_message_length_trg
  before insert on public.chat_messages
  for each row execute function public.chat_message_length();