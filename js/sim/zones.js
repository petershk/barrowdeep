// @ts-check
// One zone/telegraph system for boss moves, traps, Meteor, Blizzard, Rain of Arrows, champion
// death bursts and ground effects (06 §8.3). Telegraphed zones arm for armMs, resolve once, then
// optionally linger and tick every 500 ms. Zones affect the opposing faction (or everyone).
(function (BD) {
  'use strict';

  const E = BD.sim.entities;
  const ZD = () => BD.data.zones;
  const AB = () => BD.sim.abilities;

  /**
   * @param {any} z { tiles, armMs, faction, srcId, resolve?: payload, linger?: {kind, durMs, amount?}, telegraph?: bool, school?, label? }
   */
  function create(world, z) {
    const zone = Object.assign({
      id: world.nextId++, armMs: 0, armTotal: z.armMs || 0, durMs: 0, tickMs: 500, tickLeft: 500, faction: null, srcId: null,
      resolved: false, telegraph: z.armMs > 0, hitIds: [], kind: 'strike', follow: null,
    }, z);
    zone.armTotal = zone.armMs;
    world.floor.zones.push(zone);
    if (zone.armMs > 0 && zone.telegraph) {
      world.events.push({ type: 'telegraph.start', zoneId: zone.id, srcId: zone.srcId, tiles: zone.tiles, ms: zone.armMs, friendly: zone.faction === 'player', school: zone.school || null, heavy: !!zone.heavy });
    }
    return zone;
  }

  /** entities affected by a zone (on its tiles, opposing faction unless noFaction) */
  function victims(world, z) {
    const f = world.floor, out = [];
    for (const [x, y] of z.tiles) {
      if (x < 0 || y < 0 || x >= f.w || y >= f.h) continue;
      const id = f.occ[y * f.w + x];
      if (!id) continue;
      const e = E.get(world, id);
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
    world.events.push({ type: 'zone.resolve', zoneId: z.id, tiles: z.tiles, cx: z.cx, cy: z.cy, school: z.school || null, kind: z.kind, heavy: !!z.heavy, srcId: z.srcId, label: z.label || null });
    if (!p) return;
    if (p.type === 'ability') {
      const caster = E.get(world, p.casterId);
      if (!caster || caster.dead) return;
      const ab = AB().resolved(AB().def(p.abilityId), p.rank);
      const ctx = BD.sim.effects.baseCtx(world, caster, ab, p.rank, null);
      ctx.srcId = p.srcId != null ? p.srcId : caster.id; ctx.combo = p.combo || 0; ctx.focus = p.focus || 0; ctx.packetMult = p.mult || 1; ctx.aoe = true;
      ctx.cx = z.cx; ctx.cy = z.cy; ctx.centerId = null;
      const targets = victims(world, z);
      const res = BD.sim.hits.applyEffects(world, ctx, p.effects || ab.effects, targets);
      BD.sim.effects.special(world, caster, ab, p.rank, 'zoneResolve', { z, ctx, res });
      if (caster.kind === 'player' && !p.noAfter) BD.sim.effects.afterHits(world, caster, ab, p.rank, null, res);
      if (p.linger) startLinger(world, z, p.linger, res);
      return;
    }
    if (p.type === 'packet') {
      for (const e of victims(world, z)) {
        const r = BD.sim.damage.dealDamage(world, { srcId: z.srcId, tgtId: e.id, amounts: p.amounts, tags: ['zone', 'aoe'].concat(p.tags || []), canCrit: false, canDodge: false, canBlock: false, mult: 1, abilityId: p.abilityId || null, noFaction: !!z.noFaction });
        if (r) {
          for (const st of p.statuses || []) BD.sim.status.apply(world, e, st.id, { durMs: st.durMs, magnitude: st.mag, sourceId: z.srcId, hit: r.total });
          if (p.knockback) BD.sim.hits.knockback(world, e, z.cx, z.cy, p.knockback);
        }
      }
      if (p.linger) startLinger(world, z, p.linger, null);
      if (p.spawn && BD.sim.monsters) BD.sim.monsters.spawnAt(world, p.spawn, z.tiles, z.srcId);
    }
  }

  function startLinger(world, z, L, res) {
    const def = ZD()[L.kind];
    let amount = L.amount || 0;
    if (!amount && def && def.dmgPct && res) { let tot = 0, n = 0; for (const r of res) if (r.res) { tot += r.res.total; n++; } amount = n ? (tot / n) * def.dmgPct : 0; }
    create(world, { kind: L.kind, tiles: (L.tiles || z.tiles).slice(), cx: z.cx, cy: z.cy, faction: z.faction, srcId: z.srcId, armMs: 0, durMs: L.durMs, tickMs: def ? def.tickMs : 500, tickLeft: 0, amount, school: def ? def.school : null, noFaction: def && def.noFaction, follow: L.follow || null, ownerId: z.ownerId, spread: L.spread || 0 });
  }

  /** Ground effect zone (burning ground, poison pool, caltrops, web…) directly. */
  function ground(world, kind, tiles, o) {
    const def = ZD()[kind];
    return create(world, Object.assign({ kind, tiles, armMs: 0, durMs: 3000, tickMs: def.tickMs, tickLeft: 0, amount: 0, school: def.school, noFaction: !!def.noFaction }, o || {}));
  }

  function tick(world, z) {
    const def = ZD()[z.kind];
    if (z.tickPayload) { // ability tick zones (Blizzard, Rain of Arrows)
      const caster = E.get(world, z.tickPayload.casterId);
      if (!caster || caster.dead) return;
      const ab = AB().resolved(AB().def(z.tickPayload.abilityId), z.tickPayload.rank);
      const ctx = BD.sim.effects.baseCtx(world, caster, ab, z.tickPayload.rank, null);
      ctx.srcId = z.srcId; ctx.packetMult = z.tickPayload.mult || 1; ctx.aoe = true; ctx.cx = z.cx; ctx.cy = z.cy; ctx.focus = z.tickPayload.focus || 0;
      world.events.push({ type: 'zone.tick', zoneId: z.id, kind: z.kind, tiles: z.tiles, cx: z.cx, cy: z.cy, abilityId: ab.id });
      const res = BD.sim.hits.applyEffects(world, ctx, ab.tickEffects || ab.effects, victims(world, z));
      BD.sim.effects.special(world, caster, ab, z.tickPayload.rank, 'zoneTick', { z, ctx, res });
      return;
    }
    if (!def) return;
    for (const e of victims(world, z)) {
      if (def.element && (z.amount > 0 || def.maxLifePct)) {
        const amt = def.maxLifePct ? BD.sim.stats.statsOf(world, e).maxLife * def.maxLifePct : z.amount;
        const am = {}; am[def.element] = amt;
        BD.sim.damage.dealDamage(world, { srcId: z.srcId, tgtId: e.id, amounts: am, tags: ['zone', 'dot', z.kind], canCrit: false, canDodge: false, canBlock: false, mult: 1, isDot: true, noFaction: !!z.noFaction });
      }
      if (def.status && (!def.statusChance || world.rng.chance(def.statusChance))) BD.sim.status.apply(world, e, def.status, { durMs: def.statusMs, magnitude: def.statusMag, sourceId: z.srcId });
      if (def.extra) BD.sim.status.apply(world, e, def.extra, { durMs: 1000, sourceId: z.srcId });
      if (def.bleedOnce && z.hitIds.indexOf(e.id) < 0) {
        z.hitIds.push(e.id);
        BD.sim.status.apply(world, e, 'bleeding', { durMs: 4000, sourceId: z.srcId, hit: z.amount || 1 });
      }
    }
  }

  function system(world, dt) {
    const list = world.floor.zones;
    for (let i = 0; i < list.length; i++) {
      const z = list[i];
      if (z.follow != null) {
        const t = E.get(world, z.follow);
        if (t && !t.dead) { const dx = t.x - z.cx, dy = t.y - z.cy; if (dx || dy) { z.tiles = z.tiles.map(([x, y]) => [x + dx, y + dy]); z.cx = t.x; z.cy = t.y; } }
      }
      if (!z.resolved) {
        z.armMs -= dt;
        if (z.armMs <= 0) { resolve(world, z); if (!z.durMs) { list.splice(i--, 1); continue; } }
        else continue;
      }
      z.durMs -= dt;
      z.tickLeft -= dt;
      if (z.tickLeft <= 0) { z.tickLeft += z.tickMs; tick(world, z); }
      if (z.durMs <= 0) { list.splice(i--, 1); world.events.push({ type: 'zone.end', zoneId: z.id }); }
    }
  }

  // ---- ability helpers ----
  /** Lobbed bomb: a 600 ms arc to the target tile, then an area resolve. */
  function lob(world, caster, ab, rank, a, tx, ty, ctx) {
    const flight = (ab.delivery && ab.delivery.flightMs) || 600;
    const area = ab.area || { shape: 'circle', radius: 1 };
    const centres = BD.sim.effects.special(world, caster, ab, rank, 'lobTargets', { tx, ty }) || [[tx, ty]];
    for (const [cx, cy] of centres) {
      world.events.push({ type: 'lob', srcId: caster.id, fromX: caster.x, fromY: caster.y, x: cx, y: cy, ms: flight, abilityId: ab.id });
      create(world, {
        tiles: BD.sim.targeting.areaTiles(area, cx, cy, cx, cy, caster.dir), cx, cy, armMs: flight, telegraph: false, faction: caster.faction, srcId: ctx.srcId, ownerId: caster.id, school: ab.school,
        resolve: { type: 'ability', abilityId: ab.id, rank, casterId: caster.id, srcId: ctx.srcId, combo: ctx.combo, focus: ctx.focus, mult: ctx.packetMult, linger: ab.linger || null },
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
        create(world, Object.assign(base, { armMs: d.delayMs || 0, telegraph: !!d.delayMs, durMs: d.durMs, tickMs: d.tickMs, tickLeft: 0, resolve: null,
          tickPayload: { abilityId: ab.id, rank, casterId: caster.id, mult: (k || 1) * ctx.packetMult, focus: ctx.focus }, follow: ab.follow ? (ab.follow === 'self' ? caster.id : a && a.targetId) : null, friendly: true }));
      } else {
        create(world, Object.assign(base, { armMs: d.delayMs || 0, telegraph: true,
          resolve: { type: 'ability', abilityId: ab.id, rank, casterId: caster.id, srcId: ctx.srcId, combo: ctx.combo, focus: ctx.focus, mult: (k || 1) * ctx.packetMult, linger: ab.linger || null, noAfter: centres.length > 1 && k !== 1 } }));
      }
    }
  }

  function clearFloor(world) { world.floor.zones.length = 0; }

  BD.sim.zones = { create, victims, resolve, ground, tick, system, lob, fromAbility, clearFloor, startLinger };
  BD.sim.world.addSystem('zones', system, 25);
})(globalThis.BD);
