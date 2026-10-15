// @ts-check
// Assassin special rules (02 §3): combo-consuming basic attacks, Ambush, Unseen, Tiger Strike
// breakpoints, Dragon Talon knockbacks, Phoenix Strike's elements, sentries, smoke, the clone,
// and the Assassin legendaries.
(function (BD) {
  'use strict';

  const Effects = BD.sim.effects;
  const Hits = BD.sim.hits;
  const Resources = BD.sim.resources;
  const Entities = BD.sim.entities;
  const Allies = BD.sim.allies;
  const Powers = BD.sim.powers;
  const { within, cheb } = BD.core.util;
  const reg = Effects.register;
  const ks = (p, id) => !!(p.skills && p.skills[id]);
  const isAssassin = (p) => p && p.kind === 'player' && p.cls === 'assassin';
  const dead = (e) => !e || e.hp <= 0 || e.dying;
  const Grid = BD.core.grid;

  const Skills = BD.data.skills;       // skill-specific numbers live in the skill's `params`

  const SILENT_HIT_CLEAR_MS = 50;      // Unseen's hit out of hiding stays silent (no alert) for this long after it lands
  const CLONE_REACH = 1.5;             // Shadow Master clones copy finishers on enemies this close

  // ---------------- pre-impact: Shadowstep ambush, Unseen (only finishers spend combo) ----------------
  Effects.preImpact.push((world, p, ab, rank, ctx) => {
    if (!isAssassin(p)) return;
    if (BD.sim.status.has(p, 'ambush_ready') && ab.id !== 'shadowstep' && hasDamage(ab)) {
      ctx.forceCrit = true;
      BD.sim.status.remove(world, p, 'ambush_ready');
    }
    if (BD.sim.status.has(p, 'hidden') && hasDamage(ab)) {
      ctx.packetMult *= Skills.unseen.params.dmgMult;
      p._silentHit = true;
      BD.sim.status.remove(world, p, 'hidden');
      BD.core.scheduler.after(world, SILENT_HIT_CLEAR_MS, 'unseen.clear', {});
    }
  });
  BD.core.scheduler.register('unseen.clear', (world) => { world.player._silentHit = false; }, { scope: 'run' });
  const hasDamage = (ab) => (ab.effects || []).some((e) => e.type === 'damage');

  reg('attack.landed', (world, p, ab, rank, { landed }) => {
    if (!isAssassin(p) || !landed.length) return;
    if (ks(p, 'endless_flurry') && world.rng.chance(0.25)) Resources.addCombo(world, p, 1);
  });

  // ---------------- Ambush: +30% vs unaware, feared or fleeing ----------------
  BD.sim.damage.multHooks.push((world, src, tgt) => {
    if (!src || tgt.kind !== 'monster') return 1;
    const owner = src.kind === 'ally' ? world.player : src;
    if (!isAssassin(owner) || !tgt.ai) return 1;
    const unaware = tgt.ai.state === 'idle' || tgt.ai.state === 'dormant' || (tgt.ai.state === 'alert' && tgt.ai.timer > 0);
    const fleeing = BD.sim.status.has(tgt, 'feared') || tgt.ai.fleeMs > world.time;
    return unaware || fleeing ? 1.3 : 1;
  });

  // ---------------- Unseen: Hidden after 2 s without attacking or being hit ----------------
  function unseenSystem(world) {
    const p = world.player;
    if (!isAssassin(p) || !ks(p, 'unseen') || p.dead) return;
    const last = Math.max(p.lastHitMs, p.lastDamagedMs, p.lastActMs || -1e9);
    if (world.time - last >= 2000 && !BD.sim.status.has(p, 'hidden')) BD.sim.status.apply(world, p, 'hidden', { durMs: 0 });
  }
  BD.sim.damage.onHitHooks.push((world, src, tgt) => {
    if (tgt.kind === 'player' && BD.sim.status.has(tgt, 'hidden')) BD.sim.status.remove(world, tgt, 'hidden');
  });

  // ---------------- Tiger Strike ----------------
  reg('tiger_strike.before', (world, p, ab, rank, { ctx }) => {
    const n = Resources.combo(p);
    if (ab.critPerCombo) ctx.critAdd = (ctx.critAdd || 0) + ab.critPerCombo * n;
    if (ab.arcAt3 && n >= 3) ab.area = { shape: 'arc3' };
  });

  // ---------------- Dragon Talon ----------------
  reg('dragon_talon.before', (world, p, ab, rank, { a }) => {
    if (!ab.dragonFlight || !a || a.targetId == null) return;
    const tgt = Entities.get(world, a.targetId);
    if (!tgt || dead(tgt)) return;
    const spot = BD.sim.targeting.behind(world, tgt) || Effects.landingSpot(world, p, tgt.x, tgt.y);
    if (spot && (spot.x !== p.x || spot.y !== p.y)) {
      const fx = p.x, fy = p.y;
      BD.sim.movement.displace(world, p, spot.x, spot.y, 1, 'blink');
      p.move = null;
      world.events.push({ type: 'blink', id: p.id, fromX: fx, fromY: fy, x: spot.x, y: spot.y, abilityId: 'dragon_talon' });
      BD.sim.player.onStep(world, p);
    }
    ab.area = { shape: 'circle', radius: 1 };
  });
  reg('dragon_talon.impact', (world, p, ab, rank, { ctx, results }) => {
    const n = ctx.combo;
    if (ab.energyPerCombo && results.length && n > 0) Resources.gain(world, p, 'energy', ab.energyPerCombo * n);
    if (ab.noKickBack || n < 2) return;
    for (const r of results) {
      if (dead(r.tgt)) continue;
      const kb = Hits.knockback(world, r.tgt, p.x, p.y, 2);
      BD.sim.status.apply(world, r.tgt, 'stunned', { durMs: 400 * n, sourceId: p.id });
      if (ab.collide && kb.collided && kb.collided.entityId) {
        const other = Entities.get(world, kb.collided.entityId);
        const hit = Hits.computeHit(world, p, ab, { source: 'weapon', mult: ab.collide }, rank, { rng: world.rng });
        for (const t of [r.tgt, other]) {
          if (!t || t.faction === p.faction || dead(t)) continue;
          BD.sim.damage.dealDamage(world, {
            srcId: p.id, tgtId: t.id, amounts: hit.amounts, tags: ['collide'],
            canCrit: false, canDodge: false, canBlock: false, mult: 1, abilityId: 'dragon_talon',
          });
        }
        world.events.push({ type: 'collide', id: r.tgt.id, x: r.tgt.x, y: r.tgt.y });
      }
    }
  });
  reg('dragon_talon.landed', (world, p, ab, rank, { landed }) => {
    if (ab.killRefund && landed.some((r) => dead(r.tgt))) Resources.addCombo(world, p, ab.killRefund);
  });

  // ---------------- Phoenix Strike: the element follows the charges (or Forms) ----------------
  function phoenixNova(world, p, ab, ctx, eff, area, extraEffects) {
    const tiles = Grid.shapeOffsets('circle', area).map(([dx, dy]) => [p.x + dx, p.y + dy]);
    const targets = BD.sim.targeting.entitiesOnTiles(world, tiles, p.faction);
    ctx.aoe = true;
    ctx.centerId = null;
    world.events.push({
      type: 'ability.explode', abilityId: 'phoenix_strike', x: p.x, y: p.y,
      area: { shape: 'circle', radius: area }, element: eff.element, kind: 'nova',
    });
    const res = Hits.applyEffects(world, ctx, [eff].concat(extraEffects || []), targets);
    if (ab.field) {
      const zone = eff.element === 'cold' ? 'frost_patch' : 'burning_ground';
      BD.sim.zones.ground(world, zone, tiles, { durMs: 3000, faction: 'player', srcId: p.id, amount: avgHit(res) * 0.25 });
    }
    return res;
  }
  function phoenixChain(world, p, ab, ctx, x) {
    const first = BD.sim.targeting.nearestEnemy(world, p.x, p.y, 5, p.faction, { los: true });
    if (!first) return [];
    const cab = Object.assign({}, ab, {
      effects: [{ type: 'damage', source: 'weapon', mult: 1.2, element: 'light' }, { type: 'status', id: 'shocked', needsHit: true }],
      delivery: { kind: 'chain', jumps: 4 + 2 * x, jumpRange: 3, falloff: 0 },
    });
    const baseMult = ctx.packetMult;
    const res = Effects.chain(world, ctx, cab, first, 4 + 2 * x, 3);
    ctx.packetMult = baseMult;
    if (ab.field) {
      for (const r of res) {
        const o = { durMs: 3000, faction: 'player', srcId: p.id, amount: avgHit(res) * 0.1 };
        BD.sim.zones.ground(world, 'static_field', [[r.tgt.x, r.tgt.y]], o);
      }
    }
    return res;
  }
  reg('phoenix_strike.before', (world, p, ab, rank, { a, ctx }) => {
    const n = Math.min(3, ctx.combo);
    const x = ab.extra || 0;
    let results = [];
    if (ab.supernova) {
      const tiles = Grid.shapeOffsets('circle', 3).map(([dx, dy]) => [p.x + dx, p.y + dy]);
      for (const e of BD.sim.targeting.entitiesOnTiles(world, tiles, p.faction)) Hits.pull(world, e, p.x, p.y, 1);
      const extra = [
        { type: 'status', id: 'burning', needsHit: true },
        { type: 'status', id: 'shocked', needsHit: true },
        { type: 'status', id: 'stunned', durMs: 1000 },
      ];
      results = phoenixNova(world, p, ab, ctx, { type: 'damage', source: 'weapon', mult: 1.4 + 0.4 * n, element: 'fire' }, 3, extra);
    } else if (ab.triad) {
      ctx.packetMult *= ab.triad * (1 + (ab.triadPerCombo || 0) * n);
      const fireEff = { type: 'damage', source: 'weapon', mult: 1.4, element: 'fire' };
      const coldEff = { type: 'damage', source: 'weapon', mult: 1.8, element: 'cold' };
      results = phoenixNova(world, p, ab, ctx, fireEff, 2 + x, [{ type: 'status', id: 'burning', needsHit: true }])
        .concat(phoenixChain(world, p, ab, ctx, x))
        .concat(phoenixNova(world, p, ab, ctx, coldEff, 3 + x, [{ type: 'status', id: 'frozen', durMs: 1500 }]));
    } else if (n === 0) results = phoenixNova(world, p, ab, ctx, { type: 'damage', source: 'weapon', mult: 0.8, element: 'fire' }, 1 + x);
    else if (n === 1) {
      results = phoenixNova(world, p, ab, ctx, { type: 'damage', source: 'weapon', mult: 1.4, element: 'fire' }, 2 + x, [
        { type: 'status', id: 'burning', needsHit: true },
      ]);
    } else if (n === 3) {
      results = phoenixNova(world, p, ab, ctx, { type: 'damage', source: 'weapon', mult: 1.8, element: 'cold' }, 3 + x, [
        { type: 'status', id: 'frozen', durMs: 1500 },
      ]);
    } else results = phoenixChain(world, p, ab, ctx, x);
    Effects.afterHits(world, p, ab, rank, a, results);
    return false;
  });
  /** mean total of the hits that landed */
  const avgHit = (res) => {
    let t = 0, n = 0;
    for (const r of res) {
      if (!r.res) continue;
      t += r.res.total;
      n++;
    }
    return n ? t / n : 0;
  };

  // ---------------- Fire Blast ----------------
  reg('fire_blast.before', (world, p, ab, rank, { ctx }) => {
    if (!ab.noComboConsume && Resources.combo(p) > 0) {
      Resources.addCombo(world, p, -1);
      ctx.packetMult *= Skills.fire_blast.params.comboMult;
    }
  });
  reg('fire_blast.lobTargets', (world, p, ab, rank, { tx, ty }) => {
    const out = [[tx, ty, 1, 0]];
    if (ab.bomblets === 5) {
      for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [1, -2], [-1, -2]]) out.push([tx + dx, ty + dy, 0.5, 120]);
    } else if (ab.bomblets) {
      for (const [dx, dy] of [[1, 1], [-1, 1], [0, -1]]) out.push([tx + dx, ty + dy, 0.5, 120]);
    }
    if (Powers.has(p, 'ashen_wraps')) {
      const dx = Math.sign(tx - p.x), dy = Math.sign(ty - p.y);
      out.push([tx + dx * 2, ty + dy * 2, 0.8, 250], [tx + dx * 4, ty + dy * 4, 0.8, 500]);
    }
    return out;
  });

  // ---------------- sentries ----------------
  function sentryCap(world, p, ab) {
    let n = ab.maxSentries || 3;
    if (Powers.has(p, 'gearheart')) n += 2;
    return n + (BD.sim.stats.statsOf(world, p).sentry_max || 0);
  }
  reg('lightning_sentry.summon', (world, p, ab, rank, { tx, ty }) => {
    const f = world.floor;
    if (!Entities.walkable(f, tx, ty)) return;
    const combo = Resources.takeCombo(world, p);
    const durK = 1 + (BD.sim.stats.statsOf(world, p).sentry_dur_pct || 0) / 100;
    const list = Allies.deployed(world, 'lightning_sentry');
    while (list.length >= sentryCap(world, p, ab)) Allies.removeDeploy(world, list.shift());
    Allies.deploy(world, {
      kind: 'lightning_sentry', x: tx, y: ty, shots: Math.round((ab.shots + 2 * combo) * durK),
      timer: ab.intervalMs * 0.5, rank, chain: ab.chain || 0,
    });
  });
  Allies.registerKind('lightning_sentry', {
    tick(world, d, dt) {
      d.timer -= dt;
      if (d.timer > 0) return;
      const p = world.player, ab = BD.sim.abilities.resolved(BD.data.skills.lightning_sentry, d.rank, p);
      d.timer += ab.intervalMs;
      const t = sentryTarget(world, p, d, ab.sentryRange);
      if (!t) return;
      sentryShoot(world, p, d, ab, t);
      d.shots--;
      if (d.shots <= 0) Allies.removeDeploy(world, d);
    },
  });
  function sentryTarget(world, p, d, range) {
    if (ks(p, 'clockwork_mind') && p.lockId != null) {
      // Clockwork Mind: sentries fire at your locked target when they can see it
      const l = Entities.get(world, p.lockId);
      if (l && !dead(l) && within(l.x, l.y, d.x, d.y, range) && BD.sim.targeting.hasLOS(world, d.x, d.y, l.x, l.y)) return l;
    }
    return BD.sim.targeting.nearestEnemy(world, d.x, d.y, range, 'player', { los: true });
  }
  function sentryCtx(world, p, ab, d) {
    const ctx = Effects.baseCtx(world, p, ab, d.rank, null);
    if (!ks(p, 'clockwork_mind')) ctx.noOnHit = true;
    return ctx;
  }
  function sentryShoot(world, p, d, ab, t) {
    const clock = ks(p, 'clockwork_mind');
    const effs = [Object.assign({}, ab.effects[0], { canCrit: clock })].concat(ab.effects.slice(1));
    const ctx = sentryCtx(world, p, ab, d);
    ctx.centerId = t.id;
    world.events.push({ type: 'chain', srcId: p.id, fromX: d.x, fromY: d.y, x: t.x, y: t.y, abilityId: 'lightning_sentry', sentry: true });
    let targets = [t];
    if (ab.sentrySplash) {
      const tiles = Grid.shapeOffsets('circle', ab.sentrySplash).map(([dx, dy]) => [t.x + dx, t.y + dy]);
      targets = BD.sim.targeting.entitiesOnTiles(world, tiles, 'player');
      ctx.aoe = true;
    }
    const res = Hits.applyEffects(world, ctx, effs, targets);
    let jumps = d.chain || ab.chain || 0, from = t;
    const seen = new Set(targets.map((e) => e.id));
    while (jumps-- > 0 && res.length) {
      const next = BD.sim.targeting.nearestEnemy(world, from.x, from.y, 3, 'player', { exclude: seen });
      if (!next) break;
      seen.add(next.id);
      world.events.push({ type: 'chain', srcId: p.id, fromX: from.x, fromY: from.y, x: next.x, y: next.y, abilityId: 'lightning_sentry' });
      Hits.applyEffects(world, ctx, effs, [next]);
      from = next;
    }
  }

  reg('death_sentry.summon', (world, p, ab, rank, { tx, ty }) => {
    if (!Entities.walkable(world.floor, tx, ty)) return;
    const durK = 1 + (BD.sim.stats.statsOf(world, p).sentry_dur_pct || 0) / 100;
    Allies.deploy(world, {
      kind: 'death_sentry', x: tx, y: ty, lifeMs: ab.lifeMs * durK, timer: ab.intervalMs * 0.5,
      rank, corpses: ab.corpses, vulnerable: !!ab.vulnerable,
    });
  });
  function soulPulse(world, p, d, ab) {
    const tiles = Grid.shapeOffsets('circle', 3).map(([dx, dy]) => [d.x + dx, d.y + dy]);
    const targets = BD.sim.targeting.entitiesOnTiles(world, tiles, 'player');
    if (!targets.length) return;
    const ctx = sentryCtx(world, p, ab, d);
    ctx.aoe = true;
    world.events.push({
      type: 'ability.explode', abilityId: 'death_sentry', x: d.x, y: d.y,
      area: { shape: 'circle', radius: 3 }, element: 'phys', kind: 'nova',
    });
    const eff = { type: 'damage', source: 'weapon', mult: ab.soulNova, canCrit: ks(p, 'clockwork_mind'), canDodge: false };
    const res = Hits.applyEffects(world, ctx, [eff], targets);
    const hits = res.filter((r) => r.res && r.res.total > 0).length;
    if (hits > 0) {
      Resources.gain(world, p, 'energy', 5 * hits);
      BD.sim.status.heal(world, p, BD.sim.stats.statsOf(world, p).maxLife * 0.02 * hits);
    }
  }
  Allies.registerKind('death_sentry', {
    tick(world, d, dt) {
      d.lifeMs -= dt;
      d.timer -= dt;
      if (d.lifeMs <= 0) {
        Allies.removeDeploy(world, d);
        return;
      }
      if (d.timer > 0) return;
      const p = world.player, ab = BD.sim.abilities.resolved(BD.data.skills.death_sentry, d.rank, p);
      d.timer += ab.intervalMs;
      if (ab.soulNova) {
        soulPulse(world, p, d, ab);
        return;
      }
      const f = world.floor;
      const corpses = f.corpses
        .filter((c) => within(c.x, c.y, d.x, d.y, 5) && !c.revived)
        .sort((a, b) => cheb(a.x, a.y, d.x, d.y) - cheb(b.x, b.y, d.x, d.y))
        .slice(0, d.corpses);
      if (!corpses.length) {
        const t = sentryTarget(world, p, d, 7);
        if (t) sentryShoot(world, p, d, ab, t);
        return;
      }
      const cap = 3 * Hits.computeHit(world, p, ab, { source: 'weapon', mult: 1 }, 1, { roll: 0.5 }).total;
      for (const c of corpses) {
        f.corpses.splice(f.corpses.indexOf(c), 1);
        const amount = Math.min(c.maxLife * 0.4, cap);
        world.events.push({ type: 'corpse.explode', x: c.x, y: c.y, id: c.id });
        const tiles = Grid.shapeOffsets('circle', 2).map(([dx, dy]) => [c.x + dx, c.y + dy]);
        for (const e of BD.sim.targeting.entitiesOnTiles(world, tiles, 'player')) {
          BD.sim.damage.dealDamage(world, {
            srcId: p.id, tgtId: e.id, amounts: { fire: amount }, tags: ['aoe', 'trap'],
            canCrit: ks(p, 'clockwork_mind'), canDodge: false, canBlock: false, mult: 1,
            abilityId: 'death_sentry', noOnHit: !ks(p, 'clockwork_mind'),
          });
          if (d.vulnerable || ab.vulnerable) BD.sim.status.apply(world, e, 'vulnerable', { durMs: 4000, sourceId: p.id });
          if (ab.plaguePool) BD.sim.status.apply(world, e, 'poisoned', { sourceId: p.id, hit: amount * 0.5 });
        }
        if (ab.plaguePool) {
          BD.sim.zones.ground(world, 'poison_pool', tiles, { durMs: 4000, faction: 'player', srcId: p.id, amount: amount * 0.15 });
        }
      }
    },
  });

  // ---------------- Shadowstep, Smoke Bomb, Shadow Master ----------------
  reg('shadowstep.impact', (world, p, ab, rank) => {
    if (ab.comboOnStep) Resources.addCombo(world, p, ab.comboOnStep);
    if (ab.spreeMs) p._spreeUntil = world.time + ab.spreeMs;
    if (ab.fanMult) {
      const ctx = Effects.baseCtx(world, p, ab, rank, null);
      ctx.aoe = true;
      const tiles = Grid.shapeOffsets('circle', 2).map(([dx, dy]) => [p.x + dx, p.y + dy]);
      const targets = BD.sim.targeting.entitiesOnTiles(world, tiles, p.faction);
      const effs = [
        { type: 'damage', source: 'weapon', mult: ab.fanMult, canCrit: true },
        { type: 'status', id: 'bleeding', needsHit: true },
        { type: 'status', id: 'slowed', durMs: 2000, needsHit: true },
      ];
      Hits.applyEffects(world, ctx, effs, targets);
    }
  });
  Powers.registerCharges('nightspur', (ab, n) => (ab.id === 'shadowstep' ? Math.max(1, n) + 1 : n));
  BD.sim.damage.onKillHooks.push((world, v, killer) => {
    if (!killer || killer.kind !== 'player' || !killer.skills.shadowstep) return;
    if (!(Powers.has(killer, 'nightspur') || (killer._spreeUntil && killer._spreeUntil > world.time))) return;
    const c = killer.charges && killer.charges.shadowstep;
    if (c) {
      const rank = BD.sim.abilities.rankOf(world, killer, 'shadowstep');
      c.n = BD.sim.abilities.maxCharges(world, killer, BD.sim.abilities.resolved(BD.data.skills.shadowstep, rank, killer));
      c.ms = 0;
    }
    killer.cooldowns.shadowstep = 0;
  });

  reg('smoke_bomb.impact', (world, p, ab) => {
    if (ab.comboOnSmoke) Resources.addCombo(world, p, ab.comboOnSmoke);
    const veil = Powers.has(p, 'veilweave');
    const tiles = Grid.shapeOffsets('circle', ab.smoke.radius).map(([dx, dy]) => [p.x + dx, p.y + dy]);
    BD.sim.zones.ground(world, 'smoke', tiles, {
      durMs: ab.smoke.durMs + (veil ? 3000 : 0), faction: 'player', srcId: p.id,
      follow: ab.followSmoke || veil ? p.id : null, cx: p.x, cy: p.y,
    });
    if (ab.chokingGas) {
      const hit = Hits.computeHit(world, p, ab, { source: 'weapon', mult: 0.4 }, 1, { roll: 0.5 }).total;
      BD.sim.zones.ground(world, 'poison_pool', tiles, { durMs: ab.smoke.durMs, faction: 'player', srcId: p.id, amount: hit });
    }
  });

  reg('shadow_master.summon', (world, p, ab, rank) => {
    for (const c of Allies.alliesOf(world, 'clone')) Allies.despawn(world, c);
    const count = ab.cloneCount || 1;
    for (let i = 0; i < count; i++) {
      Allies.spawnAlly(world, p, {
        kind: 'clone', x: p.x + (i ? -1 : 1), y: p.y, art: 'thief',
        pal: { H: '#3a3050', h: '#2a2238', x: '#1a1424', F: '#6a5a8a', f: '#4a3a6a', W: '#c0a0ff' },
        lifeMs: ab.cloneMs, mult: BD.sim.abilities.scale({ mult: ab.cloneMult }, rank), decoy: 0.4, rank, lifePct: 0.6,
      });
    }
    if (ab.summonBlast) {
      const ctx = Effects.baseCtx(world, p, ab, rank, null);
      ctx.aoe = true;
      const tiles = Grid.shapeOffsets('circle', 2).map(([dx, dy]) => [p.x + dx, p.y + dy]);
      const targets = BD.sim.targeting.entitiesOnTiles(world, tiles, p.faction);
      Hits.applyEffects(world, ctx, [{ type: 'damage', source: 'weapon', mult: ab.summonBlast, canCrit: true }], targets);
    }
  });
  /** the clone copies your finishers (and Tiger Strike from rank 3) on its own target */
  Powers.CLASS_AFTER.push((world, p, ab, rank, landed) => {
    if (!isAssassin(p) || !landed.length || !p.skills.shadow_master) return;
    const finisher = ab.resource && ab.resource.combo === 'finish';
    const sm = BD.sim.abilities.resolved(BD.data.skills.shadow_master, BD.sim.abilities.rankOf(world, p, 'shadow_master'), p);
    if (!finisher && !(ab.id === 'tiger_strike' && sm.copiesTiger)) return;
    for (const c of Allies.alliesOf(world, 'clone')) {
      const t = BD.sim.targeting.nearestEnemy(world, c.x, c.y, CLONE_REACH, 'player', null);
      if (!t) continue;
      const ctx = Effects.baseCtx(world, p, ab, rank, null);
      ctx.srcId = c.id;
      ctx.packetMult = c.mult;
      ctx.combo = landed.length ? ctx.combo : 0;
      ctx.noOnHit = true;
      Hits.applyEffects(world, ctx, ab.effects.filter((e) => e.type === 'damage'), [t]);
      world.events.push({ type: 'ability.impact', id: c.id, abilityId: ab.id, x: c.x, y: c.y, tx: t.x, ty: t.y, kind: 'melee' });
    }
  });

  // ---------------- legendaries ----------------
  Powers.registerMod('wormtongue', (ab) => {
    if (ab.id === 'tiger_strike') ab.effects = ab.effects.concat([{ type: 'status', id: 'poisoned', needsHit: true }]);
  });
  Powers.CLASS_AFTER.push((world, p, ab, rank, landed) => {
    const finisher = ab.resource && ab.resource.combo === 'finish';
    if (isAssassin(p) && Powers.has(p, 'marrowfang') && finisher && landed.length) Resources.addCombo(world, p, 1);
  });
  // gearheart / ashen_wraps / veilweave / nightspur are handled above by name

  BD.sim.world.addSystem('unseen', unseenSystem, 36);
  BD.sim.skillsAssassin = { sentryCap };
})(globalThis.BD);
