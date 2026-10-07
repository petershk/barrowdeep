// core/, data/ and sim/ must be DOM-free and deterministic.
'use strict';
const fs = require('fs');
const path = require('path');
const { ROOT, stripCode, files } = require('./source');

const BANNED = /\b(window|document|localStorage|setTimeout|setInterval|requestAnimationFrame|performance|Date|Math\.random|Audio|crypto)\b/;

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
};
