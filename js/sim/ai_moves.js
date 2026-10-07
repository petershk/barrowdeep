// @ts-check
// Heavy moves shared by monsters, Keepers and bosses (charge lines, slams, rings, crosses).
(function (BD) {
  'use strict';

  const E = BD.sim.entities;
  const MON = BD.sim.monsters;
  const G = BD.core.grid;

  /** Charge along a pre-telegraphed line. Hitting a wall/pillar = Exposed. */
  function chargeLine(world, e, tiles, mult, exposedMs) {
    const f = world.floor;
    let last = null, hitWall = false, victim = null;
    let px = e.x, py = e.y;
    for (const [x, y] of tiles) {
      if (!E.walkable(f, x, y)) { hitWall = true; break; }
      const dx = x - px, dy = y - py;
      if (dx && dy && !(E.walkable(f, px + dx, py) && E.walkable(f, px, py + dy))) { hitWall = true; break; }
      const occ = E.occupant(f, x, y);
      if (occ && occ !== e.id) {
        const o = E.get(world, occ);
        if (o && o.faction !== e.faction) { victim = o; break; }
        break;
      }
      last = [x, y]; px = x; py = y;
    }
    if (last) {
      const n = Math.max(1, Math.max(Math.abs(last[0] - e.x), Math.abs(last[1] - e.y)));
      BD.sim.movement.displace(world, e, last[0], last[1], 40 * n, 'dash');
      world.events.push({ type: 'dash', id: e.id, fromX: e.x, fromY: e.y, x: last[0], y: last[1] });
    }
    if (victim) {
      BD.sim.damage.dealDamage(world, {
        srcId: e.id, tgtId: victim.id, amounts: MON.hitAmounts(world, e, mult), tags: ['melee', 'charge', 'heavy'],
        canCrit: false, canDodge: false, canBlock: true, mult: 1,
      });
      BD.sim.hits.knockback(world, victim, e.x, e.y, 1);
    }
    if (hitWall) {
      world.events.push({ type: 'collide', id: e.id, x: e.x, y: e.y });
      BD.sim.ai.makeExposed(world, e, exposedMs);
    }
    return hitWall ? exposedMs : 400;
  }

  /** a telegraphed area strike centred on tiles; returns the zone */
  function strike(world, e, tiles, armMs, mult, o) {
    o = o || {};
    const amounts = o.element ? { [o.element]: MON.avgDmg(world, e) * mult } : MON.hitAmounts(world, e, mult);
    if (o.element) amounts[o.element] = MON.avgDmg(world, e) * mult;
    return BD.sim.zones.create(world, {
      tiles, cx: o.cx != null ? o.cx : tiles[0][0], cy: o.cy != null ? o.cy : tiles[0][1], armMs, faction: 'monster', srcId: e.id,
      school: o.school || 'blood', heavy: mult >= 1.5, kind: o.kind || 'strike', label: o.label || null,
      resolve: {
        type: 'packet', amounts, statuses: o.statuses || [], knockback: o.knockback || 0,
        linger: o.linger || null, spawn: o.spawn || null, tags: o.tags || [],
      },
    });
  }

  const circle = (cx, cy, r) => G.shapeOffsets('circle', r).map(([dx, dy]) => [cx + dx, cy + dy]);
  const ring = (cx, cy, r) => G.shapeOffsets('ring', r).map(([dx, dy]) => [cx + dx, cy + dy]);
  const cross = (cx, cy, r) => G.shapeOffsets('cross', r || 1).map(([dx, dy]) => [cx + dx, cy + dy]);
  const square = (cx, cy, r) => G.shapeOffsets('square', r).map(([dx, dy]) => [cx + dx, cy + dy]);
  const diamond = (cx, cy, r) => G.shapeOffsets('diamond', r).map(([dx, dy]) => [cx + dx, cy + dy]);

  BD.sim.ai_moves = { chargeLine, strike, circle, ring, cross, square, diamond };
})(globalThis.BD);
