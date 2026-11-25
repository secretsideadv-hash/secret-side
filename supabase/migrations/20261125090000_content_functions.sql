-- Content import and read functions (M2-3).
--
-- Both are SECURITY INVOKER with search_path = '' and fully qualified names, and
-- only service_role may execute them (the import script connects as postgres,
-- the owner). Guests can't call either.

-- An import may delete an option that the answer key still points at and then
-- re-point the key in the same transaction: check that FK at commit instead.
alter table public.challenge_answers
  alter constraint challenge_answers_correct_option_fkey deferrable initially immediate;

-- ---------------------------------------------------------------------------
-- import_experience(content jsonb) → jsonb counts
--
-- Upserts one experience and all of its stops, challenges, options, answer keys
-- and hints by id, and deletes this experience's rows that are no longer in the
-- payload. Runs in the caller's transaction, so it is all-or-nothing. Rows whose
-- content didn't change are not touched (updated_at stays), so a second run
-- reports zero changes.
--
-- Payload: { experience: {...}, stops: [...], challenges: [...], options: [...],
--            answers: [...], hints: [...] } with snake_case column names
-- (server/content-rows.ts → toRows).
-- ---------------------------------------------------------------------------
create function public.import_experience(content jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  exp_id uuid := (content -> 'experience' ->> 'id')::uuid;
  stop_ids uuid[];
  challenge_ids uuid[];
  option_ids uuid[];
  hint_ids uuid[];
  counts jsonb := '{}'::jsonb;
  ins integer;
  upd integer;
  del integer;
  blocked text;
begin
  if exp_id is null then
    raise exception 'import_experience: payload has no experience.id';
  end if;

  select coalesce(array_agg((x ->> 'id')::uuid), '{}') into stop_ids
    from jsonb_array_elements(content -> 'stops') x;
  select coalesce(array_agg((x ->> 'id')::uuid), '{}') into challenge_ids
    from jsonb_array_elements(content -> 'challenges') x;
  select coalesce(array_agg((x ->> 'id')::uuid), '{}') into option_ids
    from jsonb_array_elements(content -> 'options') x;
  select coalesce(array_agg((x ->> 'id')::uuid), '{}') into hint_ids
    from jsonb_array_elements(content -> 'hints') x;

  -- Ids must not already belong to another experience (UUID clash or copy-paste).
  if exists (select 1 from public.stops s where s.id = any (stop_ids) and s.experience_id <> exp_id)
     or exists (select 1 from public.challenges c join public.stops s on s.id = c.stop_id
                where c.id = any (challenge_ids) and s.experience_id <> exp_id)
     or exists (select 1 from public.challenge_options o join public.challenges c on c.id = o.challenge_id
                join public.stops s on s.id = c.stop_id
                where o.id = any (option_ids) and s.experience_id <> exp_id)
     or exists (select 1 from public.hints h join public.challenges c on c.id = h.challenge_id
                join public.stops s on s.id = c.stop_id
                where h.id = any (hint_ids) and s.experience_id <> exp_id) then
    raise exception 'import_experience: some ids already belong to another experience';
  end if;

  -- Stop positions and option positions may swap during the import.
  set constraints public.stops_experience_position_key,
                  public.challenge_options_challenge_position_key,
                  public.challenge_answers_correct_option_fkey deferred;

  -- ---- Deletes first (children before parents) ------------------------------
  -- Answer keys that disappear, or whose challenge changes type (the key's
  -- shape check would fail mid-update), are removed and re-inserted below.
  delete from public.challenge_answers a
   using public.challenges c, public.stops s
   where a.challenge_id = c.id and c.stop_id = s.id and s.experience_id = exp_id
     and not exists (
       select 1 from jsonb_array_elements(content -> 'answers') x
        where (x ->> 'challenge_id')::uuid = a.challenge_id and x ->> 'type' = a.type);
  get diagnostics del = row_count;
  counts := counts || jsonb_build_object('answers_deleted', del);

  delete from public.hints h
   using public.challenges c, public.stops s
   where h.challenge_id = c.id and c.stop_id = s.id and s.experience_id = exp_id
     and h.id <> all (hint_ids);
  get diagnostics del = row_count;
  counts := counts || jsonb_build_object('hints_deleted', del);

  delete from public.challenge_options o
   using public.challenges c, public.stops s
   where o.challenge_id = c.id and c.stop_id = s.id and s.experience_id = exp_id
     and o.id <> all (option_ids);
  get diagnostics del = row_count;
  counts := counts || jsonb_build_object('options_deleted', del);

  delete from public.challenges c
   using public.stops s
   where c.stop_id = s.id and s.experience_id = exp_id and c.id <> all (challenge_ids);
  get diagnostics del = row_count;
  counts := counts || jsonb_build_object('challenges_deleted', del);

  -- A stop someone has played can't be deleted (session_stops FK is RESTRICT).
  select string_agg(s.position || ' (' || s.title || ')', ', ') into blocked
    from public.stops s
   where s.experience_id = exp_id and s.id <> all (stop_ids)
     and exists (select 1 from public.session_stops ss where ss.stop_id = s.id);
  if blocked is not null then
    raise exception 'import_experience: stops % have play history and cannot be removed; keep their ids', blocked;
  end if;

  delete from public.stops s where s.experience_id = exp_id and s.id <> all (stop_ids);
  get diagnostics del = row_count;
  counts := counts || jsonb_build_object('stops_deleted', del);

  -- ---- Upserts (parents before children), only touching changed rows --------
  with src as (
    select * from jsonb_populate_record(null::public.experiences, content -> 'experience')
  ), up as (
    insert into public.experiences as t (
      id, slug, city_slug, kind, title, tagline, description, is_flagship, duration_minutes,
      distance_meters, walking_difficulty, night_notes, recommended_start_from, recommended_start_to,
      price_cents, currency, status)
    select id, slug, city_slug, kind, title, tagline, description, is_flagship, duration_minutes,
      distance_meters, walking_difficulty, night_notes, recommended_start_from, recommended_start_to,
      price_cents, currency, status
    from src
    on conflict (id) do update set
      slug = excluded.slug, city_slug = excluded.city_slug, kind = excluded.kind, title = excluded.title,
      tagline = excluded.tagline, description = excluded.description, is_flagship = excluded.is_flagship,
      duration_minutes = excluded.duration_minutes, distance_meters = excluded.distance_meters,
      walking_difficulty = excluded.walking_difficulty, night_notes = excluded.night_notes,
      recommended_start_from = excluded.recommended_start_from,
      recommended_start_to = excluded.recommended_start_to, price_cents = excluded.price_cents,
      currency = excluded.currency, status = excluded.status
    where (t.slug, t.city_slug, t.kind, t.title, t.tagline, t.description, t.is_flagship,
           t.duration_minutes, t.distance_meters, t.walking_difficulty, t.night_notes,
           t.recommended_start_from, t.recommended_start_to, t.price_cents, t.currency, t.status)
      is distinct from
          (excluded.slug, excluded.city_slug, excluded.kind, excluded.title, excluded.tagline,
           excluded.description, excluded.is_flagship, excluded.duration_minutes,
           excluded.distance_meters, excluded.walking_difficulty, excluded.night_notes,
           excluded.recommended_start_from, excluded.recommended_start_to, excluded.price_cents,
           excluded.currency, excluded.status)
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted) into ins, upd from up;
  counts := counts || jsonb_build_object('experience_inserted', ins, 'experience_updated', upd);

  with src as (
    select * from jsonb_populate_recordset(null::public.stops, content -> 'stops')
  ), up as (
    insert into public.stops as t (
      id, experience_id, position, title, teaser, story, venue_name, lat, lng, check_in_radius_m,
      opens_at, closes_at, backup_name, backup_lat, backup_lng, backup_teaser)
    select id, exp_id, position, title, teaser, story, venue_name, lat, lng, check_in_radius_m,
      opens_at, closes_at, backup_name, backup_lat, backup_lng, backup_teaser
    from src
    on conflict (id) do update set
      position = excluded.position, title = excluded.title, teaser = excluded.teaser,
      story = excluded.story, venue_name = excluded.venue_name, lat = excluded.lat, lng = excluded.lng,
      check_in_radius_m = excluded.check_in_radius_m, opens_at = excluded.opens_at,
      closes_at = excluded.closes_at, backup_name = excluded.backup_name,
      backup_lat = excluded.backup_lat, backup_lng = excluded.backup_lng,
      backup_teaser = excluded.backup_teaser
    where (t.position, t.title, t.teaser, t.story, t.venue_name, t.lat, t.lng, t.check_in_radius_m,
           t.opens_at, t.closes_at, t.backup_name, t.backup_lat, t.backup_lng, t.backup_teaser)
      is distinct from
          (excluded.position, excluded.title, excluded.teaser, excluded.story, excluded.venue_name,
           excluded.lat, excluded.lng, excluded.check_in_radius_m, excluded.opens_at,
           excluded.closes_at, excluded.backup_name, excluded.backup_lat, excluded.backup_lng,
           excluded.backup_teaser)
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted) into ins, upd from up;
  counts := counts || jsonb_build_object('stops_inserted', ins, 'stops_updated', upd);

  with src as (
    select * from jsonb_populate_recordset(null::public.challenges, content -> 'challenges')
  ), up as (
    insert into public.challenges as t (id, stop_id, type, prompt, explanation, placeholder)
    select id, stop_id, type, prompt, explanation, placeholder from src
    on conflict (id) do update set
      stop_id = excluded.stop_id, type = excluded.type, prompt = excluded.prompt,
      explanation = excluded.explanation, placeholder = excluded.placeholder
    where (t.stop_id, t.type, t.prompt, t.explanation, t.placeholder)
      is distinct from (excluded.stop_id, excluded.type, excluded.prompt, excluded.explanation, excluded.placeholder)
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted) into ins, upd from up;
  counts := counts || jsonb_build_object('challenges_inserted', ins, 'challenges_updated', upd);

  with src as (
    select * from jsonb_populate_recordset(null::public.challenge_options, content -> 'options')
  ), up as (
    insert into public.challenge_options as t (id, challenge_id, label, position)
    select id, challenge_id, label, position from src
    on conflict (id) do update set
      challenge_id = excluded.challenge_id, label = excluded.label, position = excluded.position
    where (t.challenge_id, t.label, t.position)
      is distinct from (excluded.challenge_id, excluded.label, excluded.position)
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted) into ins, upd from up;
  counts := counts || jsonb_build_object('options_inserted', ins, 'options_updated', upd);

  with src as (
    select * from jsonb_populate_recordset(null::public.challenge_answers, content -> 'answers')
  ), up as (
    insert into public.challenge_answers as t (challenge_id, type, correct_option_id, accepted_answers, allow_fuzzy)
    select challenge_id, type, correct_option_id, accepted_answers, coalesce(allow_fuzzy, false) from src
    on conflict (challenge_id) do update set
      type = excluded.type, correct_option_id = excluded.correct_option_id,
      accepted_answers = excluded.accepted_answers, allow_fuzzy = excluded.allow_fuzzy
    where (t.type, t.correct_option_id, t.accepted_answers, t.allow_fuzzy)
      is distinct from (excluded.type, excluded.correct_option_id, excluded.accepted_answers, excluded.allow_fuzzy)
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted) into ins, upd from up;
  counts := counts || jsonb_build_object('answers_inserted', ins, 'answers_updated', upd);

  with src as (
    select * from jsonb_populate_recordset(null::public.hints, content -> 'hints')
  ), up as (
    insert into public.hints as t (id, challenge_id, level, text)
    select id, challenge_id, level, text from src
    on conflict (id) do update set
      challenge_id = excluded.challenge_id, level = excluded.level, text = excluded.text
    where (t.challenge_id, t.level, t.text) is distinct from (excluded.challenge_id, excluded.level, excluded.text)
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted) into ins, upd from up;
  counts := counts || jsonb_build_object('hints_inserted', ins, 'hints_updated', upd);

  -- Deferred constraints are checked now, inside the import, not at some later commit.
  set constraints public.stops_experience_position_key,
                  public.challenge_options_challenge_position_key,
                  public.challenge_answers_correct_option_fkey immediate;

  return counts;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_experience_content(experience_id uuid) → jsonb rows, or null
-- One round trip for everything the engine needs (server only: includes answers).
-- ---------------------------------------------------------------------------
create function public.get_experience_content(experience_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'experience', to_jsonb(e),
    'stops', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.position)
      from public.stops s where s.experience_id = e.id), '[]'::jsonb),
    'challenges', coalesce((
      select jsonb_agg(to_jsonb(c) order by s.position)
      from public.challenges c join public.stops s on s.id = c.stop_id
      where s.experience_id = e.id), '[]'::jsonb),
    'options', coalesce((
      select jsonb_agg(to_jsonb(o) order by o.challenge_id, o.position)
      from public.challenge_options o join public.challenges c on c.id = o.challenge_id
      join public.stops s on s.id = c.stop_id
      where s.experience_id = e.id), '[]'::jsonb),
    'answers', coalesce((
      select jsonb_agg(to_jsonb(a))
      from public.challenge_answers a join public.challenges c on c.id = a.challenge_id
      join public.stops s on s.id = c.stop_id
      where s.experience_id = e.id), '[]'::jsonb),
    'hints', coalesce((
      select jsonb_agg(to_jsonb(h) order by h.challenge_id, h.level)
      from public.hints h join public.challenges c on c.id = h.challenge_id
      join public.stops s on s.id = c.stop_id
      where s.experience_id = e.id), '[]'::jsonb)
  )
  from public.experiences e
  where e.id = get_experience_content.experience_id;
$$;

revoke execute on function public.import_experience(jsonb) from public, anon, authenticated;
revoke execute on function public.get_experience_content(uuid) from public, anon, authenticated;
grant execute on function public.import_experience(jsonb) to service_role;
grant execute on function public.get_experience_content(uuid) to service_role;
