// Readability rules for js/. Used by test/style.test.js; also a CLI that lists every violation:
//   node test/style_rules.js [path-prefix ...]      e.g. node test/style_rules.js js/sim js/core
// Each rule targets something that measurably slowed reading in the audit:
//   line-length      lines ≤ 140 chars (data tables 180)
//   god-file         a file ≥ 1000 lines (split by concept, not by size)
//   short-alias      module aliases of one or two letters (`const P = BD.view.palette`)
//   index-math       hand-written `y * f.w + x` outside js/core (use BD.core.grid.idx)
//   multi-statement  two statements on one line (`a = 1; b = 2;`)
//   nested-ternary   two ternaries on one line
//   long-function    a function body longer than 60 lines
'use strict';
const fs = require('fs');
const path = require('path');
const { ROOT, stripCode, files } = require('./source');

const LINE_MAX = 140;
const TABLE_LINE_MAX = 180;
const TABLE_FILES = ['js/audio/sounds.js', 'js/view/fx_recipes.js'];
const FILE_MAX = 1000;
const FUNCTION_MAX = 60;

const isTable = (rel) => rel.startsWith('js/data/') || TABLE_FILES.includes(rel);

// a module-level nickname for a BD path (`const P = BD.view.palette;`), not a local value
const SHORT_ALIAS = /^\s*const ([A-Z][A-Za-z]?) = (\(\) => )?BD(\.\w+)+;\s*$/;
const INDEX_MATH = /\b[\w.]+\s*\*\s*[\w.]+\.w\s*\+\s*[\w.]+/;
// a `;` followed by more code on the same line (a trailing `}` or `)` is fine)
const MULTI = /;\s*[^\s;})\]]/;
// a function head whose body opens on this line
const FN_HEAD = /(\bfunction\b[^(]*\([^)]*\)\s*\{|=>\s*\{|^\s*(async\s+)?(?!if\b|for\b|while\b|switch\b|catch\b|with\b)[\w$]+\s*\([^)]*\)\s*\{)\s*$/;

function ternaries(line) {
  let n = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i] !== '?') continue;
    const next = line[i + 1], prev = line[i - 1];
    if (next === '.' || next === '?' || prev === '?') continue;
    n++;
  }
  return n;
}

/** length of the function whose body opens with the last `{` on line i */
function functionLength(lines, i) {
  let depth = 0;
  for (let j = i; j < lines.length; j++) {
    for (const ch of lines[j]) {
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) return j - i + 1;
      }
    }
  }
  return 0;
}

/** @returns {{rule: string, at: string, detail?: string}[]} */
function check(file) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  // line endings are normalised to LF on commit; a CRLF working copy must not count the \r
  const src = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const raw = src.split('\n');
  const code = stripCode(src).split('\n');
  const out = [];
  const add = (rule, i, detail) => out.push({ rule, at: rel + ':' + (i + 1), detail });
  const max = isTable(rel) ? TABLE_LINE_MAX : LINE_MAX;
  if (raw.length >= FILE_MAX) add('god-file', 0, raw.length + ' lines');
  raw.forEach((l, i) => { if (l.length > max) add('line-length', i, l.length + ' chars'); });
  code.forEach((l, i) => {
    const alias = raw[i].match(SHORT_ALIAS);
    if (alias) add('short-alias', i, alias[1]);
    if (!rel.startsWith('js/core/') && INDEX_MATH.test(l)) add('index-math', i);
    const noForHeader = l.replace(/\bfor\s*\((?:[^()]|\([^()]*\))*\)/g, 'for()');
    if (MULTI.test(noForHeader)) add('multi-statement', i);
    if (ternaries(l) >= 2) add('nested-ternary', i);
    // the file-wrapping IIFE is not a function anyone reads as one
    if (FN_HEAD.test(l) && !/^\(function/.test(l)) {
      const n = functionLength(code, i);
      if (n > FUNCTION_MAX) add('long-function', i, n + ' lines');
    }
  });
  return out;
}

function checkAll(prefixes) {
  const all = files(path.join(ROOT, 'js')).flatMap(check);
  if (!prefixes || !prefixes.length) return all;
  return all.filter((v) => prefixes.some((p) => v.at.startsWith(p.replace(/\\/g, '/'))));
}

if (require.main === module) {
  const v = checkAll(process.argv.slice(2));
  const byRule = {};
  for (const x of v) (byRule[x.rule] = byRule[x.rule] || []).push(x);
  for (const r in byRule) {
    console.log(`\n${r} (${byRule[r].length})`);
    for (const x of byRule[r]) console.log('  ' + x.at + (x.detail ? '  ' + x.detail : ''));
  }
  console.log(`\n${v.length} violations`);
}

module.exports = { check, checkAll, LINE_MAX, FUNCTION_MAX };
