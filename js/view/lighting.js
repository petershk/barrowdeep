// @ts-check
// Light buffer: one cell per tile in an offscreen w×h canvas, drawn upscaled (smoothing on)
// through the iso affine transform and composited with 'multiply' (07 §1.3).
(function (BD) {
  'use strict';

  const iso = BD.view.iso;
  const Palette = BD.view.palette;
  let buf = null, img = null, acc = null, key = '';
  /** dynamic lights pushed by the renderer/FX each frame: {x,y,radius,color,intensity,flicker} */
  const frameLights = [];
  /** the player light's warm cast (07 §1.3) */
  const WARM = [1, 0.93, 0.82];

  function ensure(f) {
    const k = f.key + ':' + f.seed + ':' + f.w + 'x' + f.h;
    if (k === key) return;
    key = k;
    buf = document.createElement('canvas');
    buf.width = f.w;
    buf.height = f.h;
    img = buf.getContext('2d').createImageData(f.w, f.h);
    acc = new Float32Array(f.w * f.h * 3);
  }

  function add(x, y, radius, color, intensity, flicker) { frameLights.push({ x, y, radius, color, intensity, flicker: flicker || 0 }); }

  /**
   * @param {any} f floor  @param {{x:number,y:number}} pp player visual pos  @param {number} R light radius
   */
  function draw(ctx, f, pp, R, timeMs) {
    ensure(f);
    const w = f.w, h = f.h;
    acc.fill(0);
    playerLight(f, pp, R);
    // coloured point lights (only onto explored tiles; full strength where visible)
    for (const L of frameLights) addPoint(f, L, timeMs);
    frameLights.length = 0;
    const d = img.data;
    for (let i = 0, n = w * h; i < n; i++) {
      d[i * 4] = Math.min(255, acc[i * 3] * 255);
      d[i * 4 + 1] = Math.min(255, acc[i * 3 + 1] * 255);
      d[i * 4 + 2] = Math.min(255, acc[i * 3 + 2] * 255);
      d[i * 4 + 3] = 255;
    }
    buf.getContext('2d').putImageData(img, 0, 0);
    const v = iso.view, S = v.S;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.imageSmoothingEnabled = true;
    // buffer pixel (i,j) covers tile (i,j): shift by half a tile so pixel centres land on tile centres
    ctx.setTransform(iso.HW * S, iso.HH * S, -iso.HW * S, iso.HH * S, v.ox, v.oy - iso.HH * S);
    ctx.drawImage(buf, 0, 0);
    ctx.restore();
    ctx.imageSmoothingEnabled = false;
  }

  /** the player's light over the whole floor: falloff in view, dim memory elsewhere */
  function playerLight(f, pp, R) {
    const w = f.w, h = f.h;
    const town = f.biome === 'town';
    const amb = town ? 0.55 : 0.0;
    // per-biome player light (biomes.js `light`): hell and the sanctum fall off harder into the dark
    const look = BD.data.lookOf(f);
    const bl = (look && look.light) || {};
    const lo = town ? 0.75 : bl.min || 0.42, peak = bl.peak || 1.25, reach = R * (bl.falloff || 1) + (bl.reach || 2.5);
    const tint = bl.tint || [1, 1, 1];
    const tr = tint[0] * WARM[0], tg = tint[1] * WARM[1], tb = tint[2] * WARM[2];
    // player light (warm), remembered tiles dim
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let v = 0;
      if (f.visible[i]) {
        const d = Math.hypot(x - pp.x, y - pp.y);
        v = Math.max(lo, peak - d / reach);
      } else if (f.explored[i]) v = town ? 0.4 : 0.16;
      v = Math.max(v, f.explored[i] ? amb : 0);
      acc[i * 3] = v * tr;
      acc[i * 3 + 1] = v * tg;
      acc[i * 3 + 2] = v * tb;
    }
  }

  function addPoint(f, L, timeMs) {
    const w = f.w, h = f.h;
    const [cr, cg, cb] = Palette.rgb(L.color);
    const fl = L.flicker
      ? 1 - L.flicker * 0.5 + L.flicker * 0.5 * Math.sin(timeMs / 90 + L.x * 3.1 + L.y * 1.7) * Math.sin(timeMs / 37 + L.x)
      : 1;
    const r = L.radius, x0 = Math.max(0, Math.floor(L.x - r)), x1 = Math.min(w - 1, Math.ceil(L.x + r));
    const y0 = Math.max(0, Math.floor(L.y - r)), y1 = Math.min(h - 1, Math.ceil(L.y + r));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * w + x;
      if (!f.explored[i]) continue;
      const d = Math.hypot(x - L.x, y - L.y);
      if (d > r) continue;
      const k = (1 - d / r) * L.intensity * fl * (f.visible[i] ? 1 : 0.35);
      acc[i * 3] += (cr / 255) * k;
      acc[i * 3 + 1] += (cg / 255) * k;
      acc[i * 3 + 2] += (cb / 255) * k;
    }
  }

  /** brightness 0..1 at a tile (for overlays that should dim with the light) */
  function at(f, x, y) {
    if (!acc || x < 0 || y < 0 || x >= f.w || y >= f.h) return 0;
    const i = (y | 0) * f.w + (x | 0);
    return Math.min(1, acc[i * 3]);
  }

  BD.view.lighting = { add, draw, at, frameLights };
})(globalThis.BD);
