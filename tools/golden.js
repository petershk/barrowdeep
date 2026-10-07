// Gameplay fingerprint for refactors: full bot runs and boss fights, hashed. A behaviour-preserving
// change must print exactly the same output before and after.
//   node tools/golden.js [maxFloor=13] > before.txt   ...refactor...   node tools/golden.js > after.txt
// Runs each class in its own process (about a minute in total on four cores).
'use strict';
const path = require('path');
const { execFileSync, spawn } = require('child_process');

const CLASSES = ['fighter', 'assassin', 'magician', 'valkyrie'];

function fingerprint(obj) {
  const s = JSON.stringify(obj, (k, v) => (k === 'realSeconds' ? undefined : v));
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h.toString(16).padStart(8, '0');
}

function botRun(cls, maxFloor) {
  const out = execFileSync(process.execPath, [path.join(__dirname, 'bot.js'), cls, 'golden', String(maxFloor), '40'], { maxBuffer: 1 << 26 });
  const r = JSON.parse(out.toString().slice(out.toString().indexOf('{')));
  return { cls, deepest: r.deepest, level: r.level, dead: r.dead, minutes: r.minutes, hash: fingerprint(r) };
}

function bossFights() {
  const L = require('./balance_lib');
  const BD = L.makeBD();
  const res = {};
  for (const n of [3, 6, 9, 12, 13]) {
    for (const cls of ['fighter', 'magician']) res[n + ':' + cls] = fingerprint(L.bossFight(BD, cls, n, 'g' + n, 0));
  }
  return res;
}

if (process.argv[2] === '--one') {
  const [, , , what, cls, maxFloor] = process.argv;
  const r = what === 'boss' ? bossFights() : botRun(cls, Number(maxFloor));
  process.stdout.write(JSON.stringify(r));
} else {
  const maxFloor = Number(process.argv[2] || 13);
  const jobs = CLASSES.map((c) => ['bot', c, maxFloor]).concat([['boss', '-', 0]]);
  const results = new Array(jobs.length);
  let left = jobs.length;
  jobs.forEach((j, i) => {
    const p = spawn(process.execPath, [__filename, '--one', ...j.map(String)]);
    let buf = '';
    p.stdout.on('data', (d) => { buf += d; });
    p.stderr.on('data', () => {});
    p.on('close', () => {
      results[i] = buf;
      if (--left) return;
      for (const r of results) console.log(r);
    });
  });
}
