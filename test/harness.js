// Loads the sim layers (core/, data/, sim/) into a fresh vm context, in the exact order
// index.html lists them, so the browser and the tests can never disagree about load order.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

function scriptList() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const re = /<script\s+src="([^"]+)"/g;
  const out = [];
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

function simScripts() {
  return scriptList().filter((s) => /^js\/(core|data|sim)\//.test(s));
}

/** @returns {any} a fresh BD namespace with core/data/sim loaded */
function loadBD(opts = {}) {
  const ctx = { console, Math, JSON, Object, Array, Map, Set, Number, String, Boolean, Error, TypeError,
    RangeError, Uint8Array, Int32Array, Float64Array, Float32Array, Uint16Array, Int8Array, Uint32Array,
    ArrayBuffer, isFinite, parseInt, parseFloat, Infinity, NaN, Symbol, WeakMap, Promise, RegExp };
  ctx.globalThis = ctx;
  if (opts.globals) Object.assign(ctx, opts.globals);
  vm.createContext(ctx);
  const files = simScripts().concat(opts.extra || []);
  for (const f of files) {
    const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
    vm.runInContext(code, ctx, { filename: f });
  }
  return ctx.BD;
}

module.exports = { ROOT, scriptList, simScripts, loadBD };
