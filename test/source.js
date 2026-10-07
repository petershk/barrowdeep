// Source-scanning helpers shared by the purity and style tests.
'use strict';
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./harness');

/** Blank out comments and string/template literals, keeping line structure. */
function stripCode(src) {
  let out = '', i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') out += '\n'; i++; }
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      i++;
      while (i < n && src[i] !== q) {
        if (src[i] === '\\') i++;
        else if (src[i] === '\n') out += '\n';
        i++;
      }
      i++;
      out += '""';
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** every .js file under dir (recursive) */
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

module.exports = { ROOT, stripCode, files };
