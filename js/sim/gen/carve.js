// @ts-check
// Shared carving and connectivity helpers for every layout generator.
(function (BD) {
  'use strict';

  const { T, WALK } = BD.data.tiles;
  const G = BD.core.grid;

  /** @returns {any} an empty plan filled with walls */
  function newPlan(spec, w, h) {
    return {
      n: spec.n, al: spec.al, biome: spec.biome, seed: spec.seed, w, h,
      tiles: G.makeGrid(w, h, T.WALL), protect: new Uint8Array(w * h),
      rooms: [], decor: {}, markers: [], objects: [], spawns: [], hidden: [], setpieces: [],
      upPos: null, downPos: null, waypointPos: null, keeperRoom: null, gatePos: null, spawnPos: null,
    };
  }

  const idx = (p, x, y) => y * p.w + x;
  const get = (p, x, y) => (x < 0 || y < 0 || x >= p.w || y >= p.h ? T.VOID : p.tiles[y * p.w + x]);
  function set(p, x, y, t) { if (x > 0 && y > 0 && x < p.w - 1 && y < p.h - 1) p.tiles[y * p.w + x] = t; }
  function setFree(p, x, y, t) { if (x > 0 && y > 0 && x < p.w - 1 && y < p.h - 1 && !p.protect[y * p.w + x]) p.tiles[y * p.w + x] = t; }
  function fillRect(p, x, y, w, h, t) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(p, i, j, t); }
  const rectFree = (p, x, y, w, h, margin) => {
    if (x - margin < 1 || y - margin < 1 || x + w + margin > p.w - 1 || y + h + margin > p.h - 1) return false;
    for (let j = y - margin; j < y + h + margin; j++) for (let i = x - margin; i < x + w + margin; i++) {
      if (p.tiles[j * p.w + i] !== T.WALL || p.protect[j * p.w + i]) return false;
    }
    return true;
  };

  /** walkable for reachability, treating hidden walls as open (a reachable lever opens them) */
  function walkFn(p) {
    const hid = new Set(p.hidden);
    return (x, y) => x >= 0 && y >= 0 && x < p.w && y < p.h && (WALK[p.tiles[y * p.w + x]] === 1 || hid.has(y * p.w + x));
  }
  function reach(p, from) { return G.bfs(p.w, p.h, [from], walkFn(p)); }

  /** Carve an L corridor of the given width between two points (skips protected tiles). */
  function carveL(p, ax, ay, bx, by, width, horizFirst) {
    const off = -Math.floor((width - 1) / 2);
    const hseg = (y, x0, x1) => { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let k = 0; k < width; k++) setFree(p, x, y + off + k, T.FLOOR); };
    const vseg = (x, y0, y1) => { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let k = 0; k < width; k++) setFree(p, x + off + k, y, T.FLOOR); };
    if (horizFirst) { hseg(ay, ax, bx); vseg(bx, ay, by); }
    else { vseg(ax, ay, by); hseg(by, ax, bx); }
  }

  /** Label walkable regions (8-conn). Returns { labels:Int32Array, sizes:number[] } */
  function regions(p) {
    const walk = walkFn(p);
    const labels = new Int32Array(p.w * p.h).fill(-1);
    const sizes = [];
    for (let i = 0; i < p.w * p.h; i++) {
      if (labels[i] !== -1) continue;
      const x = i % p.w, y = (i / p.w) | 0;
      if (!walk(x, y)) continue;
      const d = G.bfs(p.w, p.h, [[x, y]], walk);
      const id = sizes.length; let n = 0;
      for (let k = 0; k < d.length; k++) if (d[k] >= 0) { labels[k] = id; n++; }
      sizes.push(n);
    }
    return { labels, sizes };
  }

  /**
   * Tunnel from a region to the main region using A* through rock (protected tiles and the
   * border are impassable). Carves width 2 so corridors never become 1-tile squeezes.
   */
  function tunnel(p, from, to) {
    const N = p.w * p.h;
    const g = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1);
    const heap = G.makeHeap(256);
    const s = idx(p, from[0], from[1]), goal = idx(p, to[0], to[1]);
    g[s] = 0; heap.push(s, 0);
    while (heap.size) {
      const i = heap.pop();
      if (i === goal) break;
      if (heap.lastPri > g[i] + 1e6) continue;
      const x = i % p.w, y = (i / p.w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 2 || ny < 2 || nx >= p.w - 2 || ny >= p.h - 2) continue;
        const ni = idx(p, nx, ny);
        if (p.protect[ni] && p.tiles[ni] === T.WALL) continue;
        const c = g[i] + (WALK[p.tiles[ni]] ? 1 : 3);
        if (c < g[ni]) { g[ni] = c; prev[ni] = i; heap.push(ni, c + Math.abs(nx - to[0]) + Math.abs(ny - to[1])); }
      }
    }
    if (prev[goal] === -1 && goal !== s) return false;
    let cur = goal;
    while (cur !== -1) {
      const x = cur % p.w, y = (cur / p.w) | 0;
      if (!WALK[p.tiles[cur]]) setFree(p, x, y, T.FLOOR);
      // widen to 2 where it doesn't touch protected tiles
      if (!WALK[get(p, x + 1, y)]) setFree(p, x + 1, y, T.FLOOR);
      if (!WALK[get(p, x, y + 1)]) setFree(p, x, y + 1, T.FLOOR);
      cur = prev[cur];
    }
    return true;
  }

  /** Make every walkable region reachable from `anchor`: tunnel big ones, wall off small ones. */
  function connectAll(p, anchor, minKeep = 8) {
    for (let pass = 0; pass < 30; pass++) {
      const { labels, sizes } = regions(p);
      const main = labels[idx(p, anchor[0], anchor[1])];
      if (main < 0) throw new Error('anchor not walkable (seed ' + p.seed + ')');
      let other = -1;
      for (let r = 0; r < sizes.length; r++) if (r !== main) { other = r; break; }
      if (other < 0) return;
      if (sizes[other] < minKeep) {
        for (let i = 0; i < labels.length; i++) if (labels[i] === other) p.tiles[i] = T.WALL;
        continue;
      }
      // closest pair (sampled) between the region and main
      const A = [], B = [];
      for (let i = 0; i < labels.length; i++) { if (labels[i] === other) A.push(i); else if (labels[i] === main) B.push(i); }
      let best = null, bd = Infinity;
      const stepA = Math.max(1, Math.floor(A.length / 60)), stepB = Math.max(1, Math.floor(B.length / 200));
      for (let a = 0; a < A.length; a += stepA) for (let b = 0; b < B.length; b += stepB) {
        const ax = A[a] % p.w, ay = (A[a] / p.w) | 0, bx = B[b] % p.w, by = (B[b] / p.w) | 0;
        const d = Math.abs(ax - bx) + Math.abs(ay - by);
        if (d < bd) { bd = d; best = [[ax, ay], [bx, by]]; }
      }
      if (!best || !tunnel(p, best[0], best[1])) {
        for (let i = 0; i < labels.length; i++) if (labels[i] === other && !p.protect[i]) p.tiles[i] = T.WALL;
      }
    }
  }

  /** Reachable walkable floor tiles (plain FLOOR, not protected markers) as [x,y] list. */
  function reachableFloor(p, dist) {
    const out = [];
    for (let i = 0; i < dist.length; i++) if (dist[i] >= 0 && p.tiles[i] === T.FLOOR) out.push([i % p.w, (i / p.w) | 0]);
    return out;
  }

  /** Open-area "rooms" for organic layouts: distance-transform maxima with clearance ≥ minClear. */
  function roomsFromOpenAreas(p, minClear = 3) {
    const N = p.w * p.h;
    const walk = (x, y) => x >= 0 && y >= 0 && x < p.w && y < p.h && WALK[p.tiles[y * p.w + x]] === 1;
    const sources = [];
    for (let i = 0; i < N; i++) { const x = i % p.w, y = (i / p.w) | 0; if (!walk(x, y)) sources.push([x, y]); }
    // chebyshev distance to nearest non-walkable via BFS over all tiles
    const d = new Int32Array(N).fill(-1), q = new Int32Array(N);
    let h = 0, t = 0;
    for (const [x, y] of sources) { const i = y * p.w + x; d[i] = 0; q[t++] = i; }
    while (h < t) {
      const i = q[h++], x = i % p.w, y = (i / p.w) | 0;
      for (let k = 0; k < 8; k++) {
        const nx = x + BD.core.util.DIRS[k][0], ny = y + BD.core.util.DIRS[k][1];
        if (nx < 0 || ny < 0 || nx >= p.w || ny >= p.h) continue;
        const ni = ny * p.w + nx;
        if (d[ni] === -1) { d[ni] = d[i] + 1; q[t++] = ni; }
      }
    }
    const taken = new Uint8Array(N), rooms = [];
    const cand = [];
    for (let i = 0; i < N; i++) if (d[i] >= minClear) cand.push(i);
    cand.sort((a, b) => d[b] - d[a] || a - b);
    for (const i of cand) {
      if (taken[i]) continue;
      const cx = i % p.w, cy = (i / p.w) | 0, r = d[i];
      const tiles = [];
      let x0 = cx, x1 = cx, y0 = cy, y1 = cy;
      for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
        if (!walk(x, y)) continue;
        const j = y * p.w + x;
        if (taken[j]) continue;
        taken[j] = 1; tiles.push([x, y]);
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
      if (tiles.length >= 9) rooms.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, cx, cy, area: tiles.length, tiles });
    }
    return rooms;
  }

  /** Room tiles helper (rect rooms store no tile list). */
  function roomTiles(p, r) {
    if (r.tiles) return r.tiles;
    const out = [];
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (p.tiles[y * p.w + x] === T.FLOOR) out.push([x, y]);
    return out;
  }

  BD.sim.gen = BD.sim.gen || {};
  BD.sim.gen.carve = { newPlan, idx, get, set, setFree, fillRect, rectFree, walkFn, reach, carveL, regions, tunnel, connectAll, reachableFloor, roomsFromOpenAreas, roomTiles };
})(globalThis.BD);
