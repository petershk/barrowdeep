// @ts-check
// Fighter special rules (the parts of 02 §2 that aren't plain effects).
(function (BD) {
  'use strict';

  const Grid = BD.core.grid;
  const Effects = BD.sim.effects;

  const Hits = BD.sim.hits;
  const Entities = BD.sim.entities;
  const Resources = BD.sim.resources;
  const Stats = BD.sim.stats;
  const { DIRS, cheb } = BD.core.util;
  const reg = Effects.register;
  const ks = (p, id) => !!(p.skills && p.skills[id]);
  const dead = (e) => !e || e.hp <= 0 || e.dying;

  const Skills = BD.data.skills;         // keystone numbers live in their skill's `params`

  const RAGE_OVER_TIME_TICKS = 3;        // War Cry r5 rage arrives in this many 1 s ticks
  const EARTHSHAKER_COMMIT_MS = 320;     // knockback immunity through the Earthshaker wind-up

  // ---- Berserk Strike: kill refund (r3), side hits (r5), Bloodlust heal, Forms ----
  reg('berserk_strike.before', (world, p, ab, rank, { a, ctx }) => {
    if (!ab.executeBelow || !a || a.targetId == null) return;
    const tgt = Entities.get(world, a.targetId);
    if (tgt && tgt.hp <= Stats.statsOf(world, tgt).maxLife * ab.executeBelow) ctx.forceCrit = true;
  });
  reg('berserk_strike.landed', (world, p, ab, rank, { landed }) => {
    if (ab.killRefund && landed.some((r) => dead(r.tgt))) Resources.gain(world, p, 'rage', ab.killRefund, true);
    if (ks(p, 'bloodlust') && landed.length) {
      BD.sim.status.heal(world, p, Stats.statsOf(world, p).maxLife * Skills.bloodlust.params.healPct);
    }
  });
  reg('berserk_strike.impact', (world, p, ab, rank, { results, ctx }) => {
    if (!results.length) return;
    const t = results[0].tgt;
    if (ab.bloodbath) {
      const tiles = Grid.shapeOffsets('circle', 1).map(([dx, dy]) => [t.x + dx, t.y + dy]);
      const splash = BD.sim.targeting.entitiesOnTiles(world, tiles, p.faction).filter((e) => e !== t);
      const c2 = Object.assign({}, ctx, { packetMult: ab.bloodbath, centerId: null, aoe: true });
      Hits.applyEffects(world, c2, ab.effects, splash);
    }
    if (!ab.sideHits) return;
    const d = BD.core.util.dirOf(t.x - p.x, t.y - p.y);
    const tiles = [DIRS[(d + 1) % 8], DIRS[(d + 7) % 8]].map(([dx, dy]) => [p.x + dx, p.y + dy]);
    const targets = BD.sim.targeting.entitiesOnTiles(world, tiles, p.faction).filter((e) => e !== t);
    ctx.packetMult = ab.sideHits;
    ctx.centerId = null;
    Hits.applyEffects(world, ctx, [ab.effects[0]], targets);
  });

  // ---- Charge: path knock-aside (r3), kill resets the cooldown (r5), Forms ----
  reg('charge.path', (world, p, ab, rank, { path, ctx }) => {
    if (!ab.pathHits) return;
    const seen = new Set();
    const targets = [];
    for (const [x, y] of path.slice(0, -1)) for (const [dx, dy] of DIRS) {
      const id = world.floor.occ[Grid.idx(world.floor, x + dx, y + dy)];
      if (!id || seen.has(id) || id === ctx.centerId) continue;
      const e = Entities.get(world, id);
      if (e && e.faction !== p.faction) {
        seen.add(id);
        targets.push(e);
      }
    }
    const c2 = Object.assign({}, ctx, { packetMult: ab.pathHits, centerId: null });
    Hits.applyEffects(world, c2, [ab.effects[0]], targets);
    for (const e of targets) {
      Hits.knockback(world, e, p.x, p.y, 1);
      if (ab.pathStunMs) BD.sim.status.apply(world, e, 'stunned', { durMs: ab.pathStunMs, sourceId: p.id });
    }
  });
  reg('charge.landed', (world, p, ab, rank, { landed }) => {
    if (ab.killResets && landed.some((r) => dead(r.tgt))) p.cooldowns.charge = 0;
    if (ab.vanguardShield && landed.length) {
      const amt = Stats.statsOf(world, p).maxLife * ab.vanguardShield;
      BD.sim.status.apply(world, p, 'shielded', { durMs: 5000, magnitude: amt, sourceId: p.id });
    }
  });

  // ---- War Cry: Warlord heal + cooldown, r5 rage over time, Forms ----
  reg('war_cry.impact', (world, p, ab, rank, { results }) => {
    if (ab.cryPull) {
      for (const r of results) Hits.pull(world, r.tgt, p.x, p.y, ab.cryPull);
    }
    if (ab.cryRageNow) Resources.gain(world, p, 'rage', ab.cryRageNow, true);
    if (ks(p, 'warlord')) {
      const wl = Skills.warlord.params;
      const pct = Math.min(wl.healMax, wl.healPerTarget * results.length);
      BD.sim.status.heal(world, p, Stats.statsOf(world, p).maxLife * pct);
    }
    if (ab.rageOverTime) {
      for (let i = 1; i <= RAGE_OVER_TIME_TICKS; i++) {
        BD.core.scheduler.after(world, i * 1000, 'rage.tick', { n: ab.rageOverTime / RAGE_OVER_TIME_TICKS });
      }
    }
    if (BD.sim.powers) BD.sim.powers.onWarCry(world, p, results);
  });
  reg('war_cry.cooldown', (world, p, ab, ms) => (ks(p, 'warlord') ? Skills.warlord.params.cryCdMs : ms));
  BD.core.scheduler.register('rage.tick', (world, pl) => {
    if (!world.player.dead) Resources.gain(world, world.player, 'rage', pl.n, true);
  }, { scope: 'run' });

  // ---- Earthshaker: knockback-immune wind-up, r5 aftershock, Cataclysm ----
  reg('earthshaker.commit', (world, p) => { BD.sim.status.apply(world, p, 'knockback_immune', { durMs: EARTHSHAKER_COMMIT_MS }); });
  reg('earthshaker.impact', (world, p, ab, rank) => {
    if (ab.cataclysmMs) {
      const hit = Hits.computeHit(world, p, ab, ab.effects[0], rank, { roll: 0.5 }).total;
      const rad = (ab.area && ab.area.radius) || 2;
      const tiles = Grid.shapeOffsets('circle', rad).map(([dx, dy]) => [p.x + dx, p.y + dy]);
      BD.sim.zones.ground(world, 'burning_ground', tiles, { durMs: ab.cataclysmMs, faction: 'player', srcId: p.id, amount: hit * 0.2 });
    }
    if (ab.aftershock) {
      BD.core.scheduler.after(world, ab.aftershockMs, 'earthshaker.after', { rank, x: p.x, y: p.y, mult: ab.aftershock });
    }
    if (BD.sim.powers) BD.sim.powers.onEarthshaker(world, p, ab, rank);
  });
  BD.core.scheduler.register('earthshaker.after', (world, pl) => {
    const p = world.player;
    if (p.dead) return;
    const ab = BD.sim.abilities.resolved(BD.data.skills.earthshaker, pl.rank, p);
    const ctx = Effects.baseCtx(world, p, ab, pl.rank, null);
    ctx.packetMult = pl.mult / ab.effects[0].mult;
    world.events.push({
      type: 'ability.impact', id: p.id, abilityId: 'earthshaker',
      x: pl.x, y: pl.y, tx: pl.x, ty: pl.y, kind: 'aftershock', area: ab.area,
    });
    Effects.areaAt(world, ctx, ab, pl.x, pl.y, ab.area, [ab.effects[0]]);
  });

  // ---- Whirlwind: r3 pull per second, Forms ----
  reg('whirlwind.impact', (world, p, ab, rank, { a }) => {
    if (!ab.pullPerSec || !a) return;
    a.pullAcc = (a.pullAcc || 0) + ab.channel.tickMs;
    if (a.pullAcc < 1000) return;
    a.pullAcc -= 1000;
    const maxR = ab.pullRadius || 2;
    for (const e of BD.sim.entities.enemiesOf(world, p.faction)) {
      const d = cheb(e.x, e.y, p.x, p.y);
      if (d >= 2 && d <= maxR) Hits.pull(world, e, p.x, p.y, 1);
    }
  });
  reg('whirlwind.landed', (world, p, ab, rank, { landed }) => {
    if (ab.wwHealPct && landed.length) {
      BD.sim.status.heal(world, p, Stats.statsOf(world, p).maxLife * ab.wwHealPct * landed.length);
    }
  });

  // ---- Second Wind: Iron Skin barrier ----
  reg('second_wind.impact', (world, p, ab) => {
    if (!ab.windShield) return;
    const amt = Stats.statsOf(world, p).maxLife * ab.windShield;
    BD.sim.status.apply(world, p, 'shielded', { durMs: 6000, magnitude: amt, sourceId: p.id });
  });

  // ---- Brace r5 / Retaliation reflect ----
  BD.sim.damage.onHitHooks.push((world, src, tgt, pk, res) => {
    if (tgt.kind !== 'player' || !src || src.faction === tgt.faction || pk.isDot || pk.reflected) return;
    const rank = BD.sim.abilities.rankOf(world, tgt, 'brace');
    if (rank < 1 || !(res.blocked || BD.sim.status.has(tgt, 'braced'))) return;
    const ab = BD.sim.abilities.resolved(BD.data.skills.brace, rank, tgt);
    if (!ab.reflect) return;
    const amt = res.total * ab.reflect;
    if (ab.reflectAoe && BD.sim.status.has(tgt, 'braced')) {
      const tiles = Grid.shapeOffsets('circle', 1).map(([dx, dy]) => [tgt.x + dx, tgt.y + dy]);
      for (const e of BD.sim.targeting.entitiesOnTiles(world, tiles, tgt.faction)) {
        BD.sim.damage.dealDamage(world, {
          srcId: tgt.id, tgtId: e.id, amounts: { phys: amt }, tags: ['reflect', 'aoe'],
          canCrit: false, canDodge: false, canBlock: false, mult: 1, noOnHit: true, reflected: true,
        });
      }
      return;
    }
    BD.sim.damage.dealDamage(world, {
      srcId: tgt.id, tgtId: src.id, amounts: { phys: amt }, tags: ['reflect'],
      canCrit: false, canDodge: false, canBlock: false, mult: 1, noOnHit: true, reflected: true,
    });
  });
})(globalThis.BD);
