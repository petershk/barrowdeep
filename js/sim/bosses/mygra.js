// @ts-check
// Mygra the Brood Mother, Act III boss (04 §5.3): venom, webs, burrow strikes and egg clutches.
(function (BD) {
  'use strict';

  const Bosses = BD.sim.bosses;
  const AiMoves = () => BD.sim.ai_moves;
  const Monsters = BD.sim.monsters;
  const Entities = BD.sim.entities;
  const Grid = BD.core.grid;
  const { dirOf } = BD.core.util;
  const reg = Bosses.registerMove;
  const tele = Bosses.telegraph;
  const after = Bosses.after;
  const summon = Bosses.summon;

  // ---------------- Mygra ----------------
  reg('venom_spit', {
    start(world, e, m, ctx) {
      const t = ctx.tgt, zs = [];
      const spots = [
        [t.x, t.y],
        [t.x + world.rng.int(-2, 2), t.y + world.rng.int(-2, 2)],
        [t.x + world.rng.int(-2, 2), t.y + world.rng.int(-2, 2)],
      ].slice(0, m.count);
      for (const [x, y] of spots) {
        world.events.push({ type: 'lob', srcId: e.id, fromX: e.x, fromY: e.y, x, y, ms: m.armMs, kind: 'venom' });
        zs.push(AiMoves().strike(world, e, AiMoves().circle(x, y, 1), m.armMs, m.mult, {
          element: 'pois', school: 'poison', cx: x, cy: y, kind: 'venom_spit',
          statuses: [{ id: 'poisoned', durMs: 4000 }],
          linger: { kind: 'poison_pool', durMs: 4000, amount: Monsters.avgDmg(world, e) * 0.3 },
        }));
      }
      return BD.sim.ai.windup(world, e, { kind: 'venom_spit', after: 300 }, 500, false);
    },
    resolve: after(300),
  });
  reg('web_spray', {
    start(world, e, m, ctx) {
      const t = ctx.tgt;
      e.dir = dirOf(t.x - e.x, t.y - e.y);
      const tiles = Grid.shapeTiles({ shape: 'cone', length: m.length, angle: 90 }, e.x, e.y, { x: t.x - e.x, y: t.y - e.y }, e.dir);
      const z = AiMoves().strike(world, e, tiles, m.armMs, 0.0001, {
        school: 'bone', cx: e.x, cy: e.y, kind: 'web_spray', statuses: [{ id: 'slowed', durMs: 2000, mag: 0.6 }],
      });
      return tele(world, e, [z], { kind: 'web_spray', after: 300 }, m.armMs);
    },
    resolve: after(300),
  });
  reg('burrow_strike', {
    start(world, e, m) {
      e.untargetable = true;
      Entities.vacate(world.floor, e);
      world.events.push({ type: 'burrow', id: e.id, x: e.x, y: e.y });
      return BD.sim.ai.windup(world, e, { kind: 'burrow_strike', stage: 0, m }, 700, false);
    },
    resolve(world, e, act) {
      const p = world.player;
      if (act.stage === 0) {
        const z = AiMoves().strike(world, e, AiMoves().circle(p.x, p.y, 1), act.m.armMs, act.m.mult, {
          school: 'dust', cx: p.x, cy: p.y, kind: 'burrow_strike', tags: ['heavy'],
        });
        e.ai.state = 'windup';
        e.ai.action = { kind: 'burrow_strike', stage: 1, m: act.m, x: p.x, y: p.y, exposedMs: act.m.exposedMs, heavy: true };
        e.ai.zoneIds = [z.id];
        return act.m.armMs;
      }
      e.untargetable = false;
      const spot = Entities.nearestFree(world.floor, act.x, act.y, 3) || { x: e.x, y: e.y };
      e.x = spot.x; e.y = spot.y; e.move = null;
      Entities.occupy(world.floor, e);
      world.events.push({ type: 'emerge', id: e.id, x: e.x, y: e.y, heavy: true });
      return 0;
    },
  });
  reg('brood', {
    start(world, e, m) {
      let n = 0;
      for (const o of world.floor.entities.values()) {
        if (o.dead || o.def !== m.from) continue;
        n += summon(world, e, m.add, 1, m.perClutch, [[o.x, o.y]]);
        world.events.push({ type: 'egg.hatch', x: o.x, y: o.y });
      }
      if (!n) return null;
      return BD.sim.ai.windup(world, e, { kind: 'brood', after: 300 }, 500, false);
    },
    resolve: after(300),
  });
  Bosses.registerPhase('web_edges', (world) => {
    const f = world.floor, tiles = [];
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
      if (!Entities.walkable(f, x, y)) continue;
      let edge = false;
      for (const [dx, dy] of BD.core.util.DIRS) if (!Entities.walkable(f, x + dx * 2, y + dy * 2)) { edge = true; break; }
      if (edge) tiles.push([x, y]);
    }
    BD.sim.zones.ground(world, 'web', tiles, { durMs: 1e9, faction: 'monster' });
  });
})(globalThis.BD);
