// @ts-check
// Small pure helpers shared by every layer.
(function (BD) {
  'use strict';

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
  const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
  const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
  /** Chebyshev distance (tiles in 8-connectivity) */
  const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
  /** "within r" per the spec's circle rule: dx²+dy² ≤ (r+0.5)² */
  const within = (ax, ay, bx, by, r) => dist2(ax, ay, bx, by) <= (r + 0.5) * (r + 0.5);

  /** 8 directions, 0 = +x, clockwise in tile space (y down). */
  const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  /** @returns {number} 0..7 direction for a vector */
  function dirOf(dx, dy) {
    if (dx === 0 && dy === 0) return 0;
    const a = Math.atan2(dy, dx);
    return ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
  }

  const warned = new Set();
  /** Logs once per key; never swallows silently. */
  function warnOnce(key, err) {
    if (warned.has(key)) return;
    warned.add(key);
    // eslint-disable-next-line no-console
    if (typeof console !== 'undefined') console.warn('[BD] ' + key, err === undefined ? '' : err);
  }

  /** FNV-1a 32-bit over a string. */
  function fnv(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  /** Stable JSON (sorted keys) for hashing; Maps become sorted entry arrays. */
  function stableStringify(v) {
    if (v === null || typeof v !== 'object') {
      if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v * 1e6) / 1e6) : 'null';
      return JSON.stringify(v === undefined ? null : v);
    }
    if (v instanceof Map) return stableStringify([...v.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
    if (ArrayBuffer.isView(v)) return '[' + Array.prototype.join.call(v, ',') + ']';
    if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
    const keys = Object.keys(v).sort();
    return '{' + keys.filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
  }
  const hashOf = (v) => fnv(stableStringify(v));

  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  /** @param {Uint8Array} bytes */
  function toB64(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
      out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
      out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=';
      out += i + 2 < bytes.length ? B64[n & 63] : '=';
    }
    return out;
  }
  function fromB64(str) {
    const clean = str.replace(/=+$/, '');
    const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
    let o = 0;
    for (let i = 0; i < clean.length; i += 4) {
      const n = (B64.indexOf(clean[i]) << 18) | (B64.indexOf(clean[i + 1]) << 12) |
        ((B64.indexOf(clean[i + 2] || 'A') & 63) << 6) | (B64.indexOf(clean[i + 3] || 'A') & 63);
      if (o < out.length) out[o++] = (n >> 16) & 255;
      if (o < out.length) out[o++] = (n >> 8) & 255;
      if (o < out.length) out[o++] = n & 255;
    }
    return out;
  }
  /** Run-length encode a 0/1 byte array → base64 of alternating run lengths (varint). */
  function rleEncode(arr) {
    const bytes = [];
    let cur = 0, run = 0;
    const push = (n) => { while (n >= 128) { bytes.push((n & 127) | 128); n >>>= 7; } bytes.push(n); };
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i] ? 1 : 0;
      if (v === cur) run++;
      else { push(run); cur = v; run = 1; }
    }
    push(run);
    return toB64(Uint8Array.from(bytes));
  }
  function rleDecode(str, len) {
    const bytes = fromB64(str);
    const out = new Uint8Array(len);
    let i = 0, pos = 0, cur = 0;
    while (i < bytes.length && pos < len) {
      let n = 0, shift = 0, b;
      do { b = bytes[i++]; n |= (b & 127) << shift; shift += 7; } while (b & 128);
      if (cur) out.fill(1, pos, Math.min(len, pos + n));
      pos += n; cur ^= 1;
    }
    return out;
  }

  /** shallow-ish deep clone for plain JSON data */
  const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

  /** Format helpers shared by describe/UI (pure). */
  const fmtNum = (v) => (Math.abs(v) >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10));
  const fmtPct = (v) => fmtNum(v) + '%';

  BD.core.util = {
    clamp, lerp, sign, dist, dist2, cheb, within, DIRS, dirOf, warnOnce, fnv, stableStringify, hashOf,
    toB64, fromB64, rleEncode, rleDecode, clone, fmtNum, fmtPct,
  };
})(globalThis.BD);
