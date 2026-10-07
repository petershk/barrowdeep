// Snapshot the hero the bot actually is at each floor's first entry (level, attributes, skills, bar,
// equipment, flask) during seeded full runs. The balance harness measures with these "bot-curve"
// heroes, so bands describe the game as it is played rather than an assumed gear curve.
// node tools/curve_snapshot.js   → writes tools/curve.json (re-run after big balance changes)
'use strict';
const fs = require('fs');
const path = require('path');
const { loadBD } = require('../test/harness');

const SEEDS = { fighter: 'curve-f', assassin: 'curve-a', magician: 'curve-m', valkyrie: 'curve-v' };
const out = {};
for (const cls in SEEDS) {
  const BD = loadBD({ extra: ['js/debug/bot.js'] });
  const w = BD.sim.world.createWorld({ seed: SEEDS[cls], cls, name: 'Curve', difficulty: 'penitent', firstSkill: BD.debug.bot.SKILL_PLAN[cls][0] });
  w.run.charId = 'curve'; w.stash = [[], [], []];
  BD.sim.run.begin(w, {});
  const bot = BD.debug.bot.make(w, { bargain: true });
  BD.debug.bot.spendPoints(bot);
  const snaps = {};
  BD.debug.bot.run(bot, 180 * 60000, {
    until: (world) => world.run.deepestFloor > 12 || world.run.victory,
    onEvents: (evs) => {
      for (const e of evs) {
        if (e.type !== 'floor.enter' || typeof e.n !== 'number' || snaps[e.n]) continue;
        const p = w.player;
        snaps[e.n] = JSON.parse(JSON.stringify({ level: p.level, attrs: p.attrs, skills: p.skills, bar: p.bar, equip: p.equip, flaskMax: p.flask.max }));
      }
    },
  });
  out[cls] = snaps;
  console.log(cls, 'floors', Object.keys(snaps).join(','), 'levels', Object.values(snaps).map((s) => s.level).join(','), 'minutes', (w.time / 60000).toFixed(1));
}
fs.writeFileSync(path.join(__dirname, 'curve.json'), JSON.stringify(out));
