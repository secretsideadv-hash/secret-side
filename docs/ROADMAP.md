# Roadmap

One milestone at a time. A milestone is done only when it runs on a real phone.

| # | Milestone | Done when | Status |
|---|-----------|-----------|--------|
| M1 | **Playable slice (mock content)**: app shell, design tokens, Home, Adventure details, Play (story, clue, hints, server-checked answers), Unlocked, basic map | You can play stops 1–2 of Saúde! on your phone from a Vercel preview link | ✅ Done (2026-11-24) |
| M2 | **Supabase**: schema + RLS + migrations, anonymous guest sessions, content moved from files to the database, progress saved and resumable | Close the browser mid-adventure, reopen, carry on | ✅ Done (2026-11-25) |
| M3 | **Location**: live GPS distance, check-in radius, manual fallback, Mapbox 3D map with completed/current stops only | Check in at real Porto locations |  |
| M4 | **Groups**: join code/QR, shared session across phones, realtime unlocks | Two phones play the same session |  |
| M5 | **Content pipeline**: real venues and verified stories for the full 5-stop flagship + 1 walking mystery, validator rules for real content (opening hours, backup venues), using the M2 import script | Both adventures walk-tested end to end |  |
| M6 | **Payments**: Stripe Checkout, webhook entitlements, email resume link | A test purchase unlocks the flagship |  |
| M7 | **Passport & completion**: stamps, titles, completion screen, share card, feedback | Finishing an adventure awards a stamp |  |
| M8 | **Pilot launch**: PWA install, analytics (PostHog), QR codes for hotels/hostels, soft launch to 20–30 testers | Real visitors complete and pay |  |

## Deliberately later
Admin Studio with a map route editor (until then, content is edited in seed files and imported), food quests, hidden-gem map, "I have 2 hours" generator, leaderboards, AI personalisation, audio, offline mode, native apps, more cities.

## Notes: M2 review (2026-11-25)

Done and verified on the live site: schema + RLS + migrations on both projects (privileges audited by tests and `npm run verify:live`), content imported from files with validation, anonymous guests, sessions in the database with a version check, abandoned status saved hourly. Still mocked: all Saúde! content, free unlocking, manual check-in, the static map.

Before M3 (GPS + Mapbox):
1. ~~Decide the emergency map rule~~ **Decided** (GAME_RULES §11): position, stops reached, the way back to the start and a tap-to-call 112 button, always reachable; revealing the remaining stops ends the adventure first. Built in M3 with the map.
2. **GPS check-in on the server.** The browser sends position and accuracy; the server computes the distance and accepts within the stop's radius (plus a capped accuracy allowance), otherwise the screen offers manual check-in. Never trust a "gps" flag from the client.
3. ~~Security headers and CSP before Mapbox~~ **Done**: `lib/security-headers.ts`; M3 adds the Mapbox origins.
4. **Mapbox account and token (new service):** a public `pk.` token restricted to the production and preview domains; nothing secret in the browser.
5. ~~CI on GitHub~~ **Done**: `.github/workflows/ci.yml` (database and e2e jobs run once the dev secrets are added; see OPERATIONS).
6. ~~Check Vercel Preview once~~ **Done** (2026-11-25): Preview signs guests into the dev project and sessions land in dev; Deployment Protection is off. The CSP blocks the Vercel Toolbar script that Vercel injects into previews.

Before the pilot (M8): rate limiting on Server Actions and anonymous sign-in (CAPTCHA), cleanup of anonymous guests with no sessions, Supabase backups (paid plan), a policy for content changes while sessions are in progress.
