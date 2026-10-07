// @ts-check
// Traps (04 §6): fair, telegraphed, no faction (they hit both sides). Visible as a scuff within
// 3 tiles (always on Pilgrim; 2 tiles at Ascension 7). Hold interact for 0.8 s to disarm.
(function (BD) {
  'use strict';

  const TD = () => BD.data.traps;
  const MV = () => BD.sim.ai_moves;
  const { within, cheb } = BD.core.util;

  /** "×" in 05 §2.5 = the average trash DMG at that AL */
  function trashDmg(world) {
    const al = world.floor.al;
    const r = BD.data.monsterRef.actRef(Math.min(4, Math.max(1, BD.data.floors.byN(world.floor.n || 1).act)));
    return r.dmg * Math.pow(BD.data.balance.monsters.dmgGrowth, al - 1) * BD.data.difficulties[world.run.difficulty].dmg;
  }

  function fire(world, o) {
    const d = TD()[o.trap], dmg = trashDmg(world);
    o.cooldown = world.time + 3000;
    world.events.push({ type: 'trap.trigger', trap: o.trap, x: o.x, y: o.y });
    let school = 'steel';
    if (o.trap === 'gas') school = 'poison';
    else if (o.trap === 'fire_vent') school = 'fire';
    const strike = (tiles, armMs, mult, statuses, linger) => BD.sim.zones.create(world, {
      tiles, cx: o.x, cy: o.y, armMs, faction: null, noFaction: true, srcId: null, school, kind: 'trap_' + o.trap,
      resolve: { type: 'packet', amounts: { [d.element]: dmg * mult }, statuses: statuses || [], linger: linger || null },
    });
    if (o.trap === 'spike') strike([[o.x, o.y]], d.armMs, d.mult);
    else if (o.trap === 'gas') strike(MV().circle(o.x, o.y, 1), d.armMs, d.mult, [{ id: 'poisoned', durMs: 4000 }]);
    else if (o.trap === 'fire_vent') {
      strike([[o.x, o.y]], d.armMs, d.mult, [], { kind: 'burning_ground', durMs: d.activeMs, amount: dmg * d.mult });
    } else if (o.trap === 'dart') {
      const line = BD.core.grid.rayTiles(o.x - o.dx * 4, o.y - o.dy * 4, o.dx, o.dy, 8)
        .filter(([x, y]) => BD.sim.entities.walkable(world.floor, x, y));
      for (let i = 0; i < d.darts; i++) {
        const dart = { x: o.x - o.dx * 4, y: o.y - o.dy * 4, dx: o.dx, dy: o.dy, amt: dmg * d.mult };
        BD.core.scheduler.after(world, d.armMs + i * 150, 'trap.dart', dart);
      }
      BD.sim.zones.create(world, {
        tiles: line, cx: o.x, cy: o.y, armMs: d.armMs, faction: null, srcId: null, school: 'steel', resolve: null, kind: 'dart_line',
      });
    }
  }
  BD.core.scheduler.register('trap.dart', (world, pl) => {
    BD.sim.projectiles.spawn(world, {
      kind: 'arrow', srcId: null, faction: 'trap',
      x: pl.x, y: pl.y, dx: pl.dx, dy: pl.dy, maxDist: 9, speed: 12,
      payload: { type: 'packet', amounts: { phys: pl.amt } },
    });
  });

  function system(world, dt) {
    const f = world.floor, p = world.player;
    if (!f.objects.length || p.dead) return;
    const range = world.run.difficulty === 'pilgrim' ? 99 : world.run.ascension >= 7 ? 2 : 3;
    for (const o of f.objects) {
      if (o.kind !== 'trap' || o.disarmed) continue;
      if (!o.visible && within(o.x, o.y, p.x, p.y, range) && f.visible[o.y * f.w + o.x]) {
        o.visible = true;
        world.events.push({ type: 'trap.reveal', x: o.x, y: o.y });
      }
      // disarming: stay adjacent and still for 0.8 s
      if (o.disarmUntil) {
        if (cheb(o.x, o.y, p.x, p.y) > 1 || p.move || p.attack) {
          o.disarmUntil = 0;
          world.events.push({ type: 'trap.disarm.fail', x: o.x, y: o.y });
        } else if (world.time >= o.disarmUntil) {
          o.disarmed = true; o.disarmUntil = 0;
          const g = BD.sim.loot.goldOf(world, f.al, 1);
          p.gold += g;
          BD.sim.progression.gainXp(world, p, 4 * Math.pow(1.12, f.al - 1), 'disarm');
          world.events.push({ type: 'trap.disarm', x: o.x, y: o.y, gold: g });
        }
        continue;
      }
      if (o.cooldown && world.time < o.cooldown) continue;
      if (o.trap === 'fire_vent') {
        // vents cycle while someone is near
        if (within(o.x, o.y, p.x, p.y, 8)) { o.cycle = (o.cycle || 0) + dt; if (o.cycle >= 2500) { o.cycle = 0; fire(world, o); } }
        continue;
      }
      if (o.trap === 'dart') {
        if ((o.dx && p.y === o.y && Math.abs(p.x - o.x) <= 3) || (o.dy && p.x === o.x && Math.abs(p.y - o.y) <= 3)) fire(world, o);
        continue;
      }
      // spike / gas: something steps on it
      const occ = f.occ[o.y * f.w + o.x];
      if (occ) fire(world, o);
    }
  }

  function startDisarm(world, o) {
    if (!o.visible || o.disarmed) return;
    o.disarmUntil = world.time + 800;
    world.events.push({ type: 'trap.disarm.start', x: o.x, y: o.y });
  }

  BD.sim.traps = { system, startDisarm, fire, trashDmg };
  BD.sim.world.addSystem('traps', system, 53);
})(globalThis.BD);
