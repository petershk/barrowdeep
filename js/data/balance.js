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
      energyMax: 100, energyRegen: 14,
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
      hpGrowth: 1.15, dmgGrowth: 1.08, xpGrowth: 1.12, goldGrowth: 1.10,
      defaultWindupMs: 500, reactionMs: 300, leashLostMs: 4000, notice: 6, leash: 14,
      ranks: {
        normal: { hp: 1, dmg: 1, xp: 1 }, minion: { hp: 1.5, dmg: 1.1, xp: 1.5 },
        champion: { hp: 3, dmg: 1.2, xp: 3 }, unique: { hp: 7, dmg: 1.4, xp: 7 }, keeper: { hp: 7, dmg: 1.4, xp: 7 },
        boss: { hp: 35, dmg: 1.6, xp: 40 }, malgoth: { hp: 70, dmg: 1.8, xp: 0 },
      },
      projectileSpeed: 6, flowRadius: 30,
    },
    xp: { base: 280, growth: 1.12, fullClearKills: 5 },
    gen: {
      budgetMin: 38, budgetMax: 62,
      spawn: { pilgrim: 0.85, penitent: 1.0, martyr: 1.15 },
    },
    loot: {},
    economy: {},
    ai: {},
    bosses: {},
    ui: {},
  };
})(globalThis.BD);
