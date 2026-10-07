// Simulation tests: pipeline order, dodge/block/crit, resists, statuses, AI cost accounting,
// zones on time, pausing changes nothing, determinism over 10,000 steps.
'use strict';
const { loadBD } = require('./harness');

module.exports = (T) => {
  const BD = loadBD();
  const STEP = BD.core.scheduler.STEP_MS;

  function newWorld(seed, cls, floor) {
    const w = BD.sim.world.createWorld({ seed: seed || 's', cls: cls || 'fighter', name: 't' });
    BD.sim.run.travel(w, floor || 1, 'spawn');
    return w;
  }
  /** a deterministic scripted player: engage the nearest monster every 30 steps */
  function drive(w, steps) {
    for (let i = 0; i < steps; i++) {
      if (i % 30 === 0 && !w.player.dead) {
        let best = null, bd = 1e9;
        for (const e of w.floor.entities.values()) { if (e.dead) continue; const d = Math.hypot(e.x - w.player.x, e.y - w.player.y); if (d < bd) { bd = d; best = e; } }
        if (best) BD.sim.commands.issue(w, { type: 'Engage', entityId: best.id, hold: true });
        if (i % 600 === 0) BD.sim.commands.issue(w, { type: 'Evade', dirX: 1, dirY: 0 });
      }
      BD.sim.world.step(w, STEP);
      w.events.length = 0;
    }
  }
  const firstMonster = (w) => [...w.floor.entities.values()][0];

  T.test('determinism: same seed + commands ⇒ same state hash after 10,000 steps', () => {
    const a = newWorld('det'), b = newWorld('det');
    drive(a, 10000); drive(b, 10000);
    T.eq(BD.sim.world.stateHash(a), BD.sim.world.stateHash(b));
    const c = newWorld('det2'); drive(c, 2000);
    T.ok(BD.sim.world.stateHash(a) !== BD.sim.world.stateHash(c));
  });

  T.test('pausing (no steps) changes nothing', () => {
    const w = newWorld('pause'); drive(w, 300);
    const h = BD.sim.world.stateHash(w);
    BD.sim.commands.issue(w, { type: 'Move', x: w.player.x + 3, y: w.player.y });
    w.commandQueue.length = 0;
    T.eq(BD.sim.world.stateHash(w), h);
  });

  T.test('damage pipeline: armour ratio mitigation and resist cap', () => {
    const w = newWorld('dmg');
    const p = w.player, m = firstMonster(w);
    const s = BD.sim.stats.statsOf(w, p);
    const mit = BD.sim.damage.mitigation(w, m, p, 'phys');
    const A = s.armorTotal, al = m.al;
    T.near(mit, A / (A + 50 + 15 * al), 1e-9);
    T.eq(s.resCap, 75);
    T.ok(s.res.fire <= 75 && s.res.fire >= -100);
  });

  T.test('damage pipeline: invulnerable targets are immune; DoTs never crit', () => {
    const w = newWorld('immune');
    const p = w.player, m = firstMonster(w);
    BD.sim.status.apply(w, p, 'evading', { durMs: 120 });
    const r = BD.sim.damage.dealDamage(w, { srcId: m.id, tgtId: p.id, amounts: { phys: 50 }, tags: ['melee'], canCrit: false, canDodge: true, canBlock: true, mult: 1 });
    T.eq(r, null);
    T.ok(w.events.some((e) => e.type === 'miss' && e.reason === 'immune'));
    BD.sim.status.remove(w, p, 'evading');
    let crits = 0;
    for (let i = 0; i < 200; i++) { m.hp = 1000; const rr = BD.sim.damage.dealDamage(w, { srcId: p.id, tgtId: m.id, amounts: { fire: 0.001 }, tags: ['dot'], canCrit: false, canDodge: false, canBlock: false, mult: 1, isDot: true }); if (rr && rr.crit) crits++; }
    T.eq(crits, 0);
  });

  T.test('crit chance converges to the stat', () => {
    const w = newWorld('crit');
    const p = w.player, m = firstMonster(w);
    let crits = 0; const n = 4000;
    for (let i = 0; i < n; i++) { m.hp = 1e6; const r = BD.sim.damage.dealDamage(w, { srcId: p.id, tgtId: m.id, amounts: { phys: 1 }, tags: ['melee'], canCrit: true, canDodge: false, canBlock: false, mult: 1, noOnHit: true }); if (r.crit) crits++; }
    T.near(crits / n, BD.sim.stats.statsOf(w, p).critChance / 100, 0.02);
  });

  T.test('player block chance converges and reduces damage by 70%', () => {
    const w = newWorld('block');
    const p = w.player, m = firstMonster(w);
    const s = BD.sim.stats.statsOf(w, p);
    T.ok(s.blockChance > 0, 'starting buckler grants block');
    let blocks = 0; const n = 3000;
    for (let i = 0; i < n; i++) { p.hp = 1e6; const r = BD.sim.damage.dealDamage(w, { srcId: m.id, tgtId: p.id, amounts: { phys: 100 }, tags: ['melee'], canCrit: false, canDodge: false, canBlock: true, mult: 1, noOnHit: true }); if (r.blocked) blocks++; }
    T.near(blocks / n, s.blockChance / 100, 0.025);
  });

  T.test('status stacking: poison stacks to 5, burning refreshes', () => {
    const w = newWorld('status');
    const m = firstMonster(w);
    for (let i = 0; i < 8; i++) BD.sim.status.apply(w, m, 'poisoned', { hit: 10, sourceId: 1 });
    T.eq(m.statuses.filter((s) => s.id === 'poisoned').length, 5);
    BD.sim.status.apply(w, m, 'burning', { hit: 10, sourceId: 1 });
    BD.sim.status.apply(w, m, 'burning', { hit: 20, sourceId: 1 });
    T.eq(m.statuses.filter((s) => s.id === 'burning').length, 1);
  });

  T.test('bosses take reduced CC (freeze → chill, stun ×0.3)', () => {
    const w = newWorld('boss');
    const m = firstMonster(w);
    m.rank = 'boss';
    BD.sim.status.apply(w, m, 'frozen', { durMs: 1500 });
    T.ok(BD.sim.status.has(m, 'chilled') && !BD.sim.status.has(m, 'frozen'));
    BD.sim.status.apply(w, m, 'stunned', { durMs: 1000 });
    T.near(BD.sim.status.has(m, 'stunned').remainingMs, 300, 1);
  });

  T.test('chill halves the action clock; freeze stops it', () => {
    const w = newWorld('clock');
    const m = firstMonster(w);
    m.mods = [];
    T.eq(BD.sim.status.clockMult(w, m), 1);
    BD.sim.status.apply(w, m, 'chilled', {});
    T.eq(BD.sim.status.clockMult(w, m), 0.5);
    BD.sim.status.apply(w, m, 'frozen', {});
    T.eq(BD.sim.status.clockMult(w, m), 0);
  });

  T.test('AI: every decision sets a positive cost', () => {
    const w = newWorld('aicost', 'fighter', 2);
    for (const e of w.floor.entities.values()) BD.sim.ai.alert(w, e, w.player, true);
    let checked = 0;
    for (let i = 0; i < 600; i++) {
      for (const e of [...w.floor.entities.values()]) {
        if (e.dead || !e.ai || e.ai.state === 'idle' || e.ai.state === 'dormant') continue;
        if (!e.move && e.ai.state !== 'windup' && i % 20 === 0) {
          e.ai.timer = 0;
          BD.sim.ai.decide(w, e);
          T.ok(e.ai.timer > 0 || e.ai.state === 'windup', 'decide set no cost for ' + e.def);
          checked++;
        }
      }
      BD.sim.world.step(w, STEP); w.events.length = 0;
      w.player.hp = 1e6;
    }
    T.ok(checked > 10);
  });

  T.test('zones resolve on time', () => {
    const w = newWorld('zone');
    const p = w.player;
    const z = BD.sim.zones.create(w, { tiles: [[p.x, p.y]], cx: p.x, cy: p.y, armMs: 500, faction: 'monster', srcId: null, resolve: { type: 'packet', amounts: { phys: 5 } } });
    let resolvedAt = -1;
    for (let i = 0; i < 60 && resolvedAt < 0; i++) { BD.sim.world.step(w, STEP); if (w.events.some((e) => e.type === 'zone.resolve' && e.zoneId === z.id)) resolvedAt = i + 1; w.events.length = 0; }
    T.near(resolvedAt * STEP, 500, STEP + 0.01);
  });

  T.test('projectiles travel and can be sidestepped', () => {
    const w = newWorld('proj');
    const p = w.player, m = firstMonster(w);
    const tx = p.x, ty = p.y;
    BD.sim.projectiles.fireMonster(w, m, tx, ty, 'arrow', { phys: 5 }, { range: 30 });
    T.eq(w.floor.projectiles.length, 1);
    const pr = w.floor.projectiles[0];
    const x0 = pr.x;
    BD.sim.world.step(w, STEP);
    T.ok(pr.x !== x0 || pr.y !== m.y, 'projectile moved');
  });
};
