// @ts-check
// Isometric projection. Everything is authored in "art pixels": a tile diamond is 32×16 art px
// (= TW 64 × TH 32 screen px at Z = 1). The device scale S = round(2·Z·DPR) device px per art px,
// so every zoom level gives an integer pixel scale and pixel art never shimmers (07 §1.1).
(function (BD) {
  'use strict';

  const HW = 16, HH = 8;          // half tile width / height in art px
  const WALL_H = 19;              // WH 38 / 2
  const ZOOMS = [1.0, 1.5, 2.0, 2.5];

  const view = {
    S: 3, Z: 1.5, dpr: 1, ox: 0, oy: 0, w: 0, h: 0,
  };

  function setScale(z, dpr) {
    view.Z = z; view.dpr = dpr;
    view.S = Math.max(1, Math.round(2 * z * dpr));
  }

  /** tile (x,y) centre → device px. Writes into out to avoid allocation. */
  function toScreen(x, y, out) {
    out.x = view.ox + (x - y) * HW * view.S;
    out.y = view.oy + (x + y) * HH * view.S;
    return out;
  }
  /** device px → fractional tile coords */
  function toTileF(sx, sy, out) {
    const a = (sx - view.ox) / (HW * view.S), b = (sy - view.oy) / (HH * view.S);
    out.x = (a + b) / 2; out.y = (b - a) / 2;
    return out;
  }
  function toTile(sx, sy, out) {
    toTileF(sx, sy, out);
    out.x = Math.round(out.x); out.y = Math.round(out.y);
    return out;
  }

  BD.view.iso = { HW, HH, WALL_H, ZOOMS, view, setScale, toScreen, toTileF, toTile };
})(globalThis.BD);
