// @ts-check
// Legendaries (03 §5): 2–3 fixed affixes rolled within ranges + one power that changes how you
// play. Pools: base (18), ledger1/2/3 (+6 each, Soul Shrine). Powers implemented in sim/powers.js.
(function (BD) {
  'use strict';

  const L = {};
  const MAIN = { fighter: 'str', assassin: 'dex', magician: 'mag', valkyrie: 'dex' };
  function leg(id, name, base, pool, cls, affixes, powerText) {
    const b = BD.data.bases[base];
    if (!affixes) {
      // class legendaries' fixed affixes (03 §5 rules)
      if (b.slot === 'weapon') affixes = [b.wield === 'mag' ? 'spell_pct' : 'dmg_pct', MAIN[cls]];
      else if (b.slot === 'amulet' || b.slot === 'ring') affixes = [MAIN[cls], 'crit'];
      else affixes = ['life', 'res_all'];
    }
    L[id] = { id, name, base, pool, cls, affixes, power: id, powerText };
  }

  // ---- generic ----
  leg('holy_mace', 'The Holy Mace', 'mace', 'base', null, ['dmg_pct', 'life_on_hit'], '+50% damage to undead and demons; kills heal 2% of maximum life.');
  leg('tempters_cloak', "The Tempter's Cloak", 'cloak', 'base', null, ['dex', 'move'], 'Monsters notice you at half range; your first hit on an unaware enemy deals 3×.');
  leg('crown_of_embers', 'Crown of Embers', 'great_helm', 'base', null, ['life', 'res_fire'], 'Burning enemies within 3 tiles take +30% damage from you.');
  leg('band_of_ages', 'Band of Ages', 'ring', 'base', null, ['all_attr'], '+1 to all skills.');
  leg('mantle_of_souls', 'Mantle of Souls', 'heavy_cloak', 'base', null, ['life', 'magic_find'], '+25% souls from this character.');
  leg('bishops_bulwark', "The Bishop's Bulwark", 'kite', 'base', null, ['res_all', 'armor_pct'], 'Blocking releases a holy nova (radius 1, 60% weapon hit, at most once per second).');
  leg('ferrymans_coin', "Ferryman's Coin", 'amulet', 'ledger1', null, ['gold_find', 'life'], "The Ferryman's Bargain has +20% success chance.");
  leg('gravewalkers_shroud', "Gravewalker's Shroud", 'cloak', 'ledger1', null, ['move', 'res_cold'], 'Evade has 2 charges.');
  leg('lantern_of_the_lost', 'Lantern of the Lost', 'amulet', 'ledger2', null, ['life_pct', 'crit'], 'Light radius +3; enemies in your light take +10% damage.');
  leg('ossuary_seal', 'Ossuary Seal', 'ring', 'ledger2', null, ['vit', 'res_pois'], 'Corpses near you heal you (1% of maximum life per second within 3 tiles, up to 3 corpses).');
  leg('choirbreaker', 'Choirbreaker', 'amulet', 'ledger3', null, ['dmg_pct', 'cdr'], 'Every 10th hit releases a sonic burst that stuns non-boss enemies within 2 tiles for 1 s.');
  leg('heart_of_the_barrow', 'Heart of the Barrow', 'amulet', 'ledger3', null, ['life', 'res_all'], 'While the flask is empty, kills restore 1 charge 15% of the time.');
  // ---- Fighter ----
  leg('worldcleaver', 'Worldcleaver', 'bastard_sword', 'base', 'fighter', null, 'Bash hits all 8 surrounding tiles.');
  leg('aegis_of_the_fallen', 'Aegis of the Fallen', 'plate', 'base', 'fighter', null, 'Below 30% life: +50% damage reduction for 4 s (30 s cooldown).');
  leg('gorefeast', 'Gorefeast', 'battle_axe', 'base', 'fighter', null, 'Whirlwind heals 1.5% of maximum life per enemy hit.');
  leg('thundermaul', 'Thundermaul', 'great_maul', 'ledger1', 'fighter', null, 'Earthshaker leaves 3 lightning pillars for 3 s.');
  leg('bloodhowl_helm', 'Bloodhowl Helm', 'great_helm', 'ledger2', 'fighter', null, "War Cry's duration doubles and it taunts enemies to you.");
  leg('ironbrand', 'Ironbrand', 'long_sword', 'ledger3', 'fighter', null, 'Charge range +3; Charge ends with a free Bash.');
  // ---- Assassin ----
  leg('wormtongue', 'Wormtongue', 'kris', 'base', 'assassin', null, 'Tiger Strike applies a stacking Poison (up to 5).');
  leg('marrowfang', 'Marrowfang', 'katar', 'base', 'assassin', null, 'Finishers refund 1 combo charge.');
  leg('nightspur', 'Nightspur', 'wrist_blade', 'base', 'assassin', null, 'Shadowstep has +1 charge and resets on kill.');
  leg('gearheart', 'Gearheart', 'amulet', 'ledger1', 'assassin', null, 'Maximum sentries +2.');
  leg('ashen_wraps', 'Ashen Wraps', 'leather', 'ledger2', 'assassin', null, 'Fire Blast bombs bounce twice before exploding.');
  leg('veilweave', 'Veilweave', 'cloak', 'ledger3', 'assassin', null, 'Smoke Bomb follows you and lasts 3 s longer.');
  // ---- Magician ----
  leg('stormcaller', 'Stormcaller', 'battle_staff', 'base', 'magician', null, 'Chain Lightning jumps 3 more times and can hit the same enemy twice.');
  leg('voice_of_the_storm', 'Voice of the Storm', 'wand', 'base', 'magician', null, 'Teleport leaves a nova (radius 2) that Shocks.');
  leg('frostbinder', 'Frostbinder', 'orb', 'base', 'magician', null, 'Frost Nova casts twice (the second 0.5 s later at 50% damage).');
  leg('phoenix_quill', 'Phoenix Quill', 'wand', 'ledger1', 'magician', null, 'Fireball splits into 3 smaller fireballs on impact.');
  leg('rimeheart', 'Rimeheart', 'orb', 'ledger2', 'magician', null, 'Frozen enemies take +25% damage from all sources.');
  leg('cinderveil', 'Cinderveil', 'robe', 'ledger3', 'magician', null, "Meteor's burning ground spreads to adjacent tiles every second.");
  // ---- Valkyrie ----
  leg('featherfall', 'Featherfall', 'war_bow', 'base', 'valkyrie', null, 'Multishot fires 3 more arrows; arrows ricochet once.');
  leg('skyrender', 'Skyrender', 'hunting_bow', 'base', 'valkyrie', null, 'Rain of Arrows follows your locked target.');
  leg('eagles_talon', "Eagle's Talon", 'quiver', 'base', 'valkyrie', null, 'Aimed Shot at 5 focus fires 3 arrows.');
  leg('wingbreaker', 'Wingbreaker', 'crossbow', 'ledger1', 'valkyrie', null, 'Pinning Shot chains to 2 more enemies.');
  leg('oathspear', 'Oathspear', 'javelin', 'ledger2', 'valkyrie', null, "Javelin returns, and Valkyrie's Call summons two Valkyries.");
  leg('galewing_mantle', 'Galewing Mantle', 'cloak', 'ledger3', 'valkyrie', null, 'Vault has 2 charges and grants 3 focus.');

  BD.data.legendaries = L;
  BD.data.legendaryPools = { base: ['base'], ledger1: ['base', 'ledger1'], ledger2: ['base', 'ledger1', 'ledger2'], ledger3: ['base', 'ledger1', 'ledger2', 'ledger3'] };
})(globalThis.BD);
