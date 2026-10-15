// @ts-check
// Bot builds: whole-run plans that pick Forms and an Attunement, for comparing builds of one class
// (`node tools/bot.js magician <seed> 13 180 penitent <build>`). Each build is a skill plan (the k-th
// mention of a skill raises it to rank k), the Forms it takes, its bar, and a cast priority list: the
// first entry whose test passes and whose skill can be cast is used. No build means the class default.
(function (BD) {
  'use strict';

  BD.debug = BD.debug || {};
  const near2 = (c) => c.close >= 2;
  const pack = (n) => (c) => c.near.length >= n;
  const mana = (n) => (c) => c.mana >= n;
  const both = (...fs) => (c) => fs.every((f) => f(c));
  const either = (...fs) => (c) => fs.some((f) => f(c));
  const elite = (c) => c.t.rank && c.t.rank !== 'normal' && c.t.rank !== 'minion';
  const always = () => true;

  const BUILDS = {
    // Pyromancer: ignite everything, blanket it in fire, let Pyre chain the deaths
    inferno: {
      plan: ['firebolt', 'firebolt', 'firebolt', 'fireball', 'fireball', 'teleport', 'fireball', 'meteor', 'meteor', 'fireball',
        'meteor', 'meteor', 'pyre', 'meteor', 'fireball', 'firebolt', 'firebolt', 'teleport', 'teleport', 'frost_nova', 'frost_nova',
        'frost_nova', 'spark', 'ice_shard', 'blizzard', 'blizzard', 'frost_nova', 'teleport', 'teleport', 'blizzard'],
      forms: { firebolt: 'kindling', fireball: 'napalm', meteor: 'meteor_shower', teleport: 'flicker', frost_nova: 'deep_freeze' },
      bar: { rmb: 'firebolt', s1: 'fireball', s2: 'meteor', s3: 'frost_nova', s4: 'teleport' },
      rot: [
        ['s3', near2],
        ['s2', both(either(pack(2), elite), mana(30))],
        ['s1', mana(24)],
        ['rmb', always],
      ],
    },
    // Cryomancer: chill, freeze, shatter; Comet borrowed from the fire tree
    cryo: {
      plan: ['ice_shard', 'ice_shard', 'ice_shard', 'frost_nova', 'frost_nova', 'ice_shard', 'frost_nova', 'blizzard', 'blizzard',
        'blizzard', 'ice_shard', 'blizzard', 'shatter', 'blizzard', 'meteor', 'frost_nova', 'frost_nova', 'meteor', 'meteor', 'meteor',
        'meteor', 'teleport', 'teleport', 'teleport', 'fireball', 'firebolt', 'spark', 'teleport', 'teleport', 'fireball'],
      forms: { ice_shard: 'glacial_lance', frost_nova: 'deep_freeze', blizzard: 'frozen_orb', meteor: 'comet', teleport: 'flicker' },
      bar: { rmb: 'ice_shard', s1: 'blizzard', s2: 'meteor', s3: 'frost_nova', s4: 'teleport' },
      rot: [
        ['s3', near2],
        ['s2', both(either(pack(2), elite), mana(30))],
        ['s1', mana(28)],
        ['rmb', always],
      ],
    },
    // Battlemage: wear the storm, blink into the pack, lash and shield
    battlemage: {
      plan: ['spark', 'spark', 'spark', 'frost_nova', 'teleport', 'frost_nova', 'spark', 'blizzard', 'blizzard', 'frost_nova',
        'blizzard', 'chain_lightning', 'energy_shield', 'blizzard', 'blizzard', 'frost_nova', 'frost_nova', 'teleport', 'teleport',
        'teleport', 'teleport', 'spark', 'ice_shard', 'ice_shard', 'ice_shard', 'chain_lightning', 'chain_lightning', 'ice_shard',
        'ice_shard', 'chain_lightning'],
      forms: { spark: 'arc_lash', frost_nova: 'ice_armour', blizzard: 'storm_cloak', teleport: 'thunderstep', ice_shard: 'hailstorm' },
      bar: { rmb: 'spark', s1: 'blizzard', s2: 'teleport', s3: 'frost_nova', s4: 'ice_shard' },
      melee: true,
      rot: [
        ['s1', (c) => c.within3 >= 1 && !c.cloak, 'self'],
        ['s3', (c) => c.close >= 1 && !c.shielded, 'self'],
        ['s2', (c) => c.dist >= 3],
        ['s4', (c) => c.close >= 2],
        ['rmb', always],
      ],
    },
    // Stormcaller: clouds do the work while Flicker keeps you out of reach; Conduit pays for it
    storm: {
      plan: ['spark', 'spark', 'spark', 'teleport', 'teleport', 'frost_nova', 'spark', 'chain_lightning', 'chain_lightning',
        'teleport', 'chain_lightning', 'chain_lightning', 'energy_shield', 'chain_lightning', 'blizzard', 'blizzard', 'blizzard',
        'blizzard', 'blizzard', 'frost_nova', 'frost_nova', 'teleport', 'teleport', 'spark', 'frost_nova', 'frost_nova', 'ice_shard',
        'fireball', 'fireball', 'fireball'],
      forms: { spark: 'conduit', chain_lightning: 'thunderhead', teleport: 'flicker', blizzard: 'frozen_orb', frost_nova: 'deep_freeze' },
      bar: { rmb: 'spark', s1: 'chain_lightning', s2: 'blizzard', s3: 'frost_nova', s4: 'teleport' },
      rot: [
        ['s3', near2],
        ['s1', mana(20)],
        ['s2', both(pack(2), mana(28))],
        ['rmb', always],
      ],
    },
    // Elementalist: Kindling burns everything, Prismatic Arc's lightning jumps Overload it; Implosion packs them tight
    elementalist: {
      plan: ['firebolt', 'firebolt', 'firebolt', 'fireball', 'frost_nova', 'fireball', 'firebolt', 'chain_lightning',
        'chain_lightning', 'meteor', 'chain_lightning', 'chain_lightning', 'energy_shield', 'chain_lightning', 'meteor', 'meteor',
        'meteor', 'meteor', 'fireball', 'fireball', 'frost_nova', 'frost_nova', 'frost_nova', 'firebolt', 'teleport', 'teleport',
        'teleport', 'fireball', 'frost_nova', 'teleport'],
      forms: { firebolt: 'searing', fireball: 'implosion', chain_lightning: 'prismatic_arc', meteor: 'comet', frost_nova: 'ice_armour',
        teleport: 'flicker' },
      bar: { rmb: 'firebolt', s1: 'chain_lightning', s2: 'meteor', s3: 'frost_nova', s4: 'fireball' },
      rot: [
        ['s3', (c) => c.close >= 1 && !c.shielded, 'self'],
        ['s1', mana(14)],
        ['s4', both(pack(3), mana(24))],
        ['s2', both(either(pack(2), elite), mana(30))],
        ['rmb', always],
      ],
    },
  };

  /** the situation a build's cast tests read */
  function situation(w, p, t, near) {
    const cheb = BD.core.util.cheb;
    return {
      p, t, near, mana: p.resources.mana ? p.resources.mana.cur : 0,
      close: near.filter((e) => cheb(e.x, e.y, p.x, p.y) <= 2).length,
      within3: near.filter((e) => cheb(e.x, e.y, p.x, p.y) <= 3).length,
      dist: cheb(t.x, t.y, p.x, p.y),
      shielded: !!BD.sim.status.has(p, 'shielded'),
      cloak: w.floor.zones.some((z) => z.follow === p.id),
    };
  }

  BD.debug.botBuilds = { BUILDS, situation };
})(globalThis.BD);
