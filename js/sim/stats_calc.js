// @ts-check
// statsOf(world, entity): derived numbers with a per-source breakdown, memoised on statsVersion.
// The UI reads breakdowns from here; it never re-implements a formula (06 §13).
(function (BD) {
  'use strict';

  const Balance = BD.data.balance;
  const REG = BD.data.stats;
  let globalVersion = 0;                 // bumped by data patches (Data Lab) so everything recomputes
  function bumpAll() { globalVersion++; }

  const ATTRS = ['str', 'dex', 'mag', 'vit'];
  const Ascension = BD.data.ascension;
  const LAST_ACT = BD.data.floors.LAST_ACT;  // per-act monster tables stop here (the Sanctum uses act 4)
  const MONSTER_CRIT_MULT = 1.5;         // monsters never crit; the multiplier is only a placeholder

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
    addAttributes(s, p);
    const weapon = addGear(s, p);
    addModifiers(world, s, p);
    deriveLifeAndMana(s, p);
    deriveDefence(s);
    deriveResists(world, s);
    s.weapon = weapon;
    s.wieldValue = s[weapon.wieldStat] || 0;
    s.attackCycleMs = weapon.speedMs / (1 + s.ias / 100);
    s.moveMs = Balance.player.moveMs / (1 + s.move_pct / 100);
    s.spellCastMs = Balance.player.spellCastMs / (1 + s.ias / 100);
    s.statusChanceMult = 1 + Balance.combat.statusChanceMagK * s.mag;
    return s;
  }

  function addAttributes(s, p) {
    const base = Balance.player.attrBase[p.cls];
    for (const a of ATTRS) {
      add(s, a, base[a], 'Base');
      if (p.attrs[a] - base[a]) add(s, a, p.attrs[a] - base[a], 'Level-up points');
    }
  }

  /** armor, block and affixes of equipped items; returns the weapon (fists when none) */
  function addGear(s, p) {
    const items = BD.sim.items;
    let weapon = FISTS;
    s.blockBase = 0;
    for (const slot in p.equip) {
      const it = p.equip[slot];
      if (!it || !items) continue;
      const d = items.derive(it);
      if (slot === 'weapon') weapon = d;
      if (d.armor) add(s, 'armor', d.armor, d.name);
      if (d.block) {
        add(s, 'block', d.block, d.name);
        s.blockBase += d.block;
      }
      for (const k in d.mods) add(s, k, d.mods[k], d.name);
    }
    return weapon;
  }

  function addModifiers(world, s, p) {
    // passives, keystones, legendary powers, class traits
    if (BD.sim.abilities) BD.sim.abilities.passiveMods(world, p, (k, v, src) => add(s, k, v, src));
    if (BD.sim.resources) BD.sim.resources.traitMods(world, p, (k, v, src) => add(s, k, v, src));
    // run-level: blessing, background, difficulty
    if (BD.sim.economy) BD.sim.economy.runMods(world, p, (k, v, src) => add(s, k, v, src));
    // statuses / buffs
    if (BD.sim.status) BD.sim.status.statMods(world, p, (k, v, src) => add(s, k, v, src));
    if (s.all_attr) for (const a of ATTRS) add(s, a, s.all_attr, 'All Attributes');
  }

  function deriveLifeAndMana(s, p) {
    const L = p.level;
    const flatLife = Balance.player.lifeBase + Balance.player.lifePerLevel * (L - 1) + Balance.player.lifePerVit * s.vit + s.life;
    const classPct = BD.data.classes[p.cls].lifePct || 0;   // a class's own toughness (the Assassin, melee without heavy armour)
    s.maxLife = Math.round(flatLife * (1 + (s.life_pct + classPct) / 100));
    s.bdLife = [
      { source: 'Base', value: Balance.player.lifeBase },
      { source: 'Level ' + L, value: Balance.player.lifePerLevel * (L - 1) },
      { source: 'Vitality ×' + Balance.player.lifePerVit, value: Balance.player.lifePerVit * s.vit },
    ];
    if (classPct) {
      s.bdLife.push({ source: BD.data.classes[p.cls].name + ' +' + classPct + '%', value: Math.round(flatLife * classPct / 100) });
    }
    const usesMana = BD.data.classes[p.cls].resource === 'mana';
    const flatMana = Balance.player.manaBase + Balance.player.manaPerLevel * (L - 1) + Balance.player.manaPerMag * s.mag + s.mana;
    s.maxMana = usesMana ? Math.round(flatMana) : 0;
    s.manaRegenPerS = Balance.player.manaRegenBase + Balance.player.manaRegenPerMag * s.mag + s.mana_regen;
  }

  function deriveDefence(s) {
    s.armorTotal = Math.round((s.armor + Balance.player.armorPerStr * s.str) * (1 + s.armor_pct / 100));
    s.evasionTotal = Math.round(s.evasion + Balance.player.evasionPerDex * s.dex);
    s.critChance = Math.min(Balance.combat.critCap, s.crit + Balance.player.critPerDex * s.dex);
    s.critMult = 1 + s.crit_dmg / 100;
    const dexBlock = Math.max(0, s.dex - Balance.combat.blockDexFloor) * Balance.combat.blockPerDexOver10;
    s.blockChance = s.blockBase > 0 ? Math.min(Balance.combat.blockCap, s.block + dexBlock) : 0;
  }

  /** difficulty (and high ascension) lowers every resistance */
  function resistPenalty(world) {
    if (!BD.data.difficulties) return 0;
    const ascension = world.run.ascension >= Ascension.resist.level ? Ascension.resist.penalty : 0;
    return BD.data.difficulties[world.run.difficulty].resistPenalty + ascension;
  }

  function deriveResists(world, s) {
    const pen = resistPenalty(world);
    const cap = Balance.combat.resistCap + Math.min(Balance.combat.resistMaxBonus, s.res_max);
    s.res = {};
    for (const el of ['fire', 'cold', 'light', 'pois']) {
      s.res[el] = Math.max(Balance.combat.resistMin, Math.min(cap, s['res_' + el] + s.res_all + pen));
    }
    s.res.phys = 0;
    s.resCap = cap;
  }

  function monsterStats(world, e) {
    const def = BD.data.monsters[e.def] || BD.data.bosses && BD.data.bosses[e.def];
    const s = newStats();
    const al = e.al || 1;
    const M = Balance.monsters;
    const rank = M.ranks[e.rank] || M.ranks.normal;
    const diff = BD.data.difficulties ? BD.data.difficulties[world.run.difficulty] : { hp: 1, dmg: 1, xp: 1 };
    const act = Math.min(LAST_ACT, def.act || 1);
    const actK = M.actDmg ? M.actDmg[act] || 1 : 1;
    const actH = M.actHp ? M.actHp[act] || 1 : 1;
    const hpK = M.hpExp ? Math.pow(al, M.hpExp) : Math.pow(M.hpGrowth, al - 1);
    // Keepers and unique elites scale from their act's mean life, so a tank species isn't a ×8 tank
    const useActRef = def.act && BD.data.monsterRef && e.rank !== 'boss' && e.rank !== 'malgoth';
    const actMean = useActRef ? BD.data.monsterRef.actRef(Math.min(LAST_ACT, def.act)).hp : def.hp;
    let baseHp = def.hp;
    if (e.rank === 'keeper' || e.rank === 'unique') baseHp = actMean * ((M.keeperAct && M.keeperAct[act]) || 1);
    else if (e.rank === 'champion') baseHp = ((def.hp + actMean) / 2) * ((M.championAct && M.championAct[act]) || 1);
    s.maxLife = Math.max(1, Math.round((e.hpBase || baseHp * hpK * rank.hp * actH * (def.hpMult || 1)) * diff.hp * (e.hpMult || 1)));
    const dmgK = Math.pow(M.dmgGrowth, al - 1) * rank.dmg * diff.dmg * actK * (def.dmgMult || 1) * (e.dmgMult || 1);
    s.dmgLo = def.dmg[0] * dmgK;
    s.dmgHi = def.dmg[1] * dmgK;
    s.attackCycleMs = def.attackMs;
    s.moveMs = def.moveMs;
    s.windupMs = def.windupMs || M.defaultWindupMs;
    add(s, 'dr_pct', def.dr || 0, 'Base');
    s.res = Object.assign({ phys: 0 }, def.res);
    s.critChance = 0;
    s.critMult = MONSTER_CRIT_MULT;
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
    let s;
    if (e.kind === 'player') s = playerStats(world, e);
    else if (e.kind === 'ally' && BD.sim.allies) s = BD.sim.allies.stats(world, e);
    else s = monsterStats(world, e);
    Object.defineProperty(e, '_stats', { value: s, writable: true, configurable: true, enumerable: false });
    Object.defineProperty(e, '_statsV', { value: v, writable: true, configurable: true, enumerable: false });
    return s;
  }
  function bump(e) { e.statsVersion = (e.statsVersion || 0) + 1; }

  BD.sim.stats = { statsOf, bump, bumpAll, add, newStats, FISTS };
})(globalThis.BD);
