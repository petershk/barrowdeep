// @ts-check
// Bosses (04 §5). Each boss is a monster def (rank 'boss') with an authored kit. HP = 35 × the act
// roster's mean base HP (rank.hp), DMG = the roster's mean damage (rank.dmg 1.6). Move multipliers
// are relative to the boss's DMG (05 §3). Moves are implemented once in sim/boss_moves.js.
(function (BD) {
  'use strict';

  const ref = BD.data.monsterRef.actRef;
  function boss(id, act, o) {
    const r = ref(act);
    BD.data.bosses[id] = Object.assign({
      id, act, family: 'undead', role: 'boss', hp: r.hp, dmg: [r.dmg * 0.8, r.dmg * 1.2], attackMs: 1400, moveMs: 450, windupMs: 500, dr: 0,
      res: null, onHit: [], xp: 0, xpW: 10, gold: 1, scale: 2, behaviours: [{ id: 'fearless' }, { id: 'melee' }], aggro: { notice: 30, leash: 99 },
      element: 'phys', crushing: { everyMs: 8000, jitter: 2000, mult: 5, armMs: 480 }, specialEvery: [5000, 7500], phase2Every: [2800, 4400],
      summonCap: 6, orbsAt: [75, 50, 25],
    }, o);
    const fam = BD.data.monsterRef.FAMILY_RES[BD.data.bosses[id].family];
    BD.data.bosses[id].res = Object.assign({}, fam, o.res || {});
  }
  BD.data.bosses = {};

  boss('grulk', 1, {
    name: 'Grulk the Gravewaker', title: 'Lord of the Church Crypt', sprite: 'zombie', family: 'undead', arena: 'crypt',
    pal: { G: '#8a9a6a', g: '#5a6a44', B: '#5a3a2a', b: '#3a2418' },
    kit: [
      { move: 'leap_stomp', weight: 3, minRange: 3, maxRange: 8, cdMs: 9000, mult: 6, armMs: 1000, exposedMs: 1400, knockback: 2 },
      { move: 'bone_cone', weight: 3, minRange: 1, maxRange: 5, cdMs: 7000, mult: 1.5, rowMs: 180, length: 5 },
      { move: 'raise_dead', weight: 2, minRange: 0, maxRange: 99, cdMs: 14000, armMs: 1200, count: 3, add: 'skeleton', cap: 4 },
    ],
    opener: 'raise_dead',
    phases: [{ atPct: 50, speedMult: 1.2, name: 'Enraged', mods: { bone_cone: { twice: true }, raise_dead: { add: 'skeleton_archer' } } }],
    lines: { wake: 'WHO DISTURBS THE DEAD?', enrage: 'THE GRAVE HUNGERS!', defeat: 'The dead... sleep...' },
  });

  boss('mortis', 2, {
    name: 'Mortis the Hollow King', title: 'Throne of the Catacombs', sprite: 'wraith', family: 'undead', arena: 'throne',
    pal: { R: '#9a90b8', r: '#6a6088', W: '#e0e8ff', Y: '#9fc3ff' },
    kit: [
      { move: 'soul_lance', weight: 4, minRange: 2, maxRange: 12, cdMs: 4500, mult: 5, armMs: 1000, length: 14 },
      { move: 'bone_prison', weight: 3, minRange: 0, maxRange: 10, cdMs: 6000, mult: 1.0, armMs: 900, rootMs: 1500 },
      { move: 'wraith_call', weight: 2, minRange: 0, maxRange: 99, cdMs: 15000, count: 3, add: 'wraith', cap: 6 },
      { move: 'hollow_step', weight: 2, minRange: 0, maxRange: 99, cdMs: 9000 },
    ],
    opener: 'wraith_call',
    phases: [{ atPct: 50, speedMult: 1.15, name: 'Sundered', onEnter: 'split_shades' }],
    lines: { wake: 'KNEEL BEFORE YOUR KING.', enrage: 'I AM LEGION OF ONE.', defeat: 'The throne... is empty...' },
  });

  boss('mygra', 3, {
    name: 'Mygra the Brood Mother', title: 'Queen of the Deep Caves', sprite: 'spider', family: 'beast', arena: 'cavern',
    pal: { p: '#3a2a4a', P: '#5a3a6a', R: '#ff4070' },
    kit: [
      { move: 'venom_spit', weight: 3, minRange: 2, maxRange: 9, cdMs: 6000, mult: 3, armMs: 1000, count: 3 },
      { move: 'web_spray', weight: 3, minRange: 1, maxRange: 4, cdMs: 6000, armMs: 700, length: 4 },
      { move: 'burrow_strike', weight: 3, minRange: 3, maxRange: 99, cdMs: 9000, mult: 5, armMs: 800, exposedMs: 1400 },
      { move: 'brood', weight: 2, minRange: 0, maxRange: 99, cdMs: 12000 },
    ],
    opener: 'brood',
    phases: [{ atPct: 50, speedMult: 1.2, name: 'Frenzied', onEnter: 'web_edges', mods: { burrow_strike: { cdMult: 0.5 } } }],
    lines: { wake: 'MORE MEAT FOR THE BROOD.', enrage: 'MY CHILDREN, FEAST!', defeat: 'The brood... is silent...' },
  });

  boss('hakthul', 4, {
    name: 'Hakthul the Dread Knight', title: 'Warden of the Burning Halls', sprite: 'hellknight', family: 'demon', arena: 'lava_hall', dr: 15,
    kit: [
      { move: 'shield_charge', weight: 3, minRange: 2, maxRange: 6, cdMs: 7000, mult: 5, armMs: 700, length: 6, exposedMs: 2000 },
      { move: 'hellfire', weight: 3, minRange: 0, maxRange: 10, cdMs: 5000, mult: 4, armMs: 900 },
      { move: 'cleaving_sweep', weight: 3, minRange: 1, maxRange: 2, cdMs: 5000, mult: 4, armMs: 650 },
      { move: 'brand', weight: 2, minRange: 0, maxRange: 99, cdMs: 11000, mult: 5, armMs: 3000 },
    ],
    opener: 'brand',
    phases: [{ atPct: 50, speedMult: 1.2, name: 'Inferno', onEnter: 'eruptions', mods: { shield_charge: { twice: true } } }],
    lines: { wake: 'YOU WILL BURN WITH THE REST.', enrage: 'THE HALLS ERUPT!', defeat: 'My oath... is broken...' },
  });

  boss('malgoth', 4, {
    name: 'Malgoth', title: 'The Devil Beneath Brennor', sprite: 'malgoth', family: 'demon', arena: 'sanctum', scale: 2, dr: 10,
    kit: [
      { move: 'hellfire', weight: 3, minRange: 0, maxRange: 12, cdMs: 4500, mult: 4, armMs: 900, phase: 0 },
      { move: 'fire_wave', weight: 3, minRange: 0, maxRange: 12, cdMs: 9000, mult: 4, armMs: 1200, phase: 0 },
      { move: 'imp_call', weight: 2, minRange: 0, maxRange: 99, cdMs: 16000, count: 4, add: 'hellimp', cap: 6, phase: 0 },
      { move: 'chaos_rain', weight: 3, minRange: 0, maxRange: 12, cdMs: 9000, mult: 3, armMs: 1000, count: 8, exposedMs: 2000, phase: 1 },
      { move: 'grasping_hands', weight: 3, minRange: 0, maxRange: 12, cdMs: 6000, mult: 2, armMs: 900, rootMs: 1500, phase: 1 },
      { move: 'claw', weight: 3, minRange: 1, maxRange: 2, cdMs: 4000, mult: 3, armMs: 650, phase: 1 },
      { move: 'meteor_train', weight: 3, minRange: 0, maxRange: 14, cdMs: 9000, mult: 3, armMs: 900, count: 5, phase: 2 },
      { move: 'doom_beam', weight: 2, minRange: 0, maxRange: 14, cdMs: 14000, mult: 2, armMs: 1000, phase: 2 },
    ],
    opener: 'imp_call',
    phases: [
      { atPct: 70, speedMult: 1.1, name: 'Unbound', onEnter: 'malgoth_p2' },
      { atPct: 35, speedMult: 1.2, name: 'Ascendant', onEnter: 'malgoth_p3' },
    ],
    lines: { wake: 'SO THE LAST LAMB COMES DOWN.', enrage: 'BURN, BRENNOR!', defeat: 'I... am... eternal...' },
    hpShares: [0.3, 0.35, 0.35],
  });
})(globalThis.BD);
