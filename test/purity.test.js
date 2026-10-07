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
  // Layer dependencies point one way: core ← data ← sim ← view/audio ← ui/input ← app. A layer may
  // read the ones to its left, never the ones to its right (the view gets app state via BD.view.host).
  const UPWARD = {
    core: /\bBD\.(data|sim|view|audio|ui|input|app|debug)\b/,
    data: /\bBD\.(sim|view|audio|ui|input|app|debug)\b/,
    sim: /\bBD\.(view|audio|ui|input|app)\b/,
    view: /\bBD\.(audio|ui|input|app)\b/,
    audio: /\bBD\.(view|ui|input|app)\b/,
  };
  T.test('layers only depend downward', () => {
    const bad = [];
    for (const layer in UPWARD) {
      for (const f of files(path.join(ROOT, 'js', layer))) {
        const lines = stripCode(fs.readFileSync(f, 'utf8')).split('\n');
        lines.forEach((l, i) => { const m = l.match(UPWARD[layer]); if (m) bad.push(`${path.relative(ROOT, f)}:${i + 1} ${m[0]}`); });
      }
    }
    T.ok(bad.length === 0, 'upward references:\n    ' + bad.join('\n    '));
  });
  T.test('stripper ignores comments and strings', () => {
    T.ok(!BANNED.test(stripCode("// window\n/* Date */ const s = 'document'; const combo_window = 1;")));
    T.ok(BANNED.test(stripCode('const t = Date.now();')));
  });
  // Size rules target what actually hurts reading: long lines and god files. Files are split by
  // concept, not to satisfy a number, so file length only fails far past any sane module size.
  const LINE_MAX = 140;
  const TABLE_LINE_MAX = 180; // pure data rows (one record per line reads better than wrapped records)
  const TABLE_DIRS = [path.join('js', 'data') + path.sep];
  const TABLE_FILES = ['js/audio/sounds.js', 'js/view/fx_recipes.js'].map((f) => path.normalize(f));
  const FILE_FAIL = 1000;
  T.test('lines stay readable: ' + LINE_MAX + ' chars (data tables ' + TABLE_LINE_MAX + ')', () => {
    const bad = [];
    for (const f of files(path.join(ROOT, 'js'))) {
      const rel = path.relative(ROOT, f);
      const max = TABLE_FILES.includes(rel) || TABLE_DIRS.some((d) => rel.startsWith(d)) ? TABLE_LINE_MAX : LINE_MAX;
      fs.readFileSync(f, 'utf8').split('\n').forEach((l, i) => { if (l.length > max) bad.push(`${rel}:${i + 1} (${l.length})`); });
    }
    T.ok(bad.length === 0, bad.length + ' long lines:\n    ' + bad.slice(0, 40).join('\n    '));
  });
  T.test('no god files (' + FILE_FAIL + '+ lines)', () => {
    const big = [];
    for (const f of files(path.join(ROOT, 'js'))) {
      const n = fs.readFileSync(f, 'utf8').split('\n').length;
      if (n >= FILE_FAIL) big.push(`${path.relative(ROOT, f)} (${n})`);
    }
    T.ok(big.length === 0, 'split by concept: ' + big.join(', '));
  });
};
