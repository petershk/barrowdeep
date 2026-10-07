// @ts-check
// Floor events at runtime (04 §4): Cursed Chest waves, Shrine choice, the Hoarder, the Trapped
// Vault (chest ≥ rare), the Blood Altar, the Restless Dead.
(function (BD) {
  'use strict';

  const Entities = BD.sim.entities;
  const Monsters = BD.sim.monsters;
  const Ai = BD.sim.ai;
  const Commands = BD.sim.commands;
  const FloorEvents = () => BD.data.floorEvents;
  const { within, cheb } = BD.core.util;
  const Grid = BD.core.grid;

  const MonsterBalance = BD.data.balance.monsters;

  const LAST_ACT = BD.data.floors.LAST_ACT;
  const WAVE_SCATTER = 3;              // un-roomed waves land within ±this many tiles of the centre
  const WAVE_MIN_PLAYER_DIST = 2;      // roomed waves never land right next to the player
  const FIRST_WAVE_DELAY_MS = 500;
  const BARS_FAILSAFE_MS = 30000;      // bars lift this long after the last wave even if a straggler lives
  const SHRINE_REACH = 2;
  const HOARDER_RETRY_MS = 300;
  const RESTLESS_ENTER_RADIUS = 2;     // standing this close to the grave counts as inside
  const RESTLESS_LEAVE_RADIUS = 6;     // walking this far away resets the event

  function actSpecies(world, barred) {
    const act = Math.min(LAST_ACT, world.floor.n ? BD.data.floors.byN(world.floor.n).act : 1);
    // a barred room can't hold monsters that blink or phase out of it (the event would never end)
    const leaves = (m) => (m.behaviours || []).some((b) => /blink|teleport|phase|burrow/.test(b.id));
    const fits = (m) => m.act === act && !m.spawner && !m.spawnOnly && m.role !== 'bomber' && !(barred && leaves(m));
    return Object.values(BD.data.monsters).filter(fits);
  }
  /** spawn a wave; with a room, every monster lands inside it (the doors may be barred) */
  function spawnWave(world, cx, cy, n, tag, room) {
    const sp = actSpecies(world, !!room), f = world.floor;
    for (let i = 0; i < n; i++) {
      const def = world.rng.pick(sp).id;
      let x = cx + world.rng.int(-WAVE_SCATTER, WAVE_SCATTER), y = cy + world.rng.int(-WAVE_SCATTER, WAVE_SCATTER);
      if (room) {
        const free = freeTilesIn(world, f, room);
        if (!free.length) return;
        [x, y] = world.rng.pick(free);
      }
      const e = Monsters.spawn(world, def, x, y, { eventId: tag, noLoot: true });
      if (e) e.eventId = tag;
    }
  }
  function freeTilesIn(world, f, room) {
    const free = [];
    for (let yy = room.y; yy < room.y + room.h; yy++) {
      for (let xx = room.x; xx < room.x + room.w; xx++) {
        if (Entities.isFree(f, xx, yy) && cheb(xx, yy, world.player.x, world.player.y) >= WAVE_MIN_PLAYER_DIST) free.push([xx, yy]);
      }
    }
    return free;
  }
  function reward(world, x, y, items, minRare) {
    for (let i = 0; i < items; i++) {
      const min = i === 0 && minRare ? 'rare' : 'magic';
      const item = BD.sim.loot.rollItem(world, world.lootRng, { ilvl: world.floor.al + BD.data.eventRewardIlvlBonus, min });
      BD.sim.loot.dropAt(world, x, y, { kind: 'item', item });
    }
  }

  // ---------------- Cursed Chest ----------------
  function cursedChest(world, o) {
    const f = world.floor, ev = f.event;
    if (!ev || ev.state !== 'idle') return;
    ev.state = 'active';
    ev.wave = 0;
    ev.nextWave = world.time + FIRST_WAVE_DELAY_MS;
    ev.endAt = world.time + FloorEvents().cursed_chest.waves * FloorEvents().cursed_chest.waveMs;
    // bar the room's exits
    const r = ev.room;
    ev.blocked = [];
    for (let x = r.x - 1; x <= r.x + r.w; x++) {
      for (let y = r.y - 1; y <= r.y + r.h; y++) {
        if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) continue;
        if (Entities.walkable(f, x, y) && !Entities.occupant(f, x, y)) {
          f.block[Grid.idx(f, x, y)] = 1;
          ev.blocked.push([x, y]);
        }
      }
    }
    f.blockVer = (f.blockVer || 0) + 1;
    world.events.push({ type: 'event.start', id: 'cursed_chest', x: o.x, y: o.y, tiles: ev.blocked });
    world.events.push({ type: 'announce', text: FloorEvents().cursed_chest.line, style: 'keeper' });
  }

  // ---------------- Shrine ----------------
  function shrine(world, o) {
    if (o.used) return;
    if (!o.offer) o.offer = world.lootRng.shuffle(BD.data.shrineBuffs.map((b) => b.id)).slice(0, FloorEvents().shrine.options);
    world.events.push({ type: 'shrine.offer', x: o.x, y: o.y, options: o.offer });
  }
  Commands.register('ShrineChoose', (world, c) => {
    const p = world.player;
    const o = world.floor.objects.find((x) => x.kind === 'shrine' && !x.used && cheb(x.x, x.y, p.x, p.y) <= SHRINE_REACH);
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
    const cost = Math.floor(p.hp * FloorEvents().blood_altar.lifePct);
    p.hp -= cost;
    world.events.push({
      type: 'damage', srcId: null, tgtId: p.id, total: cost, parts: { phys: cost },
      crit: false, blocked: false, tags: ['altar'], x: p.x, y: p.y,
    });
    const it = BD.sim.loot.rollItem(world, world.lootRng, { ilvl: world.floor.al + FloorEvents().blood_altar.ilvlBonus, min: 'magic' });
    BD.sim.loot.dropAt(world, o.x, o.y, { kind: 'item', item: it });
    world.events.push({ type: 'event.complete', id: 'blood_altar', x: o.x, y: o.y });
  });

  // ---------------- the Hoarder ----------------
  Ai.registerBehaviour('hoard', {
    decide(world, e, b, ctx) {
      const ev = world.floor.event, d = FloorEvents().hoarder;
      if (ev && ev.id === 'hoarder' && ev.state === 'idle') {
        ev.state = 'active';
        ev.endAt = world.time + d.escapeMs;
        world.events.push({ type: 'announce', text: 'The Hoarder flees with its gold!', style: 'keeper' });
      }
      if (world.rng.chance(d.dropChance)) {
        BD.sim.loot.dropAt(world, e.x, e.y, { kind: 'gold', amount: BD.sim.loot.goldOf(world, world.floor.al, d.dropGold) });
      }
      const c = Ai.stepAlong(world, e, BD.sim.pathing.chaseField(world), true);
      return c != null ? c : Ai.chase(world, e, ctx.tgt) || HOARDER_RETRY_MS;
    },
  });
  BD.sim.damage.onKillHooks.push((world, e) => {
    const d = FloorEvents().hoarder;
    if (e.def !== d.monster) return;
    for (let i = 0; i < d.deathPiles; i++) {
      BD.sim.loot.dropAt(world, e.x, e.y, { kind: 'gold', amount: BD.sim.loot.goldOf(world, world.floor.al, d.deathGold) });
    }
    reward(world, e.x, e.y, world.lootRng.int(1, 2), false);
    const ev = world.floor.event;
    if (ev) ev.state = 'done';
    world.events.push({ type: 'event.complete', id: 'hoarder', x: e.x, y: e.y });
  });

  // ---------------- per-step: one tick per event id ----------------
  function liftBars(f, ev) {
    for (const [x, y] of ev.blocked || []) f.block[Grid.idx(f, x, y)] = 0;
    f.blockVer = (f.blockVer || 0) + 1;
  }
  const TICK = {
    cursed_chest(world, ev) {
      if (ev.state !== 'active') return;
      const f = world.floor, d = FloorEvents().cursed_chest;
      if (world.time >= ev.nextWave && ev.wave < d.waves) {
        ev.wave++;
        ev.nextWave = world.time + d.waveMs;
        spawnWave(world, ev.x, ev.y, d.waveBase + ev.wave, 'cursed', ev.room);
        world.events.push({ type: 'event.wave', id: 'cursed_chest', n: ev.wave });
      }
      const alive = Array.from(f.entities.values()).some((e) => e.eventId === 'cursed' && !e.dead);
      // fail-safe: the bars lift 30 s after the last wave was due even if a straggler lives
      if (ev.wave >= d.waves && (!alive || world.time > ev.endAt + BARS_FAILSAFE_MS)) {
        ev.state = 'done';
        liftBars(f, ev);
        reward(world, ev.x, ev.y, d.rewardItems, true);
        world.events.push({ type: 'event.complete', id: 'cursed_chest', x: ev.x, y: ev.y });
      }
    },
    hoarder(world, ev) {
      if (ev.state !== 'active' || world.time < ev.endAt) return;
      for (const e of [...world.floor.entities.values()]) {
        if (e.def !== FloorEvents().hoarder.monster || e.dead) continue;
        Entities.remove(world, e);
        world.events.push({ type: 'blink', id: e.id, fromX: e.x, fromY: e.y, x: e.x, y: e.y });
      }
      ev.state = 'done';
      world.events.push({ type: 'announce', text: 'The Hoarder escapes.', style: 'keeper' });
    },
    restless_dead(world, ev, dt) {
      if (!ev.tiles) return;
      const p = world.player, d = FloorEvents().restless_dead;
      const inside = ev.tiles.some(([x, y]) => x === p.x && y === p.y) || within(p.x, p.y, ev.x, ev.y, RESTLESS_ENTER_RADIUS);
      if (ev.state === 'idle' && inside) {
        ev.state = 'active';
        ev.t = 0;
        ev.nextWave = 0;
        world.events.push({ type: 'announce', text: d.line, style: 'keeper' });
      }
      if (ev.state !== 'active') return;
      if (!inside) {
        if (!within(p.x, p.y, ev.x, ev.y, RESTLESS_LEAVE_RADIUS)) ev.state = 'idle';
        return;
      }
      ev.t += dt;
      ev.nextWave -= dt;
      if (ev.nextWave <= 0) {
        ev.nextWave = d.waveMs;
        spawnWave(world, ev.x, ev.y, d.waveSize, 'restless');
      }
      if (ev.t >= d.surviveMs) {
        ev.state = 'done';
        reward(world, ev.x, ev.y, d.rewardItems, true);
        // the xp of d.xpKills normal monsters at this AL (no difficulty multiplier)
        const xp = MonsterBalance.trashXpBase * Math.pow(MonsterBalance.xpGrowth, world.floor.al - 1) * d.xpKills;
        BD.sim.progression.gainXp(world, p, xp, 'event');
        world.events.push({ type: 'event.complete', id: 'restless_dead', x: ev.x, y: ev.y });
      }
    },
  };
  function system(world, dt) {
    const ev = world.floor.event;
    if (!ev || ev.state === 'done' || !TICK[ev.id]) return;
    TICK[ev.id](world, ev, dt);
  }

  /** leaving a floor ends floor-only shrine buffs */
  function onLeave(world) {
    for (const b of BD.data.shrineBuffs) BD.sim.status.remove(world, world.player, b.id);
  }

  BD.sim.events = { cursedChest, shrine, system, onLeave, spawnWave };
  BD.sim.world.addSystem('events', system, 52);
})(globalThis.BD);
