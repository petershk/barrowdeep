// @ts-check
// Grulk the Gravewarden, Act I boss (04 §5.1): leap stomp, bone cone sweeps, raised dead.
(function (BD) {
  'use strict';

  const Bosses = BD.sim.bosses;
  const Ai = () => BD.sim.ai;
  const AiMoves = () => BD.sim.ai_moves;
  const Entities = BD.sim.entities;
  const Grid = BD.core.grid;
  const { dirOf } = BD.core.util;
  const reg = Bosses.registerMove;
  const telegraph = Bosses.telegraph;

  const LEAP_AIRBORNE = 340;      // e.airborne while Grulk is in the air (the view lifts him off-screen)
  const LAND_SEARCH_R = 3;        // he lands on the nearest free tile within this many tiles of the mark
  const BONE_CONE_ANGLE = 70;     // degrees per sweep
  const TWIN_SWEEP_OFFSET = 0.5;  // radians either side of the target for the doubled sweep
  const ROW_ARM_SCALE = 1.5;      // each cone row stays marked 1.5× the row interval
  const CONE_RECOVER_MS = 300;
  const CONE_TAIL_MS = 200;       // extra wind-up after the last row fires
  const RAISE_CAP = 4;            // live adds when the move sets no cap
  const DEFAULT_SUMMON_CAP = 6;   // as in the boss framework
  const RAISE_TRIES_PER_ADD = 4;  // random tiles tried per add before giving up
  const RAISE_SCATTER = 4;        // the dead rise within this many tiles of Grulk
  const RAISE_RECOVER_MS = 400;
  const RAISE_WINDUP_MS = 700;

  // ---------------- Grulk (04 §5.1) ----------------
  reg('leap_stomp', {
    start(world, e, m, ctx) {
      const t = ctx.tgt;
      const cx = t.x, cy = t.y;
      // rises off-screen; marks a 3×3 block on the player's tile at lift-off
      e.untargetable = true;
      e.airborne = LEAP_AIRBORNE;
      Entities.vacate(world.floor, e);
      world.events.push({ type: 'boss.leap', id: e.id, x: e.x, y: e.y, tx: cx, ty: cy, ms: m.armMs });
      const z = AiMoves().strike(world, e, AiMoves().square(cx, cy, 1), m.armMs, m.mult, {
        school: 'dust', cx, cy, knockback: m.knockback, kind: 'leap_stomp', tags: ['heavy'],
      });
      return telegraph(world, e, [z], { kind: 'leap_stomp', cx, cy, exposedMs: m.exposedMs, heavy: true }, m.armMs);
    },
    resolve(world, e, act) {
      e.untargetable = false;
      e.airborne = 0;
      const f = world.floor;
      let spot = { x: act.cx, y: act.cy };
      if (!Entities.isFree(f, act.cx, act.cy)) spot = Entities.nearestFree(f, act.cx, act.cy, LAND_SEARCH_R) || { x: e.x, y: e.y };
      e.x = spot.x;
      e.y = spot.y;
      e.move = null;
      Entities.occupy(f, e);
      world.events.push({ type: 'boss.land', id: e.id, x: e.x, y: e.y, heavy: true });
      return 0;
    },
  });
  reg('bone_cone', {
    start(world, e, m, ctx) {
      const t = ctx.tgt;
      const base = Math.atan2(t.y - e.y, t.x - e.x);
      const sweeps = m.twice ? [base - TWIN_SWEEP_OFFSET, base + TWIN_SWEEP_OFFSET] : [base];
      e.dir = dirOf(t.x - e.x, t.y - e.y);
      let k = 0;
      for (const ang of sweeps) {
        const aim = { x: Math.cos(ang), y: Math.sin(ang) };
        const cone = Grid.shapeTiles({ shape: 'cone', length: m.length, angle: BONE_CONE_ANGLE }, e.x, e.y, aim, e.dir);
        for (let row = 1; row <= m.length; row++) {
          const tiles = cone.filter(([x, y]) => Math.round(Math.hypot(x - e.x, y - e.y)) === row);
          if (!tiles.length) continue;
          // each row is marked 180 ms before it fires; rows fire in sequence
          BD.core.scheduler.after(world, (k * m.length + row - 1) * m.rowMs, 'boss.zone', {
            srcId: e.id, tiles, armMs: m.rowMs * ROW_ARM_SCALE, mult: m.mult, school: 'bone', kind: 'bone_cone',
          });
        }
        k++;
      }
      const windupMs = m.rowMs * m.length * sweeps.length + CONE_TAIL_MS;
      return Ai().windup(world, e, { kind: 'bone_cone', after: CONE_RECOVER_MS }, windupMs);
    },
    resolve: (world, e, act) => act.after,
  });
  reg('raise_dead', {
    start(world, e, m, ctx) {
      const cap = Math.min(m.cap || RAISE_CAP, BD.sim.monsters.defOf(e).summonCap || DEFAULT_SUMMON_CAP);
      const room = cap - Bosses.addsOf(world, e);
      if (room <= 0) return null;
      const f = world.floor;
      const tiles = [];
      const want = Math.min(m.count, room);
      for (let i = 0; i < want * RAISE_TRIES_PER_ADD && tiles.length < want; i++) {
        const x = e.x + world.rng.int(-RAISE_SCATTER, RAISE_SCATTER), y = e.y + world.rng.int(-RAISE_SCATTER, RAISE_SCATTER);
        if (Entities.isFree(f, x, y) && !tiles.some(([a, b]) => a === x && b === y)) tiles.push([x, y]);
      }
      if (!tiles.length) return null;
      world.events.push({ type: 'boss.summon', id: e.id, x: e.x, y: e.y });
      BD.sim.zones.create(world, {
        tiles, cx: e.x, cy: e.y, armMs: m.armMs, faction: 'monster', srcId: e.id, school: 'shadow', kind: 'raise_dead',
        resolve: { type: 'packet', amounts: { phys: 0.0001 }, spawn: { def: m.add } },
      });
      return Ai().windup(world, e, { kind: 'raise_dead', after: RAISE_RECOVER_MS }, RAISE_WINDUP_MS, false);
    },
    resolve: (world, e, act) => act.after,
  });
})(globalThis.BD);
