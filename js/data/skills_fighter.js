// @ts-check
// Fighter — Rage (02 §2). Data interpreted by the ability engine; special rules in sim/skills_fighter.js.
(function (BD) {
  'use strict';
  const S = (BD.data.skills = BD.data.skills || {});
  const sk = (o) => {
    const cues = { cast: 'skill.' + o.id + '.cast', impact: 'skill.' + o.id + '.impact' };
    S[o.id] = Object.assign({ cls: 'fighter', tags: [], effects: [], breakpoints: [], cues }, o);
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
    desc: 'A savage blow against one enemy. Deals +1% damage per 1% of the target\'s missing life (up to +50%).',
  });
  sk({
    id: 'bloodlust', branch: 'brawn', tier: 4, name: 'Bloodlust', icon: 'bloodlust', passive: (r, add) => void 0, keystone: true, school: 'blood',
    desc: 'Rage no longer decays. While above 80 rage you lose 1% of your maximum life per second. Berserk Strike heals 5% of your maximum life.',
    params: { rageThreshold: 80, drainPct: 0.01, healPct: 0.05 },   // drain never kills
  });

  // ---------------- Onslaught ----------------
  sk({
    id: 'charge', branch: 'onslaught', tier: 1, name: 'Charge', icon: 'charge', school: 'steel',
    tags: ['melee', 'mobility', 'physical'],
    resource: { type: 'rage', cost: 20 }, cooldownMs: 6000, castMs: 120, noIas: true,
    targeting: { mode: 'unit', range: 6, requiresLOS: true, outOfRange: 'reject' },
    delivery: { kind: 'dash' },
    effects: [{ type: 'damage', source: 'weapon', mult: 1.25, canCrit: true, canDodge: false }, { type: 'status', id: 'stunned', durMs: 600 }],
    breakpoints: [
      { rank: 3, set: { pathHits: 0.5 }, text: 'Enemies along the path are knocked aside and take 0.5× damage.' },
      { rank: 5, set: { killResets: true }, text: 'A kill resets the cooldown.' },
    ],
    desc: 'Dash up to 6 tiles to an enemy, strike it and stun it for 0.6 s.',
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
    desc: 'After a 0.3 s wind-up, a shockwave in radius 2 strikes and stuns for 1 s. You cannot be knocked back while winding up.',
  });
  sk({
    id: 'warlord', branch: 'onslaught', tier: 4, name: 'Warlord', icon: 'warlord', passive: () => void 0, keystone: true, school: 'blood',
    desc: 'War Cry heals 8% of your maximum life per enemy affected (up to 40%), and its cooldown becomes 8 s.',
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
    desc: 'Leap to a tile up to 5 away, over enemies. Landing strikes radius 1 and knocks enemies back 1 tile.',
  });
  sk({
    id: 'juggernaut', branch: 'iron', tier: 4, name: 'Juggernaut', icon: 'juggernaut', passive: () => void 0, keystone: true, school: 'steel',
    desc: 'Immune to knockback, Chill and Slow. Taking damage generates 1 rage per 1% of maximum life lost.',
  });

  for (const id in S) if (S[id].cls === 'fighter') BD.data.stats.ensureSkillKey(id, S[id].name);
})(globalThis.BD);
