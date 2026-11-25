# Roadmap

One milestone at a time. A milestone is done only when it runs on a real phone.

| # | Milestone | Done when | Status |
|---|-----------|-----------|--------|
| M1 | **Playable slice (mock content)**: app shell, design tokens, Home, Adventure details, Play (story, clue, hints, server-checked answers), Unlocked, basic map | You can play stops 1–2 of Saúde! on your phone from a Vercel preview link | ✅ Done (2026-11-24) |
| M2 | **Supabase**: schema + RLS + migrations, anonymous guest sessions, content moved from files to the database, progress saved and resumable | Close the browser mid-adventure, reopen, carry on |  |
| M3 | **Location**: live GPS distance, check-in radius, manual fallback, Mapbox 3D map with completed/current stops only | Check in at real Porto locations |  |
| M4 | **Groups**: join code/QR, shared session across phones, realtime unlocks | Two phones play the same session |  |
| M5 | **Content pipeline**: real venues and verified stories for the full 5-stop flagship + 1 walking mystery, validator rules for real content (opening hours, backup venues), using the M2 import script | Both adventures walk-tested end to end |  |
| M6 | **Payments**: Stripe Checkout, webhook entitlements, email resume link | A test purchase unlocks the flagship |  |
| M7 | **Passport & completion**: stamps, titles, completion screen, share card, feedback | Finishing an adventure awards a stamp |  |
| M8 | **Pilot launch**: PWA install, analytics (PostHog), QR codes for hotels/hostels, soft launch to 20–30 testers | Real visitors complete and pay |  |

## Deliberately later
Admin Studio with a map route editor (until then, content is edited in seed files and imported), food quests, hidden-gem map, "I have 2 hours" generator, leaderboards, AI personalisation, audio, offline mode, native apps, more cities.
