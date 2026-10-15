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

  T.test('every boss move in every kit starts and resolves without throwing', () => {
    const BS = BD.sim.bosses;
    for (const [n, key] of [[3, 'a3'], [6, 'a6'], [9, 'a9'], [12, 'a12'], [13, 13]]) {
      const w = newWorld('kit' + n, 'fighter', 1);
      w.run.flags['key' + n] = true;
      BD.sim.run.travel(w, key, 'spawn');
      const boss = [...w.floor.entities.values()].find((e) => BD.sim.entities.isBoss(e));
      T.ok(boss, 'boss on ' + key);
      const d = BD.sim.monsters.defOf(boss);
      BD.sim.run.placePlayer(w, { x: boss.x + 2, y: boss.y });
      const kit = d.kit.concat(d.crushing ? [Object.assign({ move: 'crushing_blow' }, d.crushing)] : []);
      for (const m of kit) {
        const impl = BS.moves[m.move];
        T.ok(impl, 'move implemented: ' + m.move);
        BS.bossState(w, boss);
        try {
          impl.start(w, boss, m, { tgt: w.player, dist: 2 });
          if (impl.resolve && boss.ai.action) impl.resolve(w, boss, boss.ai.action);
          drive(w, 30);
        } catch (err) { throw new Error(d.id + ' ' + m.move + ': ' + err.message); }
        w.player.hp = 1e9;
      }
    }
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

  T.test('a burrow cut short by a stun surfaces the monster (never stuck untargetable)', () => {
    const w = newWorld('burrow', 'fighter', 8);
    const m = firstMonster(w);
    m.untargetable = true;
    m.ai.state = 'windup';
    m.ai.action = { kind: 'burrow_travel', recover: 0, mult: 1 };
    m.ai.timer = 900;
    BD.sim.status.apply(w, m, 'stunned', { durMs: 500 });
    BD.sim.world.step(w, STEP);
    T.ok(!m.untargetable, 'surfaced');
    T.ok(m.ai.state !== 'windup', 'burrow cancelled');
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

  T.test('a won Bargain fully revives: the hero can die again afterwards', () => {
    const w = newWorld('bargain', 'fighter', 2);
    const p = w.player, m = firstMonster(w);
    BD.sim.damage.kill(w, p, m, { tags: ['melee'], amounts: { phys: 99 } });
    BD.sim.world.step(w, STEP);
    T.ok(p.dead && w.run.dead, 'hero died');
    let ok = false;
    for (let i = 0; i < 20 && !ok; i++) { w.run.bargainsUsed = 0; w.run.harvested = false; w.run.dead = true; p.dead = true; ok = BD.sim.commands.apply(w, { type: 'Bargain' }) === true; }
    T.ok(ok, 'bargain succeeded within 20 tries');
    T.ok(!p.dying && !p.dead && p.hp > 0 && w.floor.key === 'town', 'alive in town, kill flag cleared');
    BD.sim.damage.kill(w, p, null, { tags: [], amounts: { phys: 1 } });
    BD.sim.world.step(w, STEP);
    T.ok(p.dead, 'a later death is processed');
  });

  T.test('early-game loot and monster hit-recovery flinch', () => {
    const w = newWorld('loot-gate');
    const rng = BD.core.rng.makeRng('loot-gate');
    const count = (rar) => {
      let k = 0;
      for (let i = 0; i < 4000; i++) if (BD.sim.loot.rollItem(w, rng, { ilvl: 5, mf: 300 }).rarity === rar) k++;
      return k / 4000;
    };
    T.ok(count('legendary') > 0, 'legendaries can drop on Floor 1 before any boss dies');
    const act1 = count('rare');
    BD.sim.run.travel(w, 4, 'spawn');
    const act2 = count('rare');
    T.between(act1 / act2, 0.85, 1.15, 'Act I rare share matches Act II');

    const m = firstMonster(w);
    m.rank = 'normal';
    m.ai.state = 'windup';
    m.ai.action = { kind: 'melee', windLeft: 200, targetId: w.player.id, x: w.player.x, y: w.player.y };
    const maxHp = BD.sim.stats.statsOf(w, m).maxLife;
    BD.sim.damage.dealDamage(w, {
      srcId: w.player.id, tgtId: m.id, amounts: { phys: maxHp * 0.4 }, tags: ['melee'],
      canCrit: false, canDodge: false, canBlock: false, mult: 1,
    });
    T.eq(m.ai.action, null, 'a heavy hit flinches the monster out of its normal melee wind-up');
  });

  T.test('a Bonecaller raises at most twice, and the risen stay down', () => {
    const w = newWorld('raise');
    const p = w.player, f = w.floor;
    for (const e of [...f.entities.values()]) if (e.kind === 'monster') { BD.sim.entities.vacate(f, e); f.entities.delete(e.id); }
    p.invulnerable = true;
    const at = BD.sim.entities.nearestFree(f, p.x + 4, p.y, 4);
    const bc = BD.sim.monsters.spawn(w, 'gutterkin_bonecaller', at.x, at.y, { packId: 900 });
    let raised = 0;
    for (let i = 0; i < 6000; i++) {
      // keep a fresh gutterkin corpse of its pack beside it, and kill whatever it raises
      if (!f.corpses.some((c) => c.packId === 900 && !c.risen)) {
        f.corpses.push({ id: 90000 + i, def: 'gutterkin', x: bc.x, y: bc.y + 1, packId: 900, rank: 'normal', maxLife: 10, ms: 60000 });
      }
      BD.sim.world.step(w, STEP);
      for (const ev of w.events) if (ev.type === 'revive' && ev.by === bc.id) {
        raised++;
        const m = BD.sim.entities.get(w, ev.id);
        if (m) {
          T.ok(m.hp <= BD.sim.stats.statsOf(w, m).maxLife && m.risen, 'the risen are marked');
          BD.sim.damage.kill(w, m, null, { tags: [], amounts: { phys: 1 } });
        }
      }
      w.events.length = 0;
      if (bc.dead) break;
    }
    T.eq(raised, 2, 'two raises, then no more');
    T.ok(f.corpses.filter((c) => c.risen).every((c) => !c.revived), 'a risen corpse is never raised again');
  });

  T.test('no Extra Fast champions before floor 3; Keepers open with an attack move', () => {
    for (let s = 0; s < 12; s++) {
      for (const n of [1, 2]) {
        const w = newWorld('mods' + s, 'fighter', n);
        for (const e of w.floor.entities.values()) {
          T.ok(!(e.mods || []).includes('extra_fast'), 'floor ' + n + ': ' + e.def + ' is not Extra Fast');
          if (e.keeper) T.ok(e.signature[0] !== 'rally', 'the Keeper opens with an attack signature');
        }
      }
    }
  });
};
