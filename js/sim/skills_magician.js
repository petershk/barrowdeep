// @ts-check
// Magician special rules (02 §4): elemental reactions, Firebolt splits, Fireball ground, Meteor
// followers, Blizzard freeze, Pyre, Shatter, Spark chains, Teleport novas, and the Magician legendaries.
(function (BD) {
  'use strict';

  const FX = BD.sim.effects;
  const H = BD.sim.hits;
  const PW = BD.sim.powers;
  const SS = BD.sim.status;
  const G = BD.core.grid;
  const reg = FX.register;
  const ks = (p, id) => !!(p.skills && p.skills[id]);
  const isMage = (p) => p && p.kind === 'player' && p.cls === 'magician';
  const circle = (x, y, r) => G.shapeOffsets('circle', r).map(([dx, dy]) => [x + dx, y + dy]);
  const reactK = (world, p) => 1 + (BD.sim.stats.statsOf(world, p).reaction_pct || 0) / 100;

  // ---------------- Elemental Reactions ----------------
  // Thermal Shock: a fire hit on a Frozen target deals +100% (ends Frozen)
  BD.sim.damage.multHooks.push((world, src, tgt, pk, el) => {
    if (!isMage(src) || el !== 'fire' || !SS.has(tgt, 'frozen') || pk.isDot) return 1;
    pk._thermal = true;
    return 1 + 1.0 * reactK(world, src);
  });
  BD.sim.damage.onHitHooks.push((world, src, tgt, pk, res) => {
    if (!isMage(src) || pk.isDot || tgt.hp <= 0) return;
    if (pk._thermal) {
      SS.remove(world, tgt, 'frozen');
      world.events.push({ type: 'reaction', name: 'Thermal Shock', tgtId: tgt.id, x: tgt.x, y: tgt.y });
      return;
    }
    const parts = res.parts || {};
    // Flash Freeze: a cold hit on a Shocked target instantly Freezes it (bosses: Chill 3 s)
    if (parts.cold > 0 && SS.has(tgt, 'shocked')) {
      SS.apply(world, tgt, 'frozen', { durMs: 1500, sourceId: src.id });
      world.events.push({ type: 'reaction', name: 'Flash Freeze', tgtId: tgt.id, x: tgt.x, y: tgt.y });
    }
    // Overload: a lightning hit on a Burning target explodes (radius 1, 50% of the hit as fire)
    if (parts.light > 0 && SS.has(tgt, 'burning') && pk.abilityId !== 'overload') {
      const amt = parts.light * 0.5 * reactK(world, src);
      world.events.push({ type: 'reaction', name: 'Overload', tgtId: tgt.id, x: tgt.x, y: tgt.y });
      world.events.push({ type: 'ability.explode', abilityId: 'overload', x: tgt.x, y: tgt.y, area: { shape: 'circle', radius: 1 }, element: 'fire' });
      for (const e of BD.sim.targeting.entitiesOnTiles(world, circle(tgt.x, tgt.y, 1), src.faction)) {
        BD.sim.damage.dealDamage(world, { srcId: src.id, tgtId: e.id, amounts: { fire: amt }, tags: ['aoe', 'reaction'], canCrit: false, canDodge: false, canBlock: false, mult: 1, abilityId: 'overload', noOnHit: true });
      }
    }
  });

  // ---------------- Firebolt: split on hit (r5) ----------------
  reg('firebolt.projectileHit', (world, p, ab, rank, { pr, tgt }) => {
    if (!ab.splitOnHit || pr.payload.split) return;
    const base = Math.atan2(pr.dy, pr.dx);
    for (const off of [-0.6, 0.6]) {
      const n = BD.sim.projectiles.spawn(world, { kind: 'firebolt', srcId: p.id, faction: p.faction, x: tgt.x, y: tgt.y, dx: Math.cos(base + off), dy: Math.sin(base + off), maxDist: 5, payload: Object.assign({}, pr.payload, { split: true, idx: 1 }) });
      n.hitIds.push(tgt.id);
    }
  });

  // ---------------- Fireball: burning ground (r5), Phoenix Quill splits ----------------
  reg('fireball.explode', (world, p, ab, rank, { x, y, ctx, pr }) => {
    const hit = H.computeHit(world, p, ab, ab.effects[0], rank, { roll: 0.5 }).total;
    if (ab.fbGround) BD.sim.zones.ground(world, 'burning_ground', circle(x, y, ab.delivery.explode.radius), { durMs: 3000, faction: 'player', srcId: p.id, amount: hit * 0.25 });
    if (PW.has(p, 'phoenix_quill') && !pr.payload.split) {
      for (const [dx, dy] of [[2, 0], [-1, 2], [-1, -2]]) {
        BD.sim.zones.create(world, { tiles: circle(x + dx, y + dy, 1), cx: x + dx, cy: y + dy, armMs: 250, telegraph: false, faction: 'player', srcId: p.id, kind: 'quill',
          resolve: { type: 'ability', abilityId: 'fireball', rank, casterId: p.id, srcId: p.id, mult: 0.5, noAfter: true } });
        world.events.push({ type: 'lob', srcId: p.id, fromX: x, fromY: y, x: x + dx, y: y + dy, ms: 250, abilityId: 'fireball' });
      }
    }
    void ctx;
  });

  // ---------------- Meteor: followers (r3), Cinderveil spreading ground ----------------
  reg('meteor.zoneCentres', (world, p, ab, rank, { tx, ty }) => {
    const out = [[tx, ty, 1]];
    if (ab.followers) { out.push([tx + 1, ty + 1, 0.5]); out.push([tx - 1, ty + 1, 0.5]); }
    return out;
  });
  PW.registerMod('cinderveil', (ab) => { if (ab.id === 'meteor') ab.linger = Object.assign({}, ab.linger, { spread: 3 }); });

  // ---------------- Pyre and Shatter (keystones) ----------------
  BD.sim.damage.onKillHooks.push((world, v, killer, info) => {
    const p = world.player;
    if (!isMage(p) || !killer || killer.id !== p.id) return;
    if (ks(p, 'pyre') && SS.has(v, 'burning')) {
      const max = BD.sim.stats.statsOf(world, v).maxLife;
      const cap = 2 * H.computeHit(world, p, { tags: [] }, { source: 'spell', base: [40, 60], element: 'fire', mult: 1 }, 1, { roll: 0.5 }).total;
      const amt = Math.min(max * 0.25, cap);
      world.events.push({ type: 'ability.explode', abilityId: 'pyre', x: v.x, y: v.y, area: { shape: 'circle', radius: 1 }, element: 'fire' });
      for (const e of BD.sim.targeting.entitiesOnTiles(world, circle(v.x, v.y, 1), p.faction)) BD.sim.damage.dealDamage(world, { srcId: p.id, tgtId: e.id, amounts: { fire: amt }, tags: ['aoe'], canCrit: false, canDodge: false, canBlock: false, mult: 1, abilityId: 'pyre', noOnHit: true });
    }
    if (ks(p, 'shatter') && SS.has(v, 'frozen')) {
      let blow = 0; for (const k in info.overkill || {}) blow += info.overkill[k];
      const amt = blow * 0.3;
      if (amt <= 0) return;
      world.events.push({ type: 'shatter', x: v.x, y: v.y });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        BD.sim.projectiles.spawn(world, { kind: 'shard_burst', srcId: p.id, faction: p.faction, x: v.x, y: v.y, dx: Math.cos(a), dy: Math.sin(a), maxDist: 3, payload: { type: 'packet', amounts: { cold: amt } } });
      }
    }
  });

  // ---------------- Frost Nova: Frostbinder casts twice ----------------
  reg('frost_nova.impact', (world, p, ab, rank) => {
    if (PW.has(p, 'frostbinder')) BD.core.scheduler.after(world, 500, 'frost_nova.echo', { rank, x: p.x, y: p.y });
  });
  BD.core.scheduler.register('frost_nova.echo', (world, pl) => {
    const p = world.player;
    if (p.dead) return;
    const ab = BD.sim.abilities.resolved(BD.data.skills.frost_nova, pl.rank, p);
    const ctx = FX.baseCtx(world, p, ab, pl.rank, null);
    ctx.packetMult = 0.5;
    world.events.push({ type: 'ability.impact', id: p.id, abilityId: 'frost_nova', x: p.x, y: p.y, tx: p.x, ty: p.y, kind: 'instant', area: ab.area });
    FX.areaAt(world, ctx, ab, p.x, p.y, ab.area);
  });

  // ---------------- Blizzard: Chilled 2 s by Blizzard → Frozen (r5) ----------------
  reg('blizzard.zoneTick', (world, p, ab, rank, { z, res }) => {
    if (!ab.freezeAfter) return;
    z.chillMs = z.chillMs || {};
    for (const r of res) {
      const id = r.tgt.id;
      z.chillMs[id] = (z.chillMs[id] || 0) + z.tickMs;
      if (z.chillMs[id] >= ab.freezeAfter && r.tgt.hp > 0) { SS.apply(world, r.tgt, 'frozen', { durMs: 1500, sourceId: p.id }); z.chillMs[id] = 0; }
    }
  });

  // ---------------- Spark: chains once (r5) ----------------
  reg('spark.projectileHit', (world, p, ab, rank, { tgt, ctx }) => {
    if (!ab.sparkChain || ctx.chained) return;
    const next = BD.sim.targeting.nearestEnemy(world, tgt.x, tgt.y, 3, p.faction, { exclude: new Set([tgt.id]) });
    if (!next) return;
    world.events.push({ type: 'chain', srcId: p.id, fromX: tgt.x, fromY: tgt.y, x: next.x, y: next.y, abilityId: 'spark' });
    const c2 = Object.assign({}, ctx, { chained: true, centerId: next.id });
    H.applyEffects(world, c2, ab.effects, [next]);
  });

  // ---------------- Teleport: Voice of the Storm nova ----------------
  reg('teleport.impact', (world, p, ab, rank) => {
    if (!PW.has(p, 'voice_of_the_storm')) return;
    const ctx = FX.baseCtx(world, p, ab, rank, null);
    const nova = { type: 'damage', source: 'spell', base: [10, 16], element: 'light', canCrit: true, canDodge: false };
    world.events.push({ type: 'ability.explode', abilityId: 'teleport', x: p.x, y: p.y, area: { shape: 'circle', radius: 2 }, element: 'light' });
    ctx.aoe = true;
    H.applyEffects(world, ctx, [nova, { type: 'status', id: 'shocked', needsHit: true }], BD.sim.targeting.entitiesOnTiles(world, circle(p.x, p.y, 2), p.faction));
  });

  // ---------------- legendaries ----------------
  PW.registerMod('stormcaller', (ab) => { if (ab.id === 'chain_lightning') ab.delivery = Object.assign({}, ab.delivery, { jumps: ab.delivery.jumps + 3, repeat: true }); });
  // rimeheart is a damage multiplier in powers.js; frostbinder, phoenix_quill, voice_of_the_storm and cinderveil are above
})(globalThis.BD);
