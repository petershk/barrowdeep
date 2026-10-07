// @ts-check
// World state: creation, floor instantiation and the fixed step. Systems are (world, dt) functions.
(function (BD) {
  'use strict';

  const { makeRng } = BD.core.rng;
  const Entities = BD.sim.entities;
  const SAVE_VERSION = 1;

  const ARENA_EXTRA_LIGHT = 8;        // boss arenas are lit beyond the light radius
  const IDS_PER_FLOOR = 10000;        // generated monsters get ids floor × this + index...
  const ARENA_ID_OFFSET = 5000;       // ...offset by this in a boss arena
  const FIRST_RUNTIME_ID = 1000000;   // ids handed out at runtime start here, clear of generated ones
  const PROP_CORPSE_LIFE = 20;        // max life a decorative corpse revives with
  const ARRIVAL_SEARCH_RADIUS = 8;    // how far to look for a free tile around the arrival point

  /** Build the runtime floor object from a generated plan. */
  function instantiateFloor(world, plan, key) {
    const N = plan.w * plan.h;
    const f = {
      key, n: plan.n, al: plan.al, biome: plan.biome, w: plan.w, h: plan.h, seed: plan.seed,
      tiles: plan.tiles, decor: plan.decor, hidden: plan.hidden.slice(), objects: plan.objects,
      rooms: plan.rooms, keeperRoom: plan.keeperRoom, upPos: plan.upPos, downPos: plan.downPos,
      waypointPos: plan.waypointPos, gatePos: plan.gatePos, spawnPos: plan.spawnPos, arena: plan.arena || null,
      portalPos: plan.portalPos || null, road: plan.road || null, decal: plan.decal || null, town: plan.town || null,
      explored: new Uint8Array(N), seen: new Uint8Array(N), visible: new Uint8Array(N), seenCount: 0,
      reachableCount: 0, occ: new Int32Array(N), block: new Uint8Array(N),
      entities: new Map(), items: [], zones: [], projectiles: [], corpses: [], allies: [],
      sealBroken: false, gateOpen: false, bossDead: false, keeperId: null, event: plan.event || null,
      reach: plan.reachDist || null, flow: null, flowFrom: -1, timeOnFloor: 0, fullyExplored: false, exploreDirty: true, extraLight: 0,
    };
    world.floor = f;
    if (plan.arena) f.extraLight = ARENA_EXTRA_LIGHT;
    for (let i = 0; i < N; i++) if (plan.reachDist && plan.reachDist[i] >= 0 && BD.data.tiles.WALK[plan.tiles[i]]) f.reachableCount++;
    // generated monsters get stable ids n×10000 + index
    let gi = 0;
    const floorN = typeof plan.n === 'number' ? plan.n : 0;
    const base = floorN * IDS_PER_FLOOR + (plan.arena ? ARENA_ID_OFFSET : 0);
    for (const pack of plan.spawns) {
      for (const m of pack.members) {
        const id = base + gi++;
        if (BD.sim.monsters) {
          const e = BD.sim.monsters.create(world, f, id, m, pack);
          f.entities.set(id, e);
          Entities.occupy(f, e);
          if (m.keeper) {
            f.keeperId = id;
            f.hadKeeper = true;
          }
        }
      }
    }
    f._packMods = null;
    for (const e of f.entities.values()) BD.sim.stats.bump(e);
    for (const o of plan.objects) {
      if (o.kind !== 'corpse_prop') continue;
      f.corpses.push({
        id: world.nextId++, def: o.def, x: o.x, y: o.y, packId: null, rank: 'normal', maxLife: PROP_CORPSE_LIFE, ms: 1e9, prop: true,
      });
    }
    return f;
  }

  /**
   * @param {{seed:string, cls:string, name:string, difficulty?:string, background?:string, firstSkill?:string}} opts
   */
  function createWorld(opts) {
    const world = {
      version: SAVE_VERSION, time: 0, nextId: FIRST_RUNTIME_ID, nextSeq: 0,
      rng: makeRng(opts.seed + ':combat'), lootRng: makeRng(opts.seed + ':loot'),
      run: {
        seed: opts.seed, difficulty: opts.difficulty || 'penitent', ascension: opts.ascension || 0,
        floor: 0, deepestFloor: 0, act: 1, keepersSlain: 0, bossesSlain: 0, bossesKilled: [], bargainsUsed: 0,
        portal: null, waypoints: [], blessing: null, flags: {}, timeMs: 0, kills: 0, respecs: 0,
        countdownMs: 0, uidCounter: 0,
      },
      player: null, floor: null, floorDeltas: {}, scheduled: [], commandQueue: [], events: [],
      paused: false,
    };
    world.player = BD.sim.player ? BD.sim.player.create(world, opts) : Entities.makeEntity(1, 'player', opts.cls, 0, 0, { hp: 50 });
    return world;
  }

  /** Generate (or regenerate) a floor and place the player on it. */
  function enterFloor(world, key, arrive) {
    const T0 = world.floor;
    if (T0 && BD.sim.floors) BD.sim.floors.leave(world);
    BD.core.scheduler.dropFloorEvents(world);
    let plan;
    if (key === 'town') plan = BD.sim.gen.town.generate({ seed: world.run.seed });
    else if (typeof key === 'string' && key[0] === 'a') plan = BD.sim.gen.arena.generate({ n: Number(key.slice(1)), seed: world.run.seed });
    else {
      plan = BD.sim.gen.generateFloor({
        n: key, seed: world.run.seed, difficulty: world.run.difficulty, ascension: world.run.ascension || 0,
        unlocks: { champion_lore: !!world.run.flags.championLore },
      });
    }
    const f = instantiateFloor(world, plan, key);
    world.floor = f;
    if (BD.sim.floors) BD.sim.floors.restore(world, f);
    const p = world.player;
    const spot = arrive || plan.spawnPos;
    p.x = spot.x;
    p.y = spot.y;
    p.move = null;
    const free = Entities.nearestFree(f, p.x, p.y, ARRIVAL_SEARCH_RADIUS) || spot;
    p.x = free.x;
    p.y = free.y;
    Entities.occupy(f, p);
    if (BD.sim.player) BD.sim.player.onFloorEnter(world);
    BD.sim.fov.refresh(world);
    world.events.push({ type: 'floor.enter', key, n: f.n, biome: f.biome });
    return f;
  }

  const SYSTEMS = [];
  /** Systems register in order; each is (world, dt) → void. */
  function addSystem(name, fn, order) {
    SYSTEMS.push({ name, fn, order });
    SYSTEMS.sort((a, b) => a.order - b.order);
  }

  /** One fixed step. */
  function step(world, dt) {
    if (!world.floor) return;
    world.time += dt;
    world.run.timeMs += dt;
    world.floor.timeOnFloor += dt;
    if (BD.sim.commands) BD.sim.commands.applyQueue(world);
    for (let i = 0; i < SYSTEMS.length; i++) SYSTEMS[i].fn(world, dt);
    BD.core.scheduler.runDue(world);
  }

  /** Hash of the gameplay-relevant state (tests: determinism, save round-trips). */
  function stateHash(world) {
    const Util = BD.core.util;
    const f = world.floor;
    const ents = [];
    for (const e of f.entities.values()) {
      const statuses = e.statuses.map((s) => s.id + ':' + Math.round(s.remainingMs)).join(',');
      ents.push([e.id, e.def, e.x, e.y, Math.round(e.hp * 100), statuses, e.ai ? e.ai.state : '']);
    }
    const p = world.player;
    return Util.hashOf({
      t: world.time, rng: world.rng.state(), loot: world.lootRng.state(), run: world.run,
      p: [p.x, p.y, Math.round(p.hp * 100), p.level, Math.round(p.xp), p.gold, p.attrs, p.skills, p.resources, p.statuses.map((s) => s.id)],
      ents, proj: f.projectiles.length, zones: f.zones.length, items: (f.items || []).map((i) => i.uid),
    });
  }

  BD.sim.world = { SAVE_VERSION, stateHash, createWorld, enterFloor, instantiateFloor, step, addSystem, SYSTEMS };
})(globalThis.BD);
