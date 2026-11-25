-- M3-1: GPS check-in details and how a session ended (GAME_RULES §5, §11).
--
-- session_stops.check_in_distance_m / check_in_accuracy_m: recorded for GPS
-- check-ins only, in whole metres, to tune radii after field tests. Raw
-- coordinates are never stored.
-- sessions.end_reason: 'finished' (played to the end) or 'emergency' (ended from
-- the Emergency view to see the remaining stops). Set exactly when completed.

alter table public.session_stops
  add column check_in_distance_m integer check (check_in_distance_m between 0 and 100000),
  add column check_in_accuracy_m integer check (check_in_accuracy_m between 0 and 100000),
  add constraint session_stops_gps_details_only_for_gps check (
    case when check_in_method = 'gps'
      then check_in_distance_m is not null and check_in_accuracy_m is not null
      else check_in_distance_m is null and check_in_accuracy_m is null
    end
  );

alter table public.sessions
  add column end_reason text check (end_reason in ('finished', 'emergency'));

-- Sessions completed before this migration were played to the end.
update public.sessions set end_reason = 'finished' where status = 'completed' and end_reason is null;

alter table public.sessions
  add constraint sessions_end_reason_matches_status check ((status = 'completed') = (end_reason is not null));

-- The session write functions now carry the new columns. Same contract and
-- privileges as before (service_role only; security invoker; search_path '').
create or replace function public.create_session(session jsonb, stops jsonb)
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
    started_at, completed_at, end_reason, last_activity_at, version)
  values (
    s.id, s.experience_id, s.owner_id, s.join_code, s.status, s.current_position, s.score,
    s.started_at, s.completed_at, s.end_reason, s.last_activity_at, 0)
  on conflict (owner_id, experience_id) where status <> 'completed' do nothing
  returning id into created;

  if created is null then
    select x.id into created
      from public.sessions x
     where x.owner_id = s.owner_id and x.experience_id = s.experience_id and x.status <> 'completed';
    return created;
  end if;

  insert into public.session_stops (
    session_id, stop_id, experience_id, status, used_backup_venue, check_in_method,
    check_in_distance_m, check_in_accuracy_m, resolution, revealed_hint_levels, wrong_attempts,
    consecutive_wrong, cooldown_until, arrived_at, completed_at)
  select created, r.stop_id, s.experience_id, r.status, r.used_backup_venue, r.check_in_method,
         r.check_in_distance_m, r.check_in_accuracy_m, r.resolution, r.revealed_hint_levels,
         r.wrong_attempts, r.consecutive_wrong, r.cooldown_until, r.arrived_at, r.completed_at
    from jsonb_populate_recordset(null::public.session_stops, stops) r;

  return created;
end;
$$;

create or replace function public.save_session(session jsonb, stops jsonb, expected_version integer)
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
         end_reason = s.end_reason,
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
         check_in_distance_m = r.check_in_distance_m,
         check_in_accuracy_m = r.check_in_accuracy_m,
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
     and (t.status, t.used_backup_venue, t.check_in_method, t.check_in_distance_m, t.check_in_accuracy_m,
          t.resolution, t.revealed_hint_levels, t.wrong_attempts, t.consecutive_wrong, t.cooldown_until,
          t.arrived_at, t.completed_at)
         is distinct from
         (r.status, r.used_backup_venue, r.check_in_method, r.check_in_distance_m, r.check_in_accuracy_m,
          r.resolution, r.revealed_hint_levels, r.wrong_attempts, r.consecutive_wrong, r.cooldown_until,
          r.arrived_at, r.completed_at);

  return new_version;
end;
$$;

-- create or replace keeps existing grants, but state them again so this file
-- stands on its own.
revoke execute on function public.create_session(jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.save_session(jsonb, jsonb, integer) from public, anon, authenticated;
grant execute on function public.create_session(jsonb, jsonb) to service_role;
grant execute on function public.save_session(jsonb, jsonb, integer) to service_role;
