// Generator sweep: seeds 1..N per floor. Prints the failing seed.
'use strict';
const { loadBD } = require('./harness');

const SEEDS = Number(process.env.GEN_SEEDS || 300);

module.exports = (T) => {
  const BD = loadBD();
  const floors = [];
  const medians = {};
  for (let n = 1; n <= 12; n++) {
    const biome = BD.data.floors.byN(n).biome;
    if (BD.data.biomes[biome] && BD.sim.gen.layouts[BD.data.biomes[biome].layout]) floors.push(n);
  }

  for (const n of floors) {
    T.test(`floor ${n}: ${SEEDS} seeds generate and validate`, () => {
      const counts = [];
      for (let s = 1; s <= SEEDS; s++) {
        let p;
        try { p = BD.sim.gen.generateFloor({ n, seed: s }); }
        catch (e) { throw new Error(`seed ${s}: ${e.message}`); }
        counts.push(p.spawns.reduce((a, pk) => a + (pk.counted ? pk.members.length : 0), 0));
      }
      medians[n] = counts.sort((a, b) => a - b)[counts.length >> 1];
    });
  }

  T.test('monster density: 35–80 per floor, monotone within noise, no step > 25%', () => {
    const med = medians;
    const ns = Object.keys(med).map(Number).sort((a, b) => a - b);
    T.ok(ns.length >= 3, 'medians collected');
    for (const n of ns) T.between(med[n], 35, 80, 'floor ' + n + ' median monsters');
    for (let i = 1; i < ns.length; i++) {
      const a = med[ns[i - 1]], b = med[ns[i]];
      T.ok(b >= a - 3, 'floor ' + ns[i] + ' density dips (' + a + ' → ' + b + ')');
      T.ok(Math.abs(b - a) <= a * 0.25, 'floor ' + ns[i] + ' density step > 25% (' + a + ' → ' + b + ')');
    }
  });

  T.test('floor generation is deterministic', () => {
    const a = BD.sim.gen.generateFloor({ n: 2, seed: 'abc' });
    const b = BD.sim.gen.generateFloor({ n: 2, seed: 'abc' });
    T.eq(BD.core.util.hashOf(Array.from(a.tiles)), BD.core.util.hashOf(Array.from(b.tiles)));
  });

  T.test('a layout that cannot fit its features is re-rolled, not a crash (seed h0, floor 9: no gate wall)', () => {
    const plan = BD.sim.gen.generateFloor({ n: 9, seed: 'h0' });
    T.ok(plan.gatePos || plan.tiles.some((t) => t === BD.data.tiles.T.GATE), 'floor 9 has its gate');
  });
};
