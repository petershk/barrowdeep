// @ts-check
// Floor goals and persistence: the Keeper's Seal / Gate Key, Keeper pings, full-clear bonus, and
// floor deltas (a floor is its seed + saved changes; 06 §12).
(function (BD) {
  'use strict';

  const U = BD.core.util;
  const E = BD.sim.entities;
  const I = () => BD.sim.interact;

  // ---------------- Keeper → Seal / Gate Key ----------------
  BD.sim.damage.onKillHooks.push((world, e) => {
    if (!e.keeper) return;
    const f = world.floor, r = world.run;
    r.keepersSlain++;
    f.keeperId = null; f.keeperPing = null;
    const fl = BD.data.floors.byN(f.n);
    BD.sim.loot.dropAt(world, e.x, e.y, { kind: fl.actEnd ? 'key' : 'seal' });
    world.events.push({ type: 'keeper.dead', x: e.x, y: e.y, carries: fl.actEnd ? 'key' : 'seal' });
  });

  function onSealPickup(world, g) {
    const f = world.floor;
    if (g.kind === 'seal') {
      world.events.push({ type: 'seal.pickup', x: g.x, y: g.y });
      BD.sim.run.openSeal(world, true);
    } else {
      world.run.flags['key' + f.n] = true;
      world.events.push({ type: 'key.pickup', x: g.x, y: g.y });
      I().announce(world, 'key_pickup');
    }
  }

  function keeperSeen(world, e) {
    if (world.floor.keeperRevealed) return;
    world.floor.keeperRevealed = true;
    world.events.push({ type: 'keeper.reveal', id: e.id, name: e.name, x: e.x, y: e.y });
    world.events.push({ type: 'announce', text: BD.data.strings.t('keeper_reveal', { name: e.name }), style: 'keeper' });
  }

  /** per-step: Keeper ping after 6 min (3 with Wayfinder), exploration %, the countdown */
  function system(world) {
    const f = world.floor;
    if (f.keeperId) {
      const after = world.run.flags.wayfinder ? 180000 : 360000;
      if (f.timeOnFloor >= after) {
        const k = E.get(world, f.keeperId);
        if (k && !k.dead && (!f.keeperPing || (world.time % 2000) < 17)) {
          if (!f.keeperPing) world.events.push({ type: 'keeper.ping', x: k.x, y: k.y });
          f.keeperPing = { x: k.x, y: k.y };
        }
      }
    }
  }

  function onPlayerStep(world) {
    const f = world.floor;
    if (f.fullyExplored || f.key !== f.n || !f.reachableCount) return;
    if (f.seenCount >= f.reachableCount * 0.995) {
      f.fullyExplored = true;
      const xp = BD.sim.progression ? avgTrashXp(world) * BD.data.balance.xp.fullClearKills : 0;
      world.events.push({ type: 'floor.explored', n: f.n });
      world.events.push({ type: 'announce', text: BD.data.strings.t('floor_cleared'), style: 'level' });
      if (xp) BD.sim.progression.gainXp(world, world.player, xp, 'explore');
    }
  }
  function avgTrashXp(world) {
    const al = world.floor.al;
    return 10 * Math.pow(BD.data.balance.monsters.xpGrowth, al - 1) * BD.data.difficulties[world.run.difficulty].xp;
  }

  // ---------------- deltas ----------------
  /** snapshot the current floor's changes (06 §12 FloorDelta) */
  function snapshot(world) {
    const f = world.floor;
    const dead = [], survivors = [];
    const alive = new Set();
    for (const e of f.entities.values()) {
      if (e.runtime || e.kind !== 'monster') continue;
      if (e.rank === 'boss' || e.rank === 'malgoth') { alive.add(e.id); continue; }   // bosses reset unless slain
      alive.add(e.id);
      const max = BD.sim.stats.statsOf(world, e).maxLife;
      if (e.hp < max || e.x !== e.home.x || e.y !== e.home.y) survivors.push({ id: e.id, hp: e.hp, x: e.x, y: e.y, statuses: e.statuses.filter((s) => !BD.data.statuses[s.id].invuln) });
    }
    for (const id of f.genIds || []) if (!alive.has(id)) dead.push(id);
    return {
      explored: U.rleEncode(f.explored), seen: U.rleEncode(f.seen), deadIds: dead,
      objects: f.objects.map((o, i) => (o.opened || o.used || o.disarmed || o.visible ? { i, opened: !!o.opened, used: !!o.used, disarmed: !!o.disarmed, visible: !!o.visible } : null)).filter(Boolean),
      extraObjects: f.objects.filter((o) => o.runtime && o.kind !== 'portal').map((o) => U.clone(o)),
      droppedItems: f.items.map((g) => U.clone(g)), sealBroken: !!f.sealBroken, gateOpen: !!f.gateOpen, bossDead: !!f.bossDead,
      hidden: f.hidden.slice(), keeperRevealed: !!f.keeperRevealed, fullyExplored: !!f.fullyExplored, timeOnFloor: f.timeOnFloor,
      event: f.event ? U.clone(f.event) : null, survivors,
    };
  }
  function leave(world) {
    const f = world.floor;
    if (!f || f.key == null) return;
    if (BD.sim.events) BD.sim.events.onLeave(world);
    world.floorDeltas[f.key] = snapshot(world);
  }
  /** apply a saved delta to a freshly generated floor */
  function restore(world, f) {
    f.genIds = Array.from(f.entities.keys());
    const d = world.floorDeltas[f.key];
    if (!d) return;
    const N = f.w * f.h;
    f.explored = U.rleDecode(d.explored, N); f.seen = U.rleDecode(d.seen, N);
    f.seenCount = 0; for (let i = 0; i < N; i++) if (f.seen[i]) f.seenCount++;
    for (const id of d.deadIds) { const e = f.entities.get(id); if (e) { E.vacate(f, e); f.entities.delete(id); if (e.keeper) f.keeperId = null; } }
    for (const s of d.survivors) {
      const e = f.entities.get(s.id);
      if (!e) continue;
      E.vacate(f, e);
      e.hp = s.hp; e.statuses = s.statuses || [];
      if (E.isFree(f, s.x, s.y)) { e.x = s.x; e.y = s.y; }
      E.occupy(f, e);
    }
    for (const o of d.objects) { const ob = f.objects[o.i]; if (ob) Object.assign(ob, { opened: o.opened, used: o.used, disarmed: o.disarmed, visible: o.visible }); }
    for (const o of d.extraObjects || []) f.objects.push(o);
    f.items = d.droppedItems.map((g) => U.clone(g));
    f.sealBroken = d.sealBroken; f.gateOpen = d.gateOpen; f.bossDead = d.bossDead;
    f.keeperRevealed = d.keeperRevealed; f.fullyExplored = d.fullyExplored; f.timeOnFloor = d.timeOnFloor || 0;
    if (d.hidden) {
      const keep = new Set(d.hidden);
      for (const k of f.hidden) if (!keep.has(k)) f.tiles[k] = BD.data.tiles.T.FLOOR;
      f.hidden = d.hidden.slice();
    }
    if (d.event) f.event = U.clone(d.event);
    if (f.bossDead) { for (const e of [...f.entities.values()]) if (e.rank === 'boss' || e.rank === 'malgoth') { E.vacate(f, e); f.entities.delete(e.id); } if (BD.sim.bossfight && f.arena) BD.sim.bossfight.placeExit(world); }
    f.exploreDirty = true;
  }

  BD.sim.floors = { onSealPickup, keeperSeen, system, onPlayerStep, snapshot, leave, restore };
  BD.sim.world.addSystem('floors', system, 50);
})(globalThis.BD);
