# Pong BD — Classic Pong vs CPU

A classic Pong arcade game for the browser: you (left paddle) vs the computer
(right paddle). First to 5, 7 or 11 points wins the match. Fully offline,
bilingual English/বাংলা, and playable with mouse, touch, or keyboard.

## Features

- **Real Pong physics** — angle-based paddle rebounds (up to 60°), ball speed
  grows 5% per paddle hit up to a 720 px/s cap, swept collision checks so a
  fast ball cannot tunnel through a paddle.
- **Three CPU difficulties** — Easy (slow, sloppy, ±60 px targeting error),
  Medium (faster, ±25 px error), Hard (fast, zero error, predicts wall
  bounces to aim at the ball's arrival height).
- **Match options** — first to 5, 7 or 11 points; pause/resume, restart,
  and a persistent best-wins counter.
- **Controls** — mouse move, touch drag, W/S or ↑/↓ arrow keys.
- **Sound** — WebAudio beeps for paddle hits, wall bounces, points and wins,
  with a mute toggle (no audio files).
- **Bilingual UI** — English/বাংলা toggle persisted in localStorage, with
  Bengali digits for scores in বাংলা mode.
- **Offline by design** — zero network requests; no account; scores and
  settings stay in the browser's localStorage only.

## Play

Open `index.html` in any modern browser, or visit the GitHub Pages site.
Press **Start Game**, move your paddle, and reach the target score first.

## Project layout

```
index.html        Page structure (all UI text rendered by js/app.js)
styles.css        Responsive styling (600 px stage, 390 px mobile fit)
js/logic.js       DOM-free game engine (also unit-tested under Node)
js/i18n.js        English + Bengali UI strings
js/app.js         Canvas rendering, input, sound, persistence
tests/tests.js    Node unit tests for the engine
tests/smoke.js    Headless-Chrome smoke test (raw CDP, no dependencies)
```

## Testing

```sh
node tests/tests.js   # engine unit tests
node tests/smoke.js   # headless-Chrome smoke test (spawns its own Chrome)
```

## Limitations (honest)

- Hard difficulty predicts bounces but does not plan rallies — it is a
  tracker, not a solved Pong engine.
- Sound uses WebAudio beeps; headless browsers may keep the audio context
  suspended, so the smoke test asserts game state, not audible output.
- Best-wins and settings live in one browser's localStorage; there is no
  cross-device sync and no online leaderboard.

## Status

Built by the MUSE Project Factory (run #143, 2026-10-26 12:00 Asia/Dhaka).
Offline toy game — not a physics simulation, and no data leaves the device.
