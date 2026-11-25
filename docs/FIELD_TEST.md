# Field test: Saúde! in Porto (M3)

A walk of the 5 Saúde! stops on the **live site** (https://secret-side-vert.vercel.app) to check GPS
check-in, the 3D map and the Emergency view on a real phone, and to collect the numbers needed to
tune each stop's check-in radius. About 1.3 km and 60–90 minutes, with one steep climb (stop 1 → 2).

**M3 is done when** at least two real stops are walked: GPS checked you in (or offered "I'm here"
with a sensible message), the 3D map looked right, and the Emergency view opened from the Play screen.

## Before you go
- [ ] Phone charged; location turned on for the browser (iPhone: Settings → Privacy → Location Services → Safari Websites → While Using).
- [ ] Open the site in the browser, not the home-screen app (it keeps separate cookies).
- [ ] Write down the time you start: ________. After the walk, send me your notes and the session id
      (the part of the address after `/play/`). If you lose it, I can find the session by its start time.
- [ ] Content is still placeholder (venue names read "[Stop 1 venue]" and so on). Opening hours aren't enforced yet, so any time of day works.
- [ ] Answers, so a puzzle never holds you up: 1 the boatmen · 2 Rosário · 3 his blue cap · 4 seven · 5 as a compass.

## How to note a GPS reading
On "Head to your next stop", after **Use my location**, the screen shows **About N m away · GPS ±A m**.
At each stop, write down three readings:
1. **First in range:** the reading when check-in first succeeds (or would). Also note where you were: still out of sight of the stop, at the corner, at the spot?
2. **At the spot:** the reading where you'd say "I've arrived" (for a placeholder stop, the coordinates below).
3. **Check-in result:** checked in by GPS, "too far", "GPS unsure", or "I'm here" only (and after how long).

Record the readings as shown; I'll work out the radius from them. The server accepts a check-in when
`N − min(A, 35) ≤ radius`, so the radius that would have worked at the spot is `N − min(A, 35)`.
Also note anything about the place: open square, narrow street, tall façades, under arches, crowds, indoors.

## The stops

| # | Where (placeholder spot) | Coordinates | Radius now |
|---|---|---|---|
| 1 | Praça da Ribeira, by the river | 41.1407, −8.6131 | 75 m |
| 2 | Terreiro da Sé, the cathedral square (steep climb) | 41.1428, −8.6110 | 75 m |
| 3 | São Bento station, front square | 41.1456, −8.6105 | 100 m |
| 4 | Avenida dos Aliados, middle of the avenue | 41.1484, −8.6109 | 75 m |
| 5 | Praça de Lisboa, below the Clérigos tower | 41.1468, −8.6142 | 75 m |

### At every stop
| Check | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| First in range: N m / ±A m / where | | | | | |
| At the spot: N m / ±A m | | | | | |
| Result: GPS / too far / unsure / "I'm here" only | | | | | |
| Seconds from "Use my location" to the first reading | | | | | |
| The place (square, narrow street, façades, arches…) | | | | | |
| Map: your dot in the right place? the stop marker right? | | | | | |
| Anything confusing, slow or wrong | | | | | |

### Once during the walk
- [ ] **Location prompt:** asked only after tapping "Use my location", with the one-line reason. How often did the phone ask again? ________
- [ ] **3D map:** buildings look right and the dark style is readable in the street (in daylight and, if you can, at night). 2D/3D toggle works and is remembered.
- [ ] **"Show me":** walk away from the map view and tap it: it fits you and the stop.
- [ ] **Emergency view** (from the Play screen, at stop 2 or 3): SOS opens it at once; your coordinates appear; "Stops you've reached" is right; "Walking directions to the start" opens Google Maps.
  - **Call 112:** on an iPhone, tapping shows a "Call 112?" confirmation, so tap **Cancel**. On Android it opens the dialer with 112 filled in, so **don't press call**. Just check the number appears.
  - **Don't** tap "End and show stops" unless you're testing it last (it ends the adventure). If you do: you see "Adventure ended early" with every stop on the map.
- [ ] **Offline:** turn on aeroplane mode on the Play screen and open SOS. Everything shows except "show the remaining stops", which says it needs a connection. Turn it off again.
- [ ] **Background and come back:** lock the phone for a minute on "Head to your next stop", unlock: location picks up again, nothing is lost.
- [ ] **Close and resume:** close the browser tab once, reopen the site: "Continue" lands on the stop you were at.
- [ ] **Battery:** level at the start ______ % and at the end ______ %.
- [ ] **Readability:** can you read it in sunlight, one-handed, while walking?

## After the walk
Send me your notes and the session id. I'll run `npm run field:report -- <session id>` (read-only on
live), which shows, for every GPS check-in, the distance and accuracy the server recorded and how much
slack the radius had. From that and your notes I'll set each stop's `checkInRadiusM` (50–150 m) in
`content/porto/saude.ts`, import to dev and then live, and complete the M3 review in `docs/ROADMAP.md`.
