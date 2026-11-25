# Operations

How Secret Side is deployed, which keys live where, and how to release safely.
Architecture is in `ARCHITECTURE.md`; game rules in `GAME_RULES.md`.

## Environments

| | Supabase project | Used by |
|---|---|---|
| **Live** | `secret-side` (`qfbrbtzezcaelelnstzb`), eu-central-1 | Vercel **Production**: https://secret-side-vert.vercel.app |
| **Dev** | `secret-side-dev` (`rekuyorpqcszmwkiwcsz`), eu-central-1 | `npm run dev`, every test (`test:db`, `test:e2e`), Vercel **Preview** |

- Code: GitHub `secretsideadv-hash/secret-side`; Vercel deploys `main` to Production and other branches to Preview.
- Vercel functions run in `fra1` (`vercel.json`), next to the database.
- Both projects: anonymous sign-ins on, anonymous sign-in rate limit raised (groups share hotel Wi-Fi; e2e tests sign in several times per run), JWT signing keys ES256 (tokens are verified locally).
- Tests never touch live: every test client checks for the dev project ref.

## Keys and where they go

| Variable | `.env.local` (dev) | `.env.live.local` | Vercel Preview | Vercel Production | Secret |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | dev URL | | dev URL | live URL | no |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | dev | | dev | live | no |
| `SUPABASE_SECRET_KEY` | dev | | dev | live (Sensitive) | **yes** |
| `REVALIDATE_SECRET` | random | | optional | = `LIVE_REVALIDATE_SECRET` (Sensitive) | yes |
| `SUPABASE_DEV_DB_URL` | dev Session pooler URI | | – | – | **yes** |
| `SUPABASE_ACCESS_TOKEN` | Secret Side account token (types) | | – | – | **yes** |
| `SUPABASE_LIVE_DB_URL` | | live Session pooler URI | – | – | **yes** |
| `LIVE_SITE_URL` | | `https://secret-side-vert.vercel.app` | – | – | no |
| `LIVE_REVALIDATE_SECRET` | | same as Production `REVALIDATE_SECRET` | – | – | yes |

The map needs no keys: MapLibre GL loads OpenFreeMap tiles from `https://tiles.openfreemap.org` (no account; attribution is required and shown on the map automatically). Database URLs and the access token never go to Vercel. `.env*` files are gitignored except `.env.example`. `SESSION_SECRET` (M1 cookie sessions) is no longer used anywhere.

The Supabase CLI on this PC may be logged in to a different account. Never rely on `supabase login`: `scripts/db.mjs` passes the credentials above explicitly.

## Release order

Database first, code second: production code must never run against a database that lacks what it calls.

1. Write the migration in `supabase/migrations/`, then `npm run db:push:dev` and `npm run db:types`.
2. `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:db`, `npm run test:e2e` (all against dev).
3. `npm run db:push:live`.
4. If content changed: `npm run content:import -- live` (validates, imports in one transaction, reads back, refreshes the live cache). Use `--dry-run` first if unsure.
5. Commit and push `main`; Vercel builds and deploys. A build reads the catalog from the database, so it fails loudly if live has no published content.
6. `npm run verify:live` (read-only): migrations applied, live content equals the files, RLS and grants, no guest-callable functions, `search_path` pinned, abandon job active, pages load, `/api/revalidate` refuses unauthenticated calls.

## CI (GitHub Actions)

`.github/workflows/ci.yml` runs on every push and pull request:

1. **Lint, typecheck, unit tests**: always, no secrets needed.
2. **Database and e2e tests against the dev project**: only when these repository secrets exist (GitHub → Settings → Secrets and variables → Actions → New repository secret); otherwise the job is skipped with a notice.

| Secret | Value |
|---|---|
| `DEV_SUPABASE_PUBLISHABLE_KEY` | dev publishable key (same as `.env.local`) |
| `DEV_SUPABASE_SECRET_KEY` | dev secret key |
| `DEV_SUPABASE_DB_URL` | dev Session pooler URI (for the privilege audit and new-table probe) |

CI never gets live credentials; migrations and live imports stay manual (see Release order). On failure, Playwright traces are uploaded as an artifact for 7 days.

## Commands

| Command | What it does |
|---|---|
| `npm run db:push:dev` / `db:push:live` | Apply pending migrations (refuses a URL for the wrong project) |
| `npm run db:types` | Regenerate `lib/supabase/database.types.ts` from dev |
| `npm run content:import -- dev\|live [--dry-run] [--revalidate-only]` | Validate and import `content/<city>/*.ts`, refresh the site cache |
| `npm run verify:live` | Read-only health check of the live database and site |
| `npm run test:db` | RLS, privileges, content repository and session store against dev |

## Data housekeeping

- e2e tests delete the guests they create in dev. A failed run can leave a few anonymous users behind; they are harmless.
- Anonymous users accumulate on live (one per browser that unlocked an adventure). A cleanup of guests with no sessions is planned before the pilot (M8).
- The hourly `abandon-idle-sessions` job (pg_cron) marks sessions idle for 48 h as abandoned.
