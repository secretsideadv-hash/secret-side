# Milestone 3 — Location: GPS check-in, the Mapbox 3D map, the Emergency view

**Done when:** on your phone, in Porto, you walk to a Saúde! stop and the app checks you in by GPS
(with "I'm here" still available if GPS is poor), the 3D map shows only the stops you're allowed to
see, and the Emergency view works from every play screen.

Same routine: paste one prompt, check the result, commit. Bring the M3-1 plan here before approving.

---

## Before you start
Done in the M2 wrap-up (check they're finished):
- Vercel Preview checked against the dev project, branch cleaned up.
- GitHub Actions secrets added (DEV_SUPABASE_PUBLISHABLE_KEY, DEV_SUPABASE_SECRET_KEY, DEV_SUPABASE_DB_URL)
  and the Actions tab shows green.
- Mapbox account (Secret Side identity) with two public tokens:
  `secret-side-production` (restricted to https://secret-side-vert.vercel.app) and
  `secret-side-dev` (restricted to http://localhost:3000 and the Preview URL).
  Don't paste tokens in chat; Claude Code says where they go.

---

### Prompt M3-1 — Plan (no code)
```
We're starting M3: GPS check-in, the Mapbox 3D map and the Emergency view.
Read CLAUDE.md, docs/GAME_RULES.md (especially §5 and §11), docs/ARCHITECTURE.md, docs/OPERATIONS.md
and the M2 review notes in docs/ROADMAP.md. Don't write code yet. Give me:
- GPS check-in: what the browser sends (position, accuracy, timestamp), how the server computes the
  distance and decides (radius plus a capped accuracy allowance), what the player sees while waiting
  for a fix, when manual "I'm here" is offered, and how location permission is asked (only when needed,
  with a clear reason, and a good path if they say no).
- The map: Mapbox GL behind our MapView wrapper, lazy-loaded, 3D buildings and pitched camera with a
  2D/3D toggle (as in the mockups), our dark style, only completed and current stops plus the player's
  position, the static map as fallback if the token, network or WebGL fails, and the CSP changes.
- The Emergency view per GAME_RULES §11, including how "show remaining stops" ends the session on the
  server first.
- Battery and data use on a phone during a 2.5-hour adventure, and what happens in narrow streets
  with poor GPS.
- How to test GPS without walking around (Playwright geolocation), and a field-test checklist for me
  to walk in Porto.
- The step list, risks, and anything in the docs you'd change.
Wait for my approval.
```

### Prompt M3-2 — GPS check-in
```
Build GPS check-in from the approved plan: location permission flow, live distance to the current
stop, server-side distance check with the accuracy allowance, manual "I'm here" fallback, and the
engine recording the check-in method. Add unit tests for the distance and accuracy rules and
Playwright tests with simulated positions (inside, outside, poor accuracy, permission denied).
Run all checks, commit and push.
```

### Prompt M3-3 — The Mapbox 3D map
```
Replace the static map behind MapView with Mapbox GL from the approved plan: lazy-loaded, our dark
style, 3D buildings with a pitched camera and a 2D/3D toggle, completed and current stops plus the
player's position, no locked stops ever, and the static map as fallback. Update the CSP allow-list
and its tests. Tell me exactly where the two Mapbox tokens go (.env.local, Vercel Production,
Vercel Preview). Check it at 375, 390 and 430px. Run all checks, commit and push.
```

### Prompt M3-4 — Emergency view
```
Build the Emergency view per GAME_RULES §11: an Emergency button on every active-adventure screen that
is never disabled, the view with tap-to-call 112 first, my position, stops reached and the way back to
the start, and "show all remaining stops" that confirms, ends the session on the server and only then
reveals them. Add e2e tests proving the button is reachable on every stop status, that opening and
closing it changes nothing, and that remaining stops are never sent before the session has ended.
Run all checks, commit and push.
```

### Prompt M3-5 — Field test, deploy and review
```
Help me finish M3 on the live site: Mapbox tokens set in Vercel, a fresh deploy, verify:live passing,
and a printable field-test checklist for walking all 5 Saúde! stops in Porto (what to check at each
stop, how to note GPS problems and the radius that would have worked). After my walk I'll send you my
notes; then adjust check-in radii in the content, re-import, and review M3 against docs/ROADMAP.md.
Update the docs.
```

## M3 is done when
You've walked at least two real stops in Porto on the live site: GPS checked you in (or offered
"I'm here" with a sensible message), the 3D map looked right, and the Emergency view opened from the
Play screen.
