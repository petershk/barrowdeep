// @ts-check
// Moves any boss or Keeper can carry: Crushing Blow, Rally, and the Keeper signature moves (04 §3.6).
// Every move telegraphs through zones and returns its cost in ms.
(function (BD) {
  'use strict';

  const Bosses = BD.sim.bosses;
  const AiMoves = () => BD.sim.ai_moves;
  const Monsters = BD.sim.monsters;
  const Grid = BD.core.grid;
  const { dirOf } = BD.core.util;
  const reg = Bosses.registerMove;
  const telegraph = Bosses.telegraph;

  const RECOVER_MS = 300;             // pause after a move before the next decision
  const HEAVY_RECOVER_MS = 400;
  const CRUSH_RECOVER_MS = 500;
  const RALLY_MINIONS = 2;            // pack minions a rallying Keeper calls
  const RALLY_WINDUP_MS = 600;
  // Keeper signature moves (04 §3.6): when they may fire and how hard they hit
  const QUAKE = { maxRange: 2.5, radius: 2, armMs: 800, mult: 1.5, knockback: 1 };
  const GRASP = { maxRange: 8, armMs: 900, mult: 1.2, rootMs: 1500 };
  const BONE_HURL = { minRange: 2, maxRange: 8, flightMs: 1000, mult: 1.6, windupMs: 450 };
  const CHARGE = { minRange: 2, maxRange: 5.5, length: 5, armMs: 700, mult: 1.8, exposedMs: 2000 };

  // ---------------- shared ----------------
  reg('crushing_blow', {
    start(world, e, c, ctx) {
      const t = ctx.tgt;
      e.dir = dirOf(t.x - e.x, t.y - e.y);
      const z = AiMoves().strike(world, e, [[t.x, t.y]], c.armMs, c.mult, {
        school: 'blood', cx: t.x, cy: t.y, kind: 'crushing_blow', tags: ['heavy'],
      });
      return telegraph(world, e, [z], { kind: 'crushing_blow', heavy: true, after: CRUSH_RECOVER_MS }, c.armMs);
    },
    resolve: (world, e, act) => act.after,
  });
  reg('rally', {
    start(world, e) {
      world.events.push({ type: 'rally', id: e.id, x: e.x, y: e.y });
      const sp = Array.from(world.floor.entities.values()).find((o) => o.packId === e.packId && o !== e);
      const def = sp ? sp.def : e.def;
      for (let i = 0; i < RALLY_MINIONS; i++) {
        Monsters.spawn(world, def, e.x, e.y, { rank: 'minion', packId: e.packId, noLoot: true, noXp: true, spawnedBy: e.id });
      }
      return BD.sim.ai.windup(world, e, { kind: 'rally', after: RECOVER_MS }, RALLY_WINDUP_MS);
    },
    resolve: (world, e, act) => act.after,
  });

  // ---------------- Keeper signatures (04 §3.6) ----------------
  reg('sig_quake', {
    start(world, e, m, ctx) {
      if (ctx.dist > QUAKE.maxRange) return null;
      const tiles = AiMoves().ring(e.x, e.y, QUAKE.radius);
      const z = AiMoves().strike(world, e, tiles, QUAKE.armMs, QUAKE.mult, {
        school: 'dust', cx: e.x, cy: e.y, knockback: QUAKE.knockback, kind: 'quake',
      });
      return telegraph(world, e, [z], { kind: 'sig_quake', heavy: true, after: HEAVY_RECOVER_MS }, QUAKE.armMs);
    },
    resolve: (world, e, act) => act.after,
  });
  reg('sig_grasp', {
    start(world, e, m, ctx) {
      if (ctx.dist > GRASP.maxRange || !ctx.hasLos()) return null;
      const t = ctx.tgt;
      const z = AiMoves().strike(world, e, AiMoves().cross(t.x, t.y, 1), GRASP.armMs, GRASP.mult, {
        school: 'shadow', cx: t.x, cy: t.y, statuses: [{ id: 'rooted', durMs: GRASP.rootMs }], kind: 'grasp',
      });
      return telegraph(world, e, [z], { kind: 'sig_grasp', after: RECOVER_MS }, GRASP.armMs);
    },
    resolve: (world, e, act) => act.after,
  });
  reg('sig_bone_hurl', {
    start(world, e, m, ctx) {
      if (ctx.dist < BONE_HURL.minRange || ctx.dist > BONE_HURL.maxRange || !ctx.hasLos()) return null;
      const t = ctx.tgt;
      const ms = BONE_HURL.flightMs;
      world.events.push({ type: 'lob', srcId: e.id, fromX: e.x, fromY: e.y, x: t.x, y: t.y, ms, kind: 'bone_hurl' });
      const z = AiMoves().strike(world, e, AiMoves().circle(t.x, t.y, 1), ms, BONE_HURL.mult, {
        school: 'bone', cx: t.x, cy: t.y, kind: 'bone_hurl',
      });
      return telegraph(world, e, [z], { kind: 'sig_bone_hurl', after: RECOVER_MS }, BONE_HURL.windupMs);
    },
    resolve: (world, e, act) => {
      e.ai.zoneIds = null;
      return act.after;
    },
  });
  reg('sig_charge_line', {
    start(world, e, m, ctx) {
      if (ctx.dist < CHARGE.minRange || ctx.dist > CHARGE.maxRange || !ctx.hasLos()) return null;
      const t = ctx.tgt;
      const tiles = Grid.rayTiles(e.x, e.y, t.x - e.x, t.y - e.y, CHARGE.length);
      e.dir = dirOf(t.x - e.x, t.y - e.y);
      const z = BD.sim.zones.create(world, {
        tiles, cx: e.x, cy: e.y, armMs: CHARGE.armMs,
        faction: 'monster', srcId: e.id, school: 'blood', heavy: true, resolve: null, kind: 'charge_mark',
      });
      return telegraph(world, e, [z], { kind: 'sig_charge_line', tiles, heavy: true }, CHARGE.armMs);
    },
    resolve: (world, e, act) => AiMoves().chargeLine(world, e, act.tiles, CHARGE.mult, CHARGE.exposedMs),
  });
})(globalThis.BD);
