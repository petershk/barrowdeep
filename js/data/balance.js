// @ts-check
// Every tuning number lives here (or in its owning data entry). Formulas: 05_BALANCE_MODEL.md.
(function (BD) {
  'use strict';

  BD.data.balance = {
    combat: {
      critBase: 5, critCap: 60, critDmgBase: 75,
      critCapSlackPct: 40,                              // the crit roll may exceed critCap by this much (gear past the cap)
      blockReduce: 0.7, blockCap: 50,
      blockDexFloor: 10, blockPerDexOver10: 1 / 20,     // Dexterity above the floor adds block chance at this rate
      armorK: 50, armorPerAL: 15, armorCap: 0.7,      // A / (A + 50 + 15·AL)
      evadeK: 100, evadePerAL: 20, dodgeCap: 0.35,     // E / (E + 100 + 20·AL)
      resistCap: 75, resistMaxBonus: 5, resistMin: -100,
      dotTickMs: 500,
      exposedMs: 1400, exposedMult: 0.5,
      hitstopMaxMs: 70, hitstopMinGapMs: 240,
      corpseMs: 10000,
      statusChanceMagK: 0.003,
      monsterPhysDrCap: 0.75,                           // monsters' physical damage reduction cap
      monsterResCap: 0.9, monsterResFloor: -1,          // monsters' elemental resistance cap and floor (−100% = double damage)
      defaultMaxStacks: 5,                              // stacking statuses without their own cap
      defaultSlow: 0.3, maxSlow: 0.9,                   // a slow with no magnitude takes this much speed; no slow takes more
      minDealtMult: 0.1,                                // weakening statuses never cut damage dealt below this
      lowLifeFrac: 0.3,                                 // "low life" for Aegis of the Fallen and proc_shield_low
      gearStunMs: 400,                                  // stun from gear stun_chance
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
      armorPerStr: 0.5, evasionPerDex: 2, critPerDex: 0.1,   // armour per Strength, evasion per Dexterity, crit % per Dexterity
      charScalePerLevel: 0.09,                          // spell base damage grows 9% per character level
      dmgPerAttr: 0.03,                                 // +3% damage per point of Magic (spells) or wield stat (weapons)
      attrBase: { fighter: { str: 18, dex: 12, mag: 8, vit: 16 }, assassin: { str: 12, dex: 18, mag: 10, vit: 14 },
        magician: { str: 8, dex: 12, mag: 20, vit: 12 }, valkyrie: { str: 12, dex: 18, mag: 10, vit: 14 } },
    },
    monsters: {
      // life follows AL^hpExp (fit to measured on-curve player power, 05 §4); hpGrowth is kept for tools
      hpExp: 0.6, hpGrowth: 1.10, dmgGrowth: 1.055, xpGrowth: 1.12, goldGrowth: 1.10,
      defaultWindupMs: 500, reactionMs: 300, leashLostMs: 4000, notice: 6, leash: 14,
      // rank traits: boss (boss AI, CC rules, fight reset, own loot), fearless, steady (no knockback)
      ranks: {
        normal: { hp: 1, dmg: 1, xp: 1 },
        minion: { hp: 1.5, dmg: 1.1, xp: 1.5 },
        champion: { hp: 3.2, dmg: 1.2, xp: 3 },
        unique: { hp: 11, dmg: 1.4, xp: 7 },
        keeper: { hp: 11, dmg: 1.4, xp: 7, fearless: true, steady: true },
        boss: { hp: 35, dmg: 1.8, xp: 40, boss: true, fearless: true, steady: true },
        malgoth: { hp: 160, dmg: 1.0, xp: 0, boss: true, fearless: true, steady: true },
      },
      projectileSpeed: 6, flowRadius: 30,
      actDmg: { 1: 0.92, 2: 1.0, 3: 0.9, 4: 0.74 },   // per-act damage correction (rosters hit harder each act; tuned by the balance bot, 05 §3)
      actHp: { 1: 2.25, 2: 3.75, 3: 6.4, 4: 6.0 },
      keeperAct: { 1: 1, 2: 0.88, 3: 1, 4: 1 },   // Keeper / unique durability per act (05 §4 elite band)    // per-act life correction (tuned by the balance bot, 05 §4)
      corpseMs: 10000,
      trashXpBase: 10,                                  // xp of a normal monster at AL 1 (grows by xpGrowth per AL)
      dormantDrPct: 40,                                 // statues take this much less damage until they wake
    },
    xp: { base: 290, growth: 1.13, fullClearKills: 5 },
    skills: {
      maxRank: 5, keystoneTier: 4,                      // skill points buy this many ranks per skill; the tier-4 keystone has one
      tierLevel: { 1: 1, 2: 6, 3: 12, 4: 18 },          // character level that unlocks each skill tier
      rankCap: 8,                                       // bought + gear (+skill) ranks are capped here
      rankScaleStep: 0.2,                               // each rank above 1 adds this fraction of the base value
      cdrCapPct: 40,                                    // cooldown reduction never exceeds this percent
    },
    gen: {
      budgetMin: 48, budgetMax: 75,
      spawn: { pilgrim: 0.85, penitent: 1.0, martyr: 1.15 },
      minStartDist: 10,                                 // packs anchor at least this far (Chebyshev) from the up stairs
      packSpacing: 7, minPackSpacing: 3,                // preferred distance between pack anchors, relaxed down to the minimum
      championLowBudget: 20, championChance: 0.4,       // a pending champion pack is placed for sure below this budget, else at this chance per pack
      championSize: [3, 4],
      eliteFloor: 3, eliteMinions: [2, 4],              // unique elites appear from this floor, with this many minions
      keeperMinions: [2, 4],
      roomChests: [1, 3], roomPiles: [1, 2],            // per treasure room
      trapFloor: 2, roomTraps: [2, 5],                  // room traps appear from this floor, this many per floor
      vaultTraps: 5,                                    // traps ringing the trapped vault, at most
    },
    loot: {
      // rarity chance = base × (1 + mfEff / 100), mfEff = MF·K / (MF + K); magic counts mfEff / magicMfDiv instead
      legendaryBase: 0.015, rareBase: 0.12, magicBase: 0.4,
      mfDiminishK: 250, magicMfDiv: 200,
      mfPerAscension: 10,
      smartLootTarget: 0.65,                            // share of drops a class should be able to use
      rareHookChance: 0.25, rareProcChance: 0.15,       // a rare's next affix is its class hook this often, else its proc this often
      legendaryOwnClassChance: 0.5,
      goldBase: 6, goldRollLo: 0.6, goldRollHi: 1.4,    // gold = base × goldGrowth^(AL−1) × roll × k × gold find (goldGrowth: monsters)
      // drop tables (05 §6.1)
      loreDropMult: 1.2,                                // champions with a lore mod drop more
      trash: { item: 0.10, gold: 0.25, orb: 0.30, scroll: 0.05, portalScroll: 0.75 },
      champion: { gold: 2, orb: 0.5 },
      elite: { items: 2, gold: 6 },
      boss: {
        ilvlBonus: 2, items: 4, malgothItems: 6, legendaryChance: 0.25, rares: 1, malgothRares: 2,
        goldPiles: 4, gold: 40, malgothGold: 80, orbs: 2,
      },
      chest: { rare: 0.15, gold: 0.6, goldK: 4, orb: 0.3 },
      // loot pile: a roll below gold drops gold (×goldK), below orb an orb, else a scroll (portal this often, else reveal)
      pile: { gold: 0.5, orb: 0.8, goldK: 1.5, portalScroll: 0.7 },
    },
    items: {
      ilvlScaleStep: 0.09,                              // base damage / armour grow 9% per item level
      affixGrowthPastTop: 0.02,                         // affix ranges keep growing 2% per level past the table's top (ilvl 28)
      enhanceStep: 0.1,                                 // each enhance level adds 10% to base and affix values
      reqGrowth: 0.06,                                  // attribute requirement grows 6% per item level
      // gold value = base × growth^(ilvl−1) × rarity × (1 + perEnhance × enhance)
      valueBase: 20, valueGrowth: 1.1, valuePerEnhance: 0.15,
      valueRarityMult: { common: 1, magic: 2.5, rare: 6, legendary: 15 },
    },
    economy: {
      blessingsOffered: 3,
      smithMagicChance: 0.5,                            // smith stock past the first slot is magic this often, else common
      reforgeTries: 20,                                 // rolls tried for a same-band replacement affix
      stashTabSize: 20,
    },
    death: {
      // souls = round((base + bonus) × difficulty × (1 + perAscension × ascension)) × gear
      soulsPerKeeper: 10, soulsPerLesserBoss: 40, soulsForMalgoth: 150,
      soulsPerAscension: 0.15,
      sacrificeSoulsMult: 0.5,
      bargainChances: [80, 55, 30],                     // % success for the 1st / 2nd / 3rd Ferryman's Bargain
      maxBargains: 3, bargainCapPct: 95,
    },
    traps: {
      rearmMs: 3000,                                    // a trap that fired waits this long before it can fire again
      revealRange: 3,                                   // traps show as a scuff within this range (Ascension 7: see ascensionMods)
      disarmMs: 800,                                    // hold interact this long (adjacent, still) to disarm
      disarmXp: 4,                                      // disarm XP at AL 1, growing by monsters.xpGrowth per AL
    },
    ai: {},
    bosses: {
      firstSpecialMs: 4000,                             // first special of a boss whose def has no specialEvery
      firstSpecialScale: 0.5,                           // otherwise the first special comes after this share of the usual interval
      phaseSpecialDelayMs: 1200,                        // breather before the first special of a new phase
      defaultSummonCap: 6,                              // live adds a boss may have when its def sets no summonCap
      crushRange: 2.5,                                  // Crushing Blow only when the player is within this many tiles
      keeperFirstSigMs: [3000, 5000],                   // a Keeper's first signature move comes this long after waking...
      keeperSigMs: [7000, 10000],                       // ...then one every so often
      keeperRallyAt: 0.5, keeperRallyMinions: 2,        // a rallying Keeper calls this many pack minions once below this life fraction
      keeperPingMs: 360000, keeperPingWayfinderMs: 180000,   // the Keeper is pinged on the map after this long on the floor (Wayfinder: sooner)
      // Keeper signature moves
      quake: { maxRange: 2.5, radius: 2, armMs: 800, mult: 1.5, knockback: 1 },
      grasp: { maxRange: 8, armMs: 900, mult: 1.2, rootMs: 1500 },
      boneHurl: { minRange: 2, maxRange: 8, flightMs: 1000, mult: 1.6, windupMs: 450 },
      chargeLine: { minRange: 2, maxRange: 5.5, length: 5, armMs: 700, mult: 1.8, exposedMs: 2000 },
    },
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
      desc: 'Monsters have 60% more life and deal 40% more damage. Your resistances suffer −20. ' +
        'Elites carry two powers; Keepers two signature moves. +50% magic find, +25% experience.' },
  };
  BD.data.backgrounds = {
    wanderer: { id: 'wanderer', name: 'Wanderer', desc: 'No advantage. No burden.', free: true },
    soldier: { id: 'soldier', name: 'Soldier', desc: 'Begins with a magic shield or armour piece.', perk: 'bg_soldier',
      startItem: { rarity: 'magic', slots: ['offhand', 'chest'] } },
    acolyte: { id: 'acolyte', name: 'Acolyte', desc: '+1 flask charge for this run.', perk: 'bg_acolyte', flaskBonus: 1 },
    poacher: { id: 'poacher', name: 'Poacher', desc: '+15% gold find for this run.', perk: 'bg_poacher', mods: { gold_find: 15 } },
  };
})(globalThis.BD);
