// @ts-check
// Floor plan validation. Throws with the seed in the message.
(function (BD) {
  'use strict';

  const { WALK } = BD.data.tiles;
  const Carve = BD.sim.gen.carve;

  function validate(p) {
    const fail = (msg) => {
      throw new Error(`floor ${p.n} seed ${p.seed}: ${msg}`);
    };
    if (!p.upPos) fail('no up stairs');
    const d = p.reachDist || Carve.reach(p, [p.upPos.x, p.upPos.y]);
    const reachable = (pos) => pos && d[Carve.idx(p, pos.x, pos.y)] >= 0;
    const fl = BD.data.floors.byN(p.n);
    if (!reachable(p.spawnPos)) fail('spawn unreachable');
    if (fl.stairsDown && !reachable(p.downPos)) fail('down stairs unreachable');
    if (!fl.stairsDown && p.downPos) fail('act-end floor has stairs down');
    if (fl.waypoint && !reachable(p.waypointPos)) fail('waypoint unreachable');
    if (fl.keeper && !p.keeperRoom) fail('no keeper room');
    if (p.keeperRoom && !Carve.roomTiles(p, p.keeperRoom).some(([x, y]) => d[Carve.idx(p, x, y)] >= 0)) fail('keeper room unreachable');
    if (fl.gate) {
      if (!p.gatePos) fail('no gate');
      if (!p.gatePos.front.every(([x, y]) => d[Carve.idx(p, x, y)] >= 0)) fail('gate front unreachable');
    }
    for (const pack of p.spawns) for (const m of pack.members) {
      if (d[Carve.idx(p, m.x, m.y)] < 0) fail(`monster ${m.def} at ${m.x},${m.y} unreachable`);
      if (!WALK[p.tiles[Carve.idx(p, m.x, m.y)]]) fail(`monster ${m.def} on unwalkable tile`);
    }
    for (const o of p.objects) {
      if (o.kind === 'lever' || o.kind === 'chest' || o.kind === 'shrine' || o.kind === 'pile' || o.kind === 'trap') {
        // objects in hidden rooms count as reachable through the lever (walkFn treats hidden walls as open)
        if (d[Carve.idx(p, o.x, o.y)] < 0) fail(`${o.kind} at ${o.x},${o.y} unreachable`);
      }
    }
    // border must be solid
    const open = (x, y) => WALK[p.tiles[Carve.idx(p, x, y)]];
    for (let x = 0; x < p.w; x++) if (open(x, 0) || open(x, p.h - 1)) fail('open border');
    for (let y = 0; y < p.h; y++) if (open(0, y) || open(p.w - 1, y)) fail('open border');
    // one entity per tile
    const seen = new Set();
    for (const pack of p.spawns) for (const m of pack.members) {
      const k = m.x + ',' + m.y;
      if (seen.has(k)) fail('two monsters on ' + k);
      seen.add(k);
    }
    return true;
  }

  BD.sim.gen.validate = validate;
})(globalThis.BD);
