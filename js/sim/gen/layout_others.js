// @ts-check
// Catacombs (BSP + loops + ossuary niches), Caves (cellular automata + water pools) and
// Demonic Halls (platform islands over lava joined by bridges, with a central hub) — 04 §1.
(function (BD) {
  'use strict';

  const { T } = BD.data.tiles;
  const C = BD.sim.gen.carve;
  const LH = () => BD.sim.gen.layoutHelpers;

  // ---------------- Catacombs: BSP ----------------
  function bsp(p, rng, params) {
    BD.sim.gen.setpieces.place(p, rng, rng.int(1, 3), 'solid');
    const leaves = [];
    const split = (x, y, w, h, depth) => {
      const canH = w >= params.minLeaf * 2 + 1, canV = h >= params.minLeaf * 2 + 1;
      if ((!canH && !canV) || depth > 6 || (depth > 2 && rng.chance(0.15))) { leaves.push({ x, y, w, h }); return; }
      const horiz = canH && (!canV || (w > h ? rng.chance(0.75) : rng.chance(0.3)));
      if (horiz) {
        const s = rng.int(params.minLeaf, w - params.minLeaf);
        split(x, y, s, h, depth + 1);
        split(x + s, y, w - s, h, depth + 1);
      } else {
        const s = rng.int(params.minLeaf, h - params.minLeaf);
        split(x, y, w, s, depth + 1);
        split(x, y + s, w, h - s, depth + 1);
      }
    };
    split(1, 1, p.w - 2, p.h - 2, 0);
    for (const L of rng.shuffle(leaves)) {
      const rw = rng.int(Math.max(4, L.w - 6), L.w - 2), rh = rng.int(Math.max(4, L.h - 6), L.h - 2);
      const x = L.x + rng.int(1, L.w - rw - 1), y = L.y + rng.int(1, L.h - rh - 1);
      if (!C.rectFree(p, x, y, rw, rh, 1)) continue;
      C.fillRect(p, x, y, rw, rh, T.FLOOR);
      p.rooms.push({ x, y, w: rw, h: rh, cx: x + (rw >> 1), cy: y + (rh >> 1) });
    }
    // 2-wide halls via the room MST, plus 2–4 extra loops
    LH().connectRooms(p, rng, 0, rng.int(params.loops[0], params.loops[1]));
    // ossuary niches: 1-wide dead ends of length 2–4 off room walls, a chest 40% of the time
    const n = rng.int(params.niches[0], params.niches[1]);
    for (let k = 0, tries = 0; k < n && tries < 80; tries++) {
      const r = rng.pick(p.rooms.filter((q) => !q.setpiece));
      if (!r) break;
      const side = rng.int(0, 3), len = rng.int(2, 4);
      let x, y, dx = 0, dy = 0;
      if (side === 0) { x = rng.int(r.x + 1, r.x + r.w - 2); y = r.y - 1; dy = -1; }
      else if (side === 1) { x = rng.int(r.x + 1, r.x + r.w - 2); y = r.y + r.h; dy = 1; }
      else if (side === 2) { x = r.x - 1; y = rng.int(r.y + 1, r.y + r.h - 2); dx = -1; }
      else { x = r.x + r.w; y = rng.int(r.y + 1, r.y + r.h - 2); dx = 1; }
      let ok = true;
      for (let i = 0; i < len + 1 && ok; i++) {
        const tx = x + dx * i, ty = y + dy * i;
        if (tx < 2 || ty < 2 || tx >= p.w - 2 || ty >= p.h - 2 || C.get(p, tx, ty) !== T.WALL || p.protect[C.idx(p, tx, ty)]) ok = false;
        // keep it 1-wide: side neighbours must be rock
        if (ok && i > 0 && (C.get(p, tx + dy, ty + dx) !== T.WALL || C.get(p, tx - dy, ty - dx) !== T.WALL)) ok = false;
      }
      if (!ok) continue;
      for (let i = 0; i < len; i++) C.set(p, x + dx * i, y + dy * i, T.FLOOR);
      if (rng.chance(params.nicheChest)) p.markers.push({ ch: 'C', x: x + dx * (len - 1), y: y + dy * (len - 1), sp: 'niche' });
      k++;
    }
    decorate(p, rng, 0.35);
  }

  // ---------------- Caves: cellular automata ----------------
  function caves(p, rng, params) {
    const W = p.w, H = p.h;
    let g = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const border = x < 2 || y < 2 || x >= W - 2 || y >= H - 2;
        g[y * W + x] = border || rng.chance(params.fill) ? 1 : 0;
      }
    }
    for (let it = 0; it < params.iters; it++) {
      const n = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) { n[y * W + x] = 1; continue; }
        let c = 0, c2 = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && g[(y + dy) * W + x + dx]) c++;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const yy = y + dy, xx = x + dx;
            if (yy < 0 || xx < 0 || yy >= H || xx >= W || g[yy * W + xx]) c2++;
          }
        }
        n[y * W + x] = c >= 5 || (it < 2 && c2 <= 1) ? 1 : 0;
      }
      g = n;
    }
    for (let i = 0; i < W * H; i++) p.tiles[i] = g[i] ? T.WALL : T.FLOOR;
    // keep the largest region; connect others > 40 tiles with 2-wide tunnels (connectAll does the rest)
    const { labels, sizes } = C.regions(p);
    let main = 0; for (let r = 1; r < sizes.length; r++) if (sizes[r] > sizes[main]) main = r;
    for (let i = 0; i < labels.length; i++) if (labels[i] >= 0 && labels[i] !== main && sizes[labels[i]] <= 40) p.tiles[i] = T.WALL;
    const anchor = (() => {
      for (let i = 0; i < labels.length; i++) if (labels[i] === main) return [i % W, (i / W) | 0];
      return [W >> 1, H >> 1];
    })();
    C.connectAll(p, anchor, 41);
    BD.sim.gen.setpieces.place(p, rng, rng.int(1, 3), 'overlay');
    // underground water pools
    const pools = rng.int(params.pools[0], params.pools[1]);
    for (let k = 0; k < pools; k++) {
      const cx = rng.int(6, W - 7), cy = rng.int(6, H - 7), r = rng.int(1, 2);
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r + 1) continue;
        const i = C.idx(p, cx + dx, cy + dy);
        if (p.tiles[i] === T.FLOOR && !p.protect[i]) p.tiles[i] = T.WATER;
      }
    }
    p.rooms = C.roomsFromOpenAreas(p, 3).concat(p.rooms.filter((r) => r.setpiece));
    decorate(p, rng, 0.25);
  }

  // ---------------- Demonic Halls: islands over lava ----------------
  function islands(p, rng, params) {
    C.fillRect(p, 1, 1, p.w - 2, p.h - 2, T.LAVA);
    const hub = params.hub, hx = (p.w >> 1) - (hub >> 1), hy = (p.h >> 1) - (hub >> 1);
    C.fillRect(p, hx, hy, hub, hub, T.FLOOR);
    p.rooms.push({ x: hx, y: hy, w: hub, h: hub, cx: hx + (hub >> 1), cy: hy + (hub >> 1), hub: true });
    const pillars = [[hx + 2, hy + 2], [hx + hub - 3, hy + 2], [hx + 2, hy + hub - 3], [hx + hub - 3, hy + hub - 3]];
    for (const [px, py] of pillars) C.set(p, px, py, T.PILLAR);
    const n = rng.int(params.platforms[0], params.platforms[1]);
    for (let k = 0, tries = 0; k < n && tries < 200; tries++) {
      const w = rng.int(6, 10), h = rng.int(6, 10), x = rng.int(3, p.w - w - 3), y = rng.int(3, p.h - h - 3);
      let clear = true;
      for (const r of p.rooms) if (x < r.x + r.w + 3 && x + w + 3 > r.x && y < r.y + r.h + 3 && y + h + 3 > r.y) { clear = false; break; }
      if (!clear) continue;
      const round = rng.chance(0.4);
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
        const nx = (xx - x - (w - 1) / 2) / (w / 2), ny = (yy - y - (h - 1) / 2) / (h / 2);
        if (!round || nx * nx + ny * ny <= 1.05) C.set(p, xx, yy, T.FLOOR);
      }
      p.rooms.push({ x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) });
      k++;
    }
    // bridges: MST over platform centres, 2–3 wide, carved as BRIDGE over lava
    const R = p.rooms;
    const inTree = [0], edges = [];
    while (inTree.length < R.length) {
      let best = null, bd = Infinity;
      for (const a of inTree) {
        for (let b = 0; b < R.length; b++) {
          if (inTree.includes(b)) continue;
          const d = Math.abs(R[a].cx - R[b].cx) + Math.abs(R[a].cy - R[b].cy);
          if (d < bd) { bd = d; best = [a, b]; }
        }
      }
      if (!best) break;
      inTree.push(best[1]); edges.push(best);
    }
    if (R.length > 3) edges.push([rng.int(1, R.length - 1), rng.int(1, R.length - 1)]);
    for (const [a, b] of edges) {
      if (a === b) continue;
      const wdt = rng.chance(0.5) ? 3 : 2, ra = R[a], rb = R[b];
      bridge(p, ra.cx, ra.cy, rb.cx, rb.cy, wdt, rng.chance(0.5));
    }
    BD.sim.gen.setpieces.place(p, rng, rng.int(1, 2), 'overlay');
    // braziers on platform edges
    decorate(p, rng, 0.3);
  }
  function bridge(p, ax, ay, bx, by, width, horizFirst) {
    const off = -Math.floor((width - 1) / 2);
    const put = (x, y) => { const t = C.get(p, x, y); if (t === T.LAVA || t === T.WALL) C.setFree(p, x, y, T.BRIDGE); };
    const hseg = (y, x0, x1) => {
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
        for (let k = 0; k < width; k++) put(x, y + off + k);
      }
    };
    const vseg = (x, y0, y1) => {
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
        for (let k = 0; k < width; k++) put(x + off + k, y);
      }
    };
    if (horizFirst) { hseg(ay, ax, bx); vseg(bx, ay, by); } else { vseg(ax, ay, by); hseg(by, ax, bx); }
  }

  /** biome decor along room edges */
  function decorate(p, rng, chance) {
    const kinds = BD.data.decorKinds[p.biome];
    for (const r of p.rooms) {
      if (r.setpiece || !rng.chance(chance * 2)) continue;
      const tiles = C.roomTiles(p, r)
        .filter(([x, y]) => C.get(p, x, y) === T.FLOOR && !p.protect[C.idx(p, x, y)] && LH().wallAdjacent(p, x, y));
      for (let k = 0; k < Math.min(2, tiles.length); k++) {
        const [x, y] = rng.pick(tiles);
        if (C.get(p, x, y) !== T.FLOOR) continue;
        C.set(p, x, y, T.DECOR); p.decor[C.idx(p, x, y)] = rng.pick(kinds);
      }
    }
  }

  BD.sim.gen.layouts.bsp = bsp;
  BD.sim.gen.layouts.caves = caves;
  BD.sim.gen.layouts.islands = islands;
})(globalThis.BD);
