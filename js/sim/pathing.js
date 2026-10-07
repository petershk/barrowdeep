// @ts-check
// Flow fields: one Dijkstra map from the player's tile (radius 30), recomputed when the player
// changes tile; chasers step downhill. Ranged monsters use a second field toward tiles with LOS at
// their preferred range. Moving reserves the destination (one entity per tile, always).
(function (BD) {
  'use strict';

  const G = BD.core.grid;
  const E = BD.sim.entities;
  const { DIRS } = BD.core.util;
  const B = BD.data.balance;

  function walkFn(f) { return (x, y) => E.walkable(f, x, y); }

  /** player-centred field, cached per player tile */
  function chaseField(world) {
    const f = world.floor, p = world.player;
    const key = p.y * f.w + p.x;
    if (f.flow && f.flowFrom === key && f.flowVer === f.blockVer) return f.flow;
    f.flow = G.flowField(f.w, f.h, [[p.x, p.y]], walkFn(f), B.monsters.flowRadius * 10, f.flow);
    f.flowFrom = key; f.flowVer = f.blockVer;
    f.losField = null;
    return f.flow;
  }
  /** Field toward tiles that see the player within [min,max] range (for ranged monsters) */
  function losField(world, min, max) {
    const f = world.floor, p = world.player;
    const key = (p.y * f.w + p.x) + ':' + min + ':' + max + ':' + (f.blockVer || 0);
    f.losFields = f.losFields || {};
    // cached fields are only valid for one player tile + blocker version
    const fieldsKey = (p.y * f.w + p.x) + ':' + (f.blockVer || 0);
    if (f.losFieldKey !== fieldsKey) { f.losFields = {}; f.losFieldKey = fieldsKey; }
    if (f.losFields[key]) return f.losFields[key];
    const src = [];
    const clear = BD.sim.targeting.clearFn(f);
    const R = Math.ceil(max);
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 > (max + 0.5) * (max + 0.5) || d2 < min * min) continue;
      const x = p.x + dx, y = p.y + dy;
      if (!E.walkable(f, x, y)) continue;
      if (!G.los(x, y, p.x, p.y, clear)) continue;
      src.push([x, y]);
    }
    const field = G.flowField(f.w, f.h, src, walkFn(f), B.monsters.flowRadius * 10, null);
    f.losFields[key] = field;
    return field;
  }

  /**
   * Best neighbour by a field (downhill = toward sources). away=true walks uphill (fleeing).
   * Prefers free tiles; returns null when no improving free step exists.
   */
  function stepOnField(world, e, field, away) {
    const f = world.floor;
    const here = field[e.y * f.w + e.x];
    let best = null, bestV = here < 0 ? (away ? -1 : Infinity) : here;
    for (let k = 0; k < 8; k++) {
      const dx = DIRS[k][0], dy = DIRS[k][1];
      const nx = e.x + dx, ny = e.y + dy;
      if (!E.inBounds(f, nx, ny)) continue;
      const v = field[ny * f.w + nx];
      if (v < 0) continue;
      if (!E.isFree(f, nx, ny)) continue;
      if (!G.canStep(e.x, e.y, dx, dy, (x, y) => E.walkable(f, x, y))) continue;
      if (away ? v > bestV : v < bestV) { bestV = v; best = [nx, ny]; }
    }
    return best;
  }

  /** Greedy step for phasing monsters (through walls): straight toward the target. */
  function phaseStep(world, e, tx, ty) {
    const f = world.floor;
    const dx = Math.sign(tx - e.x), dy = Math.sign(ty - e.y);
    const opts = [[dx, dy], [dx, 0], [0, dy]];
    for (const [sx, sy] of opts) {
      if (!sx && !sy) continue;
      const nx = e.x + sx, ny = e.y + sy;
      if (!E.inBounds(f, nx, ny) || nx === 0 || ny === 0 || nx === f.w - 1 || ny === f.h - 1) continue;
      if (E.occupant(f, nx, ny)) continue;
      return [nx, ny];
    }
    return null;
  }

  /** Path for allies/burrowers (A*, budget = map area). */
  function path(world, sx, sy, gx, gy) {
    const f = world.floor;
    const passable = (x, y) => E.walkable(f, x, y) && (!E.occupant(f, x, y) || (x === gx && y === gy));
    return G.astar(f.w, f.h, sx, sy, gx, gy, passable, { allowGoalBlocked: true, partial: true });
  }

  BD.sim.pathing = { chaseField, losField, stepOnField, phaseStep, path };
})(globalThis.BD);
