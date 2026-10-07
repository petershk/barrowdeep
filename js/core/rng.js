// @ts-check
// Seeded RNG: sfc32 seeded through a 32-bit string hash. Streams are independent objects.
(function (BD) {
  'use strict';

  /** @param {string} str */
  function hashSeed(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return () => {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  }

  /**
   * @typedef {{ next:()=>number, int:(lo:number,hi:number)=>number, range:(lo:number,hi:number)=>number,
   *   chance:(p:number)=>boolean, pick:<T>(arr:T[])=>T, shuffle:<T>(arr:T[])=>T[], weighted:<T>(items:T[], w:(t:T)=>number)=>T,
   *   state:()=>number[], setState:(st:number[])=>void }} Rng
   */

  /** @param {string|number} seed @returns {Rng} */
  function makeRng(seed) {
    const s = hashSeed(String(seed));
    let a = s(), b = s(), c = s(), d = s();
    const next = () => {
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
      let t = (a + b) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      d = (d + 1) | 0;
      t = (t + d) | 0;
      c = (c + t) | 0;
      return (t >>> 0) / 4294967296;
    };
    // warm up so similar seeds diverge quickly
    for (let i = 0; i < 12; i++) next();
    const rng = {
      next,
      int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
      range: (lo, hi) => lo + next() * (hi - lo),
      chance: (p) => next() < p,
      pick: (arr) => arr[Math.floor(next() * arr.length)],
      shuffle: (arr) => {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(next() * (i + 1));
          const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
        return arr;
      },
      weighted: (items, w) => {
        let total = 0;
        for (const it of items) total += Math.max(0, w(it));
        let r = next() * total;
        for (const it of items) {
          r -= Math.max(0, w(it));
          if (r < 0) return it;
        }
        return items[items.length - 1];
      },
      state: () => [a >>> 0, b >>> 0, c >>> 0, d >>> 0],
      setState: (st) => { a = st[0]; b = st[1]; c = st[2]; d = st[3]; },
    };
    return /** @type {Rng} */ (/** @type {unknown} */ (rng));
  }

  /** fractional count: floor(x) + (rng < frac(x) ? 1 : 0) */
  function dropCount(rng, x) {
    const f = Math.floor(x);
    return f + (rng.next() < x - f ? 1 : 0);
  }

  BD.core.rng = { makeRng, hashSeed, dropCount };
})(globalThis.BD);
