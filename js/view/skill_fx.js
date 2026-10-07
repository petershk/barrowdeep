// @ts-check
// Skill, boss-move and world visuals keyed by ability ids and event kinds (07 §4.3: one recipe per
// cue). Lobbed things fly a visible arc; beams and wave rings are drawn as shapes.
(function (BD) {
  'use strict';

  const FX = () => BD.view.fx;
  const R = BD.view.fxRecipes;
  const P = BD.view.palette;

  // ---- extra recipes ----
  R.shout = {
    shapes: [
      { kind: 'ring', from: 0.4, to: 4.2, life: 420, palette: 'blood' },
      { kind: 'ring', from: 0.4, to: 3.2, life: 360, delay: 80, palette: 'gold' },
    ],
    shake: 0.25,
  };
  R.quake = {
    particles: [{
      count: 30, shape: 'ring', radius: 1.5, speed: [0.001, 0.003], z: [0, 6],
      vz: [0.03, 0.07], life: [400, 700], size: [2, 4], palette: 'dust',
    }],
    shapes: [
      { kind: 'ring', from: 0.3, to: 2.6, life: 380, palette: 'dust' },
      { kind: 'ring', from: 0.3, to: 3.4, life: 460, delay: 90, palette: 'gold' },
      { kind: 'flash', radius: 1.6, life: 180, palette: 'gold' },
    ],
    light: { radius: 3, color: '#ffd27a', intensity: 0.8, life: 220 }, shake: 0.5,
  };
  R.spin = {
    shapes: [{ kind: 'spin', radius: 1.1, life: 380, palette: 'steel' }],
    particles: [{ count: 8, shape: 'ring', radius: 1, speed: [0.002, 0.004], life: [150, 300], size: [1, 2], palette: 'steel' }],
  };
  R.berserk = {
    particles: [{ count: 18, shape: 'cone', spread: 0.9, speed: [0.002, 0.005], life: [250, 500], size: [1.5, 3.5], palette: 'blood' }],
    shapes: [
      { kind: 'arc', half: 1.2, radius: 0.8, width: 6, life: 220, palette: 'blood' },
      { kind: 'flash', radius: 1.0, life: 160, palette: 'blood' },
    ],
    shake: 0.3,
  };
  R.brace = {
    shapes: [
      { kind: 'ring', from: 0.9, to: 0.6, life: 300, palette: 'steel' },
      { kind: 'flash', radius: 0.8, life: 200, palette: 'steel' },
    ],
  };
  R.ki = {
    particles: [{ count: 10, shape: 'cone', spread: 0.5, speed: [0.002, 0.005], life: [160, 320], size: [1.2, 2.6], palette: 'ki' }],
    shapes: [{ kind: 'spike', len: 20, w: 3, life: 110, palette: 'ki' }, { kind: 'star', rays: 6, radius: 0.6, life: 160, palette: 'ki' }],
    shake: 0.12,
  };
  R.nova_fire = {
    particles: [{
      count: 30, shape: 'ring', radius: 0.4, speed: [0.003, 0.006], z: [4, 14],
      vz: [0.02, 0.05], life: [300, 600], size: [2, 4], palette: 'fire',
    }],
    shapes: [{ kind: 'ring', from: 0.3, to: 2.2, life: 320, palette: 'fire' }, { kind: 'flash', radius: 1.8, life: 200, palette: 'fire' }],
    light: { radius: 3.5, color: '#ff8a2a', intensity: 1, life: 300 },
    shake: 0.3,
  };
  R.nova_cold = {
    particles: [{
      count: 30, shape: 'ring', radius: 0.4, speed: [0.003, 0.006], z: [2, 10],
      vz: [0.01, 0.03], life: [350, 650], size: [2, 3.5], palette: 'cold',
    }],
    shapes: [
      { kind: 'ring', from: 0.3, to: 2.6, life: 360, palette: 'cold' },
      { kind: 'star', rays: 8, radius: 1.6, life: 260, palette: 'cold' },
    ],
    light: { radius: 3.5, color: '#9ee4ff', intensity: 0.9, life: 320 },
    shake: 0.2,
  };
  R.nova_light = {
    particles: [{ count: 24, shape: 'ring', radius: 0.4, speed: [0.004, 0.008], life: [150, 320], size: [1.5, 3], palette: 'storm' }],
    shapes: [
      { kind: 'ring', from: 0.3, to: 2.2, life: 260, palette: 'storm' },
      { kind: 'flash', radius: 1.6, life: 140, palette: 'storm' },
    ],
    light: { radius: 3, color: '#9fc3ff', intensity: 1, life: 220 },
  };
  R.explosion = {
    particles: [{
      count: 26, shape: 'ring', radius: 0.5, speed: [0.002, 0.006], z: [4, 16],
      vz: [0.03, 0.07], life: [300, 650], size: [2, 4], palette: 'auto',
    }],
    shapes: [{ kind: 'flash', radius: 1.4, life: 200, palette: 'auto' }, { kind: 'ring', from: 0.3, to: 1.6, life: 300, palette: 'auto' }],
    light: { radius: 3, color: '#ff8a2a', intensity: 0.9, life: 260 },
    shake: 0.25,
  };
  R.meteor_hit = {
    particles: [{
      count: 50, shape: 'ring', radius: 1, speed: [0.003, 0.008], z: [4, 30],
      vz: [0.04, 0.09], life: [400, 900], size: [2, 5], palette: 'fire',
    }],
    shapes: [
      { kind: 'flash', radius: 2.6, life: 260, palette: 'fire' },
      { kind: 'ring', from: 0.5, to: 3, life: 420, palette: 'fire' },
      { kind: 'column', height: 200, width: 22, life: 260, palette: 'fire' },
    ],
    light: { radius: 5, color: '#ff7a2a', intensity: 1.2, life: 400 },
    shake: 0.6,
  };
  R.smoke = {
    particles: [{
      count: 40, shape: 'ring', radius: 2, speed: [0.0002, 0.0008], z: [0, 20],
      vz: [0.005, 0.015], g: -0.00001, life: [900, 1600], size: [4, 8], palette: 'shadow',
    }],
  };
  R.holy_column = {
    shapes: [
      { kind: 'column', height: 180, width: 16, life: 600, palette: 'holy' },
      { kind: 'ring', from: 0.3, to: 1.8, life: 400, palette: 'holy' },
    ],
    light: { radius: 3, color: '#ffe38a', intensity: 1, life: 600 },
  };
  R.sky_spear = {
    shapes: [
      { kind: 'column', height: 260, width: 12, life: 260, palette: 'storm' },
      { kind: 'ring', from: 0.3, to: 2.2, life: 300, palette: 'storm' },
      { kind: 'flash', radius: 1.8, life: 180, palette: 'storm' },
    ],
    light: { radius: 4, color: '#bfe0ff', intensity: 1.2, life: 260 },
    shake: 0.4,
  };
  R.arrow_rain = {
    particles: [{
      count: 14, shape: 'ring', radius: 2, speed: [0, 0.0005], z: [60, 90],
      vz: [-0.2, -0.15], g: 0.0008, life: [300, 450], size: [1, 2], palette: 'steel',
    }],
  };
  R.cast_glow = {
    particles: [{
      count: 8, shape: 'ring', radius: 0.4, speed: [0.0003, 0.001], z: [14, 24],
      vz: [0.01, 0.03], life: [250, 400], size: [1.5, 2.5], palette: 'auto',
    }],
  };
  R.corpse_burst = {
    particles: [{
      count: 30, shape: 'ring', radius: 0.4, speed: [0.003, 0.007], z: [2, 16],
      vz: [0.03, 0.08], life: [300, 650], size: [2, 4], palette: 'blood',
    }],
    shapes: [{ kind: 'flash', radius: 1.8, life: 200, palette: 'fire' }],
    shake: 0.3,
  };
  R.hatch = {
    particles: [{ count: 16, shape: 'ring', radius: 0.4, speed: [0.001, 0.003], life: [250, 500], size: [1.5, 3], palette: 'poison' }],
  };

  const ON_CAST = {
    aimed_shot: 'cast_glow', meteor: 'cast_glow', sky_spear: 'cast_glow',
    fireball: 'cast_glow', chain_lightning: 'cast_glow', earthshaker: 'cast_glow',
  };
  const SCHOOL_OF = (id) => (BD.data.skills[id] && BD.data.skills[id].school) || 'general';
  const ON_IMPACT = {
    bash: 'impact_mace', whirlwind: 'spin', berserk_strike: 'berserk', war_cry: 'shout', earthshaker: 'quake',
    brace: 'brace', second_wind: 'heal', tiger_strike: 'ki', dragon_talon: 'ki', smoke_bomb: 'smoke',
    frost_nova: 'nova_cold', valkyries_call: 'holy_column', shadow_master: 'blink',
  };
  // Abilities whose impact recipe plays on the caster rather than at the target point.
  const SELF_CENTRED = [
    'war_cry', 'earthshaker', 'brace', 'second_wind', 'smoke_bomb',
    'frost_nova', 'valkyries_call', 'shadow_master', 'whirlwind',
  ];

  function cast(world, ev) {
    const r = ON_CAST[ev.abilityId];
    if (r) FX().play(r, ev.x, ev.y, { school: SCHOOL_OF(ev.abilityId) });
  }
  function impact(world, ev) {
    const r = ON_IMPACT[ev.abilityId];
    if (!r) return;
    const self = SELF_CENTRED.indexOf(ev.abilityId) >= 0;
    FX().play(r, self ? ev.x : ev.tx, self ? ev.y : ev.ty, {
      dir: { x: ev.tx - ev.x, y: ev.ty - ev.y },
      school: SCHOOL_OF(ev.abilityId),
      scale: ev.area && ev.area.radius ? ev.area.radius / 2 + 0.5 : 1,
    });
  }
  function explode(world, ev) {
    const el = ev.element || (BD.data.projectiles[ev.kind] || {}).element || 'fire';
    const r = ev.kind === 'nova' ? (el === 'cold' ? 'nova_cold' : el === 'light' ? 'nova_light' : 'nova_fire') : 'explosion';
    FX().play(r, ev.x, ev.y, {
      school: P.ELEMENT_SCHOOL[el] || 'fire',
      scale: ev.area && ev.area.radius ? Math.max(1, ev.area.radius / 1.5) : 1,
    });
  }
  function land(world, ev) { FX().play('quake', ev.x, ev.y, { scale: ev.area && ev.area.radius ? ev.area.radius / 2 : 0.6 }); }

  // ---- world-level visuals ----
  function lobSchool(ev) {
    if (ev.kind === 'venom') return 'poison';
    if (ev.kind === 'bone_hurl') return 'bone';
    if (ev.abilityId === 'fire_blast' || ev.kind === 'mortar' || ev.kind === 'meteor') return 'fire';
    return 'general';
  }
  function wire(bus) {
    bus.on('lob', (ev) => FX().shape({
      kind: 'lob', x: ev.fromX, y: ev.fromY, x1: ev.x, y1: ev.y, life: ev.ms || 600,
      pal: P.SCHOOL[lobSchool(ev)], big: ev.kind === 'meteor',
    }));
    bus.on('beam', (ev) => FX().shape({
      kind: 'beam', x: ev.fromX, y: ev.fromY,
      x1: ev.fromX + Math.cos(ev.a) * ev.len, y1: ev.fromY + Math.sin(ev.a) * ev.len,
      life: 120, pal: P.SCHOOL.seal,
    }));
    bus.on('zone.resolve', (ev) => {
      if (ev.kind === 'meteor' || ev.kind === 'chaos_rain') {
        FX().play('meteor_hit', ev.cx, ev.cy, { scale: ev.kind === 'chaos_rain' ? 0.5 : 0.8 });
      } else if (ev.kind === 'sky_spear') {
        FX().play('sky_spear', ev.cx, ev.cy);
      }
    });
    bus.on('zone.tick', (ev) => {
      if (ev.abilityId === 'rain_of_arrows') {
        FX().play('arrow_rain', ev.cx, ev.cy);
      } else if (ev.abilityId === 'blizzard') {
        FX().play('flair_cold', ev.cx + Math.random() * 2 - 1, ev.cy + Math.random() * 2 - 1, { scale: 2 });
      }
    });
    bus.on('corpse.explode', (ev) => FX().play('corpse_burst', ev.x, ev.y));
    bus.on('egg.hatch', (ev) => FX().play('hatch', ev.x, ev.y));
    bus.on('boss.land', (ev) => { FX().play('quake', ev.x, ev.y, { scale: 1.3 }); BD.view.camera.addTrauma(0.7); });
    bus.on('emerge', (ev) => FX().play('quake', ev.x, ev.y, { scale: 0.8 }));
    bus.on('burrow', (ev) => FX().play('hatch', ev.x, ev.y));
    bus.on('trap.trigger', (ev) => FX().play('whiff', ev.x, ev.y));
    bus.on('chest.open', (ev) => FX().play(ev.cursed ? 'death_elite' : 'blink', ev.x, ev.y, { school: 'gold' }));
    bus.on('shatter', (ev) => FX().play('nova_cold', ev.x, ev.y, { scale: 0.6 }));
    bus.on('deploy', (ev) => FX().play('blink', ev.x, ev.y, { school: 'storm' }));
    bus.on('ally.spawn', (ev) => FX().play('holy_column', ev.x, ev.y));
    bus.on('boss.split', (ev) => FX().play('blink', ev.x, ev.y, { school: 'storm' }));
    bus.on('run.victory', () => {
      const p = BD.view.host.world().player;
      FX().play('levelup', p.x, p.y, { scale: 2 });
    });
  }

  BD.view.skillFx = { cast, impact, explode, land, wire };
})(globalThis.BD);
