// @ts-check
// Hit math shared by the engine and describe(): weapon and spell hits (05 §2.2), per-target effect
// application, knockback / pull. describe() calls computeHit with roll 0/1 so tooltips == sim.
(function (BD) {
  'use strict';

  const E = BD.sim.entities;
  const ST = () => BD.sim.stats;
  const SS = () => BD.sim.status;
  const AB = () => BD.sim.abilities;
  const ELS = ['phys', 'fire', 'cold', 'light', 'pois'];
  const EL_PCT = { fire: 'fire_pct', cold: 'cold_pct', light: 'light_pct', pois: 'pois_pct' };

  const charScale = (L) => 1 + 0.09 * (L - 1);

  /**
   * @param {any} caster the player (owner for allies)
   * @param {any} eff a damage effect
   * @param {{combo?:number, focus?:number, roll?:number, rng?:any, extraMult?:number}} ctx
   * @returns {{amounts:Record<string,number>, total:number}}
   */
  function computeHit(world, caster, ab, eff, rank, ctx) {
    const s = ST().statsOf(world, caster);
    const roll = ctx.roll != null ? ctx.roll : ctx.rng ? ctx.rng.next() : 0.5;
    let mult = eff.mult != null || eff.perRank ? AB().scale(eff, rank) : 1 + 0.2 * (rank - 1);
    const rk = 1 + 0.2 * (rank - 1);
    if (eff.perCombo) mult += eff.perCombo * (ctx.combo || 0) * (eff.perComboScales === false ? 1 : rk);
    if (eff.perFocus) mult += eff.perFocus * (ctx.focus || 0) * (eff.perFocusScales === false ? 1 : rk);
    if (eff.perFocusPct) mult *= 1 + eff.perFocusPct * (ctx.focus || 0);
    mult *= ctx.extraMult || 1;
    const tags = ab.tags || [];
    const amounts = {};
    if (eff.source === 'spell') {
      const lo = eff.base[0], hi = eff.base[1];
      const base = (lo + roll * (hi - lo)) * charScale(caster.level || 1) * (1 + 0.03 * s.mag);
      const el = eff.element || 'fire';
      const pct = s.spell_pct + (EL_PCT[el] ? s[EL_PCT[el]] : 0) + (tags.includes('aoe') ? s.area_pct : 0) + (s.dmg_pct_spell || 0);
      amounts[el] = base * (1 + pct / 100) * mult;
    } else if (eff.source === 'fixed') {
      amounts[eff.element || 'phys'] = (ctx.fixed || 0) * mult;
    } else {
      const w = s.weapon;
      const lo = w.dmg[0], hi = w.dmg[1];
      let pct = s.dmg_pct;
      if (tags.includes('projectile')) pct += s.projectile_pct;
      if (tags.includes('aoe')) pct += s.area_pct;
      if (w.wieldStat === 'mag') pct += s.spell_pct * 0;  // Mag weapons scale through the wield stat only
      const phys = (lo + roll * (hi - lo)) * (1 + 0.03 * s.wieldValue) * (1 + pct / 100);
      // conversion (e.g. Sky Spear: half lightning)
      const conv = eff.convert || null;
      let physLeft = phys;
      if (conv) {
        for (const el in conv) {
          const part = phys * conv[el];
          physLeft -= part;
          amounts[el] = (amounts[el] || 0) + part * (1 + (s[EL_PCT[el]] || 0) / 100);
        }
      }
      if (eff.element && eff.element !== 'phys' && !conv) {
        amounts[eff.element] = phys * (1 + (s[EL_PCT[eff.element]] || 0) / 100);
        physLeft = 0;
      }
      if (physLeft > 0) amounts.phys = physLeft;
      // flat elemental adds
      for (const el of ['fire', 'cold', 'light', 'pois']) {
        const add = s[el + '_add'];
        if (add) amounts[el] = (amounts[el] || 0) + add * (1 + (s[EL_PCT[el]] || 0) / 100);
      }
      for (const el in amounts) amounts[el] *= mult;
    }
    let total = 0;
    for (const el in amounts) total += amounts[el];
    return { amounts, total };
  }

  /** knockback one tile at a time (60 ms/tile); stops at the last free tile. Returns collision info. */
  function knockback(world, tgt, fromX, fromY, dist) {
    if (!tgt || tgt.hp <= 0) return { moved: 0 };
    if (immuneToKnock(world, tgt)) return { moved: 0, immune: true };
    const f = world.floor;
    let dx = Math.sign(tgt.x - fromX), dy = Math.sign(tgt.y - fromY);
    if (!dx && !dy) { const d = BD.core.util.DIRS[(tgt.dir + 4) % 8]; dx = d[0]; dy = d[1]; }
    let x = tgt.x, y = tgt.y, moved = 0, collided = null;
    for (let i = 0; i < dist; i++) {
      const nx = x + dx, ny = y + dy;
      let blocked = !E.walkable(f, nx, ny);
      // diagonal steps may not cut a wall corner
      if (!blocked && dx && dy) blocked = !(E.walkable(f, x + dx, y) && E.walkable(f, x, y + dy));
      if (blocked) { collided = { wall: true }; break; }
      const occ = E.occupant(f, nx, ny);
      if (occ) { collided = { entityId: occ }; break; }
      x = nx; y = ny; moved++;
    }
    if (moved) {
      BD.sim.movement.displace(world, tgt, x, y, 60 * moved, 'knock');
      if (tgt.kind === 'monster' && tgt.ai) tgt.ai.timer = Math.max(tgt.ai.timer, 60 * moved);
      if (tgt.kind === 'player') BD.sim.fov.refresh(world);
    }
    return { moved, collided };
  }
  function immuneToKnock(world, e) {
    if (BD.sim.entities.rankOf(e).steady) return true;
    if (e.mods && e.mods.indexOf('stone_skin') >= 0) return true;
    if (e.kind === 'monster' && BD.data.monsters[e.def] && BD.data.monsters[e.def].spawner) return true;
    return !!ST().statsOf(world, e).knockback_immune;
  }
  function pull(world, tgt, toX, toY, dist) {
    if (immuneToKnock(world, tgt)) return;
    const f = world.floor;
    const dx = Math.sign(toX - tgt.x), dy = Math.sign(toY - tgt.y);
    const nx = tgt.x + dx, ny = tgt.y + dy;
    if ((nx === toX && ny === toY) || !E.isFree(f, nx, ny)) return;
    BD.sim.movement.displace(world, tgt, nx, ny, 60 * dist, 'knock');
  }

  /**
   * Apply one effect to one target. ctx: { caster, srcId, ab, rank, combo, focus, cx, cy, packetMult, tags }
   * Returns the damage result for damage effects.
   */
  function applyEffect(world, ctx, eff, tgt, prev) {
    const caster = ctx.caster;
    if (eff.onlyOnCrit && !(prev && prev.crit)) return null;
    if (eff.targets === 'center' && ctx.centerId != null && tgt.id !== ctx.centerId) return null;
    if (eff.chance != null) {
      const chanceMult = eff.type === 'status' ? ST().statsOf(world, caster).statusChanceMult : 1;
      if (!world.rng.chance(eff.chance * chanceMult)) return null;
    }
    switch (eff.type) {
      case 'damage': {
        let xm = (ctx.packetMult || 1) * (eff.areaFalloff && tgt.id !== ctx.centerId ? eff.areaFalloff : 1);
        if (eff.missingLife) {
          const mx = ST().statsOf(world, tgt).maxLife;
          xm *= 1 + Math.min(eff.missingLife, Math.max(0, 1 - tgt.hp / mx));
        }
        const h = computeHit(world, caster, ctx.ab, eff, ctx.rank, {
          combo: ctx.combo, focus: ctx.focus, rng: world.rng, extraMult: xm, fixed: ctx.fixed,
        });
        const tags = (ctx.tags || ctx.ab.tags || []).slice();
        if (ctx.aoe && tags.indexOf('aoe') < 0) tags.push('aoe');
        const r = BD.sim.damage.dealDamage(world, {
          srcId: ctx.srcId != null ? ctx.srcId : caster.id, tgtId: tgt.id, amounts: h.amounts, tags, canCrit: eff.canCrit !== false,
          canDodge: eff.canDodge !== false, canBlock: eff.canBlock !== false, mult: 1, abilityId: ctx.ab.id, forceCrit: !!ctx.forceCrit,
          critChanceAdd: ctx.critAdd || 0, noOnHit: !!ctx.noOnHit,
        });
        return r;
      }
      case 'status': {
        if (prev === null && eff.needsHit) return null;
        const mag = eff.magnitude != null ? (eff.scaleMag ? AB().scale({ mult: eff.magnitude }, ctx.rank) : eff.magnitude) : undefined;
        const hit = prev && prev.total ? prev.total : 0;
        SS().apply(world, tgt, eff.id, { durMs: eff.durMs, magnitude: mag, sourceId: caster.id, hit });
        return null;
      }
      case 'knockback': {
        const kb = knockback(world, tgt, ctx.cx != null ? ctx.cx : caster.x, ctx.cy != null ? ctx.cy : caster.y, eff.dist);
        if (kb.collided && eff.collide) BD.sim.effects.special(world, caster, ctx.ab, ctx.rank, 'collide', { tgt, kb, ctx });
        return null;
      }
      case 'pull': pull(world, tgt, caster.x, caster.y, eff.dist || 1); return null;
      case 'heal': {
        const max = ST().statsOf(world, tgt).maxLife;
        const amt = (max * (eff.perRank ? AB().scale(eff, ctx.rank) : AB().scale({ mult: eff.pctMaxLife }, ctx.rank))) / 100;
        if (eff.overMs) SS().apply(world, tgt, 'healing', { durMs: eff.overMs, magnitude: amt });
        else SS().heal(world, tgt, amt);
        return null;
      }
      case 'cleanse': SS().cleanse(world, tgt, eff.statuses); return null;
      case 'buff': {
        let mag;
        if (eff.magnitude == null) mag = undefined;
        else if (eff.fixed) mag = eff.magnitude;
        else if (eff.perRank) mag = AB().scale(eff, ctx.rank);
        else mag = AB().scale({ mult: eff.magnitude }, ctx.rank);
        const dur = eff.durKey && ctx.ab[eff.durKey] ? ctx.ab[eff.durKey] : eff.durMs;
        SS().apply(world, tgt, eff.id, { durMs: dur, magnitude: mag, sourceId: caster.id });
        return null;
      }
      case 'resource': BD.sim.resources.gain(world, caster, eff.res || BD.sim.resources.kind(caster), eff.gen); return null;
      case 'combo': BD.sim.resources.addCombo(world, caster, eff.add); return null;
      case 'special': BD.sim.effects.special(world, caster, ctx.ab, ctx.rank, eff.id, { tgt, ctx, eff, prev }); return null;
      default: return null;
    }
  }

  /** Apply an effect list to targets in order; damage results feed later effects (onlyOnCrit, needsHit). */
  function applyEffects(world, ctx, effects, targets) {
    const results = [];
    for (const tgt of targets) {
      let prev = null;
      for (const eff of effects) {
        if (tgt.hp <= 0 && eff.type !== 'damage') { if (eff.type !== 'special') continue; }
        const r = applyEffect(world, ctx, eff, tgt, prev);
        if (eff.type === 'damage') prev = r;
      }
      results.push({ tgt, res: prev });
    }
    return results;
  }

  BD.sim.hits = { computeHit, charScale, knockback, immuneToKnock, pull, applyEffect, applyEffects, ELS, EL_PCT };
})(globalThis.BD);
