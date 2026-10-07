// @ts-check
// Every tuning number lives here (or in its owning data entry). Formulas: 05_BALANCE_MODEL.md.
(function (BD) {
  'use strict';

  BD.data.balance = {
    combat: {
      critBase: 5, critCap: 60, critDmgBase: 75,
      blockReduce: 0.7, blockCap: 50, blockPerDexOver10: 1 / 20,
      armorK: 50, armorPerAL: 15, armorCap: 0.7,      // A / (A + 50 + 15·AL)
      evadeK: 100, evadePerAL: 20, dodgeCap: 0.35,     // E / (E + 100 + 20·AL)
      resistCap: 75, resistMaxBonus: 5, resistMin: -100,
      dotTickMs: 500,
      exposedMs: 1400, exposedMult: 0.5,
      hitstopMaxMs: 70, hitstopMinGapMs: 240,
      corpseMs: 10000,
      statusChanceMagK: 0.003,
    },
    player: {
      moveMs: 250, diagMult: Math.SQRT2,
      evadeTiles: 2, evadeMs: 180, evadeInvulnMs: 120, evadeCdMs: 3000,
      lifeBase: 40, lifePerLevel: 4, lifePerVit: 3,
      manaBase: 30, manaPerLevel: 2, manaPerMag: 1.5,
      manaRegenBase: 1.5, manaRegenPerMag: 0.04, surgeDelayMs: 2500, surgeMult: 3,
      rageMax: 100, rageBasicGen: 6, rageDecay: 8, rageDecayDelayMs: 3000,
      momentumThresh: 50, momentumDmg: 10, momentumIas: 10,
      energyMax: 100, energyRegen: 18,
      comboMax: 3, comboWindowMs: 6000, comboBasicBonus: 0.4,
      focusMax: 5, focusStillMs: 1000, focusLoseMs: 4000, focusSameTargetGapMs: 500, focusCritPer: 4,
      lifeRegenPct: 0.4, oocRegenPct: 3, oocDelayMs: 4000,
      attrPerLevel: 5, skillPerLevel: 1, levelCap: 30,
      flaskBase: 4, flaskHealPct: 45, flaskHealMs: 500, flaskCdMs: 1000, flaskPermMax: 7,
      holdRepeatMs: 160, impactFrac: 0.4, spellCastMs: 500,
      safeRadius: 15, autosaveMs: 60000,
      lightRadius: 6, pickupGoldRadius: 1,
      attrBase: { fighter: { str: 18, dex: 12, mag: 8, vit: 16 }, assassin: { str: 12, dex: 18, mag: 10, vit: 14 },
        magician: { str: 8, dex: 12, mag: 20, vit: 12 }, valkyrie: { str: 12, dex: 18, mag: 10, vit: 14 } },
    },
    monsters: {
      // life follows AL^hpExp (fit to measured on-curve player power, 05 §4); hpGrowth is kept for tools
      hpExp: 0.6, hpGrowth: 1.10, dmgGrowth: 1.055, xpGrowth: 1.12, goldGrowth: 1.10,
      defaultWindupMs: 500, reactionMs: 300, leashLostMs: 4000, notice: 6, leash: 14,
      ranks: {
        normal: { hp: 1, dmg: 1, xp: 1 }, minion: { hp: 1.5, dmg: 1.1, xp: 1.5 },
        champion: { hp: 3.2, dmg: 1.2, xp: 3 }, unique: { hp: 11, dmg: 1.4, xp: 7 }, keeper: { hp: 11, dmg: 1.4, xp: 7 },
        boss: { hp: 35, dmg: 1.8, xp: 40 }, malgoth: { hp: 160, dmg: 1.0, xp: 0 },
      },
      projectileSpeed: 6, flowRadius: 30,
      actDmg: { 1: 0.92, 2: 1.0, 3: 0.9, 4: 0.74 },   // per-act damage correction (rosters hit harder each act; tuned by the balance bot, 05 §3)
      actHp: { 1: 2.25, 2: 3.75, 3: 6.4, 4: 6.0 },
      keeperAct: { 1: 1, 2: 0.88, 3: 1, 4: 1 },   // Keeper / unique durability per act (05 §4 elite band)    // per-act life correction (tuned by the balance bot, 05 §4)
      corpseMs: 10000,
    },
    xp: { base: 290, growth: 1.13, fullClearKills: 5 },
    gen: {
      budgetMin: 48, budgetMax: 75,
      spawn: { pilgrim: 0.85, penitent: 1.0, martyr: 1.15 },
    },
    loot: {},
    economy: {},
    ai: {},
    bosses: {},
    ui: {},
  };
})(globalThis.BD);

// Difficulties (01 §9) and backgrounds (01 §5).
(function (BD) {
  'use strict';
  BD.data.difficulties = {
    pilgrim: { id: 'pilgrim', name: 'Pilgrim', hp: 0.7, dmg: 0.7, xp: 1.0, mf: 0, resistPenalty: 0, flaskBonus: 1, souls: 0.75, eliteMods: 1, keeperMoves: 1, spawn: 0.85,
      desc: 'Monsters have 30% less life and deal 30% less damage. One extra flask charge. Traps always visible. For learning the dark.' },
    penitent: { id: 'penitent', name: 'Penitent', hp: 1.0, dmg: 1.0, xp: 1.0, mf: 0, resistPenalty: 0, flaskBonus: 0, souls: 1.0, eliteMods: 1, keeperMoves: 1, spawn: 1.0,
      desc: 'The descent as it is meant to be walked.' },
    martyr: { id: 'martyr', name: 'Martyr', hp: 1.6, dmg: 1.4, xp: 1.25, mf: 50, resistPenalty: -20, flaskBonus: 0, souls: 1.5, eliteMods: 2, keeperMoves: 2, spawn: 1.15,
      desc: 'Monsters have 60% more life and deal 40% more damage. Your resistances suffer −20. Elites carry two powers; Keepers two signature moves. +50% magic find, +25% experience.' },
  };
  BD.data.backgrounds = {
    wanderer: { id: 'wanderer', name: 'Wanderer', desc: 'No advantage. No burden.', free: true },
    soldier: { id: 'soldier', name: 'Soldier', desc: 'Begins with a magic shield or armour piece.', perk: 'bg_soldier' },
    acolyte: { id: 'acolyte', name: 'Acolyte', desc: '+1 flask charge for this run.', perk: 'bg_acolyte' },
    poacher: { id: 'poacher', name: 'Poacher', desc: '+15% gold find for this run.', perk: 'bg_poacher' },
  };
})(globalThis.BD);
