# Barrowdeep

A gothic isometric action-RPG for the browser. Double-click `index.html` to play (works from `file://`,
no build, no dependencies).

- Tests: `node test/run.js` (prints `ALL TESTS PASSED`); balance bands: `node test/run.js balance`.
- Balance tools: `node tools/balance_report.js quick|full`, `node tools/bot.js <class> <seed> 13 180` (a full
  bot run as JSON), `node tools/curve_snapshot.js` (refresh the bot-curve fixture `tools/curve.json` after big
  balance changes), `node tools/perf.js` (sim budget). Notes from balancing: `PLAYTEST.md`.
- Debug: open `index.html?debug=1` (F3 overlay, arena, data lab).
- Headless screenshots: `powershell -File tools\shot.ps1 -Test <autotest>` (see `js/debug/autotests/`).

## Architecture

Layers depend downward only: `core ← data ← sim ← view / audio ← ui / input ← app`
(`test/purity.test.js` enforces it).

- `js/core`, `js/data`, `js/sim` are DOM-free and deterministic: seeded RNG streams, one world clock, a fixed
  1000/60 ms step. Same seed + same commands ⇒ same game.
- Content is data (`js/data`); behaviour is looked up in registries by id: monster behaviours, boss moves
  (`js/sim/bosses/`, one file per boss), skill effects, floor events, scheduled events.
- `js/view` and `js/audio` subscribe to sim events. They never read the app or UI directly: what they need is
  declared in `BD.view.host` / `BD.audio.host` and filled in by `js/app.js`.
- Changing the world goes through `BD.sim.commands`: `issue()` queues gameplay commands for the next step;
  `apply()` runs menu commands (flagged `{ ui: true }`) immediately, also while paused.
- Timed events (`BD.core.scheduler`) are floor-scoped by default and dropped on leaving the floor; hero-scoped
  ones (`{ scope: 'run' }`) survive travel and saves.
- Saves are versioned (`BD.sim.save.migrations`) and reconciled against current content on load.
- Style: lines ≤ 140 chars (data tables 180); files are split by concept, not by size.

The design spec lives in the original repo's `remake/` folder.
