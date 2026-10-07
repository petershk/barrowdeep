// @ts-check
// Item bases (03 §2). Bases differ by behaviour; item level does the scaling.
// perm: the permission category used by class.uses (03 §1.3).
(function (BD) {
  'use strict';

  const W = {};
  const wpn = (id, name, category, perm, hands, wield, dmg, speedMs, heft, extra) =>
    (W[id] = Object.assign({ id, name, slot: 'weapon', category, perm, hands, wield, dmg, speedMs, heft, range: 1, implicit: {} }, extra || {}));
  const arm = (id, name, slot, weight, perm, armor, heft, extra) =>
    (W[id] = Object.assign({ id, name, slot, weight, perm, armor, heft, implicit: {} }, extra || {}));

  wpn('short_sword', 'Short Sword', 'blade', 'blade', 1, 'str', [3, 7], 600, 6, { fx: 'sword' });
  wpn('long_sword', 'Long Sword', 'blade', 'blade', 1, 'str', [4, 10], 650, 9, { fx: 'sword', implicit: { crit_dmg: 5 } });
  wpn('bastard_sword', 'Bastard Sword', 'blade', 'blade2', 2, 'str', [8, 18], 850, 14, { fx: 'sword', implicit: { crit_dmg: 10 } });
  wpn('hand_axe', 'Hand Axe', 'axe', 'axe', 1, 'str', [3, 8], 650, 7, { fx: 'sword', implicit: { bleed_chance: 10 } });
  wpn('battle_axe', 'Battle Axe', 'axe', 'axe', 2, 'str', [9, 20], 900, 15, { fx: 'sword', implicit: { bleed_chance: 15 } });
  wpn('mace', 'Mace', 'mace', 'mace', 1, 'str', [4, 8], 650, 8, { fx: 'mace', implicit: { dmg_vs_undead_pct: 20 } });
  wpn('morning_star', 'Morning Star', 'mace', 'mace', 1, 'str', [5, 11], 700, 10, { fx: 'mace', implicit: { stun_chance: 5 } });
  wpn('great_maul', 'Great Maul', 'mace', 'mace', 2, 'str', [11, 24], 1000, 17, { fx: 'mace', implicit: { stun_chance: 10 } });
  wpn('dagger', 'Dagger', 'dagger', 'dagger', 1, 'dex', [2, 5], 450, 3, { fx: 'dagger', implicit: { crit: 5 } });
  wpn('kris', 'Kris', 'dagger', 'dagger', 1, 'dex', [2, 7], 450, 5, { fx: 'dagger', implicit: { poison_chance: 15 } });
  wpn('katar', 'Katar', 'claw', 'claw', 1, 'dex', [3, 6], 500, 5, { fx: 'dagger' });
  wpn('wrist_blade', 'Wrist Blade', 'claw', 'claw', 1, 'dex', [3, 8], 520, 7, { fx: 'dagger', implicit: { ias: 5 } });
  wpn('quarterstaff', 'Quarterstaff', 'staff', 'staff', 2, 'mag', [4, 9], 750, 6, { fx: 'staff', implicit: { spell_pct: 10 } });
  wpn('battle_staff', 'Battle Staff', 'staff', 'staff', 2, 'mag', [5, 11], 800, 9, { fx: 'staff', implicit: { spell_pct: 15, mana: 10 } });
  wpn('wand', 'Wand', 'wand', 'wand', 1, 'mag', [2, 4], 600, 3, { fx: 'bolt', range: 6, projectile: 'wand_bolt', implicit: { spell_pct: 8 } });
  wpn('bone_wand', 'Bone Wand', 'wand', 'wand', 1, 'mag', [2, 5], 600, 5, { fx: 'bolt', range: 6, projectile: 'wand_bolt', implicit: { cold_pct: 10 } });
  wpn('short_bow', 'Short Bow', 'bow', 'bow', 2, 'dex', [2, 6], 550, 4, { fx: 'arrow', range: 7, projectile: 'arrow' });
  wpn('hunting_bow', 'Hunting Bow', 'bow', 'bow', 2, 'dex', [3, 8], 650, 7, { fx: 'arrow', range: 8, projectile: 'arrow' });
  wpn('war_bow', 'War Bow', 'bow', 'bow', 2, 'dex', [5, 12], 800, 11, { fx: 'arrow', range: 9, projectile: 'arrow', implicit: { crit_dmg: 10 } });
  wpn('crossbow', 'Crossbow', 'crossbow', 'crossbow', 2, 'dex', [6, 12], 900, 10, { fx: 'bolt', range: 8, projectile: 'bolt', pierce: 1 });
  wpn('arbalest', 'Arbalest', 'crossbow', 'crossbow', 2, 'dex', [9, 18], 1100, 14, { fx: 'bolt', range: 8, projectile: 'bolt', pierce: 1, knockback: 1 });
  wpn('javelin', 'Javelin', 'javelin', 'javelin', 1, 'dex', [3, 8], 600, 6, { fx: 'staff', range: 2, reachLine: 2 });

  arm('robe', 'Robe', 'chest', 'light', 'light', [3, 5], 2, { implicit: { mana: 10 } });
  arm('leather', 'Leather Armour', 'chest', 'light', 'light', [5, 8], 4);
  arm('studded', 'Studded Leather', 'chest', 'medium', 'medium', [9, 12], 8);
  arm('chain', 'Chain Mail', 'chest', 'medium', 'medium', [12, 15], 11);
  arm('splint', 'Splint Mail', 'chest', 'heavy', 'heavy', [16, 20], 15);
  arm('plate', 'Plate Mail', 'chest', 'heavy', 'heavy', [20, 25], 19);
  arm('cap', 'Skull Cap', 'helm', 'light', 'light', [2, 3], 2);
  arm('helm', 'Helm', 'helm', 'medium', 'medium', [4, 6], 6);
  arm('great_helm', 'Great Helm', 'helm', 'heavy', 'heavy', [7, 9], 10);
  arm('cloak', "Traveller's Cloak", 'cloak', null, 'cloak', [1, 2], 1, { implicit: { evasion: 10 } });
  arm('heavy_cloak', 'Heavy Cloak', 'cloak', null, 'cloak', [3, 4], 4);
  arm('buckler', 'Buckler', 'offhand', 'shield-light', 'buckler', [3, 4], 4, { block: 15, category: 'shield' });
  arm('kite', 'Kite Shield', 'offhand', 'shield', 'shield', [6, 8], 9, { block: 20, category: 'shield' });
  arm('tower', 'Tower Shield', 'offhand', 'shield', 'shield', [10, 13], 14, { block: 25, category: 'shield' });
  arm('orb', "Seer's Orb", 'offhand', 'orb', 'orb', [0, 0], 3, { category: 'orb', implicit: { spell_pct: 10, mana: 15 } });
  arm('quiver', 'Quiver', 'offhand', 'quiver', 'quiver', [0, 0], 3, { category: 'quiver', implicit: { projectile_pct: 10 } });
  arm('amulet', 'Amulet', 'amulet', null, 'amulet', [0, 0], 0, { extraAffix: 1 });
  arm('ring', 'Ring', 'ring', null, 'ring', [0, 0], 0);

  /** the category a base gets when it names none: chests are armour, other slots use the slot name */
  function defaultCategory(b) {
    if (b.slot === 'weapon') return b.category;
    if (b.slot === 'chest') return 'armour';
    return b.slot;
  }

  for (const b of Object.values(W)) {
    if (!b.category) b.category = defaultCategory(b);
    // requirement attribute (03 §1.2)
    if (b.slot === 'weapon') b.reqAttr = b.wield;
    else if (b.category === 'orb') b.reqAttr = 'mag';
    else if (b.category === 'quiver') b.reqAttr = 'dex';
    else if (b.category === 'shield') b.reqAttr = 'str';
    else if ((b.slot === 'chest' || b.slot === 'helm') && b.weight !== 'light') b.reqAttr = 'str';
    else b.reqAttr = null;
  }

  BD.data.bases = W;
})(globalThis.BD);
