// @ts-check
// Assassin — Energy & Combo (02 §3). Special rules in sim/skills_assassin.js.
(function (BD) {
  'use strict';
  const S = (BD.data.skills = BD.data.skills || {});
  const sk = (o) => {
    const cues = { cast: 'skill.' + o.id + '.cast', impact: 'skill.' + o.id + '.impact' };
    S[o.id] = Object.assign({ cls: 'assassin', tags: [], effects: [], breakpoints: [], cues }, o);
  };

  // ---------------- Martial Arts ----------------
  sk({
    id: 'tiger_strike', branch: 'martial', tier: 1, name: 'Tiger Strike', icon: 'tiger_strike', school: 'ki',
    tags: ['melee', 'builder', 'physical'], resource: { type: 'energy', cost: 8, combo: 'build' }, cooldownMs: 0, usesAttackSpeed: true,
    targeting: { mode: 'unit', range: 1, requiresLOS: true, outOfRange: 'approach' }, delivery: { kind: 'melee' }, area: { shape: 'single' },
    effects: [{ type: 'damage', source: 'weapon', mult: 1.2, canCrit: true }],
    breakpoints: [
      { rank: 3, set: { critPerCombo: 10 }, text: '+10% critical strike chance per combo charge held.' },
      { rank: 5, set: { arcAt3: true }, text: 'At 3 charges, Tiger Strike hits the 3 tiles in front.' },
    ],
    desc: 'A fast strike that builds a combo charge when it lands. Spend charges with finishers.',
  });
  sk({
    id: 'dragon_talon', branch: 'martial', tier: 2, name: 'Dragon Talon', icon: 'dragon_talon', school: 'ki',
    tags: ['melee', 'finisher', 'physical'], resource: { type: 'energy', cost: 30, combo: 'finish' }, cooldownMs: 0, usesAttackSpeed: true,
    targeting: { mode: 'unit', range: 1, requiresLOS: true, outOfRange: 'approach' }, delivery: { kind: 'melee' }, area: { shape: 'single' },
    effects: [{ type: 'damage', source: 'weapon', mult: 1.45, perCombo: 1.0, canCrit: true }],
    breakpoints: [
      { rank: 3, set: { collide: 1 }, text: 'A knocked-back enemy that hits another enemy deals 1× to both.' },
      { rank: 5, set: { killRefund: 1 }, text: 'A kill refunds 1 combo charge.' },
    ],
    desc: 'A finishing kick: +1.0× per combo charge. At 2+ charges it knocks the target back 2 tiles and stuns for 0.4 s per charge.',
  });
  sk({
    id: 'phoenix_strike', branch: 'martial', tier: 3, name: 'Phoenix Strike', icon: 'phoenix_strike', school: 'fire',
    tags: ['finisher', 'aoe', 'elemental'], resource: { type: 'energy', cost: 40, combo: 'finish' }, cooldownMs: 4000, castMs: 260,
    targeting: { mode: 'self' }, delivery: { kind: 'instant' },
    effects: [{ type: 'damage', source: 'weapon', mult: 0.8, element: 'fire', canCrit: true, canDodge: false }],
    breakpoints: [
      { rank: 3, set: { extra: 1 }, text: '+1 radius / +2 chain jumps.' },
      { rank: 5, set: { field: true }, text: 'Leaves a matching field for 3 s.' },
    ],
    desc: 'The element follows your charges — 0: fire nova (radius 1, 0.8×). 1: fire nova (radius 2, 1.4×, Burning). ' +
      '2: chain lightning (4 jumps, 1.2×, Shocked). 3: ice burst (radius 3, 1.8×, Frozen).',
  });
  sk({ id: 'endless_flurry', branch: 'martial', tier: 4, name: 'Endless Flurry', icon: 'endless_flurry', keystone: true, passive: () => void 0, school: 'ki',
    desc: 'Maximum combo charges 4. Basic attacks have a 25% chance to build a charge.' });

  // ---------------- Traps ----------------
  sk({
    id: 'fire_blast', branch: 'traps', tier: 1, name: 'Fire Blast', icon: 'fire_blast', school: 'fire',
    tags: ['aoe', 'trap', 'fire'], resource: { type: 'energy', cost: 20 }, cooldownMs: 1000, castMs: 250,
    targeting: { mode: 'point', range: 7, requiresLOS: true, outOfRange: 'approach' }, delivery: { kind: 'lob', flightMs: 600 }, area: { shape: 'circle', radius: 1 },
    effects: [{ type: 'damage', source: 'weapon', mult: 1.0, element: 'fire', canCrit: true, canDodge: false }, { type: 'status', id: 'burning', needsHit: true }],
    breakpoints: [
      { rank: 3, set: { bomblets: 3 }, text: 'Splits into 3 bomblets around the target.' },
      { rank: 5, set: { linger: { kind: 'burning_ground', durMs: 3000 } }, text: 'Leaves burning ground for 3 s.' },
    ],
    desc: 'Lob a bomb that bursts in radius 1 and sets enemies Burning. Holding a combo charge? It consumes one for +60% damage.',
    params: { comboMult: 1.6 },
  });
  sk({
    id: 'lightning_sentry', branch: 'traps', tier: 2, name: 'Lightning Sentry', icon: 'lightning_sentry', school: 'storm',
    tags: ['trap', 'deploy', 'lightning'], resource: { type: 'energy', cost: 30 }, cooldownMs: 2000, castMs: 250,
    targeting: { mode: 'point', range: 6, requiresLOS: true, requiresVisible: true, outOfRange: 'approach' }, delivery: { kind: 'deploy' },
    effects: [{ type: 'damage', source: 'weapon', mult: 0.55, element: 'light', canCrit: false, canDodge: true }],
    shots: 8, intervalMs: 800, sentryRange: 7, maxSentries: 3,
    breakpoints: [
      { rank: 3, set: { chain: 1 }, text: 'Bolts chain once.' },
      { rank: 5, set: { maxSentries: 4 }, text: 'Up to 4 sentries.' },
    ],
    desc: 'Place a sentry that fires a lightning bolt at the nearest enemy within 7 every 0.8 s (8 shots). Up to 3 at once. Consumes all combo charges: +2 shots per charge.',
  });
  sk({
    id: 'death_sentry', branch: 'traps', tier: 3, name: 'Death Sentry', icon: 'death_sentry', school: 'fire',
    tags: ['trap', 'deploy', 'fire', 'aoe'], resource: { type: 'energy', cost: 40 }, cooldownMs: 6000, castMs: 250,
    targeting: { mode: 'point', range: 6, requiresLOS: true, requiresVisible: true, outOfRange: 'approach' }, delivery: { kind: 'deploy' },
    effects: [{ type: 'damage', source: 'weapon', mult: 0.5, element: 'light', canCrit: false }],
    lifeMs: 12000, intervalMs: 1500, corpses: 1,
    breakpoints: [
      { rank: 3, set: { corpses: 2 }, text: 'Two corpses per pulse.' },
      { rank: 5, set: { vulnerable: true }, text: 'Explosions apply Vulnerable.' },
    ],
    desc: 'A sentry for 12 s. Every 1.5 s it detonates a corpse within 5 tiles: ' +
      'fire in radius 2 for 40% of the corpse\'s maximum life (capped at 3× your weapon hit). ' +
      'With no corpse, it fires a 0.5× lightning bolt.',
  });
  sk({ id: 'clockwork_mind', branch: 'traps', tier: 4, name: 'Clockwork Mind', icon: 'clockwork_mind', keystone: true, passive: () => void 0, school: 'gold',
    desc: 'Sentries inherit your critical strike chance and on-hit effects, and prefer your locked target.' });

  // ---------------- Shadow ----------------
  sk({
    id: 'shadowstep', branch: 'shadow', tier: 1, name: 'Shadowstep', icon: 'shadowstep', school: 'shadow',
    tags: ['mobility'], resource: { type: 'energy', cost: 15 }, cooldownMs: 8000, castMs: 100, noIas: true,
    targeting: { mode: 'unit', range: 7, requiresLOS: true, requiresVisible: true, outOfRange: 'reject' }, delivery: { kind: 'blink', behind: true },
    selfEffects: [{ type: 'buff', id: 'ambush_ready', durMs: 2000 }],
    breakpoints: [
      { rank: 3, set: { charges: 2 }, text: '2 charges.' },
      { rank: 5, set: { comboOnStep: 1 }, text: 'Grants 1 combo charge.' },
    ],
    desc: 'Teleport behind a visible enemy within 7. Your next attack within 2 s is a guaranteed critical hit.',
  });
  sk({
    id: 'smoke_bomb', branch: 'shadow', tier: 2, name: 'Smoke Bomb', icon: 'smoke_bomb', school: 'shadow',
    tags: ['utility', 'zone'], resource: { type: 'energy', cost: 25 }, cooldownMs: 14000, castMs: 150, noIas: true,
    targeting: { mode: 'self' }, delivery: { kind: 'instant' }, smoke: { radius: 2, durMs: 4000 },
    breakpoints: [
      { rank: 3, set: { smoke: { radius: 3, durMs: 4000 } }, text: 'Radius 3.' },
      { rank: 5, set: { followSmoke: true }, text: 'The cloud follows you.' },
    ],
    desc: 'A cloud of radius 2 at your feet for 4 s. Enemies inside are Blinded (half their attacks miss) and Vulnerable. Ranged enemies cannot target you while you stand in it.',
  });
  sk({
    id: 'shadow_master', branch: 'shadow', tier: 3, name: 'Shadow Master', icon: 'shadow_master', school: 'shadow',
    tags: ['summon'], resource: { type: 'energy', cost: 50 }, cooldownMs: 25000, castMs: 250, noIas: true,
    targeting: { mode: 'self' }, delivery: { kind: 'summon' }, cloneMult: 0.5, cloneMs: 15000,
    breakpoints: [
      { rank: 3, set: { copiesTiger: true }, text: 'Also copies Tiger Strike.' },
      { rank: 5, set: { cloneMs: 25000 }, text: 'Lasts 25 s.' },
    ],
    desc: 'A shadow clone for 15 s that copies your basic attacks and finishers at 50% damage (90% at rank 5). Enemies target it 40% of the time.',
  });
  sk({ id: 'unseen', branch: 'shadow', tier: 4, name: 'Unseen', icon: 'unseen', keystone: true, passive: () => void 0, school: 'shadow',
    desc: 'After 2 s without attacking or being hit you become Hidden: monsters don\'t notice you on sight, ' +
      'and your next hit deals 3× and doesn\'t alert the rest of the pack.',
    params: { dmgMult: 3 } });

  for (const id in S) if (S[id].cls === 'assassin') BD.data.stats.ensureSkillKey(id, S[id].name);
})(globalThis.BD);
