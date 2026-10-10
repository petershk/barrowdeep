// @ts-check
// Biomes: palette (07 §3), size and generator parameters (04 §1), ambient FX/audio keys.
// View-only extras: wallStyle (masonry texture: ashlar, rubble, rock, basalt) and light (the player light
// in view is max(min, peak − d / (R·falloff + reach)); tint = rgb multipliers on its warm cast).
(function (BD) {
  'use strict';

  BD.data.biomes = {
    town: {
      id: 'town', name: 'Town of Brennor', layout: 'town', w: 32, h: 23,
      pal: {
        floorA: '#3d4a2a', floorB: '#46532f', road: '#5a5246', wallTop: '#6b5d4a', wallFace: '#4a3f30', wallSide: '#3a3126',
        fog: '#0a0f08', water: '#1d3a4a', lava: '#ff6a1a',
      },
      ambient: 'town', motes: null, lightRadius: 30, wallStyle: 'rubble',
    },
    church: {
      id: 'church', name: 'The Abandoned Church', layout: 'rooms', w: 48, h: 48,
      pal: {
        floorA: '#4a4a52', floorB: '#41414a', wallTop: '#5d5d68', wallFace: '#3d3d48', wallSide: '#30303a',
        fog: '#07070c', water: '#1d3a4a', lava: '#ff6a1a', decal: '#2a2a30',
      },
      params: { rooms: [8, 12], naves: [1, 2], naveW: [9, 13], roomW: [5, 9], roomH: [5, 8], wideCorridor: 0.7 },
      ambient: 'church', motes: 'dust', wallStyle: 'ashlar',
    },
    catacombs: {
      id: 'catacombs', name: 'The Catacombs', layout: 'bsp', w: 52, h: 52,
      pal: {
        floorA: '#4d4338', floorB: '#443b31', wallTop: '#5c4f3e', wallFace: '#42382c', wallSide: '#332b22',
        fog: '#0a0704', water: '#1d3a4a', lava: '#ff6a1a', decal: '#2e2620',
      },
      params: { minLeaf: 7, loops: [2, 4], niches: [3, 6], nicheChest: 0.4 },
      ambient: 'catacombs', motes: 'ash', wallStyle: 'rubble',
    },
    caves: {
      id: 'caves', name: 'The Caves', layout: 'caves', w: 56, h: 56,
      pal: {
        floorA: '#33402e', floorB: '#2c3a2a', wallTop: '#42523c', wallFace: '#2e3b2a', wallSide: '#222d20',
        fog: '#040a04', water: '#1d3a4a', lava: '#ff6a1a', decal: '#1e281c',
      },
      params: { fill: 0.45, iters: 5, pools: [2, 4] },
      ambient: 'caves', motes: 'drips', wallStyle: 'rock', light: { tint: [0.9, 1, 0.86] },
    },
    hell: {
      id: 'hell', name: 'The Demonic Halls', layout: 'islands', w: 56, h: 56,
      pal: {
        floorA: '#4a2020', floorB: '#421b1b', wallTop: '#642a22', wallFace: '#481d18', wallSide: '#361511',
        fog: '#0c0303', water: '#1d3a4a', lava: '#ff6a1a', decal: '#2a1010',
      },
      params: { platforms: [6, 9], hub: 13 },
      ambient: 'hell', motes: 'embers', wallStyle: 'basalt', light: { min: 0.28, peak: 1.3, falloff: 0.75, reach: 1, tint: [1, 0.84, 0.74] },
    },
    sanctum: {
      id: 'sanctum', name: "Malgoth's Sanctum", layout: 'sanctum', w: 28, h: 28,
      pal: {
        floorA: '#3a2042', floorB: '#331b3a', wallTop: '#5a2a52', wallFace: '#401d3a', wallSide: '#30152c',
        fog: '#070310', water: '#1d3a4a', lava: '#ff6a1a', decal: '#22102a',
      },
      ambient: 'hell', motes: 'embers', wallStyle: 'ashlar', light: { min: 0.28, peak: 1.35, falloff: 0.75, reach: 1, tint: [0.96, 0.84, 1] },
    },
  };

  // Per-floor looks (view only; the sim and generator still see the act's biome). Each act's first floor
  // wears the biome as defined above; its second and third floors re-dress it with their own name, palette,
  // masonry and light, so three floors of one act never look the same.
  const VARIANTS = {
    2: { name: 'The Undercroft', wallStyle: 'rubble', light: { tint: [0.92, 1, 0.94] }, pal: {
      floorA: '#3f4640', floorB: '#373e38', wallTop: '#56605a', wallFace: '#39423c', wallSide: '#2d3430', fog: '#05080a', decal: '#252b26' } },
    3: { name: 'The Ossuary', light: { tint: [0.94, 0.92, 1] }, pal: {
      floorA: '#46404c', floorB: '#3e3844', wallTop: '#686070', wallFace: '#48424f', wallSide: '#36313c', fog: '#08060c', decal: '#2a2530' } },
    5: { name: 'The Bone Galleries', wallStyle: 'ashlar', pal: {
      floorA: '#51483a', floorB: '#483f33', wallTop: '#6a5c46', wallFace: '#4c4232', wallSide: '#3a3226', fog: '#0b0805', decal: '#30281f' } },
    6: { name: 'The Deep Crypts', light: { tint: [1, 0.9, 0.84] }, pal: {
      floorA: '#46362e', floorB: '#3e3029', wallTop: '#5a4436', wallFace: '#402f26', wallSide: '#30241d', fog: '#0a0504', decal: '#2a1e18' } },
    8: { name: 'The Drowned Caves', light: { tint: [0.84, 0.95, 1] }, pal: {
      floorA: '#2e3e40', floorB: '#283638', wallTop: '#3e5254', wallFace: '#2b3a3c', wallSide: '#1f2c2e', fog: '#030809', decal: '#1b2526' } },
    9: { name: 'The Fungal Deep', light: { tint: [1, 1, 0.8] }, pal: {
      floorA: '#3c3e2a', floorB: '#343624', wallTop: '#50523a', wallFace: '#383a28', wallSide: '#2a2c1e', fog: '#070802', decal: '#24261a' } },
    11: { name: 'The Burning Halls', pal: {
      floorA: '#4a2a1a', floorB: '#422416', wallTop: '#643822', wallFace: '#48281a', wallSide: '#361d12', fog: '#0c0502', decal: '#2a160c' } },
    12: { name: 'The Pit', pal: {
      floorA: '#3a1a1c', floorB: '#331618', wallTop: '#52221f', wallFace: '#3a1816', wallSide: '#2a1110', fog: '#080202', decal: '#220e0e' } },
  };
  /** every look by key: 'church', 'catacombs', … and 'church:2', 'church:3', … for the variants */
  BD.data.looks = {};
  for (const id in BD.data.biomes) BD.data.looks[id] = Object.assign({ key: id, biome: id }, BD.data.biomes[id]);
  BD.data.lookVariants = VARIANTS;
  /** the look of floor n in a biome (floor n's variant when it has one, else the biome) */
  BD.data.lookFor = (biome, n) => {
    const v = VARIANTS[n], base = BD.data.looks[biome];
    if (!v || !base || biome === 'town' || biome === 'sanctum') return base;
    const key = biome + ':' + n;
    if (!BD.data.looks[key]) {
      BD.data.looks[key] = Object.assign({}, base, v, {
        key, pal: Object.assign({}, base.pal, v.pal), light: Object.assign({}, base.light, v.light),
      });
    }
    return BD.data.looks[key];
  };
  /** the look of a floor object ({ biome, n }); cached per floor since the renderer asks every tile */
  const lookCache = new WeakMap();
  BD.data.lookOf = (f) => {
    let l = lookCache.get(f);
    if (!l) lookCache.set(f, (l = BD.data.lookFor(f.biome, f.n)));
    return l;
  };
})(globalThis.BD);
