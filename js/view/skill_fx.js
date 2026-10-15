// @ts-check
// Skill, boss-move and world visuals keyed by ability ids and event kinds (07 §4.3: one recipe per
// cue). Lobbed things fly a visible arc; beams and wave rings are drawn as shapes. Element motifs
// (ART_DIRECTION.md): fire tongues, cold crystals, lightning forks, poison puffs, steel stars.
(function (BD) {
  'use strict';

  const Fx = () => BD.view.fx;
  const FxRecipes = BD.view.fxRecipes;
  const Palette = BD.view.palette;

  // ---- extra recipes ----
  FxRecipes.shout = {
    shapes: [
      { kind: 'ring', from: 0.4, to: 4.2, life: 420, palette: 'blood', blend: 'lighter' },
      { kind: 'ring', from: 0.4, to: 3.2, life: 360, delay: 80, palette: 'bone' },
    ],
    shake: 0.25,
  };
  // a ground slam: grit thrown low, rocks arcing out and falling back, dust left hanging; earth tones only
  FxRecipes.quake = {
    particles: [{
      count: 26, shape: 'ring', radius: 1.5, speed: [0.001, 0.003], z: [0, 6],
      vz: [0.03, 0.07], life: [400, 700], size: [2, 4], palette: 'dust',
    }, {
      count: 16, shape: 'ring', radius: 0.8, speed: [0.002, 0.005], z: [0, 4],
      vz: [0.07, 0.13], g: 0.0005, life: [550, 850], size: [2.5, 4.5], color: 'edge', palette: 'dust',
    }],
    shapes: [
      { kind: 'disc', radius: 1.3, life: 500, palette: 'dust', alpha: 0.4 },
      { kind: 'ring', from: 0.3, to: 2.6, life: 380, palette: 'dust' },
      { kind: 'ring', from: 0.3, to: 3.4, life: 460, delay: 90, palette: 'dust' },
      { kind: 'puff', n: 10, radius: 1.6, size: 11, life: 900, palette: 'dust', alpha: 0.55, z: 2 },
    ],
    light: { radius: 3, color: Palette.SCHOOL.bone.mid, intensity: 0.6, life: 220 }, shake: 0.5,
  };
  // Whirlwind ticks every 400 ms; each spin outlives its tick so a held channel reads as one unbroken blur
  FxRecipes.spin = {
    shapes: [
      { kind: 'spin', radius: 1.1, life: 520, palette: 'steel' },
      { kind: 'ring', from: 0.5, to: 1.3, life: 400, palette: 'dust' },
    ],
    particles: [
      { count: 10, shape: 'ring', radius: 1, speed: [0.002, 0.004], life: [150, 300], size: [1, 2], palette: 'steel' },
      {
        count: 8, shape: 'ring', radius: 0.8, speed: [0.001, 0.002], z: [0, 3], vz: [0.01, 0.03],
        life: [300, 500], size: [2, 3], palette: 'dust',
      },
    ],
  };
  FxRecipes.berserk = {
    particles: [{ count: 16, shape: 'cone', spread: 0.9, speed: [0.002, 0.005], life: [250, 500], size: [1.5, 3.5], palette: 'blood' }],
    shapes: [
      { kind: 'arc', half: 1.2, radius: 0.8, width: 6, life: 220, palette: 'blood', blend: 'lighter' },
      { kind: 'star', rays: 4, radius: 0.8, life: 160, palette: 'steel' },
    ],
    shake: 0.3,
  };
  FxRecipes.brace = {
    shapes: [
      { kind: 'ring', from: 0.9, to: 0.6, life: 300, palette: 'steel' },
      { kind: 'flash', radius: 0.8, life: 200, palette: 'steel' },
    ],
  };
  FxRecipes.ki = {
    particles: [{
      count: 16, shape: 'cone', spread: 0.6, speed: [0.002, 0.006], z: [10, 18], life: [180, 360], size: [1.5, 3], palette: 'ki',
    }],
    shapes: [
      { kind: 'flash', radius: 0.9, life: 140, palette: 'ki', z: 14 },
      { kind: 'spike', len: 26, w: 4, life: 120, palette: 'ki' },
      { kind: 'star', rays: 6, radius: 0.85, w: 2, life: 200, palette: 'ki', z: 14 },
      { kind: 'ring', from: 0.2, to: 1.0, life: 200, palette: 'ki' },
    ],
    light: { radius: 2, intensity: 0.7, life: 160 },
    shake: 0.16,
  };
  FxRecipes.nova_fire = {
    particles: [{
      count: 22, shape: 'ring', radius: 0.4, speed: [0.002, 0.005], z: [4, 14],
      vz: [0.03, 0.06], g: -0.00004, life: [350, 650], size: [2, 3.5], palette: 'fire',
    }],
    shapes: [
      { kind: 'ring', from: 0.3, to: 2.2, life: 320, palette: 'fire' },
      { kind: 'tongues', n: 9, radius: 1.6, height: 26, w: 5, life: 520, palette: 'fire' },
      { kind: 'flash', radius: 1.6, life: 180, palette: 'fire' },
    ],
    light: { radius: 3.5, color: Palette.SCHOOL.fire.mid, intensity: 1, life: 300 },
    shake: 0.3,
  };
  FxRecipes.nova_cold = {
    particles: [{
      count: 24, shape: 'ring', radius: 0.4, speed: [0.003, 0.006], z: [2, 10],
      vz: [0.01, 0.03], life: [450, 750], size: [1.5, 3], palette: 'cold',
    }],
    shapes: [
      { kind: 'ring', from: 0.3, to: 2.6, life: 360, palette: 'cold' },
      { kind: 'disc', radius: 1.35, life: 1400, palette: 'cold', alpha: 0.28 },   // frost left on the ground
      { kind: 'crystal', rays: 6, radius: 1.8, life: 700, palette: 'cold' },
      { kind: 'flash', radius: 1.2, life: 160, palette: 'cold' },
    ],
    light: { radius: 3.5, color: Palette.SCHOOL.cold.mid, intensity: 0.9, life: 320 },
    shake: 0.2,
  };
  FxRecipes.nova_light = {
    particles: [{ count: 16, shape: 'ring', radius: 0.4, speed: [0.004, 0.008], life: [100, 240], size: [1.5, 3], palette: 'storm' }],
    shapes: [
      { kind: 'fork', forks: 6, radius: 2.2, life: 220, palette: 'storm' },
      { kind: 'ring', from: 0.3, to: 2.2, life: 200, palette: 'storm' },
      { kind: 'flash', radius: 1.4, life: 120, palette: 'storm' },
    ],
    light: { radius: 3, color: Palette.SCHOOL.storm.mid, intensity: 1, life: 200 },
  };
  FxRecipes.explosion = {
    particles: [{
      count: 26, shape: 'ring', radius: 0.5, speed: [0.002, 0.006], z: [4, 16],
      vz: [0.03, 0.07], life: [300, 650], size: [2, 4], palette: 'auto',
    }],
    shapes: [
      { kind: 'disc', radius: 1.2, life: 240, palette: 'auto', alpha: 0.5 },
      { kind: 'flash', radius: 1.8, life: 220, palette: 'auto' },
      { kind: 'ring', from: 0.3, to: 1.8, life: 320, palette: 'auto' },
    ],
    light: { radius: 3.5, intensity: 1.1, life: 300 },
    shake: 0.3,
  };
  FxRecipes.meteor_hit = {
    particles: [{
      count: 40, shape: 'ring', radius: 1, speed: [0.003, 0.008], z: [4, 30],
      vz: [0.04, 0.09], life: [400, 900], size: [2, 5], palette: 'auto',
    }],
    shapes: [
      { kind: 'flash', radius: 2.6, life: 260, palette: 'auto', blend: 'lighter' },
      { kind: 'ring', from: 0.5, to: 3, life: 420, palette: 'auto' },
      { kind: 'column', height: 200, width: 22, life: 260, palette: 'auto', blend: 'lighter' },
      { kind: 'tongues', n: 8, radius: 1.5, height: 30, w: 6, life: 600, palette: 'auto', blend: 'lighter' },
    ],
    light: { radius: 5, intensity: 1.2, life: 400 },
    shake: 0.6,
  };
  // smoke is dark matter: soft source-over puffs in the shadow edge colour, a few lit by the mid
  FxRecipes.smoke = {
    particles: [{
      count: 22, shape: 'ring', radius: 2, speed: [0.0002, 0.0008], z: [0, 14],
      vz: [0.004, 0.012], g: -0.00001, life: [900, 1600], size: [6, 10], soft: true, color: 'edge', palette: 'shadow',
    }, {
      count: 6, shape: 'ring', radius: 1.6, speed: [0.0002, 0.0006], z: [2, 12],
      vz: [0.004, 0.01], g: -0.00001, life: [700, 1200], size: [4, 7], soft: true, color: 'mid', palette: 'shadow',
    }],
  };
  FxRecipes.holy_column = {
    shapes: [
      { kind: 'column', height: 180, width: 16, life: 600, palette: 'holy' },
      { kind: 'ring', from: 0.3, to: 1.8, life: 400, palette: 'holy' },
    ],
    light: { radius: 3, color: Palette.SCHOOL.holy.mid, intensity: 1, life: 600 },
  };
  FxRecipes.sky_spear = {
    shapes: [
      { kind: 'column', height: 260, width: 10, life: 260, palette: 'storm' },
      { kind: 'fork', forks: 4, radius: 1.6, life: 220, palette: 'storm' },
      { kind: 'ring', from: 0.3, to: 2.2, life: 300, palette: 'storm' },
      { kind: 'flash', radius: 1.6, life: 160, palette: 'storm' },
    ],
    light: { radius: 4, color: Palette.SCHOOL.storm.mid, intensity: 1.2, life: 260 },
    shake: 0.4,
  };
  FxRecipes.arrow_rain = {
    particles: [{
      count: 14, shape: 'ring', radius: 2, speed: [0, 0.0005], z: [60, 90],
      vz: [-0.2, -0.15], g: 0.0008, life: [300, 450], size: [1, 2], palette: 'steel',
    }],
  };
  /** the end of a hero's charge-up: the gathered light leaves the hands */
  FxRecipes.cast_release = {
    particles: [{
      count: 9, shape: 'ring', radius: 0.15, speed: [0.003, 0.006], z: [14, 22],
      vz: [0, 0.02], g: 0, life: [140, 260], size: [1.5, 2.5], palette: 'auto',
    }],
    shapes: [
      { kind: 'flash', radius: 0.7, life: 150, palette: 'auto', z: 18 },
      { kind: 'ring', from: 0.3, to: 1.1, life: 200, palette: 'auto' },
    ],
    light: { radius: 2.5, intensity: 0.8, life: 160 },
  };
  FxRecipes.corpse_burst = {
    particles: [{
      count: 24, shape: 'ring', radius: 0.4, speed: [0.003, 0.007], z: [2, 16],
      vz: [0.03, 0.08], life: [300, 650], size: [2, 4], palette: 'blood',
    }],
    shapes: [
      { kind: 'flash', radius: 1.8, life: 200, palette: 'fire' },
      { kind: 'tongues', n: 6, radius: 1.2, height: 22, life: 480, palette: 'fire' },
    ],
    shake: 0.3,
  };
  FxRecipes.hatch = {
    particles: [{ count: 10, shape: 'ring', radius: 0.4, speed: [0.001, 0.003], life: [250, 500], size: [1.5, 3], palette: 'poison' }],
    shapes: [{ kind: 'puff', n: 4, radius: 0.4, size: 6, life: 600, palette: 'poison' }],
  };

  const SCHOOL_OF = (id) => (BD.data.skills[id] && BD.data.skills[id].school) || 'steel';
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
  // boss moves whose sim school would borrow the player's colours: Mortis's lances are soul-stuff
  const KIND_SCHOOL = { soul_lance: 'portal' };
  // zone kinds with a recipe of their own (played instead of the generic zone hit)
  const ZONE_RECIPE = {
    meteor: ['meteor_hit', 0.8], chaos_rain: ['meteor_hit', 0.5], sky_spear: ['sky_spear', 1],
  };
  // element motif layered on generic zone hits
  const MOTIF = { fire: 'impact_fire', lava: 'impact_fire', cold: 'impact_cold', storm: 'impact_storm', poison: 'impact_poison' };

  // ---- the hero's charge-up ----
  // A skill's wind-up builds in its school colour for its whole length: motes drawn in to the hands, and a
  // glow and rim that grow (render.js draws those from chargeOf). A spell or shot then flashes on release;
  // a melee skill's release is its impact. A cancelled cast just stops.
  const CHARGE_MIN_MS = 120;
  const charge = { ab: null, total: 0, school: 'steel', melee: false, k: 0, moteMs: 0 };
  function cast(world, ev) {
    if (ev.abilityId === 'attack' || ev.id !== world.player.id || !(ev.windupMs >= CHARGE_MIN_MS)) return;
    const sk = BD.data.skills[ev.abilityId];
    charge.ab = ev.abilityId;
    charge.total = ev.windupMs;
    charge.school = SCHOOL_OF(ev.abilityId);
    charge.melee = !!(sk && sk.tags && sk.tags.indexOf('melee') >= 0);
    charge.k = 0;
    charge.moteMs = 0;
  }
  /** one mote pulled in from about a tile out, arriving at the hands as it dies */
  function chargeMote(p) {
    const pal = Palette.SCHOOL[charge.school] || Palette.SCHOOL.steel;
    const a = Math.random() * Math.PI * 2, r = 0.5 + Math.random() * 0.4, life = 160 + Math.random() * 80;
    Fx().spark(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, {
      vx: -Math.cos(a) * r / life, vy: -Math.sin(a) * r / life, z: 10 + Math.random() * 16, vz: 0, g: 0,
      life, size: 1.5 + charge.k * 1.5, color: Math.random() < 0.6 ? pal.mid : pal.core,
      blend: Palette.SCHOOL_NORMAL_BLEND[charge.school] ? 'normal' : 'lighter',
    });
  }
  /** per frame (wire.js): feed motes while the wind-up runs, flash once when it lets go */
  function chargeTick(world, ms) {
    if (!charge.ab) return;
    const p = world.player, a = p.attack;
    if (a && a.abilityId === charge.ab && a.phase === 'windup') {
      charge.k = Math.max(0, Math.min(1, 1 - a.remaining / charge.total));
      charge.moteMs -= ms;
      while (charge.moteMs <= 0) {
        charge.moteMs += charge.melee ? 90 : 40 - 20 * charge.k;
        chargeMote(p);
      }
      return;
    }
    if (!charge.melee && !p.dead) Fx().play('cast_release', p.x, p.y, { school: charge.school });
    charge.ab = null;
  }
  function cancelCharge() { charge.ab = null; }
  /** the running charge-up for an entity, or null: { school, k (0..1), melee } */
  function chargeOf(e) { return charge.ab && e.kind === 'player' && e.attack && e.attack.abilityId === charge.ab ? charge : null; }
  function impact(world, ev) {
    const r = ON_IMPACT[ev.abilityId];
    if (!r) return;
    const self = SELF_CENTRED.indexOf(ev.abilityId) >= 0;
    const x = self ? ev.x : ev.tx;
    const y = self ? ev.y : ev.ty;
    Fx().play(r, x, y, {
      dir: { x: ev.tx - ev.x, y: ev.ty - ev.y },
      school: SCHOOL_OF(ev.abilityId),
      scale: ev.area && ev.area.radius ? ev.area.radius / 2 + 0.5 : 1,
    });
  }
  function novaRecipe(el) {
    if (el === 'cold') return 'nova_cold';
    if (el === 'light') return 'nova_light';
    return 'nova_fire';
  }
  function explode(world, ev) {
    const el = ev.element || (BD.data.projectiles[ev.kind] || {}).element || 'fire';
    const school = Palette.ELEMENT_SCHOOL[el] || 'fire';
    const scale = ev.area && ev.area.radius ? Math.max(1, ev.area.radius / 1.5) : 1;
    if (ev.kind === 'nova') {
      Fx().play(novaRecipe(el), ev.x, ev.y, { school, scale });
      return;
    }
    Fx().play('explosion', ev.x, ev.y, { school, scale });
    if (MOTIF[school]) Fx().play(MOTIF[school], ev.x, ev.y, { school, scale: scale * 1.6 });
  }
  function land(world, ev) { Fx().play('quake', ev.x, ev.y, { scale: ev.area && ev.area.radius ? ev.area.radius / 2 : 0.6 }); }

  /** the one visual for a zone resolving (wire.js calls this; nothing else plays zone.resolve) */
  function zoneResolve(ev) {
    // a charge mark and the hero's own wind-up marker resolve into nothing: the skill plays its own impact
    if (ev.kind === 'charge_mark' || ev.kind === 'self_tele') return;
    const school = KIND_SCHOOL[ev.kind] || ev.school || 'blood';
    const cx = ev.cx != null ? ev.cx : ev.tiles[0][0];
    const cy = ev.cy != null ? ev.cy : ev.tiles[0][1];
    const own = ZONE_RECIPE[ev.kind];
    if (own) {
      Fx().play(own[0], cx, cy, { school, scale: own[1] });
      return;
    }
    const scale = Math.min(2.2, Math.sqrt(ev.tiles.length) / 2);
    Fx().play(ev.heavy ? 'zone_heavy' : 'zone_hit', cx, cy, { school, scale });
    if (MOTIF[school]) Fx().play(MOTIF[school], cx, cy, { school, scale: Math.max(1, scale) });
  }

  // ---- world-level visuals ----
  function lobSchool(ev) {
    if (ev.kind === 'venom') return 'poison';
    if (ev.kind === 'bone_hurl') return 'bone';
    if (ev.abilityId === 'fire_blast' || ev.kind === 'mortar' || ev.kind === 'meteor') return 'fire';
    const zd = BD.data.zones && BD.data.zones[ev.kind];
    return zd && zd.school ? zd.school : 'steel';
  }
  function wire(bus) {
    bus.on('ability.cancel', cancelCharge);
    bus.on('floor.enter', cancelCharge);
    bus.on('lob', (ev) => Fx().shape({
      kind: 'lob', x: ev.fromX, y: ev.fromY, x1: ev.x, y1: ev.y, life: ev.ms || 600,
      pal: Palette.SCHOOL[lobSchool(ev)] || Palette.SCHOOL.steel, big: ev.kind === 'meteor',
    }));
    bus.on('beam', (ev) => Fx().shape({
      kind: 'beam', x: ev.fromX, y: ev.fromY,
      x1: ev.fromX + Math.cos(ev.a) * ev.len, y1: ev.fromY + Math.sin(ev.a) * ev.len,
      life: 120, pal: Palette.SCHOOL.seal,
    }));
    bus.on('zone.tick', (ev) => {
      if (ev.abilityId === 'rain_of_arrows') {
        Fx().play('arrow_rain', ev.cx, ev.cy);
      } else if (ev.abilityId === 'blizzard') {
        Fx().play('flair_cold', ev.cx + Math.random() * 2 - 1, ev.cy + Math.random() * 2 - 1, { scale: 1.5 });
      } else if (ev.abilityId === 'chain_lightning') {
        // Thunderhead: a bolt drops from straight above (two tiles up-screen is (−2, −2) in tile space)
        Fx().shape({ kind: 'beam', x: ev.cx - 2.5, y: ev.cy - 2.5, x1: ev.cx, y1: ev.cy, life: 160, pal: Palette.SCHOOL.storm });
        Fx().play('nova_light', ev.cx, ev.cy, { scale: 0.45 });
      }
    });
    bus.on('corpse.explode', (ev) => Fx().play('corpse_burst', ev.x, ev.y));
    bus.on('egg.hatch', (ev) => Fx().play('hatch', ev.x, ev.y));
    bus.on('boss.land', (ev) => Fx().play('quake', ev.x, ev.y, { scale: 1.3 }));
    bus.on('emerge', (ev) => Fx().play('quake', ev.x, ev.y, { scale: 0.8 }));
    bus.on('burrow', (ev) => Fx().play('quake', ev.x, ev.y, { scale: 0.4 }));
    bus.on('trap.trigger', (ev) => Fx().play('whiff', ev.x, ev.y));
    bus.on('chest.open', (ev) => Fx().play('blink', ev.x, ev.y, { school: ev.cursed ? 'shadow' : 'bone' }));
    bus.on('shatter', (ev) => Fx().play('nova_cold', ev.x, ev.y, { scale: 0.6 }));
    bus.on('deploy', (ev) => Fx().play('blink', ev.x, ev.y, { school: ev.kind === 'death_sentry' ? 'fire' : 'storm' }));
    bus.on('ally.spawn', (ev) => Fx().play('holy_column', ev.x, ev.y));
    bus.on('boss.split', (ev) => Fx().play('blink', ev.x, ev.y, { school: 'portal' }));
    bus.on('run.victory', () => {
      const p = BD.view.host.world().player;
      Fx().play('levelup', p.x, p.y, { scale: 2 });
    });
  }

  BD.view.skillFx = { cast, chargeTick, cancelCharge, chargeOf, impact, explode, land, zoneResolve, wire };
})(globalThis.BD);
