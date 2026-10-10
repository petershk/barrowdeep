// @ts-check
// Statuses (05 §2.4). Every one has a real name and icon (07 §2.4 — no two share a glyph).
// clock: action-clock multiplier; dot: element + pct of the applying hit, ticking every 500 ms;
// stack: 'refresh' (max duration, max magnitude) | 'stack' (independent stacks up to max).
// boss: what bosses get instead ('chilled', 'slowed', 'weakened', 'ignore', or a duration mult);
// bossDurMs: the replacement's duration.
(function (BD) {
  'use strict';

  BD.data.statuses = {
    burning: { name: 'Burning', icon: 'flame', durMs: 3000, dot: 'fire', pct: 0.35, stack: 'refresh', debuff: true },
    chilled: { name: 'Chilled', icon: 'snow', durMs: 2500, clock: 0.5, stack: 'refresh', debuff: true },
    frozen: { name: 'Frozen', icon: 'ice', durMs: 1500, clock: 0, stack: 'refresh', boss: 'chilled', bossDurMs: 3000, debuff: true, cc: true },
    shocked: { name: 'Shocked', icon: 'bolt', durMs: 3000, takenMult: 0.15, stack: 'refresh', debuff: true },
    poisoned: { name: 'Poisoned', icon: 'drop', durMs: 4000, dot: 'pois', pct: 0.5, stack: 'stack', max: 5, debuff: true },
    bleeding: { name: 'Bleeding', icon: 'blood', durMs: 4000, dot: 'phys', pct: 0.4, stack: 'refresh', debuff: true },
    stunned: { name: 'Stunned', icon: 'stars', durMs: 1000, clock: 0, stack: 'refresh', boss: 0.3, debuff: true, cc: true },
    feared: { name: 'Feared', icon: 'skull', durMs: 2000, stack: 'refresh', boss: 'weakened', bossDurMs: 4000, debuff: true, cc: true },
    weakened: { name: 'Weakened', icon: 'broken', durMs: 4000, dealtMult: -0.2, stack: 'refresh', debuff: true },
    vulnerable: { name: 'Vulnerable', icon: 'target', durMs: 4000, takenMult: 0.2, stack: 'refresh', debuff: true },
    exposed: { name: 'Exposed', icon: 'eye', durMs: 1400, clock: 0, takenMult: 0.5, stack: 'refresh', debuff: true },
    rooted: { name: 'Rooted', icon: 'root', durMs: 1500, noMove: true, stack: 'refresh', boss: 'slowed', bossMag: 0.4, debuff: true, cc: true },
    slowed: { name: 'Slowed', icon: 'snail', durMs: 2000, mag: 0.3, moveSlow: true, stack: 'refresh', debuff: true },
    blinded: { name: 'Blinded', icon: 'blind', durMs: 500, missChance: 0.5, stack: 'refresh', debuff: true },
    taunted: { name: 'Taunted', icon: 'shout', durMs: 3000, stack: 'refresh', boss: 'ignore', debuff: true },
    enraged: { name: 'Enraged', icon: 'fury', durMs: 5000, clock: 1.3, stack: 'refresh' },
    hidden: { name: 'Hidden', icon: 'cloak', durMs: 0, stack: 'refresh', buff: true },
    hasted: { name: 'Hasted', icon: 'wing', durMs: 3000, hasteMove: 15, hasteIas: 15, stack: 'refresh', buff: true },
    shielded: { name: 'Shielded', icon: 'shield', durMs: 6000, shield: true, stack: 'refresh', buff: true },
    braced: { name: 'Braced', icon: 'brace', durMs: 3000, stack: 'refresh', buff: true, ragePerHit: 4 },   // rage per hit taken
    evading: { name: 'Evading', icon: 'dash', durMs: 120, invuln: true, stack: 'refresh', buff: true, hiddenChip: true },
    airborne: { name: 'Airborne', icon: 'dash', durMs: 300, invuln: true, stack: 'refresh', hiddenChip: true },
    knockback_immune: { name: 'Unstoppable', icon: 'anchor', durMs: 1000, flag: 'knockback_immune', stack: 'refresh', buff: true },
    // skill buffs (numbers come from the applying skill as magnitude)
    war_cry: { name: 'War Cry', icon: 'shout', durMs: 6000, dmgPct: true, stack: 'refresh', buff: true },
    armor_up: { name: 'Iron Skin', icon: 'shield', durMs: 6000, armorPct: true, stack: 'refresh', buff: true },
    ambush_ready: { name: 'Shadow Strike', icon: 'cloak', durMs: 2000, stack: 'refresh', buff: true },
    vault_ready: { name: 'Steady Aim', icon: 'target', durMs: 3000, stack: 'refresh', buff: true },
    aegis: { name: 'Aegis', icon: 'shield', durMs: 4000, drPct: true, stack: 'refresh', buff: true },
    oath: { name: "Shieldmaiden's Oath", icon: 'wing', durMs: 0, stack: 'refresh', buff: true, grants: { dmg_pct: 25, dr_pct: 20 } },   // fixed +% (not magnitude)
    shrine_damage: { name: 'Shrine of Wrath', icon: 'fury', durMs: 0, dmgPct: true, stack: 'refresh', buff: true },
    shrine_speed: { name: 'Shrine of Haste', icon: 'wing', durMs: 0, movePct: true, stack: 'refresh', buff: true },
    shrine_regen: { name: 'Shrine of Mending', icon: 'heart', durMs: 0, regenPct: true, stack: 'refresh', buff: true },
    healing: { name: 'Healing', icon: 'heart', durMs: 500, hot: true, stack: 'stack', max: 4, buff: true },
  };

  // One plain line per status for tooltips and the log; {m} is the status's magnitude.
  BD.data.statusText = {
    burning: 'Takes fire damage over time.', chilled: 'Acts at half speed.', frozen: 'Cannot act.',
    shocked: 'Takes 15% more damage.', poisoned: 'Takes poison damage over time; stacks up to 5.',
    bleeding: 'Takes physical damage over time.', stunned: 'Cannot act.', feared: 'Flees and cannot attack.',
    weakened: 'Deals 20% less damage.', vulnerable: 'Takes 20% more damage.', exposed: 'Cannot act and takes 50% more damage.',
    rooted: 'Cannot move.', slowed: 'Moves 30% slower.', blinded: 'Attacks miss half the time.',
    taunted: 'Must attack the taunter.', enraged: 'Acts 30% faster.', hidden: 'Unseen until you attack.',
    hasted: '+15% movement and attack speed.', shielded: 'A barrier absorbs damage.', braced: 'Gain 4 rage each time you are hit.',
    evading: 'Cannot be hit.', airborne: 'Cannot be hit.', knockback_immune: 'Cannot be knocked back.',
    war_cry: '+{m}% damage.', armor_up: '+{m}% armour.', ambush_ready: 'Your next attack is a Shadow Strike.',
    vault_ready: 'Your next shot is a Steady Aim.', aegis: 'Take {m}% less damage.', oath: '+25% damage and 20% less damage taken.',
    shrine_damage: '+{m}% damage until you leave this floor.', shrine_speed: '+{m}% movement speed until you leave this floor.',
    shrine_regen: 'Regenerate {m}% life per second until you leave this floor.', healing: 'Restoring life.',
  };
})(globalThis.BD);
