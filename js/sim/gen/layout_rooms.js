// @ts-check
// Church layout: rooms + L corridors. 8–12 rooms incl. 1–2 pillared naves and small side
// chapels; corridors 3 wide (70%) or 2 wide; door gaps where corridors meet rooms.
(function (BD) {
  'use strict';

  const { T } = BD.data.tiles;
  const C = BD.sim.gen.carve;

  function tryRoom(p, rng, w, h, margin) {
    for (let a = 0; a < 80; a++) {
      const x = rng.int(2, p.w - w - 2), y = rng.int(2, p.h - h - 2);
      if (!C.rectFree(p, x, y, w, h, margin)) continue;
      C.fillRect(p, x, y, w, h, T.FLOOR);
      const r = { x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) };
      p.rooms.push(r);
      return r;
    }
    return null;
  }

  function addNavePillars(p, r) {
    // two rows of pillars, every other tile, one tile in from the long walls
    const horiz = r.w >= r.h;
    if (horiz) {
      for (let x = r.x + 2; x < r.x + r.w - 2; x += 2) { C.set(p, x, r.y + 1, T.PILLAR); C.set(p, x, r.y + r.h - 2, T.PILLAR); }
    } else {
      for (let y = r.y + 2; y < r.y + r.h - 2; y += 2) { C.set(p, r.x + 1, y, T.PILLAR); C.set(p, r.x + r.w - 2, y, T.PILLAR); }
    }
    r.nave = true;
  }

  /** Prim's MST over room centres + a few extra loop edges. */
  function connectRooms(p, rng, wideChance, extraLoops) {
    const rooms = p.rooms;
    const inTree = [0];
    const edges = [];
    while (inTree.length < rooms.length) {
      let best = null, bd = Infinity;
      for (const a of inTree) for (let b = 0; b < rooms.length; b++) {
        if (inTree.includes(b)) continue;
        const d = Math.abs(rooms[a].cx - rooms[b].cx) + Math.abs(rooms[a].cy - rooms[b].cy);
        if (d < bd) { bd = d; best = [a, b]; }
      }
      if (!best) break;
      inTree.push(best[1]); edges.push(best);
    }
    for (let k = 0; k < extraLoops; k++) {
      const a = rng.int(0, rooms.length - 1), b = rng.int(0, rooms.length - 1);
      if (a !== b) edges.push([a, b]);
    }
    for (const [a, b] of edges) {
      const ra = rooms[a], rb = rooms[b];
      const width = rng.chance(wideChance) ? 3 : 2;
      C.carveL(p, ra.cx, ra.cy, rb.cx, rb.cy, width, rng.chance(0.5));
    }
  }

  function generate(p, rng, params) {
    // set pieces first, in untouched rock
    BD.sim.gen.setpieces.place(p, rng, rng.int(1, 3), 'solid');
    const target = rng.int(params.rooms[0], params.rooms[1]);
    const naves = rng.int(params.naves[0], params.naves[1]);
    for (let i = 0; i < naves; i++) {
      const long = rng.int(params.naveW[0], params.naveW[1]) | 1; // odd widths keep pillars symmetric
      const short = rng.int(7, 9);
      const horiz = rng.chance(0.5);
      const r = tryRoom(p, rng, horiz ? long : short, horiz ? short : long, 2);
      if (r) addNavePillars(p, r);
    }
    let guard = 0;
    while (p.rooms.length < target + p.setpieces.length && guard++ < 200) {
      const chapel = rng.chance(0.3);
      const w = chapel ? rng.int(4, 5) : rng.int(params.roomW[0], params.roomW[1]);
      const h = chapel ? rng.int(4, 5) : rng.int(params.roomH[0], params.roomH[1]);
      tryRoom(p, rng, w, h, 2);
    }
    // corridors: shuffle so set pieces aren't always first
    connectRooms(p, rng, params.wideCorridor, rng.int(1, 2));
    // decor: candles and coffins along room walls
    const kinds = BD.data.decorKinds[p.biome];
    for (const r of p.rooms) {
      if (r.setpiece) continue;
      const n = rng.int(0, 2);
      for (let k = 0; k < n; k++) {
        const x = rng.chance(0.5) ? r.x : r.x + r.w - 1, y = rng.int(r.y + 1, r.y + r.h - 2);
        if (C.get(p, x, y) === T.FLOOR && !p.protect[C.idx(p, x, y)] && wallAdjacent(p, x, y)) { C.set(p, x, y, T.DECOR); p.decor[C.idx(p, x, y)] = rng.pick(kinds); }
      }
    }
  }

  function wallAdjacent(p, x, y) {
    return C.get(p, x - 1, y) === T.WALL || C.get(p, x + 1, y) === T.WALL || C.get(p, x, y - 1) === T.WALL || C.get(p, x, y + 1) === T.WALL;
  }

  BD.sim.gen.layouts = BD.sim.gen.layouts || {};
  BD.sim.gen.layouts.rooms = generate;
  BD.sim.gen.layoutHelpers = { tryRoom, connectRooms, addNavePillars, wallAdjacent };
})(globalThis.BD);
