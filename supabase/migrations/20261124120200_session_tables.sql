-- Sessions: one play-through of an experience, owned by a Supabase user
-- (anonymous guest or, later, a real account). Progress per stop in session_stops.
--
-- Writes happen only in server code with the secret key (server actions), using
-- `version` for optimistic concurrency so an old request can't overwrite newer
-- progress. Guests may read their own rows (for M4 realtime), never write.

create table public.sessions (
  id uuid primary key,
  experience_id uuid not null references public.experiences (id) on delete restrict,
  owner_id uuid not null references auth.users (id) on delete cascade,
  join_code text unique check (join_code ~ '^[A-Z0-9]{6}$'), -- M4
  status text not null check (status in ('not_started', 'in_progress', 'completed', 'abandoned')),
  current_position smallint not null check (current_position >= 1),
  score integer not null default 0 check (score >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  last_activity_at timestamptz not null,
  version integer not null default 0 check (version >= 0),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint sessions_completed_at_matches_status check ((status = 'completed') = (completed_at is not null)),
  -- Target for session_stops' composite FK.
  constraint sessions_id_experience_key unique (id, experience_id)
);

-- One unfinished session per guest per experience (GAME_RULES: abandoned ones resume).
create unique index sessions_one_active_per_owner_experience
  on public.sessions (owner_id, experience_id) where status <> 'completed';
-- Discover's Continue card: the guest's most recent session.
create index sessions_owner_activity on public.sessions (owner_id, last_activity_at desc);
-- The hourly abandon sweep (M2-4).
create index sessions_in_progress_activity on public.sessions (last_activity_at) where status = 'in_progress';

create table public.session_stops (
  session_id uuid not null,
  stop_id uuid not null,
  experience_id uuid not null,
  status text not null check (status in ('locked', 'unlocked', 'arrived', 'solved', 'skipped')),
  used_backup_venue boolean not null default false,
  check_in_method text check (check_in_method in ('gps', 'manual')),
  resolution text check (resolution in ('answered', 'revealed', 'skipped')),
  revealed_hint_levels smallint[] not null default '{}'
    check (revealed_hint_levels operator(pg_catalog.<@) '{1,2}'::smallint[]),
  wrong_attempts integer not null default 0 check (wrong_attempts >= 0),
  consecutive_wrong integer not null default 0 check (consecutive_wrong >= 0),
  cooldown_until timestamptz,
  arrived_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (session_id, stop_id),
  constraint session_stops_session_fkey
    foreign key (session_id, experience_id) references public.sessions (id, experience_id) on delete cascade,
  -- Restrict: a content import can't delete a stop someone has played.
  constraint session_stops_stop_fkey
    foreign key (stop_id, experience_id) references public.stops (id, experience_id) on delete restrict,
  constraint session_stops_resolution_matches_status check (
    case status
      when 'solved' then resolution in ('answered', 'revealed')
      when 'skipped' then resolution = 'skipped'
      else resolution is null
    end
  )
);

create index session_stops_stop on public.session_stops (stop_id, experience_id);

create trigger sessions_set_updated_at before update on public.sessions
  for each row execute function private.set_updated_at();
create trigger session_stops_set_updated_at before update on public.session_stops
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security and grants
-- ---------------------------------------------------------------------------
alter table public.sessions enable row level security;
alter table public.session_stops enable row level security;

-- Guests (anonymous users have the `authenticated` role) may read their own
-- sessions. No insert/update/delete grant: progress changes only via the server.
grant select on public.sessions to authenticated;
create policy "Guests read their own sessions"
  on public.sessions for select
  to authenticated
  using (owner_id = (select auth.uid()));

-- Their own progress rows, except locked stops: those ids stay hidden like the stops.
grant select on public.session_stops to authenticated;
create policy "Guests read their own progress, never locked stops"
  on public.session_stops for select
  to authenticated
  using (
    status <> 'locked'
    and exists (
      select 1 from public.sessions s
      where s.id = session_stops.session_id
        and s.owner_id = (select auth.uid())
    )
  );

grant select, insert, update, delete on public.sessions, public.session_stops to service_role;
