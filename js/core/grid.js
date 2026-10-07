// @ts-check
// Typed-array grids, neighbourhoods, area shapes, BFS / Dijkstra / A*, DDA rays.
// Grid functions are generic: tile semantics are passed in as predicates.
(function (BD) {
  'use strict';

  const { DIRS } = BD.core.util;

  /** @param {number} w @param {number} h */
  function makeGrid(w, h, fill = 0) {
    const a = new Uint8Array(w * h);
    if (fill) a.fill(fill);
    return a;
  }
  const inB = (w, h, x, y) => x >= 0 && y >= 0 && x < w && y < h;

  // Floors and generator plans store tiles in flat row-major arrays of width m.w.
  /** flat index of (x, y) in a map with width m.w */
  const idx = (m, x, y) => y * m.w + x;
  /** the [x, y] of a flat index */
  const xyOf = (m, i) => [i % m.w, (i / m.w) | 0];

  // ---------- shapes (offset lists, cached) ----------
  const shapeCache = new Map();
  /** @returns {number[][]} [dx,dy] offsets */
  function shapeOffsets(kind, r) {
    const key = kind + ':' + r;
    let out = shapeCache.get(key);
    if (out) return out;
    out = [];
    const R = Math.ceil(r);
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        let ok = false;
        if (kind === 'circle') ok = dx * dx + dy * dy <= (r + 0.5) * (r + 0.5);
        else if (kind === 'ring') ok = (dx || dy) && dx * dx + dy * dy <= (r + 0.5) * (r + 0.5);
        else if (kind === 'diamond') ok = Math.abs(dx) + Math.abs(dy) <= r;
        else if (kind === 'square') ok = Math.max(Math.abs(dx), Math.abs(dy)) <= r;
        else if (kind === 'cross') ok = (dx === 0 || dy === 0) && Math.abs(dx) + Math.abs(dy) <= Math.max(1, r);
        else if (kind === 'annulus') { const d = dx * dx + dy * dy; ok = d <= (r + 0.5) * (r + 0.5) && d > (r - 0.5) * (r - 0.5); }
        if (ok) out.push([dx, dy]);
      }
    }
    shapeCache.set(key, out);
    return out;
  }

  /**
   * Tiles of a shape around a centre. dir/aim used by arc3/cone/line.
   * @param {{shape:string, radius?:number, length?:number, angle?:number}} area
   * @param {number} cx @param {number} cy
   * @param {{x:number,y:number}|null} aimVec direction vector (tile space) for directional shapes
   * @param {number} dir 0..7 facing for arc3
   * @returns {number[][]} absolute [x,y] list (unclipped)
   */
  function shapeTiles(area, cx, cy, aimVec, dir) {
    const s = area.shape;
    if (s === 'single') return [[cx, cy]];
    if (s === 'arc3') {
      const out = [];
      for (const d of [dir + 7, dir, dir + 1]) { const v = DIRS[d % 8]; out.push([cx + v[0], cy + v[1]]); }
      return out;
    }
    if (s === 'ring8') return shapeOffsets('ring', 1).map(([dx, dy]) => [cx + dx, cy + dy]);
    if (s === 'line') return rayTiles(cx, cy, aimVec ? aimVec.x : DIRS[dir][0], aimVec ? aimVec.y : DIRS[dir][1], area.length || 1);
    if (s === 'cone') {
      const len = area.length || area.radius || 1, ang = ((area.angle || 90) * Math.PI) / 180 / 2;
      const ax = aimVec ? aimVec.x : DIRS[dir][0], ay = aimVec ? aimVec.y : DIRS[dir][1];
      const al = Math.hypot(ax, ay) || 1;
      const out = [];
      for (const [dx, dy] of shapeOffsets('circle', len)) {
        if (!dx && !dy) continue;
        const cos = (dx * ax + dy * ay) / (Math.hypot(dx, dy) * al);
        if (cos >= Math.cos(ang) - 1e-9) out.push([cx + dx, cy + dy]);
      }
      return out;
    }
    const kind = s === 'radius' ? 'circle' : s;
    return shapeOffsets(kind, area.radius || 0).map(([dx, dy]) => [cx + dx, cy + dy]);
  }

  /**
   * Tiles visited by a ray from the centre of (x0,y0) in direction (dx,dy), excluding the start,
   * up to `len` tiles. Amanatides–Woo traversal.
   */
  function rayTiles(x0, y0, dx, dy, len) {
    const out = [];
    const l = Math.hypot(dx, dy);
    if (!l) return out;
    dx /= l; dy /= l;
    let x = x0, y = y0;
    const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
    const tdx = dx ? Math.abs(1 / dx) : Infinity, tdy = dy ? Math.abs(1 / dy) : Infinity;
    let tmx = dx ? 0.5 * tdx : Infinity, tmy = dy ? 0.5 * tdy : Infinity;
    let guard = 0;
    while (out.length < len && guard++ < 1000) {
      if (Math.abs(tmx - tmy) < 1e-9) { x += stepX; y += stepY; tmx += tdx; tmy += tdy; }
      else if (tmx < tmy) { x += stepX; tmx += tdx; }
      else { y += stepY; tmy += tdy; }
      out.push([x, y]);
    }
    return out;
  }

  /**
   * Line of sight between two tiles: every tile strictly between must be transparent.
   * Diagonal corner crossings need at least one of the two orthogonal tiles transparent.
   * @param {(x:number,y:number)=>boolean} clear
   */
  function los(x0, y0, x1, y1, clear) {
    if (x0 === x1 && y0 === y1) return true;
    let x = x0, y = y0;
    const dx = x1 - x0, dy = y1 - y0;
    const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
    const tdx = dx ? Math.abs(1 / dx) : Infinity, tdy = dy ? Math.abs(1 / dy) : Infinity;
    let tmx = dx ? 0.5 * tdx : Infinity, tmy = dy ? 0.5 * tdy : Infinity;
    for (let guard = 0; guard < 400; guard++) {
      if (Math.abs(tmx - tmy) < 1e-9) {
        if (!clear(x + stepX, y) && !clear(x, y + stepY)) return false;
        x += stepX; y += stepY; tmx += tdx; tmy += tdy;
      } else if (tmx < tmy) { x += stepX; tmx += tdx; }
      else { y += stepY; tmy += tdy; }
      if (x === x1 && y === y1) return true;
      if (!clear(x, y)) return false;
    }
    return false;
  }

  /**
   * Can an entity step from (x,y) by (dx,dy)? Diagonals may not cut wall corners.
   * @param {(x:number,y:number)=>boolean} walk
   */
  function canStep(x, y, dx, dy, walk) {
    if (!walk(x + dx, y + dy)) return false;
    if (dx && dy) return walk(x + dx, y) && walk(x, y + dy);
    return true;
  }

  /**
   * Breadth-first distances (8-connected, no corner cutting) from sources.
   * Uses an index-pointer queue. Returns Int32Array of distances (-1 = unreached).
   * @param {(x:number,y:number)=>boolean} walk
   */
  function bfs(w, h, sources, walk, maxDist = 1e9) {
    const dist = new Int32Array(w * h).fill(-1);
    const q = new Int32Array(w * h);
    let head = 0, tail = 0;
    for (const [sx, sy] of sources) {
      if (!inB(w, h, sx, sy)) continue;
      const i = sy * w + sx;
      if (dist[i] === -1) { dist[i] = 0; q[tail++] = i; }
    }
    while (head < tail) {
      const i = q[head++];
      const x = i % w, y = (i / w) | 0, d = dist[i];
      if (d >= maxDist) continue;
      for (let k = 0; k < 8; k++) {
        const dx = DIRS[k][0], dy = DIRS[k][1];
        const nx = x + dx, ny = y + dy;
        if (!inB(w, h, nx, ny)) continue;
        const ni = ny * w + nx;
        if (dist[ni] !== -1) continue;
        if (!canStep(x, y, dx, dy, walk)) continue;
        dist[ni] = d + 1;
        q[tail++] = ni;
      }
    }
    return dist;
  }

  /**
   * Dijkstra flow field with orthogonal cost 10 and diagonal 14 (≈ movement time ratio).
   * Returns Int32Array cost map (-1 unreached). maxCost bounds the search.
   */
  function flowField(w, h, sources, walk, maxCost, out) {
    const cost = out && out.length === w * h ? out : new Int32Array(w * h);
    cost.fill(-1);
    const heap = makeHeap(w * h);
    for (const [sx, sy] of sources) {
      if (!inB(w, h, sx, sy)) continue;
      const i = sy * w + sx;
      cost[i] = 0; heap.push(i, 0);
    }
    while (heap.size) {
      const i = heap.pop();
      const c = cost[i];
      if (heap.lastPri > c) continue;
      if (c > maxCost) continue;
      const x = i % w, y = (i / w) | 0;
      for (let k = 0; k < 8; k++) {
        const dx = DIRS[k][0], dy = DIRS[k][1];
        const nx = x + dx, ny = y + dy;
        if (!inB(w, h, nx, ny)) continue;
        if (!canStep(x, y, dx, dy, walk)) continue;
        const ni = ny * w + nx;
        const nc = c + (dx && dy ? 14 : 10);
        if (cost[ni] === -1 || nc < cost[ni]) { cost[ni] = nc; heap.push(ni, nc); }
      }
    }
    return cost;
  }

  /** Binary min-heap of int ids keyed by numeric priority. */
  function makeHeap(cap) {
    let ids = new Int32Array(Math.max(16, cap)), pri = new Float64Array(Math.max(16, cap));
    const heap = {
      size: 0, lastPri: 0,
      push(id, p) {
        if (heap.size >= ids.length) {
          const ni = new Int32Array(ids.length * 2); ni.set(ids); ids = ni;
          const np = new Float64Array(pri.length * 2); np.set(pri); pri = np;
        }
        let i = heap.size++;
        while (i > 0) {
          const par = (i - 1) >> 1;
          if (pri[par] <= p) break;
          ids[i] = ids[par]; pri[i] = pri[par]; i = par;
        }
        ids[i] = id; pri[i] = p;
      },
      pop() {
        const top = ids[0]; heap.lastPri = pri[0];
        const n = --heap.size;
        if (n > 0) {
          const id = ids[n], p = pri[n];
          let i = 0;
          for (;;) {
            let c = 2 * i + 1;
            if (c >= n) break;
            if (c + 1 < n && pri[c + 1] < pri[c]) c++;
            if (pri[c] >= p) break;
            ids[i] = ids[c]; pri[i] = pri[c]; i = c;
          }
          ids[i] = id; pri[i] = p;
        }
        return top;
      },
    };
    return heap;
  }

  /**
   * A* (8-connected, no corner cutting, octile heuristic). Budget = expanded nodes.
   * @param {(x:number,y:number)=>boolean} walk  goal tile need not be walkable when allowGoalBlocked
   * @returns {number[][]|null} path excluding the start
   */
  function astar(w, h, sx, sy, gx, gy, walk, opts = {}) {
    const budget = opts.budget || w * h;
    const allowGoal = !!opts.allowGoalBlocked;
    const walkG = allowGoal ? (x, y) => (x === gx && y === gy) || walk(x, y) : walk;
    if (!inB(w, h, gx, gy)) return null;
    const N = w * h;
    const g = new Float64Array(N).fill(Infinity);
    const from = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const heap = makeHeap(256);
    const H = (x, y) => { const dx = Math.abs(x - gx), dy = Math.abs(y - gy); return 10 * Math.max(dx, dy) + 4 * Math.min(dx, dy); };
    const s = sy * w + sx, goal = gy * w + gx;
    g[s] = 0; heap.push(s, H(sx, sy));
    let expanded = 0, best = s, bestH = H(sx, sy);
    while (heap.size) {
      const i = heap.pop();
      if (closed[i]) continue;
      closed[i] = 1;
      if (i === goal) break;
      if (++expanded > budget) break;
      const x = i % w, y = (i / w) | 0;
      const hh = H(x, y);
      if (hh < bestH) { bestH = hh; best = i; }
      for (let k = 0; k < 8; k++) {
        const dx = DIRS[k][0], dy = DIRS[k][1];
        const nx = x + dx, ny = y + dy;
        if (!inB(w, h, nx, ny)) continue;
        if (!canStep(x, y, dx, dy, walkG)) continue;
        const ni = ny * w + nx;
        if (closed[ni]) continue;
        const ng = g[i] + (dx && dy ? 14 : 10);
        if (ng < g[ni]) { g[ni] = ng; from[ni] = i; heap.push(ni, ng + H(nx, ny)); }
      }
    }
    let end = closed[goal] ? goal : opts.partial ? best : -1;
    if (end < 0 || end === s) return end === s && end === goal ? [] : null;
    const path = [];
    while (end !== s && end >= 0) { path.push([end % w, (end / w) | 0]); end = from[end]; }
    return path.reverse();
  }

  BD.core.grid = { makeGrid, inB, idx, xyOf, shapeOffsets, shapeTiles, rayTiles, los, canStep, bfs, flowField, makeHeap, astar };
})(globalThis.BD);
