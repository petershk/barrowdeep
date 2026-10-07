// @ts-check
// Malgoth (04 §5.5): three phases (ranged → centre with a burning rim → wings and the Doom Beam),
// plus a fourth at Ascension 10. The Sanctum seals when the player steps into the chamber.
(function (BD) {
  'use strict';

  const BS = BD.sim.bosses;
  const AI = () => BD.sim.ai;
  const MV = () => BD.sim.ai_moves;
  const MON = BD.sim.monsters;
  const E = BD.sim.entities;
  const G = BD.core.grid;
  const { dirOf, within } = BD.core.util;
  const reg = BS.registerMove;
  const tele = (w, e, zs, act, ms) => BD.sim.bossMoves.telegraph(w, e, zs, act, ms);
  const sched = (world, ms, kind, pl) => BD.core.scheduler.after(world, ms, kind, pl);

  // ---------------- Sanctum flow: seal the threshold, countdown, wake ----------------
  function system(world) {
    const f = world.floor;
    if (!f.sanctum || f.sanctumStarted || f.bossDead) return;
    const p = world.player, s = f.sanctum;
    if (!within(p.x, p.y, s.cx, s.cy, s.r - 1)) return;
    f.sanctumStarted = true;
    for (const [x, y] of s.door) { if (!E.occupant(f, x, y)) f.tiles[y * f.w + x] = BD.data.tiles.T.WALL; }
    f.exploreDirty = true; f.blockVer = (f.blockVer || 0) + 1;
    world.events.push({ type: 'sanctum.seal' });
    world.run.countdownMs = BD.sim.bossfight.COUNTDOWN;
    world.run.countdownShown = 4;
    for (const e of f.entities.values()) if (e.rank === 'malgoth' && e.ai) { e.ai.state = 'idle'; e.ai.timer = 3100; e.ai.held = true; }
  }

  // ---------------- phase 1: ranged ----------------
  reg('fire_wave', {
    start(world, e, m) {
      // an expanding ring with one 2-tile gap, 1.2 s before it starts
      const gap = world.rng.range(0, Math.PI * 2);
      const steps = 9;
      for (let r = 1; r <= steps; r++) {
        const tiles = G.shapeOffsets('annulus', r).filter(([dx, dy]) => { let a = Math.atan2(dy, dx) - gap; a = Math.atan2(Math.sin(a), Math.cos(a)); return Math.abs(a) * r > 1.1; }).map(([dx, dy]) => [e.x + dx, e.y + dy]);
        sched(world, m.armMs - 400 + r * 110, 'boss.zone', { srcId: e.id, tiles, armMs: 400, mult: m.mult, school: 'fire', element: 'fire', kind: 'fire_wave' });
      }
      world.events.push({ type: 'boss.cast', id: e.id, move: 'fire_wave', x: e.x, y: e.y });
      return AI().windup(world, e, { kind: 'fire_wave', after: 600 }, m.armMs);
    },
    resolve: (world, e, act) => act.after,
  });
  reg('imp_call', {
    start(world, e, m) {
      if (!BD.sim.bossMoves2.summon(world, e, m.add, m.count, m.cap, null)) return null;
      return AI().windup(world, e, { kind: 'imp_call', after: 300 }, 600, false);
    },
    resolve: (world, e, act) => act.after,
  });

  // ---------------- phase 2: the burning rim ----------------
  BS.registerPhase('malgoth_p2', (world, e) => {
    const f = world.floor, s = f.sanctum;
    if (!s) return;
    const spot = E.nearestFree(f, s.cx, s.cy, 3);
    if (spot) { world.events.push({ type: 'blink', id: e.id, fromX: e.x, fromY: e.y, x: spot.x, y: spot.y }); BD.sim.movement.displace(world, e, spot.x, spot.y, 1, 'blink'); e.move = null; }
    const rim = [];
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
      const d2 = (x - s.cx) * (x - s.cx) + (y - s.cy) * (y - s.cy);
      if (d2 > (s.r - 2.5) * (s.r - 2.5) && d2 <= (s.r + 0.5) * (s.r + 0.5) && E.walkable(f, x, y)) rim.push([x, y]);
    }
    BD.sim.zones.ground(world, 'burning_ground', rim, { durMs: 1e9, faction: 'monster', srcId: e.id, amount: MON.avgDmg(world, e) * 0.5 });
    e.immobile = true;
  });
  reg('chaos_rain', {
    start(world, e, m, ctx) {
      const p = ctx.tgt;
      const wave = (k) => {
        const tiles = [];
        for (let i = 0; i < m.count; i++) {
          const x = (i === 0 ? p.x : p.x + world.rng.int(-4, 4)), y = (i === 0 ? p.y : p.y + world.rng.int(-4, 4));
          if (E.walkable(world.floor, x, y)) tiles.push([x, y]);
        }
        for (const t of tiles) sched(world, k * (m.armMs + 200), 'boss.zone', { srcId: e.id, tiles: [t], armMs: m.armMs, mult: m.mult, school: 'shadow', element: 'fire', kind: 'chaos_rain' });
      };
      wave(0); wave(1);
      return AI().windup(world, e, { kind: 'chaos_rain', exposedMs: m.exposedMs, heavy: true }, 2 * (m.armMs + 200));
    },
    resolve: () => 0,
  });
  reg('grasping_hands', {
    start(world, e, m, ctx) {
      const p = ctx.tgt, zs = [];
      for (const [dx, dy] of [[0, 0], [3, 1], [-3, -1]]) zs.push(MV().strike(world, e, MV().cross(p.x + dx, p.y + dy, 1), m.armMs, m.mult, { school: 'shadow', cx: p.x + dx, cy: p.y + dy, statuses: [{ id: 'rooted', durMs: m.rootMs }], kind: 'grasping_hands' }));
      return AI().windup(world, e, { kind: 'grasping_hands', after: 300 }, 500, false);
    },
    resolve: (world, e, act) => act.after,
  });
  reg('claw', {
    start(world, e, m, ctx) {
      const t = ctx.tgt;
      e.dir = dirOf(t.x - e.x, t.y - e.y);
      const tiles = G.shapeTiles({ shape: 'cone', length: 2, angle: 110 }, e.x, e.y, { x: t.x - e.x, y: t.y - e.y }, e.dir);
      const z = MV().strike(world, e, tiles, m.armMs, m.mult, { school: 'blood', cx: e.x, cy: e.y, kind: 'claw', tags: ['heavy'] });
      return tele(world, e, [z], { kind: 'claw', after: 400, heavy: true }, m.armMs);
    },
    resolve: (world, e, act) => act.after,
  });

  // ---------------- phase 3: wings, Meteor Train, Doom Beam ----------------
  BS.registerPhase('malgoth_p3', (world, e) => {
    const f = world.floor, s = f.sanctum;
    e.immobile = false;
    if (s) {
      const spot = E.nearestFree(f, s.cx, s.cy - s.r + 2, 3);
      if (spot) { world.events.push({ type: 'blink', id: e.id, fromX: e.x, fromY: e.y, x: spot.x, y: spot.y }); BD.sim.movement.displace(world, e, spot.x, spot.y, 1, 'blink'); e.move = null; }
    }
    e.immobile = true;
    for (let i = 0; i < 2; i++) MON.spawn(world, 'hell_knight', s ? s.cx + (i ? 3 : -3) : e.x, s ? s.cy : e.y + 2, { spawnedBy: e.id, noLoot: true, noXp: true });
    world.events.push({ type: 'boss.wings', id: e.id });
  });
  reg('meteor_train', {
    start(world, e, m) {
      for (let i = 0; i < m.count; i++) sched(world, i * 450, 'malgoth.meteor', { srcId: e.id, armMs: m.armMs, mult: m.mult });
      return AI().windup(world, e, { kind: 'meteor_train', after: 300 }, m.count * 450, false);
    },
    resolve: (world, e, act) => act.after,
  });
  BD.core.scheduler.register('malgoth.meteor', (world, pl) => {
    const e = E.get(world, pl.srcId), p = world.player;
    if (!e || e.dead) return;
    world.events.push({ type: 'lob', srcId: e.id, fromX: e.x, fromY: e.y - 6, x: p.x, y: p.y, ms: pl.armMs, kind: 'meteor' });
    MV().strike(world, e, MV().circle(p.x, p.y, 1), pl.armMs, pl.mult, { element: 'fire', school: 'fire', cx: p.x, cy: p.y, kind: 'meteor', linger: { kind: 'burning_ground', durMs: 2500, amount: MON.avgDmg(world, e) * 0.4 } });
  });
  reg('doom_beam', {
    start(world, e, m, ctx) {
      const s = world.floor.sanctum || { cx: e.x, cy: e.y };
      const a0 = Math.atan2(ctx.tgt.y - s.cy, ctx.tgt.x - s.cx);
      const dirn = world.rng.chance(0.5) ? 1 : -1;
      // a 1 s warning along the starting line, then the beam rotates 90°/s for 4 s
      const tiles = G.rayTiles(s.cx, s.cy, Math.cos(a0), Math.sin(a0), 13).filter(([x, y]) => E.inBounds(world.floor, x, y));
      BD.sim.zones.create(world, { tiles, cx: s.cx, cy: s.cy, armMs: m.armMs, faction: 'monster', srcId: e.id, school: 'seal', resolve: null, kind: 'doom_warn', heavy: true });
      for (let k = 0; k < 40; k++) sched(world, m.armMs + k * 100, 'malgoth.beam', { srcId: e.id, cx: s.cx, cy: s.cy, a: a0 + dirn * (Math.PI / 2) * (k / 10), mult: m.mult, k });
      return AI().windup(world, e, { kind: 'doom_beam', after: 400 }, m.armMs + 4000, false);
    },
    resolve: (world, e, act) => act.after,
  });
  BD.core.scheduler.register('malgoth.beam', (world, pl) => {
    const e = E.get(world, pl.srcId);
    if (!e || e.dead) return;
    const f = world.floor;
    const tiles = G.rayTiles(pl.cx, pl.cy, Math.cos(pl.a), Math.sin(pl.a), 13).filter(([x, y]) => E.inBounds(f, x, y));
    world.events.push({ type: 'beam', srcId: e.id, fromX: pl.cx, fromY: pl.cy, a: pl.a, len: 13 });
    for (const v of BD.sim.zones.victims(world, { tiles, faction: 'monster' })) {
      v._beamT = v._beamT || -1e9;
      if (world.time - v._beamT < 500) continue;
      v._beamT = world.time;
      BD.sim.damage.dealDamage(world, { srcId: e.id, tgtId: v.id, amounts: { fire: MON.avgDmg(world, e) * pl.mult }, tags: ['zone', 'beam'], canCrit: false, canDodge: false, canBlock: false, mult: 1 });
    }
  });

  // ---------------- Ascension 10: a fourth phase at 15% ----------------
  BD.sim.damage.onHitHooks.push((world, src, tgt) => {
    if (tgt.rank !== 'malgoth' || world.run.ascension < 10 || tgt.hp <= 0) return;
    const st = BS.bossState(world, tgt);
    if (st.phase === 2 && tgt.hp <= BD.sim.stats.statsOf(world, tgt).maxLife * 0.15 && !st.fourth) {
      st.fourth = true; st.phase = 3;
      tgt.bossSpeed = 1.25 * (tgt.bossSpeed || 1);
      // cycles the moves of every phase, no adds
      st.allMoves = true;
      world.events.push({ type: 'boss.phase', id: tgt.id, phase: 4, name: 'Eternal', line: 'I AM ETERNAL!' });
      world.events.push({ type: 'announce', text: 'I AM ETERNAL!', style: 'boss' });
    }
  });

  BD.sim.world.addSystem('sanctum', system, 3);
})(globalThis.BD);
