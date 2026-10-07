// @ts-check
// Hakthul the Dread Knight, Act IV boss (04 §5.4): shield charge, hellfire, brand, and an eruption phase.
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

  // ---------------- Hakthul ----------------
  reg('shield_charge', {
    start(world, e, m, ctx) {
      const t = ctx.tgt;
      const tiles = Grid.rayTiles(e.x, e.y, t.x - e.x, t.y - e.y, m.length);
      e.dir = dirOf(t.x - e.x, t.y - e.y);
      const z = BD.sim.zones.create(world, {
        tiles, cx: e.x, cy: e.y, armMs: m.armMs,
        faction: 'monster', srcId: e.id, school: 'blood', heavy: true, resolve: null, kind: 'charge_mark',
      });
      return tele(world, e, [z], { kind: 'shield_charge', tiles, m, again: !!m.twice }, m.armMs);
    },
    resolve(world, e, act) {
      const c = AiMoves().chargeLine(world, e, act.tiles, act.m.mult, act.m.exposedMs);
      if (act.again && e.ai.state !== 'exposed') {
        // phase 2: a second charge straight away
        const p = world.player;
        const tiles = Grid.rayTiles(e.x, e.y, p.x - e.x, p.y - e.y, act.m.length);
        const z = BD.sim.zones.create(world, {
          tiles, cx: e.x, cy: e.y, armMs: act.m.armMs,
          faction: 'monster', srcId: e.id, school: 'blood', heavy: true, resolve: null, kind: 'charge_mark',
        });
        e.ai.state = 'windup'; e.ai.action = { kind: 'shield_charge', tiles, m: act.m, again: false }; e.ai.zoneIds = [z.id];
        e.attack = { phase: 'windup', remaining: act.m.armMs, telegraph: true };
        return act.m.armMs;
      }
      return c;
    },
  });
  reg('hellfire', {
    start(world, e, m, ctx) {
      const t = ctx.tgt;
      const z = AiMoves().strike(world, e, AiMoves().diamond(t.x, t.y, 1), m.armMs, m.mult, {
        element: 'fire', school: 'fire', cx: t.x, cy: t.y, kind: 'hellfire',
        linger: { kind: 'burning_ground', durMs: 3000, amount: Monsters.avgDmg(world, e) * 0.4 },
      });
      return tele(world, e, [z], { kind: 'hellfire', after: 300 }, Math.min(600, m.armMs));
    },
    resolve(world, e, act) { e.ai.zoneIds = null; return act.after; },
  });
  reg('cleaving_sweep', {
    start(world, e, m, ctx) {
      const t = ctx.tgt;
      e.dir = dirOf(t.x - e.x, t.y - e.y);
      const tiles = Grid.shapeTiles({ shape: 'cone', length: 2, angle: 120 }, e.x, e.y, { x: t.x - e.x, y: t.y - e.y }, e.dir);
      const z = AiMoves().strike(world, e, tiles, m.armMs, m.mult, {
        school: 'blood', cx: e.x, cy: e.y, kind: 'cleaving_sweep', tags: ['heavy'],
      });
      return tele(world, e, [z], { kind: 'cleaving_sweep', after: 400, heavy: true }, m.armMs);
    },
    resolve: after(400),
  });
  reg('brand', {
    start(world, e, m, ctx) {
      const t = ctx.tgt;
      world.events.push({ type: 'brand', id: t.id, x: t.x, y: t.y });
      // the mark follows its target for 3 s, then the floor beneath erupts
      BD.sim.zones.create(world, {
        tiles: [[t.x, t.y]], cx: t.x, cy: t.y, armMs: m.armMs,
        faction: 'monster', srcId: e.id, school: 'lava', follow: t.id, kind: 'brand', heavy: true,
        resolve: {
          type: 'packet',
          amounts: { fire: Monsters.avgDmg(world, e) * m.mult },
          linger: { kind: 'burning_ground', durMs: 3000, amount: Monsters.avgDmg(world, e) * 0.5 },
        },
      });
      return BD.sim.ai.windup(world, e, { kind: 'brand', after: 300 }, 500, false);
    },
    resolve: after(300),
  });
  Bosses.registerPhase('eruptions', (world, e) => {
    Bosses.bossState(world, e).eruptEvery = 2000;
    Bosses.bossState(world, e).nextErupt = world.time + 1500;
  });

  /** periodic phase effects: eruptions around the hero while the phase lasts */
  function system(world) {
    for (const e of world.floor.entities.values()) {
      const st = e.ai && e.ai.boss;
      if (!st || e.dead || !st.eruptEvery || world.time < st.nextErupt) continue;
      st.nextErupt = world.time + st.eruptEvery;
      const p = world.player;
      for (let i = 0; i < 4; i++) {
        const x = p.x + world.rng.int(-6, 6), y = p.y + world.rng.int(-6, 6);
        if (!Entities.walkable(world.floor, x, y)) continue;
        AiMoves().strike(world, e, [[x, y]], 1000, 2.5, { element: 'fire', school: 'lava', cx: x, cy: y, kind: 'eruption' });
      }
    }
  }

  BD.sim.world.addSystem('bossPhases', system, 16);
})(globalThis.BD);
