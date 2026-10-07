// @ts-check
// Traps (04 §6): fair, telegraphed, no faction (they hit both sides). Visible as a scuff within
// 3 tiles (always on Pilgrim; 2 tiles at Ascension 7). Hold interact for 0.8 s to disarm.
(function (BD) {
  'use strict';

  const TrapData = () => BD.data.traps;
  const AiMoves = () => BD.sim.ai_moves;
  const Grid = BD.core.grid;
  const { within, cheb } = BD.core.util;

  const LAST_ACT = 4;                // trap damage uses act 4 trash beyond act 4
  const REARM_MS = 3000;             // a trap that fired waits this long before it can fire again
  const GAS_POISON_MS = 4000;
  const DART_BACKOFF = 4;            // darts start this many tiles behind the trap...
  const DART_LINE_TILES = 8;         // ...the telegraphed lane is this long...
  const DART_GAP_MS = 150;           // ...successive darts leave this far apart...
  const DART_MAX_DIST = 9;           // ...and fly this far...
  const DART_SPEED = 12;             // ...at this speed (tiles per second)
  const DART_TRIGGER_RANGE = 3;      // a dart trap fires when the player is in its lane this close
  const REVEAL_RANGE = 3;            // traps show as a scuff within this range...
  const REVEAL_RANGE_ASCENDED = 2;   // ...this range from Ascension 7...
  const REVEAL_ASCENSION = 7;
  const REVEAL_RANGE_PILGRIM = 99;   // ...and always on Pilgrim
  const DISARM_MS = 800;             // hold interact this long (adjacent, still) to disarm
  const DISARM_XP = 4;               // disarm XP at AL 1...
  const DISARM_XP_GROWTH = 1.12;     // ...growing by this per AL
  const VENT_WAKE_RANGE = 8;         // fire vents cycle while the player is this close...
  const VENT_CYCLE_MS = 2500;        // ...firing this often

  /** "×" in 05 §2.5 = the average trash DMG at that AL */
  function trashDmg(world) {
    const al = world.floor.al;
    const r = BD.data.monsterRef.actRef(Math.min(LAST_ACT, Math.max(1, BD.data.floors.byN(world.floor.n || 1).act)));
    return r.dmg * Math.pow(BD.data.balance.monsters.dmgGrowth, al - 1) * BD.data.difficulties[world.run.difficulty].dmg;
  }

  function fire(world, o) {
    const d = TrapData()[o.trap], dmg = trashDmg(world);
    o.cooldown = world.time + REARM_MS;
    world.events.push({ type: 'trap.trigger', trap: o.trap, x: o.x, y: o.y });
    let school = 'steel';
    if (o.trap === 'gas') school = 'poison';
    else if (o.trap === 'fire_vent') school = 'fire';
    const strike = (tiles, armMs, mult, statuses, linger) => BD.sim.zones.create(world, {
      tiles, cx: o.x, cy: o.y, armMs, faction: null, noFaction: true, srcId: null, school, kind: 'trap_' + o.trap,
      resolve: { type: 'packet', amounts: { [d.element]: dmg * mult }, statuses: statuses || [], linger: linger || null },
    });
    if (o.trap === 'spike') strike([[o.x, o.y]], d.armMs, d.mult);
    else if (o.trap === 'gas') strike(AiMoves().circle(o.x, o.y, 1), d.armMs, d.mult, [{ id: 'poisoned', durMs: GAS_POISON_MS }]);
    else if (o.trap === 'fire_vent') {
      strike([[o.x, o.y]], d.armMs, d.mult, [], { kind: 'burning_ground', durMs: d.activeMs, amount: dmg * d.mult });
    } else if (o.trap === 'dart') {
      const line = Grid.rayTiles(o.x - o.dx * DART_BACKOFF, o.y - o.dy * DART_BACKOFF, o.dx, o.dy, DART_LINE_TILES)
        .filter(([x, y]) => BD.sim.entities.walkable(world.floor, x, y));
      for (let i = 0; i < d.darts; i++) {
        const dart = { x: o.x - o.dx * DART_BACKOFF, y: o.y - o.dy * DART_BACKOFF, dx: o.dx, dy: o.dy, amt: dmg * d.mult };
        BD.core.scheduler.after(world, d.armMs + i * DART_GAP_MS, 'trap.dart', dart);
      }
      BD.sim.zones.create(world, {
        tiles: line, cx: o.x, cy: o.y, armMs: d.armMs, faction: null, srcId: null, school: 'steel', resolve: null, kind: 'dart_line',
      });
    }
  }
  BD.core.scheduler.register('trap.dart', (world, pl) => {
    BD.sim.projectiles.spawn(world, {
      kind: 'arrow', srcId: null, faction: 'trap',
      x: pl.x, y: pl.y, dx: pl.dx, dy: pl.dy, maxDist: DART_MAX_DIST, speed: DART_SPEED,
      payload: { type: 'packet', amounts: { phys: pl.amt } },
    });
  });

  function revealRange(world) {
    if (world.run.difficulty === 'pilgrim') return REVEAL_RANGE_PILGRIM;
    return world.run.ascension >= REVEAL_ASCENSION ? REVEAL_RANGE_ASCENDED : REVEAL_RANGE;
  }

  function system(world, dt) {
    const f = world.floor, p = world.player;
    if (!f.objects.length || p.dead) return;
    const range = revealRange(world);
    for (const o of f.objects) {
      if (o.kind !== 'trap' || o.disarmed) continue;
      if (!o.visible && within(o.x, o.y, p.x, p.y, range) && f.visible[Grid.idx(f, o.x, o.y)]) {
        o.visible = true;
        world.events.push({ type: 'trap.reveal', x: o.x, y: o.y });
      }
      // disarming: stay adjacent and still for 0.8 s
      if (o.disarmUntil) {
        if (cheb(o.x, o.y, p.x, p.y) > 1 || p.move || p.attack) {
          o.disarmUntil = 0;
          world.events.push({ type: 'trap.disarm.fail', x: o.x, y: o.y });
        } else if (world.time >= o.disarmUntil) {
          o.disarmed = true;
          o.disarmUntil = 0;
          const g = BD.sim.loot.goldOf(world, f.al, 1);
          p.gold += g;
          BD.sim.progression.gainXp(world, p, DISARM_XP * Math.pow(DISARM_XP_GROWTH, f.al - 1), 'disarm');
          world.events.push({ type: 'trap.disarm', x: o.x, y: o.y, gold: g });
        }
        continue;
      }
      if (o.cooldown && world.time < o.cooldown) continue;
      if (o.trap === 'fire_vent') {
        // vents cycle while someone is near
        if (within(o.x, o.y, p.x, p.y, VENT_WAKE_RANGE)) tickVent(world, o, dt);
        continue;
      }
      if (o.trap === 'dart') {
        const inRow = o.dx && p.y === o.y && Math.abs(p.x - o.x) <= DART_TRIGGER_RANGE;
        const inColumn = o.dy && p.x === o.x && Math.abs(p.y - o.y) <= DART_TRIGGER_RANGE;
        if (inRow || inColumn) fire(world, o);
        continue;
      }
      // spike / gas: something steps on it
      const occ = f.occ[Grid.idx(f, o.x, o.y)];
      if (occ) fire(world, o);
    }
  }

  function tickVent(world, o, dt) {
    o.cycle = (o.cycle || 0) + dt;
    if (o.cycle >= VENT_CYCLE_MS) {
      o.cycle = 0;
      fire(world, o);
    }
  }

  function startDisarm(world, o) {
    if (!o.visible || o.disarmed) return;
    o.disarmUntil = world.time + DISARM_MS;
    world.events.push({ type: 'trap.disarm.start', x: o.x, y: o.y });
  }

  BD.sim.traps = { system, startDisarm, fire, trashDmg };
  BD.sim.world.addSystem('traps', system, 53);
})(globalThis.BD);
