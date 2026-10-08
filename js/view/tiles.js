// @ts-check
// Static layer: floor chunks (8×8 tiles) baked once at art scale and drawn integer-upscaled;
// wall/pillar prisms baked per biome. Re-bake a chunk only when its explored state changes.
// Values (ART_DIRECTION.md "World and characters"): the floor is the darkest band with a quiet checker,
// hash-seeded specks and cracks; wall faces read lighter than the floor with per-biome masonry; the wall
// cap is darker with a lit near rim. Lava is a dark crust whose veins glow (drawLava, every frame).
(function (BD) {
  'use strict';

  const { T } = BD.data.tiles;
  const iso = BD.view.iso;
  const Palette = BD.view.palette;
  const Grid = BD.core.grid;
  const CH = 8;                       // tiles per chunk side
  const CW = CH * 2 * iso.HW, CHH = CH * 2 * iso.HH + 2;
  const OX = CH * iso.HW, OY = iso.HH;

  let state = null;                   // { key, chunks: Map, dirty:Set, nx, ny }
  const diamondCache = new Map();

  function mk(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  /** integer hash of a tile (and a salt) → 32-bit unsigned */
  function hash(x, y, s) {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s || 0, 1274126177)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1103515245);
    return (h ^ (h >>> 16)) >>> 0;
  }
  /** blend two '#rrggbb' colours */
  function mix(a, b, t) {
    const ca = Palette.rgb(a), cb = Palette.rgb(b);
    const f = (i) => Math.round(ca[i] + (cb[i] - ca[i]) * t);
    return '#' + ((1 << 24) | (f(0) << 16) | (f(1) << 8) | f(2)).toString(16).slice(1);
  }
  const rowHalf = (r) => (r < 8 ? (r + 1) * 2 : (16 - r) * 2);
  /** inside the diamond, with a margin (0..1, smaller = further from the edge) */
  const inside = (px, py, m) => Math.abs(px - 15.5) / 16 + Math.abs(py - 7.5) / 8 < m;

  /** A 32×16 pixel diamond in a colour, with a 1px dark outline. */
  function diamond(col, outline) {
    const key = col + (outline ? '|o' : '');
    let c = diamondCache.get(key);
    if (c) return c;
    c = mk(32, 17);
    const g = c.getContext('2d');
    g.fillStyle = col;
    for (let r = 0; r < 16; r++) {
      const hw = rowHalf(r);
      g.fillRect(16 - hw, r, hw * 2, 1);
    }
    if (outline) {
      g.fillStyle = 'rgba(0,0,0,0.25)';
      for (let r = 0; r < 16; r++) {
        const hw = rowHalf(r);
        g.fillRect(16 - hw, r, 2, 1);
        g.fillRect(16 + hw - 2, r, 2, 1);
      }
    }
    diamondCache.set(key, c);
    return c;
  }

  /** the floor checker, flattened to ≤4% between A and B (the biome's own A/B differ ~10%) */
  function floorBase(pal, x, y) {
    return (x + y) & 1 ? mix(pal.floorA, pal.floorB, 0.3) : mix(pal.floorA, pal.floorB, 0.7);
  }

  function floorColour(f, pal, x, y, t) {
    if (t === T.WATER) return pal.water;
    if (t === T.LAVA) return lavaCrust();
    if (t === T.CHASM) return '#050505';
    if (t === T.BRIDGE) return Palette.shade(pal.wallTop, 0.8);
    if (f.road && f.road[Grid.idx(f, x, y)]) return Palette.shade(pal.road, 0.97 + (hash(x, y, 3) % 5) * 0.015);
    // a quiet per-tile value shift (k 0.97–1.05, quantised so the diamond cache stays small)
    const k = 0.97 + (hash(x, y, 1) % 5) * 0.02;
    return Palette.shade(floorBase(pal, x, y), k);
  }

  function reset(f) {
    const nx = Math.ceil(f.w / CH), ny = Math.ceil(f.h / CH);
    state = { key: f.key + ':' + f.seed, chunks: new Map(), lavaLayers: new Map(), lava: false, nx, ny, f };
  }

  function bakeChunk(f, cx, cy) {
    const pal = BD.data.biomes[f.biome].pal;
    let ent = state.chunks.get(cy * state.nx + cx);
    if (!ent) {
      ent = { canvas: mk(CW, CHH) };
      state.chunks.set(cy * state.nx + cx, ent);
    }
    const g = ent.canvas.getContext('2d');
    g.clearRect(0, 0, CW, CHH);
    const x0 = cx * CH, y0 = cy * CH;
    let any = false, lava = false;
    for (let ly = 0; ly < CH; ly++) for (let lx = 0; lx < CH; lx++) {
      const x = x0 + lx, y = y0 + ly;
      if (x >= f.w || y >= f.h) continue;
      const i = Grid.idx(f, x, y);
      if (!f.explored[i]) continue;
      const t = f.tiles[i];
      if (t === T.WALL || t === T.VOID || t === T.TOWN_DOOR) continue;
      any = true;
      const sx = OX + (lx - ly) * iso.HW - 16, sy = OY + (lx + ly) * iso.HH - 8;
      const col = floorColour(f, pal, x, y, t);
      g.drawImage(diamond(col, t !== T.WATER && t !== T.LAVA), sx, sy);
      if (t === T.LAVA) lava = true;
      else if (t === T.WATER) drawRipples(g, col, sx, sy, x, y);
      else if (t !== T.CHASM) drawFloorDetail(g, f.biome, col, sx, sy, x, y);
      if (f.decal && f.decal[i]) drawDecal(g, f.decal[i], sx, sy, x, y, pal);
    }
    if (lava) bakeLava(ent, f, cx, cy);
    state.lava = state.lava || lava;
    ent.any = any;
    ent.version = f.exploreVersion;
  }

  /** hash-seeded specks, pebbles, grass blades and the odd crack */
  function drawFloorDetail(g, biome, col, sx, sy, x, y) {
    const h = hash(x, y, 7), h2 = hash(x, y, 11);
    const dark = Palette.shade(col, 0.8), light = Palette.shade(col, 1.12);
    const grass = biome === 'town';
    const n = grass ? 3 + (h % 4) : h % 4;
    const w = grass || biome === 'caves' ? 1 : 2;
    for (let k = 0; k < n; k++) {
      const px = 4 + ((h2 >>> (k * 4)) % 24), py = 2 + ((h >>> (6 + k * 3)) % 13);
      if (!inside(px, py, 0.8)) continue;
      const lit = ((h >>> (k + 20)) & 1) === 1;
      g.fillStyle = lit ? light : dark;
      g.fillRect(sx + px, sy + py, w, grass && lit ? 2 : 1);
    }
    if ((h >>> 24) % (biome === 'hell' ? 4 : 7) === 0) drawCrack(g, Palette.shade(col, 0.7), sx, sy, h2);
  }

  /** a 3–6 px hairline crack wandering along the iso axes */
  function drawCrack(g, col, sx, sy, h) {
    let px = 9 + (h % 14), py = 5 + ((h >>> 5) % 6);
    const dir = (h >>> 9) & 1 ? 1 : -1, len = 3 + ((h >>> 11) % 4);
    g.fillStyle = col;
    for (let s = 0; s < len; s++) {
      if (!inside(px, py, 0.82)) break;
      g.fillRect(sx + px, sy + py, 1, 1);
      px += dir * (1 + ((h >>> (13 + s)) & 1));
      if ((h >>> (17 + s)) & 1) py += 1;
    }
  }

  function drawRipples(g, col, sx, sy, x, y) {
    const h = hash(x, y, 5);
    g.fillStyle = Palette.shade(col, 1.35);
    const px = 8 + (h % 12), py = 5 + ((h >>> 4) % 5);
    g.fillRect(sx + px, sy + py, 3, 1);
    if (h & 0x400) g.fillRect(sx + px + 5, sy + py + 2, 2, 1);
  }

  // ---------- lava: a dark crust with glowing veins ----------
  // The veins are ridges of a world-space value noise, so they run across tile edges. The crust (with the
  // veins' cooled colour) is baked into the floor chunk; two additive glow layers per chunk (every vein, and
  // the hot pockets) are drawn each frame on the ambient beat, under the light multiply, so lava still reads
  // as emissive near the hero but never outshines actors or the hostile telegraph colour.
  const LAVA = Palette.SCHOOL.lava;
  const CRUST = mix(LAVA.edge, '#1a0604', 0.55);
  function lavaCrust() { return CRUST; }
  /** smooth value noise in 0..1 on a lattice of 1 */
  function vnoise(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hash(xi, yi, s) & 1023, b = hash(xi + 1, yi, s) & 1023;
    const c = hash(xi, yi + 1, s) & 1023, d = hash(xi + 1, yi + 1, s) & 1023;
    const top = a + (b - a) * u, bot = c + (d - c) * u;
    return (top + (bot - top) * v) / 1023;
  }
  /** the tile (chunk-local) under chunk pixel (px, py), with the pixel's offset from its centre in tile units */
  function pixelTile(px, py, out) {
    const a = (px + 0.5 - OX) / iso.HW, b = (py + 0.5 - OY) / iso.HH;
    out.x = Math.round((a + b) / 2);
    out.y = Math.round((b - a) / 2);
    out.dx = a - (out.x - out.y);
    out.dy = b - (out.x + out.y);
    out.edge = 1 - (Math.abs(out.dx) + Math.abs(out.dy));
    return out;
  }
  /** does the lava at (x, y) border solid ground across the edge this pixel is near? (cooled, darker rim) */
  function lavaShore(f, x, y, dx, dy) {
    let nx = x, ny = y;
    if (dx >= 0 && dy >= 0) nx++;
    else if (dx < 0 && dy >= 0) ny++;
    else if (dx >= 0) ny--;
    else nx--;
    if (nx < 0 || ny < 0 || nx >= f.w || ny >= f.h) return false;
    const t = f.tiles[Grid.idx(f, nx, ny)];
    return t !== T.LAVA && t !== T.VOID && t !== T.WALL;
  }
  /** a chunk's full lava layer (every lava tile, explored or not), computed once per floor: the crust with
   *  its cooled veins, and the two glow layers. Re-bakes only mask it to the explored tiles. */
  function lavaLayer(f, cx, cy) {
    const key = cy * state.nx + cx;
    if (state.lavaLayers.has(key)) return state.lavaLayers.get(key);
    const crustD = new ImageData(CW, CHH), glowA = new ImageData(CW, CHH), glowB = new ImageData(CW, CHH);
    const crust = Palette.rgb(CRUST), cool = Palette.rgb(Palette.shade(LAVA.edge, 1.2));
    const mid = Palette.rgb(LAVA.mid), core = Palette.rgb(LAVA.core), edge = Palette.rgb(LAVA.edge);
    const tp = { x: 0, y: 0, edge: 0, dx: 0, dy: 0 };
    for (let py = 0; py < CHH; py++) for (let px = 0; px < CW; px++) {
      pixelTile(px, py, tp);
      const x = cx * CH + tp.x, y = cy * CH + tp.y;
      if (x < 0 || y < 0 || x >= f.w || y >= f.h || f.tiles[Grid.idx(f, x, y)] !== T.LAVA) continue;
      const k = (py * CW + px) * 4;
      // world art position, y doubled so the noise is isotropic on the ground plane
      const X = (cx - cy) * CH * iso.HW + px, Y = ((cx + cy) * CH * iso.HH + py) * 2;
      const n = vnoise(X / 15, Y / 15, 61) * 0.7 + vnoise(X / 6, Y / 6, 62) * 0.3;
      const ridge = Math.max(0, 1 - Math.abs(n - 0.5) / 0.05), halo = Math.max(0, 1 - Math.abs(n - 0.5) / 0.13);
      const shore = tp.edge < 0.16 && lavaShore(f, x, y, tp.dx, tp.dy);
      const grain = (0.85 + (hash(X, Y, 64) % 7) * 0.05) * (shore ? 0.6 : 1);
      for (let c = 0; c < 3; c++) crustD.data[k + c] = (crust[c] + (cool[c] - crust[c]) * ridge) * grain;
      crustD.data[k + 3] = 255;
      if (shore || halo <= 0) continue;
      const hot = ridge > 0.8 ? core : mid;
      if (ridge > 0) paint(glowA.data, k, hot, 0.55 + 0.45 * ridge);
      else paint(glowA.data, k, edge, halo * 0.35);
      if (ridge > 0) paint(glowB.data, k, hot, ridge * Math.max(0, vnoise(X / 40, Y / 40, 63) * 1.6 - 0.5));
    }
    const layer = { crust: toCanvas(crustD), glowA: toCanvas(glowA), glowB: toCanvas(glowB) };
    state.lavaLayers.set(key, layer);
    return layer;
  }
  /** lay the chunk's lava layer over its explored lava tiles; mask the glow layers to them */
  function bakeLava(ent, f, cx, cy) {
    const L = lavaLayer(f, cx, cy), g = ent.canvas.getContext('2d');
    g.globalCompositeOperation = 'source-atop';
    g.drawImage(L.crust, 0, 0);
    g.globalCompositeOperation = 'source-over';
    ent.glowA = maskTo(ent.glowA, L.glowA, ent.canvas);
    ent.glowB = maskTo(ent.glowB, L.glowB, ent.canvas);
  }
  function maskTo(dst, src, mask) {
    const c = dst || mk(CW, CHH), g = c.getContext('2d');
    g.clearRect(0, 0, CW, CHH);
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(mask, 0, 0);
    g.globalCompositeOperation = 'source-over';
    return c;
  }
  function paint(d, k, col, a) {
    d[k] = col[0];
    d[k + 1] = col[1];
    d[k + 2] = col[2];
    d[k + 3] = Math.max(0, Math.min(255, a * 255));
  }
  function toCanvas(data) {
    const c = mk(data.width, data.height);
    c.getContext('2d').putImageData(data, 0, 0);
    return c;
  }
  /** per frame, under the sorted layer: the vein glow breathes on the ambient beat (1.6 s, 07 §1.5) */
  function drawLava(ctx, f, timeMs) {
    if (!state || !state.lava) return;
    const v = iso.view, S = v.S, out = { x: 0, y: 0 };
    const beat = Math.sin((timeMs / 1600) * Math.PI * 2);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const [key, ent] of state.chunks) {
      if (!ent.any || !ent.glowA) continue;
      iso.toScreen((key % state.nx) * CH, ((key / state.nx) | 0) * CH, out);
      const dx = out.x - OX * S, dy = out.y - OY * S;
      if (dx > v.w || dy > v.h || dx + CW * S < 0 || dy + CHH * S < 0) continue;
      ctx.globalAlpha = 0.6 + 0.15 * beat;
      ctx.drawImage(ent.glowA, dx, dy, CW * S, CHH * S);
      ctx.globalAlpha = 0.5 - 0.45 * beat;
      ctx.drawImage(ent.glowB, dx, dy, CW * S, CHH * S);
    }
    ctx.restore();
  }

  function drawDecal(g, kind, sx, sy, x, y, pal) {
    const h = ((x * 31) ^ (y * 17)) >>> 0;
    if (kind === 'grave') drawGrave(g, sx, sy, hash(x, y, 13), pal);
    else if (kind === 'blood') {
      g.fillStyle = 'rgba(90,10,10,0.6)';
      for (let k = 0; k < 6; k++) g.fillRect(sx + 9 + ((h >> k) % 14), sy + 4 + ((h >> (k + 3)) % 8), 2, 1);
    }
  }

  /** a grave plot: an earth mound lying along the tile's x axis, shaded by its height and lit from the
   *  top-left, with a stone or two; every fifth plot is old and grassed over */
  function drawGrave(g, sx, sy, h, pal) {
    const earth = mix(pal.floorA, '#3a2a1c', 0.6);
    if (h % 5 === 0) {
      g.fillStyle = Palette.shade(earth, 1.2);
      g.fillRect(sx + 12, sy + 7, 2, 1);
      g.fillRect(sx + 17, sy + 9, 1, 1);
      return;
    }
    const L = 0.36 + (h % 3) * 0.02, W = 0.2, ox = ((h >>> 4) % 3) - 1;
    for (let py = 1; py < 16; py++) for (let px = 2; px < 30; px++) {
      const a = (px + 0.5 - 16) / 16, b = (py + 0.5 - 8) / 8;
      const tx = (a + b) / 2, ty = (b - a) / 2;
      const q = 1 - (tx / L) ** 2 - (ty / W) ** 2;
      if (q <= 0) continue;
      // brighter toward the crest and on the far (upper) flank, darker on the near one
      const k = 0.7 + 0.5 * Math.sqrt(q) + (ty < 0 ? 0.12 : -0.06);
      g.fillStyle = Palette.shade(earth, q < 0.12 ? 0.75 : k);
      g.fillRect(sx + px + ox, sy + py, 1, 1);
    }
    g.fillStyle = Palette.shade(earth, 1.7);
    g.fillRect(sx + 13 + ((h >>> 6) % 5), sy + 6 + ((h >>> 9) % 2), 1, 1);
  }

  /** Mark chunks containing newly explored tiles. Call when f.exploreDirty. */
  function refreshExplored(f) {
    if (!state || state.key !== f.key + ':' + f.seed) reset(f);
    f.exploreVersion = (f.exploreVersion || 0) + 1;
    for (let cy = 0; cy < state.ny; cy++) for (let cx = 0; cx < state.nx; cx++) {
      const ent = state.chunks.get(cy * state.nx + cx);
      // only bake chunks near the visible region: cheap check of explored count
      let cnt = 0;
      for (let ly = 0; ly < CH; ly++) for (let lx = 0; lx < CH; lx++) {
        const x = cx * CH + lx, y = cy * CH + ly;
        if (x < f.w && y < f.h && f.explored[Grid.idx(f, x, y)]) cnt++;
      }
      if (!ent && !cnt) continue;
      if (!ent || ent.count !== cnt) {
        bakeChunk(f, cx, cy);
        state.chunks.get(cy * state.nx + cx).count = cnt;
      }
    }
  }
  /** Force a full re-bake (tile changes like bridges or revelation). */
  function invalidate() {
    if (!state) return;
    state.chunks.clear();
    state.lavaLayers.clear();
  }

  function drawFloor(ctx, f) {
    if (!state || state.key !== f.key + ':' + f.seed || f.exploreDirty) {
      refreshExplored(f);
      f.exploreDirty = false;
    }
    const v = iso.view, S = v.S;
    const out = { x: 0, y: 0 };
    for (const [k, ent] of state.chunks) {
      if (!ent.any) continue;
      const cx = k % state.nx, cy = (k / state.nx) | 0;
      iso.toScreen(cx * CH, cy * CH, out);
      const dx = out.x - OX * S, dy = out.y - OY * S;
      if (dx > v.w || dy > v.h || dx + CW * S < 0 || dy + CHH * S < 0) continue;
      ctx.drawImage(ent.canvas, dx, dy, CW * S, CHH * S);
    }
  }

  // ---------- prisms ----------
  const prismCache = new Map();
  /** Wall / pillar / stub prism. Returns { canvas, ax, ay } with (ax, ay) = the tile centre. */
  function getPrism(biome, kind) {
    const key = biome + '|' + kind;
    let p = prismCache.get(key);
    if (p) return p;
    const bdef = BD.data.biomes[biome];
    let pal = bdef.pal;
    const townWall = kind === 'building' || kind === 'door';
    let H = iso.WALL_H;
    if (kind === 'pillar') H = iso.WALL_H + 7;
    else if (kind === 'stub') H = 5;
    else if (townWall) H = iso.WALL_H + 12;
    const hw = kind === 'pillar' ? 10 : 16, hh = hw / 2;
    if (townWall) {
      pal = Object.assign({}, pal, { wallTop: kind === 'door' ? '#6a3a2a' : '#7a3e2a', wallFace: '#8a7458', wallSide: '#6a5840' });
    }
    const c = mk(32, 16 + H + 1);
    const g = c.getContext('2d');
    const style = townWall ? 'plaster' : bdef.wallStyle || 'ashlar';
    drawPrismFaces(g, pal, H, hw, hh, style, townWall);
    drawPrismTop(g, pal, hw, hh, !townWall);
    drawTownWallDetail(g, kind, H, hh);
    p = { canvas: c, ax: 16, ay: 8 + H, H };
    prismCache.set(key, p);
    return p;
  }

  /** face colours: derived from the biome's wall colours, lifted so faces read lighter than the floor */
  function faceColours(pal, townWall) {
    if (townWall) return { left: pal.wallFace, right: pal.wallSide };
    return {
      left: Palette.shade(mix(pal.wallFace, pal.wallTop, 0.5), 1.4),
      right: Palette.shade(mix(pal.wallSide, pal.wallFace, 0.5), 1.5),
    };
  }

  /** wall faces: each column runs from the top diamond's lower edge down H px, textured per biome */
  function drawPrismFaces(g, pal, H, hw, hh, style, townWall) {
    const x0 = 16 - hw, cols = faceColours(pal, townWall);
    for (let x = x0; x < 16 + hw; x++) {
      const left = x < 16;
      const yEdge = Math.round(left ? 8 + (x - x0) * 0.5 : 8 + hh - (x - 16) * 0.5);
      const u = left ? x - x0 : x - 16;
      const base = left ? cols.left : cols.right;
      for (let k = 0; k < H; k++) {
        // a touch of occlusion toward the floor, then the masonry pattern
        const m = (1.06 - 0.16 * (k / H)) * masonry(style, u, k, left ? 0 : 1);
        g.fillStyle = Palette.shade(base, m);
        g.fillRect(x, yEdge + k, 1, 1);
      }
    }
    // a lit vertical arris where the two faces meet
    g.fillStyle = 'rgba(255,240,210,0.12)';
    g.fillRect(15, 8 + hh, 1, H - 1);
  }

  /** brightness multiplier of one face pixel (u across the face, k down from its top edge) */
  function masonry(style, u, k, face) {
    if (style === 'plaster') {
      const course = k % 6 === 5 ? 0.85 : 1;
      return course * (hash(u >> 1, k >> 1, 30 + face) % 9 === 0 ? 0.94 : 1);
    }
    if (style === 'rock') {
      const strata = 0.92 + (0.12 * (hash(u >> 2, k >> 1, 20 + face) % 5)) / 4;
      const crack = hash(u, k >> 2, 23 + face) % 23 === 0 ? 0.7 : 1;
      const ledge = k % 7 === 3 && hash(u >> 1, k, 24) % 3 ? 0.88 : 1;
      return strata * crack * ledge;
    }
    const basalt = style === 'basalt';
    const courseH = basalt ? 6 : 5;
    const jointW = basalt ? 11 : 8;
    const course = Math.floor(k / courseH), r = k % courseH;
    const jag = style === 'rubble' ? hash(course, face, 5) % 5 : (course % 2) * (jointW >> 1);
    const block = Math.floor((u + jag) / jointW);
    if (r === courseH - 1) return 0.68;                          // bed joint
    if ((u + jag) % jointW === 0) return 0.72;                    // head joint
    const stone = 0.9 + (0.16 * (hash(block, course, 40 + face) % 7)) / 6;
    const lip = r === 0 ? 1.1 : 1;                                // each course catches the light on top
    const pit = hash(u, k, 50 + face) % 17 === 0 ? 0.82 : 1;
    return stone * lip * pit;
  }

  /** the top: a dark cap (roofs keep their colour), outlined rgba(0,0,0,.35) on the far edges, a lit rim on the near ones */
  function drawPrismTop(g, pal, hw, hh, darkCap) {
    const cap = darkCap ? Palette.shade(pal.wallTop, 0.55) : pal.wallTop;
    const rim = Palette.shade(pal.wallTop, darkCap ? 1.25 : 1.1);
    for (let r = 0; r < hw; r++) {
      const w = (r < hh ? r + 1 : hw - r) * 2;
      const y = 8 - hh + r;
      g.fillStyle = cap;
      g.fillRect(16 - w, y, w * 2, 1);
      if (r < hh) {
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(16 - w, y, 1, 1);
        g.fillRect(16 + w - 1, y, 1, 1);
      } else {
        g.fillStyle = rim;
        g.fillRect(16 - w, y, 2, 1);
        g.fillRect(16 + w - 2, y, 2, 1);
      }
    }
  }

  /** town buildings get timber beams and lit windows; doors a dark doorway with a warm glow */
  function drawTownWallDetail(g, kind, H, hh) {
    if (kind === 'building') {
      // timber beams and a lit window on the faces
      g.fillStyle = '#3a2a1a';
      g.fillRect(0, 8 + 5, 16, 1);
      g.fillRect(16, 8 + hh - 3, 16, 1);
      g.fillStyle = 'rgba(255,190,90,0.75)';
      g.fillRect(6, 8 + 9, 3, 4);
      g.fillRect(23, 8 + hh + 2, 3, 4);
    }
    if (kind === 'door') {
      g.fillStyle = '#1a0f08';
      g.fillRect(4, 8 + 2 + 8, 9, H - 10);
      g.fillRect(19, 8 + hh + 2, 9, H - 10);
      g.fillStyle = 'rgba(255,170,80,0.5)';
      g.fillRect(6, 8 + 12, 5, 3);
      g.fillRect(21, 8 + hh + 4, 5, 3);
    }
  }

  BD.view.tiles = { drawFloor, drawLava, refreshExplored, invalidate, getPrism, diamond, mix, hash, CH };
})(globalThis.BD);
