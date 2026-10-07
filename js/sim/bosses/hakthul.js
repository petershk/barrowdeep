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

  const RECOVER_MS = 300;             // pause after a move before the next decision
  const HEAVY_RECOVER_MS = 400;       // the same after a heavy swing
  const BURN_MS = 3000;               // burning ground left by hellfire and the brand
  const HELLFIRE_BURN_MULT = 0.4;     // burn per tick as a fraction of Hakthul's average hit
  const HELLFIRE_MAX_WINDUP_MS = 600; // he is free to act again after this even if the zone arms later
  const SWEEP_LENGTH = 2;             // cleaving sweep cone, tiles
  const SWEEP_ANGLE = 120;            // cleaving sweep cone, degrees
  const BRAND_BURN_MULT = 0.5;
  const BRAND_WINDUP_MS = 500;
  const ERUPT_EVERY_MS = 2000;        // eruption phase: a volley every 2 s
  const ERUPT_FIRST_MS = 1500;        // the first volley comes 1.5 s into the phase
  const ERUPT_COUNT = 4;              // tiles tried per volley
  const ERUPT_SCATTER = 6;            // around the player, in tiles
  const ERUPT_ARM_MS = 1000;
  const ERUPT_MULT = 2.5;

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
        e.ai.state = 'windup';
        e.ai.action = { kind: 'shield_charge', tiles, m: act.m, again: false };
        e.ai.zoneIds = [z.id];
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
        linger: { kind: 'burning_ground', durMs: BURN_MS, amount: Monsters.avgDmg(world, e) * HELLFIRE_BURN_MULT },
      });
      return tele(world, e, [z], { kind: 'hellfire', after: RECOVER_MS }, Math.min(HELLFIRE_MAX_WINDUP_MS, m.armMs));
    },
    resolve(world, e, act) {
      e.ai.zoneIds = null;
      return act.after;
    },
  });
  reg('cleaving_sweep', {
    start(world, e, m, ctx) {
      const t = ctx.tgt;
      e.dir = dirOf(t.x - e.x, t.y - e.y);
      const cone = { shape: 'cone', length: SWEEP_LENGTH, angle: SWEEP_ANGLE };
      const tiles = Grid.shapeTiles(cone, e.x, e.y, { x: t.x - e.x, y: t.y - e.y }, e.dir);
      const z = AiMoves().strike(world, e, tiles, m.armMs, m.mult, {
        school: 'blood', cx: e.x, cy: e.y, kind: 'cleaving_sweep', tags: ['heavy'],
      });
      return tele(world, e, [z], { kind: 'cleaving_sweep', after: HEAVY_RECOVER_MS, heavy: true }, m.armMs);
    },
    resolve: after(HEAVY_RECOVER_MS),
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
          linger: { kind: 'burning_ground', durMs: BURN_MS, amount: Monsters.avgDmg(world, e) * BRAND_BURN_MULT },
        },
      });
      return BD.sim.ai.windup(world, e, { kind: 'brand', after: RECOVER_MS }, BRAND_WINDUP_MS, false);
    },
    resolve: after(RECOVER_MS),
  });
  Bosses.registerPhase('eruptions', (world, e) => {
    Bosses.bossState(world, e).eruptEvery = ERUPT_EVERY_MS;
    Bosses.bossState(world, e).nextErupt = world.time + ERUPT_FIRST_MS;
  });

  /** periodic phase effects: eruptions around the hero while the phase lasts */
  function system(world) {
    for (const e of world.floor.entities.values()) {
      const st = e.ai && e.ai.boss;
      if (!st || e.dead || !st.eruptEvery || world.time < st.nextErupt) continue;
      st.nextErupt = world.time + st.eruptEvery;
      const p = world.player;
      for (let i = 0; i < ERUPT_COUNT; i++) {
        const x = p.x + world.rng.int(-ERUPT_SCATTER, ERUPT_SCATTER), y = p.y + world.rng.int(-ERUPT_SCATTER, ERUPT_SCATTER);
        if (!Entities.walkable(world.floor, x, y)) continue;
        AiMoves().strike(world, e, [[x, y]], ERUPT_ARM_MS, ERUPT_MULT, { element: 'fire', school: 'lava', cx: x, cy: y, kind: 'eruption' });
      }
    }
  }

  BD.sim.world.addSystem('bossPhases', system, 16);
})(globalThis.BD);
