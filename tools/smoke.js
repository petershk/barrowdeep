// Quick headless smoke: create a run, walk toward monsters, fight with basic attacks for N seconds.
'use strict';
const { loadBD } = require('../test/harness');
const BD = loadBD();
const cls = process.argv[2] || 'fighter';
const w = BD.sim.world.createWorld({ seed: process.argv[3] || 'smoke', cls, name: 'Smoke' });
BD.sim.run.travel(w, Number(process.argv[4] || 1), 'spawn');
const STEP = BD.core.scheduler.STEP_MS;
const counts = {};
let t = 0;
for (let i = 0; i < 60 * 120; i++) {
  if (i % 20 === 0 && !w.player.dead) {
    const p = w.player;
    let best = null, bd = 1e9;
    for (const e of w.floor.entities.values()) { if (e.dead) continue; const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd) { bd = d; best = e; } }
    if (best) BD.sim.commands.issue(w, { type: 'Engage', entityId: best.id, hold: true });
    if (p.hp < BD.sim.stats.statsOf(w, p).maxLife * 0.4) BD.sim.commands.issue(w, { type: 'DrinkFlask' });
  }
  BD.sim.world.step(w, STEP);
  for (const ev of w.events) counts[ev.type] = (counts[ev.type] || 0) + 1;
  w.events.length = 0;
  t += STEP;
  if (w.player.dead) { console.log('player died at', (t / 1000).toFixed(1), 's'); break; }
}
const p = w.player;
console.log('level', p.level, 'xp', Math.round(p.xp), 'hp', Math.round(p.hp), '/', BD.sim.stats.statsOf(w, p).maxLife, 'monsters left', [...w.floor.entities.values()].filter((e) => !e.dead).length);
console.log(counts);
