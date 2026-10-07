// @ts-check
// Monster roster (04 §3.3). Base values at AL 1; scaled per 05 §3. xp is a relative weight within
// the act, normalised so each act's roster averages 10 (05 §5). Behaviours run in order (06 §8.1).
(function (BD) {
  'use strict';

  const FAMILY_RES = {
    undead: { fire: 0, cold: 20, light: 0, pois: 40 },
    demon: { fire: 35, cold: 0, light: 0, pois: 0 },
    beast: { fire: 0, cold: 0, light: 0, pois: 0 },
    construct: { fire: 0, cold: 0, light: -25, pois: 0 },
    human: { fire: 0, cold: 0, light: 0, pois: 0 },
  };

  const M = {};
  function mon(id, o) {
    M[id] = Object.assign({
      id, family: 'human', role: 'brute', hp: 10, dmg: [1, 3], attackMs: 1200, moveMs: 380, dr: 0,
      res: null, onHit: [], xp: 10, gold: 1, sprite: 'skeleton', pal: null, scale: 1, size: 1,
      behaviours: [{ id: 'melee' }], aggro: { notice: 6, leash: 14 }, windupMs: 500, act: 1, element: 'phys',
    }, o);
    M[id].res = Object.assign({}, FAMILY_RES[M[id].family], o.res || {});
  }

  // ---------------- Act I — Church ----------------
  mon('gutterkin', { name: 'Gutterkin', act: 1, family: 'human', role: 'swarmer', hp: 10, dmg: [1, 3], attackMs: 1200, moveMs: 330, xp: 4,
    sprite: 'imp', pal: { R: '#8a7a5a', r: '#5e5038', Y: '#e0d070' },
    behaviours: [{ id: 'coward', fleePct: 0.25, routOn: 'gutterkin_bonecaller' }, { id: 'melee' }] });
  mon('gutterkin_bonecaller', { name: 'Gutterkin Bonecaller', act: 1, family: 'human', role: 'support', hp: 16, dmg: [2, 4], attackMs: 2000, moveMs: 380, xp: 12,
    sprite: 'imp', pal: { R: '#5a3a7a', r: '#3a2450', Y: '#ff9a40' }, element: 'fire',
    behaviours: [{ id: 'revive', radius: 6, cdMs: 4000, cap: 1 }, { id: 'kite', min: 3, max: 6 }, { id: 'shoot', range: 6, projectile: 'fire_bolt' }] });
  mon('spinehog', { name: 'Spinehog', act: 1, family: 'beast', role: 'artillery', hp: 14, dmg: [2, 4], attackMs: 1800, moveMs: 300, xp: 8,
    sprite: 'spider', pal: { p: '#5a4a3a', P: '#8a7a5a', R: '#e0c070' }, aggro: { notice: 8, leash: 14 },
    behaviours: [{ id: 'kite', min: 3, max: 5 }, { id: 'shoot', range: 6, projectile: 'quill' }] });
  mon('rotting_zombie', { name: 'Rotting Zombie', act: 1, family: 'undead', role: 'tank', hp: 34, dmg: [3, 6], attackMs: 1500, moveMs: 650, xp: 10, dr: 10,
    sprite: 'zombie', onHit: [{ status: 'slowed', chance: 0.2, durMs: 1500, mag: 0.3 }],
    behaviours: [{ id: 'fearless' }, { id: 'melee' }] });
  mon('skeleton', { name: 'Skeleton', act: 1, family: 'undead', role: 'brute', hp: 18, dmg: [2, 5], attackMs: 1300, moveMs: 380, xp: 7,
    sprite: 'skeleton', behaviours: [{ id: 'melee' }] });
  mon('skeleton_archer', { name: 'Skeleton Archer', act: 1, family: 'undead', role: 'artillery', hp: 14, dmg: [2, 4], attackMs: 1600, moveMs: 380, xp: 9,
    sprite: 'skarcher', aggro: { notice: 8, leash: 14 },
    behaviours: [{ id: 'kite', min: 2, max: 6 }, { id: 'shoot', range: 7, projectile: 'arrow' }] });

  // ---------------- Act II — Catacombs ----------------
  mon('ghoul', { name: 'Ghoul', act: 2, family: 'undead', role: 'skirmisher', hp: 26, dmg: [3, 6], attackMs: 1000, moveMs: 260, xp: 10,
    sprite: 'ghoul', behaviours: [{ id: 'eat_corpse', heal: 0.3 }, { id: 'melee' }] });
  mon('bone_mage', { name: 'Bone Mage', act: 2, family: 'undead', role: 'caster', hp: 20, dmg: [3, 6], attackMs: 2200, moveMs: 400, xp: 14,
    sprite: 'bonemage', aggro: { notice: 8, leash: 14 },
    behaviours: [{ id: 'bone_wall', cdMs: 8000 }, { id: 'kite', min: 3, max: 6 }, { id: 'shoot', range: 7, projectile: 'bone_spear' }] });
  mon('wraith', { name: 'Wraith', act: 2, family: 'undead', role: 'skirmisher', hp: 22, dmg: [3, 5], attackMs: 1200, moveMs: 320, xp: 12,
    sprite: 'wraith', behaviours: [{ id: 'phase' }, { id: 'drain', pct: 0.5 }, { id: 'evade', pct: 0.15 }, { id: 'melee' }] });
  mon('crypt_guard', { name: 'Crypt Guard', act: 2, family: 'undead', role: 'tank', hp: 30, dmg: [3, 6], attackMs: 1400, moveMs: 420, xp: 13, dr: 20,
    sprite: 'skeleton', pal: { W: '#9aa0aa', w: '#6a707a', R: '#3a4a6a', r: '#2a3448' },
    behaviours: [{ id: 'block_front', pct: 0.6 }, { id: 'melee' }] });
  mon('skeleton_archer_ii', { name: 'Skeleton Archer', act: 2, family: 'undead', role: 'artillery', hp: 14, dmg: [2, 4], attackMs: 1600, moveMs: 380, xp: 9,
    sprite: 'skarcher', aggro: { notice: 8, leash: 14 },
    behaviours: [{ id: 'kite', min: 2, max: 6 }, { id: 'shoot', range: 7, projectile: 'arrow' }] });

  // ---------------- Act III — Caves ----------------
  mon('cave_spider', { name: 'Cave Spider', act: 3, family: 'beast', role: 'swarmer', hp: 12, dmg: [2, 4], attackMs: 900, moveMs: 250, xp: 6,
    sprite: 'spider', onHit: [{ status: 'poisoned', chance: 0.3, durMs: 4000 }],
    behaviours: [{ id: 'lob', zone: 'web', cdMs: 6000, armMs: 700, range: 5 }, { id: 'melee' }] });
  mon('egg_clutch', { name: 'Egg Clutch', act: 3, family: 'beast', role: 'spawner', hp: 40, dmg: [0, 0], attackMs: 1000, moveMs: 0, xp: 12,
    sprite: 'chest', pal: { B: '#c8b890', b: '#9a8a64', d: '#6a5a3a', G: '#8a6a9a', g: '#5a4a6a' }, spawner: true,
    behaviours: [{ id: 'spawn', what: 'cave_spider', every: 6000, cap: 4 }] });
  mon('pit_viper', { name: 'Pit Viper', act: 3, family: 'beast', role: 'ambusher', hp: 22, dmg: [4, 7], attackMs: 1100, moveMs: 300, xp: 12,
    sprite: 'snake', onHit: [{ status: 'poisoned', chance: 0.5, durMs: 4000 }],
    behaviours: [{ id: 'burrow', cdMs: 7000 }, { id: 'melee' }] });
  mon('gargoyle', { name: 'Gargoyle', act: 3, family: 'construct', role: 'ambusher', hp: 36, dmg: [5, 8], attackMs: 1400, moveMs: 350, xp: 15, dr: 20,
    sprite: 'gargoyle', behaviours: [{ id: 'dormant', wakeDist: 3 }, { id: 'melee' }] });
  mon('fungal_shambler', { name: 'Fungal Shambler', act: 3, family: 'beast', role: 'tank', hp: 40, dmg: [4, 7], attackMs: 1600, moveMs: 600, xp: 13,
    sprite: 'zombie', pal: { G: '#8a7aa0', g: '#5e5070', B: '#7a8a3a', b: '#4e5a24' },
    behaviours: [{ id: 'fearless' }, { id: 'death_zone', zone: 'poison_pool', armMs: 500 }, { id: 'melee' }] });

  // ---------------- Act IV — Demonic Halls ----------------
  mon('hellimp', { name: 'Hellimp', act: 4, family: 'demon', role: 'bomber', hp: 10, dmg: [10, 14], attackMs: 600, moveMs: 240, xp: 8,
    sprite: 'imp', element: 'fire', behaviours: [{ id: 'explode', fuseMs: 600, radius: 1, dmgMult: 1.0 }] });
  mon('lesser_demon', { name: 'Lesser Demon', act: 4, family: 'demon', role: 'brute', hp: 48, dmg: [6, 10], attackMs: 1500, moveMs: 400, xp: 18,
    sprite: 'demon', behaviours: [{ id: 'cleave_cone', radius: 2, windupMs: 700, cdMs: 5000 }, { id: 'melee' }] });
  mon('succubus', { name: 'Succubus', act: 4, family: 'demon', role: 'caster', hp: 26, dmg: [5, 8], attackMs: 2000, moveMs: 350, xp: 16,
    sprite: 'succubus', aggro: { notice: 8, leash: 14 },
    behaviours: [{ id: 'blink_away', dist: 5, cdMs: 5000 }, { id: 'kite', min: 3, max: 6 }, { id: 'shoot', range: 7, projectile: 'blood_bolt' }] });
  mon('hell_knight', { name: 'Hell Knight', act: 4, family: 'demon', role: 'tank', hp: 55, dmg: [6, 10], attackMs: 1500, moveMs: 420, xp: 22, dr: 25,
    sprite: 'hellknight', behaviours: [{ id: 'block_front', pct: 0.7 }, { id: 'charge_line', len: 5, windupMs: 700, cdMs: 7000 }, { id: 'melee' }] });
  mon('chaos_spawn', { name: 'Chaos-Spawn', act: 4, family: 'demon', role: 'brute', hp: 34, dmg: [4, 8], attackMs: 1200, moveMs: 360, xp: 14,
    sprite: 'chaos', behaviours: [{ id: 'split', into: 'chaos_spawnling', count: 2, hpPct: 0.4 }, { id: 'melee' }] });
  mon('chaos_spawnling', { name: 'Chaos Spawnling', act: 4, family: 'demon', role: 'swarmer', hp: 10, dmg: [2, 4], attackMs: 900, moveMs: 300, xp: 4,
    sprite: 'chaos', pal: { M: '#c070c0', m: '#8a4a8a' }, spawnOnly: true, behaviours: [{ id: 'melee' }] });

  // normalise xp so each act's roster (excluding spawn-only) averages 10
  for (const act of [1, 2, 3, 4]) {
    const list = Object.values(M).filter((m) => m.act === act && !m.spawnOnly);
    const mean = list.reduce((a, m) => a + m.xp, 0) / list.length;
    for (const m of Object.values(M)) if (m.act === act) m.xpW = (m.xp * 10) / mean;
  }

  /** Reference values per act (05 §3): unweighted means excluding spawners. */
  function actRef(act) {
    const list = Object.values(M).filter((m) => m.act === act && !m.spawner && !m.spawnOnly);
    const hp = list.reduce((a, m) => a + m.hp, 0) / list.length;
    const dmg = list.reduce((a, m) => a + (m.dmg[0] + m.dmg[1]) / 2, 0) / list.length;
    return { hp, dmg };
  }

  BD.data.monsters = M;
  BD.data.monsterRef = { actRef, FAMILY_RES };
})(globalThis.BD);
