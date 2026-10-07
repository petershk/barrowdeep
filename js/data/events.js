// @ts-check
// Floor events (04 §4) and traps (04 §6, 05 §2.5).
(function (BD) {
  'use strict';

  BD.data.floorEvents = {
    // wave k has waveBase + k monsters; clearing the last wave gives rewardItems items
    cursed_chest: { name: 'Cursed Chest', weight: 3, waves: 3, waveMs: 13000, waveBase: 3, rewardItems: 2, line: 'The chest snaps shut on a curse. The doors bar themselves.' },
    shrine: { name: 'Shrine', weight: 3, options: 2, line: 'An old shrine still hums with power.' },
    // fleeing, it drops a gold pile (×dropGold of a normal drop) at dropChance per decision; on death, deathPiles piles of ×deathGold
    hoarder: { name: 'Hoarder', weight: 2, escapeMs: 15000, monster: 'hoarder', dropChance: 0.25, dropGold: 0.6, deathPiles: 6, deathGold: 4,
      line: 'Something small and greedy rattles in the dark.' },
    trapped_vault: { name: 'Trapped Vault', weight: 2, line: 'A vault, and the floor before it is not to be trusted.' },
    blood_altar: { name: 'Blood Altar', weight: 2, lifePct: 0.2, ilvlBonus: 2, line: 'An altar thirsts. Blood buys a gift.' },
    // surviving gives rewardItems items and the xp of xpKills normal monsters
    restless_dead: { name: 'Restless Dead', weight: 2, surviveMs: 30000, waveMs: 6000, waveSize: 3, rewardItems: 2, xpKills: 8,
      line: 'The graves here do not stay closed.' },
  };
  BD.data.eventChance = 0.7;
  BD.data.eventRewardIlvlBonus = 1;   // event reward items roll this many item levels above the floor

  BD.data.shrineBuffs = [
    { id: 'shrine_damage', name: 'Wrath', desc: '+25% damage on this floor', magnitude: 25 },
    { id: 'shrine_speed', name: 'Haste', desc: '+30% movement speed on this floor', magnitude: 30 },
    { id: 'shrine_regen', name: 'Mending', desc: 'Regenerate 2% life per second on this floor', magnitude: 2 },
  ];

  BD.data.traps = {
    spike: { name: 'Spike trap', armMs: 800, mult: 1.0, element: 'phys' },
    // darts start `backoff` tiles behind the trap, down a telegraphed lane `lineTiles` long, `gapMs` apart, flying `maxDist` at `speed`
    // tiles/s; the trap fires when the player stands in its lane within `triggerRange`
    dart: { name: 'Dart trap', armMs: 400, mult: 0.6, darts: 3, element: 'phys', backoff: 4, lineTiles: 8, gapMs: 150, maxDist: 9, speed: 12, triggerRange: 3 },
    // vents cycle (firing every cycleMs) while the player is within wakeRange
    fire_vent: { name: 'Fire vent', armMs: 1000, activeMs: 1500, mult: 0.4, element: 'fire', wakeRange: 8, cycleMs: 2500 },
    gas: { name: 'Gas trap', armMs: 600, mult: 0.5, element: 'pois', poisonMs: 4000 },
  };

  // the Hoarder: an event-only monster
  const MonsterData = BD.data.monsters;
  MonsterData.hoarder = Object.assign({}, MonsterData.gutterkin, {
    id: 'hoarder', name: 'The Hoarder', act: 0, family: 'human', role: 'swarmer', hp: 30, dmg: [0, 0], attackMs: 1000, moveMs: 260, xp: 20, xpW: 20,
    sprite: 'imp', pal: { R: '#d2a73f', r: '#8f6f26', Y: '#fff3cf' }, behaviours: [{ id: 'hoard' }], aggro: { notice: 7, leash: 99 }, res: { fire: 0, cold: 0, light: 0, pois: 0 },
  });
})(globalThis.BD);
