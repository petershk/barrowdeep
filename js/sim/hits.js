// @ts-check
// Hit math shared by the engine and describe(): weapon and spell hits (05 §2.2), per-target effect
// application, knockback / pull. describe() calls computeHit with roll 0/1 so tooltips == sim.
(function (BD) {
  'use strict';

  const Entities = BD.sim.entities;
  const Stats = () => BD.sim.stats;
  const Status = () => BD.sim.status;
  const Abilities = () => BD.sim.abilities;
  const ELS = ['phys', 'fire', 'cold', 'light', 'pois'];
  const EL_PCT = { fire: 'fire_pct', cold: 'cold_pct', light: 'light_pct', pois: 'pois_pct' };

  const PlayerBalance = BD.data.balance.player;
  const SkillBalance = BD.data.balance.skills;

  const MID_ROLL = 0.5;                // damage roll used when no roll or rng is given
  const KNOCK_MS_PER_TILE = 60;

  const charScale = (L) => 1 + PlayerBalance.charScalePerLevel * (L - 1);

  /** the 0..1 damage roll: a fixed roll (tooltips), else the rng, else the midpoint */
  function rollOf(ctx) {
    if (ctx.roll != null) return ctx.roll;
    return ctx.rng ? ctx.rng.next() : MID_ROLL;
  }

  /**
   * @param {any} caster the player (owner for allies)
   * @param {any} eff a damage effect
   * @param {{combo?:number, focus?:number, roll?:number, rng?:any, extraMult?:number, fixed?:number}} ctx
   * @returns {{amounts:Record<string,number>, total:number}}
   */
  function computeHit(world, caster, ab, eff, rank, ctx) {
    const s = Stats().statsOf(world, caster);
    const roll = rollOf(ctx);
    let mult = eff.mult != null || eff.perRank ? Abilities().scale(eff, rank) : 1 + SkillBalance.rankScaleStep * (rank - 1);
    const rk = 1 + SkillBalance.rankScaleStep * (rank - 1);
    if (eff.perCombo) mult += eff.perCombo * (ctx.combo || 0) * (eff.perComboScales === false ? 1 : rk);
    if (eff.perFocus) mult += eff.perFocus * (ctx.focus || 0) * (eff.perFocusScales === false ? 1 : rk);
    if (eff.perFocusPct) mult *= 1 + eff.perFocusPct * (ctx.focus || 0);
    mult *= ctx.extraMult || 1;
    const tags = ab.tags || [];
    /** @type {Record<string, number>} */
    const amounts = {};
    if (eff.source === 'spell') {
      const lo = eff.base[0], hi = eff.base[1];
      const base = (lo + roll * (hi - lo)) * charScale(caster.level || 1) * (1 + PlayerBalance.dmgPerAttr * s.mag);
      const el = eff.element || 'fire';
      const elementPct = EL_PCT[el] ? s[EL_PCT[el]] : 0;
      const areaPct = tags.includes('aoe') ? s.area_pct : 0;
      const pct = s.spell_pct + elementPct + areaPct + (s.dmg_pct_spell || 0);
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
      const phys = (lo + roll * (hi - lo)) * (1 + PlayerBalance.dmgPerAttr * s.wieldValue) * (1 + pct / 100);
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
    if (!dx && !dy) {
      // pushed from its own tile: fly backwards (opposite of facing)
      const d = BD.core.util.DIRS[(tgt.dir + 4) % 8];
      dx = d[0];
      dy = d[1];
    }
    let x = tgt.x, y = tgt.y, moved = 0, collided = null;
    for (let i = 0; i < dist; i++) {
      const nx = x + dx, ny = y + dy;
      let blocked = !Entities.walkable(f, nx, ny);
      // diagonal steps may not cut a wall corner
      if (!blocked && dx && dy) blocked = !(Entities.walkable(f, x + dx, y) && Entities.walkable(f, x, y + dy));
      if (blocked) {
        collided = { wall: true };
        break;
      }
      const occ = Entities.occupant(f, nx, ny);
      if (occ) {
        collided = { entityId: occ };
        break;
      }
      x = nx;
      y = ny;
      moved++;
    }
    if (moved) {
      BD.sim.movement.displace(world, tgt, x, y, KNOCK_MS_PER_TILE * moved, 'knock');
      if (tgt.kind === 'monster' && tgt.ai) tgt.ai.timer = Math.max(tgt.ai.timer, KNOCK_MS_PER_TILE * moved);
      if (tgt.kind === 'player') BD.sim.fov.refresh(world);
    }
    return { moved, collided };
  }
  function immuneToKnock(world, e) {
    if (BD.sim.entities.rankOf(e).steady) return true;
    if (e.mods && e.mods.indexOf('stone_skin') >= 0) return true;
    if (e.kind === 'monster' && BD.data.monsters[e.def] && BD.data.monsters[e.def].spawner) return true;
    return !!Stats().statsOf(world, e).knockback_immune;
  }
  function pull(world, tgt, toX, toY, dist) {
    if (immuneToKnock(world, tgt)) return;
    const f = world.floor;
    const dx = Math.sign(toX - tgt.x), dy = Math.sign(toY - tgt.y);
    const nx = tgt.x + dx, ny = tgt.y + dy;
    if ((nx === toX && ny === toY) || !Entities.isFree(f, nx, ny)) return;
    BD.sim.movement.displace(world, tgt, nx, ny, KNOCK_MS_PER_TILE * dist, 'knock');
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
      const chanceMult = eff.type === 'status' ? Stats().statsOf(world, caster).statusChanceMult : 1;
      if (!world.rng.chance(eff.chance * chanceMult)) return null;
    }
    const apply = EFFECT_TYPES[eff.type];
    if (!apply) return null;
    return apply(world, ctx, eff, tgt, prev, caster);
  }

  /** per effect type: (world, ctx, eff, tgt, prev, caster) → damage result or null */
  const EFFECT_TYPES = {
    damage: applyDamage,
    status(world, ctx, eff, tgt, prev, caster) {
      if (prev === null && eff.needsHit) return null;
      let mag;
      if (eff.magnitude != null) mag = eff.scaleMag ? Abilities().scale({ mult: eff.magnitude }, ctx.rank) : eff.magnitude;
      const hit = prev && prev.total ? prev.total : 0;
      Status().apply(world, tgt, eff.id, { durMs: eff.durMs, magnitude: mag, sourceId: caster.id, hit });
      return null;
    },
    knockback(world, ctx, eff, tgt, prev, caster) {
      const fromX = ctx.cx != null ? ctx.cx : caster.x;
      const fromY = ctx.cy != null ? ctx.cy : caster.y;
      const kb = knockback(world, tgt, fromX, fromY, eff.dist);
      if (kb.collided && eff.collide) BD.sim.effects.special(world, caster, ctx.ab, ctx.rank, 'collide', { tgt, kb, ctx });
      return null;
    },
    pull(world, ctx, eff, tgt, prev, caster) {
      pull(world, tgt, caster.x, caster.y, eff.dist || 1);
      return null;
    },
    heal(world, ctx, eff, tgt) {
      const max = Stats().statsOf(world, tgt).maxLife;
      const pct = eff.perRank ? Abilities().scale(eff, ctx.rank) : Abilities().scale({ mult: eff.pctMaxLife }, ctx.rank);
      const amt = (max * pct) / 100;
      if (eff.overMs) Status().apply(world, tgt, 'healing', { durMs: eff.overMs, magnitude: amt });
      else Status().heal(world, tgt, amt);
      return null;
    },
    cleanse(world, ctx, eff, tgt) {
      Status().cleanse(world, tgt, eff.statuses);
      return null;
    },
    buff(world, ctx, eff, tgt, prev, caster) {
      let mag;
      if (eff.magnitude == null) mag = undefined;
      else if (eff.fixed) mag = eff.magnitude;
      else if (eff.perRank) mag = Abilities().scale(eff, ctx.rank);
      else mag = Abilities().scale({ mult: eff.magnitude }, ctx.rank);
      const dur = eff.durKey && ctx.ab[eff.durKey] ? ctx.ab[eff.durKey] : eff.durMs;
      Status().apply(world, tgt, eff.id, { durMs: dur, magnitude: mag, sourceId: caster.id });
      return null;
    },
    resource(world, ctx, eff, tgt, prev, caster) {
      BD.sim.resources.gain(world, caster, eff.res || BD.sim.resources.kind(caster), eff.gen);
      return null;
    },
    combo(world, ctx, eff, tgt, prev, caster) {
      BD.sim.resources.addCombo(world, caster, eff.add);
      return null;
    },
    special(world, ctx, eff, tgt, prev, caster) {
      BD.sim.effects.special(world, caster, ctx.ab, ctx.rank, eff.id, { tgt, ctx, eff, prev });
      return null;
    },
  };

  function applyDamage(world, ctx, eff, tgt, prev, caster) {
    let xm = (ctx.packetMult || 1) * (eff.areaFalloff && tgt.id !== ctx.centerId ? eff.areaFalloff : 1);
    if (eff.missingLife) {
      const mx = Stats().statsOf(world, tgt).maxLife;
      xm *= 1 + Math.min(eff.missingLife, Math.max(0, 1 - tgt.hp / mx));
    }
    const h = computeHit(world, caster, ctx.ab, eff, ctx.rank, {
      combo: ctx.combo, focus: ctx.focus, rng: world.rng, extraMult: xm, fixed: ctx.fixed,
    });
    const tags = (ctx.tags || ctx.ab.tags || []).slice();
    if (ctx.aoe && tags.indexOf('aoe') < 0) tags.push('aoe');
    return BD.sim.damage.dealDamage(world, {
      srcId: ctx.srcId != null ? ctx.srcId : caster.id, tgtId: tgt.id, amounts: h.amounts, tags, canCrit: eff.canCrit !== false,
      canDodge: eff.canDodge !== false, canBlock: eff.canBlock !== false, mult: 1, abilityId: ctx.ab.id, forceCrit: !!ctx.forceCrit,
      critChanceAdd: ctx.critAdd || 0, noOnHit: !!ctx.noOnHit,
    });
  }

  /** Apply an effect list to targets in order; damage results feed later effects (onlyOnCrit, needsHit). */
  function applyEffects(world, ctx, effects, targets) {
    const results = [];
    for (const tgt of targets) {
      let prev = null;
      for (const eff of effects) {
        // once the target is down only damage and special effects still run
        if (tgt.hp <= 0 && eff.type !== 'damage' && eff.type !== 'special') continue;
        const r = applyEffect(world, ctx, eff, tgt, prev);
        if (eff.type === 'damage') prev = r;
      }
      results.push({ tgt, res: prev });
    }
    return results;
  }

  BD.sim.hits = { computeHit, charScale, knockback, immuneToKnock, pull, applyEffect, applyEffects, ELS, EL_PCT };
})(globalThis.BD);
