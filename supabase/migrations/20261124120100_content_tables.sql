-- Content: experiences, stops, challenges, options, answer keys and hints.
-- One table per engine type (features/engine/types.ts), snake_case columns.
-- IDs are the fixed UUIDs from content/<city>/*.ts so imports keep them.
--
-- Access (see docs/ARCHITECTURE.md):
--   experiences        guests may select published rows
--   everything else    guests get nothing: no grant, no policy. Read by the server only.
--   challenge_answers and hints hold the answers and unrevealed hints.

-- ---------------------------------------------------------------------------
-- experiences
-- ---------------------------------------------------------------------------
create table public.experiences (
  id uuid primary key,
  slug text not null unique check (slug ~ '^[a-z0-9-]{1,64}$'),
  city_slug text not null check (city_slug ~ '^[a-z-]{1,32}$'),
  kind text not null check (kind in ('pub_crawl', 'mystery_walk', 'food_quest', 'hidden_gems')),
  title text not null check (pg_catalog.length(title) between 1 and 120),
  tagline text not null,
  description text not null,
  is_flagship boolean not null default false,
  duration_minutes integer not null check (duration_minutes > 0),
  distance_meters integer not null check (distance_meters >= 0),
  walking_difficulty text not null check (walking_difficulty in ('easy', 'moderate', 'hilly')),
  night_notes text,
  recommended_start_from time,
  recommended_start_to time,
  price_cents integer not null default 0 check (price_cents >= 0),
  currency text not null default 'EUR' check (currency = 'EUR'),
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint experiences_start_window_pair
    check ((recommended_start_from is null) = (recommended_start_to is null))
);

create unique index experiences_one_flagship_per_city on public.experiences (city_slug) where is_flagship;
create index experiences_city_status on public.experiences (city_slug, status);

-- ---------------------------------------------------------------------------
-- stops (backup venue as nullable backup_* columns)
-- ---------------------------------------------------------------------------
create table public.stops (
  id uuid primary key,
  experience_id uuid not null references public.experiences (id) on delete cascade,
  position smallint not null check (position >= 1),
  title text not null,
  teaser text not null,
  story text not null,
  venue_name text not null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  check_in_radius_m smallint not null default 75 check (check_in_radius_m between 50 and 150),
  opens_at time,   -- Europe/Lisbon local time; the window may cross midnight
  closes_at time,
  backup_name text,
  backup_lat double precision check (backup_lat between -90 and 90),
  backup_lng double precision check (backup_lng between -180 and 180),
  backup_teaser text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint stops_opening_window_pair check ((opens_at is null) = (closes_at is null)),
  constraint stops_backup_all_or_none
    check (pg_catalog.num_nulls(backup_name, backup_lat, backup_lng, backup_teaser) in (0, 4)),
  -- Deferrable so an import can renumber stops inside one transaction.
  constraint stops_experience_position_key unique (experience_id, position) deferrable initially immediate,
  -- Target for session_stops' composite FK (a session only holds its own experience's stops).
  constraint stops_id_experience_key unique (id, experience_id)
);

-- ---------------------------------------------------------------------------
-- challenges (1:1 with a stop for now; a backup-venue variant comes with M5)
-- ---------------------------------------------------------------------------
create table public.challenges (
  id uuid primary key,
  stop_id uuid not null unique references public.stops (id) on delete cascade,
  type text not null check (type in ('multiple_choice', 'text')),
  prompt text not null,
  explanation text,
  placeholder text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint challenges_placeholder_text_only check (type = 'text' or placeholder is null),
  -- Target for challenge_answers' composite FK: the answer key matches the challenge type.
  constraint challenges_id_type_key unique (id, type)
);

create table public.challenge_options (
  id uuid primary key, -- opaque; never encodes correctness
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  label text not null check (pg_catalog.length(label) > 0),
  position smallint not null check (position >= 1), -- authoring order; shuffled per session
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint challenge_options_challenge_position_key unique (challenge_id, position) deferrable initially immediate,
  constraint challenge_options_challenge_id_key unique (challenge_id, id)
);

-- ---------------------------------------------------------------------------
-- challenge_answers: SERVER ONLY
-- ---------------------------------------------------------------------------
create table public.challenge_answers (
  challenge_id uuid primary key,
  type text not null check (type in ('multiple_choice', 'text')),
  correct_option_id uuid,
  accepted_answers text[],
  allow_fuzzy boolean not null default false,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint challenge_answers_challenge_fkey
    foreign key (challenge_id, type) references public.challenges (id, type)
    on delete cascade on update cascade,
  -- The correct option must belong to the same challenge.
  constraint challenge_answers_correct_option_fkey
    foreign key (challenge_id, correct_option_id) references public.challenge_options (challenge_id, id),
  constraint challenge_answers_shape check (
    case type
      when 'multiple_choice' then
        correct_option_id is not null and accepted_answers is null and not allow_fuzzy
      else
        correct_option_id is null
        and pg_catalog.cardinality(accepted_answers) >= 1
        and pg_catalog.array_position(accepted_answers, '') is null
        and pg_catalog.array_position(accepted_answers, null) is null
    end
  )
);

-- ---------------------------------------------------------------------------
-- hints: SERVER ONLY (revealed text is copied into the play response)
-- ---------------------------------------------------------------------------
create table public.hints (
  id uuid primary key,
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  level smallint not null check (level in (1, 2)),
  text text not null check (pg_catalog.length(text) > 0),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint hints_challenge_level_key unique (challenge_id, level)
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger experiences_set_updated_at before update on public.experiences
  for each row execute function private.set_updated_at();
create trigger stops_set_updated_at before update on public.stops
  for each row execute function private.set_updated_at();
create trigger challenges_set_updated_at before update on public.challenges
  for each row execute function private.set_updated_at();
create trigger challenge_options_set_updated_at before update on public.challenge_options
  for each row execute function private.set_updated_at();
create trigger challenge_answers_set_updated_at before update on public.challenge_answers
  for each row execute function private.set_updated_at();
create trigger hints_set_updated_at before update on public.hints
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security and grants
-- ---------------------------------------------------------------------------
alter table public.experiences enable row level security;
alter table public.stops enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_options enable row level security;
alter table public.challenge_answers enable row level security;
alter table public.hints enable row level security;

-- Guests: published experiences only (the same facts the catalog shows).
grant select on public.experiences to anon, authenticated;
create policy "Published experiences are public"
  on public.experiences for select
  to anon, authenticated
  using (status = 'published');

-- stops, challenges, challenge_options, challenge_answers, hints: no grant and no
-- policy for guests. A locked stop must never be listable; answers and unrevealed
-- hints must never be readable.

-- The server (secret key) manages content.
grant select, insert, update, delete on
  public.experiences, public.stops, public.challenges,
  public.challenge_options, public.challenge_answers, public.hints
  to service_role;
