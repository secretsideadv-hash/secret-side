-- Secret Side: start from "guests can do nothing".
--
-- Supabase's default privileges grant every new table, sequence and function in
-- `public` to the API roles `anon` and `authenticated`, and Postgres grants
-- EXECUTE on every new function to PUBLIC. Turn that off for objects created by
-- `postgres` (the role migrations and the dashboard run as), so each migration
-- has to grant back exactly what guests may use. RLS is still enabled on every
-- table on top of this.

-- Objects created later in `public`: no automatic access for guests.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;

-- Functions anywhere: no automatic EXECUTE for PUBLIC (which every role inherits).
alter default privileges for role postgres revoke execute on functions from public;

-- Anything that already exists in `public` (a new project has nothing, but be explicit).
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

-- Internal helpers (triggers, jobs) live in `private`, which the Data API does not expose.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

-- Keeps updated_at current. Trigger-only: nobody needs EXECUTE to fire it.
create function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

revoke execute on function private.set_updated_at() from public, anon, authenticated;
