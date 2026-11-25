-- Session writes (M2-4). Server actions call these with the secret key; guests
-- can't (EXECUTE revoked). SECURITY INVOKER, search_path = '', qualified names.
--
-- Rows are passed as jsonb in the session_stops / sessions column shape
-- (server/session-rows.ts). Both functions write the session row and its stop
-- rows in one statement-level transaction.

-- ---------------------------------------------------------------------------
-- create_session(session jsonb, stops jsonb) → uuid
-- Inserts a new session (version 0) with its stop rows. If the owner already has
-- an unfinished session for that experience (the partial unique index), nothing
-- is written and that session's id is returned instead: two quick "Unlock" taps
-- end up in the same session.
-- ---------------------------------------------------------------------------
create function public.create_session(session jsonb, stops jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  s public.sessions := jsonb_populate_record(null::public.sessions, session);
  created uuid;
begin
  insert into public.sessions (
    id, experience_id, owner_id, join_code, status, current_position, score,
    started_at, completed_at, last_activity_at, version)
  values (
    s.id, s.experience_id, s.owner_id, s.join_code, s.status, s.current_position, s.score,
    s.started_at, s.completed_at, s.last_activity_at, 0)
  on conflict (owner_id, experience_id) where status <> 'completed' do nothing
  returning id into created;

  if created is null then
    select x.id into created
      from public.sessions x
     where x.owner_id = s.owner_id and x.experience_id = s.experience_id and x.status <> 'completed';
    return created;
  end if;

  insert into public.session_stops (
    session_id, stop_id, experience_id, status, used_backup_venue, check_in_method, resolution,
    revealed_hint_levels, wrong_attempts, consecutive_wrong, cooldown_until, arrived_at, completed_at)
  select created, r.stop_id, s.experience_id, r.status, r.used_backup_venue, r.check_in_method,
         r.resolution, r.revealed_hint_levels, r.wrong_attempts, r.consecutive_wrong,
         r.cooldown_until, r.arrived_at, r.completed_at
    from jsonb_populate_recordset(null::public.session_stops, stops) r;

  return created;
end;
$$;

-- ---------------------------------------------------------------------------
-- save_session(session jsonb, stops jsonb, expected_version int) → int | null
-- Optimistic concurrency: writes only if the stored version still equals
-- expected_version (and the owner matches), then bumps it. Returns the new
-- version, or null if someone/something else wrote first (stale request,
-- replay, double tap, the abandon sweep). On null nothing is written.
-- ---------------------------------------------------------------------------
create function public.save_session(session jsonb, stops jsonb, expected_version integer)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  s public.sessions := jsonb_populate_record(null::public.sessions, session);
  new_version integer;
begin
  update public.sessions t
     set status = s.status,
         current_position = s.current_position,
         score = s.score,
         started_at = s.started_at,
         completed_at = s.completed_at,
         last_activity_at = s.last_activity_at,
         version = t.version + 1
   where t.id = s.id
     and t.owner_id = s.owner_id
     and t.version = expected_version
  returning t.version into new_version;

  if new_version is null then
    return null;
  end if;

  update public.session_stops t
     set status = r.status,
         used_backup_venue = r.used_backup_venue,
         check_in_method = r.check_in_method,
         resolution = r.resolution,
         revealed_hint_levels = r.revealed_hint_levels,
         wrong_attempts = r.wrong_attempts,
         consecutive_wrong = r.consecutive_wrong,
         cooldown_until = r.cooldown_until,
         arrived_at = r.arrived_at,
         completed_at = r.completed_at
    from jsonb_populate_recordset(null::public.session_stops, stops) r
   where t.session_id = s.id
     and t.stop_id = r.stop_id
     and (t.status, t.used_backup_venue, t.check_in_method, t.resolution, t.revealed_hint_levels,
          t.wrong_attempts, t.consecutive_wrong, t.cooldown_until, t.arrived_at, t.completed_at)
         is distinct from
         (r.status, r.used_backup_venue, r.check_in_method, r.resolution, r.revealed_hint_levels,
          r.wrong_attempts, r.consecutive_wrong, r.cooldown_until, r.arrived_at, r.completed_at);

  return new_version;
end;
$$;

revoke execute on function public.create_session(jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.save_session(jsonb, jsonb, integer) from public, anon, authenticated;
grant execute on function public.create_session(jsonb, jsonb) to service_role;
grant execute on function public.save_session(jsonb, jsonb, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Abandoned sessions (GAME_RULES §2): in progress with no activity for 48 h.
-- Saved by an hourly job; bumping the version makes any request built on the
-- old state stale. The engine turns it back to in_progress on the next action.
-- ---------------------------------------------------------------------------
create function private.abandon_idle_sessions()
returns integer
language sql
security invoker
set search_path = ''
as $$
  with idle as (
    update public.sessions
       set status = 'abandoned', version = version + 1
     where status = 'in_progress'
       and last_activity_at < pg_catalog.now() - interval '48 hours'
    returning 1
  )
  select count(*)::integer from idle;
$$;

revoke execute on function private.abandon_idle_sessions() from public, anon, authenticated;

create extension if not exists pg_cron;

select cron.schedule('abandon-idle-sessions', '17 * * * *', 'select private.abandon_idle_sessions()');
