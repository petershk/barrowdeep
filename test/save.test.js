// Saves: world → save → load → identical hash; floor deltas; arena retreat; migration chain;
// quota error path; save size budget.
'use strict';
const { loadBD } = require('./harness');

module.exports = (T) => {
  const BD = loadBD();
  const STEP = BD.core.scheduler.STEP_MS;
  const rt = (w) => BD.sim.save.deserialize(JSON.parse(JSON.stringify(BD.sim.save.serialize(w, 1))));

  function killAll(w, pred) {
    for (const e of [...w.floor.entities.values()]) if (!pred || pred(e)) BD.sim.damage.dealDamage(w, { srcId: 1, tgtId: e.id, amounts: { phys: 1e9 }, tags: [], canCrit: false, canDodge: false, canBlock: false, mult: 1 });
    for (let i = 0; i < 3; i++) { BD.sim.world.step(w, STEP); w.events.length = 0; }
  }

  T.test('round-trip in town and mid-floor gives an identical save hash', () => {
    const w = BD.sim.world.createWorld({ seed: 'save-a', cls: 'fighter', name: 'Sav' });
    BD.sim.run.begin(w, {});
    T.eq(w.floor.key, 'town');
    T.eq(BD.sim.save.saveHash(rt(w)), BD.sim.save.saveHash(w));
    BD.sim.run.descend(w);
    T.eq(w.floor.key, 1);
    T.eq(BD.sim.save.saveHash(rt(w)), BD.sim.save.saveHash(w));
  });

  T.test('floor deltas: dead monsters stay dead, items and seal state persist across reloads and revisits', () => {
    const w = BD.sim.world.createWorld({ seed: 'save-b', cls: 'fighter', name: 'Sav' });
    BD.sim.run.travel(w, 1, 'spawn');
    const before = w.floor.entities.size;
    killAll(w, (e) => !e.keeper);
    const keeper = w.floor.entities.get(w.floor.keeperId);
    T.ok(keeper, 'keeper alive');
    killAll(w, (e) => e.keeper);
    // the seal drops; pick it up by walking onto it
    const seal = w.floor.items.find((g) => g.kind === 'seal');
    T.ok(seal, 'seal dropped');
    BD.sim.run.placePlayer(w, { x: seal.x, y: seal.y, exact: true });
    BD.sim.world.step(w, STEP);
    T.ok(w.floor.sealBroken, 'seal broken');
    const items = w.floor.items.length;
    const w2 = rt(w);
    T.eq(w2.floor.entities.size, 0, 'dead monsters stay dead (had ' + before + ')');
    T.eq(w2.floor.items.length, items);
    T.ok(w2.floor.sealBroken);
    T.eq(BD.sim.save.saveHash(w2), BD.sim.save.saveHash(w));
    // leave and come back
    BD.sim.run.descend(w2);
    T.eq(w2.floor.key, 2);
    BD.sim.run.ascend(w2);
    T.eq(w2.floor.key, 1);
    T.eq(w2.floor.entities.size, 0);
    T.ok(w2.floor.sealBroken);
  });

  T.test('a save never resumes inside a live boss fight', () => {
    const w = BD.sim.world.createWorld({ seed: 'save-c', cls: 'fighter', name: 'Sav' });
    BD.sim.run.travel(w, 3, 'spawn');
    w.run.flags.key3 = true;
    BD.sim.bossfight.useGate(w);
    T.eq(w.floor.key, 'a3');
    const s = BD.sim.save.serialize(w, 1);
    T.eq(s.floor.key, 3);
    const w2 = BD.sim.save.deserialize(JSON.parse(JSON.stringify(s)));
    T.eq(w2.floor.key, 3);
  });

  T.test('migrations: VERSION matches the chain, and a registered migration upgrades old saves', () => {
    const S = BD.sim.save;
    T.eq(S.VERSION, S.migrations.length + 1);
    const w = BD.sim.world.createWorld({ seed: 'save-d', cls: 'fighter', name: 'Sav' });
    BD.sim.run.travel(w, 1, 'spawn');
    const s = JSON.parse(JSON.stringify(S.serialize(w, 1)));
    // pretend the current format renamed player.name → player.title in version N+1
    s.player.title = s.player.name; delete s.player.name;
    const old = JSON.parse(JSON.stringify(s));
    old.player.name = old.player.title; delete old.player.title;
    S.migrations.push((x) => { x.player.title = x.player.name; delete x.player.name; x.v = S.migrations.length + 1; return x; });
    try {
      const w2 = S.deserialize(old);
      T.eq(w2.player.title, 'Sav');
    } finally { S.migrations.pop(); }
  });

  T.test('loading reconciles removed content: unknown items dropped, skill points refunded', () => {
    const w = BD.sim.world.createWorld({ seed: 'save-r', cls: 'fighter', name: 'Sav' });
    BD.sim.run.travel(w, 1, 'spawn');
    const s = JSON.parse(JSON.stringify(BD.sim.save.serialize(w, 1)));
    s.player.equip.weapon.base = 'removed_axe';
    s.player.pack.push({ uid: 'z', base: 'gone', ilvl: 1, rarity: 'common', affixes: [{ id: 'gone_affix', roll: 0.5 }] });
    s.player.pack.push({ uid: 'y', base: s.player.equip.offhand.base, ilvl: 1, rarity: 'magic', affixes: [{ id: 'gone_affix', roll: 0.5 }] });
    s.player.skills.old_skill = 3; s.player.bar.s1 = 'old_skill';
    s.player.statuses.push({ id: 'old_status', until: 1e9 });
    const spare = s.player.unspent.skill;
    const w2 = BD.sim.save.deserialize(s);
    const p = w2.player;
    T.eq(p.equip.weapon, null);
    T.eq(p.pack.length, 1, 'known base kept, unknown dropped');
    T.ok(BD.sim.items.derive(p.pack[0]), 'item with an unknown affix still derives');
    T.eq(p.unspent.skill, spare + 3);
    T.eq(p.bar.s1, null);
    T.ok(!p.statuses.some((x) => x.id === 'old_status'));
  });

  T.test('timed events: floor events stay on their floor, hero events survive travel and saves', () => {
    const SC = BD.core.scheduler;
    const w = BD.sim.world.createWorld({ seed: 'save-t', cls: 'fighter', name: 'Sav' });
    BD.sim.run.travel(w, 1, 'spawn');
    // a Bone Mage wall on floor 1 that would close 6 s later
    const tiles = [[w.player.x + 2, w.player.y]];
    SC.after(w, 6000, 'bone_wall.end', { tiles });
    SC.after(w, 1000, 'rage.tick', { n: 5 });
    T.ok(SC.pendingFloorEvents(w));
    T.ok(!BD.sim.save.isSafe(w), 'pending floor events make a save unsafe');
    BD.sim.run.travel(w, 2, 'up');
    T.ok(!SC.pendingFloorEvents(w), 'floor 1 events dropped on leaving');
    T.ok(w.scheduled.some((e) => e.kind === 'rage.tick'), 'hero event kept');
    const w2 = rt(w);
    T.ok(w2.scheduled.some((e) => e.kind === 'rage.tick'), 'hero event saved');
    // a stale floor event that slips through is skipped, not run on the wrong floor
    w.scheduled.push({ at: w.time, kind: 'bone_wall.end', payload: { tiles: [[1, 1]] }, seq: 1e9, floor: 1 });
    const b11 = w.floor.block[w.floor.w + 1];
    BD.sim.world.step(w, STEP);
    T.eq(w.floor.block[w.floor.w + 1], b11);
  });

  T.test('save, load, keep playing: the loaded world evolves like the original', () => {
    const w = BD.sim.world.createWorld({ seed: 'save-c2', cls: 'magician', name: 'Sav' });
    BD.sim.run.travel(w, 1, 'spawn');
    killAll(w);
    T.ok(BD.sim.save.isSafe(w), 'cleared floor is safe');
    T.ok(!w.floor.sealBroken, 'the seal still waits to be picked up');
    const w2 = rt(w);
    const walk = (x) => { for (let i = 0; i < 600; i++) { if (i % 60 === 0) BD.sim.commands.issue(x, { type: 'Move', x: x.player.x + 3, y: x.player.y + (i % 120 ? 1 : -1) }); BD.sim.world.step(x, STEP); x.events.length = 0; } };
    T.ok(!w2.floor.sealBroken, 'reloading does not open the stairs for free');
    const x0 = w.player.x;
    walk(w); walk(w2);
    T.ok(w.player.x !== x0, 'the hero actually moved');
    T.eq(BD.sim.save.saveHash(w2), BD.sim.save.saveHash(w));
    T.eq(w2.player.x + ',' + w2.player.y, w.player.x + ',' + w.player.y);
  });

  T.test('save size stays under 30 KB after a few floors', () => {
    const w = BD.sim.world.createWorld({ seed: 'save-e', cls: 'fighter', name: 'Sav' });
    BD.sim.run.travel(w, 1, 'spawn');
    for (let n = 1; n <= 2; n++) {
      killAll(w);
      for (let i = 0; i < w.floor.explored.length; i += 3) w.floor.explored[i] = 1;
      w.floor.sealBroken = true;
      BD.sim.run.travel(w, n + 1, 'up');
    }
    const size = JSON.stringify(BD.sim.save.serialize(w, 1)).length;
    T.ok(size < 30000, 'save is ' + size + ' bytes');
  });

  T.test('quota error emits save.fail and does not throw', () => {
    const emitted = [];
    const B2 = loadBD({
      extra: ['js/ui/storage.js'],
      globals: { localStorage: { getItem: () => null, setItem: () => { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; }, removeItem() {} } },
    });
    B2.app = { bus: { emit: (ev) => emitted.push(ev) } };
    const ok = B2.ui.saves.write('char_x', { a: 1 });
    T.eq(ok, false);
    T.ok(emitted.some((e) => e.type === 'save.fail'));
  });
};
