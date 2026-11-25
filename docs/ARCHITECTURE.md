# Architecture

How the code is split, and how answers and locked stops stay on the server.
Rules of the game live in `GAME_RULES.md`; this file is about where code goes.

## Layers

| Folder | What | May import |
|---|---|---|
| `features/engine/` | Pure TypeScript game engine: types, state machine, answer checking, scoring, the client projection. No React, no I/O, no clock (time is passed in). | nothing outside itself |
| `content/<city>/` | Typed content files: the source that `npm run content:import` loads into Supabase. **`server-only`**: contains answers and hints. | engine types |
| `features/content/` | Pure content validator (`validateContent`), used by the import and by tests. | engine |
| `server/` | Server use-cases: content repository, session store, crypto, `play.ts` (load → engine → save → project). All **`server-only`**. | engine, content, `lib/` |
| `app/` | Routes. Server Components call `server/`; Server Actions are thin wrappers over `server/play.ts`. | `server/`, `components/`, engine types |
| `components/` | Presentational components. Props are `Visible*` DTOs. | **only** `@/features/engine/types` (ESLint-enforced) |

## Maps

Screens use only `components/maps/MapView`. Its props (`center`, `markers`, `zoom`, `pitch`, `bearing`, `interactive`) are provider-neutral and shaped for Mapbox GL JS. M1 renders a static SVG placeholder (`StaticMap`); M3 swaps the implementation behind `MapView` without touching screens. `markersFromState()` builds markers from `VisibleState`, so a locked stop can never be drawn.

## App chrome

- `app/not-found.tsx`, `app/error.tsx` and `app/global-error.tsx` share `components/ui/StatusScreen`. Production error pages show only Next's digest, never the server message.
- Icons: `app/icon.svg` is the source (favicon); `app/apple-icon.png` and `public/icons/*.png` are rendered from it. `app/manifest.ts` is the web app manifest (name "Secret Side").

## Keeping secrets on the server

1. **`server-only`** on every content and server module: importing one from a client component fails the build.
2. **One projection:** `features/engine/visible-state.ts → toVisibleState()` is the only path from content to the browser. It builds the DTO field by field from an allow-list. Locked stops are skipped before any of their content is read.
3. **What crosses** (GAME_RULES §4): experience summary, completed stops (answer and explanation only if answered or revealed), the current stop (teaser and location; story, question and hint availability after arrival), and revealed hint texts. Never accepted answers, correct option ids as such, unrevealed hints, the backup venue unless used, or anything about locked stops.
4. **Multiple choice:** option ids are opaque UUIDs; order is shuffled per session with a seed from `sessionId:challengeId`, stable across refreshes.
5. **ESLint** forbids `components/**` from importing content, server modules or engine logic.
6. **Tests:** `features/engine/visible-state.test.ts` plays through a fixture made of unique sentinel strings and checks the serialised state after every step; `content/porto/saude.test.ts` does the same against real content.

## Rendering and caching (Next 16, `cacheComponents`)

- **Catalog** (`server/catalog.ts`): `"use cache"` functions returning `VisibleExperienceSummary` (counts, never stops), tagged `catalog`, `cacheLife("days")`. Discover, Coming soon and the Details page for each published slug are prerendered from it, so **a build needs a database with published content** (`generateStaticParams` must return a slug).
- **Engine content** (`server/content.ts → getExperienceContent`): cached on the server per experience, tagged `content`. It includes answer keys, which is fine for a server-side cache; it only reaches the browser through `toVisibleState()`.
- **Per-request parts** read the session cookie or the clock and sit inside `<Suspense>`: Discover's Continue card (`VisibleContinueCard`, built from `VisibleState`) and the Play screen. They call `connection()` before reading the clock.
- **URL data** (`params`) is read inside `<Suspense>` so the instant-navigation shell (hero, back button) is shared across slugs; links to details use `prefetch` to resolve it ahead of the tap.
- **Unlock adventure** is a Server Action (`app/(visitor)/adventures/[slug]/actions.ts`) that validates the slug with Zod, resumes this browser's unfinished session for that adventure or starts a new one, and redirects to `/play/[sessionId]`.

## Play flow

- `/play/[sessionId]`: Server Component loads `VisibleState` and renders the client `PlayScreen`, passing the Server Actions in as props (`lib/play-types.ts → PlayActions`), so components never import server code.
- Actions (`app/(visitor)/play/[sessionId]/actions.ts`) validate input with Zod, run the engine via `server/play.ts`, and return the new `VisibleState`. Engine errors (stale double tap, hint not available) come back as error codes; the screen shows a message and refreshes. Completing a stop (correct answer, reveal, skip) **redirects** server-side to `/unlocked`, or `/complete` after the last stop.
- `/unlocked` is only shown between completing a stop and arriving at the next; otherwise it redirects back to `/play`.
- Next 16 keeps recently visited pages mounted but hidden (React `<Activity>`) for instant back navigation. E2E text lookups filter to visible elements for that reason.

## Tests

