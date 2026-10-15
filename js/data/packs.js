// @ts-check
// Pack compositions per act (04 §3.3). members: [{ def, n:[lo,hi] }]; weight by floor-in-act
// (index 0 = first floor of the act, 2 = act-end floor favours the hardest packs).
(function (BD) {
  'use strict';

  BD.data.packs = {
    // Act I
    warren: { act: 1, name: 'Warren', members: [{ def: 'gutterkin_bonecaller', n: [1, 1] }, { def: 'gutterkin', n: [5, 8] }], weight: [3, 3, 3], leader: 'gutterkin_bonecaller' },
    bone_patrol: {
      act: 1, name: 'Bone Patrol', members: [{ def: 'skeleton', n: [4, 5] }, { def: 'skeleton_archer', n: [1, 1] }],
      weight: [3, 3, 3], floor1: [{ def: 'skeleton', n: [4, 6] }],
    },
    shamblers: { act: 1, name: 'Shamblers', members: [{ def: 'rotting_zombie', n: [4, 5] }], weight: [2, 2, 3] },
    quill_nest: { act: 1, name: 'Quill Nest', members: [{ def: 'spinehog', n: [2, 2] }, { def: 'gutterkin', n: [3, 4] }], weight: [1, 2, 3] },
    // Act II
    feast: { act: 2, name: 'Feast', members: [{ def: 'ghoul', n: [4, 5] }], weight: [3, 3, 3], corpses: 3 },
    bone_choir: { act: 2, name: 'Bone Choir', members: [{ def: 'bone_mage', n: [2, 2] }, { def: 'crypt_guard', n: [2, 3] }], weight: [2, 3, 3] },
    haunting: { act: 2, name: 'Haunting', members: [{ def: 'wraith', n: [3, 4] }], weight: [2, 2, 3] },
    ossuary_watch: { act: 2, name: 'Ossuary Watch', members: [{ def: 'crypt_guard', n: [2, 3] }, { def: 'skeleton_archer_ii', n: [2, 2] }], weight: [3, 3, 3] },
    // Act III
    brood: { act: 3, name: 'Brood', members: [{ def: 'egg_clutch', n: [1, 1] }, { def: 'cave_spider', n: [5, 6] }], weight: [3, 3, 3] },
    viper_pit: { act: 3, name: 'Viper Pit', members: [{ def: 'pit_viper', n: [3, 4] }], weight: [2, 3, 3] },
    statue_garden: { act: 3, name: 'Statue Garden', members: [{ def: 'gargoyle', n: [3, 4] }], weight: [2, 2, 3], spread: true },
    rot_grove: { act: 3, name: 'Rot Grove', members: [{ def: 'fungal_shambler', n: [2, 3] }, { def: 'cave_spider', n: [3, 4] }], weight: [3, 3, 3] },
    // Act IV
    imp_swarm: { act: 4, name: 'Imp Swarm', members: [{ def: 'hellimp', n: [6, 9] }], weight: [3, 3, 2] },
    warband: { act: 4, name: 'Warband', members: [{ def: 'hell_knight', n: [1, 1] }, { def: 'lesser_demon', n: [2, 3] }], weight: [2, 3, 3] },
    coven: { act: 4, name: 'Coven', members: [{ def: 'succubus', n: [2, 2] }, { def: 'chaos_spawn', n: [2, 3] }], weight: [3, 3, 3] },
    legion: { act: 4, name: 'Legion', members: [{ def: 'hell_knight', n: [2, 2] }, { def: 'hellimp', n: [4, 5] }], weight: [1, 2, 3] },
  };

  /** Unique / champion name parts (04 §3.4). */
  BD.data.eliteNames = {
    FIRST: ['Grim', 'Gore', 'Rot', 'Bile', 'Ash', 'Dread', 'Skull', 'Maw', 'Blight', 'Murk', 'Hollow', 'Vex'],
    SECOND: ['gut', 'fang', 'claw', 'bone', 'mire', 'rend', 'shank', 'howl', 'gnash', 'scab', 'spine', 'wither'],
    TITLE: ['the Vile', 'the Hungry', 'the Unclean', 'the Gnawer', 'the Wretched', 'the Pale', 'Bonesplitter', 'the Foul'],
  };
})(globalThis.BD);
