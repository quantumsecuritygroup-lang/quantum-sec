-- ============================================================
-- QSG Community — Chat features
-- Reactions on messages, inline reply/quote, and an "edited"
-- marker. All reads/writes go through the service_role key
-- server-side (Clerk is auth), same as every other table.
-- Idempotent.
-- ============================================================

-- Message reactions -------------------------------------------
-- One distinct emoji per user per message (PK prevents dupes).
-- on delete cascade removes reactions when a message is purged.
create table if not exists public.chat_reactions (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

-- Aggregation per message: group by message_id + emoji.
create index if not exists chat_reactions_message_emoji_idx
  on public.chat_reactions (message_id, emoji);

create index if not exists chat_reactions_user_idx
  on public.chat_reactions (user_id);

-- RLS as defense-in-depth: no client read/write via anon.
alter table public.chat_reactions enable row level security;

-- Reply + edit markers ----------------------------------------
-- reply_to_id is a soft reference (accepts incoming 36-char ids
-- without enforcing a hard FK, so a stale/rejected id does not
-- break the insert; authoring is validated server-side).
alter table public.chat_messages
  add column if not exists reply_to_id text;

alter table public.chat_messages
  add column if not exists edited_at timestamptz;

-- Resolving a reply target's preview payload.
create index if not exists chat_messages_reply_to_idx
  on public.chat_messages (reply_to_id);