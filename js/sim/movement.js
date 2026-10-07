// @ts-check
// Tile-step movement shared by the player, monsters and allies. Logical x,y becomes the
// destination at step start (reservation); `move` only carries timing for interpolation.
(function (BD) {
  'use strict';

  const E = BD.sim.entities;
  const G = BD.core.grid;
  const { dirOf } = BD.core.util;
  const B = BD.data.balance;

  /** Clock multiplier from statuses (chill 0.5, freeze/stun 0, enrage 1.3, haste…). */
  function clockMult(world, e) {
    return BD.sim.status ? BD.sim.status.clockMult(world, e) : 1;
  }

  /** Begin a one-tile step. Returns false if blocked. */
  function startStep(world, e, nx, ny, baseMs) {
    const f = world.floor;
    const dx = nx - e.x, dy = ny - e.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== 1) return false;
    if (!G.canStep(e.x, e.y, dx, dy, (x, y) => E.walkable(f, x, y) || (e.phase && E.inBounds(f, x, y) && f.tiles[y * f.w + x] !== BD.data.tiles.T.VOID))) return false;
    if (E.occupant(f, nx, ny)) return false;
    const dur = baseMs * (dx && dy ? B.player.diagMult : 1);
    e.move = { fromX: e.x, fromY: e.y, toX: nx, toY: ny, elapsed: 0, dur };
    e.dir = dirOf(dx, dy);
    E.relocate(f, e, nx, ny);
    return true;
  }

  /** Fast multi-tile displacement (evade, dash, knockback, leap). Lands on (tx,ty) which must be free. */
  function displace(world, e, tx, ty, dur, kind) {
    const f = world.floor;
    e.move = { fromX: e.move ? E.posOf(e).x : e.x, fromY: e.move ? E.posOf(e).y : e.y, toX: tx, toY: ty, elapsed: 0, dur, kind: kind || 'dash' };
    E.relocate(f, e, tx, ty);
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
    const ray = G.rayTiles(e.x, e.y, dx, dy, maxTiles);
    const path = [];
    let px = e.x, py = e.y;
    for (const [x, y] of ray) {
      const sx = x - px, sy = y - py;
      if (!E.walkable(f, x, y)) break;
      if (sx && sy && !(E.walkable(f, px + sx, py) && E.walkable(f, px, py + sy))) break;
      path.push([x, y]);
      px = x; py = y;
      if (opts.stopAt && x === opts.stopAt.x && y === opts.stopAt.y) break;
    }
    for (let i = path.length - 1; i >= 0; i--) {
      const [x, y] = path[i];
      if (E.isFree(f, x, y)) return { x, y, path: path.slice(0, i + 1) };
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
