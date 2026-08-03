-- ============================================================
-- QSG Community — Least-privilege grants (parity file)
-- Mirrors the migration already applied to the live database.
-- The app is service-role-only (Clerk is external auth); anon
-- and authenticated roles never write. Revoke all DML in favor
-- of RLS-only public reads on genuinely public tables and no
-- access at all on system/chat tables. Idempotent.
-- ============================================================

-- System / security tables: nobody through the Data API may touch these.
REVOKE ALL ON public.security_events FROM anon, authenticated;
REVOKE ALL ON public.blocked_ips FROM anon, authenticated;

-- Chat tables: fully managed by service-role server actions.
REVOKE ALL ON public.chat_messages FROM anon, authenticated;
REVOKE ALL ON public.chat_reactions FROM anon, authenticated;
REVOKE ALL ON public.chat_restrictions FROM anon, authenticated;
REVOKE ALL ON public.presence FROM anon, authenticated;

-- Public read-only content: drop broad DML grants, keep SELECT only.
REVOKE ALL ON public.posts FROM anon, authenticated;
REVOKE ALL ON public.comments FROM anon, authenticated;
REVOKE ALL ON public.follows FROM anon, authenticated;
REVOKE ALL ON public.reactions FROM anon, authenticated;
REVOKE ALL ON public.profiles FROM anon, authenticated;

GRANT SELECT ON public.posts TO anon, authenticated;
GRANT SELECT ON public.comments TO anon, authenticated;
GRANT SELECT ON public.follows TO anon, authenticated;
GRANT SELECT ON public.reactions TO anon, authenticated;
GRANT SELECT ON public.profiles TO anon, authenticated;
