// @ts-check
// Run structure (01 §4). AL(floor) = round(1 + 2.25 × (floor − 1)) (05 §1).
(function (BD) {
  'use strict';

  const ACT_BIOME = { 1: 'church', 2: 'catacombs', 3: 'caves', 4: 'hell' };
  const ACT_BOSS = { 1: 'grulk', 2: 'mortis', 3: 'mygra', 4: 'hakthul' };
  const al = (n) => Math.round(1 + 2.25 * (n - 1));

  /** @param {number} n 1..13 */
  function byN(n) {
    if (n === 13) return { n, act: 5, biome: 'sanctum', al: al(13), stairsDown: false, waypoint: false, gate: false, keeper: false, boss: 'malgoth', actEnd: true };
    const act = Math.ceil(n / 3) || 1;
    const actEnd = n % 3 === 0;
    return {
      n, act, biome: ACT_BIOME[act], al: al(n),
      stairsDown: !actEnd, waypoint: n % 3 === 1, gate: actEnd, keeper: true,
      boss: actEnd ? ACT_BOSS[act] : null, actEnd,
    };
  }

  BD.data.floors = {
    al, byN, ACT_BIOME, ACT_BOSS, LAST: 13,
    WAYPOINTS: [1, 4, 7, 10],
    firstOfAct: (act) => (act - 1) * 3 + 1,
  };
})(globalThis.BD);
