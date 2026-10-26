# Pong BD — Test Results (run #143, 2026-10-26)

## Unit tests — 44/44 PASS (Node, `node tests/tests.js`)

Engine: `js/logic.js`, DOM-free, same code shipped to the browser.

Hand-verified cases (all asserted exactly):

- Defaults: phase `ready`, scores 0/0, target 7, difficulty medium; invalid
  difficulty/target fall back to medium/7.
- Serve: ball centered (300, 200), vx +300 at angle 0.
- Top-wall bounce flips vy and sets `lastEvent = 'wall'`.
- Player paddle center hit: vx reverses, speed 300 → 315 (+5%), rally 1.
- Top-edge hit: vy negative with magnitude 315·sin(60°).
- AI paddle hit reverses vx; swept check: a 720 px/s ball crossing the
  paddle plane in one 0.05 s step still bounces (no tunneling).
- Left miss: AI scores, `lastScorer = 'ai'`, `lastEvent = 'point'`, ball
  re-serves toward the player (vx < 0).
- Win: at target 5 with 4 points, a right miss ends the match
  (`phase = 'over'`, `winner = 'player'`).
- Speed cap: 700 → 720 (MAX_SPEED), never above.
- `foldY`: 450 → 350, −50 → 50, 800 → 0.
- `predictY`: straight (300,100)→100; angled (300,100,v 300/150)→235;
  moving away → center 200.
- Hard AI targets predicted y exactly (100) and moves toward it; Easy AI
  with rng 0 applies −60 error → target 40 (paddle-range clamp).
- Paddle clamps at top (40); pointer tracking moves 200 → 290 in 0.1 s
  at 900 px/s.
- Pause toggles playing ↔ paused; resetMatch restores ready + 0/0.

Repairs during testing: 3 test-setup fixes only (ball start x moved so the
ball actually reaches the paddle plane in one step); 1 real logic fix
(`serve()` no longer clears `lastEvent`, which had erased the `point`
event) and 1 real logic improvement (swept paddle collision instead of a
narrow positional window). 0 remaining failures.

## Headless-Chrome smoke — 16/16 PASS (`node tests/smoke.js`)

Raw CDP against `/opt/meta-chromium/chrome` (Chrome 152), `file://` page,
no npm dependencies:

- Page title, h1, 600×400 canvas, initial state ready/0/0/target 7.
- Ready overlay visible; Start → phase `playing`; ball moves
  (x 420 → 540 across two reads).
- CDP ArrowDown key event moves the player paddle (200 → 315).
- Pause → `paused`; pause again → `playing`.
- Language toggle: title Pong BD → Bengali title → Pong BD.
- Restart → ready + 0/0 scores.
- Zero console/page errors, zero network requests.
- 390 px viewport: no horizontal overflow.

Note: the first smoke run crashed on a harness bug — `/json/new` requires
a PUT verb (Chrome returns "Using unsafe HTTP verb GET" otherwise). Fixed
in the harness; 0 app changes. Audio is not asserted headlessly (context
may stay suspended without a trusted gesture); beeps are verified by code
path only.

## Source hygiene

All shipped files are pure ASCII (Bengali strings as `\uXXXX` escapes in
JS, numeric entities in HTML), verified with `grep -P '[^\x00-\x7F]'`
(zero matches) after a build-time escaping pass. Re-verified after
escaping: unit tests still 44/44, all three JS files pass `node --check`.
