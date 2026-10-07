// Snapshot the hero the bot actually is at each floor's first entry (level, attributes, skills, bar,
// equipment, flask) during seeded full runs — three runs per class so gear luck averages out. The
// balance harness measures with these "bot-curve" heroes, so bands describe the game as it is played.
// node tools/curve_snapshot.js   → writes tools/curve.json (re-run after big balance changes)
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const CLASSES = ['fighter', 'assassin', 'magician', 'valkyrie'];
const RUNS = 5;

function snapshot(cls, seed) {
  const { loadBD } = require('../test/harness');
  const BD = loadBD({ extra: ['js/debug/bot.js'] });
  const w = BD.sim.world.createWorld({ seed, cls, name: 'Curve', difficulty: 'penitent', firstSkill: BD.debug.bot.SKILL_PLAN[cls][0] });
  w.run.charId = 'curve'; w.stash = [[], [], []];
  BD.sim.run.begin(w, {});
  const bot = BD.debug.bot.make(w, { bargain: true });
  BD.debug.bot.spendPoints(bot);
  const snaps = {};
  BD.debug.bot.run(bot, 180 * 60000, {
    until: (world) => world.run.deepestFloor > 12 || world.run.victory,
    onEvents: (evs) => {
      // the curve is about gear and levels, so the hero can't die here (deaths are measured elsewhere)
      if (w.player.hp < BD.sim.stats.statsOf(w, w.player).maxLife * 0.5 && !w.player.dead) w.player.hp = BD.sim.stats.statsOf(w, w.player).maxLife;
      for (const e of evs) {
        if (e.type !== 'floor.enter' || typeof e.n !== 'number' || snaps[e.n]) continue;
        const p = w.player;
        snaps[e.n] = JSON.parse(JSON.stringify({ level: p.level, attrs: p.attrs, skills: p.skills, bar: p.bar, equip: p.equip, flaskMax: p.flask.max }));
      }
    },
  });
  return { snaps, minutes: +(w.time / 60000).toFixed(1) };
}

if (process.argv[2] === '--one') {
  process.stdout.write(JSON.stringify(snapshot(process.argv[3], process.argv[4])));
} else {
  const jobs = [];
  for (const cls of CLASSES) for (let i = 0; i < RUNS; i++) jobs.push({ cls, seed: 'curve-' + cls + '-' + i });
  Promise.all(jobs.map((j) => new Promise((resolve) => {
    let buf = '';
    const ch = spawn(process.execPath, [__filename, '--one', j.cls, j.seed]);
    ch.stdout.on('data', (d) => (buf += d));
    ch.on('close', () => { try { resolve(Object.assign(j, JSON.parse(buf))); } catch (e) { resolve(Object.assign(j, { snaps: {}, minutes: 0 })); } });
  }))).then((res) => {
    const out = {};
    for (const r of res) {
      (out[r.cls] = out[r.cls] || []).push(r.snaps);
      console.log(r.cls.padEnd(9), r.seed.padEnd(18), 'floors', Object.keys(r.snaps).length - 1, 'levels', Object.values(r.snaps).map((s) => s.level).join(','), 'min', r.minutes);
    }
    fs.writeFileSync(path.join(__dirname, 'curve.json'), JSON.stringify(out));
  });
}
