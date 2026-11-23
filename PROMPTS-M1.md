# Milestone 1 — prompts to paste into Claude Code, in order

## Before you start (on your computer)
1. Install Node.js (LTS), Git, VS Code and Claude Code.
2. Create free accounts: GitHub, Vercel. (Supabase and Mapbox come in M2/M3.)
3. Your project folder is `Desktop\Apps\ROAM`; `CLAUDE.md` and the `docs/` folder are already in it.
4. Open a terminal in that folder and run `claude`.

Paste one prompt, let it finish, check the result, then commit:
`git add -A && git commit -m "<what was done>"`. If something looks wrong, say so before moving on.

---

### Prompt 1 — Plan (no code)
```
Read CLAUDE.md, docs/GAME_RULES.md and docs/ROADMAP.md.
We're starting milestone M1. Don't write code yet.
Give me: the folder structure you'll create, the TypeScript types for Experience, Stop,
Challenge, Hint and Session (shaped so they map cleanly onto Supabase tables in M2),
how mock content will stay server-only so answers and locked stops never reach the
browser, and the list of steps for M1. Point out anything in the docs you think is wrong
or risky. Wait for my approval.
```

### Prompt 2 — Project setup and app shell
```
Set up the project: Next.js App Router with TypeScript strict, Tailwind, ESLint,
Vitest, and npm scripts for lint, typecheck and test. Initialise git with a sensible
.gitignore and an .env.example.
Add the design tokens from CLAUDE.md to Tailwind, load Space Grotesk and Inter with
next/font, and build the mobile app shell: dark background, max width 430px centred
on larger screens, and the bottom navigation (Discover, Explore, My adventures,
Passport) with simple placeholder pages.
Run lint, typecheck and the dev server, then tell me how to view it on my phone.
```

### Prompt 3 — Mock content and the engine
```
Create content/porto/ with mock content for the flagship "Saúde!" (slug saude) following our
types: 5 stops around the Porto historic centre, each with a short story, a
multiple-choice or text challenge, accepted answers and 2 hints. Use placeholder venue
names like "[Stop 3 venue]" and mark every invented fact with // MOCK: so I can replace
them with verified content. The content module must be server-only.
Then build features/engine as plain TypeScript: start session, get visible state (only
what the client may see per GAME_RULES section 4), check answer (with the normalisation
and fuzzy rules in section 6), reveal hint, skip, unlock next stop. For now keep session state in
an encrypted, signed cookie so it survives on Vercel without a database (// MOCK:,
replaced by Supabase in M2). The cookie must not be readable or editable by the player.
Write Vitest tests for answer normalisation, hint rules, skipping and the
"never expose locked stops or answers" rule. Run them.
```

### Prompt 4 — Home and Adventure details screens
```
Build the Discover home screen and the Adventure details screen to match this
description of the approved mockups:
Home: city pill "Porto" and a "Playing as guest" pill; heading "Don't just visit.
Play Porto." with "Play Porto." in amber; a "Continue" card with a 5-segment progress
bar when a session is in progress; the featured adventure card (illustration area,
"Mystery pub crawl · Flagship" tag, title, one-line hook, duration · stops · difficulty
and price); an amber "I have 2 hours" card (it can link to a "coming soon" page for now);
category chips: Mysteries, Night out, Food quests, Hidden gems.
Details: hero illustration with back button, tag line, title, description, a 4-tile
row (Duration, Stops, Puzzles, Walking), "How it works" in 3 numbered steps, a "good to
know" line (drinks not included, non-drinker friendly, skip any stop, hints always
available) and a fixed bottom bar with price and an "Unlock adventure" button that
starts a session (free in M1).
Read content through the engine/server, never import answers into client components.
Check at 375, 390 and 430px widths.
```

### Prompt 5 — Play and Unlocked screens
```
Build the active adventure flow at /play/[sessionId]:
Play screen: close button, adventure title, 5-segment progress and "2/5" counter, a
green "Checked in" banner (manual check-in button for now), the story card with
"Stop N · title" label and the question, answer options as a 2-column grid (or a text
field for text challenges), a revealed-hint box in blue, a wrong-answer message, and a
bottom bar with Hint and Check answer buttons plus "Stuck? Skip this stop" text.
Answers are checked by a server action that calls the engine.
Unlocked screen: lock icon in amber, "Stop N of 5 unlocked", "Destination unlocked",
the next stop's name and teaser, "Take me there" and "Open in Google Maps" buttons.
Final stop goes to a simple completion screen.
Add a Playwright test that plays the whole mock adventure. Run all checks.
```

### Prompt 6 — Basic map and phone test
```
Add a simple map view for the current stop using our components/maps wrapper. For M1
use a static placeholder map with the stop pin and "Open in Google Maps" link
(// MOCK:); the real Mapbox 3D map is M3, so keep the wrapper's props ready for it.
Then help me deploy to Vercel from GitHub so I can open a preview link on my phone.
Finally, review all of M1 against docs/ROADMAP.md: what's done, what's mocked, and
anything you'd fix before M2.
```

## M1 is done when
You open the Vercel link on your phone, tap Saúde!, start it, solve
stop 1, see the unlock screen and continue to stop 2, and refreshing the page doesn't
reveal answers or later stops (check this with the browser's developer tools on a computer).
