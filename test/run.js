// Test runner: node test/run.js [filter]
// Runs every *.test.js under test/ (filtered by substring), prints ALL TESTS PASSED or exits 1.
'use strict';
const fs = require('fs');
const path = require('path');
const T = require('./assert');

const filter = process.argv[2] || '';
const files = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.test.js')) files.push(p);
  }
})(__dirname);
files.sort();

// balance tests are slow; run them only when asked by name
const selected = files.filter((f) => {
  const rel = path.relative(__dirname, f);
  if (filter) return rel.includes(filter);
  return !rel.includes('balance');
});

(async () => {
  const t0 = Date.now();
  for (const f of selected) {
    T.setFile(path.relative(__dirname, f));
    try {
      const mod = require(f);
      if (typeof mod === 'function') await mod(T);
    } catch (e) {
      T.fail('load ' + path.relative(__dirname, f), e);
    }
  }
  await T.runAll();
  const r = T.report();
  console.log(`\n${r.passed} passed, ${r.failed} failed (${selected.length} files, ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  if (r.failed) { console.log('TESTS FAILED'); process.exit(1); }
  console.log('ALL TESTS PASSED');
})();
