# Barrowdeep

A gothic isometric action-RPG for the browser. Double-click `index.html` to play (works from `file://`,
no build, no dependencies).

- Tests: `node test/run.js` (prints `ALL TESTS PASSED`); balance bands: `node test/run.js balance`.
- Balance tools: `node tools/balance_report.js quick|full`, `node tools/bot.js <class> <seed> 13 180` (a full
  bot run as JSON), `node tools/curve_snapshot.js` (refresh the bot-curve fixture `tools/curve.json` after big
  balance changes), `node tools/perf.js` (sim budget). Notes from balancing: `PLAYTEST.md`.
- Debug: open `index.html?debug=1` (F3 overlay, arena, data lab).
- Headless screenshots: `powershell -File tools\shot.ps1 -Test <autotest>` (see `js/debug/autotests/`).

Architecture: `js/core`, `js/data`, `js/sim` are DOM-free and deterministic (seeded RNG, one world clock);
`js/view`, `js/audio`, `js/ui` subscribe to sim events; `js/input` and the bot only issue commands.
The design spec lives in the original repo's `remake/` folder.
