// @ts-check
// Bosses (04 §5). Each boss is a monster def (rank 'boss') with an authored kit. HP = 35 × the act
// roster's mean base HP (rank.hp), DMG = the roster's mean damage (rank.dmg 1.6). Move multipliers
// are relative to the boss's DMG (05 §3). Moves are implemented once in sim/bosses/; each kit entry
// carries every number its move uses (the move receives the entry as `m`), and each phase entry the
// numbers of its onEnter effect. Shared kit fields: weight, minRange/maxRange (tiles), cdMs, mult (x DMG),
// armMs (zone telegraph), windupMs (how long the boss is committed to the move), maxWindupMs (he is free
// to act again after this even if the zone arms later), exposedMs, count, add/cap (summons), scatter
// (tiles around the target or boss), burnMs/burnMult (burning ground left behind, per-tick damage as a
// fraction of the boss's average hit), length/angle (tiles / degrees of a ray or cone).
(function (BD) {
  'use strict';

  const ref = BD.data.monsterRef.actRef;
  function boss(id, act, o) {
    const r = ref(act);
    BD.data.bosses[id] = Object.assign({
      id, act, family: 'undead', role: 'boss', hp: r.hp, dmg: [r.dmg * 0.8, r.dmg * 1.2], attackMs: 1400, moveMs: 450, windupMs: 500, dr: 0,
      res: null, onHit: [], xp: 0, xpW: 10, gold: 1, scale: 2, behaviours: [{ id: 'fearless' }, { id: 'melee' }], aggro: { notice: 30, leash: 99 },
      element: 'phys', crushing: { everyMs: 8000, jitter: 2000, mult: 7, armMs: 480 }, specialEvery: [5000, 7500], phase2Every: [2800, 4400],
      summonCap: 6, orbsAt: [75, 50, 25],
    }, o);
    const fam = BD.data.monsterRef.FAMILY_RES[BD.data.bosses[id].family];
    BD.data.bosses[id].res = Object.assign({}, fam, o.res || {});
  }
  BD.data.bosses = {};

  boss('grulk', 1, {
    hpMult: 1.3, dmgMult: 1.2,
    name: 'Grulk the Gravewaker', title: 'Lord of the Church Crypt', sprite: 'zombie', family: 'undead', arena: 'crypt',
    pal: { G: '#8a9a6a', g: '#5a6a44', B: '#5a3a2a', b: '#3a2418' },
    kit: [
      { move: 'leap_stomp', weight: 3, minRange: 3, maxRange: 8, cdMs: 9000, mult: 8.5, armMs: 1000, exposedMs: 1400, knockback: 2 },
      // bone_cone: rows fire rowMs apart and stay marked rowArmScale x rowMs; twinOffset: radians either side
      // of the target for the doubled sweep
      {
        move: 'bone_cone', weight: 3, minRange: 1, maxRange: 5, cdMs: 7000, mult: 1.8, rowMs: 180, length: 5, angle: 70,
        twinOffset: 0.5, rowArmScale: 1.5,
      },
      { move: 'raise_dead', weight: 2, minRange: 0, maxRange: 99, cdMs: 14000, armMs: 1200, count: 2, add: 'skeleton', cap: 2, scatter: 4, windupMs: 700 },
    ],
    opener: 'raise_dead',
    phases: [{ atPct: 50, speedMult: 1.2, name: 'Enraged', mods: { bone_cone: { twice: true }, raise_dead: { add: 'skeleton_archer' } } }],
    lines: { wake: 'WHO DISTURBS THE DEAD?', enrage: 'THE GRAVE HUNGERS!', defeat: 'The dead... sleep...' },
  });

  boss('mortis', 2, {
    hpMult: 1.9, dmgMult: 1.1,
    name: 'Mortis the Hollow King', title: 'Throne of the Catacombs', sprite: 'wraith', family: 'undead', arena: 'throne',
    pal: { R: '#9a90b8', r: '#6a6088', W: '#e0e8ff', Y: '#9fc3ff' },
    kit: [
      // soul_lance: fastLanceMs: a lance right after a Hollow Step arms this much sooner
      { move: 'soul_lance', weight: 4, minRange: 2, maxRange: 12, cdMs: 4500, mult: 6, armMs: 1000, length: 14, fastLanceMs: 400 },
      { move: 'bone_prison', weight: 3, minRange: 0, maxRange: 10, cdMs: 6000, mult: 1.0, armMs: 900, rootMs: 1500, maxWindupMs: 500 },
      { move: 'wraith_call', weight: 2, minRange: 0, maxRange: 99, cdMs: 15000, count: 2, add: 'wraith', cap: 4, windupMs: 600 },
      // hollow_step: the blink costs stepMs and delays the next special as much
      { move: 'hollow_step', weight: 2, minRange: 0, maxRange: 99, cdMs: 9000, stepMs: 600 },
    ],
    opener: 'wraith_call',
    // split_shades: the twin's first special / Crushing Blow come this long after the split; killing one
    // shade leaves the other Exposed for loneShadeExposedMs
    phases: [{
      atPct: 50, speedMult: 1.15, name: 'Sundered', onEnter: 'split_shades',
      twinFirstSpecialMs: 2500, twinFirstCrushMs: 6000, loneShadeExposedMs: 3000,
    }],
    lines: { wake: 'KNEEL BEFORE YOUR KING.', enrage: 'I AM LEGION OF ONE.', defeat: 'The throne... is empty...' },
  });

  boss('mygra', 3, {
    hpMult: 1.05, dmgMult: 0.9,
    name: 'Mygra the Brood Mother', title: 'Queen of the Deep Caves', sprite: 'spider', family: 'beast', arena: 'cavern',
    pal: { p: '#3a2a4a', P: '#5a3a6a', R: '#ff4070' },
    kit: [
      // venom_spit: poisonMs: poisoned status and pool duration; poolMult: pool damage per tick x her average hit
      {
        move: 'venom_spit', weight: 3, minRange: 2, maxRange: 9, cdMs: 6000, mult: 3, armMs: 1000, count: 3, scatter: 2,
        poisonMs: 4000, poolMult: 0.3, windupMs: 500,
      },
      { move: 'web_spray', weight: 3, minRange: 1, maxRange: 4, cdMs: 6000, armMs: 700, length: 4, angle: 90, slowMs: 2000, slowMag: 0.6 },
      // burrow_strike: burrowMs underground before the strike is marked
      { move: 'burrow_strike', weight: 3, minRange: 3, maxRange: 99, cdMs: 11000, mult: 6, armMs: 800, exposedMs: 1400, burrowMs: 700 },
      { move: 'brood', weight: 2, minRange: 0, maxRange: 99, cdMs: 16000, from: 'egg_clutch', add: 'cave_spider', perClutch: 2, windupMs: 500 },
    ],
    opener: 'brood',
    // web_edges: webs cover every walkable tile within webReach tiles of a wall for the rest of the fight
    phases: [{ atPct: 50, speedMult: 1.2, name: 'Frenzied', onEnter: 'web_edges', webReach: 2, mods: { burrow_strike: { cdMult: 0.5 } } }],
    lines: { wake: 'MORE MEAT FOR THE BROOD.', enrage: 'MY CHILDREN, FEAST!', defeat: 'The brood... is silent...' },
  });

  boss('hakthul', 4, {
    hpMult: 1.3, dmgMult: 0.68,
    name: 'Hakthul the Dread Knight', title: 'Warden of the Burning Halls', sprite: 'hellknight', family: 'demon', arena: 'lava_hall', dr: 15,
    kit: [
      { move: 'shield_charge', weight: 3, minRange: 2, maxRange: 6, cdMs: 7000, mult: 8, armMs: 700, length: 6, exposedMs: 2000 },
      { move: 'hellfire', weight: 3, minRange: 0, maxRange: 10, cdMs: 6000, mult: 3, armMs: 900, burnMs: 3000, burnMult: 0.4, maxWindupMs: 600 },
      { move: 'cleaving_sweep', weight: 3, minRange: 1, maxRange: 2, cdMs: 5000, mult: 7, armMs: 650, length: 2, angle: 120 },
      // brand: the mark follows its target for armMs, then the floor beneath erupts
      { move: 'brand', weight: 2, minRange: 0, maxRange: 99, cdMs: 11000, mult: 8, armMs: 3000, burnMs: 3000, burnMult: 0.5, windupMs: 500 },
    ],
    opener: 'brand',
    // eruptions: from eruptFirstMs into the phase, every eruptEveryMs, eruptCount random tiles within
    // eruptScatter of the hero erupt (armed eruptArmMs, eruptMult x DMG)
    phases: [{
      atPct: 50, speedMult: 1.2, name: 'Inferno', onEnter: 'eruptions', mods: { shield_charge: { twice: true } },
      eruptEveryMs: 2000, eruptFirstMs: 1500, eruptCount: 4, eruptScatter: 6, eruptArmMs: 1000, eruptMult: 2.5,
    }],
    lines: { wake: 'YOU WILL BURN WITH THE REST.', enrage: 'THE HALLS ERUPT!', defeat: 'My oath... is broken...' },
  });

  boss('malgoth', 4, {
    name: 'Malgoth', title: 'The Devil Beneath Brennor', sprite: 'malgoth', family: 'demon', arena: 'sanctum', scale: 2, dr: 10,
    kit: [
      { move: 'hellfire', weight: 3, minRange: 0, maxRange: 12, cdMs: 4500, mult: 4, armMs: 900, burnMs: 3000, burnMult: 0.4, maxWindupMs: 600, phase: 0 },
      // fire_wave: `rings` expanding rings one tile apart with one gap (gapHalfWidth tiles of arc); each ring is
      // marked ringArmMs before it burns, ring r fires r x ringEveryMs after the first
      {
        move: 'fire_wave', weight: 3, minRange: 0, maxRange: 12, cdMs: 9000, mult: 4, armMs: 1200,
        rings: 9, gapHalfWidth: 1.1, ringArmMs: 400, ringEveryMs: 110, phase: 0,
      },
      { move: 'imp_call', weight: 2, minRange: 0, maxRange: 99, cdMs: 16000, count: 3, add: 'hellimp', cap: 5, windupMs: 600, phase: 0 },
      // chaos_rain: `waves` waves of `count` drops (the first on the hero), waveGapMs between waves
      {
        move: 'chaos_rain', weight: 3, minRange: 0, maxRange: 12, cdMs: 9000, mult: 3, armMs: 1000, count: 8, exposedMs: 2000,
        scatter: 4, waves: 2, waveGapMs: 200, phase: 1,
      },
      { move: 'grasping_hands', weight: 3, minRange: 0, maxRange: 12, cdMs: 6000, mult: 2, armMs: 900, rootMs: 1500, windupMs: 500, phase: 1 },
      { move: 'claw', weight: 3, minRange: 1, maxRange: 2, cdMs: 4000, mult: 3, armMs: 650, length: 2, angle: 110, phase: 1 },
      // meteor_train: `count` meteors at the hero, one every everyMs
      {
        move: 'meteor_train', weight: 3, minRange: 0, maxRange: 14, cdMs: 9000, mult: 3, armMs: 900, count: 5, everyMs: 450,
        burnMs: 2500, burnMult: 0.4, phase: 2,
      },
      // doom_beam: `length` tiles from the chamber centre; after armMs it takes `ticks` positions tickMs apart,
      // turning 90 degrees every ticksPerQuarter ticks; one hit per victim per hitEveryMs
      {
        move: 'doom_beam', weight: 2, minRange: 0, maxRange: 14, cdMs: 14000, mult: 2, armMs: 1000,
        length: 13, ticks: 40, tickMs: 100, ticksPerQuarter: 10, hitEveryMs: 500, phase: 2,
      },
    ],
    opener: 'imp_call',
    phases: [
      // malgoth_p2: a burning rim rimDepth tiles deep inside the chamber wall, rimBurnMult x his average hit per tick
      { atPct: 70, speedMult: 1.1, name: 'Unbound', onEnter: 'malgoth_p2', rimDepth: 2.5, rimBurnMult: 0.5 },
      // malgoth_p3: two wingAdd monsters flank the chamber centre
      { atPct: 35, speedMult: 1.2, name: 'Ascendant', onEnter: 'malgoth_p3', wingAdd: 'hell_knight' },
    ],
    // Ascension 10's fourth phase (when and how fast: BD.data.ascension 'eternal'); it cycles the moves of
    // every phase except allMovesSkip (no adds)
    eternal: { name: 'Eternal', line: 'I AM ETERNAL!' },
    allMovesSkip: ['imp_call'],
    lines: { wake: 'SO THE LAST LAMB COMES DOWN.', enrage: 'BURN, BRENNOR!', defeat: 'I... am... eternal...' },
    hpShares: [0.3, 0.35, 0.35],
  });
})(globalThis.BD);
