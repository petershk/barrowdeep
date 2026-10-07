// @ts-check
// statsOf(world, entity): derived numbers with a per-source breakdown, memoised on statsVersion.
// The UI reads breakdowns from here; it never re-implements a formula (06 §13).
(function (BD) {
  'use strict';

  const B = BD.data.balance;
  const REG = BD.data.stats;
  let globalVersion = 0;                 // bumped by data patches (Data Lab) so everything recomputes
  function bumpAll() { globalVersion++; }

  function newStats() {
    const s = { bd: {} };
    for (const k in REG.defs) s[k] = REG.defs[k].stacking === 'flag' ? false : REG.BASE[k] || 0;
    s.dr_pct = 0;
    return s;
  }
  /** add a contribution with its source to the breakdown */
  function add(s, key, v, source) {
    const d = REG.defs[key];
    if (!d) throw new Error('unknown stat key: ' + key);
    if (!v && d.stacking !== 'flag') return;
    if (d.stacking === 'add') s[key] += v;
    else if (d.stacking === 'mult') s[key] = 100 - (100 - s[key]) * (1 - v / 100);
    else if (d.stacking === 'max') s[key] = Math.max(s[key], v);
    else if (d.stacking === 'min') s[key] = Math.min(s[key], v);
    else if (d.stacking === 'flag') s[key] = s[key] || !!v;
    (s.bd[key] || (s.bd[key] = [])).push({ source, value: v });
  }

  const FISTS = { category: 'fists', wieldStat: 'str', dmg: [1, 3], speedMs: 550, hands: 1, range: 1, fx: 'club', name: 'Fists' };

  function playerStats(world, p) {
    const s = newStats();
    const base = B.player.attrBase[p.cls];
    for (const a of ['str', 'dex', 'mag', 'vit']) {
      add(s, a, base[a], 'Base');
      if (p.attrs[a] - base[a]) add(s, a, p.attrs[a] - base[a], 'Level-up points');
    }
    // gear
    const items = BD.sim.items;
    let weapon = FISTS;
    s.blockBase = 0;
    for (const slot in p.equip) {
      const it = p.equip[slot];
      if (!it || !items) continue;
      const d = items.derive(it);
      if (slot === 'weapon') weapon = d;
      if (d.armor) add(s, 'armor', d.armor, d.name);
      if (d.block) { add(s, 'block', d.block, d.name); s.blockBase += d.block; }
      for (const k in d.mods) add(s, k, d.mods[k], d.name);
    }
    // passives, keystones, legendary powers, class traits
    if (BD.sim.abilities) BD.sim.abilities.passiveMods(world, p, (k, v, src) => add(s, k, v, src));
    if (BD.sim.resources) BD.sim.resources.traitMods(world, p, (k, v, src) => add(s, k, v, src));
    // run-level: blessing, background, difficulty
    if (BD.sim.economy) BD.sim.economy.runMods(world, p, (k, v, src) => add(s, k, v, src));
    // statuses / buffs
    if (BD.sim.status) BD.sim.status.statMods(world, p, (k, v, src) => add(s, k, v, src));
    if (s.all_attr) for (const a of ['str', 'dex', 'mag', 'vit']) add(s, a, s.all_attr, 'All Attributes');

    // ---- derived ----
    const L = p.level;
    s.maxLife = Math.round((B.player.lifeBase + B.player.lifePerLevel * (L - 1) + B.player.lifePerVit * s.vit + s.life) * (1 + s.life_pct / 100));
    s.bdLife = [{ source: 'Base', value: B.player.lifeBase }, { source: 'Level ' + L, value: B.player.lifePerLevel * (L - 1) }, { source: 'Vitality ×' + B.player.lifePerVit, value: B.player.lifePerVit * s.vit }];
    s.maxMana = p.cls === 'magician' ? Math.round(B.player.manaBase + B.player.manaPerLevel * (L - 1) + B.player.manaPerMag * s.mag + s.mana) : 0;
    s.manaRegenPerS = B.player.manaRegenBase + B.player.manaRegenPerMag * s.mag + s.mana_regen;
    s.armorTotal = Math.round((s.armor + 0.5 * s.str) * (1 + s.armor_pct / 100));
    s.evasionTotal = Math.round(s.evasion + 2 * s.dex);
    s.critChance = Math.min(B.combat.critCap, s.crit + 0.1 * s.dex);
    s.critMult = 1 + s.crit_dmg / 100;
    s.blockChance = s.blockBase > 0 ? Math.min(B.combat.blockCap, s.block + Math.max(0, s.dex - 10) * B.combat.blockPerDexOver10) : 0;
    const pen = BD.data.difficulties ? BD.data.difficulties[world.run.difficulty].resistPenalty + (world.run.ascension >= 8 ? -20 : 0) : 0;
    const cap = B.combat.resistCap + Math.min(B.combat.resistMaxBonus, s.res_max);
    s.res = {};
    for (const el of ['fire', 'cold', 'light', 'pois']) s.res[el] = Math.max(B.combat.resistMin, Math.min(cap, s['res_' + el] + s.res_all + pen));
    s.res.phys = 0;
    s.resCap = cap;
    s.weapon = weapon;
    s.wieldValue = s[weapon.wieldStat] || 0;
    s.attackCycleMs = weapon.speedMs / (1 + s.ias / 100);
    s.moveMs = B.player.moveMs / (1 + s.move_pct / 100);
    s.spellCastMs = B.player.spellCastMs / (1 + s.ias / 100);
    s.statusChanceMult = 1 + B.combat.statusChanceMagK * s.mag;
    return s;
  }

  function monsterStats(world, e) {
    const def = BD.data.monsters[e.def] || BD.data.bosses && BD.data.bosses[e.def];
    const s = newStats();
    const al = e.al || 1;
    const M = B.monsters;
    const rank = M.ranks[e.rank] || M.ranks.normal;
    const diff = BD.data.difficulties ? BD.data.difficulties[world.run.difficulty] : { hp: 1, dmg: 1, xp: 1 };
    const actK = BD.data.balance.monsters.actDmg ? BD.data.balance.monsters.actDmg[Math.min(4, def.act || 1)] || 1 : 1;
    const actH = M.actHp ? M.actHp[Math.min(4, def.act || 1)] || 1 : 1;
    const hpK = M.hpExp ? Math.pow(al, M.hpExp) : Math.pow(M.hpGrowth, al - 1);
    s.maxLife = Math.max(1, Math.round((e.hpBase || def.hp * hpK * rank.hp * actH * (def.hpMult || 1)) * diff.hp * (e.hpMult || 1)));
    const dmgK = Math.pow(M.dmgGrowth, al - 1) * rank.dmg * diff.dmg * actK * (e.dmgMult || 1);
    s.dmgLo = def.dmg[0] * dmgK; s.dmgHi = def.dmg[1] * dmgK;
    s.attackCycleMs = def.attackMs;
    s.moveMs = def.moveMs;
    s.windupMs = def.windupMs || M.defaultWindupMs;
    add(s, 'dr_pct', def.dr || 0, 'Base');
    s.res = Object.assign({ phys: 0 }, def.res);
    s.critChance = 0; s.critMult = 1.5;
    s.evadeChance = 0;
    for (const b of def.behaviours || []) if (b.id === 'evade') s.evadeChance = b.pct;
    if (BD.sim.monsters) BD.sim.monsters.modStats(world, e, s, (k, v, src) => add(s, k, v, src));
    if (BD.sim.status) BD.sim.status.statMods(world, e, (k, v, src) => add(s, k, v, src));
    s.statusChanceMult = 1;
    return s;
  }

  /** @returns {any} */
  function statsOf(world, e) {
    const v = e.statsVersion + ':' + globalVersion + ':' + (e.kind === 'player' ? e.level : e.al);
    if (e._stats && e._statsV === v) return e._stats;
    const s = e.kind === 'player' ? playerStats(world, e) : e.kind === 'ally' && BD.sim.allies ? BD.sim.allies.stats(world, e) : monsterStats(world, e);
    Object.defineProperty(e, '_stats', { value: s, writable: true, configurable: true, enumerable: false });
    Object.defineProperty(e, '_statsV', { value: v, writable: true, configurable: true, enumerable: false });
    return s;
  }
  function bump(e) { e.statsVersion = (e.statsVersion || 0) + 1; }

  BD.sim.stats = { statsOf, bump, bumpAll, add, newStats, FISTS };
})(globalThis.BD);
