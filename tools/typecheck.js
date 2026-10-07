// Type-check every js/ file with the TypeScript compiler (jsconfig.json; JSDoc types, @ts-check).
//   node tools/typecheck.js
// Dev-only: fetched on demand through npx, so the game itself stays dependency-free.
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');

const TS = 'typescript@5.9.3';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const r = spawnSync(npx, ['-y', '-p', TS, 'tsc', '-p', 'jsconfig.json'], {
  cwd: path.join(__dirname, '..'), stdio: 'inherit', shell: process.platform === 'win32',
});
if (r.status === 0) console.log('typecheck: no errors');
process.exit(r.status == null ? 1 : r.status);
