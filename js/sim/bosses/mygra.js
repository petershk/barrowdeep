// @ts-check
// Mygra the Brood Mother, Act III boss (04 §5.3): venom, webs, burrow strikes and egg clutches.
(function (BD) {
  'use strict';

  const Bosses = BD.sim.bosses;
  const Ai = () => BD.sim.ai;
  const AiMoves = () => BD.sim.ai_moves;
  const Monsters = BD.sim.monsters;
  const Entities = BD.sim.entities;
  const Grid = BD.core.grid;
  const { dirOf } = BD.core.util;
  const reg = Bosses.registerMove;
  const tele = Bosses.telegraph;
  const after = Bosses.after;
  const summon = Bosses.summon;

  const RECOVER_MS = 300;             // pause after a move before the next decision
  const SPIT_SCATTER = 2;             // extra venom globs land within this many tiles of the target
  const POISON_MS = 4000;             // poisoned status and pool duration
  const POOL_MULT = 0.3;              // pool damage per tick as a fraction of Mygra's average hit
  const SPIT_WINDUP_MS = 500;
  const WEB_ANGLE = 90;               // web spray cone, degrees
  const NO_DAMAGE = 0.0001;           // multiplier for zones that only apply a status
  const WEB_SLOW_MS = 2000;
  const WEB_SLOW_MAG = 0.6;
  const BURROW_MS = 700;              // time underground before the strike is marked
  const EMERGE_SEARCH_R = 3;          // she surfaces on the nearest free tile within this many tiles
  const BROOD_WINDUP_MS = 500;
  const WEB_EDGE_REACH = 2;           // phase webs cover tiles this close to a wall
  const FOREVER_MS = 1e9;             // ground that lasts the whole fight

  // ---------------- Mygra ----------------
  reg('venom_spit', {
    start(world, e, m, ctx) {
      const t = ctx.tgt, zs = [];
      const spots = [
        [t.x, t.y],
        [t.x + world.rng.int(-SPIT_SCATTER, SPIT_SCATTER), t.y + world.rng.int(-SPIT_SCATTER, SPIT_SCATTER)],
        [t.x + world.rng.int(-SPIT_SCATTER, SPIT_SCATTER), t.y + world.rng.int(-SPIT_SCATTER, SPIT_SCATTER)],
      ].slice(0, m.count);
      for (const [x, y] of spots) {
        world.events.push({ type: 'lob', srcId: e.id, fromX: e.x, fromY: e.y, x, y, ms: m.armMs, kind: 'venom' });
        zs.push(AiMoves().strike(world, e, AiMoves().circle(x, y, 1), m.armMs, m.mult, {
          element: 'pois', school: 'poison', cx: x, cy: y, kind: 'venom_spit',
          statuses: [{ id: 'poisoned', durMs: POISON_MS }],
          linger: { kind: 'poison_pool', durMs: POISON_MS, amount: Monsters.avgDmg(world, e) * POOL_MULT },
        }));
      }
      return Ai().windup(world, e, { kind: 'venom_spit', after: RECOVER_MS }, SPIT_WINDUP_MS, false);
    },
    resolve: after(RECOVER_MS),
  });
  reg('web_spray', {
    start(world, e, m, ctx) {
      const t = ctx.tgt;
      e.dir = dirOf(t.x - e.x, t.y - e.y);
      const cone = { shape: 'cone', length: m.length, angle: WEB_ANGLE };
      const tiles = Grid.shapeTiles(cone, e.x, e.y, { x: t.x - e.x, y: t.y - e.y }, e.dir);
      const z = AiMoves().strike(world, e, tiles, m.armMs, NO_DAMAGE, {
        school: 'bone', cx: e.x, cy: e.y, kind: 'web_spray', statuses: [{ id: 'slowed', durMs: WEB_SLOW_MS, mag: WEB_SLOW_MAG }],
      });
      return tele(world, e, [z], { kind: 'web_spray', after: RECOVER_MS }, m.armMs);
    },
    resolve: after(RECOVER_MS),
  });
  reg('burrow_strike', {
    start(world, e, m) {
      e.untargetable = true;
      Entities.vacate(world.floor, e);
      world.events.push({ type: 'burrow', id: e.id, x: e.x, y: e.y });
      return Ai().windup(world, e, { kind: 'burrow_strike', stage: 0, m }, BURROW_MS, false);
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
      const spot = Entities.nearestFree(world.floor, act.x, act.y, EMERGE_SEARCH_R) || { x: e.x, y: e.y };
      e.x = spot.x;
      e.y = spot.y;
      e.move = null;
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
      return Ai().windup(world, e, { kind: 'brood', after: RECOVER_MS }, BROOD_WINDUP_MS, false);
    },
    resolve: after(RECOVER_MS),
  });
  Bosses.registerPhase('web_edges', (world) => {
    const f = world.floor, tiles = [];
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
      if (!Entities.walkable(f, x, y)) continue;
      const nearWall = BD.core.util.DIRS.some(([dx, dy]) => !Entities.walkable(f, x + dx * WEB_EDGE_REACH, y + dy * WEB_EDGE_REACH));
      if (nearWall) tiles.push([x, y]);
    }
    BD.sim.zones.ground(world, 'web', tiles, { durMs: FOREVER_MS, faction: 'monster' });
  });
})(globalThis.BD);
