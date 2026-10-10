// @ts-check
// generateFloor(spec) → FloorPlan. Pipeline (06 §9):
// layout → connectivity → features (stairs, waypoint, keeper room, gate) → populate → loot → validate
(function (BD) {
  'use strict';

  const { T } = BD.data.tiles;
  const Carve = BD.sim.gen.carve;
  const { makeRng } = BD.core.rng;

  const OPEN_ROOM_CLEARANCE = 3;  // organic layouts: open areas this far from walls become rooms
  const KEEPER_FAR = 0.6;         // the keeper room is at least this fraction of the max distance away
  const WAYPOINT_MIN_DIST = 2;    // the waypoint sits at least this many steps from the up stairs
  const WAYPOINT_FALLBACK_R = 3;  // ... or on a free tile this far out when the room has no spot
  const FREE_NEIGHBOUR_MAX_R = 6; // freeNeighbour searches rings up to (not including) this radius
  const GATE_MIN_STAIRS_DIST = 12;
  const GATE_TOP_PICKS = 5;       // the gate goes on one of the 6 farthest candidate walls
  const MAX_ATTEMPTS = 8;         // re-rolls of a layout that can't fit its features

  /** @param {{n:number, biome?:string, al?:number, seed:string|number, difficulty?:string}} spec */
  function generateFloor(spec) {
    const fl = BD.data.floors.byN(spec.n);
    const biome = BD.data.biomes[spec.biome || fl.biome];
    const s = Object.assign({ biome: biome.id, al: fl.al, difficulty: 'penitent' }, spec);
    // a layout that can't fit its features (e.g. no wall for the gate) is re-rolled from a derived seed;
    // the first attempt uses the plain seed, so every floor that generated before generates the same
    for (let k = 0; ; k++) {
      const rng = makeRng(s.seed + ':floor:' + s.n + (k ? ':retry' + k : ''));
      try {
        return build(s, biome, fl, rng);
      } catch (e) {
        if (k + 1 >= MAX_ATTEMPTS) throw e;
      }
    }
  }

  function build(s, biome, fl, rng) {
    if (biome.layout === 'sanctum') return BD.sim.gen.sanctum.generate(s, rng);
    const p = Carve.newPlan(s, biome.w, biome.h);
    BD.sim.gen.layouts[biome.layout](p, rng, biome.params || {});
    if (!p.rooms.length) p.rooms = Carve.roomsFromOpenAreas(p, OPEN_ROOM_CLEARANCE);
    features(p, rng, fl);
    if (BD.sim.gen.populate) BD.sim.gen.populate.run(p, rng, fl, s);
    BD.sim.gen.validate(p);
    return p;
  }

  function features(p, rng, fl) {
    const { up, ux, uy, dist } = placeUpStairs(p, rng);
    const roomDist = roomDistances(p, dist);
    p.keeperRoom = pickKeeperRoom(p, up, dist, roomDist);
    if (fl.stairsDown) placeDownStairs(p, up, dist, roomDist);
    if (fl.waypoint) placeWaypoint(p, up, ux, uy, dist);
    // boss gate: 2×2 on a wall adjacent to a reachable room, ≥12 tiles from the stairs
    if (fl.gate) placeGate(p, rng, dist);
    // features may have changed walkability (stairs/waypoint are walkable) — recompute
    p.reachDist = Carve.reach(p, [ux, uy]);
  }

  /** up stairs at the centre of a random ordinary room; connects the floor around them */
  function placeUpStairs(p, rng) {
    const plain = p.rooms.filter((r) => !r.setpiece);
    const up = rng.pick(plain.length ? plain : p.rooms);
    let ux = up.cx, uy = up.cy;
    if (Carve.get(p, ux, uy) !== T.FLOOR) {
      const t = Carve.roomTiles(p, up);
      [ux, uy] = t[t.length >> 1];
    }
    Carve.connectAll(p, [ux, uy]);
    // re-derive rooms that might have been walled off (organic layouts)
    const dist = Carve.reach(p, [ux, uy]);
    const reached = ([x, y]) => dist[Carve.idx(p, x, y)] >= 0;
    p.rooms = p.rooms.filter((r) => reached([r.cx, r.cy]) || Carve.roomTiles(p, r).some(reached));
    Carve.set(p, ux, uy, T.STAIRS_UP);
    p.upPos = { x: ux, y: uy };
    p.spawnPos = freeNeighbour(p, ux, uy, dist);
    p.upRoom = up;
    return { up, ux, uy, dist };
  }

  /** room distance = BFS distance of its centre (or its farthest reachable tile) */
  function roomDistances(p, dist) {
    return (r) => {
      let best = -1;
      for (const [x, y] of Carve.roomTiles(p, r)) best = Math.max(best, dist[Carve.idx(p, x, y)]);
      const c = dist[Carve.idx(p, r.cx, r.cy)];
      return c >= 0 ? c : best;
    };
  }

  /** keeper room: largest room at distance ≥ 60% of the farthest reachable tile */
  function pickKeeperRoom(p, up, dist, roomDist) {
    let maxD = 0;
    for (let i = 0; i < dist.length; i++) if (dist[i] > maxD) maxD = dist[i];
    const area = (r) => r.area || Carve.roomTiles(p, r).length;
    const far = p.rooms.filter((r) => r !== up && roomDist(r) >= KEEPER_FAR * maxD);
    const pool = far.length ? far : p.rooms.filter((r) => r !== up);
    return pool.slice().sort((a, b) => area(b) - area(a) || roomDist(b) - roomDist(a))[0];
  }

  /** down stairs: reachable room centre farthest from the up stairs (not act-end floors) */
  function placeDownStairs(p, up, dist, roomDist) {
    const cands = p.rooms.filter((r) => r !== up && r !== p.keeperRoom && !r.setpiece);
    const pool = cands.length ? cands : p.rooms.filter((r) => r !== up);
    const pick = pool.slice().sort((a, b) => roomDist(b) - roomDist(a))[0];
    const spot = centreFloor(p, pick, dist);
    Carve.set(p, spot[0], spot[1], T.STAIRS_SEALED);
    p.downPos = { x: spot[0], y: spot[1] };
  }

  /** waypoint: the open floor tile of the stairs room nearest the stairs (but not touching them) */
  function placeWaypoint(p, up, ux, uy, dist) {
    const fromStairs = (x, y) => Math.abs(x - ux) + Math.abs(y - uy);
    const tiles = Carve.roomTiles(p, up)
      .filter(([x, y]) => Carve.get(p, x, y) === T.FLOOR && fromStairs(x, y) >= WAYPOINT_MIN_DIST && openAround(p, x, y));
    const near = tiles.sort((a, b) => fromStairs(a[0], a[1]) - fromStairs(b[0], b[1]))[0]
      || freeNeighbour(p, ux, uy, dist, WAYPOINT_FALLBACK_R);
    // `near` is an [x, y] room tile or a freeNeighbour {x, y}
    const [wx, wy] = Array.isArray(near) ? near : [near.x, near.y];
    Carve.set(p, wx, wy, T.WAYPOINT);
    p.waypointPos = { x: wx, y: wy };
  }

  function openAround(p, x, y) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (Carve.get(p, x + dx, y + dy) !== T.FLOOR) return false;
    return true;
  }

  function centreFloor(p, r, dist) {
    if (Carve.get(p, r.cx, r.cy) === T.FLOOR && dist[Carve.idx(p, r.cx, r.cy)] >= 0) return [r.cx, r.cy];
    const t = Carve.roomTiles(p, r).filter(([x, y]) => dist[Carve.idx(p, x, y)] >= 0 && Carve.get(p, x, y) === T.FLOOR);
    t.sort((a, b) => Math.abs(a[0] - r.cx) + Math.abs(a[1] - r.cy) - (Math.abs(b[0] - r.cx) + Math.abs(b[1] - r.cy)));
    return t[0] || [r.cx, r.cy];
  }

  function freeNeighbour(p, x, y, dist, minR = 1) {
    for (let r = minR; r < FREE_NEIGHBOUR_MAX_R; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const nx = x + dx, ny = y + dy;
      if (Carve.get(p, nx, ny) === T.FLOOR && dist[Carve.idx(p, nx, ny)] >= 0) return { x: nx, y: ny };
    }
    return { x, y };
  }

  function placeGate(p, rng, dist) {
    const cands = [];
    for (let y = 2; y < p.h - 3; y++) for (let x = 2; x < p.w - 3; x++) {
      // block (x..x+1, y..y+1) all wall, unprotected
      let ok = true;
      for (let j = 0; j < 2 && ok; j++) {
        for (let i = 0; i < 2; i++) {
          const k = Carve.idx(p, x + i, y + j);
          const t = p.tiles[k];
          if (!(t === T.WALL || t === T.LAVA) || p.protect[k]) ok = false;
        }
      }
      if (!ok) continue;
      // the 2 tiles directly below (or right of) the block must be reachable floor (front of the gate)
      const fronts = [[[x, y + 2], [x + 1, y + 2]], [[x + 2, y], [x + 2, y + 1]]];
      for (const f of fronts) {
        if (!f.every(([fx, fy]) => Carve.get(p, fx, fy) === T.FLOOR && dist[Carve.idx(p, fx, fy)] >= 0)) continue;
        const d = dist[Carve.idx(p, f[0][0], f[0][1])];
        const fromStairs = Math.abs(f[0][0] - p.upPos.x) + Math.abs(f[0][1] - p.upPos.y);
        if (fromStairs < GATE_MIN_STAIRS_DIST) continue;
        cands.push({ x, y, front: f, d });
      }
    }
    if (!cands.length) throw new Error('no gate spot (seed ' + p.seed + ', floor ' + p.n + ')');
    cands.sort((a, b) => b.d - a.d);
    const g = cands[Math.min(cands.length - 1, rng.int(0, Math.min(GATE_TOP_PICKS, cands.length - 1)))];
    for (let j = 0; j < 2; j++) {
      for (let i = 0; i < 2; i++) {
        Carve.set(p, g.x + i, g.y + j, T.GATE);
        p.protect[Carve.idx(p, g.x + i, g.y + j)] = 1;
      }
    }
    // the gate tile that touches the front: where interaction happens
    const below = g.front[0][1] === g.y + 2;
    p.gatePos = { x: g.x, y: g.y, front: g.front, at: below ? { x: g.x, y: g.y + 1 } : { x: g.x + 1, y: g.y } };
  }

  BD.sim.gen.generateFloor = generateFloor;
  BD.sim.gen.features = features;
})(globalThis.BD);
