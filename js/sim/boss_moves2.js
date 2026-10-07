// @ts-check
// Act II–IV bosses (04 §5.2–5.4): Mortis the Hollow King, Mygra the Brood Mother, Hakthul the
// Dread Knight. Every move telegraphs through zones and returns its cost.
(function (BD) {
  'use strict';

  const BS = BD.sim.bosses;
  const AI = () => BD.sim.ai;
  const MV = () => BD.sim.ai_moves;
  const MON = BD.sim.monsters;
  const E = BD.sim.entities;
  const G = BD.core.grid;
  const { dirOf } = BD.core.util;
  const reg = BS.registerMove;
  const tele = (w, e, zs, act, ms) => BD.sim.bossMoves.telegraph(w, e, zs, act, ms);
  const after = (ms) => (world, e, act) => act.after || ms;

  function summon(world, e, def, count, cap, from) {
    const room = Math.min(cap, BD.sim.monsters.defOf(e).summonCap || 6) - BS.addsOf(world, e);
    let n = 0;
    for (let i = 0; i < Math.min(count, room); i++) {
      const at = from ? from[i % from.length] : [e.x + world.rng.int(-3, 3), e.y + world.rng.int(-3, 3)];
      if (MON.spawn(world, def, at[0], at[1], { spawnedBy: e.id, noLoot: true, noXp: true, packId: e.packId })) n++;
    }
    if (n) world.events.push({ type: 'boss.summon', id: e.id, x: e.x, y: e.y });
    return n;
  }

  // ---------------- Mortis ----------------
  reg('soul_lance', {
    start(world, e, m, ctx) {
      const t = ctx.tgt, st = BS.bossState(world, e);
      const tiles = G.rayTiles(e.x, e.y, t.x - e.x, t.y - e.y, m.length).filter(([x, y]) => E.inBounds(world.floor, x, y));
      const arm = m.armMs - (st.fastLance ? 400 : 0);
      st.fastLance = false;
      e.dir = dirOf(t.x - e.x, t.y - e.y);
      const z = MV().strike(world, e, tiles, arm, m.mult, { school: 'storm', cx: e.x, cy: e.y, kind: 'soul_lance', element: 'cold', tags: ['heavy'] });
      // the twin shade mirrors the lance from its own position
      for (const o of world.floor.entities.values()) if (o !== e && o.def === 'mortis' && !o.dead && o.ai) {
        const mt = G.rayTiles(o.x, o.y, t.x - o.x, t.y - o.y, m.length).filter(([x, y]) => E.inBounds(world.floor, x, y));
        MV().strike(world, o, mt, arm, m.mult, { school: 'storm', cx: o.x, cy: o.y, kind: 'soul_lance', element: 'cold' });
      }
      return tele(world, e, [z], { kind: 'soul_lance', heavy: true, after: 400 }, arm);
    },
    resolve: after(400),
  });
  reg('bone_prison', {
    start(world, e, m, ctx) {
      const t = ctx.tgt;
      const z = MV().strike(world, e, MV().cross(t.x, t.y, 1), m.armMs, m.mult, { school: 'bone', cx: t.x, cy: t.y, statuses: [{ id: 'rooted', durMs: m.rootMs }], kind: 'bone_prison' });
      return tele(world, e, [z], { kind: 'bone_prison', after: 300 }, Math.min(500, m.armMs));
    },
    resolve(world, e, act) { e.ai.zoneIds = null; return act.after; },
  });
  reg('wraith_call', {
    start(world, e, m) {
      const f = world.floor;
      const walls = [];
      for (let i = 0; i < 40 && walls.length < m.count; i++) {
        const x = world.rng.int(2, f.w - 3), y = world.rng.int(2, f.h - 3);
        if (E.isFree(f, x, y) && (f.tiles[y * f.w + x - 1] === BD.data.tiles.T.WALL || f.tiles[(y - 1) * f.w + x] === BD.data.tiles.T.WALL)) walls.push([x, y]);
      }
      if (!summon(world, e, m.add, m.count, m.cap, walls.length ? walls : null)) return null;
      return AI().windup(world, e, { kind: 'wraith_call', after: 300 }, 600, false);
    },
    resolve: after(300),
  });
  reg('hollow_step', {
    start(world, e) {
      const f = world.floor, anchors = (f.arena && f.arena.anchors) || [[e.home.x, e.home.y]];
      const [ax, ay] = world.rng.pick(anchors);
      const spot = E.nearestFree(f, ax, ay, 3);
      if (!spot) return null;
      world.events.push({ type: 'blink', id: e.id, fromX: e.x, fromY: e.y, x: spot.x, y: spot.y });
      BD.sim.movement.displace(world, e, spot.x, spot.y, 1, 'blink');
      e.move = null;
      BS.bossState(world, e).fastLance = true;
      BS.bossState(world, e).nextSpecial = world.time + 600;
      return 600;
    },
  });
  BS.registerPhase('split_shades', (world, e) => {
    const max = BD.sim.stats.statsOf(world, e).maxLife;
    const half = Math.max(1, Math.floor(e.hp / 2));
    e.hp = half; e.isShade = true; e.shadeMax = max;
    const twin = MON.spawn(world, 'mortis', e.x + 2, e.y, { rank: 'boss', noLoot: true, noXp: true, spawnedBy: null, name: 'Hollow Shade' });
    if (twin) {
      twin.hp = half; twin.isShade = true; twin.shadeOf = e.id; twin.shadeMax = max; twin.runtime = true;
      twin.ai.woke = true; twin.ai.boss = { phase: 1, opened: true, last: 'soul_lance', cds: {}, orbs: 3, nextSpecial: world.time + 2500, nextCrush: world.time + 6000, nextSig: 1e12 };
      world.events.push({ type: 'boss.split', id: e.id, twin: twin.id, x: twin.x, y: twin.y });
    }
  });
  // killing one shade leaves the other Exposed for 3 s
  BD.sim.damage.onKillHooks.push((world, v) => {
    if (!v.isShade) return;
    for (const o of world.floor.entities.values()) if (o !== v && o.isShade && !o.dead && o.hp > 0) BD.sim.ai.makeExposed(world, o, 3000);
  });

  // ---------------- Mygra ----------------
  reg('venom_spit', {
    start(world, e, m, ctx) {
      const t = ctx.tgt, zs = [];
      const spots = [[t.x, t.y], [t.x + world.rng.int(-2, 2), t.y + world.rng.int(-2, 2)], [t.x + world.rng.int(-2, 2), t.y + world.rng.int(-2, 2)]].slice(0, m.count);
      for (const [x, y] of spots) {
        world.events.push({ type: 'lob', srcId: e.id, fromX: e.x, fromY: e.y, x, y, ms: m.armMs, kind: 'venom' });
        zs.push(MV().strike(world, e, MV().circle(x, y, 1), m.armMs, m.mult, { element: 'pois', school: 'poison', cx: x, cy: y, kind: 'venom_spit', statuses: [{ id: 'poisoned', durMs: 4000 }], linger: { kind: 'poison_pool', durMs: 4000, amount: MON.avgDmg(world, e) * 0.3 } }));
      }
      return AI().windup(world, e, { kind: 'venom_spit', after: 300 }, 500, false);
    },
    resolve: after(300),
  });
  reg('web_spray', {
    start(world, e, m, ctx) {
      const t = ctx.tgt;
      e.dir = dirOf(t.x - e.x, t.y - e.y);
      const tiles = G.shapeTiles({ shape: 'cone', length: m.length, angle: 90 }, e.x, e.y, { x: t.x - e.x, y: t.y - e.y }, e.dir);
      const z = MV().strike(world, e, tiles, m.armMs, 0.0001, { school: 'bone', cx: e.x, cy: e.y, kind: 'web_spray', statuses: [{ id: 'slowed', durMs: 2000, mag: 0.6 }] });
      return tele(world, e, [z], { kind: 'web_spray', after: 300 }, m.armMs);
    },
    resolve: after(300),
  });
  reg('burrow_strike', {
    start(world, e, m) {
      e.untargetable = true;
      E.vacate(world.floor, e);
      world.events.push({ type: 'burrow', id: e.id, x: e.x, y: e.y });
      return AI().windup(world, e, { kind: 'burrow_strike', stage: 0, m }, 700, false);
    },
    resolve(world, e, act) {
      const p = world.player;
      if (act.stage === 0) {
        const z = MV().strike(world, e, MV().circle(p.x, p.y, 1), act.m.armMs, act.m.mult, { school: 'dust', cx: p.x, cy: p.y, kind: 'burrow_strike', tags: ['heavy'] });
        e.ai.state = 'windup'; e.ai.action = { kind: 'burrow_strike', stage: 1, m: act.m, x: p.x, y: p.y, exposedMs: act.m.exposedMs, heavy: true };
        e.ai.zoneIds = [z.id];
        return act.m.armMs;
      }
      e.untargetable = false;
      const spot = E.nearestFree(world.floor, act.x, act.y, 3) || { x: e.x, y: e.y };
      e.x = spot.x; e.y = spot.y; e.move = null;
      E.occupy(world.floor, e);
      world.events.push({ type: 'emerge', id: e.id, x: e.x, y: e.y, heavy: true });
      return 0;
    },
  });
  reg('brood', {
    start(world, e) {
      let n = 0;
      for (const o of world.floor.entities.values()) if (!o.dead && o.def === 'egg_clutch') { n += summon(world, e, 'cave_spider', 1, 4, [[o.x, o.y]]); world.events.push({ type: 'egg.hatch', x: o.x, y: o.y }); }
      if (!n) return null;
      return AI().windup(world, e, { kind: 'brood', after: 300 }, 500, false);
    },
    resolve: after(300),
  });
  BS.registerPhase('web_edges', (world) => {
    const f = world.floor, tiles = [];
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
      if (!E.walkable(f, x, y)) continue;
      let edge = false;
      for (const [dx, dy] of BD.core.util.DIRS) if (!E.walkable(f, x + dx * 2, y + dy * 2)) { edge = true; break; }
      if (edge) tiles.push([x, y]);
    }
    BD.sim.zones.ground(world, 'web', tiles, { durMs: 1e9, faction: 'monster' });
  });

  // ---------------- Hakthul ----------------
  reg('shield_charge', {
    start(world, e, m, ctx) {
      const t = ctx.tgt;
      const tiles = G.rayTiles(e.x, e.y, t.x - e.x, t.y - e.y, m.length);
      e.dir = dirOf(t.x - e.x, t.y - e.y);
      const z = BD.sim.zones.create(world, { tiles, cx: e.x, cy: e.y, armMs: m.armMs, faction: 'monster', srcId: e.id, school: 'blood', heavy: true, resolve: null, kind: 'charge_mark' });
      return tele(world, e, [z], { kind: 'shield_charge', tiles, m, again: !!m.twice }, m.armMs);
    },
    resolve(world, e, act) {
      const c = MV().chargeLine(world, e, act.tiles, act.m.mult, act.m.exposedMs);
      if (act.again && e.ai.state !== 'exposed') {
        // phase 2: a second charge straight away
        const p = world.player;
        const tiles = G.rayTiles(e.x, e.y, p.x - e.x, p.y - e.y, act.m.length);
        const z = BD.sim.zones.create(world, { tiles, cx: e.x, cy: e.y, armMs: act.m.armMs, faction: 'monster', srcId: e.id, school: 'blood', heavy: true, resolve: null, kind: 'charge_mark' });
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
      const z = MV().strike(world, e, MV().diamond(t.x, t.y, 1), m.armMs, m.mult, { element: 'fire', school: 'fire', cx: t.x, cy: t.y, kind: 'hellfire', linger: { kind: 'burning_ground', durMs: 3000, amount: MON.avgDmg(world, e) * 0.4 } });
      return tele(world, e, [z], { kind: 'hellfire', after: 300 }, Math.min(600, m.armMs));
    },
    resolve(world, e, act) { e.ai.zoneIds = null; return act.after; },
  });
  reg('cleaving_sweep', {
    start(world, e, m, ctx) {
      const t = ctx.tgt;
      e.dir = dirOf(t.x - e.x, t.y - e.y);
      const tiles = G.shapeTiles({ shape: 'cone', length: 2, angle: 120 }, e.x, e.y, { x: t.x - e.x, y: t.y - e.y }, e.dir);
      const z = MV().strike(world, e, tiles, m.armMs, m.mult, { school: 'blood', cx: e.x, cy: e.y, kind: 'cleaving_sweep', tags: ['heavy'] });
      return tele(world, e, [z], { kind: 'cleaving_sweep', after: 400, heavy: true }, m.armMs);
    },
    resolve: after(400),
  });
  reg('brand', {
    start(world, e, m, ctx) {
      const t = ctx.tgt;
      world.events.push({ type: 'brand', id: t.id, x: t.x, y: t.y });
      // the mark follows its target for 3 s, then the floor beneath erupts
      BD.sim.zones.create(world, { tiles: [[t.x, t.y]], cx: t.x, cy: t.y, armMs: m.armMs, faction: 'monster', srcId: e.id, school: 'lava', follow: t.id, kind: 'brand', heavy: true,
        resolve: { type: 'packet', amounts: { fire: MON.avgDmg(world, e) * m.mult }, linger: { kind: 'burning_ground', durMs: 3000, amount: MON.avgDmg(world, e) * 0.5 } } });
      return AI().windup(world, e, { kind: 'brand', after: 300 }, 500, false);
    },
    resolve: after(300),
  });
  BS.registerPhase('eruptions', (world, e) => { BS.bossState(world, e).eruptEvery = 2000; BS.bossState(world, e).nextErupt = world.time + 1500; });

  /** periodic phase effects (eruptions) */
  function system(world) {
    for (const e of world.floor.entities.values()) {
      const st = e.ai && e.ai.boss;
      if (!st || e.dead || !st.eruptEvery || world.time < st.nextErupt) continue;
      st.nextErupt = world.time + st.eruptEvery;
      const p = world.player;
      for (let i = 0; i < 4; i++) {
        const x = p.x + world.rng.int(-6, 6), y = p.y + world.rng.int(-6, 6);
        if (!E.walkable(world.floor, x, y)) continue;
        MV().strike(world, e, [[x, y]], 1000, 2.5, { element: 'fire', school: 'lava', cx: x, cy: y, kind: 'eruption' });
      }
    }
  }

  BD.sim.bossMoves2 = { summon, system };
  BD.sim.world.addSystem('bossPhases', system, 16);
})(globalThis.BD);
