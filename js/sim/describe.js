// @ts-check
// describe(): tooltip rows for abilities, generated from data through the same math the engine
// uses (computeHit with roll 0/1). The UI never re-implements a formula (06 §7.2).
(function (BD) {
  'use strict';

  const AB = () => BD.sim.abilities;
  const H = () => BD.sim.hits;
  const fmt = BD.core.util.fmtNum;
  const EL = { phys: 'physical', fire: 'fire', cold: 'cold', light: 'lightning', pois: 'poison' };
  const sec = (ms) => fmt(ms / 1000) + ' s';

  /** damage numbers per damage effect at a rank: [{lo, hi, amountsLo, amountsHi, eff}] */
  function numbers(world, p, id, rank, ctx) {
    const base = id === 'attack' ? AB().basicFor(world, p) : AB().def(id);
    const ab = AB().resolved(base, rank);
    const out = [];
    for (const eff of ab.effects.concat(ab.selfEffects || [])) {
      if (eff.type !== 'damage') continue;
      const c = Object.assign({ combo: 0, focus: 0 }, ctx || {});
      const lo = H().computeHit(world, p, ab, eff, rank, Object.assign({}, c, { roll: 0 }));
      const hi = H().computeHit(world, p, ab, eff, rank, Object.assign({}, c, { roll: 1 }));
      out.push({ lo: lo.total, hi: hi.total, amountsLo: lo.amounts, amountsHi: hi.amounts, eff });
    }
    return out;
  }

  function costText(ab) {
    const r = ab.resource || {};
    if (ab.channel) return ab.channel.costPerSec + ' ' + r.type + '/s' + (r.minStart ? ' (' + r.minStart + ' to start)' : '');
    if (!r.type || r.type === 'none' || !r.cost) return r.gen ? 'Builds ' + r.gen + ' ' + r.type : r.combo === 'build' ? 'Builds 1 combo' : 'Free';
    if (r.cost === 'all') return 'All ' + r.type;
    return r.cost + ' ' + r.type;
  }

  function effectText(eff, rank) {
    switch (eff.type) {
      case 'status': {
        const sd = BD.data.statuses[eff.id];
        const dur = eff.durMs != null ? eff.durMs : sd.durMs;
        const chance = eff.chance != null ? Math.round(eff.chance * 100) + '% chance to apply ' : eff.onlyOnCrit ? 'Critical hits apply ' : 'Applies ';
        return chance + sd.name + (dur ? ' (' + sec(dur) + ')' : '');
      }
      case 'knockback': return 'Knocks back ' + eff.dist + ' tile' + (eff.dist > 1 ? 's' : '');
      case 'pull': return 'Pulls enemies inward';
      case 'heal': return 'Heals ' + fmt(eff.perRank ? AB().scale(eff, rank) : AB().scale({ mult: eff.pctMaxLife }, rank)) + '% of maximum life' + (eff.overMs ? ' over ' + sec(eff.overMs) : '');
      case 'cleanse': return 'Removes ' + eff.statuses.map((s) => BD.data.statuses[s].name).join(', ');
      case 'buff': {
        const sd = BD.data.statuses[eff.id];
        const mag = eff.magnitude == null ? null : eff.fixed ? eff.magnitude : eff.perRank ? AB().scale(eff, rank) : AB().scale({ mult: eff.magnitude }, rank);
        return sd.name + (mag != null ? ' ' + fmt(mag) + '%' : '') + ' for ' + sec(eff.durMs);
      }
      case 'resource': return 'Generates ' + eff.gen + ' ' + (eff.res || 'resource');
      case 'combo': return 'Builds ' + eff.add + ' combo';
      default: return null;
    }
  }

  /**
   * @returns {{ id, name, rank, maxRank, tier, branch, cost, cooldown, cast, range, desc, lines:any[], breakpoints:any[], keystone:boolean }}
   */
  function describe(world, p, id, rankOverride) {
    const base = id === 'attack' ? AB().basicFor(world, p) : AB().def(id);
    const rank = rankOverride != null ? rankOverride : Math.max(1, AB().rankOf(world, p, id));
    const ab = AB().resolved(base, rank);
    const out = {
      id, name: base.name, rank, hard: p.skills[id] || 0, maxRank: base.tier === 4 ? 1 : 5, tier: base.tier, branch: base.branch, keystone: !!base.keystone,
      cost: base.keystone ? '' : costText(ab), cooldown: ab.charges ? ab.charges + ' charges, ' + sec(AB().cdTime(world, p, ab)) + ' each' : ab.cooldownMs ? sec(AB().cdTime(world, p, ab)) : '',
      cast: '', range: ab.targeting && ab.targeting.range && ab.targeting.mode !== 'self' ? ab.targeting.range + ' tiles' : '',
      desc: base.desc, lines: [], breakpoints: [],
    };
    if (!base.keystone) {
      const tm = AB().timing(world, p, ab);
      out.cast = ab.channel ? 'Channelled' : sec(tm.windup + tm.recover);
    }
    for (const n of numbers(world, p, id, rank)) {
      const els = Object.keys(n.amountsHi).filter((k) => n.amountsHi[k] > 0.05 * n.hi);
      const elTxt = els.length === 1 && els[0] !== 'phys' ? ' ' + EL[els[0]] : '';
      const src = n.eff.source === 'spell' ? '' : ' (' + fmt(AB().scale(n.eff, rank)) + '× weapon)';
      let extra = '';
      if (n.eff.perCombo) extra += ', +' + fmt(n.eff.perCombo * (1 + 0.2 * (rank - 1))) + '× per combo charge';
      if (n.eff.perFocus) extra += ', +' + fmt(n.eff.perFocus * (1 + 0.2 * (rank - 1))) + '× per focus';
      if (n.eff.missingLife) extra += ', up to +' + Math.round(n.eff.missingLife * 100) + '% vs wounded';
      out.lines.push({ kind: 'damage', text: Math.round(n.lo) + '–' + Math.round(n.hi) + elTxt + ' damage' + src + extra, lo: n.lo, hi: n.hi });
    }
    for (const eff of ab.effects.concat(ab.selfEffects || [])) {
      const t = effectText(eff, rank);
      if (t) out.lines.push({ kind: 'effect', text: t });
    }
    for (const bp of base.breakpoints || []) out.breakpoints.push({ rank: bp.rank, text: bp.text || '', active: rank >= bp.rank });
    return out;
  }

  /** item tooltip view model lives in sim/items_describe.js (M4) */
  BD.sim.describe = { describe, numbers, costText, effectText };
})(globalThis.BD);
