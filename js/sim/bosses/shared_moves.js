// @ts-check
// Moves any boss or Keeper can carry: Crushing Blow, Rally, and the Keeper signature moves (04 §3.6).
// Every move telegraphs through zones and returns its cost in ms.
(function (BD) {
  'use strict';

  const BS = BD.sim.bosses;
  const AI = () => BD.sim.ai;
  const MV = () => BD.sim.ai_moves;
  const MON = BD.sim.monsters;
  const G = BD.core.grid;
  const { dirOf } = BD.core.util;
  const reg = BS.registerMove;
  const telegraph = BS.telegraph;

  // ---------------- shared ----------------
  reg('crushing_blow', {
    start(world, e, c, ctx) {
      const t = ctx.tgt;
      e.dir = dirOf(t.x - e.x, t.y - e.y);
      const z = MV().strike(world, e, [[t.x, t.y]], c.armMs, c.mult, {
        school: 'blood', cx: t.x, cy: t.y, kind: 'crushing_blow', tags: ['heavy'],
      });
      return telegraph(world, e, [z], { kind: 'crushing_blow', heavy: true, after: 500 }, c.armMs);
    },
    resolve: (world, e, act) => act.after,
  });
  reg('rally', {
    start(world, e) {
      world.events.push({ type: 'rally', id: e.id, x: e.x, y: e.y });
      const sp = Array.from(world.floor.entities.values()).find((o) => o.packId === e.packId && o !== e);
      const def = sp ? sp.def : e.def;
      for (let i = 0; i < 2; i++) {
        MON.spawn(world, def, e.x, e.y, { rank: 'minion', packId: e.packId, noLoot: true, noXp: true, spawnedBy: e.id });
      }
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
      const z = MV().strike(world, e, MV().cross(t.x, t.y, 1), 900, 1.2, {
        school: 'shadow', cx: t.x, cy: t.y, statuses: [{ id: 'rooted', durMs: 1500 }], kind: 'grasp',
      });
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
      const z = BD.sim.zones.create(world, {
        tiles, cx: e.x, cy: e.y, armMs: 700,
        faction: 'monster', srcId: e.id, school: 'blood', heavy: true, resolve: null, kind: 'charge_mark',
      });
      return telegraph(world, e, [z], { kind: 'sig_charge_line', tiles, heavy: true }, 700);
    },
    resolve: (world, e, act) => MV().chargeLine(world, e, act.tiles, 1.8, 2000),
  });
})(globalThis.BD);
