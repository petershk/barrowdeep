// ~30-line assertion helper. No framework.
'use strict';
const tests = [];
let file = '', passed = 0, failed = 0;

function setFile(f) { file = f; }
function test(name, fn) { tests.push({ name: file + ' › ' + name, fn }); }
function fail(name, e) { failed++; console.log('  ✗ ' + name + '\n      ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n      ') : e)); }

class AssertionError extends Error {}
function ok(v, msg) { if (!v) throw new AssertionError(msg || 'expected truthy'); }
function eq(a, b, msg) { if (a !== b) throw new AssertionError((msg ? msg + ': ' : '') + `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new AssertionError((msg ? msg + ': ' : '') + `expected ${b} ±${tol}, got ${a}`); }
function deepEq(a, b, msg) { const sa = JSON.stringify(a), sb = JSON.stringify(b); if (sa !== sb) throw new AssertionError((msg ? msg + ': ' : '') + `\n   expected ${sb.slice(0, 300)}\n   got      ${sa.slice(0, 300)}`); }
function throws(fn, msg) { try { fn(); } catch (e) { return; } throw new AssertionError(msg || 'expected throw'); }
function between(v, lo, hi, msg) { if (!(v >= lo && v <= hi)) throw new AssertionError((msg ? msg + ': ' : '') + `expected ${lo}..${hi}, got ${v}`); }

async function runAll() {
  for (const t of tests.splice(0)) {
    try { await t.fn(); passed++; process.stdout.write('.'); }
    catch (e) { process.stdout.write('\n'); fail(t.name, e); }
  }
}
function report() { return { passed, failed }; }

module.exports = { setFile, test, fail, ok, eq, near, deepEq, throws, between, runAll, report };
