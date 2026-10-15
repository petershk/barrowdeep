// @ts-check
// Magician special rules (02 §4): elemental reactions, Firebolt splits, Fireball ground, Meteor
// followers, Blizzard freeze, Pyre, Shatter, Spark chains, Teleport novas, and the Magician legendaries.
(function (BD) {
  'use strict';

  const Effects = BD.sim.effects;
  const Hits = BD.sim.hits;
  const Powers = BD.sim.powers;
  const Status = BD.sim.status;
  const Grid = BD.core.grid;
  const reg = Effects.register;
  const ks = (p, id) => !!(p.skills && p.skills[id]);
  const isMage = (p) => p && p.kind === 'player' && p.cls === 'magician';
  const circle = (x, y, r) => Grid.shapeOffsets('circle', r).map(([dx, dy]) => [x + dx, y + dy]);
  const reactK = (world, p) => 1 + (BD.sim.stats.statsOf(world, p).reaction_pct || 0) / 100;

  const FB_GROUND_MS = 3000;          // Fireball rank 5 burning ground (Napalm sets its own)
  const SEAR_MULT = 3;                // Searing: the burn's remaining damage, cashed in at this multiple
  const PRISM_MANA = 3;               // Prismatic Arc: mana per Reaction the hero sets off
  const OVERLOAD_MULT = 1;            // Overload: this share of the lightning hit explodes as fire (radius 1)
  const LANCE_FREEZE_MS = 1500;
  const CONDUIT_MANA = 1;             // per landed spark
  const ORB_SHARD_MULT = 0.5;         // Frozen Orb shard = this × a Blizzard tick
  const ORB_SHARD_RANGE = 3;

  /** a Reaction went off: Prismatic Arc pays mana for it */
  function reacted(world, src) {
    const form = BD.sim.abilities.formOf(src, BD.data.skills.chain_lightning);
    if (form && form.id === 'prismatic_arc') BD.sim.resources.gain(world, src, 'mana', PRISM_MANA);
  }

  // ---------------- Elemental Reactions ----------------
  // Thermal Shock: a fire hit on a Frozen target deals +100% (ends Frozen)
  BD.sim.damage.multHooks.push((world, src, tgt, pk, el) => {
    if (!isMage(src) || el !== 'fire' || !Status.has(tgt, 'frozen') || pk.isDot) return 1;
    pk._thermal = true;
    return 1 + 1.0 * reactK(world, src);
  });
  BD.sim.damage.onHitHooks.push((world, src, tgt, pk, res) => {
    if (!isMage(src) || pk.isDot || tgt.hp <= 0) return;
    if (pk._thermal) {
      Status.remove(world, tgt, 'frozen');
      world.events.push({ type: 'reaction', name: 'Thermal Shock', tgtId: tgt.id, x: tgt.x, y: tgt.y });
      reacted(world, src);
      return;
    }
    const parts = res.parts || {};
    // Flash Freeze: a cold hit on a Shocked target instantly Freezes it (bosses: Chill 3 s)
    if (parts.cold > 0 && Status.has(tgt, 'shocked')) {
      Status.apply(world, tgt, 'frozen', { durMs: 1500, sourceId: src.id });
      world.events.push({ type: 'reaction', name: 'Flash Freeze', tgtId: tgt.id, x: tgt.x, y: tgt.y });
      reacted(world, src);
    }
    // Overload: a lightning hit on a Burning target explodes (radius 1, the hit again as fire)
    if (parts.light > 0 && Status.has(tgt, 'burning') && pk.abilityId !== 'overload') {
      const amt = parts.light * OVERLOAD_MULT * reactK(world, src);
      world.events.push({ type: 'reaction', name: 'Overload', tgtId: tgt.id, x: tgt.x, y: tgt.y });
      reacted(world, src);
      world.events.push({
        type: 'ability.explode', abilityId: 'overload', x: tgt.x, y: tgt.y,
        area: { shape: 'circle', radius: 1 }, element: 'fire',
      });
      for (const e of BD.sim.targeting.entitiesOnTiles(world, circle(tgt.x, tgt.y, 1), src.faction)) {
        BD.sim.damage.dealDamage(world, {
          srcId: src.id, tgtId: e.id, amounts: { fire: amt }, tags: ['aoe', 'reaction'],
          canCrit: false, canDodge: false, canBlock: false, mult: 1, abilityId: 'overload', noOnHit: true,
        });
      }
    }
  });

  // ---------------- Firebolt: split on hit (r5) ----------------
  reg('firebolt.projectileHit', (world, p, ab, rank, { pr, tgt }) => {
    if (!ab.splitOnHit || pr.payload.split) return;
    const base = Math.atan2(pr.dy, pr.dx);
    for (const off of [-0.6, 0.6]) {
      const n = BD.sim.projectiles.spawn(world, {
        kind: 'firebolt', srcId: p.id, faction: p.faction, x: tgt.x, y: tgt.y,
        dx: Math.cos(base + off), dy: Math.sin(base + off), maxDist: 5,
        payload: Object.assign({}, pr.payload, { split: true, idx: 1 }),
      });
      n.hitIds.push(tgt.id);
    }
  });

  // ---------------- Fireball: burning ground (r5), Phoenix Quill splits ----------------
  reg('fireball.explode', (world, p, ab, rank, { x, y, pr }) => {
    const hit = Hits.computeHit(world, p, ab, ab.effects[0], rank, { roll: 0.5 }).total;
    if (ab.fbGround) {
      const tiles = circle(x, y, ab.delivery.explode.radius);
      const durMs = ab.fbGroundMs || FB_GROUND_MS;
      BD.sim.zones.ground(world, 'burning_ground', tiles, { durMs, faction: 'player', srcId: p.id, amount: hit * 0.25 });
    }
    if (ab.implode) implode(world, p, x, y, ab.implode);
    if (Powers.has(p, 'phoenix_quill') && !pr.payload.split) {
      for (const [dx, dy] of [[2, 0], [-1, 2], [-1, -2]]) {
        BD.sim.zones.create(world, {
          tiles: circle(x + dx, y + dy, 1), cx: x + dx, cy: y + dy, armMs: 250, telegraph: false,
          faction: 'player', srcId: p.id, kind: 'quill',
          resolve: { type: 'ability', abilityId: 'fireball', rank, casterId: p.id, srcId: p.id, mult: 0.5, noAfter: true },
        });
        world.events.push({ type: 'lob', srcId: p.id, fromX: x, fromY: y, x: x + dx, y: y + dy, ms: 250, abilityId: 'fireball' });
      }
    }
  });

  // ---------------- Meteor: followers (r3), Meteor Shower, Cinderveil spreading ground ----------------
  reg('meteor.zoneCentres', (world, p, ab, rank, { tx, ty }) => {
    if (ab.shower) return showerCentres(world, ab.shower, tx, ty);
    const out = [[tx, ty, 1]];
    if (ab.followers) {
      out.push([tx + 1, ty + 1, 0.5]);
      out.push([tx - 1, ty + 1, 0.5]);
    }
    return out;
  });
  Powers.registerMod('cinderveil', (ab) => { if (ab.id === 'meteor') ab.linger = Object.assign({}, ab.linger, { spread: 3 }); });

  // ---------------- Forms ----------------
  // Fireball Implosion: drag enemies toward the blast
  function implode(world, p, x, y, o) {
    const near = BD.sim.targeting.entitiesOnTiles(world, circle(x, y, o.radius), p.faction);
    const area = { shape: 'circle', radius: o.radius };
    world.events.push({ type: 'ability.explode', abilityId: 'implosion', x, y, area, element: 'cold' });
    // pull moves one tile per call; repeat for the full distance
    for (const e of near) for (let i = 0; i < o.dist; i++) if (e.hp > 0) Hits.pull(world, e, x, y, 1);
  }
  // Meteor Shower: meteors scattered over the area, landing one after another (the first on the aim point)
  function showerCentres(world, o, tx, ty) {
    const out = [[tx, ty, o.mult, 0]];
    for (let i = 1; i < o.count; i++) {
      const a = world.rng.next() * Math.PI * 2, r = 1 + world.rng.next() * (o.radius - 1);
      out.push([Math.round(tx + Math.cos(a) * r), Math.round(ty + Math.sin(a) * r), o.mult, i * o.staggerMs]);
    }
    return out;
  }
  // Firebolt Searing: a hit on a Burning enemy cashes in the burn
  reg('firebolt.sear', (world, p, ab, rank, { tgt, prev }) => {
    const burn = Status.has(tgt, 'burning');
    if (!prev || !(prev.total > 0) || !burn || tgt.hp <= 0) return;
    const left = (burn.dot || 0) * (burn.remainingMs / BD.data.balance.combat.dotTickMs) * SEAR_MULT;
    Status.remove(world, tgt, 'burning');
    if (left <= 0) return;
    world.events.push({ type: 'reaction', name: 'Searing', tgtId: tgt.id, x: tgt.x, y: tgt.y });
    BD.sim.damage.dealDamage(world, {
      srcId: p.id, tgtId: tgt.id, amounts: { fire: left }, tags: ['reaction'],
      canCrit: false, canDodge: false, canBlock: false, mult: 1, abilityId: 'searing', noOnHit: true,
    });
  });
  // Ice Shard Glacial Lance: runs before the lance's own Chill, so only already-Chilled enemies freeze
  reg('ice_shard.lance', (world, p, ab, rank, { tgt, prev }) => {
    if (!prev || !(prev.total > 0) || tgt.hp <= 0 || !Status.has(tgt, 'chilled')) return;
    Status.apply(world, tgt, 'frozen', { durMs: LANCE_FREEZE_MS, sourceId: p.id });
  });
  // Spark Conduit: mana back per landed spark
  reg('spark.conduit', (world, p, ab, rank, { prev }) => {
    if (prev && prev.total > 0) BD.sim.resources.gain(world, p, 'mana', CONDUIT_MANA);
  });
  // Spark Arc Lash: draw the lash as bolts from the hand to each enemy struck
  reg('spark.impact', (world, p, ab, rank, { results }) => {
    if (!ab.arcLash) return;
    for (const r of results || []) {
      world.events.push({ type: 'chain', srcId: p.id, fromX: p.x, fromY: p.y, x: r.tgt.x, y: r.tgt.y, abilityId: 'spark' });
    }
  });
  // Frost Nova Ice Armour: a barrier that grows with the enemies caught
  reg('frost_nova.landed', (world, p, ab, rank, { landed }) => {
    if (!ab.iceArmour || !landed.length) return;
    const o = ab.iceArmour;
    const amt = BD.sim.stats.statsOf(world, p).maxLife * Math.min(o.max, o.perHit * landed.length);
    Status.apply(world, p, 'shielded', { durMs: o.durMs, magnitude: amt, sourceId: p.id });
  });
  // Blizzard Frozen Orb: the orb starts at the hand and sprays shards each tick
  reg('blizzard.zoneCentres', (world, p, ab) => (ab.drift ? [[p.x, p.y, 1]] : null));
  function orbShards(world, p, ab, rank, z) {
    const hit = Hits.computeHit(world, p, ab, ab.effects[0], rank, { roll: 0.5 }).total * ORB_SHARD_MULT;
    z.orbTurn = (z.orbTurn || 0) + 0.5;
    for (let i = 0; i < ab.orbShards; i++) {
      const a = z.orbTurn + (i / ab.orbShards) * Math.PI * 2;
      BD.sim.projectiles.spawn(world, {
        kind: 'shard_burst', srcId: p.id, faction: p.faction, x: z.cx, y: z.cy, dx: Math.cos(a), dy: Math.sin(a),
        maxDist: ORB_SHARD_RANGE, payload: { type: 'packet', amounts: { cold: hit }, onHit: [{ status: 'chilled' }] },
      });
    }
  }

  // ---------------- Pyre and Shatter (keystones) ----------------
  BD.sim.damage.onKillHooks.push((world, v, killer, info) => {
    const p = world.player;
    if (!isMage(p) || !killer || killer.id !== p.id) return;
    if (ks(p, 'pyre') && Status.has(v, 'burning')) {
      const max = BD.sim.stats.statsOf(world, v).maxLife;
      const pyreEff = { source: 'spell', base: [40, 60], element: 'fire', mult: 1 };
      const cap = 2 * Hits.computeHit(world, p, { tags: [] }, pyreEff, 1, { roll: 0.5 }).total;
      const amt = Math.min(max * 0.25, cap);
      world.events.push({
        type: 'ability.explode', abilityId: 'pyre', x: v.x, y: v.y,
        area: { shape: 'circle', radius: 1 }, element: 'fire',
      });
      for (const e of BD.sim.targeting.entitiesOnTiles(world, circle(v.x, v.y, 1), p.faction)) {
        BD.sim.damage.dealDamage(world, {
          srcId: p.id, tgtId: e.id, amounts: { fire: amt }, tags: ['aoe'],
          canCrit: false, canDodge: false, canBlock: false, mult: 1, abilityId: 'pyre', noOnHit: true,
        });
      }
    }
    if (ks(p, 'shatter') && Status.has(v, 'frozen')) {
      let blow = 0;
      for (const k in info.overkill || {}) blow += info.overkill[k];
      const amt = blow * 0.3;
      if (amt <= 0) return;
      world.events.push({ type: 'shatter', x: v.x, y: v.y });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        BD.sim.projectiles.spawn(world, {
          kind: 'shard_burst', srcId: p.id, faction: p.faction, x: v.x, y: v.y, dx: Math.cos(a), dy: Math.sin(a),
          maxDist: 3, payload: { type: 'packet', amounts: { cold: amt } },
        });
      }
    }
  });

  // ---------------- Frost Nova: Frostbinder casts twice ----------------
  reg('frost_nova.impact', (world, p, ab, rank) => {
    if (Powers.has(p, 'frostbinder')) BD.core.scheduler.after(world, 500, 'frost_nova.echo', { rank, x: p.x, y: p.y });
  });
  BD.core.scheduler.register('frost_nova.echo', (world, pl) => {
    const p = world.player;
    if (p.dead) return;
    const ab = BD.sim.abilities.resolved(BD.data.skills.frost_nova, pl.rank, p);
    const ctx = Effects.baseCtx(world, p, ab, pl.rank, null);
    ctx.packetMult = 0.5;
    world.events.push({
      type: 'ability.impact', id: p.id, abilityId: 'frost_nova',
      x: p.x, y: p.y, tx: p.x, ty: p.y, kind: 'instant', area: ab.area,
    });
    Effects.areaAt(world, ctx, ab, p.x, p.y, ab.area);
  });

  // ---------------- Blizzard: Chilled 2 s by Blizzard → Frozen (r5) ----------------
  reg('blizzard.zoneTick', (world, p, ab, rank, { z, res }) => {
    if (ab.orbShards) orbShards(world, p, ab, rank, z);
    if (!ab.freezeAfter) return;
    z.chillMs = z.chillMs || {};
    for (const r of res) {
      const id = r.tgt.id;
      z.chillMs[id] = (z.chillMs[id] || 0) + z.tickMs;
      if (z.chillMs[id] >= ab.freezeAfter && r.tgt.hp > 0) {
        Status.apply(world, r.tgt, 'frozen', { durMs: 1500, sourceId: p.id });
        z.chillMs[id] = 0;
      }
    }
  });

  // ---------------- Spark: chains once (r5) ----------------
  reg('spark.projectileHit', (world, p, ab, rank, { tgt, ctx }) => {
    if (!ab.sparkChain || ctx.chained) return;
    const next = BD.sim.targeting.nearestEnemy(world, tgt.x, tgt.y, 3, p.faction, { exclude: new Set([tgt.id]) });
    if (!next) return;
    world.events.push({ type: 'chain', srcId: p.id, fromX: tgt.x, fromY: tgt.y, x: next.x, y: next.y, abilityId: 'spark' });
    const c2 = Object.assign({}, ctx, { chained: true, centerId: next.id });
    Hits.applyEffects(world, c2, ab.effects, [next]);
  });

  // ---------------- Teleport: Voice of the Storm nova ----------------
  reg('teleport.impact', (world, p, ab, rank) => {
    if (!Powers.has(p, 'voice_of_the_storm')) return;
    const ctx = Effects.baseCtx(world, p, ab, rank, null);
    const nova = { type: 'damage', source: 'spell', base: [10, 16], element: 'light', canCrit: true, canDodge: false };
    world.events.push({
      type: 'ability.explode', abilityId: 'teleport', x: p.x, y: p.y,
      area: { shape: 'circle', radius: 2 }, element: 'light',
    });
    ctx.aoe = true;
    const targets = BD.sim.targeting.entitiesOnTiles(world, circle(p.x, p.y, 2), p.faction);
    Hits.applyEffects(world, ctx, [nova, { type: 'status', id: 'shocked', needsHit: true }], targets);
  });

  // ---------------- legendaries ----------------
  Powers.registerMod('stormcaller', (ab) => {
    if (ab.id === 'chain_lightning') ab.delivery = Object.assign({}, ab.delivery, { jumps: ab.delivery.jumps + 3, repeat: true });
  });
  // rimeheart is a damage multiplier in powers.js; frostbinder, phoenix_quill, voice_of_the_storm and cinderveil are above
})(globalThis.BD);
