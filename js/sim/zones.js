// @ts-check
// One zone/telegraph system for boss moves, traps, Meteor, Blizzard, Rain of Arrows, champion
// death bursts and ground effects (06 §8.3). Telegraphed zones arm for armMs, resolve once, then
// optionally linger and tick every 500 ms. Zones affect the opposing faction (or everyone).
(function (BD) {
  'use strict';

  const Entities = BD.sim.entities;
  const ZoneData = () => BD.data.zones;
  const Abilities = () => BD.sim.abilities;
  const Grid = BD.core.grid;

  const DEFAULT_TICK_MS = 500;        // lingering zones tick this often unless their data says otherwise
  const DEFAULT_GROUND_MS = 3000;     // ground effects last this long unless the caller says otherwise
  const MIN_PACKET_DAMAGE = 0.01;     // a packet zone summing to less than this deals no damage
  const EXTRA_STATUS_MS = 1000;       // a ground def's `extra` status lasts this long per tick
  const BLEED_ONCE_MS = 4000;         // bleedOnce ground (caltrops): bleed duration
  const SPREAD_INTERVAL_MS = 1000;    // spreading ground grows one ring this often
  const DEFAULT_LOB_FLIGHT_MS = 600;  // a lobbed bomb is in the air this long

  /**
   * @param {any} z { tiles, armMs, faction, srcId, resolve?: payload, linger?: {kind, durMs, amount?}, telegraph?: bool, school?, label? }
   */
  function create(world, z) {
    const zone = Object.assign({
      id: world.nextId++, armMs: 0, armTotal: z.armMs || 0, durMs: 0, tickMs: DEFAULT_TICK_MS, tickLeft: DEFAULT_TICK_MS,
      faction: null, srcId: null,
      resolved: false, telegraph: z.armMs > 0, hitIds: [], kind: 'strike', follow: null,
    }, z);
    zone.armTotal = zone.armMs;
    world.floor.zones.push(zone);
    if (zone.armMs > 0 && zone.telegraph) {
      world.events.push({
        type: 'telegraph.start', zoneId: zone.id, srcId: zone.srcId, tiles: zone.tiles, ms: zone.armMs,
        friendly: zone.faction === 'player', school: zone.school || null, heavy: !!zone.heavy,
      });
    }
    return zone;
  }

  /** entities affected by a zone (on its tiles, opposing faction unless noFaction) */
  function victims(world, z) {
    const f = world.floor, out = [];
    for (const [x, y] of z.tiles) {
      if (x < 0 || y < 0 || x >= f.w || y >= f.h) continue;
      const id = f.occ[Grid.idx(f, x, y)];
      if (!id) continue;
      const e = Entities.get(world, id);
      if (!e || e.hp <= 0 || e.dead) continue;
      if (e.move && e.move.kind === 'leap') continue;           // airborne
      if (!z.noFaction && z.faction && e.faction === z.faction) continue;
      if (z.faction === 'monster' && e.faction === 'monster') continue;
      if (out.indexOf(e) < 0) out.push(e);
    }
    return out;
  }

  function resolve(world, z) {
    z.resolved = true;
    if (z.telegraph) world.events.push({ type: 'telegraph.end', zoneId: z.id });
    const p = z.resolve;
    world.events.push({
      type: 'zone.resolve', zoneId: z.id, tiles: z.tiles, cx: z.cx, cy: z.cy,
      school: z.school || null, kind: z.kind, heavy: !!z.heavy, srcId: z.srcId, label: z.label || null,
    });
    if (!p) return;
    if (p.type === 'ability') resolveAbility(world, z, p);
    else if (p.type === 'packet') resolvePacket(world, z, p);
  }

  /** a player/ally skill landing: the skill's own effects on everyone in the zone */
  function resolveAbility(world, z, p) {
    const caster = Entities.get(world, p.casterId);
    if (!caster || caster.dead) return;
    const ab = Abilities().resolved(Abilities().def(p.abilityId), p.rank, caster);
    const ctx = BD.sim.effects.baseCtx(world, caster, ab, p.rank, null);
    ctx.srcId = p.srcId != null ? p.srcId : caster.id;
    ctx.combo = p.combo || 0;
    ctx.focus = p.focus || 0;
    ctx.packetMult = p.mult || 1;
    ctx.aoe = true;
    ctx.cx = z.cx;
    ctx.cy = z.cy;
    ctx.centerId = null;
    const targets = victims(world, z);
    const res = BD.sim.hits.applyEffects(world, ctx, p.effects || ab.effects, targets);
    BD.sim.effects.special(world, caster, ab, p.rank, 'zoneResolve', { z, ctx, res });
    if (caster.kind === 'player' && !p.noAfter) BD.sim.effects.afterHits(world, caster, ab, p.rank, null, res);
    if (p.linger) startLinger(world, z, p.linger, res);
  }

  /** a ready damage packet (boss moves, traps, bursts) with optional statuses, knockback, linger, spawns */
  function resolvePacket(world, z, p) {
    let sum = 0;
    for (const k in p.amounts) sum += p.amounts[k];
    if (sum > MIN_PACKET_DAMAGE || (p.statuses && p.statuses.length)) {
      for (const e of victims(world, z)) hitWithPacket(world, z, p, e, sum);
    }
    if (p.linger) startLinger(world, z, p.linger, null);
    if (p.spawn && BD.sim.monsters) BD.sim.monsters.spawnAt(world, p.spawn, z.tiles, z.srcId);
  }

  function hitWithPacket(world, z, p, e, sum) {
    const r = sum <= MIN_PACKET_DAMAGE ? { total: 0 } : BD.sim.damage.dealDamage(world, {
      srcId: z.srcId, tgtId: e.id, amounts: p.amounts, tags: ['zone', 'aoe'].concat(p.tags || []),
      canCrit: false, canDodge: false, canBlock: false, mult: 1, abilityId: p.abilityId || null, noFaction: !!z.noFaction,
    });
    if (!r) return;
    for (const st of p.statuses || []) {
      BD.sim.status.apply(world, e, st.id, { durMs: st.durMs, magnitude: st.mag, sourceId: z.srcId, hit: r.total });
    }
    if (p.knockback) BD.sim.hits.knockback(world, e, z.cx, z.cy, p.knockback);
  }

  function startLinger(world, z, L, res) {
    const def = ZoneData()[L.kind];
    let amount = L.amount || 0;
    if (!amount && def && def.dmgPct && res) {
      // linger damage = a share of the average hit the resolve dealt
      let tot = 0, n = 0;
      for (const r of res) {
        if (r.res) {
          tot += r.res.total;
          n++;
        }
      }
      amount = n ? (tot / n) * def.dmgPct : 0;
    }
    create(world, {
      kind: L.kind, tiles: (L.tiles || z.tiles).slice(), cx: z.cx, cy: z.cy, faction: z.faction, srcId: z.srcId,
      armMs: 0, durMs: L.durMs, tickMs: def ? def.tickMs : DEFAULT_TICK_MS, tickLeft: 0,
      amount, school: def ? def.school : null, noFaction: def && def.noFaction,
      follow: L.follow || null, ownerId: z.ownerId, spread: L.spread || 0,
    });
  }

  /** Ground effect zone (burning ground, poison pool, caltrops, web…) directly. */
  function ground(world, kind, tiles, o) {
    const def = ZoneData()[kind];
    const base = {
      kind, tiles, armMs: 0, durMs: DEFAULT_GROUND_MS, tickMs: def.tickMs, tickLeft: 0, amount: 0, school: def.school,
      noFaction: !!def.noFaction,
    };
    return create(world, Object.assign(base, o || {}));
  }

  function tick(world, z) {
    const def = ZoneData()[z.kind];
    if (z.tickPayload) { // ability tick zones (Blizzard, Rain of Arrows)
      const caster = Entities.get(world, z.tickPayload.casterId);
      if (!caster || caster.dead) return;
      const ab = Abilities().resolved(Abilities().def(z.tickPayload.abilityId), z.tickPayload.rank, caster);
      const ctx = BD.sim.effects.baseCtx(world, caster, ab, z.tickPayload.rank, null);
      ctx.srcId = z.srcId;
      ctx.packetMult = z.tickPayload.mult || 1;
      ctx.aoe = true;
      ctx.cx = z.cx;
      ctx.cy = z.cy;
      ctx.focus = z.tickPayload.focus || 0;
      world.events.push({ type: 'zone.tick', zoneId: z.id, kind: z.kind, tiles: z.tiles, cx: z.cx, cy: z.cy, abilityId: ab.id });
      const res = BD.sim.hits.applyEffects(world, ctx, ab.tickEffects || ab.effects, victims(world, z));
      BD.sim.effects.special(world, caster, ab, z.tickPayload.rank, 'zoneTick', { z, ctx, res });
      return;
    }
    if (!def) return;
    for (const e of victims(world, z)) {
      // overlapping ground of the same kind doesn't stack: one tick per kind per victim per 500 ms
      const tk = z.kind + ':' + (z.faction || '');
      e._zt = e._zt || {};
      if (e._zt[tk] != null && world.time - e._zt[tk] < z.tickMs - 1) continue;
      e._zt[tk] = world.time;
      if (def.element && (z.amount > 0 || def.maxLifePct)) {
        const amt = def.maxLifePct ? BD.sim.stats.statsOf(world, e).maxLife * def.maxLifePct : z.amount;
        const am = {};
        am[def.element] = amt;
        BD.sim.damage.dealDamage(world, {
          srcId: z.srcId, tgtId: e.id, amounts: am, tags: ['zone', 'dot', z.kind],
          canCrit: false, canDodge: false, canBlock: false, mult: 1, isDot: true, noFaction: !!z.noFaction,
        });
      }
      if (def.status && (!def.statusChance || world.rng.chance(def.statusChance))) {
        BD.sim.status.apply(world, e, def.status, { durMs: def.statusMs, magnitude: def.statusMag, sourceId: z.srcId });
      }
      if (def.extra) BD.sim.status.apply(world, e, def.extra, { durMs: EXTRA_STATUS_MS, sourceId: z.srcId });
      if (def.bleedOnce && z.hitIds.indexOf(e.id) < 0) {
        z.hitIds.push(e.id);
        BD.sim.status.apply(world, e, 'bleeding', { durMs: BLEED_ONCE_MS, sourceId: z.srcId, hit: z.amount || 1 });
      }
    }
  }

  /** a following zone (Blizzard on a target, auras) moves with its anchor */
  function followAnchor(world, z) {
    const t = Entities.get(world, z.follow);
    if (!t || t.dead) return;
    const dx = t.x - z.cx, dy = t.y - z.cy;
    if (!dx && !dy) return;
    z.tiles = z.tiles.map(([x, y]) => [x + dx, y + dy]);
    z.cx = t.x;
    z.cy = t.y;
  }

  function spreadTick(world, z, dt) {
    z.spreadAcc = (z.spreadAcc || 0) + dt;
    if (z.spreadAcc >= SPREAD_INTERVAL_MS && (z.spreadN || 0) < z.spread) {
      z.spreadAcc -= SPREAD_INTERVAL_MS;
      z.spreadN = (z.spreadN || 0) + 1;
      growZone(world, z);
    }
  }

  function system(world, dt) {
    const list = world.floor.zones;
    for (let i = 0; i < list.length; i++) {
      const z = list[i];
      if (z.follow != null) followAnchor(world, z);
      if (!z.resolved) {
        z.armMs -= dt;
        if (!(z.armMs <= 0)) continue;   // still arming
        resolve(world, z);
        if (!z.durMs) {
          list.splice(i--, 1);
          continue;
        }
      }
      z.durMs -= dt;
      z.tickLeft -= dt;
      if (z.spread) spreadTick(world, z, dt);
      if (z.tickLeft <= 0) {
        z.tickLeft += z.tickMs;
        tick(world, z);
      }
      if (z.durMs <= 0) {
        list.splice(i--, 1);
        world.events.push({ type: 'zone.end', zoneId: z.id });
      }
    }
  }

  // ---- ability helpers ----
  /** Lobbed bomb: a 600 ms arc to the target tile, then an area resolve. */
  function lob(world, caster, ab, rank, a, tx, ty, ctx) {
    const flight = (ab.delivery && ab.delivery.flightMs) || DEFAULT_LOB_FLIGHT_MS;
    const area = ab.area || { shape: 'circle', radius: 1 };
    const centres = BD.sim.effects.special(world, caster, ab, rank, 'lobTargets', { tx, ty }) || [[tx, ty]];
    for (const [cx, cy, k, extraMs] of centres) {
      const landMs = flight + (extraMs || 0);
      world.events.push({ type: 'lob', srcId: caster.id, fromX: caster.x, fromY: caster.y, x: cx, y: cy, ms: landMs, abilityId: ab.id });
      create(world, {
        tiles: BD.sim.targeting.areaTiles(area, cx, cy, cx, cy, caster.dir), cx, cy, armMs: landMs, telegraph: false,
        faction: caster.faction, srcId: ctx.srcId, ownerId: caster.id, school: ab.school,
        resolve: {
          type: 'ability', abilityId: ab.id, rank, casterId: caster.id, srcId: ctx.srcId, combo: ctx.combo, focus: ctx.focus,
          mult: ctx.packetMult * (k || 1), linger: ab.linger || null, noAfter: k != null && k !== 1,
        },
        kind: 'lob',
      });
    }
  }

  /** Delayed / persistent ability zones (Meteor, Sky Spear, Blizzard, Rain of Arrows, Smoke Bomb). */
  function fromAbility(world, caster, ab, rank, a, tx, ty, ctx) {
    const d = ab.delivery;
    const area = ab.area || { shape: 'circle', radius: 1 };
    const centres = BD.sim.effects.special(world, caster, ab, rank, 'zoneCentres', { tx, ty }) || [[tx, ty, 1]];
    for (const [cx, cy, k] of centres) {
      const tiles = BD.sim.targeting.areaTiles(area, cx, cy, cx, cy, caster.dir);
      const base = { tiles, cx, cy, faction: caster.faction, srcId: ctx.srcId, ownerId: caster.id, school: ab.school, kind: ab.id };
      if (d.tickMs) {
        let follow = null;
        if (ab.follow === 'self') follow = caster.id;
        else if (ab.follow) follow = (a && a.targetId) || caster.lockId || null;
        create(world, Object.assign(base, {
          armMs: d.delayMs || 0, telegraph: !!d.delayMs, durMs: d.durMs, tickMs: d.tickMs, tickLeft: 0, resolve: null,
          tickPayload: { abilityId: ab.id, rank, casterId: caster.id, mult: (k || 1) * ctx.packetMult, focus: ctx.focus },
          follow, friendly: true,
        }));
      } else {
        create(world, Object.assign(base, {
          armMs: d.delayMs || 0, telegraph: true,
          resolve: {
            type: 'ability', abilityId: ab.id, rank, casterId: caster.id, srcId: ctx.srcId, combo: ctx.combo, focus: ctx.focus,
            mult: (k || 1) * ctx.packetMult, linger: ab.linger || null, noAfter: centres.length > 1 && k !== 1,
          },
        }));
      }
    }
  }

  /** is (x,y) inside a player-made smoke cloud? */
  function inSmoke(world, x, y) {
    for (const z of world.floor.zones) {
      if (z.kind === 'smoke' && z.resolved !== false && z.tiles.some(([a, b]) => a === x && b === y)) return true;
    }
    return false;
  }

  /** grow a ground zone by one ring of walkable tiles (Cinderveil) */
  function growZone(world, z) {
    const f = world.floor, have = new Set(z.tiles.map(([x, y]) => Grid.idx(f, x, y)));
    const add = [];
    for (const [x, y] of z.tiles) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = Grid.idx(f, nx, ny);
        if (have.has(k) || !BD.sim.entities.walkable(f, nx, ny)) continue;
        have.add(k);
        add.push([nx, ny]);
      }
    }
    z.tiles = z.tiles.concat(add);
  }

  function clearFloor(world) { world.floor.zones.length = 0; }

  BD.sim.zones = { inSmoke, create, victims, resolve, ground, tick, system, lob, fromAbility, clearFloor, startLinger };
  BD.sim.world.addSystem('zones', system, 25);
})(globalThis.BD);
