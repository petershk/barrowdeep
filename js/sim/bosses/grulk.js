// @ts-check
// Grulk the Gravewarden, Act I boss (04 §5.1): leap stomp, bone cone sweeps, raised dead.
(function (BD) {
  'use strict';

  const Bosses = BD.sim.bosses;
  const AiMoves = () => BD.sim.ai_moves;
  const Entities = BD.sim.entities;
  const Grid = BD.core.grid;
  const { dirOf } = BD.core.util;
  const reg = Bosses.registerMove;
  const telegraph = Bosses.telegraph;

  // ---------------- Grulk (04 §5.1) ----------------
  reg('leap_stomp', {
    start(world, e, m, ctx) {
      const t = ctx.tgt;
      const cx = t.x, cy = t.y;
      // rises off-screen; marks a 3×3 block on the player's tile at lift-off
      e.untargetable = true;
      e.airborne = 340;
      Entities.vacate(world.floor, e);
      world.events.push({ type: 'boss.leap', id: e.id, x: e.x, y: e.y, tx: cx, ty: cy, ms: m.armMs });
      const z = AiMoves().strike(world, e, AiMoves().square(cx, cy, 1), m.armMs, m.mult, {
        school: 'dust', cx, cy, knockback: m.knockback, kind: 'leap_stomp', tags: ['heavy'],
      });
      return telegraph(world, e, [z], { kind: 'leap_stomp', cx, cy, exposedMs: m.exposedMs, heavy: true }, m.armMs);
    },
    resolve(world, e, act) {
      e.untargetable = false; e.airborne = 0;
      const f = world.floor;
      const spot = Entities.isFree(f, act.cx, act.cy) ? { x: act.cx, y: act.cy } : Entities.nearestFree(f, act.cx, act.cy, 3) || { x: e.x, y: e.y };
      e.x = spot.x; e.y = spot.y; e.move = null;
      Entities.occupy(f, e);
      world.events.push({ type: 'boss.land', id: e.id, x: e.x, y: e.y, heavy: true });
      return 0;
    },
  });
  reg('bone_cone', {
    start(world, e, m, ctx) {
      const t = ctx.tgt;
      const base = Math.atan2(t.y - e.y, t.x - e.x);
      const sweeps = m.twice ? [base - 0.5, base + 0.5] : [base];
      e.dir = dirOf(t.x - e.x, t.y - e.y);
      let k = 0;
      for (const ang of sweeps) {
        const aim = { x: Math.cos(ang), y: Math.sin(ang) };
        const cone = Grid.shapeTiles({ shape: 'cone', length: m.length, angle: 70 }, e.x, e.y, aim, e.dir);
        for (let row = 1; row <= m.length; row++) {
          const tiles = cone.filter(([x, y]) => Math.round(Math.hypot(x - e.x, y - e.y)) === row);
          if (!tiles.length) continue;
          // each row is marked 180 ms before it fires; rows fire in sequence
          BD.core.scheduler.after(world, (k * m.length + row - 1) * m.rowMs, 'boss.zone', {
            srcId: e.id, tiles, armMs: m.rowMs * 1.5, mult: m.mult, school: 'bone', kind: 'bone_cone',
          });
        }
        k++;
      }
      return BD.sim.ai.windup(world, e, { kind: 'bone_cone', after: 300 }, m.rowMs * m.length * sweeps.length + 200);
    },
    resolve: (world, e, act) => act.after,
  });
  reg('raise_dead', {
    start(world, e, m, ctx) {
      const cap = Math.min(m.cap || 4, BD.sim.monsters.defOf(e).summonCap || 6);
      const room = cap - Bosses.addsOf(world, e);
      if (room <= 0) return null;
      const f = world.floor;
      const tiles = [];
      for (let i = 0; i < Math.min(m.count, room) * 4 && tiles.length < Math.min(m.count, room); i++) {
        const x = e.x + world.rng.int(-4, 4), y = e.y + world.rng.int(-4, 4);
        if (Entities.isFree(f, x, y) && !tiles.some(([a, b]) => a === x && b === y)) tiles.push([x, y]);
      }
      if (!tiles.length) return null;
      world.events.push({ type: 'boss.summon', id: e.id, x: e.x, y: e.y });
      BD.sim.zones.create(world, {
        tiles, cx: e.x, cy: e.y, armMs: m.armMs, faction: 'monster', srcId: e.id, school: 'shadow', kind: 'raise_dead',
        resolve: { type: 'packet', amounts: { phys: 0.0001 }, spawn: { def: m.add } },
      });
      return BD.sim.ai.windup(world, e, { kind: 'raise_dead', after: 400 }, 700, false);
    },
    resolve: (world, e, act) => act.after,
  });
})(globalThis.BD);
