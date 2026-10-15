// @ts-check
// FX recipes as data (07 §4.2). palette: a school name, or 'auto' = the caller's school. Dark schools
// (palette SCHOOL_NORMAL_BLEND) draw source-over automatically; `blend` overrides it per entry.
// Weapon impacts are the signature feature: you should tell the weapon with your eyes closed.
// Every element has its own shape motif (ART_DIRECTION.md): steel spikes and stars, fire tongues,
// cold crystals, lightning forks, poison puffs. Gold is crit and Exposed only.
(function (BD) {
  'use strict';

  const Palette = BD.view.palette;
  const R = {};
  BD.view.fxRecipes = R;

  // ---- weapon impacts (numbers from the original fxImpact) ----
  R.impact_dagger = {
    particles: [{ count: 4, shape: 'cone', spread: 0.7, speed: [0.0015, 0.005], z: [8, 16], vz: [0.01, 0.04], life: [180, 360], size: [1.2, 2.6], palette: 'steel' }],
    shapes: [{ kind: 'spike', len: 17, w: 2.2, life: 95, palette: 'steel' }, { kind: 'spike', len: 11, w: 1.6, life: 80, delay: 25, palette: 'steel' }],
    shake: 0.08,
  };
  R.impact_sword = {
    particles: [{ count: 8, shape: 'cone', spread: 0.7, speed: [0.0015, 0.0035], z: [8, 16], vz: [0.01, 0.04], life: [220, 420], size: [1.4, 2.8], palette: 'blood' }],
    shapes: [{ kind: 'arc', half: 1.05, radius: 0.55, width: 4.5, life: 150, palette: 'steel' }],
    shake: 0.12,
  };
  R.impact_staff = {
    particles: [{ count: 6, shape: 'cone', speed: [0.0015, 0.0035], life: [220, 420], size: [1.4, 2.8], palette: 'dust' }],
    shapes: [{ kind: 'arc', half: 2.5, radius: 0.62, width: 3, life: 210, palette: 'steel' }],
    shake: 0.1,
  };
  R.impact_club = {
    particles: [{ count: 7, shape: 'cone', speed: [0.0015, 0.0035], life: [220, 420], size: [1.4, 2.8], palette: 'dust' }],
    shapes: [{ kind: 'spike', vert: true, len: 24, w: 5, life: 120, palette: 'steel' }, { kind: 'ring', from: 0.2, to: 0.6, life: 210, palette: 'dust' }],
    shake: 0.12,
  };
  R.impact_mace = {
    particles: [{ count: 12, shape: 'ring', speed: [0.002, 0.005], z: [8, 16], vz: [0.02, 0.05], life: [220, 460], size: [1.4, 3], palette: 'steel' }],
    shapes: [{ kind: 'star', rays: 5, radius: 0.9, life: 200, palette: 'steel' }, { kind: 'ring', from: 0.2, to: 0.95, life: 220, palette: 'dust' },
      { kind: 'ring', from: 0.2, to: 0.6, life: 260, delay: 70, palette: 'dust' }, { kind: 'flash', radius: 0.9, life: 140, palette: 'steel' }],
    light: { radius: 2, color: Palette.SCHOOL.steel.mid, intensity: 0.6, life: 160 },
    shake: 0.18,
  };
  R.impact_arrow = {
    particles: [{ count: 5, shape: 'cone', spread: 0.5, speed: [0.001, 0.003], life: [150, 300], size: [1, 2], palette: 'steel' }],
    shapes: [{ kind: 'spike', len: 10, w: 1.6, life: 80, palette: 'steel' }],
    shake: 0.05,
  };
  R.impact_bolt = {
    particles: [{ count: 6, shape: 'cone', spread: 0.5, speed: [0.0015, 0.0035], life: [150, 320], size: [1.2, 2.2], palette: 'steel' }],
    shapes: [{ kind: 'spike', len: 14, w: 2.2, life: 90, palette: 'steel' }],
    shake: 0.08,
  };
  // spells and anything without a weapon: the element picks the shape (wire.js: impact_<school>)
  R.impact_magic = {
    particles: [{ count: 7, shape: 'ring', speed: [0.001, 0.003], life: [200, 380], size: [1.2, 2.4], palette: 'auto' }],
    shapes: [{ kind: 'flash', radius: 0.7, life: 140, palette: 'auto' }],
    light: { radius: 1.6, intensity: 0.5, life: 140 },
  };
  R.impact_fire = {
    particles: [{ count: 7, shape: 'ring', speed: [0.0004, 0.0014], vz: [0.03, 0.06], g: -0.00005, life: [320, 560], size: [1.2, 2.4], palette: 'fire' }],
    shapes: [{ kind: 'flash', radius: 0.7, life: 140, palette: 'fire' }, { kind: 'tongues', n: 4, radius: 0.35, height: 16, life: 420, palette: 'fire' }],
    light: { radius: 1.8, intensity: 0.6, life: 200 },
  };
  R.impact_cold = {
    particles: [{ count: 6, shape: 'ring', speed: [0.0015, 0.003], vz: [0.02, 0.04], g: 0.0003, life: [300, 520], size: [1.2, 2.2], palette: 'cold' }],
    shapes: [{ kind: 'crystal', radius: 0.55, life: 420, palette: 'cold' }, { kind: 'flash', radius: 0.5, life: 120, palette: 'cold' }],
    light: { radius: 1.6, intensity: 0.5, life: 200 },
  };
  R.impact_storm = {
    particles: [{ count: 5, shape: 'ring', speed: [0.003, 0.006], life: [80, 180], size: [1, 2], palette: 'storm' }],
    shapes: [{ kind: 'fork', forks: 3, radius: 0.8, life: 130, palette: 'storm' }, { kind: 'flash', radius: 0.6, life: 100, palette: 'storm' }],
    light: { radius: 2, intensity: 0.8, life: 110 },
  };
  R.impact_poison = {
    particles: [{ count: 5, shape: 'ring', speed: [0.0003, 0.0008], vz: [0.005, 0.015], g: 0.0002, life: [500, 800], size: [1.4, 2.4], palette: 'poison' }],
    shapes: [{ kind: 'puff', n: 5, radius: 0.4, size: 8, alpha: 0.8, life: 650, palette: 'poison' }],
  };
  R.impact_shadow = {
    particles: [{ count: 6, shape: 'ring', speed: [0.0005, 0.0015], vz: [0.01, 0.03], g: -0.00002, life: [400, 700], size: [3, 5], soft: true, palette: 'shadow' }],
    shapes: [{ kind: 'flash', radius: 0.6, life: 160, palette: 'shadow', blend: 'lighter' }],
  };
  /** a critical hit: a white 4-ray star over the weapon impact */
  R.crit_accent = { shapes: [{ kind: 'star', rays: 4, rot: 0, radius: 0.55, w: 1.4, life: 140, palette: 'steel', z: 16 }] };
  /** a heavy single shot landing (Aimed Shot): a bright flash, a four-ray star, a spray along the shot */
  R.heavy_shot = {
    particles: [{ count: 14, shape: 'cone', spread: 0.5, speed: [0.002, 0.006], z: [10, 18], life: [180, 380], size: [1.5, 3], palette: 'auto' }],
    shapes: [
      { kind: 'flash', radius: 1, life: 170, palette: 'auto', z: 14 },
      { kind: 'star', rays: 4, rot: 0, radius: 0.9, w: 2, life: 200, palette: 'auto', z: 14 },
      { kind: 'spike', len: 24, w: 3, life: 120, palette: 'auto' },
    ],
    light: { radius: 2.5, intensity: 0.9, life: 200 },
    shake: 0.22,
  };
  R.monster_hit = {
    particles: [{ count: 6, shape: 'cone', speed: [0.0012, 0.003], life: [200, 380], size: [1.4, 2.6], palette: 'blood' }],
    shapes: [{ kind: 'arc', half: 0.8, radius: 0.45, width: 3, life: 120, palette: 'blood' }],
    shake: 0.15,
  };
  R.block = {
    particles: [{ count: 8, shape: 'cone', spread: 1.2, speed: [0.002, 0.004], life: [120, 260], size: [1, 2], palette: 'steel' }],
    shapes: [{ kind: 'star', rays: 4, radius: 0.5, life: 120, palette: 'steel' }],
    shake: 0.05,
  };
  R.whiff = { shapes: [{ kind: 'arc', half: 0.9, radius: 0.5, width: 2, life: 120, palette: 'dust' }] };

  // ---- element flair on hits (enchanted weapons) ----
  R.flair_fire = {
    particles: [{ count: 5, shape: 'ring', speed: [0.0005, 0.0015], vz: [0.03, 0.06], g: -0.00005, life: [300, 520], size: [1.2, 2.4], palette: 'fire' }],
    shapes: [{ kind: 'tongues', n: 3, radius: 0.3, height: 12, w: 3, life: 360, palette: 'fire' }],
  };
  R.flair_cold = {
    particles: [{ count: 5, shape: 'ring', speed: [0.001, 0.0025], g: 0.0003, life: [260, 440], size: [1.2, 2.2], palette: 'cold' }],
    shapes: [{ kind: 'crystal', radius: 0.4, life: 360, palette: 'cold', z: 14 }],
  };
  R.flair_light = {
    particles: [{ count: 6, shape: 'ring', speed: [0.003, 0.006], life: [80, 200], size: [1, 2], palette: 'storm' }],
    shapes: [{ kind: 'fork', forks: 2, radius: 0.7, life: 130, palette: 'storm', z: 16 }],
    light: { radius: 1.4, color: Palette.SCHOOL.storm.mid, intensity: 0.5, life: 100 },
  };
  R.flair_pois = {
    particles: [{ count: 4, shape: 'ring', speed: [0.0004, 0.001], vz: [0.005, 0.01], g: 0.0002, life: [400, 700], size: [1.5, 2.5], palette: 'poison' }],
    shapes: [{ kind: 'puff', n: 3, radius: 0.3, size: 5, life: 520, palette: 'poison' }],
  };

  // ---- status apply (one per status, 07 §4.3) ----
  R.status_burning = {
    particles: [{ count: 8, shape: 'ring', radius: 0.3, speed: [0.0003, 0.001], vz: [0.04, 0.07], g: -0.00006, life: [400, 650], size: [1.2, 2.2], palette: 'fire' }],
    shapes: [{ kind: 'tongues', n: 3, radius: 0.3, height: 20, life: 380, palette: 'fire' }],
  };
  R.status_chilled = {
    particles: [{ count: 8, shape: 'ring', radius: 0.4, speed: [0.0005, 0.0012], z: [10, 24], vz: [0, 0.01], g: 0.00015, life: [500, 800], size: [1, 2], palette: 'cold' }],
  };
  R.status_frozen = {
    shapes: [{ kind: 'crystal', radius: 0.8, life: 600, palette: 'cold', z: 14 }, { kind: 'ring', from: 0.6, to: 0.3, life: 300, palette: 'cold' }],
    particles: [{ count: 8, shape: 'ring', speed: [0.0015, 0.003], life: [300, 500], size: [1.2, 2.4], palette: 'cold' }],
  };
  R.status_shocked = { shapes: [{ kind: 'fork', forks: 3, radius: 0.6, life: 160, palette: 'storm', z: 18 }] };
  R.status_poisoned = { shapes: [{ kind: 'puff', n: 4, radius: 0.35, size: 6, life: 700, palette: 'poison', z: 14 }] };
  R.status_bleeding = {
    particles: [{ count: 8, shape: 'ring', speed: [0.0008, 0.002], z: [12, 20], vz: [0.01, 0.03], g: 0.0004, life: [350, 600], size: [1.4, 2.4], palette: 'blood' }],
  };
  R.status_stunned = { shapes: [{ kind: 'star', rays: 5, rot: 0, radius: 0.45, life: 220, palette: 'bone', z: 30 }] };

  // ---- deaths, levels, world ----
  // a kill: a burst at the body plus a spray thrown along the killing blow (wire.js passes its direction)
  R.death = {
    particles: [
      { count: 12, shape: 'ring', speed: [0.0008, 0.0025], z: [4, 18], vz: [0.02, 0.05], g: -0.00002, life: [350, 650], size: [1.4, 3], palette: 'auto' },
      { count: 9, shape: 'cone', spread: 0.45, speed: [0.003, 0.006], z: [8, 16], vz: [0.02, 0.05], g: 0.0003, life: [220, 420], size: [1.6, 3], palette: 'auto' },
    ],
    shapes: [{ kind: 'flash', radius: 1.1, life: 160, palette: 'bone' }, { kind: 'ring', from: 0.2, to: 1.0, life: 220, palette: 'bone' }],
  };
  R.death_elite = {
    particles: [{ count: 26, shape: 'ring', speed: [0.0015, 0.004], z: [4, 24], vz: [0.03, 0.07], g: -0.00002, life: [450, 850], size: [1.6, 3.4], palette: 'auto' }],
    shapes: [{ kind: 'flash', radius: 1.5, life: 220, palette: 'bone' }, { kind: 'ring', from: 0.2, to: 2.0, life: 420, palette: 'bone' },
      { kind: 'column', height: 90, width: 12, life: 420, palette: 'auto', blend: 'lighter' }],
    light: { radius: 3, color: Palette.SCHOOL.bone.mid, intensity: 0.8, life: 400 }, shake: 0.3,
  };
  R.levelup = {
    particles: [{ count: 40, shape: 'ring', radius: 0.6, speed: [0.0003, 0.001], z: [0, 6], vz: [0.04, 0.09], g: -0.00002, life: [700, 1200], size: [1.5, 3], palette: 'holy' }],
    shapes: [{ kind: 'column', height: 140, width: 18, life: 900, palette: 'holy' }, { kind: 'ring', from: 0.2, to: 2.4, life: 600, palette: 'holy' }],
    light: { radius: 4, color: Palette.SCHOOL.holy.mid, intensity: 1, life: 900 },
  };
  R.evade = {
    shapes: [{ kind: 'dash', life: 200, palette: 'dust' }],
    particles: [{ count: 6, shape: 'ring', speed: [0.0005, 0.0015], life: [200, 380], size: [1.5, 3], palette: 'dust', z: [0, 4] }],
  };
  R.alert = {};
  R.heal = {
    particles: [{ count: 12, shape: 'ring', radius: 0.5, speed: [0.0002, 0.0006], z: [0, 10], vz: [0.03, 0.06], g: -0.00003, life: [550, 900], size: [1.5, 2.5], palette: 'life' }],
    shapes: [{ kind: 'ring', from: 0.7, to: 0.3, life: 360, palette: 'life' }, { kind: 'flash', radius: 0.6, life: 260, palette: 'life', z: 18 }],
    light: { radius: 2, color: Palette.MEANING.good, intensity: 0.5, life: 400 },
  };
  R.portal = {
    particles: [{ count: 30, shape: 'ring', radius: 0.8, speed: [0.0004, 0.0012], vz: [0.03, 0.07], g: -0.00002, life: [600, 1100], size: [1.5, 3], palette: 'portal' }],
    shapes: [
      { kind: 'ring', from: 0.2, to: 1.2, life: 400, palette: 'portal' },
      { kind: 'ring', from: 0.2, to: 1.6, life: 500, delay: 120, palette: 'portal' },
      { kind: 'ring', from: 0.2, to: 2.0, life: 600, delay: 240, palette: 'portal' },
    ],
    light: { radius: 3, color: Palette.MEANING.souls, intensity: 1, life: 800 },
  };
  R.seal_break = {
    particles: [{ count: 40, shape: 'ring', speed: [0.002, 0.006], z: [4, 30], vz: [0.03, 0.08], life: [500, 900], size: [1.5, 3.5], palette: 'seal' }],
    shapes: [{ kind: 'column', height: 220, width: 14, life: 1100, palette: 'seal' }, { kind: 'ring', from: 0.3, to: 3, life: 600, palette: 'seal' }],
    light: { radius: 5, color: Palette.SCHOOL.seal.mid, intensity: 1, life: 1000 }, shake: 0.3,
  };
  R.zone_hit = {
    particles: [{ count: 8, shape: 'ring', radius: 0.5, speed: [0.001, 0.003], z: [2, 12], vz: [0.03, 0.06], life: [260, 520], size: [1.5, 3.2], palette: 'auto' }],
    shapes: [{ kind: 'flash', radius: 0.8, life: 160, palette: 'auto' }, { kind: 'ring', from: 0.3, to: 1.0, life: 220, palette: 'auto' }],
  };
  R.zone_heavy = {
    particles: [{ count: 18, shape: 'ring', radius: 0.8, speed: [0.002, 0.005], z: [2, 16], vz: [0.04, 0.09], life: [300, 650], size: [2, 4], palette: 'auto' }],
    shapes: [{ kind: 'ring', from: 0.2, to: 1.8, life: 320, palette: 'auto' }, { kind: 'flash', radius: 1.4, life: 200, palette: 'auto' }],
    shake: 0.45,
  };
  R.blink = {
    particles: [{ count: 16, shape: 'ring', radius: 0.4, speed: [0.0006, 0.002], vz: [0.02, 0.05], life: [250, 500], size: [1.5, 3], palette: 'auto' }],
    shapes: [{ kind: 'flash', radius: 0.8, life: 160, palette: 'auto' }],
  };
  R.exposed = {
    shapes: [{ kind: 'ring', from: 0.3, to: 1.1, life: 300, palette: 'gold' }],
    particles: [{ count: 10, shape: 'ring', speed: [0.001, 0.002], life: [300, 500], size: [1.5, 2.5], palette: 'gold' }],
  };
  R.loot_fountain = {
    particles: [{ count: 48, shape: 'ring', speed: [0.0005, 0.0018], z: [6, 12], vz: [0.10, 0.24], g: 0.0005, life: [700, 1200], size: [2, 3], palette: 'gold' }],
  };
  /** a legendary lands: an orange column that matches its ground shaft, and rings */
  R.legendary_drop = {
    particles: [{ count: 24, shape: 'ring', radius: 0.4, speed: [0.0003, 0.001], z: [0, 6], vz: [0.05, 0.1], g: -0.00002, life: [600, 1000], size: [1.5, 3], palette: 'auto' }],
    shapes: [{ kind: 'column', height: 200, width: 14, life: 800, palette: 'auto' }, { kind: 'ring', from: 0.2, to: 1.6, life: 500, palette: 'auto' },
      { kind: 'ring', from: 0.2, to: 1.1, life: 500, delay: 150, palette: 'auto' }],
    light: { radius: 3.5, intensity: 1, life: 800 },
  };
  R.rare_drop = {
    particles: [{ count: 10, shape: 'ring', radius: 0.3, speed: [0.0004, 0.0012], vz: [0.03, 0.06], g: -0.00002, life: [400, 700], size: [1.4, 2.4], palette: 'auto' }],
    shapes: [{ kind: 'ring', from: 0.2, to: 0.9, life: 320, palette: 'auto' }],
  };
  R.explored = { particles: [{ count: 60, shape: 'ring', radius: 1.5, speed: [0.001, 0.004], z: [20, 60], vz: [0.02, 0.08], life: [600, 1200], size: [1.5, 3], palette: 'holy' }] };
})(globalThis.BD);
