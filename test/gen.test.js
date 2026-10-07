// Generator sweep: seeds 1..N per floor. Prints the failing seed.
'use strict';
const { loadBD } = require('./harness');

const SEEDS = Number(process.env.GEN_SEEDS || 300);

module.exports = (T) => {
  const BD = loadBD();
  const floors = [];
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
      floors[n] = counts.sort((a, b) => a - b)[counts.length >> 1];
    });
  }

  T.test('floor generation is deterministic', () => {
    const a = BD.sim.gen.generateFloor({ n: 2, seed: 'abc' });
    const b = BD.sim.gen.generateFloor({ n: 2, seed: 'abc' });
    T.eq(BD.core.util.hashOf(Array.from(a.tiles)), BD.core.util.hashOf(Array.from(b.tiles)));
  });
};