- `npm test` (Vitest): engine rules, answer matching, the no-leak projection, cookie crypto, content integrity.
- `npm run test:e2e` (Playwright): builds and starts production on port 3100, plays the whole mock adventure at 390 px, checks every HTML/RSC/action response for answers, unrevealed hints and locked stops, and checks the session can't be opened from another browser. The answers it uses are mock content and are marked `MOCK:` in the spec.

## Session storage

- **M1 (MOCK):** the `Session` object (progress only, no content) is stored in one cookie `ss_session`, encrypted and authenticated with AES-256-GCM (`server/crypto.ts`, `node:crypto`, key from `SESSION_SECRET` via HKDF). `httpOnly`, `sameSite=lax`, `secure` in production, 30 days. Any change to the cookie fails authentication and the session is treated as missing. Limits: one active session per browser, no groups, and restoring an older cookie rolls back progress (only affects the player's own score).
- **M2 (from step 4):** `sessions` and `session_stops` in Supabase, owned by the anonymous auth user (see Database). `server/session-store.ts` changes; engine and projection stay the same.

## Database (Supabase, M2)

Two projects: **secret-side** (live, Vercel Production only) and **secret-side-dev** (local dev, all tests, Vercel Preview). Region eu-central-1; Vercel functions run in `fra1` (`vercel.json`).

- **Schema** changes only through `supabase/migrations/*.sql`, applied with `npm run db:push:dev`, then `npm run db:push:live`. `scripts/db.mjs` wraps the Supabase CLI and reads credentials from gitignored `.env.local` / `.env.live.local`, so it never depends on the CLI's global login. `npm run db:types` regenerates `lib/supabase/database.types.ts` from dev.
- **Clients:** `server/supabase/admin.ts` (secret key, bypasses RLS, server-only; every session query must be scoped by the verified user id), `server/supabase/auth.ts` (publishable key + the request's auth cookies), `lib/supabase/browser.ts` (publishable key; M4 realtime).
- **Privileges** (first migration): default privileges for objects created by `postgres` grant nothing to `anon`/`authenticated` in `public`, and functions get no EXECUTE for PUBLIC. Every table has RLS. Every function has `set search_path = ''` and is `security invoker` unless a comment justifies otherwise; internal helpers live in the unexposed `private` schema.

| Type | Table | Guests (publishable key) | Notes |
|---|---|---|---|
| `Experience` | `experiences` | select where `published` | one flagship per city |
| `Stop` | `stops` | nothing | `backupVenue` → `backup_*` columns (all or none); `(experience_id, position)` unique, deferrable |
| `Challenge` | `challenges` + `challenge_options` | nothing | 1:1 with stop |
| `AnswerKey` | `challenge_answers` | **nothing, no grant** | composite FKs keep the type and the correct option consistent with the challenge |
| `Hint` | `hints` | **nothing, no grant** | revealed text is copied into the play response by the server |
| `Session` | `sessions` | select own (`owner_id = auth.uid()`) | `version` for optimistic concurrency; one unfinished session per owner per experience |
| `SessionStop` | `session_stops` | select own, never `locked` rows | PK `(session_id, stop_id)`; composite FKs keep stops within the session's experience; stop FK restrict |

Guests never write: all writes go through server actions with the secret key. IDs are the fixed UUIDs from the content files.

**Tests:** `npm run test:db` (Vitest, `tests/db/`, dev project only) seeds fixtures with the secret key and proves, with the publishable key, that a visitor and a signed-in guest can't read stops, challenges, options, answers or hints, can't read another guest's session, and can't write anything. It also audits grants, functions, `search_path` and default privileges, and creates a throwaway table and function to prove new objects start closed.

## Content import

`npm run content:import -- dev|live [--dry-run]` (`scripts/import-content.ts`, run with tsx and the `react-server` condition so `server-only` content loads):

1. **Validates** every experience with `features/content/validate.ts`. Any error and nothing is sent; warnings are printed.
2. **Imports in one transaction** through `public.import_experience(jsonb)`: upserts by the fixed ids, deletes rows that left the files, and leaves unchanged rows untouched, so a second run reports "no changes". Deleting a stop that has play history is refused.
3. **Reads back** through `public.get_experience_content(uuid)` (what the app uses) and checks it equals the file exactly.
4. **Refreshes the cache**: `POST /api/revalidate` with `Authorization: Bearer <secret>` expires the `catalog` and `content` tags (`{ expire: 0 }`). Live needs `LIVE_SITE_URL` and `LIVE_REVALIDATE_SECRET` in `.env.live.local` (the same value as `REVALIDATE_SECRET` in Vercel Production). Vercel Preview deployments pick up dev content on their next build.

Row mapping lives in `server/content-rows.ts` (`toRows` for the import, `fromRows` with Zod validation for reads). `server/content-repository.ts` is the Supabase implementation of `ContentRepository`, using the secret key.

## Not yet implemented
- Opening hours / backup venue switching (GAME_RULES §10): the types are ready; `unlockNextStop` always uses the main venue until M5.
- GPS check-in (M3): the engine accepts `method: "gps"`, the UI only offers manual.
