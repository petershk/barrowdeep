// @ts-check
// FX recipes as data (07 §4.2). palette: a school name, or 'auto' = the caller's school.
// Weapon impacts are the signature feature: you should tell the weapon with your eyes closed.
(function (BD) {
  'use strict';

  const R = {};
  BD.view.fxRecipes = R;

  // ---- weapon impacts (numbers from the original fxImpact) ----
  R.impact_dagger = {
    particles: [{ count: 4, shape: 'cone', spread: 0.7, speed: [0.0015, 0.005], z: [8, 16], vz: [0.01, 0.04], life: [180, 360], size: [1.2, 2.6], palette: 'steel' }],
    shapes: [{ kind: 'spike', len: 17, w: 2.4, life: 95, palette: 'storm' }, { kind: 'spike', len: 11, w: 1.8, life: 80, delay: 25, palette: 'steel' }],
    shake: 0.08,
  };
  R.impact_sword = {
    particles: [{ count: 8, shape: 'cone', spread: 0.7, speed: [0.0015, 0.0035], z: [8, 16], vz: [0.01, 0.04], life: [180, 360], size: [1.2, 2.6], palette: 'blood' }],
    shapes: [{ kind: 'arc', half: 1.05, radius: 0.55, width: 4.5, life: 150, palette: 'blood' }],
    shake: 0.12,
  };
  R.impact_staff = {
    particles: [{ count: 6, shape: 'cone', speed: [0.0015, 0.0035], life: [180, 360], size: [1.2, 2.6], palette: 'dust' }],
    shapes: [{ kind: 'arc', half: 2.5, radius: 0.62, width: 3, life: 210, palette: 'dust' }],
    shake: 0.1,
  };
  R.impact_club = {
    particles: [{ count: 7, shape: 'cone', speed: [0.0015, 0.0035], life: [180, 360], size: [1.2, 2.6], palette: 'dust' }],
    shapes: [{ kind: 'spike', vert: true, len: 24, w: 6, life: 120, palette: 'dust' }, { kind: 'ring', from: 0.2, to: 0.6, life: 210, palette: 'dust' }],
    shake: 0.12,
  };
  R.impact_mace = {
    particles: [{ count: 12, shape: 'ring', speed: [0.002, 0.005], z: [8, 16], vz: [0.02, 0.05], life: [220, 460], size: [1.6, 3.4], palette: 'gold' }],
    shapes: [{ kind: 'star', rays: 5, radius: 0.9, life: 230, palette: 'gold' }, { kind: 'ring', from: 0.2, to: 0.95, life: 220, palette: 'gold' },
      { kind: 'ring', from: 0.2, to: 0.55, life: 240, delay: 70, palette: 'gold' }, { kind: 'flash', radius: 1.0, life: 200, palette: 'gold' }],
    light: { radius: 2, color: '#ffd27a', intensity: 0.7, life: 160 },
    shake: 0.18,
  };
  R.impact_arrow = {
    particles: [{ count: 5, shape: 'cone', spread: 0.5, speed: [0.001, 0.003], life: [150, 300], size: [1, 2], palette: 'steel' }],
    shapes: [{ kind: 'spike', len: 10, w: 1.6, life: 80, palette: 'steel' }],
    shake: 0.05,
  };
  R.impact_bolt = {
    particles: [{ count: 6, shape: 'cone', spread: 0.5, speed: [0.0015, 0.0035], life: [150, 320], size: [1.2, 2.2], palette: 'steel' }],
    shapes: [{ kind: 'spike', len: 14, w: 2.4, life: 90, palette: 'steel' }],
    shake: 0.08,
  };
  R.impact_magic = {
    particles: [{ count: 8, shape: 'ring', speed: [0.001, 0.003], life: [200, 380], size: [1.2, 2.4], palette: 'auto' }],
    shapes: [{ kind: 'flash', radius: 0.7, life: 140, palette: 'auto' }],
    light: { radius: 1.6, color: '#b88aff', intensity: 0.5, life: 140 },
  };
  R.monster_hit = {
    particles: [{ count: 6, shape: 'cone', speed: [0.0012, 0.003], life: [160, 320], size: [1.2, 2.4], palette: 'blood' }],
    shapes: [{ kind: 'arc', half: 0.8, radius: 0.45, width: 3, life: 120, palette: 'blood' }],
    shake: 0.15,
  };
  R.block = {
    particles: [{ count: 8, shape: 'cone', spread: 1.2, speed: [0.002, 0.004], life: [120, 260], size: [1, 2], palette: 'gold' }],
    shapes: [{ kind: 'star', rays: 4, radius: 0.5, life: 120, palette: 'steel' }],
    shake: 0.05,
  };
  R.whiff = { shapes: [{ kind: 'arc', half: 0.9, radius: 0.5, width: 2, life: 120, palette: 'dust' }] };

  // ---- element flair on hits ----
  R.flair_fire = { particles: [{ count: 5, shape: 'ring', speed: [0.0005, 0.0015], vz: [0.03, 0.06], g: -0.00005, life: [300, 520], size: [1.2, 2.4], palette: 'fire' }] };
  R.flair_cold = { particles: [{ count: 5, shape: 'ring', speed: [0.001, 0.0025], life: [220, 400], size: [1.2, 2.2], palette: 'cold' }] };
  R.flair_light = { particles: [{ count: 5, shape: 'ring', speed: [0.002, 0.004], life: [100, 220], size: [1, 2], palette: 'storm' }] };
  R.flair_pois = { particles: [{ count: 4, shape: 'ring', speed: [0.0004, 0.001], vz: [0.01, 0.02], g: -0.00003, life: [400, 700], size: [1.5, 3], palette: 'poison' }] };

  // ---- deaths, levels, world ----
  R.death = {
    particles: [{ count: 14, shape: 'ring', speed: [0.001, 0.003], z: [4, 18], vz: [0.01, 0.04], life: [300, 600], size: [1.4, 3], palette: 'auto' }],
    shapes: [{ kind: 'flash', radius: 1.0, life: 160, palette: 'bone' }],
  };
  R.death_elite = {
    particles: [{ count: 30, shape: 'ring', speed: [0.002, 0.005], z: [4, 24], vz: [0.02, 0.06], life: [400, 800], size: [1.6, 3.6], palette: 'gold' }],
    shapes: [{ kind: 'flash', radius: 1.6, life: 220, palette: 'gold' }, { kind: 'ring', from: 0.2, to: 2.0, life: 400, palette: 'gold' }],
    light: { radius: 3, color: '#ffd23a', intensity: 0.9, life: 400 }, shake: 0.35,
  };
  R.levelup = {
    particles: [{ count: 40, shape: 'ring', radius: 0.6, speed: [0.0003, 0.001], z: [0, 6], vz: [0.04, 0.09], g: -0.00002, life: [700, 1200], size: [1.5, 3], palette: 'holy' }],
    shapes: [{ kind: 'column', height: 140, width: 18, life: 900, palette: 'holy' }, { kind: 'ring', from: 0.2, to: 2.4, life: 600, palette: 'holy' }],
    light: { radius: 4, color: '#ffe38a', intensity: 1, life: 900 },
  };
  R.evade = {
    shapes: [{ kind: 'dash', life: 200, palette: 'dust' }],
    particles: [{ count: 6, shape: 'ring', speed: [0.0005, 0.0015], life: [200, 380], size: [1.5, 3], palette: 'dust', z: [0, 4] }],
  };
  R.alert = {};
  R.heal = {
    particles: [{ count: 10, shape: 'ring', radius: 0.5, speed: [0.0002, 0.0006], vz: [0.03, 0.06], g: -0.00003, life: [500, 800], size: [1.5, 2.5], palette: 'poison' }],
  };
  R.portal = {
    particles: [{ count: 30, shape: 'ring', radius: 0.8, speed: [0.0004, 0.0012], vz: [0.03, 0.07], g: -0.00002, life: [600, 1100], size: [1.5, 3], palette: 'portal' }],
    shapes: [
      { kind: 'ring', from: 0.2, to: 1.2, life: 400, palette: 'portal' },
      { kind: 'ring', from: 0.2, to: 1.6, life: 500, delay: 120, palette: 'portal' },
      { kind: 'ring', from: 0.2, to: 2.0, life: 600, delay: 240, palette: 'portal' },
    ],
    light: { radius: 3, color: '#b06aff', intensity: 1, life: 800 },
  };
  R.seal_break = {
    particles: [{ count: 40, shape: 'ring', speed: [0.002, 0.006], z: [4, 30], vz: [0.03, 0.08], life: [500, 900], size: [1.5, 3.5], palette: 'seal' }],
    shapes: [{ kind: 'column', height: 220, width: 14, life: 1100, palette: 'seal' }, { kind: 'ring', from: 0.3, to: 3, life: 600, palette: 'seal' }],
    light: { radius: 5, color: '#ff4030', intensity: 1, life: 1000 }, shake: 0.3,
  };
  R.zone_hit = {
    particles: [{ count: 10, shape: 'ring', radius: 0.5, speed: [0.001, 0.004], z: [2, 12], vz: [0.03, 0.07], life: [260, 520], size: [1.5, 3.4], palette: 'auto' }],
    shapes: [{ kind: 'flash', radius: 0.8, life: 160, palette: 'auto' }],
  };
  R.zone_heavy = {
    particles: [{ count: 22, shape: 'ring', radius: 0.8, speed: [0.002, 0.005], z: [2, 16], vz: [0.04, 0.09], life: [300, 650], size: [2, 4], palette: 'auto' }],
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
  R.explored = { particles: [{ count: 60, shape: 'ring', radius: 1.5, speed: [0.001, 0.004], z: [20, 60], vz: [0.02, 0.08], life: [600, 1200], size: [1.5, 3], palette: 'holy' }] };
})(globalThis.BD);
