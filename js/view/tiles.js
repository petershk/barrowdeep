// @ts-check
// Static layer: floor chunks (8×8 tiles) baked once at art scale and drawn integer-upscaled;
// wall/pillar prisms baked per biome. Re-bake a chunk only when its explored state changes.
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

  /** A 32×16 pixel diamond in a colour, with a 1px dark outline. */
  function diamond(col, outline) {
    const key = col + (outline ? '|o' : '');
    let c = diamondCache.get(key);
    if (c) return c;
    c = mk(32, 17);
    const g = c.getContext('2d');
    g.fillStyle = col;
    for (let r = 0; r < 16; r++) {
      const hw = r < 8 ? (r + 1) * 2 : (16 - r) * 2;
      g.fillRect(16 - hw, r, hw * 2, 1);
    }
    if (outline) {
      g.fillStyle = 'rgba(0,0,0,0.25)';
      for (let r = 0; r < 16; r++) {
        const hw = r < 8 ? (r + 1) * 2 : (16 - r) * 2;
        g.fillRect(16 - hw, r, 2, 1);
        g.fillRect(16 + hw - 2, r, 2, 1);
      }
    }
    diamondCache.set(key, c);
    return c;
  }

  function floorColour(f, pal, x, y, t) {
    if (t === T.WATER) return pal.water;
    if (t === T.LAVA) return pal.lava;
    if (t === T.CHASM) return '#050505';
    if (t === T.BRIDGE) return Palette.shade(pal.wallTop, 0.8);
    if (f.road && f.road[Grid.idx(f, x, y)]) return pal.road;
    // subtle hash noise on top of the checker so large rooms don't look flat
    const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
    const base = (x + y) & 1 ? pal.floorA : pal.floorB;
    const k = 1.12 + ((h % 13) / 13) * 0.12;
    return Palette.shade(base, k);
  }

  function reset(f) {
    const nx = Math.ceil(f.w / CH), ny = Math.ceil(f.h / CH);
    state = { key: f.key + ':' + f.seed, chunks: new Map(), nx, ny, f };
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
    let any = false;
    for (let ly = 0; ly < CH; ly++) for (let lx = 0; lx < CH; lx++) {
      const x = x0 + lx, y = y0 + ly;
      if (x >= f.w || y >= f.h) continue;
      const i = Grid.idx(f, x, y);
      if (!f.explored[i]) continue;
      const t = f.tiles[i];
      if (t === T.WALL || t === T.VOID || t === T.TOWN_DOOR) continue;
      any = true;
      const sx = OX + (lx - ly) * iso.HW - 16, sy = OY + (lx + ly) * iso.HH - 8;
      g.drawImage(diamond(floorColour(f, pal, x, y, t), t !== T.WATER && t !== T.LAVA), sx, sy);
      if (f.decal && f.decal[i]) drawDecal(g, f.decal[i], sx, sy, x, y);
    }
    ent.any = any;
    ent.version = f.exploreVersion;
  }

  function drawDecal(g, kind, sx, sy, x, y) {
    const h = ((x * 31) ^ (y * 17)) >>> 0;
    if (kind === 'grave') {
      g.fillStyle = 'rgba(40,30,20,0.55)';
      g.fillRect(sx + 10 + (h % 4), sy + 5, 12, 6);
    } else if (kind === 'blood') {
      g.fillStyle = 'rgba(90,10,10,0.6)';
      for (let k = 0; k < 6; k++) g.fillRect(sx + 9 + ((h >> k) % 14), sy + 4 + ((h >> (k + 3)) % 8), 2, 1);
    }
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
  function invalidate() { if (state) state.chunks.clear(); }

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
    let pal = BD.data.biomes[biome].pal;
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
    drawPrismFaces(g, pal, H, hw, hh);
    drawPrismTop(g, pal, hw, hh);
    // a lit front edge
    g.fillStyle = 'rgba(255,255,255,0.10)';
    g.fillRect(15, 8 + hh, 1, H - 2);
    drawTownWallDetail(g, kind, H, hh);
    p = { canvas: c, ax: 16, ay: 8 + H, H };
    prismCache.set(key, p);
    return p;
  }

  /** wall faces: each column runs from the top diamond's lower edge down H px */
  function drawPrismFaces(g, pal, H, hw, hh) {
    const x0 = 16 - hw;
    for (let x = x0; x < 16 + hw; x++) {
      const yEdge = x < 16 ? 8 + (x - x0) * 0.5 : 8 + hh - (x - 16) * 0.5;
      g.fillStyle = x < 16 ? pal.wallFace : pal.wallSide;
      g.fillRect(x, Math.round(yEdge), 1, H);
      // mortar courses
      g.fillStyle = 'rgba(0,0,0,0.2)';
      for (let k = 6; k < H - 1; k += 6) g.fillRect(x, Math.round(yEdge) + k, 1, 1);
      if (((x - x0) % 8) === 0) {
        g.fillStyle = 'rgba(0,0,0,0.12)';
        g.fillRect(x, Math.round(yEdge), 1, H);
      }
    }
  }

  /** the top diamond with a dark rim */
  function drawPrismTop(g, pal, hw, hh) {
    for (let r = 0; r < hw; r++) {
      const w = (r < hh ? r + 1 : hw - r) * 2;
      const y = 8 - hh + r;
      g.fillStyle = pal.wallTop;
      g.fillRect(16 - w, y, w * 2, 1);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(16 - w, y, 1, 1);
      g.fillRect(16 + w - 1, y, 1, 1);
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

  BD.view.tiles = { drawFloor, refreshExplored, invalidate, getPrism, diamond, CH };
})(globalThis.BD);
