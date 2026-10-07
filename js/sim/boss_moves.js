// @ts-check
// Shared heavy moves (Crushing Blow), Keeper signature moves, and Act I boss moves (Grulk).
// Every move telegraphs through zones and returns its cost in ms.
(function (BD) {
  'use strict';

  const BS = BD.sim.bosses;
  const AI = () => BD.sim.ai;
  const MV = () => BD.sim.ai_moves;
  const MON = BD.sim.monsters;
  const E = BD.sim.entities;
  const G = BD.core.grid;
  const { dirOf, cheb } = BD.core.util;
  const reg = BS.registerMove;

  /** zone(s) + wind-up in one call; the zone ids are cancelled if the wind-up is interrupted */
  function telegraph(world, e, zones, action, ms) {
    e.ai.zoneIds = zones.map((z) => z.id);
    return AI().windup(world, e, action, ms);
  }
  const resolveNoop = { resolve: (world, e, act) => act.after || 300 };

  // ---------------- shared ----------------
  reg('crushing_blow', {
    start(world, e, c, ctx) {
      const t = ctx.tgt;
      e.dir = dirOf(t.x - e.x, t.y - e.y);
      const z = MV().strike(world, e, [[t.x, t.y]], c.armMs, c.mult, { school: 'blood', cx: t.x, cy: t.y, kind: 'crushing_blow', tags: ['heavy'] });
      return telegraph(world, e, [z], { kind: 'crushing_blow', heavy: true, after: 500 }, c.armMs);
    },
    resolve: (world, e, act) => act.after,
  });
  reg('rally', {
    start(world, e) {
      world.events.push({ type: 'rally', id: e.id, x: e.x, y: e.y });
      const sp = Array.from(world.floor.entities.values()).find((o) => o.packId === e.packId && o !== e);
      const def = sp ? sp.def : e.def;
      for (let i = 0; i < 2; i++) MON.spawn(world, def, e.x, e.y, { rank: 'minion', packId: e.packId, noLoot: true, noXp: true, spawnedBy: e.id });
      return AI().windup(world, e, { kind: 'rally', after: 300 }, 600);
    },
    resolve: (world, e, act) => act.after,
  });

  // ---------------- Keeper signatures (04 §3.6) ----------------
  reg('sig_quake', {
    start(world, e, m, ctx) {
      if (ctx.dist > 2.5) return null;
      const tiles = MV().ring(e.x, e.y, 2);
      const z = MV().strike(world, e, tiles, 800, 1.5, { school: 'dust', cx: e.x, cy: e.y, knockback: 1, kind: 'quake' });
      return telegraph(world, e, [z], { kind: 'sig_quake', heavy: true, after: 400 }, 800);
    },
    resolve: (world, e, act) => act.after,
  });
  reg('sig_grasp', {
    start(world, e, m, ctx) {
      if (ctx.dist > 8 || !ctx.hasLos()) return null;
      const t = ctx.tgt;
      const z = MV().strike(world, e, MV().cross(t.x, t.y, 1), 900, 1.2, { school: 'shadow', cx: t.x, cy: t.y, statuses: [{ id: 'rooted', durMs: 1500 }], kind: 'grasp' });
      return telegraph(world, e, [z], { kind: 'sig_grasp', after: 300 }, 900);
    },
    resolve: (world, e, act) => act.after,
  });
  reg('sig_bone_hurl', {
    start(world, e, m, ctx) {
      if (ctx.dist < 2 || ctx.dist > 8 || !ctx.hasLos()) return null;
      const t = ctx.tgt;
      world.events.push({ type: 'lob', srcId: e.id, fromX: e.x, fromY: e.y, x: t.x, y: t.y, ms: 1000, kind: 'bone_hurl' });
      const z = MV().strike(world, e, MV().circle(t.x, t.y, 1), 1000, 1.6, { school: 'bone', cx: t.x, cy: t.y, kind: 'bone_hurl' });
      return telegraph(world, e, [z], { kind: 'sig_bone_hurl', after: 300 }, 450);
    },
    resolve: (world, e, act) => { e.ai.zoneIds = null; return act.after; },
  });
  reg('sig_charge_line', {
    start(world, e, m, ctx) {
      if (ctx.dist < 2 || ctx.dist > 5.5 || !ctx.hasLos()) return null;
      const t = ctx.tgt;
      const tiles = G.rayTiles(e.x, e.y, t.x - e.x, t.y - e.y, 5);
      e.dir = dirOf(t.x - e.x, t.y - e.y);
      const z = BD.sim.zones.create(world, { tiles, cx: e.x, cy: e.y, armMs: 700, faction: 'monster', srcId: e.id, school: 'blood', heavy: true, resolve: null, kind: 'charge_mark' });
      return telegraph(world, e, [z], { kind: 'sig_charge_line', tiles, heavy: true }, 700);
    },
    resolve: (world, e, act) => MV().chargeLine(world, e, act.tiles, 1.8, 2000),
  });

  // ---------------- Grulk (04 §5.1) ----------------
  reg('leap_stomp', {
    start(world, e, m, ctx) {
      const t = ctx.tgt;
      const cx = t.x, cy = t.y;
      // rises off-screen; marks a 3×3 block on the player's tile at lift-off
      e.untargetable = true;
      e.airborne = 340;
      E.vacate(world.floor, e);
      world.events.push({ type: 'boss.leap', id: e.id, x: e.x, y: e.y, tx: cx, ty: cy, ms: m.armMs });
      const z = MV().strike(world, e, MV().square(cx, cy, 1), m.armMs, m.mult, { school: 'dust', cx, cy, knockback: m.knockback, kind: 'leap_stomp', tags: ['heavy'] });
      return telegraph(world, e, [z], { kind: 'leap_stomp', cx, cy, exposedMs: m.exposedMs, heavy: true }, m.armMs);
    },
    resolve(world, e, act) {
      e.untargetable = false; e.airborne = 0;
      const f = world.floor;
      const spot = E.isFree(f, act.cx, act.cy) ? { x: act.cx, y: act.cy } : E.nearestFree(f, act.cx, act.cy, 3) || { x: e.x, y: e.y };
      e.x = spot.x; e.y = spot.y; e.move = null;
      E.occupy(f, e);
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
        const cone = G.shapeTiles({ shape: 'cone', length: m.length, angle: 70 }, e.x, e.y, aim, e.dir);
        for (let row = 1; row <= m.length; row++) {
          const tiles = cone.filter(([x, y]) => Math.round(Math.hypot(x - e.x, y - e.y)) === row);
          if (!tiles.length) continue;
          // each row is marked 180 ms before it fires; rows fire in sequence
          BD.core.scheduler.after(world, (k * m.length + row - 1) * m.rowMs, 'boss.zone', { srcId: e.id, tiles, armMs: m.rowMs * 1.5, mult: m.mult, school: 'bone', kind: 'bone_cone' });
        }
        k++;
      }
      return AI().windup(world, e, { kind: 'bone_cone', after: 300 }, m.rowMs * m.length * sweeps.length + 200);
    },
    resolve: (world, e, act) => act.after,
  });
  BD.core.scheduler.register('boss.zone', (world, pl) => {
    const e = E.get(world, pl.srcId);
    if (!e || e.dead) return;
    MV().strike(world, e, pl.tiles, pl.armMs, pl.mult, { school: pl.school, kind: pl.kind, element: pl.element || null, statuses: pl.statuses || [], linger: pl.linger || null, knockback: pl.knockback || 0 });
  });
  reg('raise_dead', {
    start(world, e, m, ctx) {
      const cap = Math.min(m.cap || 4, BD.sim.monsters.defOf(e).summonCap || 6);
      const room = cap - BS.addsOf(world, e);
      if (room <= 0) return null;
      const f = world.floor;
      const tiles = [];
      for (let i = 0; i < Math.min(m.count, room) * 4 && tiles.length < Math.min(m.count, room); i++) {
        const x = e.x + world.rng.int(-4, 4), y = e.y + world.rng.int(-4, 4);
        if (E.isFree(f, x, y) && !tiles.some(([a, b]) => a === x && b === y)) tiles.push([x, y]);
      }
      if (!tiles.length) return null;
      world.events.push({ type: 'boss.summon', id: e.id, x: e.x, y: e.y });
      const z = BD.sim.zones.create(world, { tiles, cx: e.x, cy: e.y, armMs: m.armMs, faction: 'monster', srcId: e.id, school: 'shadow', kind: 'raise_dead', resolve: { type: 'packet', amounts: { phys: 0.0001 }, spawn: { def: m.add } } });
      void z;
      return AI().windup(world, e, { kind: 'raise_dead', after: 400 }, 700, false);
    },
    resolve: (world, e, act) => act.after,
  });

  BD.sim.bossMoves = { telegraph, resolveNoop };
})(globalThis.BD);
