// @ts-check
// Affixes (03 §4). range.at1 / at28 = [lo, hi] at item level 1 and 28.
// slots use slot words: weapon, offhand, chest, helm, cloak, amulet, ring (+ 'magWeapon' for Mag weapons).
// band: core | hook (class hooks, rare+ only) | proc (rare+ only, ≤1 per item).
(function (BD) {
  'use strict';

  const A = {};
  const ANY = ['weapon', 'offhand', 'chest', 'helm', 'cloak', 'amulet', 'ring'];
  const JEWEL = ['amulet', 'ring'];
  const af = (id, stat, slots, at1, at28, name, extra) => { A[id] = Object.assign({ id, stat, slots, range: { at1, at28 }, name, band: 'core' }, extra || {}); };

  // ---- core band ----
  af('life', 'life', ANY.filter((s) => s !== 'weapon'), [4, 8], [50, 80], ['suffix', 'of the Bear']);
  af('life_pct', 'life_pct', ['chest', 'amulet', 'offhand'], [3, 5], [8, 12], ['suffix', 'of Vigour']);
  af('armor_pct', 'armor_pct', ['chest', 'helm', 'offhand', 'cloak'], [8, 15], [25, 40], ['prefix', 'Sturdy']);
  af('dmg_pct', 'dmg_pct', ['weapon', 'amulet', 'ring', 'quiver'], [8, 15], [40, 70], ['prefix', 'Cruel']);
  af('spell_pct', 'spell_pct', ['magWeapon', 'orb', 'amulet', 'ring'], [8, 15], [40, 70], ['prefix', 'Arcane']);
  af('ias', 'ias', ['weapon', 'ring', 'amulet'], [4, 6], [10, 15], ['prefix', 'Swift']);
  af('crit', 'crit', ['weapon', 'helm', 'ring', 'amulet'], [2, 3], [5, 8], ['prefix', 'Keen']);
  af('crit_dmg', 'crit_dmg', ['weapon', 'amulet', 'ring'], [10, 15], [30, 50], ['prefix', 'Brutal']);
  af('str', 'str', ANY, [2, 3], [12, 18], ['suffix', 'of Strength']);
  af('dex', 'dex', ANY, [2, 3], [12, 18], ['suffix', 'of the Fox']);
  af('mag', 'mag', ANY, [2, 3], [12, 18], ['suffix', 'of the Mind']);
  af('vit', 'vit', ANY, [2, 3], [12, 18], ['suffix', 'of Vitality']);
  const RES_SLOTS = ['chest', 'helm', 'offhand', 'cloak', 'ring', 'amulet'];
  af('res_fire', 'res_fire', RES_SLOTS, [5, 10], [25, 35], ['suffix', 'of Fire Warding']);
  af('res_cold', 'res_cold', RES_SLOTS, [5, 10], [25, 35], ['suffix', 'of Frost Warding']);
  af('res_light', 'res_light', RES_SLOTS, [5, 10], [25, 35], ['suffix', 'of Storm Warding']);
  af('res_pois', 'res_pois', RES_SLOTS, [5, 10], [25, 35], ['suffix', 'of Venom Warding']);
  af('res_all', 'res_all', ['amulet', 'offhand', 'cloak'], [3, 5], [12, 18], ['suffix', 'of the Sanctuary']);
  af('fire_add', 'fire_add', ['weapon', 'ring'], [1, 3], [15, 30], ['prefix', 'Fiery']);
  af('cold_add', 'cold_add', ['weapon', 'ring'], [1, 3], [15, 30], ['prefix', 'Frozen']);
  af('light_add', 'light_add', ['weapon', 'ring'], [1, 3], [15, 30], ['prefix', 'Shocking']);
  af('pois_add', 'pois_add', ['weapon', 'ring'], [1, 3], [15, 30], ['prefix', 'Venomous']);
  af('life_on_hit', 'life_on_hit', ['weapon', 'ring'], [1, 1], [6, 10], ['prefix', 'Vampiric']);
  af('life_on_kill', 'life_on_kill', ['weapon', 'amulet', 'helm'], [2, 3], [25, 40], ['prefix', 'Sanguine']);
  af('mana_regen', 'mana_regen', ['orb', 'amulet', 'ring', 'helm'], [0.5, 1], [3, 4], ['suffix', 'of Clarity'], { fmt: 'dec', cls: 'magician' });
  af('move', 'move_pct', ['cloak', 'amulet'], [4, 5], [8, 10], ['suffix', 'of Haste']);
  af('gold_find', 'gold_find', ['helm', 'amulet', 'ring', 'cloak'], [10, 15], [40, 60], ['suffix', 'of Greed']);
  af('magic_find', 'magic_find', ['helm', 'amulet', 'ring', 'cloak'], [5, 8], [25, 35], ['suffix', 'of Fortune']);
  af('cdr', 'cdr_pct', ['helm', 'amulet', 'orb'], [3, 4], [8, 12], ['suffix', 'of Quickening']);
  af('area', 'area_pct', ['weapon', 'amulet'], [5, 8], [20, 30], ['prefix', 'Sweeping']);
  af('all_attr', 'all_attr', ['ring', 'amulet'], [2, 3], [8, 12], ['suffix', 'of the Ages'], { legendaryOnly: true });

  // ---- class-hook band (rares and legendaries; only if the base suits that class) ----
  const hook = (id, stat, cls, at1, at28, text, extra) => af(id, stat, ANY, at1, at28, null, Object.assign({ band: 'hook', cls, text }, extra || {}));
  hook('skill_plus', 'skill_plus', null, [1, 1], [1, 1], '+1 to a skill', { special: 'skill_plus' });
  hook('rage_gen', 'rage_gen_pct', 'fighter', [10, 10], [25, 25], 'Rage generated');
  hook('momentum_thresh', 'momentum_thresh', 'fighter', [45, 45], [35, 35], 'Momentum at lower rage');
  hook('combo_window', 'combo_window_s', 'assassin', [1, 1], [3, 3], 'Combo window', { fmt: 'dec' });
  hook('sentry_dur', 'sentry_dur_pct', 'assassin', [15, 15], [40, 40], 'Sentry duration');
  hook('reaction_dmg', 'reaction_pct', 'magician', [20, 20], [60, 60], 'Reaction damage');
  hook('surge_delay', 'surge_delay_s', 'magician', [0.3, 0.3], [0.8, 0.8], 'Surge starts sooner', { fmt: 'dec' });
  hook('focus_keep', 'focus_keep_pct', 'valkyrie', [25, 25], [60, 60], 'Focus kept when hit');
  hook('projectile_extra', 'extra_projectiles', 'valkyrie', [1, 1], [1, 1], 'projectile to Multishot, Ice Shard and Spark', { fixed: 1 });

  // ---- proc band (rares and legendaries; at most one per item) ----
  // params: the numbers the proc uses (sim/powers.js); "low life" is balance.combat.lowLifeFrac
  const proc = (id, text, params) => af(id, null, ANY, [0, 0], [0, 0], null, { band: 'proc', proc: id, text, fixed: 0, params });
  proc('proc_nova_on_kill', 'On kill: 10% chance to release a fire nova', { chance: 0.1, weaponMult: 0.5 });
  // jumps = targets hit by one chain, jumpRange tiles between links, weaponMult of weapon damage per link
  proc('proc_chain_on_hit', 'On hit: 5% chance to cast a 3-jump chain lightning', { chance: 0.05, jumps: 4, jumpRange: 3, weaponMult: 0.3 });
  proc('proc_frost_on_evade', 'On Evade: leave a frost patch', { durMs: 3000 });
  proc('proc_heal_on_crit', 'On crit: heal 1% of maximum life', { healPct: 0.01, icdMs: 250 });
  proc('proc_shield_low', 'Below 30% life: gain a shield of 15% maximum life (once per 30 s)', { shieldPct: 0.15, durMs: 6000, cdMs: 30000 });
  proc('proc_haste_on_kill', 'On kill: +15% movement and attack speed for 3 s', { durMs: 3000 });

  BD.data.affixes = A;

  /** rare names (03 §3) */
  BD.data.rareNames = {
    PRE: [
      'Doom', 'Grim', 'Blood', 'Bone', 'Storm', 'Gloom', 'Wraith', 'Dread', 'Ash', 'Rune',
      'Soul', 'Grave', 'Hate', 'Plague', 'Corpse', 'Shadow', 'Viper', 'Raven', 'Wolf', 'Iron',
    ],
    SUF: [
      'veil', 'bite', 'song', 'fang', 'mark', 'ward', 'spell', 'call', 'brand', 'shard',
      'gnaw', 'wrack', 'mantle', 'coil', 'grasp', 'thirst', 'shroud', 'scar', 'knell', 'howl',
    ],
  };
})(globalThis.BD);
