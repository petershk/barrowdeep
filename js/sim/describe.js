// @ts-check
// describe(): tooltip rows for abilities, generated from data through the same math the engine
// uses (computeHit with roll 0/1). The UI never re-implements a formula (06 §7.2).
(function (BD) {
  'use strict';

  const Abilities = () => BD.sim.abilities;
  const Hits = () => BD.sim.hits;
  const fmt = BD.core.util.fmtNum;
  const EL = { phys: 'physical', fire: 'fire', cold: 'cold', light: 'lightning', pois: 'poison' };
  const sec = (ms) => fmt(ms / 1000) + ' s';

  const SkillBalance = BD.data.balance.skills;
  const MINOR_ELEMENT_SHARE = 0.05;    // elements under this share of the hit aren't named

  /** damage numbers per damage effect at a rank: [{lo, hi, amountsLo, amountsHi, eff}] */
  function numbers(world, p, id, rank, ctx) {
    const base = id === 'attack' ? Abilities().basicFor(world, p) : Abilities().def(id);
    const ab = Abilities().resolved(base, rank, p);
    const out = [];
    for (const eff of ab.effects.concat(ab.selfEffects || [])) {
      if (eff.type !== 'damage') continue;
      const c = Object.assign({ combo: 0, focus: 0 }, ctx || {});
      const lo = Hits().computeHit(world, p, ab, eff, rank, Object.assign({}, c, { roll: 0 }));
      const hi = Hits().computeHit(world, p, ab, eff, rank, Object.assign({}, c, { roll: 1 }));
      out.push({ lo: lo.total, hi: hi.total, amountsLo: lo.amounts, amountsHi: hi.amounts, eff });
    }
    return out;
  }

  function costText(ab) {
    const r = ab.resource || {};
    if (ab.channel) return ab.channel.costPerSec + ' ' + r.type + '/s' + (r.minStart ? ' (' + r.minStart + ' to start)' : '');
    if (!r.type || r.type === 'none' || !r.cost) {
      if (r.gen) return 'Builds ' + r.gen + ' ' + r.type;
      return r.combo === 'build' ? 'Builds 1 combo' : 'Free';
    }
    if (r.cost === 'all') return 'All ' + r.type + (r.minStart ? ' (' + r.minStart + ' to start)' : '');
    return r.cost + ' ' + r.type + (r.combo === 'build' ? ', builds 1 combo' : '');
  }

  function cooldownText(world, p, ab) {
    if (ab.charges) return ab.charges + ' charges, ' + sec(Abilities().cdTime(world, p, ab)) + ' each';
    return ab.cooldownMs ? sec(Abilities().cdTime(world, p, ab)) : '';
  }

  /** a rank-scaled magnitude: per-rank effects scale themselves, others scale `base` as a mult */
  function scaledBy(eff, base, rank) {
    return eff.perRank ? Abilities().scale(eff, rank) : Abilities().scale({ mult: base }, rank);
  }

  function effectText(eff, rank) {
    switch (eff.type) {
      case 'status': {
        const sd = BD.data.statuses[eff.id];
        const dur = eff.durMs != null ? eff.durMs : sd.durMs;
        let chance = 'Applies ';
        if (eff.chance != null) chance = Math.round(eff.chance * 100) + '% chance to apply ';
        else if (eff.onlyOnCrit) chance = 'Critical hits apply ';
        return chance + sd.name + (dur ? ' (' + sec(dur) + ')' : '');
      }
      case 'knockback': return 'Knocks back ' + eff.dist + ' tile' + (eff.dist > 1 ? 's' : '');
      case 'pull': return 'Pulls enemies inward';
      case 'heal': {
        const over = eff.overMs ? ' over ' + sec(eff.overMs) : '';
        return 'Heals ' + fmt(scaledBy(eff, eff.pctMaxLife, rank)) + '% of maximum life' + over;
      }
      case 'cleanse': return 'Removes ' + eff.statuses.map((s) => BD.data.statuses[s].name).join(', ');
      case 'buff': {
        const sd = BD.data.statuses[eff.id];
        let mag = null;
        if (eff.magnitude != null) mag = eff.fixed ? eff.magnitude : scaledBy(eff, eff.magnitude, rank);
        return sd.name + (mag != null ? ' ' + fmt(mag) + '%' : '') + ' for ' + sec(eff.durMs);
      }
      case 'resource': return 'Generates ' + eff.gen + ' ' + (eff.res || 'resource');
      case 'combo': return 'Builds ' + eff.add + ' combo';
      default: return null;
    }
  }

  /**
   * @returns {{ id, name, rank, maxRank, tier, branch, cost, cooldown, cast, range, desc,
   *   lines:any[], breakpoints:any[], keystone:boolean, forms:any[], formRank:number }}
   */
  function describe(world, p, id, rankOverride) {
    const base = id === 'attack' ? Abilities().basicFor(world, p) : Abilities().def(id);
    const rank = rankOverride != null ? rankOverride : Math.max(1, Abilities().rankOf(world, p, id));
    const ab = Abilities().resolved(base, rank, p);
    const out = {
      id, name: base.name, rank, hard: p.skills[id] || 0, maxRank: base.tier === 4 ? 1 : 5,
      tier: base.tier, branch: base.branch, keystone: !!base.keystone,
      cost: base.keystone ? '' : costText(ab), cooldown: cooldownText(world, p, ab),
      cast: '', range: ab.targeting && ab.targeting.range && ab.targeting.mode !== 'self' ? ab.targeting.range + ' tiles' : '',
      desc: base.desc, lines: [], breakpoints: [], forms: [], formRank: SkillBalance.formRank,
    };
    if (!base.keystone) {
      const tm = Abilities().timing(world, p, ab);
      out.cast = ab.channel ? 'Channelled' : sec(tm.windup + tm.recover);
    }
    for (const n of numbers(world, p, id, rank)) {
      const els = Object.keys(n.amountsHi).filter((k) => n.amountsHi[k] > MINOR_ELEMENT_SHARE * n.hi);
      const elTxt = els.length === 1 && els[0] !== 'phys' ? ' ' + EL[els[0]] : '';
      const src = n.eff.source === 'spell' ? '' : ' (' + fmt(Abilities().scale(n.eff, rank)) + '× weapon)';
      let extra = '';
      const rk = 1 + SkillBalance.rankScaleStep * (rank - 1);
      if (n.eff.perCombo) extra += ', +' + fmt(n.eff.perCombo * rk) + '× per combo charge';
      if (n.eff.perFocus) extra += ', +' + fmt(n.eff.perFocus * rk) + '× per focus';
      if (n.eff.missingLife) extra += ', up to +' + Math.round(n.eff.missingLife * 100) + '% vs wounded';
      const text = Math.round(n.lo) + '–' + Math.round(n.hi) + elTxt + ' damage' + src + extra;
      out.lines.push({ kind: 'damage', text, lo: n.lo, hi: n.hi });
    }
    for (const eff of ab.effects.concat(ab.selfEffects || [])) {
      const t = effectText(eff, rank);
      if (t) out.lines.push({ kind: 'effect', text: t });
    }
    const form = (base.forms || []).find((f) => f.id === ab.form);
    for (const bp of base.breakpoints || []) {
      const gone = !!(form && form.replaces && form.replaces.includes(bp.rank));
      const text = (bp.text || '') + (gone ? ' (replaced by ' + form.name + ')' : '');
      out.breakpoints.push({ rank: bp.rank, text, active: rank >= bp.rank && !gone });
    }
    out.forms = (base.forms || []).map((f) => ({ id: f.id, name: f.name, verb: f.verb, text: f.text, on: ab.form === f.id }));
    return out;
  }

  /** item tooltip view model lives in sim/items_describe.js (M4) */
  BD.sim.describe = { describe, numbers, costText, effectText };
})(globalThis.BD);
