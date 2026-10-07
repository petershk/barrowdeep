// @ts-check
// Mortis the Hollow King, Act II boss (04 §5.2): soul lance, bone prison, wraiths, and the split
// into twin shades that mirror each other's lances.
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

  const RECOVER_MS = 300;             // pause after a move before the next decision
  const HEAVY_RECOVER_MS = 400;
  const FAST_LANCE_MS = 400;          // a lance right after a Hollow Step arms this much sooner
  const PRISON_MAX_WINDUP_MS = 500;   // he is free to act again after this even if the prison arms later
  const WRAITH_TRIES = 40;            // random tiles tried when looking for wall spots
  const WRAITH_EDGE = 2;              // keep wall spots this many tiles inside the map edge
  const WRAITH_WINDUP_MS = 600;
  const STEP_SEARCH_R = 3;            // Hollow Step lands within this many tiles of an anchor
  const STEP_MS = 600;                // Hollow Step costs this long and delays the next special as much
  const TWIN_OFFSET_X = 2;            // the shade appears this many tiles to his right
  const TWIN_FIRST_SPECIAL_MS = 2500;
  const TWIN_FIRST_CRUSH_MS = 6000;
  const NEVER_MS = 1e12;              // a timer that never fires
  const ORBS_ALL_DROPPED = 3;         // the twin starts past all three flask-orb thresholds, so drops none
  const LONE_SHADE_EXPOSED_MS = 3000;

  // ---------------- Mortis ----------------
  reg('soul_lance', {
    start(world, e, m, ctx) {
      const t = ctx.tgt, st = Bosses.bossState(world, e);
      const tiles = Grid.rayTiles(e.x, e.y, t.x - e.x, t.y - e.y, m.length).filter(([x, y]) => Entities.inBounds(world.floor, x, y));
      const arm = m.armMs - (st.fastLance ? FAST_LANCE_MS : 0);
      st.fastLance = false;
      e.dir = dirOf(t.x - e.x, t.y - e.y);
      const z = AiMoves().strike(world, e, tiles, arm, m.mult, {
        school: 'storm', cx: e.x, cy: e.y, kind: 'soul_lance', element: 'cold', tags: ['heavy'],
      });
      // a twin of the same boss mirrors the lance from its own position
      for (const o of world.floor.entities.values()) if (o !== e && o.def === e.def && !o.dead && o.ai) {
        const mt = Grid.rayTiles(o.x, o.y, t.x - o.x, t.y - o.y, m.length).filter(([x, y]) => Entities.inBounds(world.floor, x, y));
        AiMoves().strike(world, o, mt, arm, m.mult, { school: 'storm', cx: o.x, cy: o.y, kind: 'soul_lance', element: 'cold' });
      }
      return tele(world, e, [z], { kind: 'soul_lance', heavy: true, after: HEAVY_RECOVER_MS }, arm);
    },
    resolve: after(HEAVY_RECOVER_MS),
  });
  reg('bone_prison', {
    start(world, e, m, ctx) {
      const t = ctx.tgt;
      const z = AiMoves().strike(world, e, AiMoves().cross(t.x, t.y, 1), m.armMs, m.mult, {
        school: 'bone', cx: t.x, cy: t.y, statuses: [{ id: 'rooted', durMs: m.rootMs }], kind: 'bone_prison',
      });
      return tele(world, e, [z], { kind: 'bone_prison', after: RECOVER_MS }, Math.min(PRISON_MAX_WINDUP_MS, m.armMs));
    },
    resolve(world, e, act) {
      e.ai.zoneIds = null;
      return act.after;
    },
  });
  reg('wraith_call', {
    start(world, e, m) {
      const f = world.floor;
      const walls = [];
      const WALL = BD.data.tiles.T.WALL;
      for (let i = 0; i < WRAITH_TRIES && walls.length < m.count; i++) {
        const x = world.rng.int(WRAITH_EDGE, f.w - 1 - WRAITH_EDGE), y = world.rng.int(WRAITH_EDGE, f.h - 1 - WRAITH_EDGE);
        const againstWall = f.tiles[Grid.idx(f, x - 1, y)] === WALL || f.tiles[Grid.idx(f, x, y - 1)] === WALL;
        if (Entities.isFree(f, x, y) && againstWall) walls.push([x, y]);
      }
      if (!summon(world, e, m.add, m.count, m.cap, walls.length ? walls : null)) return null;
      return BD.sim.ai.windup(world, e, { kind: 'wraith_call', after: RECOVER_MS }, WRAITH_WINDUP_MS, false);
    },
    resolve: after(RECOVER_MS),
  });
  reg('hollow_step', {
    start(world, e) {
      const f = world.floor, anchors = (f.arena && f.arena.anchors) || [[e.home.x, e.home.y]];
      const [ax, ay] = world.rng.pick(anchors);
      const spot = Entities.nearestFree(f, ax, ay, STEP_SEARCH_R);
      if (!spot) return null;
      world.events.push({ type: 'blink', id: e.id, fromX: e.x, fromY: e.y, x: spot.x, y: spot.y });
      BD.sim.movement.displace(world, e, spot.x, spot.y, 1, 'blink');
      e.move = null;
      Bosses.bossState(world, e).fastLance = true;
      Bosses.bossState(world, e).nextSpecial = world.time + STEP_MS;
      return STEP_MS;
    },
  });
  Bosses.registerPhase('split_shades', (world, e) => {
    const max = BD.sim.stats.statsOf(world, e).maxLife;
    const half = Math.max(1, Math.floor(e.hp / 2));
    e.hp = half;
    e.isShade = true;
    e.shadeMax = max;
    const twin = Monsters.spawn(world, 'mortis', e.x + TWIN_OFFSET_X, e.y, {
      rank: 'boss', noLoot: true, noXp: true, spawnedBy: null, name: 'Hollow Shade',
    });
    if (twin) {
      twin.hp = half;
      twin.isShade = true;
      twin.shadeOf = e.id;
      twin.shadeMax = max;
      twin.runtime = true;
      twin.ai.woke = true;
      twin.ai.boss = {
        phase: 1, opened: true, last: 'soul_lance', cds: {}, orbs: ORBS_ALL_DROPPED,
        nextSpecial: world.time + TWIN_FIRST_SPECIAL_MS, nextCrush: world.time + TWIN_FIRST_CRUSH_MS, nextSig: NEVER_MS,
      };
      world.events.push({ type: 'boss.split', id: e.id, twin: twin.id, x: twin.x, y: twin.y });
    }
  });
  // killing one shade leaves the other Exposed for 3 s
  BD.sim.damage.onKillHooks.push((world, v) => {
    if (!v.isShade) return;
    for (const o of world.floor.entities.values()) {
      if (o !== v && o.isShade && !o.dead && o.hp > 0) BD.sim.ai.makeExposed(world, o, LONE_SHADE_EXPOSED_MS);
    }
  });
})(globalThis.BD);
