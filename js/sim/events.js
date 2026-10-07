// @ts-check
// Floor events at runtime (04 §4): Cursed Chest waves, Shrine choice, the Hoarder, the Trapped
// Vault (chest ≥ rare), the Blood Altar, the Restless Dead.
(function (BD) {
  'use strict';

  const E = BD.sim.entities;
  const MON = BD.sim.monsters;
  const AI = BD.sim.ai;
  const CMD = BD.sim.commands;
  const ED = () => BD.data.floorEvents;
  const { within, cheb } = BD.core.util;

  function actSpecies(world) {
    const act = Math.min(4, world.floor.n ? BD.data.floors.byN(world.floor.n).act : 1);
    return Object.values(BD.data.monsters).filter((m) => m.act === act && !m.spawner && !m.spawnOnly && m.role !== 'bomber');
  }
  function spawnWave(world, cx, cy, n, tag) {
    const sp = actSpecies(world);
    for (let i = 0; i < n; i++) {
      const def = world.rng.pick(sp).id;
      const e = MON.spawn(world, def, cx + world.rng.int(-3, 3), cy + world.rng.int(-3, 3), { eventId: tag, noLoot: true });
      if (e) e.eventId = tag;
    }
  }
  function reward(world, x, y, items, minRare) {
    for (let i = 0; i < items; i++) BD.sim.loot.dropAt(world, x, y, { kind: 'item', item: BD.sim.loot.rollItem(world, world.lootRng, { ilvl: world.floor.al + 1, min: i === 0 && minRare ? 'rare' : 'magic' }) });
  }

  // ---------------- Cursed Chest ----------------
  function cursedChest(world, o) {
    const f = world.floor, ev = f.event;
    if (!ev || ev.state !== 'idle') return;
    ev.state = 'active'; ev.wave = 0; ev.nextWave = world.time + 500; ev.endAt = world.time + ED().cursed_chest.waves * ED().cursed_chest.waveMs;
    // bar the room's exits
    const r = ev.room; ev.blocked = [];
    for (let x = r.x - 1; x <= r.x + r.w; x++) for (let y = r.y - 1; y <= r.y + r.h; y++) {
      if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) continue;
      if (E.walkable(f, x, y) && !E.occupant(f, x, y)) { f.block[y * f.w + x] = 1; ev.blocked.push([x, y]); }
    }
    f.blockVer = (f.blockVer || 0) + 1;
    world.events.push({ type: 'event.start', id: 'cursed_chest', x: o.x, y: o.y, tiles: ev.blocked });
    world.events.push({ type: 'announce', text: ED().cursed_chest.line, style: 'keeper' });
  }

  // ---------------- Shrine ----------------
  function shrine(world, o) {
    const f = world.floor;
    if (o.used) return;
    if (!o.offer) o.offer = world.lootRng.shuffle(BD.data.shrineBuffs.map((b) => b.id)).slice(0, 2);
    world.events.push({ type: 'shrine.offer', x: o.x, y: o.y, options: o.offer });
    void f;
  }
  CMD.register('ShrineChoose', (world, c) => {
    const o = world.floor.objects.find((x) => x.kind === 'shrine' && !x.used && cheb(x.x, x.y, world.player.x, world.player.y) <= 2);
    if (!o || !o.offer || !o.offer.includes(c.id)) return false;
    const b = BD.data.shrineBuffs.find((x) => x.id === c.id);
    o.used = true;
    BD.sim.status.apply(world, world.player, b.id, { durMs: 0, magnitude: b.magnitude });
    world.floor.shrineBuff = b.id;
    world.events.push({ type: 'event.complete', id: 'shrine', buff: b.id, x: o.x, y: o.y });
    return true;
  }, { ui: true });

  // ---------------- Blood Altar ----------------
  BD.sim.interact.registerObject('altar', (world, o) => {
    const p = world.player;
    if (o.used) return;
    o.used = true;
    const cost = Math.floor(p.hp * ED().blood_altar.lifePct);
    p.hp -= cost;
    world.events.push({ type: 'damage', srcId: null, tgtId: p.id, total: cost, parts: { phys: cost }, crit: false, blocked: false, tags: ['altar'], x: p.x, y: p.y });
    const it = BD.sim.loot.rollItem(world, world.lootRng, { ilvl: world.floor.al + 2, min: 'magic' });
    BD.sim.loot.dropAt(world, o.x, o.y, { kind: 'item', item: it });
    world.events.push({ type: 'event.complete', id: 'blood_altar', x: o.x, y: o.y });
  });

  // ---------------- the Hoarder ----------------
  AI.registerBehaviour('hoard', {
    decide(world, e, b, ctx) {
      const ev = world.floor.event;
      if (ev && ev.id === 'hoarder' && ev.state === 'idle') { ev.state = 'active'; ev.endAt = world.time + ED().hoarder.escapeMs; world.events.push({ type: 'announce', text: 'The Hoarder flees with its gold!', style: 'keeper' }); }
      if (world.rng.chance(0.25)) BD.sim.loot.dropAt(world, e.x, e.y, { kind: 'gold', amount: BD.sim.loot.goldOf(world, world.floor.al, 0.6) });
      const c = AI.stepAlong(world, e, BD.sim.pathing.chaseField(world), true);
      return c != null ? c : AI.chase(world, e, ctx.tgt) || 300;
    },
  });
  BD.sim.damage.onKillHooks.push((world, e) => {
    if (e.def !== 'hoarder') return;
    for (let i = 0; i < 6; i++) BD.sim.loot.dropAt(world, e.x, e.y, { kind: 'gold', amount: BD.sim.loot.goldOf(world, world.floor.al, 4) });
    reward(world, e.x, e.y, world.lootRng.int(1, 2), false);
    const ev = world.floor.event; if (ev) ev.state = 'done';
    world.events.push({ type: 'event.complete', id: 'hoarder', x: e.x, y: e.y });
  });

  // ---------------- per-step ----------------
  function system(world, dt) {
    const f = world.floor, ev = f.event;
    if (!ev || ev.state === 'done') return;
    const p = world.player;
    if (ev.id === 'cursed_chest' && ev.state === 'active') {
      if (world.time >= ev.nextWave && ev.wave < ED().cursed_chest.waves) {
        ev.wave++; ev.nextWave = world.time + ED().cursed_chest.waveMs;
        spawnWave(world, ev.x, ev.y, 3 + ev.wave, 'cursed');
        world.events.push({ type: 'event.wave', id: 'cursed_chest', n: ev.wave });
      }
      const alive = Array.from(f.entities.values()).some((e) => e.eventId === 'cursed' && !e.dead);
      if (ev.wave >= ED().cursed_chest.waves && !alive) {
        ev.state = 'done';
        for (const [x, y] of ev.blocked || []) f.block[y * f.w + x] = 0;
        f.blockVer = (f.blockVer || 0) + 1;
        reward(world, ev.x, ev.y, 2, true);
        world.events.push({ type: 'event.complete', id: 'cursed_chest', x: ev.x, y: ev.y });
      }
    } else if (ev.id === 'hoarder' && ev.state === 'active' && world.time >= ev.endAt) {
      for (const e of f.entities.values()) if (e.def === 'hoarder' && !e.dead) { E.vacate(f, e); f.entities.delete(e.id); world.events.push({ type: 'blink', id: e.id, fromX: e.x, fromY: e.y, x: e.x, y: e.y }); }
      ev.state = 'done';
      world.events.push({ type: 'announce', text: 'The Hoarder escapes.', style: 'keeper' });
    } else if (ev.id === 'restless_dead' && ev.tiles) {
      const inside = ev.tiles.some(([x, y]) => x === p.x && y === p.y) || within(p.x, p.y, ev.x, ev.y, 2);
      if (ev.state === 'idle' && inside) { ev.state = 'active'; ev.t = 0; ev.nextWave = 0; world.events.push({ type: 'announce', text: ED().restless_dead.line, style: 'keeper' }); }
      if (ev.state === 'active') {
        if (inside) {
          ev.t += dt;
          ev.nextWave -= dt;
          if (ev.nextWave <= 0) { ev.nextWave = ED().restless_dead.waveMs; spawnWave(world, ev.x, ev.y, 3, 'restless'); }
          if (ev.t >= ED().restless_dead.surviveMs) {
            ev.state = 'done';
            reward(world, ev.x, ev.y, 2, true);
            BD.sim.progression.gainXp(world, p, 10 * Math.pow(1.12, f.al - 1) * 8, 'event');
            world.events.push({ type: 'event.complete', id: 'restless_dead', x: ev.x, y: ev.y });
          }
        } else if (!within(p.x, p.y, ev.x, ev.y, 6)) { ev.state = 'idle'; }
      }
    }
  }

  /** leaving a floor ends floor-only shrine buffs */
  function onLeave(world) {
    for (const b of BD.data.shrineBuffs) BD.sim.status.remove(world, world.player, b.id);
  }

  BD.sim.events = { cursedChest, shrine, system, onLeave, spawnWave };
  BD.sim.world.addSystem('events', system, 52);
})(globalThis.BD);
