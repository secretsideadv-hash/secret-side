# Secret Side — Project Rules for Claude Code

Read this file, `docs/GAME_RULES.md` and `docs/ROADMAP.md` at the start of every session.

## Product
**Secret Side** (shown per city as "Secret Side · Porto"). The project folder and repo are
named ROAM; that is only an internal codename and must never appear in the UI, metadata,
PWA manifest or copy.

A mobile-first city exploration game. Visitors play self-guided adventures: they
check in at a stop, read a short local story, solve a clue, and the correct answer
unlocks the next location, which stays hidden until earned.

- Pilot city: Porto, Portugal (historic centre only: Ribeira, Sé, São Bento, Aliados, Clérigos, Vitória, Miragaia).
- Flagship: **"Saúde!"** (slug `saude`), a 5-stop mystery pub crawl. "Secret Side" is the app brand, not an adventure name.
- Later experience types use the same engine: mystery walks, food quests, hidden-gem routes, "I have 2 hours".
- Primary users: couples and groups of friends, 20–40, on their phones, often walking, sometimes drinking.
- Entertainment first, discovery second, practical travel info third.

## Tech stack (do not change without asking)
- Next.js (App Router) + TypeScript (strict)
- Tailwind CSS. Visitor app uses our own components and design tokens below; shadcn/ui is allowed in the admin area only.
- Supabase: Postgres, Auth (anonymous sign-in for guests), Storage, Row Level Security
- Maps: Mapbox GL JS (3D buildings + pitched camera), wrapped in our own `components/maps` component so the provider can be swapped
- Payments: Stripe Checkout + webhook (milestone M6, not before)
- Hosting: Vercel. Code on GitHub.
- PWA first (installable, never required). Native packaging (Capacitor) is a later decision.
- Validation: Zod. Tests: Vitest for engine logic, Playwright for the main play flow.

## Architecture rules
- Three areas in one codebase: visitor app `app/(visitor)`, game engine `features/engine`, admin `app/admin` (admin comes late; see ROADMAP).
- The game engine is plain TypeScript with no React imports, so it can be unit-tested on its own.
- Content is data, never hardcoded in components. Content is authored in typed files under `content/<city>/` and loaded into Supabase with `npm run content:import -- dev|live` (validated first); the app reads it from the database.
- **Server is the source of truth.** Answer checking, progression, unlocks, purchases and group membership happen in server code (server actions / route handlers / Postgres functions).
- **Never send the client:** correct answers, unrevealed hints, future (locked) stops, or the full route of a paid adventure. The client receives only completed stops, the current stop and, after unlocking, the next one.
- Answers and hints live in a table/module that is server-only (`import 'server-only'`, or a Postgres table with RLS on, no policy **and no grant** for `anon`/`authenticated`).
- Never trust client GPS or payment status. GPS is a convenience check, not security (see GAME_RULES).
- RLS on every Supabase table from the first migration. All schema changes go through migrations in `supabase/migrations`.
- Keep business logic out of presentation components. No new dependencies without a one-line justification.

## Working rules
- Read the relevant existing code before changing it. Don't rewrite unrelated files.
- Keep each change small and reviewable; one milestone step per session.
- Mark any placeholder or mock clearly with `// MOCK:` and list them at the end of your reply.
- Never say something works without running it. After each change run: `npm run lint`, `npm run typecheck`, `npm test` (and the dev server for UI work).
- Explain important architectural decisions in a sentence or two, and update `docs/` when the architecture changes.
- Ask before adding infrastructure (new services, queues, paid APIs).
- Don't commit secrets. Use `.env.local` and keep `.env.example` current.

## Design system (from the approved mockups)
- Mood: a night out in Porto: dark, cinematic, playful. Map- and adventure-focused, no generic dashboard look.
- Colours: ground `#0E1320`, surface `#171E2E`, raised nav/sheet `#121827`, border `#2A3347`, text `#F3EEE4`, muted text `#A3ABBD`, accent amber `#F2A93B` (text on amber is `#0E1320`), secondary azulejo blue `#5B8DEF`, success `#8FE0B8`, error `#FFB4A8`.
- Type: headings Space Grotesk (600–700), body Inter (400–600). Big confident headings, short copy.
- Shapes: cards radius 16–22px, pill buttons/chips, primary buttons 52–54px tall, all touch targets ≥ 44px.
- Bottom navigation: Discover · Explore · My adventures · Passport.
- Active-adventure screens have no ads, reviews or unrelated suggestions.
- Accessibility: real buttons and links, labels on icon buttons, text contrast ≥ 4.5:1.
- Test layouts at 375, 390 and 430px widths.

## Safety
- Never route users to private or restricted places, or isolated spots at night.
- Pub crawls must work for non-drinkers. Never reward or score alcohol consumption.
- Users can always take a hint, skip a stop, or see the route map in an emergency.
- Show walking difficulty (Porto is hilly) and night-time conditions up front.
