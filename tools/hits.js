// Hits to kill, as a player feels it: how many times the hero struck a monster before it died.
// A "hit" is a damage event from the hero (or their allies) on that monster; damage-over-time ticks
// don't count. Reported per act and rank from full bot playthroughs.
//   node tools/hits.js [class=valkyrie] [difficulty=pilgrim] [seeds=3] [maxFloor=13]
'use strict';
const { loadBD } = require('../test/harness');
const { runBot } = require('./bot');

const [cls = 'valkyrie', difficulty = 'pilgrim', seedsArg = '3', maxFloorArg = '13'] = process.argv.slice(2);
const SEEDS = Number(seedsArg);
const MAX_FLOOR = Number(maxFloorArg);

const med = (a) => (a.length ? a.slice().sort((x, y) => x - y)[a.length >> 1] : null);
const pct = (a, q) => (a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length * q)] : null);

function measure(seed) {
  const BD = loadBD({ extra: ['js/debug/bot.js'] });
  const hits = new Map();          // monster id -> hits taken from the hero side
  const out = [];                  // { act, rank, def, hits }
  let world = null;
  const origCreate = BD.sim.world.createWorld;
  BD.sim.world.createWorld = (o) => (world = origCreate(o));
  const origStep = BD.sim.world.step;
  BD.sim.world.step = (w, dt) => {
    origStep(w, dt);
    const heroSide = (id) => {
      const e = BD.sim.entities.get(w, id);
      return e && (e.kind === 'player' || e.faction === 'player');
    };
    for (const ev of w.events) {
      if (ev.type === 'damage' && !ev.isDot && heroSide(ev.srcId)) hits.set(ev.tgtId, (hits.get(ev.tgtId) || 0) + 1);
      if (ev.type === 'death' && ev.kind === 'monster' && hits.has(ev.id)) {
        const n = typeof w.floor.n === 'number' ? w.floor.n : w.run.floor;
        const act = n >= 13 ? 'S' : BD.data.floors.byN(Math.max(1, n)).act;
        out.push({ act, rank: ev.rank, def: ev.def, hits: hits.get(ev.id) });
        hits.delete(ev.id);
      }
    }
  };
  const r = runBot({ BD, cls, seed, difficulty, maxFloor: MAX_FLOOR, minutes: 120 });
  return { r, out, world };
}

const all = [];
const runs = [];
for (let s = 0; s < SEEDS; s++) {
  const { r, out } = measure('hits' + s);
  all.push(...out);
  runs.push(`seed hits${s}: deepest ${r.deepest}, level ${r.level}, ${r.minutes} min, ${r.victory ? 'victory' : r.dead ? 'died' : 'stopped'}, bargains ${r.bargains}`);
}
console.log(`${cls} on ${difficulty}, ${SEEDS} runs`);
runs.forEach((l) => console.log('  ' + l));
const groups = {};
for (const k of all) {
  const rank = k.rank === 'minion' ? 'normal' : k.rank === 'unique' ? 'keeper' : k.rank;
  const key = (rank === 'boss' || rank === 'malgoth' ? 'boss ' + k.def : 'act ' + k.act + ' ' + rank);
  (groups[key] = groups[key] || []).push(k.hits);
}
console.log('\ngroup                     kills  median  p25-p75');
for (const key of Object.keys(groups).sort()) {
  const v = groups[key];
  console.log(key.padEnd(26), String(v.length).padStart(5), String(med(v)).padStart(7), `  ${pct(v, 0.25)}-${pct(v, 0.75)}`);
}
