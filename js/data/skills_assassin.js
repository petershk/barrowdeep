// @ts-check
// Assassin — Energy & Combo (02 §3). Special rules in sim/skills_assassin.js.
(function (BD) {
  'use strict';
  const S = (BD.data.skills = BD.data.skills || {});
  const sk = (o) => {
    const cues = { cast: 'skill.' + o.id + '.cast', impact: 'skill.' + o.id + '.impact' };
    S[o.id] = Object.assign({ cls: 'assassin', tags: [], effects: [], breakpoints: [], cues }, o);
  };

  const st = (id, o) => Object.assign({ type: 'status', id, needsHit: true }, o || {});
  const mult = (eff, k) => {
    const out = Object.assign({}, eff, { mult: eff.mult * k });
    if (eff.perRank) out.perRank = eff.perRank.map((v) => v * k);
    return out;
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
    forms: [
      { id: 'cobra_fang', name: 'Cobra Fang', verb: 'Venom',
        text: 'Coats your blades in venom: applies Poisoned on hit and always builds 2 combo charges, at 15% less direct damage.',
        mod: (ab) => {
          ab.resource = Object.assign({}, ab.resource, { comboAdd: 2 });
          ab.effects = [mult(ab.effects[0], 0.85)].concat(ab.effects.slice(1), [st('poisoned')]);
          ab.school = 'poison';
        } },
      { id: 'crescent_slash', replaces: [5], name: 'Crescent Slash', verb: 'Sweep',
        text: 'Always sweeps the 3 tiles in front of you and applies Bleeding.',
        mod: (ab) => {
          ab.area = { shape: 'arc3' };
          ab.targeting = { mode: 'direction', range: 1, requiresLOS: false, outOfRange: 'approach' };
          ab.effects = ab.effects.concat([st('bleeding')]);
        } },
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
    forms: [
      { id: 'dragon_flight', replaces: [3], name: 'Dragon Flight', verb: 'Blink',
        text: 'Shadow-kicks across up to 6 tiles directly to the target and strikes every adjacent enemy in a radius-1 burst.',
        mod: (ab) => {
          ab.targeting = Object.assign({}, ab.targeting, { range: 6 });
          ab.dragonFlight = true;
        } },
      { id: 'thousand_kicks', replaces: [3], name: 'Thousand Kicks', verb: 'Flurry',
        text: 'Costs 15 energy, deals +30% base damage and refunds 12 energy per combo charge spent, without knocking the target back.',
        mod: (ab) => {
          ab.resource = Object.assign({}, ab.resource, { cost: 15 });
          ab.effects = [mult(ab.effects[0], 1.3)];
          ab.noKickBack = true;
          ab.energyPerCombo = 12;
        } },
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
    forms: [
      { id: 'triad_unleashed', name: 'Triad Unleashed', verb: 'Triad',
        text: 'Unleashes all three elemental strikes at once (fire nova, chain lightning and ice burst) at 55% damage each, plus +25% per combo charge.',
        set: { triad: 0.55, triadPerCombo: 0.25 } },
      { id: 'supernova', replaces: [3], name: 'Supernova', verb: 'Detonate',
        text: 'Always erupts as a radius-3 fire-and-lightning blast that pulls enemies inward, Stuns for 1 s and leaves burning ground.',
        set: { supernova: true, field: true } },
    ],
    desc: 'The element follows your charges — 0: fire nova (radius 1, 0.8×). 1: fire nova (radius 2, 1.4×, Burning). ' +
      '2: chain lightning (4 jumps, 1.2×, Shocked). 3: ice burst (radius 3, 1.8×, Frozen).',
  });
  sk({ id: 'endless_flurry', branch: 'martial', tier: 4, name: 'Endless Flurry', icon: 'endless_flurry', keystone: true, passive: () => void 0, school: 'ki',
    desc: 'Attunement (one per hero). Maximum combo charges 4. Basic attacks have a 25% chance to build a charge.' });

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
    forms: [
      { id: 'cluster_mine', replaces: [3], name: 'Cluster Mine', verb: 'Cluster',
        text: 'Splits into 5 bomblets in a wide ring and Slows enemies hit for 2.5 s.',
        mod: (ab) => {
          ab.bomblets = 5;
          ab.effects = ab.effects.concat([st('slowed', { durMs: 2500 })]);
        } },
      { id: 'shock_grenade', name: 'Shock Grenade', verb: 'Stun',
        text: 'Converts the blast to lightning: Stuns enemies for 1 s, applies Shocked and builds 1 combo charge on hit.',
        mod: (ab) => {
          ab.effects = [Object.assign({}, ab.effects[0], { element: 'light' }), st('shocked'), st('stunned', { durMs: 1000 })];
          ab.resource = Object.assign({}, ab.resource, { combo: 'build' });
          ab.noComboConsume = true;
          ab.school = 'storm';
        } },
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
    forms: [
      { id: 'chain_pylon', replaces: [3], name: 'Chain Pylon', verb: 'Arc',
        text: 'Fires every 0.55 s and bolts chain up to 3 times, applying Shocked.',
        mod: (ab) => {
          ab.intervalMs = 550;
          ab.chain = 3;
          ab.effects = ab.effects.concat([st('shocked')]);
        } },
      { id: 'inferno_turret', name: 'Inferno Turret', verb: 'Scorch',
        text: 'Fires explosive fire bolts that burst in radius 1 for +25% damage and set enemies Burning.',
        mod: (ab) => {
          ab.effects = [Object.assign(mult(ab.effects[0], 1.25), { element: 'fire', canDodge: false }), st('burning')];
          ab.sentrySplash = 1;
          ab.school = 'fire';
        } },
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
    forms: [
      { id: 'plague_totem', replaces: [5], name: 'Plague Totem', verb: 'Blight',
        text: 'Corpse explosions spread a radius-2 poison pool for 4 s and apply Poisoned and Vulnerable; bolts also Poison.',
        mod: (ab) => {
          ab.vulnerable = true;
          ab.plaguePool = true;
          ab.effects = [Object.assign({}, ab.effects[0], { element: 'pois' }), st('poisoned')];
          ab.school = 'poison';
        } },
      { id: 'soul_harvester', name: 'Soul Harvester', verb: 'Siphon',
        text: 'No corpse needed: pulses a radius-3 shadow nova every 1.2 s for 0.75× damage that restores 5 energy and 2% life per enemy hit.',
        set: { intervalMs: 1200, soulNova: 0.75, school: 'shadow' } },
    ],
    desc: 'A sentry for 12 s. Every 1.5 s it detonates a corpse within 5 tiles: ' +
      'fire in radius 2 for 40% of the corpse\'s maximum life (capped at 3× your weapon hit). ' +
      'With no corpse, it fires a 0.5× lightning bolt.',
  });
  sk({ id: 'clockwork_mind', branch: 'traps', tier: 4, name: 'Clockwork Mind', icon: 'clockwork_mind', keystone: true, passive: () => void 0, school: 'gold',
    desc: 'Attunement (one per hero). Sentries inherit your critical strike chance and on-hit effects, and prefer your locked target.' });

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
    forms: [
      { id: 'killing_spree', replaces: [5], name: 'Killing Spree', verb: 'Reset',
        text: 'Grants 2 combo charges on arrival, and killing an enemy within 3 s resets Shadowstep\'s cooldown.',
        set: { comboOnStep: 2, spreeMs: 3000 } },
      { id: 'fan_of_knives', name: 'Fan of Knives', verb: 'Blades',
        text: 'Upon arrival, hurls knives in radius 2 for 1.2× physical damage and applies Bleeding and Slowed.',
        set: { fanMult: 1.2 } },
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
    forms: [
      { id: 'choking_gas', name: 'Choking Gas', verb: 'Poison',
        text: 'Laces the smoke with venom: also spawns a poison pool that Poisons enemies and deals continuous poison damage.',
        set: { chokingGas: true, school: 'poison' } },
      { id: 'vanish', replaces: [5], name: 'Vanish', verb: 'Stealth',
        text: 'The cloud follows you, cleanses Bleeding/Poison/Chill, and grants Hasted, Shadow Strike and 2 combo charges.',
        mod: (ab) => {
          ab.followSmoke = true;
          ab.comboOnSmoke = 2;
          ab.selfEffects = [
            { type: 'buff', id: 'hasted', durMs: 4000 },
            { type: 'buff', id: 'ambush_ready', durMs: 3000 },
            { type: 'cleanse', statuses: ['poisoned', 'bleeding', 'chilled'] },
          ];
        } },
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
    forms: [
      { id: 'twin_shadows', replaces: [3], name: 'Twin Shadows', verb: 'Twins',
        text: 'Summons two shadow clones at 40% damage each that copy both Tiger Strike and your finishers.',
        set: { cloneCount: 2, cloneMult: 0.4, copiesTiger: true } },
      { id: 'reaper_shade', replaces: [3], name: 'Reaper Shade', verb: 'Reap',
        text: 'Cooldown 18 s. Your clone deals 75% damage, copies Tiger Strike, and erupts in radius 2 for 2.5× damage when summoned.',
        set: { cooldownMs: 18000, cloneMult: 0.75, copiesTiger: true, summonBlast: 2.5 } },
    ],
    desc: 'A shadow clone for 15 s that copies your basic attacks and finishers at 50% damage (90% at rank 5). Enemies target it 40% of the time.',
  });
  sk({ id: 'unseen', branch: 'shadow', tier: 4, name: 'Unseen', icon: 'unseen', keystone: true, passive: () => void 0, school: 'shadow',
    desc: 'Attunement (one per hero). After 2 s without attacking or being hit you become Hidden: monsters don\'t notice you on sight, ' +
      'and your next hit deals 3× and doesn\'t alert the rest of the pack.',
    params: { dmgMult: 3 } });

  for (const id in S) if (S[id].cls === 'assassin') BD.data.stats.ensureSkillKey(id, S[id].name);
})(globalThis.BD);
