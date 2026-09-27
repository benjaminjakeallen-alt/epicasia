-- Applied directly via the Supabase MCP connector (project rjywjnidmjpfcjymaavi)
-- after the security advisor flagged is_admin()/handle_new_user()/
-- protect_is_admin() as callable via PostgREST RPC endpoints
-- (/rest/v1/rpc/...) by anon/authenticated — they're internal helpers for
-- triggers/RLS only. Moving them to a non-exposed schema fixes it without
-- touching grants, which would risk breaking the RLS policies/triggers
-- that call them. Safe: Postgres resolves those references by the
-- function's OID at creation time, not by re-parsing the schema-qualified
-- name, so ALTER ... SET SCHEMA doesn't break existing policies/triggers.

create schema if not exists private;

alter function public.is_admin() set schema private;
alter function public.handle_new_user() set schema private;
alter function public.protect_is_admin() set schema private;
