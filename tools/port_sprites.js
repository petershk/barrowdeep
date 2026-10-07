// One-off tool: extract the legacy sprite grids into js/view/sprite_art.js (frames.idle).
// usage: node tools/port_sprites.js <legacy sprites.js>
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(process.argv[2], 'utf8');
const start = src.indexOf('const DEFS = {');
const end = src.indexOf('\n  };', start);
const body = src.slice(start + 'const DEFS = '.length, end + 4);
const DEFS = Function('"use strict"; return (' + body + ');')();
let out = '// @ts-check\n// Pixel-art grids (ported from the original game). Each char is a palette key;\n' +
  "// '.' is transparent, K is the shared outline ink. Faces right; mirrored by the view.\n" +
  '(function (BD) {\n  \'use strict\';\n  BD.view.art = BD.view.art || {};\n  const A = BD.view.art;\n';
for (const [id, d] of Object.entries(DEFS)) {
  const w = Math.max(...d.grid.map((r) => r.length));
  const rows = d.grid.map((r) => r.padEnd(w, '.'));
  out += `  A.${id} = {\n    pal: ${JSON.stringify(d.pal).replace(/"([A-Za-z])":/g, '$1:').replace(/,/g, ', ')},\n    frames: { idle: [[\n${rows.map((r) => "      '" + r + "',").join('\n')}\n    ]] },\n  };\n`;
}
out += '})(globalThis.BD);\n';
fs.writeFileSync(path.join(__dirname, '..', 'js', 'view', 'sprite_art.js'), out);
console.log('ported', Object.keys(DEFS).length, 'sprites');
