# Milestone 2 — Supabase: real database, guest accounts, resumable progress

**Done when:** you start Saúde! on your phone, close the browser mid-adventure, reopen the
live link and carry on from the same stop, and nobody can read answers, hints or locked
stops from the database with the public key.

Same routine as M1: paste one prompt, let it finish, check the result, commit. Paste the
summary to Claude (chat) if you want a second opinion before committing.

---

## Before you start (about 15 minutes, in your browser)

1. **Create the Supabase account** at supabase.com → Sign up. Use your Secret Side
   identity (secretside.adv@gmail.com or "Continue with GitHub" with the new account),
   so it stays separate from The 4th Meal.
2. **New project:**
   - Name: `secret-side`
   - Database password: click *Generate*, then **save it in your password manager**.
   - Region: a European one close to Porto (e.g. Paris or Frankfurt).
   - Plan: Free is fine for now.
3. **Turn on guest sign-in:** Authentication → Sign In / Providers → enable
   **Anonymous sign-ins** → Save.
4. **Find your keys** (Project Settings → API Keys / Data API). You'll need:
   - Project URL
   - The **publishable** (or "anon") key: safe for the browser
   - The **secret** (or "service_role") key: server only, never share it
   Don't paste keys into chat. Claude Code will tell you where to put them (`.env.local`
   on your PC, and Vercel's Environment Variables).

---

### Prompt M2-0 — Cleanup from the M1 review
```
Before Supabase, small cleanup from the M1 review:
1. Styled 404 and error pages in our design (not Next's defaults), with a way back to Discover.
2. A simple app icon and favicon (placeholder mark in amber on our dark ground, marked // MOCK:),
   plus a basic web app manifest so the PWA shows "Secret Side" when added to a home screen.
3. Make sure GAME_RULES says purchases (entitlements) last 12 months, and ROADMAP marks M1 done.
Run all checks (lint, typecheck, unit, e2e, build), commit and push.
```

### Prompt M2-1 — Plan (no code)
```
We're starting M2: move content and sessions from files/cookies to Supabase.
Read CLAUDE.md, docs/GAME_RULES.md, docs/ARCHITECTURE.md and docs/ROADMAP.md. Don't write code yet.
I've created a Supabase project (secret-side) with anonymous sign-ins enabled.
Give me:
- The tables, columns, keys and indexes (mapping 1:1 to our engine types), including
  challenge_answers and hints as server-only tables.
- Row Level Security for every table: what a guest can read/write, what only the server can.
  Answers, unrevealed hints and locked stops must be unreadable with the publishable key.
- How guests work: Supabase anonymous auth on first unlock, how the session follows them after
  closing the browser, and how it upgrades to a real account later.
- How session writes stay safe: server actions only, optimistic concurrency (a version number)
  so an old state can't be replayed, cooldowns using server time, one active session per guest
  per experience, abandoned status saved properly.
- How content gets in: an idempotent import script from content/porto/*.ts keeping the same IDs,
  with the content validator, and how the catalog cache is refreshed after an import.
- Local development vs the live project (Supabase CLI and migrations), and which env vars go where.
- The step list for M2 and any risks or doc problems you see.
Wait for my approval.
```

### Prompt M2-2 — Schema, security and typed client
```
Do the schema step from the approved plan: Supabase CLI setup, migrations for all tables,
RLS policies, generated TypeScript types, and the server/browser Supabase clients
(secret key server-only). Apply the migrations to the secret-side project.
Write tests proving that with the publishable key a guest cannot read challenge_answers,
unrevealed hints, locked stops, or another guest's sessions. Tell me exactly which keys to
put in .env.local and in Vercel. Run all checks, commit and push.
```

### Prompt M2-3 — Content import
```
Build the content import: a script that loads content/porto/*.ts into Supabase idempotently
(same IDs, safe to run twice), runs the content validator first and refuses to import broken
content. Replace the file-based content repository with a Supabase one behind the same
interface, and refresh the catalog cache after an import. Import Saúde! into the live project.
Run all checks (the e2e test must still pass), commit and push.
```

### Prompt M2-4 — Guest sessions in the database
```
Move sessions from the encrypted cookie to Supabase: anonymous sign-in on first unlock,
sessions and session_stops in the database, all writes through server actions with the
version check, cooldowns on server time, one active session per guest per experience,
abandoned status saved. Remove the cookie session store (keep SESSION_SECRET only if still
needed, otherwise tell me to delete it from Vercel). Add e2e tests for: close and reopen the
browser and resume; replaying an old request is rejected; another browser can't open the
session. Run all checks, commit and push.
```

### Prompt M2-5 — Deploy and review
```
Help me finish M2 on the live site: confirm Vercel has the right Supabase env vars, that the
live database has the migrations and Saúde! content, and that a fresh deploy works.
Then review M2 against docs/ROADMAP.md: what's done, what's still mocked, and what you'd fix
before M3 (GPS and the Mapbox map). Update the docs.
```

## M2 is done when
On the live link: unlock Saúde!, solve stop 1, close the browser completely, reopen the link —
the Continue card takes you back to stop 2. And Claude Code has shown you a test proving the
public key can't read answers, hints or locked stops.
