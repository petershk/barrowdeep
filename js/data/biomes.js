// @ts-check
// Biomes: palette (07 §3), size and generator parameters (04 §1), ambient FX/audio keys.
(function (BD) {
  'use strict';

  BD.data.biomes = {
    town: {
      id: 'town', name: 'Town of Brennor', layout: 'town', w: 32, h: 23,
      pal: {
        floorA: '#3d4a2a', floorB: '#46532f', road: '#5a5246', wallTop: '#6b5d4a', wallFace: '#4a3f30', wallSide: '#3a3126',
        fog: '#0a0f08', water: '#1d3a4a', lava: '#ff6a1a',
      },
      ambient: 'town', motes: null, lightRadius: 30,
    },
    church: {
      id: 'church', name: 'The Abandoned Church', layout: 'rooms', w: 48, h: 48,
      pal: {
        floorA: '#4a4a52', floorB: '#41414a', wallTop: '#5d5d68', wallFace: '#3d3d48', wallSide: '#30303a',
        fog: '#07070c', water: '#1d3a4a', lava: '#ff6a1a', decal: '#2a2a30',
      },
      params: { rooms: [8, 12], naves: [1, 2], naveW: [9, 13], roomW: [5, 9], roomH: [5, 8], wideCorridor: 0.7 },
      ambient: 'church', motes: 'dust',
    },
    catacombs: {
      id: 'catacombs', name: 'The Catacombs', layout: 'bsp', w: 52, h: 52,
      pal: {
        floorA: '#4d4338', floorB: '#443b31', wallTop: '#5c4f3e', wallFace: '#42382c', wallSide: '#332b22',
        fog: '#0a0704', water: '#1d3a4a', lava: '#ff6a1a', decal: '#2e2620',
      },
      params: { minLeaf: 7, loops: [2, 4], niches: [3, 6], nicheChest: 0.4 },
      ambient: 'catacombs', motes: 'ash',
    },
    caves: {
      id: 'caves', name: 'The Caves', layout: 'caves', w: 56, h: 56,
      pal: {
        floorA: '#33402e', floorB: '#2c3a2a', wallTop: '#42523c', wallFace: '#2e3b2a', wallSide: '#222d20',
        fog: '#040a04', water: '#1d3a4a', lava: '#ff6a1a', decal: '#1e281c',
      },
      params: { fill: 0.45, iters: 5, pools: [2, 4] },
      ambient: 'caves', motes: 'drips',
    },
    hell: {
      id: 'hell', name: 'The Demonic Halls', layout: 'islands', w: 56, h: 56,
      pal: {
        floorA: '#4a2020', floorB: '#421b1b', wallTop: '#642a22', wallFace: '#481d18', wallSide: '#361511',
        fog: '#0c0303', water: '#1d3a4a', lava: '#ff6a1a', decal: '#2a1010',
      },
      params: { platforms: [6, 9], hub: 13 },
      ambient: 'hell', motes: 'embers',
    },
    sanctum: {
      id: 'sanctum', name: "Malgoth's Sanctum", layout: 'sanctum', w: 28, h: 28,
      pal: {
        floorA: '#3a2042', floorB: '#331b3a', wallTop: '#5a2a52', wallFace: '#401d3a', wallSide: '#30152c',
        fog: '#070310', water: '#1d3a4a', lava: '#ff6a1a', decal: '#22102a',
      },
      ambient: 'hell', motes: 'embers',
    },
  };
})(globalThis.BD);
