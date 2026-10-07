// @ts-check
// Bakes pixel grids into offscreen canvases (1 canvas px per art px; the renderer scales by an
// integer). Missing frames are derived procedurally from idle: 2-frame walk, attack lean,
// hurt, a 3-frame death and a corpse (07 §2.2).
(function (BD) {
  'use strict';

  const INK = '#16130f';
  const cache = new Map();
  const derived = new Map();

  // ---------- grid transforms ----------
  const W = (g) => { let m = 0; for (const r of g) if (r.length > m) m = r.length; return m; };
  function shiftRows(g, from, dx) {
    return g.map((r, i) => {
      if (i < from) return r;
      if (dx > 0) return ('.'.repeat(dx) + r).slice(0, r.length);
      return (r + '.'.repeat(-dx)).slice(-dx);
    });
  }
  function shearTop(g, upto, dx) {
    return g.map((r, i) => {
      const k = Math.round(dx * (1 - i / upto));
      if (i >= upto || !k) return r;
      return k > 0 ? ('.'.repeat(k) + r).slice(0, r.length) : (r + '.'.repeat(-k)).slice(-k);
    });
  }
  function squash(g, k) {
    const h = g.length, nh = Math.max(2, Math.round(h * k));
    const out = [];
    for (let i = 0; i < h - nh; i++) out.push('.'.repeat(W(g)));
    for (let i = 0; i < nh; i++) out.push(g[Math.min(h - 1, Math.floor((i / nh) * h))]);
    return out;
  }
  /** lying on its side: rotate 90° clockwise and squash vertically */
  function corpse(g) {
    const h = g.length, w = W(g);
    const rows = [];
    for (let x = 0; x < w; x++) { let r = ''; for (let y = h - 1; y >= 0; y--) r += g[y][x]; rows.push(r); }
    // keep only every other row to flatten, then pad on top to the original height
    const flat = rows.filter((_, i) => i % 2 === 0 || i === rows.length - 1);
    const pad = Math.max(0, h - flat.length);
    const out = [];
    for (let i = 0; i < pad; i++) out.push('.'.repeat(flat[0].length));
    return out.concat(flat);
  }

  /** @returns {{idle:string[][], walk:string[][], attack:string[][], hurt:string[][], death:string[][], corpse:string[][]}} */
  function framesOf(id, doll) {
    const dk = doll ? id + '#' + doll : id;
    let d = derived.get(dk);
    if (d) return d;
    const art = BD.view.art[id];
    if (!art) return null;
    const f = doll && BD.view.paperdoll ? { idle: [BD.view.paperdoll.compose(id, art.frames.idle[0], doll)] } : art.frames;
    const idle = f.idle[0];
    const legs = Math.floor(idle.length * 0.78);
    d = {
      idle: f.idle,
      walk: f.walk || [shiftRows(idle, legs, 1), shiftRows(idle, legs, -1)],
      attack: f.attack || [shearTop(idle, Math.floor(idle.length * 0.7), 2)],
      hurt: f.hurt || [shearTop(idle, Math.floor(idle.length * 0.8), -1)],
      death: f.death || [squash(idle, 0.85), squash(idle, 0.6), squash(idle, 0.35)],
      corpse: f.corpse || [corpse(idle)],
    };
    derived.set(dk, d);
    return d;
  }

  function hasCanvas() { return typeof document !== 'undefined'; }

  /**
   * @param {string} id art id  @param {string} frame  @param {number} i
   * @param {{pal?:object, tint?:string, dark?:number, flip?:boolean}} [o]
   */
  function get(id, frame, i, o) {
    o = o || {};
    const key = id + '|' + frame + '|' + i + '|' + (o.palKey || '') + '|' + (o.tint || '') + '|' + (o.flip ? 1 : 0) + '|' + (o.doll || '');
    let c = cache.get(key);
    if (c) return c;
    const fr = framesOf(id, o.doll);
    if (!fr || !hasCanvas()) return null;
    const list = fr[frame] || fr.idle;
    const grid = list[i % list.length];
    const art = BD.view.art[id];
    let pal = o.pal ? Object.assign({}, art.pal, o.pal) : art.pal;
    if (o.doll && BD.view.paperdoll) pal = Object.assign({}, BD.view.paperdoll.PAL, pal);
    const w = W(grid), h = grid.length;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    const img = g.createImageData(w, h);
    const P = BD.view.palette;
    const dark = frame === 'corpse' ? 0.55 : 1;
    for (let y = 0; y < h; y++) {
      const row = grid[y];
      for (let x = 0; x < w; x++) {
        const ch = row[x];
        if (ch === '.' || ch === ' ' || ch === undefined) continue;
        let col = o.tint || (ch === 'K' ? INK : pal[ch]);
        if (!col) { col = '#ff00ff'; BD.core.util.warnOnce('sprite ' + id + ' missing key ' + ch); }
        const [r, gg, b] = P.rgb(col);
        const tx = o.flip ? w - 1 - x : x;
        const k = (y * w + tx) * 4;
        img.data[k] = r * dark; img.data[k + 1] = gg * dark; img.data[k + 2] = b * dark; img.data[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    c = { canvas: cv, w, h };
    cache.set(key, c);
    return c;
  }

  /** PNG data URL for DOM use (class cards, icons). */
  function dataURL(id, scale = 3, o) {
    const s = get(id, 'idle', 0, o);
    if (!s) return '';
    const c = document.createElement('canvas');
    c.width = s.w * scale; c.height = s.h * scale;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(s.canvas, 0, 0, c.width, c.height);
    return c.toDataURL();
  }

  function clear() { cache.clear(); }

  BD.view.sprites = { INK, get, framesOf, dataURL, clear, transforms: { shiftRows, shearTop, squash, corpse } };
})(globalThis.BD);
