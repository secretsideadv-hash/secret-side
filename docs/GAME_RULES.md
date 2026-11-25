# Game Rules — how the adventure engine behaves

These rules are the contract for `features/engine`. Change them here first, then in code.

## 1. Concepts
- **Experience**: a published adventure in a city (e.g. the flagship "Saúde!", slug `saude`). Has ordered stops. "Secret Side" is the app brand, never an experience name.
- **Stop**: a location with coordinates, check-in radius, a short story (50–120 words), one challenge, optional backup venue and opening-time window.
- **Challenge**: the clue at a stop. Types for v1: `multiple_choice` (default) and `text`. Later: `observation`, `photo`, `qr`.
- **Session**: one play-through of an experience by a group. A session belongs to a guest or account and can have several players (phones).

## 2. Session states
`not_started → in_progress → completed`, plus `abandoned` (no activity for 48 h; can be resumed until the entitlement expires).

## 3. Stop states (per session)
`locked → unlocked → arrived → solved`, or `unlocked | arrived → skipped`.
- Stop 1 is `unlocked` when the session starts.
- `arrived`: player checked in (GPS within radius, or manual check-in).
- `solved`: answered correctly, or the answer was revealed (recorded as `resolution = answered | revealed`).
- `skipped`: allowed at any time from `unlocked` or `arrived`, including before arrival (closed venue, uncomfortable spot, running late). `resolution = skipped`.
- `solved` / `skipped` completes the stop and unlocks the next one.
- Completing the final stop completes the session and awards its rewards.

## 4. What the client may see
Only: experience summary, completed stops, the current stop (its story and question, after arrival), and hints already revealed. Never correct answers (until the player reveals them), never unrevealed hints, never locked stops. Unlocking returns the next stop's name, coordinates and teaser.

## 5. Check-in (GPS)
- Default radius 75 m; each stop can override (50–150 m). Porto's narrow streets cause GPS drift.
- Show live distance to the target. If the browser can't get a fix or it's outside the radius, offer **manual check-in** ("I'm here") after a short explanation. Manual check-ins are allowed and recorded (`check_in_method = gps | manual`). How the stop was completed is recorded separately as `resolution`.
- GPS is a convenience, not anti-cheat. Spoofing only spoils the game for the spoofer, so no extra machinery in v1.

## 6. Answer checking
- Each `text` challenge stores a list of **accepted answers** server-side, plus an `allow_fuzzy` flag.
- Normalise before comparing (applied to both the input and the accepted answers): lowercase, trim, strip accents (é → e), collapse spaces, drop punctuation and leading articles ("the", "o", "a", "os", "as").
- Accept exact match after normalisation. If `allow_fuzzy` is on, also accept a close match (edit distance ≤ 1 for answers of 5+ characters).
- **Never fuzzy-match numeric answers** (years, counts): if the normalised accepted answer contains a digit, only exact match counts, whatever `allow_fuzzy` says.
- Because article stripping can merge answers ("A Brasileira" → "brasileira"), the content validator (M5) flags accepted answers that collapse to the same string as another option.
- `multiple_choice`: the server stores the correct option id; option ids are opaque and options are shuffled per session (stable across refreshes).
- Wrong answers: unlimited attempts, a 3-second cooldown after 5 wrong attempts in a row (stops button-mashing, nothing more).

## 7. Hints, revealing and skipping
- Each challenge has 2 hints, from gentle nudge to almost the answer. Hint 1 is always available; hint 2 unlocks after hint 1 or after 2 wrong attempts.
- **Reveal the answer** becomes available only after hint 2 has been shown.
- **Skip the stop** is always available (see §3). Neither reveal nor skip blocks progress.
- Score (light, for fun only): 100 per stop, −15 per hint, −50 for a reveal or skip. No leaderboards in v1.

## 8. Groups (v1, from M4)
- Until M4 a session lives on one device only; sharing the play link does not share the session.
- Starting a session creates a 6-character **join code** and a share link/QR code.
- Up to 6 phones join the same session and see the same state. The first correct answer on any phone unlocks the next stop for everyone (Supabase Realtime or polling every few seconds).
- One purchase covers the whole session.

## 9. Guests, purchases and resuming
- Guests play via Supabase anonymous sign-in, no form required.
- Paid experiences: Stripe Checkout collects an email. The webhook (not the redirect) creates the entitlement and emails a **resume link** so a lost phone or cleared browser doesn't lose the purchase.
- **Entitlements last 12 months from purchase.** An abandoned session can be resumed until its entitlement expires.
- Players can pause at any time; progress is saved after every state change.
- A guest's progress lives with that browser (its sign-in cookies). An iPhone home-screen web app has its own cookies, separate from Safari's, so a session started in Safari won't appear in the installed app (and vice versa) until accounts or the resume link (M6).

## 10. Venues and opening hours
- Each stop can have an opening window and a backup venue. If the main venue is closed at play time, the engine unlocks the backup instead and says so.
- Opening windows are local times in `Europe/Lisbon` (never server UTC) and may cross midnight (e.g. 18:00–02:00).
- **Challenges must be answerable from the story or the street outside the venue.** If a challenge depends on the venue interior, the backup venue must have its own challenge.
- The experience page states the recommended start time window.
