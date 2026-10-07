// @ts-check
// Town services and economy constants (03 §8, 05 §6.3) and the Soul Shrine (01 §8.3).
(function (BD) {
  'use strict';

  BD.data.economy = {
    sellDiv: 5,
    rarityMult: { common: 1, magic: 2.5, rare: 6, legendary: 15 },
    smithStock: 5, smithRareChance: 0.3, smithUsable: 2,
    reroll: (al, n) => 25 * al * (1 + n),
    enhance: (al, step) => 40 * al * step,
    reforge: (al) => 120 * al,
    gamble: (al) => 60 * al,
    gambleOdds: { magic: 0.6, rare: 0.32, legendary: 0.08 },
    blessing: (al) => 30 * al,
    flaskUpgrade: (act) => 150 * act,
    respec: (L, n) => 50 * L * (1 + n),
    portalScroll: (act) => 15 * act,
    buyback: 10,
    enhanceMax: 5,
  };

  BD.data.blessings = {
    pyre_blessed: { name: 'Pyre-Blessed', desc: '+15% fire damage', mods: { fire_pct: 15 } },
    frost_blessed: { name: 'Frost-Blessed', desc: '+15% cold damage', mods: { cold_pct: 15 } },
    storm_blessed: { name: 'Storm-Blessed', desc: '+15% lightning damage', mods: { light_pct: 15 } },
    iron_vigil: { name: 'Iron Vigil', desc: '+15% armour', mods: { armor_pct: 15 } },
    hunters_mark: { name: "Hunter's Mark", desc: '+20% damage to elites', mods: { dmg_vs_elite_pct: 20 } },
    fortune: { name: 'Fortune', desc: '+30% magic find', mods: { magic_find: 30 } },
    plenty: { name: 'Plenty', desc: 'Flask orb drops +50%', mods: { orb_drop_pct: 50 } },
    swiftness: { name: 'Swiftness', desc: '+8% movement speed', mods: { move_pct: 8 } },
    ward: { name: 'Ward', desc: '+10 all resistances', mods: { res_all: 10 } },
  };

  // Soul Shrine: breadth, not raw power (~3,800 souls in total)
  BD.data.shrine = [
    { id: 'ledger1', name: "Gravekeeper's Ledger I", cost: 200, desc: 'Adds 6 legendaries to the drop pool (18 → 24).' },
    { id: 'ledger2', name: "Gravekeeper's Ledger II", cost: 450, desc: 'Adds 6 more legendaries (24 → 30).', requires: 'ledger1' },
    { id: 'ledger3', name: "Gravekeeper's Ledger III", cost: 900, desc: 'Adds the last 6 legendaries (30 → 36).', requires: 'ledger2' },
    { id: 'bg_soldier', name: 'Background: Soldier', cost: 80, desc: 'Begin with a magic shield or armour piece.' },
    { id: 'bg_acolyte', name: 'Background: Acolyte', cost: 80, desc: 'Begin with +1 flask charge for the run.' },
    { id: 'bg_poacher', name: 'Background: Poacher', cost: 80, desc: 'Begin with +15% gold find for the run.' },
    { id: 'stash2', name: 'Second Stash Tab', cost: 150, desc: '+20 stash slots.' },
    { id: 'stash3', name: 'Third Stash Tab', cost: 350, desc: '+20 stash slots.', requires: 'stash2' },
    { id: 'deep_flask', name: 'Deep Flask', cost: 300, desc: 'Flask capacity 4 → 5.' },
    { id: 'wayfinder', name: 'Wayfinder', cost: 150, desc: 'The Keeper is pinged on the map after 3 minutes on a floor (instead of 6).' },
    { id: 'merchants_favor', name: "Merchant's Favor", cost: 150, desc: 'One free Smith reroll per town visit.' },
    { id: 'champion_lore', name: 'Champion Lore', cost: 400, desc: 'Three more champion powers join the pool (harder elites, +20% elite loot).' },
    { id: 'martyrs_path', name: "Martyr's Path", cost: 500, desc: 'Unlocks the Martyr difficulty.' },
  ];

  // Ascension levels, in order: level N adds entries 1..N. Each entry carries the numbers its effect uses.
  BD.data.ascensionMods = [
    { level: 1, id: 'elite_mods', minMods: 2, championExtraMods: 1, desc: 'Elites roll one extra champion power.' },
    { level: 2, id: 'haste', speedMult: 1.1, desc: 'Monsters move 10% faster.' },
    { level: 3, id: 'keeper_moves', minMoves: 2, desc: 'Keepers have a second signature move.' },
    { level: 4, id: 'flask', healMult: 0.8, desc: 'Healing from the flask −20%.' },
    { level: 5, id: 'early_enrage', atPct: 70, desc: 'Bosses enter their second phase at 70% instead of 50%.' },
    { level: 6, id: 'density', budgetMult: 1.25, desc: '+25% monster density.' },
    { level: 7, id: 'hidden_traps', revealRange: 2, desc: 'Traps are invisible until within 2 tiles.' },
    { level: 8, id: 'resist', penalty: -20, desc: 'Resistances −20.' },
    { level: 9, id: 'exposed', exposedMult: 0.7, desc: 'Exposed windows are 30% shorter.' },
    { level: 10, id: 'eternal', atLife: 0.15, speedMult: 1.25, desc: 'Malgoth gains a fourth phase at 15% life.' },
  ];
  /** the same entries by id: `world.run.ascension >= Ascension.haste.level` */
  BD.data.ascension = {};
  for (const m of BD.data.ascensionMods) BD.data.ascension[m.id] = m;
})(globalThis.BD);
