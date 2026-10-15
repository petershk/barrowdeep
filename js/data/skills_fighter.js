// @ts-check
// Fighter — Rage (02 §2). Data interpreted by the ability engine; special rules in sim/skills_fighter.js.
(function (BD) {
  'use strict';
  const S = (BD.data.skills = BD.data.skills || {});
  const sk = (o) => {
    const cues = { cast: 'skill.' + o.id + '.cast', impact: 'skill.' + o.id + '.impact' };
    S[o.id] = Object.assign({ cls: 'fighter', tags: [], effects: [], breakpoints: [], cues }, o);
  };

  const st = (id, o) => Object.assign({ type: 'status', id, needsHit: true }, o || {});
  const mult = (eff, k) => {
    const out = Object.assign({}, eff, { mult: eff.mult * k });
    if (eff.perRank) out.perRank = eff.perRank.map((v) => v * k);
    return out;
  };

  // ---------------- Brawn ----------------
  sk({
    id: 'bash', branch: 'brawn', tier: 1, name: 'Bash', icon: 'bash', school: 'steel',
    tags: ['melee', 'builder', 'physical'],
    resource: { type: 'rage', cost: 8 }, cooldownMs: 0, usesAttackSpeed: true,
    targeting: { mode: 'direction', range: 1, requiresLOS: false, outOfRange: 'approach' },
    delivery: { kind: 'melee', hitTiming: 'onImpact' }, area: { shape: 'arc3' },
    effects: [{ type: 'damage', source: 'weapon', mult: 1.25, perRank: [1.25, 1.5, 1.75, 2.0, 2.9], canCrit: true, canDodge: false }],
    breakpoints: [
      { rank: 3, add: [{ type: 'knockback', dist: 1, targets: 'center' }], text: 'Knocks the centre target back 1 tile.' },
      { rank: 5, add: [{ type: 'status', id: 'stunned', durMs: 500, onlyOnCrit: true }], text: 'Critical hits stun for 0.5 s.' },
    ],
    forms: [
      { id: 'cleave', name: 'Cleave', verb: 'Sweep',
        text: 'Sweeps a wide 2-tile cone in front of you and applies Bleeding, at 15% less direct damage.',
        mod: (ab) => {
          ab.area = { shape: 'cone', length: 2, angle: 120 };
          ab.effects = [mult(ab.effects[0], 0.85)].concat(ab.effects.slice(1), [st('bleeding')]);
        } },
      { id: 'skullcracker', replaces: [3], name: 'Skullcracker', verb: 'Crush',
        text: 'A crushing overhead blow against one target: +25% damage, Stuns for 0.8 s and generates 10 rage on hit.',
        mod: (ab) => {
          ab.area = { shape: 'single' };
          ab.targeting = { mode: 'unit', range: 1, requiresLOS: true, outOfRange: 'approach' };
          ab.resource = Object.assign({}, ab.resource, { gen: 10 });
          ab.effects = [mult(ab.effects[0], 1.25), st('stunned', { durMs: 800 })];
        } },
    ],
    desc: 'Smash the three tiles in front of you. Your basic attacks build the rage it costs.',
  });
  sk({
    id: 'whirlwind', branch: 'brawn', tier: 2, name: 'Whirlwind', icon: 'whirlwind', school: 'steel',
    tags: ['melee', 'aoe', 'channel', 'spender', 'physical'],
    resource: { type: 'rage', cost: 0, minStart: 10 }, cooldownMs: 0,
    channel: { tickMs: 400, costPerSec: 12 }, moveWhileChannel: 0.7,
    targeting: { mode: 'self' }, delivery: { kind: 'channel' }, area: { shape: 'circle', radius: 1 },
    effects: [{ type: 'damage', source: 'weapon', mult: 0.7, canCrit: true, canDodge: true, canBlock: false }],
    breakpoints: [
      { rank: 3, set: { pullPerSec: 1 }, text: 'Pulls enemies within 2 tiles 1 tile inward per second.' },
      { rank: 5, add: [{ type: 'status', id: 'bleeding', needsHit: true }], text: 'Hits apply Bleeding.' },
    ],
    forms: [
      { id: 'dust_devil', replaces: [3], name: 'Dust Devil', verb: 'Vortex',
        text: 'Spins up a radius-2 storm of grit that drags enemies within 3 tiles inward every second and Slows them.',
        mod: (ab) => {
          ab.area = { shape: 'circle', radius: 2 };
          ab.pullPerSec = 1;
          ab.pullRadius = 3;
          ab.effects = ab.effects.concat([st('slowed', { durMs: 1500 })]);
          ab.school = 'dust';
        } },
      { id: 'blood_funnel', replaces: [5], name: 'Blood Funnel', verb: 'Leech',
        text: 'Hits always apply Bleeding and heal 2% of your maximum life per enemy struck.',
        mod: (ab) => {
          ab.effects = ab.effects.concat([st('bleeding')]);
          ab.wwHealPct = 0.02;
          ab.school = 'blood';
        } },
    ],
    desc: 'Spin while held, striking every adjacent enemy every 0.4 s. Costs 12 rage per second (10 to start). You move at 70% speed while spinning.',
  });
  sk({
    id: 'berserk_strike', branch: 'brawn', tier: 3, name: 'Berserk Strike', icon: 'berserk', school: 'blood',
    tags: ['melee', 'spender', 'physical'],
    resource: { type: 'rage', cost: 40 }, cooldownMs: 0, usesAttackSpeed: true,
    targeting: { mode: 'unit', range: 1, requiresLOS: true, outOfRange: 'approach' },
    delivery: { kind: 'melee' }, area: { shape: 'single' },
    effects: [{ type: 'damage', source: 'weapon', mult: 2.8, canCrit: true, canDodge: true, missingLife: 0.5 }],
    breakpoints: [
      { rank: 3, set: { killRefund: 20 }, text: 'A kill refunds 20 rage.' },
      { rank: 5, set: { sideHits: 0.5 }, text: 'Also hits the tiles beside the target for 50%.' },
    ],
    forms: [
      { id: 'guillotine', name: 'Guillotine', verb: 'Execute',
        text: 'Against enemies below 50% life, Guillotine is a guaranteed critical hit and refunds 25 rage on kill.',
        set: { executeBelow: 0.5, killRefund: 25 } },
      { id: 'bloodbath', replaces: [5], name: 'Bloodbath', verb: 'Rupture',
        text: 'Erupts in a radius-1 spray of blood around the target for 75% damage and applies Bleeding to all hit.',
        mod: (ab) => {
          ab.bloodbath = 0.75;
          ab.effects = ab.effects.concat([st('bleeding')]);
        } },
    ],
    desc: 'A savage blow against one enemy. Deals +1% damage per 1% of the target\'s missing life (up to +50%).',
  });
  sk({
    id: 'bloodlust', branch: 'brawn', tier: 4, name: 'Bloodlust', icon: 'bloodlust', passive: (r, add) => void 0, keystone: true, school: 'blood',
    desc: 'Attunement (one per hero). Rage no longer decays. While above 80 rage you lose 1% of your maximum life per second. Berserk Strike heals 5% of your maximum life.',
    params: { rageThreshold: 80, drainPct: 0.01, healPct: 0.05 },   // drain never kills
  });

  // ---------------- Onslaught ----------------
  sk({
    id: 'charge', branch: 'onslaught', tier: 1, name: 'Charge', icon: 'charge', school: 'steel',
    tags: ['melee', 'mobility', 'physical'],
    resource: { type: 'rage', cost: 20 }, cooldownMs: 6000, castMs: 120, noIas: true,
    targeting: { mode: 'unit', range: 6, requiresLOS: true, outOfRange: 'reject' },
    delivery: { kind: 'dash' },
    effects: [{ type: 'damage', source: 'weapon', mult: 1.25, canCrit: true, canDodge: false }, { type: 'status', id: 'stunned', durMs: 1000 }],
    breakpoints: [
      { rank: 3, set: { pathHits: 0.5 }, text: 'Enemies along the path are knocked aside and take 0.5× damage.' },
      { rank: 5, set: { killResets: true }, text: 'A kill resets the cooldown.' },
    ],
    forms: [
      { id: 'bull_rush', replaces: [3], name: 'Bull Rush', verb: 'Trample',
        text: 'Range 8. Tramples through the line for 0.8× damage and Stuns every enemy along the path for 1 s.',
        mod: (ab) => {
          ab.targeting = Object.assign({}, ab.targeting, { range: 8 });
          ab.pathHits = 0.8;
          ab.pathStunMs = 1000;
        } },
      { id: 'vanguard', name: 'Vanguard', verb: 'Fortify',
        text: 'Costs 0 rage, generates 15 rage on impact and grants a barrier worth 15% of your maximum life for 5 s.',
        mod: (ab) => {
          ab.resource = { type: 'rage', cost: 0, gen: 15 };
          ab.vanguardShield = 0.15;
        } },
    ],
    desc: 'Dash up to 6 tiles to an enemy, strike it and stun it for 1 s.',
  });
  sk({
    id: 'war_cry', branch: 'onslaught', tier: 2, name: 'War Cry', icon: 'warcry', school: 'blood',
    tags: ['shout', 'aoe', 'utility'],
    resource: { type: 'rage', cost: 25 }, cooldownMs: 14000, castMs: 250, noIas: true,
    targeting: { mode: 'self' }, delivery: { kind: 'instant' }, area: { shape: 'circle', radius: 4 },
    effects: [{ type: 'status', id: 'feared', durMs: 2500 }],
    selfEffects: [{ type: 'buff', id: 'war_cry', durMs: 6000, magnitude: 20 }],
    breakpoints: [
      { rank: 3, add: [{ type: 'status', id: 'vulnerable', durMs: 4000 }], text: 'Everyone affected is also Vulnerable for 4 s.' },
      { rank: 5, set: { rageOverTime: 30 }, text: 'Gain 30 rage over 3 s.' },
    ],
    forms: [
      { id: 'challenge', name: 'Challenge', verb: 'Taunt',
        text: 'Instead of fearing, drags enemies within 4 tiles 1 tile inward, Taunts them and makes them Vulnerable for 4 s.',
        mod: (ab) => {
          ab.effects = [{ type: 'status', id: 'taunted', durMs: 4000 }, { type: 'status', id: 'vulnerable', durMs: 4000 }];
          ab.cryPull = 1;
        } },
      { id: 'battle_fury', name: 'Battle Fury', verb: 'Surge',
        text: 'Costs 0 rage, grants 30 rage immediately and makes you Hasted for 4 s; enemies are Weakened instead of Feared.',
        mod: (ab) => {
          ab.resource = { type: 'rage', cost: 0 };
          ab.effects = [{ type: 'status', id: 'weakened', durMs: 4000 }];
          ab.selfEffects = ab.selfEffects.concat([{ type: 'buff', id: 'hasted', durMs: 4000 }]);
          ab.cryRageNow = 30;
        } },
    ],
    desc: 'Enemies within 4 tiles are Feared for 2.5 s (bosses are Weakened for 4 s). You deal +20% damage for 6 s.',
  });
  sk({
    id: 'earthshaker', branch: 'onslaught', tier: 3, name: 'Earthshaker', icon: 'earthshaker', school: 'dust',
    tags: ['aoe', 'spender', 'physical', 'slam'],
    resource: { type: 'rage', cost: 50 }, cooldownMs: 8000, castMs: 300, noIas: true, selfTelegraph: true, onCommit: true,
    targeting: { mode: 'self' }, delivery: { kind: 'instant' }, area: { shape: 'circle', radius: 2 },
    effects: [{ type: 'damage', source: 'weapon', mult: 3.2, canCrit: true, canDodge: false, canBlock: false }, { type: 'status', id: 'stunned', durMs: 1000 }],
    breakpoints: [
      { rank: 3, set: { area: { shape: 'circle', radius: 3 } }, text: 'Radius 3.' },
      { rank: 5, set: { aftershock: 1.2, aftershockMs: 1000 }, text: 'An aftershock 1 s later deals 1.2×.' },
    ],
    forms: [
      { id: 'sunder', replaces: [3], name: 'Sunder', verb: 'Cleave',
        text: 'Slams a 4-tile cone in front of you for +20% damage and makes enemies Vulnerable for 4 s.',
        mod: (ab) => {
          ab.targeting = { mode: 'direction', range: 4, requiresLOS: false };
          ab.area = { shape: 'cone', length: 4, angle: 90 };
          ab.effects = [mult(ab.effects[0], 1.2), { type: 'status', id: 'stunned', durMs: 1000 }, st('vulnerable', { durMs: 4000 })];
        } },
      { id: 'cataclysm', name: 'Cataclysm', verb: 'Ignite',
        text: 'A volcanic slam: converts half the damage to fire, sets enemies Burning and leaves burning ground for 4 s.',
        mod: (ab) => {
          ab.effects = [Object.assign({}, ab.effects[0], { convert: { fire: 0.5 } }), ab.effects[1], st('burning')];
          ab.cataclysmMs = 4000;
          ab.school = 'fire';
        } },
    ],
    desc: 'After a 0.3 s wind-up, a shockwave in radius 2 strikes and stuns for 1 s. You cannot be knocked back while winding up.',
  });
  sk({
    id: 'warlord', branch: 'onslaught', tier: 4, name: 'Warlord', icon: 'warlord', passive: () => void 0, keystone: true, school: 'blood',
    desc: 'Attunement (one per hero). War Cry heals 8% of your maximum life per enemy affected (up to 40%), and its cooldown becomes 8 s.',
    params: { healPerTarget: 0.08, healMax: 0.4, cryCdMs: 8000 },
  });

  // ---------------- Iron ----------------
  sk({
    id: 'brace', branch: 'iron', tier: 1, name: 'Brace', icon: 'brace', school: 'steel',
    tags: ['defensive'],
    resource: { type: 'rage', cost: 10 }, cooldownMs: 10000, castMs: 0, noIas: true,
    targeting: { mode: 'self' }, delivery: { kind: 'instant' },
    selfEffects: [{ type: 'buff', id: 'braced', durMs: 3000, durKey: 'braceMs', magnitude: 40, perRank: [40, 45, 50, 55, 60] }],
    breakpoints: [
      { rank: 3, set: { braceMs: 4000 }, text: 'Lasts 4 s.' },
      { rank: 5, set: { reflect: 0.5 }, text: 'Blocked and braced hits reflect 50% of their damage.' },
    ],
    forms: [
      { id: 'retaliation', replaces: [5], name: 'Retaliation', verb: 'Thorns',
        text: 'While Braced, every hit you take unleashes a steel shockwave (radius 1) reflecting 100% of the damage.',
        set: { reflect: 1.0, reflectAoe: true } },
      { id: 'unstoppable', name: 'Unstoppable', verb: 'Break free',
        text: 'Costs 0 rage, grants Unstoppable and Hasted for 3 s, and shocks adjacent enemies back 1 tile.',
        mod: (ab) => {
          ab.resource = { type: 'rage', cost: 0 };
          ab.area = { shape: 'circle', radius: 1 };
          ab.effects = [{ type: 'knockback', dist: 1 }];
          ab.selfEffects = ab.selfEffects.concat([
            { type: 'buff', id: 'knockback_immune', durMs: 3000 },
            { type: 'buff', id: 'hasted', durMs: 3000 },
          ]);
        } },
    ],
    desc: 'For 3 s, take 40% less damage and gain 4 rage per hit taken.',
  });
  sk({
    id: 'second_wind', branch: 'iron', tier: 2, name: 'Second Wind', icon: 'secondwind', school: 'life',
    tags: ['heal'],
    resource: { type: 'rage', cost: 30 }, cooldownMs: 25000, castMs: 200, noIas: true,
    targeting: { mode: 'self' }, delivery: { kind: 'instant' },
    selfEffects: [{ type: 'heal', pctMaxLife: 30, perRank: [30, 32, 34, 36, 45], overMs: 3000 }, { type: 'cleanse', statuses: ['poisoned', 'bleeding', 'chilled'] }],
    breakpoints: [
      { rank: 3, addSelf: [{ type: 'buff', id: 'armor_up', durMs: 6000, magnitude: 20, fixed: true }], text: '+20% armour for 6 s.' },
      { rank: 5, text: 'Heals 45%.' },
    ],
    forms: [
      { id: 'undying_rage', name: 'Undying Rage', verb: 'Brawl',
        text: 'Cooldown 16 s. Grants Hasted and War Cry (+20% damage) for 4 s along with the heal.',
        mod: (ab) => {
          ab.cooldownMs = 16000;
          ab.selfEffects = ab.selfEffects.concat([
            { type: 'buff', id: 'hasted', durMs: 4000 },
            { type: 'buff', id: 'war_cry', durMs: 4000, magnitude: 20, fixed: true },
          ]);
        } },
      { id: 'iron_skin', name: 'Iron Skin', verb: 'Shield',
        text: 'Wraps you in an immediate barrier worth 35% of your maximum life for 6 s in addition to the heal.',
        set: { windShield: 0.35 } },
    ],
    desc: 'Heal 30% of your maximum life over 3 s and remove Poison, Bleeding and Chill.',
  });
  sk({
    id: 'avalanche_leap', branch: 'iron', tier: 3, name: 'Avalanche Leap', icon: 'leap', school: 'dust',
    tags: ['mobility', 'aoe', 'physical', 'slam'],
    resource: { type: 'rage', cost: 35 }, cooldownMs: 10000, castMs: 100, noIas: true,
    targeting: { mode: 'point', range: 5, requiresLOS: false, requiresVisible: true, outOfRange: 'reject' },
    delivery: { kind: 'leap', airMs: 300 }, area: { shape: 'circle', radius: 1 },
    effects: [{ type: 'damage', source: 'weapon', mult: 2.4, canCrit: true, canDodge: false }, { type: 'knockback', dist: 1 }],
    breakpoints: [
      { rank: 3, set: { area: { shape: 'circle', radius: 2 } }, text: 'Radius 2.' },
      { rank: 5, set: { landSelf: [{ type: 'buff', id: 'braced', durMs: 2000, magnitude: 40, fixed: true }] }, text: 'Landing grants Brace for 2 s.' },
    ],
    forms: [
      { id: 'thunderous_crash', name: 'Thunderous Crash', verb: 'Stun',
        text: 'Landing strikes in radius 2 and Stuns enemies for 1.2 s instead of knocking them back.',
        mod: (ab) => {
          ab.area = { shape: 'circle', radius: 2 };
          ab.effects = [ab.effects[0], { type: 'status', id: 'stunned', durMs: 1200 }];
        } },
      { id: 'bounding_slam', name: 'Bounding Slam', verb: 'Pounce',
        text: '2 charges, 6 s cooldown and costs only 15 rage.',
        mod: (ab) => {
          ab.charges = 2;
          ab.cooldownMs = 6000;
          ab.resource = { type: 'rage', cost: 15 };
        } },
    ],
    desc: 'Leap to a tile up to 5 away, over enemies. Landing strikes radius 1 and knocks enemies back 1 tile.',
  });
  sk({
    id: 'juggernaut', branch: 'iron', tier: 4, name: 'Juggernaut', icon: 'juggernaut', passive: () => void 0, keystone: true, school: 'steel',
    desc: 'Attunement (one per hero). Immune to knockback, Chill and Slow. Taking damage generates 1 rage per 1% of maximum life lost.',
  });

  for (const id in S) if (S[id].cls === 'fighter') BD.data.stats.ensureSkillKey(id, S[id].name);
})(globalThis.BD);
