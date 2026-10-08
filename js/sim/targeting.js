// @ts-check
// Facing, LOS, area gathering and smart aim — written once, unit-tested (06 §7.3).
(function (BD) {
  'use strict';

  const Grid = BD.core.grid;
  const Entities = BD.sim.entities;
  const { SEE } = BD.data.tiles;
  const { DIRS, within, dirOf } = BD.core.util;

  const FRONT_HALF_ANGLE = Math.PI / 3;  // "in front" = within ±60° of the facing
  const LOCK_KEEP_SLACK = 2;             // auto-aim keeps a locked target this far past the skill range
  const AIM_FRONT_RANGE = 6;             // auto-aim looks this far for an enemy in front...
  const AIM_ANY_RANGE = 3;               // ...then this far in any direction...
  const AIM_FACING_MAX = 4;              // ...else aims along the facing, at most this many tiles out

  /** a tile shots and sight pass through: on the map, see-through, no blocking object */
  function clearFn(f) {
    return (x, y) => {
      if (x < 0 || y < 0 || x >= f.w || y >= f.h) return false;
      const k = Grid.idx(f, x, y);
      return SEE[f.tiles[k]] === 1 && (!f.block[k] || !!(f.low && f.low[k]));   // low blocks don't stop sight
    };
  }
  function hasLOS(world, x0, y0, x1, y1) { return Grid.los(x0, y0, x1, y1, clearFn(world.floor)); }

  /** within ±60° of e.dir */
  function inFront(e, x, y) {
    const dx = x - e.x, dy = y - e.y;
    if (!dx && !dy) return true;
    const v = DIRS[e.dir];
    const cos = (dx * v[0] + dy * v[1]) / (Math.hypot(dx, dy) * Math.hypot(v[0], v[1]));
    return cos >= Math.cos(FRONT_HALF_ANGLE) - 1e-9;
  }

  /** "Behind" an enemy: the tile at dir+4, else the free adjacent tile farthest from its front. */
  function behind(world, e) {
    const f = world.floor;
    const b = DIRS[(e.dir + 4) % 8];
    if (Entities.isFree(f, e.x + b[0], e.y + b[1])) return { x: e.x + b[0], y: e.y + b[1] };
    let best = null, bestCos = 2;
    const v = DIRS[e.dir];
    for (const [dx, dy] of DIRS) {
      const x = e.x + dx, y = e.y + dy;
      if (!Entities.isFree(f, x, y)) continue;
      const cos = (dx * v[0] + dy * v[1]) / (Math.hypot(dx, dy) * Math.hypot(v[0], v[1]));
      if (cos < bestCos) {
        bestCos = cos;
        best = { x, y };
      }
    }
    return best;
  }

  /**
   * Gather opposing-faction entities on a list of tiles.
   * @returns {any[]}
   */
  function entitiesOnTiles(world, tiles, faction, opts) {
    const f = world.floor, out = [], seen = new Set();
    for (const [x, y] of tiles) {
      if (x < 0 || y < 0 || x >= f.w || y >= f.h) continue;
      const id = f.occ[Grid.idx(f, x, y)];
      if (!id || seen.has(id)) continue;
      const e = Entities.get(world, id);
      if (!e || e.hp <= 0 || e.dead || e.untargetable) continue;
      if (faction && e.faction === faction) continue;
      if (opts && opts.exclude && opts.exclude.has(e.id)) continue;
      seen.add(id);
      out.push(e);
    }
    return out;
  }

  /** Area tiles for an ability/zone centred at (cx,cy), aimed from (ox,oy). */
  function areaTiles(area, cx, cy, ox, oy, dir) {
    const aim = { x: cx - ox, y: cy - oy };
    if (!aim.x && !aim.y) {
      aim.x = DIRS[dir][0];
      aim.y = DIRS[dir][1];
    }
    if (area.shape === 'arc3' || area.shape === 'line' || area.shape === 'cone' || area.shape === 'ring8' || area.shape === 'all8') {
      // directional shapes originate at the caster
      if (area.shape === 'all8') return Grid.shapeOffsets('ring', 1).map(([dx, dy]) => [ox + dx, oy + dy]);
      return Grid.shapeTiles(area, ox, oy, aim, dirOf(aim.x, aim.y));
    }
    return Grid.shapeTiles(area, cx, cy, aim, dir);
  }

  /** Nearest visible enemy of `faction`'s opponents within r of (x,y), optionally "in front" of e. */
  function nearestEnemy(world, x, y, r, faction, opts) {
    const f = world.floor;
    let best = null, bd = Infinity;
    for (const e of Entities.all(world)) {
      if (e.faction === faction || e.hp <= 0 || e.untargetable) continue;
      if (faction === 'player' && !f.visible[Grid.idx(f, e.x, e.y)]) continue;
      if (!within(x, y, e.x, e.y, r)) continue;
      if (opts && opts.front && !inFront(opts.front, e.x, e.y)) continue;
      if (opts && opts.los && !hasLOS(world, x, y, e.x, e.y)) continue;
      if (opts && opts.exclude && opts.exclude.has(e.id)) continue;
      const d = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  /**
   * Smart aim fallback for gamepad/touch/skill-bar: locked target → nearest visible enemy in front
   * → facing direction (06 §7.3).
   */
  function autoAim(world, p, range) {
    const lock = p.lockId ? Entities.get(world, p.lockId) : null;
    if (lock && lock.hp > 0 && !lock.dead && within(p.x, p.y, lock.x, lock.y, range + LOCK_KEEP_SLACK)) {
      return { entityId: lock.id, x: lock.x, y: lock.y };
    }
    const e = nearestEnemy(world, p.x, p.y, Math.max(range, AIM_FRONT_RANGE), 'player', { front: p })
      || nearestEnemy(world, p.x, p.y, Math.max(range, AIM_ANY_RANGE), 'player', null);
    if (e) return { entityId: e.id, x: e.x, y: e.y };
    const d = DIRS[p.dir];
    const reach = Math.max(1, Math.min(range, AIM_FACING_MAX));
    return { x: p.x + d[0] * reach, y: p.y + d[1] * reach };
  }

  BD.sim.targeting = { clearFn, hasLOS, inFront, behind, entitiesOnTiles, areaTiles, nearestEnemy, autoAim };
})(globalThis.BD);
