// Sim performance budget (06 §15): one step ≤ 2 ms with 80 awake monsters, 60 projectiles, 30 zones.
// node tools/perf.js   (render budget: index.html?debug=1&autotest=perf in a browser)
'use strict';
const { loadBD } = require('../test/harness');
const BD = loadBD({ extra: ['js/debug/bot.js'] });
const STEP = BD.core.scheduler.STEP_MS;
const w = BD.sim.world.createWorld({ seed: 'perf', cls: 'magician', name: 'P' });
BD.sim.run.travel(w, 11, 'spawn');
const f = w.floor, p = w.player;
p.hp = 1e9;
const roster = Object.values(BD.data.monsters).filter((m) => m.act === 4 && !m.spawner && !m.spawnOnly);
let n = [...f.entities.values()].filter((e) => e.kind === 'monster').length;
for (let i = 0; n < 80 && i < 400; i++) {
  const e = BD.sim.monsters.spawn(w, roster[i % roster.length].id, p.x + ((i * 7) % 21) - 10, p.y + ((i * 11) % 21) - 10, { noLoot: true });
  if (e) n++;
}
for (const e of f.entities.values()) if (e.kind === 'monster') BD.sim.ai.alert(w, e, p, true);
function topUp() {
  while (f.projectiles.length < 60) BD.sim.projectiles.fireMonster(w, { id: 0, faction: 'monster', x: p.x + 8, y: p.y }, p.x - 8, p.y + (f.projectiles.length % 5), 'arrow', { phys: 1 }, { range: 30 });
  while (f.zones.filter((z) => !z.resolved).length < 30) BD.sim.zones.create(w, { tiles: [[p.x + (f.zones.length % 9) - 4, p.y + 3]], armMs: 5000, faction: 'monster', srcId: null, resolve: null, kind: 'perf' });
}
// per-system timing so a spike can be attributed
const sysT = {};
for (const s of BD.sim.world.SYSTEMS) { const fn = s.fn; s.fn = (wd, dt) => { const t0 = process.hrtime.bigint(); fn(wd, dt); const ms = Number(process.hrtime.bigint() - t0) / 1e6; const r = (sysT[s.name] = sysT[s.name] || { max: 0, sum: 0 }); r.sum += ms; if (ms > r.max) r.max = ms; }; }
for (let i = 0; i < 60; i++) { topUp(); BD.sim.world.step(w, STEP); w.events.length = 0; p.hp = 1e9; }
const times = [];
for (let i = 0; i < 3000; i++) {
  topUp();
  const t0 = process.hrtime.bigint();
  BD.sim.world.step(w, STEP);
  times.push(Number(process.hrtime.bigint() - t0) / 1e6);
  w.events.length = 0; p.hp = 1e9;
}
times.sort((a, b) => a - b);
const alive = [...f.entities.values()].filter((e) => e.kind === 'monster' && !e.dead).length;
const q = (x) => times[Math.floor(times.length * x)].toFixed(3);
console.log('monsters', alive, 'projectiles', f.projectiles.length, 'zones', f.zones.filter((z) => !z.resolved).length);
console.log('slowest systems (max ms):', Object.entries(sysT).sort((a, b) => b[1].max - a[1].max).slice(0, 5).map(([k, v]) => k + ' ' + v.max.toFixed(1)).join(', '));
console.log('steps over 16 ms:', times.filter((t) => t > 16).length, 'of', times.length, '(GC / JIT pauses show up as isolated spikes)');
console.log('step ms  median', q(0.5), ' p95', q(0.95), ' max', times[times.length - 1].toFixed(3), ' budget 2.000', +q(0.95) <= 2 ? 'OK' : 'OVER');
