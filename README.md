# Barrowdeep

A gothic isometric action-RPG for the browser. Double-click `index.html` to play (works from `file://`,
no build, no dependencies).

- Tests: `node test/run.js` (prints `ALL TESTS PASSED`); balance sweep: `node test/run.js balance`.
- Debug: open `index.html?debug=1` (F3 overlay, arena, data lab).
- Headless screenshots: `powershell -File tools\shot.ps1 -Test <autotest>` (see `js/debug/autotests/`).

Architecture: `js/core`, `js/data`, `js/sim` are DOM-free and deterministic (seeded RNG, one world clock);
`js/view`, `js/audio`, `js/ui` subscribe to sim events; `js/input` and the bot only issue commands.
The design spec lives in the original repo's `remake/` folder.
