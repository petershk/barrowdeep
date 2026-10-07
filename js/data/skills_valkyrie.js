// @ts-check
// Valkyrie — Focus (02 §5). Special rules in sim/skills_valkyrie.js.
(function (BD) {
  'use strict';
  const S = (BD.data.skills = BD.data.skills || {});
  const sk = (o) => { S[o.id] = Object.assign({ cls: 'valkyrie', tags: [], effects: [], breakpoints: [], cues: { cast: 'skill.' + o.id + '.cast', impact: 'skill.' + o.id + '.impact' } }, o); };
  const arrow = (o) => Object.assign({ kind: 'projectile', projectile: 'arrow' }, o);

  // ---------------- Marksman ----------------
  sk({
    id: 'aimed_shot', branch: 'marksman', tier: 1, name: 'Aimed Shot', icon: 'aimed_shot', school: 'holy',
    tags: ['projectile', 'spender', 'physical'], resource: { type: 'focus', cost: 'all' }, cooldownMs: 0, castMs: 300, cancelOnMove: true, onCommit: true,
    targeting: { mode: 'point', range: 10, requiresLOS: false, outOfRange: 'approach' }, delivery: arrow({ maxDist: 12 }),
    effects: [{ type: 'damage', source: 'weapon', mult: 1.75, perFocus: 0.3, canCrit: true }],
    breakpoints: [
      { rank: 3, set: { pierceAt5: true }, text: 'At 5 focus, the arrow pierces every enemy.' },
      { rank: 5, set: { extraAt5: 2 }, text: 'At 5 focus, 2 more arrows fly at nearby enemies.' },
    ],
    desc: 'Draw for 0.3 s (moving cancels it, free) and loose an arrow for 1.6× + 0.3× per focus. Spends all focus.',
  });
  sk({
    id: 'piercing_shot', branch: 'marksman', tier: 2, name: 'Piercing Shot', icon: 'piercing_shot', school: 'steel',
    tags: ['projectile', 'physical', 'line'], resource: { type: 'focus', cost: 0 }, cooldownMs: 3000,
    targeting: { mode: 'point', range: 10, requiresLOS: false, outOfRange: 'approach' }, delivery: arrow({ pierce: 'all', maxDist: 10 }),
    effects: [{ type: 'damage', source: 'weapon', mult: 1.3, canCrit: true }],
    breakpoints: [
      { rank: 3, add: [{ type: 'status', id: 'bleeding', needsHit: true }], text: 'Applies Bleeding.' },
      { rank: 5, set: { twin: true }, text: 'Two parallel arrows.' },
    ],
    desc: 'An arrow that pierces every enemy in a line up to 10 tiles. Consumes up to 2 focus for +25% each.',
  });
  sk({
    id: 'rain_of_arrows', branch: 'marksman', tier: 3, name: 'Rain of Arrows', icon: 'rain_of_arrows', school: 'steel',
    tags: ['aoe', 'zone', 'physical'], resource: { type: 'focus', cost: 'all' }, cooldownMs: 8000,
    targeting: { mode: 'point', range: 10, requiresLOS: false, outOfRange: 'approach' }, delivery: { kind: 'zone', tickMs: 500, durMs: 2500 }, area: { shape: 'circle', radius: 2 },
    effects: [{ type: 'damage', source: 'weapon', mult: 0.5, perFocusPct: 0.1, canCrit: true, canDodge: false }],
    breakpoints: [
      { rank: 3, set: { area: { shape: 'circle', radius: 3 } }, text: 'Radius 3.' },
      { rank: 5, set: { follow: 'target' }, text: 'The volley follows your locked target.' },
    ],
    desc: 'Five volleys over 2.5 s in radius 2, 0.5× each, +10% per focus spent.',
  });
  sk({ id: 'deadeye', branch: 'marksman', tier: 4, name: 'Deadeye', icon: 'deadeye', keystone: true, passive: () => void 0, school: 'holy',
    desc: 'Aimed Shot at 5 focus always crits and consumes only 3 focus.' });

  // ---------------- Skirmish ----------------
  sk({
    id: 'multishot', branch: 'skirmish', tier: 1, name: 'Multishot', icon: 'multishot', school: 'steel',
    tags: ['projectile', 'builder', 'physical'], resource: { type: 'focus', cost: 0 }, cooldownMs: 0, usesAttackSpeed: true,
    targeting: { mode: 'point', range: 8, requiresLOS: false, outOfRange: 'approach' }, delivery: arrow({ count: 5, spread: 50, extraFromStat: true }),
    effects: [{ type: 'damage', source: 'weapon', mult: 1.05, canCrit: true }],
    breakpoints: [
      { rank: 3, set: { delivery: arrow({ count: 7, spread: 50, extraFromStat: true }) }, text: '7 arrows.' },
      { rank: 5, set: { ricochet: 1 }, text: 'Arrows ricochet once.' },
    ],
    desc: 'Five arrows in a 50° cone, 1.05× each. +1 focus if three or more hit.',
  });
  sk({
    id: 'vault', branch: 'skirmish', tier: 2, name: 'Vault', icon: 'vault', school: 'dust',
    tags: ['mobility'], resource: { type: 'focus', cost: 0 }, cooldownMs: 6000, castMs: 80, noIas: true,
    targeting: { mode: 'point', range: 30, requiresLOS: false, outOfRange: 'approach' }, delivery: { kind: 'instant' },
    breakpoints: [
      { rank: 3, set: { cooldownMs: 4500 }, text: 'Cooldown 4.5 s.' },
      { rank: 5, set: { primeAimed: true }, text: 'Your next Aimed Shot within 3 s counts as 5 focus.' },
    ],
    desc: 'Backflip 4 tiles away from the cursor, leaving caltrops where you stood (Slowed 50%, Bleeding). +2 focus.',
  });
  sk({
    id: 'pinning_shot', branch: 'skirmish', tier: 3, name: 'Pinning Shot', icon: 'pinning_shot', school: 'poison',
    tags: ['projectile', 'control', 'physical'], resource: { type: 'focus', cost: 1 }, cooldownMs: 7000,
    targeting: { mode: 'point', range: 9, requiresLOS: false, outOfRange: 'approach' }, delivery: arrow({}),
    effects: [{ type: 'damage', source: 'weapon', mult: 2.0, canCrit: true }, { type: 'status', id: 'rooted', durMs: 2500, needsHit: true }],
    breakpoints: [
      { rank: 3, set: { pinChain: 2 }, text: 'Chains to 2 nearby enemies.' },
      { rank: 5, set: { pinVuln: true }, text: 'Rooted enemies are Vulnerable.' },
    ],
    desc: 'A 2.0× arrow that Roots for 2.5 s (bosses are Slowed 40%). Enemies within 2 of the target are Feared for 1.5 s.',
  });
  sk({ id: 'wind_dancer', branch: 'skirmish', tier: 4, name: 'Wind Dancer', icon: 'wind_dancer', keystone: true, passive: (r, add) => add('evade_cd_ms', 1000, 'Wind Dancer'), school: 'storm',
    desc: 'Evade grants 3 focus and resets Vault. Evade cooldown −1 s.' });

  // ---------------- Valor ----------------
  sk({
    id: 'javelin', branch: 'valor', tier: 1, name: 'Javelin', icon: 'javelin', school: 'holy',
    tags: ['projectile', 'builder', 'physical'], resource: { type: 'focus', cost: 0 }, cooldownMs: 2000,
    targeting: { mode: 'point', range: 9, requiresLOS: false, outOfRange: 'approach' }, delivery: { kind: 'projectile', projectile: 'javelin', pierce: 2, eachLands: true },
    effects: [{ type: 'damage', source: 'weapon', mult: 1.4, canCrit: true }],
    breakpoints: [
      { rank: 3, set: { delivery: { kind: 'projectile', projectile: 'javelin', pierce: 'all', eachLands: true } }, text: 'Pierces every enemy.' },
      { rank: 5, set: { returns: true }, text: 'Returns to you, hitting again.' },
    ],
    desc: 'Hurl a spectral javelin for 1.4× that pierces 2 enemies. +1 focus per enemy hit (up to 2).',
  });
  sk({
    id: 'valkyries_call', branch: 'valor', tier: 2, name: "Valkyrie's Call", icon: 'valkyries_call', school: 'holy',
    tags: ['summon'], resource: { type: 'focus', cost: 0 }, cooldownMs: 30000, castMs: 300, noIas: true,
    targeting: { mode: 'self' }, delivery: { kind: 'summon' }, spiritMult: 0.8, spiritMs: 20000,
    breakpoints: [
      { rank: 3, set: { spiritMs: 30000 }, text: 'Lasts 30 s.' },
      { rank: 5, set: { spiritThrows: true }, text: 'She also throws Javelins.' },
    ],
    desc: 'Summon a spectral Valkyrie for 20 s: her spear strikes at 0.8× your weapon hit. Enemies target her half of the time.',
  });
  sk({
    id: 'sky_spear', branch: 'valor', tier: 3, name: 'Sky Spear', icon: 'sky_spear', school: 'storm',
    tags: ['aoe', 'lightning', 'spender'], resource: { type: 'focus', cost: 'all' }, cooldownMs: 10000,
    targeting: { mode: 'point', range: 9, requiresLOS: false, outOfRange: 'approach' }, delivery: { kind: 'zone', delayMs: 600 }, area: { shape: 'circle', radius: 1 },
    effects: [{ type: 'damage', source: 'weapon', mult: 4.0, perFocusPct: 0.15, convert: { light: 0.5 }, canCrit: true, canDodge: false }, { type: 'status', id: 'stunned', durMs: 1000, needsHit: true }],
    breakpoints: [
      { rank: 3, set: { area: { shape: 'circle', radius: 2 } }, text: 'Radius 2.' },
      { rank: 5, set: { spears: 3 }, text: 'Three spears fall in a line.' },
    ],
    desc: 'Mark a tile within 9: 0.6 s later a spear strikes radius 1 for 4.0× (half lightning) and stuns 1 s. +15% per focus spent.',
  });
  sk({ id: 'shieldmaidens_oath', branch: 'valor', tier: 4, name: "Shieldmaiden's Oath", icon: 'shieldmaidens_oath', keystone: true, passive: () => void 0, school: 'holy',
    desc: "While your Valkyrie fights beside you, you deal +25% damage and take 20% less. Valkyrie's Call cooldown 20 s." });

  for (const id in S) if (S[id].cls === 'valkyrie') BD.data.stats.ensureSkillKey(id, S[id].name);
})(globalThis.BD);
