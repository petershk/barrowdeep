// @ts-check
// Malgoth (04 §5.5): three phases (ranged → centre with a burning rim → wings and the Doom Beam),
// plus a fourth at Ascension 10. The Sanctum seals when the player steps into the chamber.
(function (BD) {
  'use strict';

  const Bosses = BD.sim.bosses;
  const AiMoves = () => BD.sim.ai_moves;
  const Monsters = BD.sim.monsters;
  const Entities = BD.sim.entities;
  const Grid = BD.core.grid;
  const { dirOf, within } = BD.core.util;
  const reg = Bosses.registerMove;
  const tele = Bosses.telegraph;
  const sched = (world, ms, kind, pl) => BD.core.scheduler.after(world, ms, kind, pl);

  const COUNTDOWN_SHOWN = 4;          // first number of the sealing countdown on screen
  const SEAL_HOLD_MS = 3100;          // Malgoth holds still through the countdown
  const RECOVER_MS = 300;             // pause after a move before the next decision
  const HEAVY_RECOVER_MS = 400;
  const BLINK_SEARCH_R = 3;           // blinks land on the nearest free tile within this many tiles
  // fire wave: an expanding ring with one gap
  const WAVE_STEPS = 9;               // rings, one tile apart
  const WAVE_GAP = 1.1;               // half-width of the gap, in tiles of arc
  const WAVE_RING_ARM_MS = 400;       // each ring is marked this long before it burns
  const WAVE_RING_EVERY_MS = 110;     // ring r fires r x this after the first
  const WAVE_RECOVER_MS = 600;
  const IMP_CALL_WINDUP_MS = 600;
  // phase 2
  const RIM_DEPTH = 2.5;              // the burning rim is this many tiles deep inside the chamber wall
  const RIM_BURN_MULT = 0.5;          // rim burn per tick as a fraction of Malgoth's average hit
  const FOREVER_MS = 1e9;             // ground that lasts the whole fight
  const RAIN_SCATTER = 4;             // chaos rain lands within this many tiles of the player
  const RAIN_WAVE_GAP_MS = 200;       // pause between the two waves of chaos rain
  const HANDS_OFFSETS = [[0, 0], [3, 1], [-3, -1]];  // grasping hands around the player
  const HANDS_WINDUP_MS = 500;
  const CLAW_LENGTH = 2;              // claw cone, tiles
  const CLAW_ANGLE = 110;             // claw cone, degrees
  // phase 3
  const WING_X = 3;                   // the hell knights flank the chamber centre this far out
  const METEOR_EVERY_MS = 450;
  const METEOR_DROP_FROM = 6;         // tiles above Malgoth the meteors are lobbed from
  const METEOR_BURN_MS = 2500;
  const METEOR_BURN_MULT = 0.4;
  const BEAM_LENGTH = 13;             // tiles from the chamber centre
  const BEAM_TICKS = 40;              // beam positions over its sweep
  const BEAM_TICK_MS = 100;           // one position every 100 ms (4 s in all)
  const BEAM_TICKS_PER_QUARTER = 10;  // ticks per 90 degrees of rotation
  const BEAM_HIT_EVERY_MS = 500;      // one hit per victim per 500 ms
  // Ascension 10
  const ETERNAL_ASCENSION = 10;
  const ETERNAL_AT = 0.15;            // the fourth phase starts below 15% life
  const ETERNAL_SPEED = 1.25;
  /** teleport to a free spot, announcing the blink */
  function blinkTo(world, e, spot) {
    world.events.push({ type: 'blink', id: e.id, fromX: e.x, fromY: e.y, x: spot.x, y: spot.y });
    BD.sim.movement.displace(world, e, spot.x, spot.y, 1, 'blink');
    e.move = null;
  }

  // ---------------- Sanctum flow: seal the threshold, countdown, wake ----------------
  function system(world) {
    const f = world.floor;
    if (!f.sanctum || f.sanctumStarted || f.bossDead) return;
    const p = world.player, s = f.sanctum;
    if (!within(p.x, p.y, s.cx, s.cy, s.r - 1)) return;
    f.sanctumStarted = true;
    for (const [x, y] of s.door) {
      if (!Entities.occupant(f, x, y)) f.tiles[Grid.idx(f, x, y)] = BD.data.tiles.T.WALL;
    }
    f.exploreDirty = true;
    f.blockVer = (f.blockVer || 0) + 1;
    world.events.push({ type: 'sanctum.seal' });
    world.run.countdownMs = BD.sim.bossfight.COUNTDOWN;
    world.run.countdownShown = COUNTDOWN_SHOWN;
    for (const e of f.entities.values()) {
      if (e.rank !== 'malgoth' || !e.ai) continue;
      e.ai.state = 'idle';
      e.ai.timer = SEAL_HOLD_MS;
      e.ai.held = true;
    }
  }

  // ---------------- phase 1: ranged ----------------
  reg('fire_wave', {
    start(world, e, m) {
      // an expanding ring with one 2-tile gap, 1.2 s before it starts
      const gap = world.rng.range(0, Math.PI * 2);
      for (let r = 1; r <= WAVE_STEPS; r++) {
        const outsideGap = ([dx, dy]) => {
          let a = Math.atan2(dy, dx) - gap;
          a = Math.atan2(Math.sin(a), Math.cos(a));
          return Math.abs(a) * r > WAVE_GAP;
        };
        const tiles = Grid.shapeOffsets('annulus', r).filter(outsideGap).map(([dx, dy]) => [e.x + dx, e.y + dy]);
        sched(world, m.armMs - WAVE_RING_ARM_MS + r * WAVE_RING_EVERY_MS, 'boss.zone', {
          srcId: e.id, tiles, armMs: WAVE_RING_ARM_MS, mult: m.mult, school: 'fire', element: 'fire', kind: 'fire_wave',
        });
      }
      world.events.push({ type: 'boss.cast', id: e.id, move: 'fire_wave', x: e.x, y: e.y });
      return BD.sim.ai.windup(world, e, { kind: 'fire_wave', after: WAVE_RECOVER_MS }, m.armMs);
    },
    resolve: (world, e, act) => act.after,
  });
  reg('imp_call', {
    start(world, e, m) {
      if (!Bosses.summon(world, e, m.add, m.count, m.cap, null)) return null;
      return BD.sim.ai.windup(world, e, { kind: 'imp_call', after: RECOVER_MS }, IMP_CALL_WINDUP_MS, false);
    },
    resolve: (world, e, act) => act.after,
  });

  // ---------------- phase 2: the burning rim ----------------
  Bosses.registerPhase('malgoth_p2', (world, e) => {
    const f = world.floor, s = f.sanctum;
    if (!s) return;
    const spot = Entities.nearestFree(f, s.cx, s.cy, BLINK_SEARCH_R);
    if (spot) blinkTo(world, e, spot);
    const rim = [];
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
      const d2 = (x - s.cx) * (x - s.cx) + (y - s.cy) * (y - s.cy);
      if (d2 > (s.r - RIM_DEPTH) * (s.r - RIM_DEPTH) && d2 <= (s.r + 0.5) * (s.r + 0.5) && Entities.walkable(f, x, y)) rim.push([x, y]);
    }
    BD.sim.zones.ground(world, 'burning_ground', rim, {
      durMs: FOREVER_MS, faction: 'monster', srcId: e.id, amount: Monsters.avgDmg(world, e) * RIM_BURN_MULT,
    });
    e.immobile = true;
  });
  reg('chaos_rain', {
    start(world, e, m, ctx) {
      const p = ctx.tgt;
      const wave = (k) => {
        const tiles = [];
        for (let i = 0; i < m.count; i++) {
          // the first drop lands on the player, the rest scatter around them
          let x = p.x, y = p.y;
          if (i !== 0) {
            x = p.x + world.rng.int(-RAIN_SCATTER, RAIN_SCATTER);
            y = p.y + world.rng.int(-RAIN_SCATTER, RAIN_SCATTER);
          }
          if (Entities.walkable(world.floor, x, y)) tiles.push([x, y]);
        }
        for (const t of tiles) {
          sched(world, k * (m.armMs + RAIN_WAVE_GAP_MS), 'boss.zone', {
            srcId: e.id, tiles: [t], armMs: m.armMs, mult: m.mult, school: 'shadow', element: 'fire', kind: 'chaos_rain',
          });
        }
      };
      wave(0);
      wave(1);
      const windupMs = 2 * (m.armMs + RAIN_WAVE_GAP_MS);
      return BD.sim.ai.windup(world, e, { kind: 'chaos_rain', exposedMs: m.exposedMs, heavy: true }, windupMs);
    },
    resolve: () => 0,
  });
  reg('grasping_hands', {
    start(world, e, m, ctx) {
      const p = ctx.tgt, zs = [];
      for (const [dx, dy] of HANDS_OFFSETS) {
        const x = p.x + dx, y = p.y + dy;
        zs.push(AiMoves().strike(world, e, AiMoves().cross(x, y, 1), m.armMs, m.mult, {
          school: 'shadow', cx: x, cy: y, statuses: [{ id: 'rooted', durMs: m.rootMs }], kind: 'grasping_hands',
        }));
      }
      return BD.sim.ai.windup(world, e, { kind: 'grasping_hands', after: RECOVER_MS }, HANDS_WINDUP_MS, false);
    },
    resolve: (world, e, act) => act.after,
  });
  reg('claw', {
    start(world, e, m, ctx) {
      const t = ctx.tgt;
      e.dir = dirOf(t.x - e.x, t.y - e.y);
      const cone = { shape: 'cone', length: CLAW_LENGTH, angle: CLAW_ANGLE };
      const tiles = Grid.shapeTiles(cone, e.x, e.y, { x: t.x - e.x, y: t.y - e.y }, e.dir);
      const z = AiMoves().strike(world, e, tiles, m.armMs, m.mult, { school: 'blood', cx: e.x, cy: e.y, kind: 'claw', tags: ['heavy'] });
      return tele(world, e, [z], { kind: 'claw', after: HEAVY_RECOVER_MS, heavy: true }, m.armMs);
    },
    resolve: (world, e, act) => act.after,
  });

  // ---------------- phase 3: wings, Meteor Train, Doom Beam ----------------
  Bosses.registerPhase('malgoth_p3', (world, e) => {
    const f = world.floor, s = f.sanctum;
    e.immobile = false;
    if (s) {
      const spot = Entities.nearestFree(f, s.cx, s.cy - s.r + 2, BLINK_SEARCH_R);
      if (spot) blinkTo(world, e, spot);
    }
    e.immobile = true;
    for (let i = 0; i < 2; i++) {
      const side = i ? WING_X : -WING_X;
      const x = s ? s.cx + side : e.x;
      const y = s ? s.cy : e.y + 2;
      Monsters.spawn(world, 'hell_knight', x, y, { spawnedBy: e.id, noLoot: true, noXp: true });
    }
    world.events.push({ type: 'boss.wings', id: e.id });
  });
  reg('meteor_train', {
    start(world, e, m) {
      for (let i = 0; i < m.count; i++) {
        sched(world, i * METEOR_EVERY_MS, 'malgoth.meteor', { srcId: e.id, armMs: m.armMs, mult: m.mult });
      }
      return BD.sim.ai.windup(world, e, { kind: 'meteor_train', after: RECOVER_MS }, m.count * METEOR_EVERY_MS, false);
    },
    resolve: (world, e, act) => act.after,
  });
  BD.core.scheduler.register('malgoth.meteor', (world, pl) => {
    const e = Entities.get(world, pl.srcId), p = world.player;
    if (!e || e.dead) return;
    world.events.push({
      type: 'lob', srcId: e.id, fromX: e.x, fromY: e.y - METEOR_DROP_FROM, x: p.x, y: p.y, ms: pl.armMs, kind: 'meteor',
    });
    AiMoves().strike(world, e, AiMoves().circle(p.x, p.y, 1), pl.armMs, pl.mult, {
      element: 'fire', school: 'fire', cx: p.x, cy: p.y, kind: 'meteor',
      linger: { kind: 'burning_ground', durMs: METEOR_BURN_MS, amount: Monsters.avgDmg(world, e) * METEOR_BURN_MULT },
    });
  });
  reg('doom_beam', {
    start(world, e, m, ctx) {
      const s = world.floor.sanctum || { cx: e.x, cy: e.y };
      const a0 = Math.atan2(ctx.tgt.y - s.cy, ctx.tgt.x - s.cx);
      const dirn = world.rng.chance(0.5) ? 1 : -1;
      // a 1 s warning along the starting line, then the beam rotates 90°/s for 4 s
      const tiles = Grid.rayTiles(s.cx, s.cy, Math.cos(a0), Math.sin(a0), BEAM_LENGTH)
        .filter(([x, y]) => Entities.inBounds(world.floor, x, y));
      BD.sim.zones.create(world, {
        tiles, cx: s.cx, cy: s.cy, armMs: m.armMs,
        faction: 'monster', srcId: e.id, school: 'seal', resolve: null, kind: 'doom_warn', heavy: true,
      });
      for (let k = 0; k < BEAM_TICKS; k++) {
        const a = a0 + dirn * (Math.PI / 2) * (k / BEAM_TICKS_PER_QUARTER);
        sched(world, m.armMs + k * BEAM_TICK_MS, 'malgoth.beam', { srcId: e.id, cx: s.cx, cy: s.cy, a, mult: m.mult, k });
      }
      return BD.sim.ai.windup(world, e, { kind: 'doom_beam', after: HEAVY_RECOVER_MS }, m.armMs + BEAM_TICKS * BEAM_TICK_MS, false);
    },
    resolve: (world, e, act) => act.after,
  });
  BD.core.scheduler.register('malgoth.beam', (world, pl) => {
    const e = Entities.get(world, pl.srcId);
    if (!e || e.dead) return;
    const f = world.floor;
    const tiles = Grid.rayTiles(pl.cx, pl.cy, Math.cos(pl.a), Math.sin(pl.a), BEAM_LENGTH).filter(([x, y]) => Entities.inBounds(f, x, y));
    world.events.push({ type: 'beam', srcId: e.id, fromX: pl.cx, fromY: pl.cy, a: pl.a, len: BEAM_LENGTH });
    for (const v of BD.sim.zones.victims(world, { tiles, faction: 'monster' })) {
      v._beamT = v._beamT || -1e9;
      if (world.time - v._beamT < BEAM_HIT_EVERY_MS) continue;
      v._beamT = world.time;
      BD.sim.damage.dealDamage(world, {
        srcId: e.id, tgtId: v.id, amounts: { fire: Monsters.avgDmg(world, e) * pl.mult }, tags: ['zone', 'beam'],
        canCrit: false, canDodge: false, canBlock: false, mult: 1,
      });
    }
  });

  // ---------------- Ascension 10: a fourth phase at 15% ----------------
  BD.sim.damage.onHitHooks.push((world, src, tgt) => {
    if (tgt.rank !== 'malgoth' || world.run.ascension < ETERNAL_ASCENSION || tgt.hp <= 0) return;
    const st = Bosses.bossState(world, tgt);
    if (st.phase === 2 && tgt.hp <= BD.sim.stats.statsOf(world, tgt).maxLife * ETERNAL_AT && !st.fourth) {
      st.fourth = true;
      st.phase = 3;
      tgt.bossSpeed = ETERNAL_SPEED * (tgt.bossSpeed || 1);
      // cycles the moves of every phase, no adds
      st.allMoves = true;
      world.events.push({ type: 'boss.phase', id: tgt.id, phase: 4, name: 'Eternal', line: 'I AM ETERNAL!' });
      world.events.push({ type: 'announce', text: 'I AM ETERNAL!', style: 'boss' });
    }
  });

  BD.sim.world.addSystem('sanctum', system, 3);
})(globalThis.BD);
