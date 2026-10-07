// core/, data/ and sim/ must be DOM-free and deterministic.
'use strict';
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./harness');

const BANNED = /\b(window|document|localStorage|setTimeout|setInterval|requestAnimationFrame|performance|Date|Math\.random|Audio|crypto)\b/;

/** Blank out comments and string/template literals, keeping line structure. */
function stripCode(src) {
  let out = '', i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') out += '\n'; i++; } i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; i++;
      while (i < n && src[i] !== q) { if (src[i] === '\\') i++; else if (src[i] === '\n') out += '\n'; i++; }
      i++; out += '""'; continue;
    }
    out += c; i++;
  }
  return out;
}

function files(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) out.push(...files(p));
    else if (f.endsWith('.js')) out.push(p);
  }
  return out;
}

module.exports = (T) => {
  T.test('core/data/sim are pure', () => {
    const bad = [];
    for (const layer of ['core', 'data', 'sim']) {
      for (const f of files(path.join(ROOT, 'js', layer))) {
        const lines = stripCode(fs.readFileSync(f, 'utf8')).split('\n');
        lines.forEach((l, i) => { const m = l.match(BANNED); if (m) bad.push(`${path.relative(ROOT, f)}:${i + 1} ${m[0]}`); });
      }
    }
    T.ok(bad.length === 0, 'banned identifiers:\n    ' + bad.join('\n    '));
  });
  T.test('stripper ignores comments and strings', () => {
    T.ok(!BANNED.test(stripCode("// window\n/* Date */ const s = 'document'; const combo_window = 1;")));
    T.ok(BANNED.test(stripCode('const t = Date.now();')));
  });
  T.test('files stay small', () => {
    const big = [];
    for (const f of files(path.join(ROOT, 'js'))) {
      const n = fs.readFileSync(f, 'utf8').split('\n').length;
      if (n > 480) big.push(`${path.relative(ROOT, f)} (${n})`);
    }
    T.ok(big.length === 0, 'files over budget: ' + big.join(', '));
  });
};
