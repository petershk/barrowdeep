// @ts-check
// Mortis the Hollow King, Act II boss (04 §5.2): soul lance, bone prison, wraiths, and the split
// into twin shades that mirror each other's lances.
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
  const tele = BS.telegraph;
  const after = BS.after;
  const summon = BS.summon;

  // ---------------- Mortis ----------------
  reg('soul_lance', {
    start(world, e, m, ctx) {
      const t = ctx.tgt, st = BS.bossState(world, e);
      const tiles = G.rayTiles(e.x, e.y, t.x - e.x, t.y - e.y, m.length).filter(([x, y]) => E.inBounds(world.floor, x, y));
      const arm = m.armMs - (st.fastLance ? 400 : 0);
      st.fastLance = false;
      e.dir = dirOf(t.x - e.x, t.y - e.y);
      const z = MV().strike(world, e, tiles, arm, m.mult, {
        school: 'storm', cx: e.x, cy: e.y, kind: 'soul_lance', element: 'cold', tags: ['heavy'],
      });
      // a twin of the same boss mirrors the lance from its own position
      for (const o of world.floor.entities.values()) if (o !== e && o.def === e.def && !o.dead && o.ai) {
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
      const z = MV().strike(world, e, MV().cross(t.x, t.y, 1), m.armMs, m.mult, {
        school: 'bone', cx: t.x, cy: t.y, statuses: [{ id: 'rooted', durMs: m.rootMs }], kind: 'bone_prison',
      });
      return tele(world, e, [z], { kind: 'bone_prison', after: 300 }, Math.min(500, m.armMs));
    },
    resolve(world, e, act) { e.ai.zoneIds = null; return act.after; },
  });
  reg('wraith_call', {
    start(world, e, m) {
      const f = world.floor;
      const walls = [];
      const WALL = BD.data.tiles.T.WALL;
      for (let i = 0; i < 40 && walls.length < m.count; i++) {
        const x = world.rng.int(2, f.w - 3), y = world.rng.int(2, f.h - 3);
        const againstWall = f.tiles[y * f.w + x - 1] === WALL || f.tiles[(y - 1) * f.w + x] === WALL;
        if (E.isFree(f, x, y) && againstWall) walls.push([x, y]);
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
    const twin = MON.spawn(world, 'mortis', e.x + 2, e.y, {
      rank: 'boss', noLoot: true, noXp: true, spawnedBy: null, name: 'Hollow Shade',
    });
    if (twin) {
      twin.hp = half; twin.isShade = true; twin.shadeOf = e.id; twin.shadeMax = max; twin.runtime = true;
      twin.ai.woke = true;
      twin.ai.boss = {
        phase: 1, opened: true, last: 'soul_lance', cds: {}, orbs: 3,
        nextSpecial: world.time + 2500, nextCrush: world.time + 6000, nextSig: 1e12,
      };
      world.events.push({ type: 'boss.split', id: e.id, twin: twin.id, x: twin.x, y: twin.y });
    }
  });
  // killing one shade leaves the other Exposed for 3 s
  BD.sim.damage.onKillHooks.push((world, v) => {
    if (!v.isShade) return;
    for (const o of world.floor.entities.values()) if (o !== v && o.isShade && !o.dead && o.hp > 0) BD.sim.ai.makeExposed(world, o, 3000);
  });
})(globalThis.BD);
