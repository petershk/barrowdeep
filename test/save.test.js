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

  T.test('migration chain runs from a v1 fixture', () => {
    const w = BD.sim.world.createWorld({ seed: 'save-d', cls: 'fighter', name: 'Sav' });
    BD.sim.run.travel(w, 1, 'spawn');
    const s = JSON.parse(JSON.stringify(BD.sim.save.serialize(w, 1)));
    s.v = 1;
    const w2 = BD.sim.save.deserialize(s);
    T.eq(w2.player.name, 'Sav');
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
