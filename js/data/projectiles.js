// @ts-check
// Projectile kinds (06 §8.4). speed in tiles/s. Visuals are looked up by id in the view.
(function (BD) {
  'use strict';

  BD.data.projectiles = {
    arrow: { speed: 14, element: 'phys', school: 'steel', sprite: 'arrow' },
    bolt: { speed: 14, element: 'phys', school: 'steel', sprite: 'bolt' },
    wand_bolt: { speed: 12, element: 'phys', school: 'general', sprite: 'orb', light: '#b88aff' },
    javelin: { speed: 13, element: 'phys', school: 'holy', sprite: 'spear', light: '#ffd75a' },
    quill: { speed: 6, element: 'phys', school: 'bone', sprite: 'arrow' },
    fire_bolt: { speed: 6, element: 'fire', school: 'fire', sprite: 'orb', light: '#ff8a2a' },
    bone_spear: { speed: 6, element: 'phys', school: 'bone', sprite: 'spear' },
    blood_bolt: { speed: 6, element: 'phys', school: 'blood', sprite: 'orb', light: '#c0341c' },
    firebolt: { speed: 10, element: 'fire', school: 'fire', sprite: 'orb', light: '#ff8a2a' },
    fireball: { speed: 8, element: 'fire', school: 'fire', sprite: 'orb_big', light: '#ff8a2a' },
    ice_shard: { speed: 12, element: 'cold', school: 'cold', sprite: 'shard', light: '#9ee4ff' },
    spark: { speed: 5, element: 'light', school: 'storm', sprite: 'spark', light: '#9fc3ff', erratic: true },
    sentry_bolt: { speed: 16, element: 'light', school: 'storm', sprite: 'spark', light: '#9fc3ff' },
    shard_burst: { speed: 10, element: 'cold', school: 'cold', sprite: 'shard' },
    chaos_bolt: { speed: 6, element: 'fire', school: 'shadow', sprite: 'orb', light: '#a03070' },
  };

  // Zones (05 §2.5): tick every 500 ms unless `once`. dmgPct is of the source hit / source DMG.
  BD.data.zones = {
    burning_ground: { tickMs: 500, element: 'fire', dmgPct: 0.25, school: 'fire', light: '#ff7a2a' },
    frost_patch: { tickMs: 500, status: 'chilled', statusMs: 1000, school: 'cold' },
    static_field: { tickMs: 500, element: 'light', dmgPct: 0.1, status: 'shocked', statusChance: 0.2, school: 'storm' },
    poison_pool: { tickMs: 500, element: 'pois', dmgPct: 0.1, status: 'poisoned', statusMs: 4000, school: 'poison' },
    lava: { tickMs: 500, element: 'fire', maxLifePct: 0.08, school: 'lava', noFaction: true },
    molten_trail: { tickMs: 500, element: 'fire', dmgPct: 0.15, school: 'fire' },
    caltrops: { tickMs: 500, status: 'slowed', statusMag: 0.5, statusMs: 1000, bleedOnce: 0.2, school: 'steel' },
    web: { tickMs: 500, status: 'slowed', statusMag: 0.4, statusMs: 2000, school: 'bone' },
    smoke: { tickMs: 500, status: 'blinded', statusMs: 600, extra: 'vulnerable', school: 'shadow' },
    blizzard: { tickMs: 500, element: 'cold', status: 'chilled', statusMs: 1000, school: 'cold' },
    rain: { tickMs: 500, element: 'phys', school: 'steel' },
    lightning_pillar: { tickMs: 500, element: 'light', dmgPct: 0.3, school: 'storm' },
  };
})(globalThis.BD);
