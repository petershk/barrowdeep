// @ts-check
// Tile-step movement shared by the player, monsters and allies. Logical x,y becomes the
// destination at step start (reservation); `move` only carries timing for interpolation.
(function (BD) {
  'use strict';

  const Entities = BD.sim.entities;
  const Grid = BD.core.grid;
  const { dirOf } = BD.core.util;
  const Balance = BD.data.balance;

  /** Clock multiplier from statuses (chill 0.5, freeze/stun 0, enrage 1.3, haste…). */
  function clockMult(world, e) {
    return BD.sim.status ? BD.sim.status.clockMult(world, e) : 1;
  }

  /** Begin a one-tile step. Returns false if blocked. */
  function startStep(world, e, nx, ny, baseMs) {
    const f = world.floor;
    const dx = nx - e.x, dy = ny - e.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== 1) return false;
    // phasing monsters pass through any in-bounds tile except the void
    const VOID = BD.data.tiles.T.VOID;
    const passable = (x, y) => Entities.walkable(f, x, y) || (e.phase && Entities.inBounds(f, x, y) && f.tiles[Grid.idx(f, x, y)] !== VOID);
    if (!Grid.canStep(e.x, e.y, dx, dy, passable)) return false;
    if (Entities.occupant(f, nx, ny)) return false;
    const dur = baseMs * (dx && dy ? Balance.player.diagMult : 1);
    e.move = { fromX: e.x, fromY: e.y, toX: nx, toY: ny, elapsed: 0, dur };
    e.dir = dirOf(dx, dy);
    Entities.relocate(f, e, nx, ny);
    return true;
  }

  /** Fast multi-tile displacement (evade, dash, knockback, leap). Lands on (tx,ty) which must be free. */
  function displace(world, e, tx, ty, dur, kind) {
    const f = world.floor;
    // start from where the entity is drawn right now (mid-step if it was moving)
    const from = e.move ? Entities.posOf(e) : { x: e.x, y: e.y };
    e.move = { fromX: from.x, fromY: from.y, toX: tx, toY: ty, elapsed: 0, dur, kind: kind || 'dash' };
    Entities.relocate(f, e, tx, ty);
  }

  /**
   * Find the landing tile for a dash along a straight path from e toward (tx,ty):
   * may pass through actors, not walls; lands on the farthest free tile, falling back toward
   * the origin. Returns null when there is none.
   */
  function dashLanding(world, e, tx, ty, maxTiles, opts = {}) {
    const f = world.floor;
    const dx = tx - e.x, dy = ty - e.y;
    if (!dx && !dy) return null;
    const ray = Grid.rayTiles(e.x, e.y, dx, dy, maxTiles);
    const path = [];
    let px = e.x, py = e.y;
    for (const [x, y] of ray) {
      const sx = x - px, sy = y - py;
      if (!Entities.walkable(f, x, y)) break;
      if (sx && sy && !(Entities.walkable(f, px + sx, py) && Entities.walkable(f, px, py + sy))) break;
      path.push([x, y]);
      px = x;
      py = y;
      if (opts.stopAt && x === opts.stopAt.x && y === opts.stopAt.y) break;
    }
    for (let i = path.length - 1; i >= 0; i--) {
      const [x, y] = path[i];
      if (Entities.isFree(f, x, y)) return { x, y, path: path.slice(0, i + 1) };
    }
    return null;
  }

  /** Advance in-progress moves. */
  function system(world, dt) {
    const p = world.player;
    if (p && p.move) advance(world, p, dt);
    for (const e of world.floor.entities.values()) if (e.move) advance(world, e, dt);
  }
  function advance(world, e, dt) {
    const k = e.move.kind ? 1 : clockMult(world, e);
    e.move.elapsed += dt * k;
    if (e.move.elapsed >= e.move.dur) e.move = null;
  }

  BD.sim.movement = { clockMult, startStep, displace, dashLanding, system };
  BD.sim.world.addSystem('movement', system, 10);
})(globalThis.BD);
