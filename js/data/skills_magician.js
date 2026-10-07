// @ts-check
// Magician — Mana, Surge & Reactions (02 §4). Spell bases are at character level 1 and scale by
// charScale(L). Special rules in sim/skills_magician.js.
(function (BD) {
  'use strict';
  const S = (BD.data.skills = BD.data.skills || {});
  const sk = (o) => { S[o.id] = Object.assign({ cls: 'magician', isSpell: true, tags: [], effects: [], breakpoints: [], cues: { cast: 'skill.' + o.id + '.cast', impact: 'skill.' + o.id + '.impact' } }, o); };

  // ---------------- Pyromancy ----------------
  sk({
    id: 'firebolt', branch: 'pyro', tier: 1, name: 'Firebolt', icon: 'firebolt', school: 'fire',
    tags: ['spell', 'projectile', 'fire', 'cantrip'], resource: { type: 'mana', cost: 0 }, cooldownMs: 0, castMs: 350,
    targeting: { mode: 'point', range: 9, requiresLOS: false, outOfRange: 'approach' }, delivery: { kind: 'projectile', projectile: 'firebolt' },
    effects: [{ type: 'damage', source: 'spell', base: [3, 6], element: 'fire', canCrit: true }, { type: 'status', id: 'burning', chance: 0.2, needsHit: true }],
    breakpoints: [
      { rank: 3, set: { delivery: { kind: 'projectile', projectile: 'firebolt', pierce: 1 } }, text: 'Pierces 1 target.' },
      { rank: 5, set: { splitOnHit: 2 }, text: 'Splits into 2 bolts on hit.' },
    ],
    desc: 'A free bolt of fire (range 9) with a 20% chance to set enemies Burning. Does not break Surge.',
  });
  sk({
    id: 'fireball', branch: 'pyro', tier: 2, name: 'Fireball', icon: 'fireball', school: 'fire',
    tags: ['spell', 'projectile', 'fire', 'aoe'], resource: { type: 'mana', cost: 14 }, cooldownMs: 0,
    targeting: { mode: 'point', range: 9, requiresLOS: false, outOfRange: 'approach' },
    delivery: { kind: 'projectile', projectile: 'fireball', stopAtTarget: true, explode: { shape: 'circle', radius: 1 } },
    effects: [{ type: 'damage', source: 'spell', base: [8, 12], element: 'fire', canCrit: true, canDodge: false }, { type: 'status', id: 'burning', needsHit: true }],
    breakpoints: [
      { rank: 3, set: { delivery: { kind: 'projectile', projectile: 'fireball', stopAtTarget: true, explode: { shape: 'circle', radius: 2 } } }, text: 'Radius 2.' },
      { rank: 5, set: { fbGround: true }, text: 'Leaves burning ground for 3 s.' },
    ],
    desc: 'Flies toward the cursor and explodes at the first enemy, wall or the cursor point: radius 1, Burning.',
  });
  sk({
    id: 'meteor', branch: 'pyro', tier: 3, name: 'Meteor', icon: 'meteor', school: 'fire',
    tags: ['spell', 'fire', 'aoe'], resource: { type: 'mana', cost: 30 }, cooldownMs: 5000,
    targeting: { mode: 'point', range: 9, requiresLOS: false, requiresVisible: false, outOfRange: 'approach' },
    delivery: { kind: 'zone', delayMs: 900 }, area: { shape: 'circle', radius: 2 }, linger: { kind: 'burning_ground', durMs: 4000 },
    effects: [{ type: 'damage', source: 'spell', base: [18, 26], element: 'fire', canCrit: true, canDodge: false }],
    breakpoints: [
      { rank: 3, set: { followers: 2 }, text: 'Two smaller meteors (50%) follow.' },
      { rank: 5, add: [{ type: 'status', id: 'stunned', durMs: 1000 }], text: 'Impact stuns for 1 s.' },
    ],
    desc: 'Call a meteor onto a tile within 9: a 0.9 s marked circle, then impact in radius 2 and burning ground for 4 s.',
  });
  sk({ id: 'pyre', branch: 'pyro', tier: 4, name: 'Pyre', icon: 'pyre', keystone: true, passive: () => void 0, isSpell: false, school: 'fire',
    desc: 'Burning enemies that die explode for 25% of their maximum life as fire in radius 1 (capped at twice your Meteor base).' });

  // ---------------- Frost ----------------
  sk({
    id: 'ice_shard', branch: 'frost', tier: 1, name: 'Ice Shard', icon: 'ice_shard', school: 'cold',
    tags: ['spell', 'projectile', 'cold', 'cantrip'], resource: { type: 'mana', cost: 0 }, cooldownMs: 0, castMs: 350,
    targeting: { mode: 'point', range: 7, requiresLOS: false, outOfRange: 'approach' },
    delivery: { kind: 'projectile', projectile: 'ice_shard', count: 3, spread: 20, extraFromStat: true, eachLands: false },
    effects: [{ type: 'damage', source: 'spell', base: [2, 3], element: 'cold', canCrit: true }, { type: 'status', id: 'chilled', needsHit: true }],
    breakpoints: [
      { rank: 3, set: { delivery: { kind: 'projectile', projectile: 'ice_shard', count: 4, spread: 20, extraFromStat: true } }, text: '4 shards.' },
      { rank: 5, set: { delivery: { kind: 'projectile', projectile: 'ice_shard', count: 4, spread: 20, extraFromStat: true, pierce: 'all' } }, text: 'Shards pierce.' },
    ],
    desc: 'Three free shards in a 20° cone (range 7) that Chill.',
  });
  sk({
    id: 'frost_nova', branch: 'frost', tier: 2, name: 'Frost Nova', icon: 'frost_nova', school: 'cold',
    tags: ['spell', 'cold', 'aoe'], resource: { type: 'mana', cost: 18 }, cooldownMs: 6000,
    targeting: { mode: 'self' }, delivery: { kind: 'instant' }, area: { shape: 'circle', radius: 2 },
    effects: [{ type: 'damage', source: 'spell', base: [5, 8], element: 'cold', canCrit: true, canDodge: false }, { type: 'status', id: 'frozen', durMs: 1500, needsHit: true }],
    breakpoints: [
      { rank: 3, set: { area: { shape: 'circle', radius: 3 } }, text: 'Radius 3.' },
      { rank: 5, add: [{ type: 'status', id: 'vulnerable', durMs: 3000, needsHit: true }], text: 'Frozen enemies are Vulnerable for 3 s.' },
    ],
    desc: 'A ring of frost around you (radius 2) that Freezes for 1.5 s.',
  });
  sk({
    id: 'blizzard', branch: 'frost', tier: 3, name: 'Blizzard', icon: 'blizzard', school: 'cold',
    tags: ['spell', 'cold', 'aoe', 'zone'], resource: { type: 'mana', cost: 28 }, cooldownMs: 4000,
    targeting: { mode: 'point', range: 9, requiresLOS: false, outOfRange: 'approach' },
    delivery: { kind: 'zone', tickMs: 500, durMs: 4000 }, area: { shape: 'circle', radius: 2 },
    effects: [{ type: 'damage', source: 'spell', base: [3, 5], element: 'cold', canCrit: true, canDodge: false }, { type: 'status', id: 'chilled', durMs: 1000, needsHit: true }],
    breakpoints: [
      { rank: 3, set: { area: { shape: 'circle', radius: 3 } }, text: 'Radius 3.' },
      { rank: 5, set: { freezeAfter: 2000 }, text: 'Enemies Chilled by Blizzard for 2 s become Frozen.' },
    ],
    desc: 'A storm on a tile for 4 s: every 0.5 s it deals cold damage in radius 2 and Chills.',
  });
  sk({ id: 'shatter', branch: 'frost', tier: 4, name: 'Shatter', icon: 'shatter', keystone: true, passive: () => void 0, isSpell: false, school: 'cold',
    desc: 'Frozen enemies that die shatter into 6 shards dealing 30% of the killing blow to nearby enemies.' });

  // ---------------- Storm ----------------
  sk({
    id: 'spark', branch: 'storm', tier: 1, name: 'Spark', icon: 'spark', school: 'storm',
    tags: ['spell', 'projectile', 'lightning', 'cantrip'], resource: { type: 'mana', cost: 0 }, cooldownMs: 0, castMs: 350,
    targeting: { mode: 'point', range: 6, requiresLOS: false, outOfRange: 'approach' },
    delivery: { kind: 'projectile', projectile: 'spark', count: 3, spread: 30, extraFromStat: true, maxDist: 6 },
    effects: [{ type: 'damage', source: 'spell', base: [1, 3], element: 'light', canCrit: true }, { type: 'status', id: 'shocked', chance: 0.1, needsHit: true }],
    breakpoints: [
      { rank: 3, set: { delivery: { kind: 'projectile', projectile: 'spark', count: 4, spread: 30, extraFromStat: true, maxDist: 6 } }, text: '4 sparks.' },
      { rank: 5, set: { sparkChain: true }, text: 'Sparks chain once.' },
    ],
    desc: 'Three free sparks crawl erratically along the floor up to 6 tiles, with a 10% chance to Shock.',
  });
  sk({
    id: 'teleport', branch: 'storm', tier: 2, name: 'Teleport', icon: 'teleport', school: 'storm',
    tags: ['spell', 'mobility'], resource: { type: 'mana', cost: 15 }, cooldownMs: 5000, charges: 2, castMs: 150, noIas: true,
    targeting: { mode: 'point', range: 8, requiresLOS: false, requiresVisible: true, outOfRange: 'reject' }, delivery: { kind: 'blink' },
    breakpoints: [
      { rank: 3, set: { area: { shape: 'circle', radius: 1 }, effects: [{ type: 'damage', source: 'spell', base: [5, 8], element: 'light', canCrit: true, canDodge: false }] }, text: 'An arrival nova (radius 1) deals lightning damage.' },
      { rank: 5, set: { charges: 3 }, text: '3 charges.' },
    ],
    desc: 'Blink to a visible, explored floor tile within 8. 2 charges, 5 s each.',
  });
  sk({
    id: 'chain_lightning', branch: 'storm', tier: 3, name: 'Chain Lightning', icon: 'chain_lightning', school: 'storm',
    tags: ['spell', 'lightning', 'chain'], resource: { type: 'mana', cost: 20 }, cooldownMs: 0,
    targeting: { mode: 'unit', range: 8, requiresLOS: true, outOfRange: 'approach' }, delivery: { kind: 'chain', jumps: 4, jumpRange: 3, falloff: 0.1 },
    effects: [{ type: 'damage', source: 'spell', base: [7, 17], element: 'light', canCrit: true, canDodge: false }, { type: 'status', id: 'shocked', chance: 0.3, needsHit: true }],
    breakpoints: [
      { rank: 3, set: { delivery: { kind: 'chain', jumps: 6, jumpRange: 3, falloff: 0.1 } }, text: '6 jumps.' },
      { rank: 5, set: { effects: [{ type: 'damage', source: 'spell', base: [7, 17], element: 'light', canCrit: true, canDodge: false }, { type: 'status', id: 'shocked', needsHit: true }] }, text: 'Every jump Shocks.' },
    ],
    desc: 'A bolt to a target that jumps to 4 more enemies within 3 tiles, −10% per jump, with a 30% chance to Shock.',
  });
  sk({ id: 'energy_shield', branch: 'storm', tier: 4, name: 'Energy Shield', icon: 'energy_shield', keystone: true, passive: () => void 0, isSpell: false, school: 'storm',
    desc: '40% of damage taken is drained from mana instead (1 mana per 1 life). Surge regenerates ×4.' });

  for (const id in S) if (S[id].cls === 'magician') BD.data.stats.ensureSkillKey(id, S[id].name);
})(globalThis.BD);
