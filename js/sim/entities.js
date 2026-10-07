// @ts-check
// Entity creation, lookup and the one-entity-per-tile occupancy grid.
(function (BD) {
  'use strict';

  const { WALK } = BD.data.tiles;
  const { DIRS } = BD.core.util;
  const { idx } = BD.core.grid;

  const SPAWN_SEARCH_RADIUS = 4;       // a spawn on a taken tile moves at most this far

  /** @returns {any} */
  function makeEntity(id, kind, def, x, y, extra) {
    return Object.assign({
      id, kind, def, x, y, move: null, dir: 2, hp: 1, rank: 'normal', mods: [], packId: null, home: { x, y },
      statuses: [], cooldowns: {}, ai: null, statsVersion: 0, faction: kind === 'monster' ? 'monster' : 'player', dead: false,
    }, extra || {});
  }

  /** the player or a floor entity by id; null when gone */
  function get(world, id) {
    if (id == null) return null;
    if (id === world.player.id) return world.player;
    return world.floor.entities.get(id) || null;
  }

  function inBounds(f, x, y) { return x >= 0 && y >= 0 && x < f.w && y < f.h; }
  /** tile walkable (terrain + dynamic blockers like bone walls) */
  function walkable(f, x, y) { return inBounds(f, x, y) && WALK[f.tiles[idx(f, x, y)]] === 1 && !f.block[idx(f, x, y)]; }
  const occupant = (f, x, y) => (inBounds(f, x, y) ? f.occ[idx(f, x, y)] : 0);
  const isFree = (f, x, y) => walkable(f, x, y) && occupant(f, x, y) === 0;

  function occupy(f, e) { f.occ[idx(f, e.x, e.y)] = e.id; }
  function vacate(f, e) {
    const i = idx(f, e.x, e.y);
    if (f.occ[i] === e.id) f.occ[i] = 0;
  }

  /** Move an entity's logical tile immediately (reservation). */
  function relocate(f, e, x, y) {
    vacate(f, e);
    e.x = x;
    e.y = y;
    occupy(f, e);
  }

  /** Add a spawned entity to the floor on the nearest free tile to (x,y); null if none. */
  function addToFloor(world, e) {
    const f = world.floor;
    const spot = isFree(f, e.x, e.y) ? { x: e.x, y: e.y } : nearestFree(f, e.x, e.y, SPAWN_SEARCH_RADIUS);
    if (!spot) return null;
    e.x = spot.x;
    e.y = spot.y;
    f.entities.set(e.id, e);
    occupy(f, e);
    return e;
  }

  /** Nearest free walkable tile reachable by ring search (BFS over walkable tiles). */
  function nearestFree(f, x, y, maxR = 6, pred) {
    const seen = new Set([idx(f, x, y)]);
    let frontier = [[x, y]];
    for (let r = 0; r <= maxR && frontier.length; r++) {
      const next = [];
      for (const [cx, cy] of frontier) {
        if (isFree(f, cx, cy) && (!pred || pred(cx, cy))) return { x: cx, y: cy };
        for (const [dx, dy] of DIRS) {
          const nx = cx + dx, ny = cy + dy, k = idx(f, nx, ny);
          if (!inBounds(f, nx, ny) || seen.has(k)) continue;
          seen.add(k);
          if (walkable(f, nx, ny)) next.push([nx, ny]);
        }
      }
      frontier = next;
    }
    return null;
  }

  /** Visual position for interpolation (also used for float projectiles aiming). */
  function posOf(e) {
    if (!e.move) return { x: e.x, y: e.y };
    const t = Math.min(1, e.move.elapsed / e.move.dur);
    return { x: e.move.fromX + (e.move.toX - e.move.fromX) * t, y: e.move.fromY + (e.move.toY - e.move.fromY) * t };
  }

  /** Every living entity on the floor including the player. */
  function* all(world) {
    if (world.player && !world.player.dead) yield world.player;
    for (const e of world.floor.entities.values()) if (!e.dead) yield e;
  }
  function* enemiesOf(world, faction) {
    for (const e of all(world)) if (e.faction !== faction && e.hp > 0) yield e;
  }

  /** Rank traits from data (boss, fearless, steady); {} for the player and rankless entities. */
  const NO_RANK = {};
  const rankOf = (e) => (e && e.rank && BD.data.balance.monsters.ranks[e.rank]) || NO_RANK;
  const isBoss = (e) => !!rankOf(e).boss;

  /** Take an entity off the floor without killing it (escapes, despawns). No death hooks, no loot. */
  function remove(world, e) {
    const f = world.floor;
    vacate(f, e);
    f.entities.delete(e.id);
    if (f.keeperId === e.id) f.keeperId = null;
  }

  BD.sim.entities = {
    makeEntity, get, inBounds, walkable, occupant, isFree, occupy, vacate, relocate, addToFloor, nearestFree, posOf, all, enemiesOf,
    rankOf, isBoss, remove,
  };
})(globalThis.BD);
