# Architecture

How the code is split, and how answers and locked stops stay on the server.
Rules of the game live in `GAME_RULES.md`; this file is about where code goes.

## Layers

| Folder | What | May import |
|---|---|---|
| `features/engine/` | Pure TypeScript game engine: types, state machine, answer checking, scoring, the client projection. No React, no I/O, no clock (time is passed in). | nothing outside itself |
| `content/<city>/` | Typed content files (M1), shaped like the M2 tables. **`server-only`**: contains answers and hints. | engine types |
| `server/` | Server use-cases: content repository, session store, crypto, `play.ts` (load → engine → save → project). All **`server-only`**. | engine, content, `lib/` |
| `app/` | Routes. Server Components call `server/`; Server Actions are thin wrappers over `server/play.ts`. | `server/`, `components/`, engine types |
| `components/` | Presentational components. Props are `Visible*` DTOs. | **only** `@/features/engine/types` (ESLint-enforced) |

## Keeping secrets on the server

1. **`server-only`** on every content and server module: importing one from a client component fails the build.
2. **One projection:** `features/engine/visible-state.ts → toVisibleState()` is the only path from content to the browser. It builds the DTO field by field from an allow-list. Locked stops are skipped before any of their content is read.
3. **What crosses** (GAME_RULES §4): experience summary, completed stops (answer and explanation only if answered or revealed), the current stop (teaser and location; story, question and hint availability after arrival), and revealed hint texts. Never accepted answers, correct option ids as such, unrevealed hints, the backup venue unless used, or anything about locked stops.
4. **Multiple choice:** option ids are opaque UUIDs; order is shuffled per session with a seed from `sessionId:challengeId`, stable across refreshes.
5. **ESLint** forbids `components/**` from importing content, server modules or engine logic.
6. **Tests:** `features/engine/visible-state.test.ts` plays through a fixture made of unique sentinel strings and checks the serialised state after every step; `content/porto/saude.test.ts` does the same against real content.

## Rendering and caching (Next 16, `cacheComponents`)

- **Catalog** (`server/catalog.ts`): `"use cache"` functions returning `VisibleExperienceSummary` (counts, never stops). Discover, Coming soon and the Details page for each published slug are prerendered from it.
- **Per-request parts** read the session cookie or the clock and sit inside `<Suspense>`: Discover's Continue card (`VisibleContinueCard`, built from `VisibleState`) and the Play screen. They call `connection()` before reading the clock.
- **URL data** (`params`) is read inside `<Suspense>` so the instant-navigation shell (hero, back button) is shared across slugs; links to details use `prefetch` to resolve it ahead of the tap.
- **Unlock adventure** is a Server Action (`app/(visitor)/adventures/[slug]/actions.ts`) that validates the slug with Zod, resumes this browser's unfinished session for that adventure or starts a new one, and redirects to `/play/[sessionId]`.

## Session storage

- **M1 (MOCK):** the `Session` object (progress only, no content) is stored in one cookie `ss_session`, encrypted and authenticated with AES-256-GCM (`server/crypto.ts`, `node:crypto`, key from `SESSION_SECRET` via HKDF). `httpOnly`, `sameSite=lax`, `secure` in production, 30 days. Any change to the cookie fails authentication and the session is treated as missing. Limits: one active session per browser, no groups, and restoring an older cookie rolls back progress (only affects the player's own score).
- **M2:** `sessions` and `session_stops` tables in Supabase, keyed by anonymous auth uid. `server/session-store.ts` is the only file that changes; engine and projection stay the same.

## Data model → tables (M2)

camelCase in TypeScript, snake_case in Postgres; `server/content-repository.ts` maps between them.

| Type | Table | Notes |
|---|---|---|
| `Experience` | `experiences` | public select |
| `Stop` | `stops` | `backupVenue` → nullable `backup_*` columns; no public select (read via server only) |
| `Challenge` | `challenges` + `challenge_options` | 1:1 with stop |
| `AnswerKey` | `challenge_answers` | **no RLS select policy**, server role only |
| `Hint` | `hints` | server only; revealed text copied into the response |
| `Session` | `sessions` | |
| `SessionStop` | `session_stops` | PK `(session_id, stop_id)`; `revealedHintLevels` → `smallint[]` |

IDs are fixed UUIDs in the content files so the M2 import keeps them.

## Not yet implemented
- Opening hours / backup venue switching (GAME_RULES §10): the types are ready; `unlockNextStop` always uses the main venue until M5.
- GPS check-in (M3): the engine accepts `method: "gps"`, the UI only offers manual.
