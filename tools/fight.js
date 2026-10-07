// One fight, measured: a fresh hero (starting gear, chosen level) against one floor's normal packs,
// played by the bot. Reports fight length, shots fired, hits per kill, damage taken and flasks.
//   node tools/fight.js [class=valkyrie] [floor=1] [level=1] [seeds=5] [difficulty...]
'use strict';
const { loadBD } = require('../test/harness');

const [cls = 'valkyrie', floorArg = '1', levelArg = '1', seedsArg = '5', ...diffArgs] = process.argv.slice(2);
const FLOOR = Number(floorArg), LEVEL = Number(levelArg), SEEDS = Number(seedsArg);
const DIFFICULTIES = diffArgs.length ? diffArgs : ['pilgrim', 'penitent'];
const STEP = 1000 / 60;
const PACK_DISTANCE = 7;          // tiles between the hero and the pack when the fight starts
const MAX_FIGHT_MS = 120000;

const med = (a) => (a.length ? a.slice().sort((x, y) => x - y)[a.length >> 1] : null);
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const f1 = (v) => (v == null ? '-' : v.toFixed(1));

/** the members of a pack as generated on this floor (the `floor1` variant on floor 1) */
function packMembers(BD, pack, rng) {
  const list = FLOOR === 1 && pack.floor1 ? pack.floor1 : pack.members;
  const out = [];
  for (const m of list) for (let i = rng.int(m.n[0], m.n[1]); i > 0; i--) out.push(m.def);
  return out;
}

function fight(difficulty, packId, seed) {
  const BD = loadBD({ extra: ['js/debug/bot.js'] });
  const plan = BD.debug.bot.SKILL_PLAN[cls];
  const w = BD.sim.world.createWorld({ seed, cls, name: 'Sim', difficulty, firstSkill: plan[0] });
  BD.sim.run.travel(w, FLOOR, 'spawn');
  const p = w.player;
  // XP to go from level 1 to LEVEL (points are spent below, like the bot would)
  let xp = 0;
  for (let L = 1; L < LEVEL; L++) xp += BD.sim.progression.xpToNext(L);
  if (xp > 0) BD.sim.progression.gainXp(w, p, xp, 'sim');
  if (p.level !== LEVEL) throw new Error('could not reach level ' + LEVEL + ' (got ' + p.level + ')');
  const bot = BD.debug.bot.make(w, { maxFloor: FLOOR });
  BD.debug.bot.spendPoints(bot);
  // an empty floor, then one pack a few tiles away, all awake
  for (const e of [...w.floor.entities.values()]) if (e.kind === 'monster') BD.sim.entities.remove(w, e);
  w.floor.zones.length = 0;
  w.floor.projectiles.length = 0;
  const members = packMembers(BD, BD.data.packs[packId], w.rng);
  const foes = [];
  for (const def of members) {
    const at = BD.sim.entities.nearestFree(w.floor, p.x + PACK_DISTANCE, p.y, 6) || BD.sim.entities.nearestFree(w.floor, p.x - PACK_DISTANCE, p.y, 6);
    const e = at && BD.sim.monsters.spawn(w, def, at.x, at.y, { noLoot: true, packId: 1 });
    if (!e) continue;
    foes.push(e);
    BD.sim.ai.alert(w, e, p, false);
  }
  const maxLife = BD.sim.stats.statsOf(w, p).maxLife;
  const hits = new Map(), lifeOf = new Map(foes.map((e) => [e.id, BD.sim.stats.statsOf(w, e).maxLife]));
  const kills = [];
  let start = null, shots = 0, taken = 0, flasks = 0, dmgPerHit = [];
  const casts = {};
  for (let t = 0; t < MAX_FIGHT_MS && !p.dead && foes.some((e) => !e.dead); t += STEP) {
    if (Math.round(t / STEP) % 8 === 0) BD.debug.bot.decide(bot);
    BD.sim.world.step(w, STEP);
    for (const ev of w.events) {
      if (ev.type === 'ability.cast' && ev.id === p.id) {
        if (start == null) start = w.time;
        shots++;
        casts[ev.abilityId] = (casts[ev.abilityId] || 0) + 1;
      } else if (ev.type === 'damage' && ev.tgtId === p.id) {
        taken += ev.total;
      } else if (ev.type === 'damage' && ev.srcId === p.id && !ev.isDot) {
        hits.set(ev.tgtId, (hits.get(ev.tgtId) || 0) + 1);
        dmgPerHit.push(ev.total);
      } else if (ev.type === 'flask.drink') {
        flasks++;
      } else if (ev.type === 'death' && ev.kind === 'monster') {
        kills.push({ def: ev.def, hits: hits.get(ev.id) || 0, life: lifeOf.get(ev.id) });
      }
    }
    w.events.length = 0;
  }
  return {
    members, won: !p.dead && foes.every((e) => e.dead), secs: start == null ? null : (w.time - start) / 1000,
    shots, casts, kills, takenPct: (100 * taken) / maxLife, flasks, maxLife, dmgPerHit, level: p.level,
  };
}

for (const difficulty of DIFFICULTIES) {
  console.log(`\n=== ${cls} level ${LEVEL}, floor ${FLOOR}, ${difficulty} (${SEEDS} seeds per pack)`);
  const act = BD_ACT();
  for (const [packId, pack] of Object.entries(loadBD().data.packs).filter(([, p]) => p.act === act)) {
    const runs = [];
    for (let s = 0; s < SEEDS; s++) runs.push(fight(difficulty, packId, 'fight' + s));
    const byDef = {};
    for (const r of runs) for (const k of r.kills) (byDef[k.def] = byDef[k.def] || { hits: [], life: k.life }).hits.push(k.hits);
    const casts = {};
    for (const r of runs) for (const id in r.casts) casts[id] = (casts[id] || 0) + r.casts[id] / runs.length;
    console.log(`\n${pack.name}: ${runs[0].members.join(', ')}`);
    console.log(`  won ${runs.filter((r) => r.won).length}/${runs.length} · fight ${f1(med(runs.map((r) => r.secs).filter((x) => x != null)))} s`
      + ` · shots fired ${f1(med(runs.map((r) => r.shots)))} · life lost ${f1(med(runs.map((r) => r.takenPct)))}%`
      + ` of ${runs[0].maxLife} · flasks ${f1(avg(runs.map((r) => r.flasks)))}`);
    console.log(`  hero damage per hit: median ${f1(med(runs.flatMap((r) => r.dmgPerHit)))}`
      + ` · actions: ${Object.entries(casts).map(([id, n]) => id + ' ' + f1(n)).join(', ')}`);
    for (const def in byDef) console.log(`  ${def.padEnd(22)} life ${String(byDef[def].life).padStart(4)} · hits to kill median ${med(byDef[def].hits)} (range ${Math.min(...byDef[def].hits)}–${Math.max(...byDef[def].hits)})`);
  }
}

function BD_ACT() { return loadBD().data.floors.byN(FLOOR).act; }
