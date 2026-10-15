// Headless bot runs: node tools/bot.js [cls] [seed] [maxFloor] [minutes] [difficulty] [build]
// (build: a plan from js/debug/bot_builds.js, e.g. magician … inferno)
// Prints a JSON report: time per floor, deaths, TTK per rank, damage taken by source, skill use,
// gold, items by rarity, level per floor.
'use strict';
const { loadBD } = require('../test/harness');

/** damage dealt by source as rounded percentages, biggest first */
function share(m) {
  const tot = Object.values(m).reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, Math.round((v / tot) * 100)]));
}

function firstSkill(BD, opts) {
  const b = opts.build && BD.debug.botBuilds.BUILDS[opts.build];
  return b ? b.plan[0] : BD.debug.bot.SKILL_PLAN[opts.cls][0];
}

function runBot(opts) {
  const BD = opts.BD || loadBD({ extra: ['js/debug/bot.js', 'js/debug/bot_builds.js'] });
  const w = BD.sim.world.createWorld({ seed: opts.seed, cls: opts.cls, name: 'Bot', difficulty: opts.difficulty || 'penitent', firstSkill: firstSkill(BD, opts) });
  w.run.charId = 'bot';
  w.stash = [[], [], []];
  BD.sim.run.begin(w, {});
  BD.sim.economy && BD.sim.economy.onRunStart && BD.sim.economy.onRunStart(w, {});
  const bot = BD.debug.bot.make(w, { floorMs: opts.floorMs, bargain: opts.bargain, maxFloor: opts.maxFloor, build: opts.build });
  BD.debug.bot.spendPoints(bot);
  const maxFloor = opts.maxFloor || 13;
  let lastKey = null, t0 = Date.now();
  const log = process.env.BOT_LOG ? (w2) => { if (w2.floor.key !== lastKey) { lastKey = w2.floor.key; console.error('[bot] ' + ((Date.now() - t0) / 1000).toFixed(1) + 's real, ' + (w2.time / 60000).toFixed(1) + ' min: ' + w2.floor.key + ' lvl ' + w2.player.level + ' hp ' + Math.round(w2.player.hp)); } } : null;
  // build identity: how often reactions, keystones and Form payoffs actually fire
  const procs = {}, dealt = {};
  const count = (evs) => {
    for (const e of evs) {
      if (e.type === 'damage' && e.srcId === w.player.id) {
        const src = e.abilityId || (e.tags && e.tags.includes('zone') ? 'ground' : 'other');
        dealt[src] = (dealt[src] || 0) + e.total;
      }
      let k = null;
      if (e.type === 'reaction') k = e.name;
      else if (e.type === 'shatter') k = 'Shatter';
      else if (e.type === 'ability.explode' && (e.abilityId === 'pyre' || e.abilityId === 'implosion')) k = e.abilityId;
      if (k) procs[k] = (procs[k] || 0) + 1;
    }
  };
  BD.debug.bot.run(bot, (opts.minutes || 120) * 60000, { onEvents: (evs) => { count(evs); if (log) log(w); }, until: (world) => world.run.deepestFloor > maxFloor || world.run.victory || (world.floor.key === maxFloor && world.floor.sealBroken && opts.stopAtSeal) });
  const avg = (a) => (a && a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : null);
  const med = (a) => (a && a.length ? a.slice().sort((x, y) => x - y)[a.length >> 1] : null);
  const s = bot.stats;
  return {
    cls: opts.cls, seed: opts.seed, minutes: +(w.time / 60000).toFixed(1), deepest: w.run.deepestFloor, level: w.player.level, dead: w.run.dead && w.run.harvested,
    victory: !!w.run.victory, bargains: w.run.bargainsUsed, deaths: bot.deathCauses, floorTimes: bot.floorTimes, levelAtFloor: s.levelAtFloor,
    ttk: Object.fromEntries(Object.entries(s.ttk).map(([k, v]) => [k, { avg: avg(v), med: med(v), n: v.length }])), kills: s.kills,
    bossTimes: s.bossTimes, items: s.items, gold: { earned: s.goldEarned, spent: s.goldSpent, now: w.player.gold }, swaps: s.swaps,
    skillUse: bot.skillUse, procs, dealt: share(dealt), dmgTaken: Object.entries(s.dmgTakenBySrc).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => k + ':' + Math.round(v)),
  };
}

if (require.main === module) {
  const [cls = 'fighter', seed = 'bot1', maxFloor = '3', minutes = '60', difficulty = 'penitent', build = ''] = process.argv.slice(2);
  const t0 = Date.now();
  const r = runBot({ cls, seed, maxFloor: Number(maxFloor), minutes: Number(minutes), difficulty, build: build || null });
  r.build = build || 'default';
  r.realSeconds = +((Date.now() - t0) / 1000).toFixed(1);
  console.log(JSON.stringify(r, null, 1));
}

module.exports = { runBot };
