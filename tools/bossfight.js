// Headless boss fight: on-curve Fighter vs an act boss. node tools/bossfight.js [floor] [seed]
'use strict';
const { loadBD } = require('../test/harness');
const BD = loadBD();
const n = Number(process.argv[2] || 3);
const w = BD.sim.world.createWorld({ seed: process.argv[3] || 'boss', cls: 'fighter', name: 'B', firstSkill: 'bash' });
const p = w.player;
const fl = BD.data.floors.byN(n);
p.level = fl.al + 1; p.attrs.str += 3 * (p.level - 1); p.attrs.vit += 2 * (p.level - 1);
p.skills = { bash: 5, charge: 2, war_cry: 2, berserk_strike: 1 };
const rng = BD.core.rng.makeRng('gear');
p.equip.weapon = BD.sim.loot.rollItem(w, rng, { ilvl: fl.al, rarity: 'magic', slot: 'weapon', cls: 'fighter', usable: true });
p.equip.chest = BD.sim.loot.rollItem(w, rng, { ilvl: fl.al, rarity: 'magic', slot: 'chest', cls: 'fighter', usable: true });
BD.sim.stats.bump(p); p.hp = BD.sim.stats.statsOf(w, p).maxLife;
BD.sim.run.travel(w, n, 'spawn');
w.run.flags['key' + n] = true;
BD.sim.bossfight.useGate(w);
const STEP = BD.core.scheduler.STEP_MS;
const counts = {};
let t = 0, boss = [...w.floor.entities.values()].find((e) => e.rank === 'boss');
console.log('boss', boss.def, 'hp', boss.hp, 'player hp', Math.round(p.hp), 'dps weapon', BD.sim.stats.statsOf(w, p).weapon.dmg);
let heavyHits = [], jabs = [];
w.events.length = 0;
for (let i = 0; i < 60 * 240 && !p.dead; i++) {
  if (i % 10 === 0) {
    const b = [...w.floor.entities.values()].find((e) => e.rank === 'boss');
    if (!b) break;
    // dodge zones on my tile
    const z = w.floor.zones.find((q) => !q.resolved && q.faction === 'monster' && q.tiles.some(([x, y]) => x === p.x && y === p.y));
    if (z && !(p.cooldowns.evade > 0)) BD.sim.commands.issue(w, { type: 'Evade', dirX: Math.sign(p.x - z.cx) || 1, dirY: Math.sign(p.y - z.cy) });
    else {
      const s = BD.sim.stats.statsOf(w, p);
      if (p.resources.rage.cur >= 40) BD.sim.commands.issue(w, { type: 'UseSkill', slot: 'rmb', aim: { entityId: b.id } });
      BD.sim.commands.issue(w, { type: 'Engage', entityId: b.id, hold: true });
      if (p.hp < s.maxLife * 0.45) BD.sim.commands.issue(w, { type: 'DrinkFlask' });
    }
    p.bar.rmb = 'berserk_strike';
  }
  BD.sim.world.step(w, STEP);
  for (const ev of w.events) {
    counts[ev.type] = (counts[ev.type] || 0) + 1;
    if (ev.type === 'damage' && ev.tgtId === 1) { const pct = ev.total / BD.sim.stats.statsOf(w, p).maxLife; (ev.tags.indexOf('zone') >= 0 ? heavyHits : jabs).push(pct); }
  }
  w.events.length = 0;
  t += STEP;
}
const avg = (a) => a.length ? (a.reduce((x, y) => x + y, 0) / a.length * 100).toFixed(1) + '%' : '-';
console.log('time', (t / 1000).toFixed(1), 's; dead', p.dead, 'bossDead', w.floor.bossDead, 'exit', w.floor.objects.some((o) => o.kind === 'exit_portal'));
console.log('zone hits avg', avg(heavyHits), 'n', heavyHits.length, '| melee avg', avg(jabs), 'n', jabs.length, '| flask left', p.flask.charges);
console.log(Object.entries(counts).filter(([k]) => /boss|telegraph|zone|exposed|spawn|death|countdown/.test(k)).map(([k, v]) => k + ':' + v).join(' '));
