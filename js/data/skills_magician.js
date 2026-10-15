// @ts-check
// Magician — Mana, Surge & Reactions (02 §4). Spell bases are at character level 1 and scale by
// charScale(L). Special rules in sim/skills_magician.js.
(function (BD) {
  'use strict';
  const S = (BD.data.skills = BD.data.skills || {});
  /** a damage effect with its base range scaled (Forms trade damage for behaviour) */
  const dmg = (eff, k) => Object.assign({}, eff, { base: [eff.base[0] * k, eff.base[1] * k] });
  const st = (id, o) => Object.assign({ type: 'status', id, needsHit: true }, o || {});
  const sk = (o) => {
    const cues = { cast: 'skill.' + o.id + '.cast', impact: 'skill.' + o.id + '.impact' };
    S[o.id] = Object.assign({ cls: 'magician', isSpell: true, tags: [], effects: [], breakpoints: [], cues }, o);
  };

  // ---------------- Pyromancy ----------------
  sk({
    id: 'firebolt', branch: 'pyro', tier: 1, name: 'Firebolt', icon: 'firebolt', school: 'fire',
    tags: ['spell', 'projectile', 'fire', 'cantrip'], resource: { type: 'mana', cost: 3 }, cooldownMs: 0, castMs: 450,
    targeting: { mode: 'point', range: 9, requiresLOS: false, outOfRange: 'approach' }, delivery: { kind: 'projectile', projectile: 'firebolt' },
    effects: [{ type: 'damage', source: 'spell', base: [5, 9], element: 'fire', canCrit: true }, { type: 'status', id: 'burning', chance: 0.2, needsHit: true }],
    breakpoints: [
      { rank: 3, set: { delivery: { kind: 'projectile', projectile: 'firebolt', pierce: 1 } }, text: 'Pierces 1 target.' },
      { rank: 5, set: { splitOnHit: 2 }, text: 'Splits into 2 bolts on hit.' },
    ],
    forms: [
      { id: 'kindling', name: 'Kindling', verb: 'Ignite',
        text: 'Every bolt sets Burning, and your Burning lasts 4.5 s. Bolts deal 10% less damage.',
        mod: (ab) => { ab.effects = [dmg(ab.effects[0], 0.9), st('burning', { durMs: 4500 })]; } },
      { id: 'searing', name: 'Searing', verb: 'Consume',
        text: 'Bolts never ignite, but a bolt that hits a Burning enemy consumes the burn: all of its remaining damage lands at once, tripled. Bolts deal 15% more damage.',
        mod: (ab) => { ab.effects = [dmg(ab.effects[0], 1.15), { type: 'special', id: 'sear' }]; } },
    ],
    desc: 'A bolt of fire (range 9) with a 20% chance to set enemies Burning.',
  });
  sk({
    id: 'fireball', branch: 'pyro', tier: 2, name: 'Fireball', icon: 'fireball', school: 'fire',
    tags: ['spell', 'projectile', 'fire', 'aoe'], resource: { type: 'mana', cost: 16 }, cooldownMs: 0,
    targeting: { mode: 'point', range: 9, requiresLOS: false, outOfRange: 'approach' },
    delivery: { kind: 'projectile', projectile: 'fireball', stopAtTarget: true, explode: { shape: 'circle', radius: 1 } },
    effects: [{ type: 'damage', source: 'spell', base: [7, 12], element: 'fire', canCrit: true, canDodge: false }, { type: 'status', id: 'burning', needsHit: true }],
    breakpoints: [
      { rank: 3, set: { delivery: { kind: 'projectile', projectile: 'fireball', stopAtTarget: true, explode: { shape: 'circle', radius: 2 } } }, text: 'Radius 2.' },
      { rank: 5, set: { fbGround: true }, text: 'Leaves burning ground for 3 s.' },
    ],
    forms: [
      { id: 'napalm', name: 'Napalm', verb: 'Deny',
        text: 'The blast leaves burning ground for 4 s.', set: { fbGround: true, fbGroundMs: 4000 } },
      { id: 'implosion', name: 'Implosion', verb: 'Gather',
        text: 'The blast drags enemies within 3 tiles 2 tiles toward its centre and Chills them. 20% less damage.',
        mod: (ab) => {
          ab.effects = [dmg(ab.effects[0], 0.8)].concat(ab.effects.slice(1), [st('chilled')]);
          ab.implode = { radius: 3, dist: 2 };
        } },
    ],
    desc: 'Flies toward the cursor and explodes at the first enemy, wall or the cursor point: radius 1, Burning.',
  });
  sk({
    id: 'meteor', branch: 'pyro', tier: 3, name: 'Meteor', icon: 'meteor', school: 'fire',
    tags: ['spell', 'fire', 'aoe'], resource: { type: 'mana', cost: 30 }, cooldownMs: 5000,
    targeting: { mode: 'point', range: 9, requiresLOS: false, requiresVisible: false, outOfRange: 'approach' },
    delivery: { kind: 'zone', delayMs: 900 }, area: { shape: 'circle', radius: 2 }, linger: { kind: 'burning_ground', durMs: 4000 },
    effects: [{ type: 'damage', source: 'spell', base: [27, 39], element: 'fire', canCrit: true, canDodge: false }],
    breakpoints: [
      { rank: 3, set: { followers: 2 }, text: 'Two smaller meteors (50%) follow.' },
      { rank: 5, add: [{ type: 'status', id: 'stunned', durMs: 1000 }], text: 'Impact stuns for 1 s.' },
    ],
    forms: [
      { id: 'comet', name: 'Comet', verb: 'Freeze',
        text: 'A falling star of ice: it deals cold damage and Freezes for 2 s, but leaves no fire behind.',
        mod: (ab) => {
          const cold = Object.assign({}, ab.effects[0], { element: 'cold' });
          ab.effects = [cold].concat(ab.effects.slice(1), [st('frozen', { durMs: 2000 })]);
          ab.linger = null;
          ab.school = 'cold';
        } },
      { id: 'meteor_shower', replaces: [3], name: 'Meteor Shower', verb: 'Blanket',
        text: 'Five smaller meteors (45% damage each) rain across 3 tiles in quick succession, each leaving burning ground.',
        set: { shower: { count: 5, radius: 3, mult: 0.45, staggerMs: 180 } } },
    ],
    desc: 'Call a meteor onto a tile within 9: a 0.9 s marked circle, then impact in radius 2 and burning ground for 4 s.',
  });
  sk({ id: 'pyre', branch: 'pyro', tier: 4, name: 'Pyre', icon: 'pyre', keystone: true, passive: () => void 0, isSpell: false, school: 'fire',
    desc: 'Attunement (one per hero). Burning enemies that die explode for 25% of their maximum life as fire in radius 1 (capped at twice your Meteor base).' });

  // ---------------- Frost ----------------
  sk({
    id: 'ice_shard', branch: 'frost', tier: 1, name: 'Ice Shard', icon: 'ice_shard', school: 'cold',
    tags: ['spell', 'projectile', 'cold', 'cantrip'], resource: { type: 'mana', cost: 3 }, cooldownMs: 0, castMs: 450,
    targeting: { mode: 'point', range: 7, requiresLOS: false, outOfRange: 'approach' },
    delivery: { kind: 'projectile', projectile: 'ice_shard', count: 3, spread: 20, extraFromStat: true, eachLands: false },
    effects: [{ type: 'damage', source: 'spell', base: [3, 5], element: 'cold', canCrit: true }, { type: 'status', id: 'chilled', needsHit: true }],
    breakpoints: [
      { rank: 3, set: { delivery: { kind: 'projectile', projectile: 'ice_shard', count: 4, spread: 20, extraFromStat: true } }, text: '4 shards.' },
      { rank: 5, set: { delivery: { kind: 'projectile', projectile: 'ice_shard', count: 4, spread: 20, extraFromStat: true, pierce: 'all' } }, text: 'Shards pierce.' },
    ],
    forms: [
      { id: 'glacial_lance', replaces: [3, 5], name: 'Glacial Lance', verb: 'Pierce',
        text: 'One heavy lance (2.1× a shard) flies 9 tiles through everything in its path. It Freezes enemies that were already Chilled.',
        mod: (ab) => {
          ab.delivery = { kind: 'projectile', projectile: 'ice_shard', count: 1, pierce: 'all' };
          ab.targeting = Object.assign({}, ab.targeting, { range: 9 });
          ab.effects = [dmg(ab.effects[0], 2.1), { type: 'special', id: 'lance' }, st('chilled')];
        } },
      { id: 'hailstorm', replaces: [3, 5], name: 'Hailstorm', verb: 'Blast',
        text: 'Seven shards burst in a 70° fan out to 4 tiles: a frost shotgun for close quarters. 20% less damage per shard.',
        mod: (ab) => {
          ab.delivery = { kind: 'projectile', projectile: 'ice_shard', count: 7, spread: 70, extraFromStat: true, maxDist: 4 };
          ab.targeting = Object.assign({}, ab.targeting, { range: 4 });
          ab.effects = [dmg(ab.effects[0], 0.8)].concat(ab.effects.slice(1));
        } },
    ],
    desc: 'Three shards in a 20° cone (range 7) that Chill.',
  });
  sk({
    id: 'frost_nova', branch: 'frost', tier: 2, name: 'Frost Nova', icon: 'frost_nova', school: 'cold',
    tags: ['spell', 'cold', 'aoe'], resource: { type: 'mana', cost: 18 }, cooldownMs: 6000,
    targeting: { mode: 'self' }, delivery: { kind: 'instant' }, area: { shape: 'circle', radius: 2 },
    effects: [{ type: 'damage', source: 'spell', base: [9, 14], element: 'cold', canCrit: true, canDodge: false }, { type: 'status', id: 'frozen', durMs: 1500, needsHit: true }],
    breakpoints: [
      { rank: 3, set: { area: { shape: 'circle', radius: 3 } }, text: 'Radius 3.' },
      { rank: 5, add: [{ type: 'status', id: 'vulnerable', durMs: 3000, needsHit: true }], text: 'Frozen enemies are Vulnerable for 3 s.' },
    ],
    forms: [
      { id: 'deep_freeze', name: 'Deep Freeze', verb: 'Lock down',
        text: 'Frozen lasts 3 s and Frozen enemies are Vulnerable (+20% damage taken). Cooldown 9 s.',
        mod: (ab) => {
          ab.cooldownMs = 9000;
          ab.effects = [ab.effects[0], st('frozen', { durMs: 3000 }), st('vulnerable', { durMs: 3000 })];
        } },
      { id: 'ice_armour', replaces: [5], name: 'Ice Armour', verb: 'Endure',
        text: 'The nova Chills instead of freezing and wraps you in ice: a barrier worth 6% of your maximum life per enemy hit (up to 30%) for 6 s.',
        mod: (ab) => {
          ab.effects = [ab.effects[0], st('chilled')];
          ab.iceArmour = { perHit: 0.06, max: 0.3, durMs: 6000 };
        } },
    ],
    desc: 'A ring of frost around you (radius 2) that Freezes for 1.5 s.',
  });
  sk({
    id: 'blizzard', branch: 'frost', tier: 3, name: 'Blizzard', icon: 'blizzard', school: 'cold',
    tags: ['spell', 'cold', 'aoe', 'zone'], resource: { type: 'mana', cost: 28 }, cooldownMs: 4000,
    targeting: { mode: 'point', range: 9, requiresLOS: false, outOfRange: 'approach' },
    delivery: { kind: 'zone', tickMs: 500, durMs: 4000 }, area: { shape: 'circle', radius: 2 },
    effects: [{ type: 'damage', source: 'spell', base: [4, 8], element: 'cold', canCrit: true, canDodge: false }, { type: 'status', id: 'chilled', durMs: 1000, needsHit: true }],
    breakpoints: [
      { rank: 3, set: { area: { shape: 'circle', radius: 3 } }, text: 'Radius 3.' },
      { rank: 5, set: { freezeAfter: 2000 }, text: 'Enemies Chilled by Blizzard for 2 s become Frozen.' },
    ],
    forms: [
      { id: 'frozen_orb', replaces: [3], name: 'Frozen Orb', verb: 'Sweep',
        text: 'A slow orb rolls 8 tiles toward the cursor, chilling everything it passes and spraying ice shards in every direction.',
        mod: (ab) => {
          ab.delivery = { kind: 'zone', tickMs: 300, durMs: 2700 };
          ab.area = { shape: 'circle', radius: 1 };
          ab.drift = { tiles: 8 };
          ab.orbShards = 6;
        } },
      { id: 'storm_cloak', name: 'Storm Cloak', verb: 'Wade in',
        text: 'The blizzard rides with you for 5 s (radius 2): walk it through the pack. Cast on yourself.',
        mod: (ab) => {
          ab.targeting = { mode: 'self' };
          ab.delivery = Object.assign({}, ab.delivery, { durMs: 5000 });
          ab.follow = 'self';
        } },
    ],
    desc: 'A storm on a tile for 4 s: every 0.5 s it deals cold damage in radius 2 and Chills.',
  });
  sk({ id: 'shatter', branch: 'frost', tier: 4, name: 'Shatter', icon: 'shatter', keystone: true, passive: () => void 0, isSpell: false, school: 'cold',
    desc: 'Attunement (one per hero). Frozen enemies that die shatter into 6 shards dealing 30% of the killing blow to nearby enemies.' });

  // ---------------- Storm ----------------
  sk({
    id: 'spark', branch: 'storm', tier: 1, name: 'Spark', icon: 'spark', school: 'storm',
    tags: ['spell', 'projectile', 'lightning', 'cantrip'], resource: { type: 'mana', cost: 3 }, cooldownMs: 0, castMs: 450,
    targeting: { mode: 'point', range: 6, requiresLOS: false, outOfRange: 'approach' },
    delivery: { kind: 'projectile', projectile: 'spark', count: 3, spread: 30, extraFromStat: true, maxDist: 6 },
    effects: [{ type: 'damage', source: 'spell', base: [2, 6], element: 'light', canCrit: true }, { type: 'status', id: 'shocked', chance: 0.1, needsHit: true }],
    breakpoints: [
      { rank: 3, set: { delivery: { kind: 'projectile', projectile: 'spark', count: 4, spread: 30, extraFromStat: true, maxDist: 6 } }, text: '4 sparks.' },
      { rank: 5, set: { sparkChain: true }, text: 'Sparks chain once.' },
    ],
    forms: [
      { id: 'arc_lash', replaces: [3, 5], name: 'Arc Lash', verb: 'Whip',
        text: 'A lash of lightning cracks through a 3-tile cone in front of you, with a 30% chance to Shock.',
        mod: (ab) => {
          ab.targeting = { mode: 'point', range: 3, requiresLOS: false, outOfRange: 'approach' };
          ab.delivery = { kind: 'melee' };
          ab.area = { shape: 'cone', length: 3, angle: 90 };
          ab.effects = [Object.assign({}, ab.effects[0], { base: [5, 10] }), st('shocked', { chance: 0.3 })];
          ab.arcLash = true;
        } },
      { id: 'conduit', name: 'Conduit', verb: 'Recharge',
        text: 'Each spark that hits restores 1 mana. Sparks deal 20% less damage.',
        mod: (ab) => { ab.effects = [dmg(ab.effects[0], 0.8)].concat(ab.effects.slice(1), [{ type: 'special', id: 'conduit' }]); } },
    ],
    desc: 'Three sparks crawl erratically along the floor up to 6 tiles, with a 10% chance to Shock.',
  });
  sk({
    id: 'teleport', branch: 'storm', tier: 2, name: 'Teleport', icon: 'teleport', school: 'storm',
    tags: ['spell', 'mobility'], resource: { type: 'mana', cost: 15 }, cooldownMs: 5000, charges: 2, castMs: 150, noIas: true,
    targeting: { mode: 'point', range: 8, requiresLOS: false, requiresVisible: true, outOfRange: 'reject' }, delivery: { kind: 'blink' },
    breakpoints: [
      { rank: 3, set: {
        area: { shape: 'circle', radius: 1 },
        effects: [{ type: 'damage', source: 'spell', base: [8, 12], element: 'light', canCrit: true, canDodge: false }],
      }, text: 'An arrival nova (radius 1) deals lightning damage.' },
      { rank: 5, set: { charges: 3 }, text: '3 charges.' },
    ],
    forms: [
      { id: 'flicker', replaces: [3, 5], name: 'Flicker', verb: 'Dance',
        text: '4 charges that recharge in 2.5 s at half the mana, and a burst of speed (Hasted 2 s) on arrival. No arrival nova.',
        mod: (ab) => {
          ab.charges = 4;
          ab.cooldownMs = 2500;
          ab.resource = Object.assign({}, ab.resource, { cost: ab.resource.cost / 2 });
          ab.area = null;
          ab.effects = [];
          ab.selfEffects = [{ type: 'buff', id: 'hasted', durMs: 2000 }];
        } },
      { id: 'thunderstep', replaces: [3], name: 'Thunderstep', verb: 'Strike',
        text: 'Arrive in thunder: a nova (radius 2) deals lightning damage and Shocks everything around you.',
        mod: (ab) => {
          ab.area = { shape: 'circle', radius: 2 };
          ab.effects = [{ type: 'damage', source: 'spell', base: [10, 16], element: 'light', canCrit: true, canDodge: false }, st('shocked')];
        } },
    ],
    desc: 'Blink to a visible, explored floor tile within 8. 2 charges, 5 s each.',
  });
  sk({
    id: 'chain_lightning', branch: 'storm', tier: 3, name: 'Chain Lightning', icon: 'chain_lightning', school: 'storm',
    tags: ['spell', 'lightning', 'chain'], resource: { type: 'mana', cost: 20 }, cooldownMs: 0,
    targeting: { mode: 'unit', range: 8, requiresLOS: true, outOfRange: 'approach' }, delivery: { kind: 'chain', jumps: 4, jumpRange: 3, falloff: 0.1 },
    effects: [
      { type: 'damage', source: 'spell', base: [10, 26], element: 'light', canCrit: true, canDodge: false },
      { type: 'status', id: 'shocked', chance: 0.3, needsHit: true },
    ],
    breakpoints: [
      { rank: 3, set: { delivery: { kind: 'chain', jumps: 6, jumpRange: 3, falloff: 0.1 } }, text: '6 jumps.' },
      { rank: 5, set: { effects: [
        { type: 'damage', source: 'spell', base: [10, 26], element: 'light', canCrit: true, canDodge: false },
        { type: 'status', id: 'shocked', needsHit: true },
      ] }, text: 'Every jump Shocks.' },
    ],
    forms: [
      { id: 'prismatic_arc', name: 'Prismatic Arc', verb: 'React',
        text: 'The bolt changes element on every jump (fire, cold, lightning) and every jump applies its status, '
          + 'so one cast sets up Reactions for the next. Every Reaction you set off restores 3 mana.',
        mod: (ab) => {
          const e = ab.effects[0];
          ab.jumpCycle = [
            [Object.assign({}, e, { element: 'fire' }), st('burning')],
            [Object.assign({}, e, { element: 'cold' }), st('chilled')],
            [Object.assign({}, e, { element: 'light' }), st('shocked')],
          ];
        } },
      { id: 'thunderhead', replaces: [3, 5], name: 'Thunderhead', verb: 'Haunt',
        text: 'A storm cloud locks onto the target for 5 s, striking everything beneath it (radius 1) every 0.5 s with a 50% chance to Shock. Cooldown 2.5 s.',
        mod: (ab) => {
          ab.delivery = { kind: 'zone', tickMs: 500, durMs: 5000 };
          ab.area = { shape: 'circle', radius: 1 };
          ab.follow = true;
          ab.cooldownMs = 2500;
          ab.effects = [dmg(ab.effects[0], 0.3), st('shocked', { chance: 0.5 })];
        } },
    ],
    desc: 'A bolt to a target that jumps to 4 more enemies within 3 tiles, −10% per jump, with a 30% chance to Shock.',
  });
  sk({ id: 'energy_shield', branch: 'storm', tier: 4, name: 'Energy Shield', icon: 'energy_shield', keystone: true, passive: () => void 0, isSpell: false, school: 'storm',
    desc: 'Attunement (one per hero). 40% of damage taken is drained from mana instead (1 mana per 1 life). Surge regenerates ×4.',
    params: { absorb: 0.4, surgeMult: 4 } });

  for (const id in S) if (S[id].cls === 'magician') BD.data.stats.ensureSkillKey(id, S[id].name);
})(globalThis.BD);
