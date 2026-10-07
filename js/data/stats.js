// @ts-check
// Stat registry (06 §5.2). Every stat key has one definition. Unknown keys throw in tests.
// stacking: 'add' | 'mult' (product of (1+v/100)) | 'max' | 'min' | 'flag'
(function (BD) {
  'use strict';

  const D = {};
  const def = (key, label, fmt, group, extra) => { D[key] = Object.assign({ key, label, fmt, stacking: 'add', group }, extra || {}); };

  // attributes
  def('str', 'Strength', 'int', 'attr'); def('dex', 'Dexterity', 'int', 'attr'); def('mag', 'Magic', 'int', 'attr'); def('vit', 'Vitality', 'int', 'attr');
  def('all_attr', 'All Attributes', 'int', 'attr');
  // defense
  def('life', 'Life', 'int', 'defense'); def('life_pct', 'Life', 'pct', 'defense');
  def('armor', 'Armour', 'int', 'defense'); def('armor_pct', 'Armour', 'pct', 'defense');
  def('evasion', 'Evasion', 'int', 'defense'); def('block', 'Block Chance', 'pct', 'defense');
  def('res_fire', 'Fire Resistance', 'pct', 'defense'); def('res_cold', 'Cold Resistance', 'pct', 'defense');
  def('res_light', 'Lightning Resistance', 'pct', 'defense'); def('res_pois', 'Poison Resistance', 'pct', 'defense');
  def('res_all', 'All Resistances', 'pct', 'defense'); def('res_max', 'Maximum Resistances', 'pct', 'defense', { cap: 5 });
  def('dr_pct', 'Damage Reduction', 'pct', 'defense', { stacking: 'mult', cap: 80 });
  // offense
  def('dmg_pct', 'Damage', 'pct', 'offense'); def('spell_pct', 'Spell Damage', 'pct', 'offense');
  def('fire_pct', 'Fire Damage', 'pct', 'offense'); def('cold_pct', 'Cold Damage', 'pct', 'offense');
  def('light_pct', 'Lightning Damage', 'pct', 'offense'); def('pois_pct', 'Poison Damage', 'pct', 'offense');
  def('projectile_pct', 'Projectile Damage', 'pct', 'offense'); def('area_pct', 'Area Damage', 'pct', 'offense');
  def('ias', 'Attack Speed', 'pct', 'offense'); def('crit', 'Critical Strike Chance', 'pct', 'offense', { cap: 60 });
  def('crit_dmg', 'Critical Strike Damage', 'pct', 'offense');
  def('fire_add', 'Fire Damage on Hit', 'int', 'offense'); def('cold_add', 'Cold Damage on Hit', 'int', 'offense');
  def('light_add', 'Lightning Damage on Hit', 'int', 'offense'); def('pois_add', 'Poison Damage on Hit', 'int', 'offense');
  def('dmg_vs_undead_pct', 'Damage vs Undead', 'pct', 'offense'); def('dmg_vs_demon_pct', 'Damage vs Demons', 'pct', 'offense');
  def('dmg_vs_elite_pct', 'Damage vs Elites', 'pct', 'offense');
  def('bleed_chance', 'Bleed Chance', 'pct', 'offense'); def('poison_chance', 'Poison Chance', 'pct', 'offense');
  def('stun_chance', 'Stun Chance', 'pct', 'offense');
  // resources and sustain
  def('mana', 'Mana', 'int', 'resource'); def('mana_regen', 'Mana Regeneration', 'dec', 'resource');
  def('energy_regen', 'Energy Regeneration', 'dec', 'resource');
  def('life_on_hit', 'Life on Hit', 'int', 'resource'); def('life_on_kill', 'Life on Kill', 'int', 'resource');
  def('life_regen_pct', 'Life Regeneration', 'dec', 'resource');
  def('rage_gen_pct', 'Rage Generated', 'pct', 'resource');
  def('momentum_thresh', 'Momentum Threshold', 'int', 'resource', { stacking: 'min' });
  def('combo_window_s', 'Combo Window', 'dec', 'resource'); def('combo_max', 'Maximum Combo', 'int', 'resource');
  def('sentry_dur_pct', 'Sentry Duration', 'pct', 'resource'); def('sentry_max', 'Maximum Sentries', 'int', 'resource');
  def('reaction_pct', 'Reaction Damage', 'pct', 'resource'); def('surge_delay_s', 'Surge Delay Reduction', 'dec', 'resource');
  def('focus_keep_pct', 'Focus Kept When Hit', 'pct', 'resource'); def('flask_max', 'Flask Charges', 'int', 'resource');
  // utility
  def('move_pct', 'Movement Speed', 'pct', 'utility'); def('cdr_pct', 'Cooldown Reduction', 'pct', 'utility', { cap: 40 });
  def('light_radius', 'Light Radius', 'int', 'utility'); def('gold_find', 'Gold Find', 'pct', 'utility');
  def('magic_find', 'Magic Find', 'pct', 'utility'); def('souls_pct', 'Souls', 'pct', 'utility');
  def('evade_charges', 'Evade Charges', 'int', 'utility'); def('evade_cd_ms', 'Evade Cooldown Reduction', 'ms', 'utility');
  def('bargain_chance', "Ferryman's Bargain Chance", 'pct', 'utility');
  def('all_skills', 'All Skills', 'int', 'utility'); def('extra_projectiles', 'Extra Projectiles', 'int', 'utility');
  def('flask_heal_pct', 'Flask Healing', 'pct', 'utility'); def('orb_drop_pct', 'Flask Orb Drops', 'pct', 'utility');
  // flags
  def('knockback_immune', 'Immune to Knockback', 'flag', 'flag', { stacking: 'flag' });
  def('slow_immune', 'Immune to Slow', 'flag', 'flag', { stacking: 'flag' });
  def('chill_immune', 'Immune to Chill', 'flag', 'flag', { stacking: 'flag' });

  /** skill_plus_<skillId> keys are generated when skills register */
  function ensureSkillKey(skillId, name) {
    const k = 'skill_plus_' + skillId;
    if (!D[k]) def(k, '+ to ' + (name || skillId), 'int', 'skill');
    return k;
  }

  const BASE = { crit: 5, crit_dmg: 75, light_radius: 6, momentum_thresh: 50 };

  function isKey(k) { return !!D[k]; }

  BD.data.stats = { defs: D, BASE, isKey, ensureSkillKey };
})(globalThis.BD);
