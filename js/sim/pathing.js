// @ts-check
// Flow fields: one Dijkstra map from the player's tile (radius 30), recomputed when the player
// changes tile; chasers step downhill. Ranged monsters use a second field toward tiles with LOS at
// their preferred range. Moving reserves the destination (one entity per tile, always).
(function (BD) {
  'use strict';

  const Grid = BD.core.grid;
  const Entities = BD.sim.entities;
  const { DIRS } = BD.core.util;
  const Balance = BD.data.balance;

  const FIELD_COST_PER_TILE = 10;   // flowField step cost; the search radius is in tiles x this

  function walkFn(f) { return (x, y) => Entities.walkable(f, x, y); }

  /** player-centred field, cached per player tile */
  function chaseField(world) {
    const f = world.floor, p = world.player;
    const key = Grid.idx(f, p.x, p.y);
    if (f.flow && f.flowFrom === key && f.flowVer === f.blockVer) return f.flow;
    f.flow = Grid.flowField(f.w, f.h, [[p.x, p.y]], walkFn(f), Balance.monsters.flowRadius * FIELD_COST_PER_TILE, f.flow);
    f.flowFrom = key;
    f.flowVer = f.blockVer;
    f.losField = null;
    return f.flow;
  }
  /** Field toward tiles that see the player within [min,max] range (for ranged monsters) */
  function losField(world, min, max) {
    const f = world.floor, p = world.player;
    const key = Grid.idx(f, p.x, p.y) + ':' + min + ':' + max + ':' + (f.blockVer || 0);
    f.losFields = f.losFields || {};
    // cached fields are only valid for one player tile + blocker version
    const fieldsKey = Grid.idx(f, p.x, p.y) + ':' + (f.blockVer || 0);
    if (f.losFieldKey !== fieldsKey) {
      f.losFields = {};
      f.losFieldKey = fieldsKey;
    }
    if (f.losFields[key]) return f.losFields[key];
    const src = [];
    const clear = BD.sim.targeting.clearFn(f);
    const R = Math.ceil(max);
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 > (max + 0.5) * (max + 0.5) || d2 < min * min) continue;
      const x = p.x + dx, y = p.y + dy;
      if (!Entities.walkable(f, x, y)) continue;
      if (!Grid.los(x, y, p.x, p.y, clear)) continue;
      src.push([x, y]);
    }
    const field = Grid.flowField(f.w, f.h, src, walkFn(f), Balance.monsters.flowRadius * FIELD_COST_PER_TILE, null);
    f.losFields[key] = field;
    return field;
  }

  /**
   * Best neighbour by a field (downhill = toward sources). away=true walks uphill (fleeing).
   * Prefers free tiles; returns null when no improving free step exists.
   */
  function stepOnField(world, e, field, away) {
    const f = world.floor;
    const here = field[Grid.idx(f, e.x, e.y)];
    let best = null, bestV = here;
    // off-field start: any reachable neighbour improves on it
    if (here < 0) bestV = away ? -1 : Infinity;
    for (let k = 0; k < 8; k++) {
      const dx = DIRS[k][0], dy = DIRS[k][1];
      const nx = e.x + dx, ny = e.y + dy;
      if (!Entities.inBounds(f, nx, ny)) continue;
      const v = field[Grid.idx(f, nx, ny)];
      if (v < 0) continue;
      if (!Entities.isFree(f, nx, ny)) continue;
      if (!Grid.canStep(e.x, e.y, dx, dy, (x, y) => Entities.walkable(f, x, y))) continue;
      if (away ? v > bestV : v < bestV) {
        bestV = v;
        best = [nx, ny];
      }
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
      if (!Entities.inBounds(f, nx, ny) || nx === 0 || ny === 0 || nx === f.w - 1 || ny === f.h - 1) continue;
      if (Entities.occupant(f, nx, ny)) continue;
      return [nx, ny];
    }
    return null;
  }

  /** Path for allies/burrowers (A*, budget = map area). */
  function path(world, sx, sy, gx, gy) {
    const f = world.floor;
    const passable = (x, y) => Entities.walkable(f, x, y) && (!Entities.occupant(f, x, y) || (x === gx && y === gy));
    return Grid.astar(f.w, f.h, sx, sy, gx, gy, passable, { allowGoalBlocked: true, partial: true });
  }

  BD.sim.pathing = { chaseField, losField, stepOnField, phaseStep, path };
})(globalThis.BD);
