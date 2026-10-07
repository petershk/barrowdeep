// @ts-check
// Malgoth (04 §5.5): three phases (ranged → centre with a burning rim → wings and the Doom Beam),
// plus a fourth at Ascension 10. The Sanctum seals when the player steps into the chamber.
(function (BD) {
  'use strict';

  const Bosses = BD.sim.bosses;
  const Ai = () => BD.sim.ai;
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
  const WAVE_RECOVER_MS = 600;
  const FOREVER_MS = 1e9;             // ground that lasts the whole fight
  const HANDS_OFFSETS = [[0, 0], [3, 1], [-3, -1]];  // grasping hands around the player
  const WING_X = 3;                   // the wing adds flank the chamber centre this far out
  const METEOR_DROP_FROM = 6;         // tiles above Malgoth the meteors are lobbed from
  const Eternal = BD.data.ascension.eternal;   // Ascension 10: the fourth phase (life fraction, speed)

  /** the boss's kit entry for a move (scheduled strikes read their numbers from it) */
  function kitEntry(e, move) {
    return Monsters.defOf(e).kit.find((k) => k.move === move);
  }

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
      // expanding rings with one gap, starting armMs after the cast
      const gap = world.rng.range(0, Math.PI * 2);
      for (let r = 1; r <= m.rings; r++) {
        const outsideGap = ([dx, dy]) => {
          let a = Math.atan2(dy, dx) - gap;
          a = Math.atan2(Math.sin(a), Math.cos(a));
          return Math.abs(a) * r > m.gapHalfWidth;
        };
        const tiles = Grid.shapeOffsets('annulus', r).filter(outsideGap).map(([dx, dy]) => [e.x + dx, e.y + dy]);
        sched(world, m.armMs - m.ringArmMs + r * m.ringEveryMs, 'boss.zone', {
          srcId: e.id, tiles, armMs: m.ringArmMs, mult: m.mult, school: 'fire', element: 'fire', kind: 'fire_wave',
        });
      }
      world.events.push({ type: 'boss.cast', id: e.id, move: 'fire_wave', x: e.x, y: e.y });
      return Ai().windup(world, e, { kind: 'fire_wave', after: WAVE_RECOVER_MS }, m.armMs);
    },
    resolve: (world, e, act) => act.after,
  });
  reg('imp_call', {
    start(world, e, m) {
      if (!Bosses.summon(world, e, m.add, m.count, m.cap, null)) return null;
      return Ai().windup(world, e, { kind: 'imp_call', after: RECOVER_MS }, m.windupMs, false);
    },
    resolve: (world, e, act) => act.after,
  });

  // ---------------- phase 2: the burning rim ----------------
  Bosses.registerPhase('malgoth_p2', (world, e, d, st, ph) => {
    const f = world.floor, s = f.sanctum;
    if (!s) return;
    const spot = Entities.nearestFree(f, s.cx, s.cy, BLINK_SEARCH_R);
    if (spot) blinkTo(world, e, spot);
    const rim = [];
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
      const d2 = (x - s.cx) * (x - s.cx) + (y - s.cy) * (y - s.cy);
      if (d2 > (s.r - ph.rimDepth) * (s.r - ph.rimDepth) && d2 <= (s.r + 0.5) * (s.r + 0.5) && Entities.walkable(f, x, y)) rim.push([x, y]);
    }
    BD.sim.zones.ground(world, 'burning_ground', rim, {
      durMs: FOREVER_MS, faction: 'monster', srcId: e.id, amount: Monsters.avgDmg(world, e) * ph.rimBurnMult,
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
            x = p.x + world.rng.int(-m.scatter, m.scatter);
            y = p.y + world.rng.int(-m.scatter, m.scatter);
          }
          if (Entities.walkable(world.floor, x, y)) tiles.push([x, y]);
        }
        for (const t of tiles) {
          sched(world, k * (m.armMs + m.waveGapMs), 'boss.zone', {
            srcId: e.id, tiles: [t], armMs: m.armMs, mult: m.mult, school: 'shadow', element: 'fire', kind: 'chaos_rain',
          });
        }
      };
      for (let k = 0; k < m.waves; k++) wave(k);
      const windupMs = m.waves * (m.armMs + m.waveGapMs);
      return Ai().windup(world, e, { kind: 'chaos_rain', exposedMs: m.exposedMs, heavy: true }, windupMs);
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
      return Ai().windup(world, e, { kind: 'grasping_hands', after: RECOVER_MS }, m.windupMs, false);
    },
    resolve: (world, e, act) => act.after,
  });
  reg('claw', {
    start(world, e, m, ctx) {
      const t = ctx.tgt;
      e.dir = dirOf(t.x - e.x, t.y - e.y);
      const cone = { shape: 'cone', length: m.length, angle: m.angle };
      const tiles = Grid.shapeTiles(cone, e.x, e.y, { x: t.x - e.x, y: t.y - e.y }, e.dir);
      const z = AiMoves().strike(world, e, tiles, m.armMs, m.mult, { school: 'blood', cx: e.x, cy: e.y, kind: 'claw', tags: ['heavy'] });
      return tele(world, e, [z], { kind: 'claw', after: HEAVY_RECOVER_MS, heavy: true }, m.armMs);
    },
    resolve: (world, e, act) => act.after,
  });

  // ---------------- phase 3: wings, Meteor Train, Doom Beam ----------------
  Bosses.registerPhase('malgoth_p3', (world, e, d, st, ph) => {
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
      Monsters.spawn(world, ph.wingAdd, x, y, { spawnedBy: e.id, noLoot: true, noXp: true });
    }
    world.events.push({ type: 'boss.wings', id: e.id });
  });
  reg('meteor_train', {
    start(world, e, m) {
      for (let i = 0; i < m.count; i++) {
        sched(world, i * m.everyMs, 'malgoth.meteor', { srcId: e.id, armMs: m.armMs, mult: m.mult });
      }
      return Ai().windup(world, e, { kind: 'meteor_train', after: RECOVER_MS }, m.count * m.everyMs, false);
    },
    resolve: (world, e, act) => act.after,
  });
  BD.core.scheduler.register('malgoth.meteor', (world, pl) => {
    const e = Entities.get(world, pl.srcId), p = world.player;
    if (!e || e.dead) return;
    const m = kitEntry(e, 'meteor_train');
    world.events.push({
      type: 'lob', srcId: e.id, fromX: e.x, fromY: e.y - METEOR_DROP_FROM, x: p.x, y: p.y, ms: pl.armMs, kind: 'meteor',
    });
    AiMoves().strike(world, e, AiMoves().circle(p.x, p.y, 1), pl.armMs, pl.mult, {
      element: 'fire', school: 'fire', cx: p.x, cy: p.y, kind: 'meteor',
      linger: { kind: 'burning_ground', durMs: m.burnMs, amount: Monsters.avgDmg(world, e) * m.burnMult },
    });
  });
  reg('doom_beam', {
    start(world, e, m, ctx) {
      const s = world.floor.sanctum || { cx: e.x, cy: e.y };
      const a0 = Math.atan2(ctx.tgt.y - s.cy, ctx.tgt.x - s.cx);
      const dirn = world.rng.chance(0.5) ? 1 : -1;
      // an armMs warning along the starting line, then the beam rotates `ticks` steps
      const tiles = Grid.rayTiles(s.cx, s.cy, Math.cos(a0), Math.sin(a0), m.length)
        .filter(([x, y]) => Entities.inBounds(world.floor, x, y));
      BD.sim.zones.create(world, {
        tiles, cx: s.cx, cy: s.cy, armMs: m.armMs,
        faction: 'monster', srcId: e.id, school: 'seal', resolve: null, kind: 'doom_warn', heavy: true,
      });
      for (let k = 0; k < m.ticks; k++) {
        const a = a0 + dirn * (Math.PI / 2) * (k / m.ticksPerQuarter);
        sched(world, m.armMs + k * m.tickMs, 'malgoth.beam', { srcId: e.id, cx: s.cx, cy: s.cy, a, mult: m.mult, k });
      }
      return Ai().windup(world, e, { kind: 'doom_beam', after: HEAVY_RECOVER_MS }, m.armMs + m.ticks * m.tickMs, false);
    },
    resolve: (world, e, act) => act.after,
  });
  BD.core.scheduler.register('malgoth.beam', (world, pl) => {
    const e = Entities.get(world, pl.srcId);
    if (!e || e.dead) return;
    const f = world.floor;
    const m = kitEntry(e, 'doom_beam');
    const tiles = Grid.rayTiles(pl.cx, pl.cy, Math.cos(pl.a), Math.sin(pl.a), m.length).filter(([x, y]) => Entities.inBounds(f, x, y));
    world.events.push({ type: 'beam', srcId: e.id, fromX: pl.cx, fromY: pl.cy, a: pl.a, len: m.length });
    for (const v of BD.sim.zones.victims(world, { tiles, faction: 'monster' })) {
      v._beamT = v._beamT || -1e9;
      if (world.time - v._beamT < m.hitEveryMs) continue;
      v._beamT = world.time;
      BD.sim.damage.dealDamage(world, {
        srcId: e.id, tgtId: v.id, amounts: { fire: Monsters.avgDmg(world, e) * pl.mult }, tags: ['zone', 'beam'],
        canCrit: false, canDodge: false, canBlock: false, mult: 1,
      });
    }
  });

  // ---------------- Ascension 10: a fourth phase at 15% ----------------
  BD.sim.damage.onHitHooks.push((world, src, tgt) => {
    if (tgt.rank !== 'malgoth' || world.run.ascension < Eternal.level || tgt.hp <= 0) return;
    const st = Bosses.bossState(world, tgt);
    if (st.phase === 2 && tgt.hp <= BD.sim.stats.statsOf(world, tgt).maxLife * Eternal.atLife && !st.fourth) {
      st.fourth = true;
      st.phase = 3;
      tgt.bossSpeed = Eternal.speedMult * (tgt.bossSpeed || 1);
      // cycles the moves of every phase except the def's allMovesSkip (no adds)
      st.allMoves = true;
      const eternal = Monsters.defOf(tgt).eternal;
      world.events.push({ type: 'boss.phase', id: tgt.id, phase: 4, name: eternal.name, line: eternal.line });
      world.events.push({ type: 'announce', text: eternal.line, style: 'boss' });
    }
  });

  BD.sim.world.addSystem('sanctum', system, 3);
})(globalThis.BD);
