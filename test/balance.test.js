// Balance bands (05 §4) on a seeded sample: node test/run.js balance
// Bands are asserted per act (its three floors pooled): a single (class, floor) cell carries ±25%
// sampling noise at affordable sample sizes, an act pools three floors of gear rolls and species.
// "Typical TTK" for a class = the mean over species of the per-species median over seeds.
// Bot full runs (run length, floor clear time, death rate) are reported by tools/bot.js, not asserted.
'use strict';
const L = require('../tools/balance_lib');

module.exports = (T) => {
  const BD = L.makeBD();
  const B = L.BANDS;
  const CLASSES = ['fighter', 'assassin', 'magician', 'valkyrie'];
  const ACTS = { 1: [1, 2, 3], 2: [4, 5, 6], 3: [7, 8, 9], 4: [10, 11, 12] };
  const SEEDS = 3;
  const cache = {};

  function trash(cls, n) {
    const roster = L.actRoster(BD, BD.data.floors.byN(n).act);
    const per = [];
    for (const m of roster) {
      const v = [];
      for (let s = 0; s < SEEDS; s++) { const t = L.ttkOne(BD, cls, n, 'ttk' + s, m.id, 'normal'); if (t != null) v.push(t); }
      if (v.length) per.push(L.med(v));
    }
    return L.mean(per);
  }
  function actTrash(a) {
    if (cache[a]) return cache[a];
    const by = {};
    for (const cls of CLASSES) by[cls] = L.mean(ACTS[a].map((n) => trash(cls, n)));
    return (cache[a] = by);
  }

  T.test('trash time-to-kill per act: in band, every class within ±' + B.classSpread * 100 + '% of the median', () => {
    for (const a in ACTS) {
      const by = actTrash(a), all = L.med(Object.values(by));
      T.between(all, B.trashTTK[0], B.trashTTK[1], 'act ' + a + ' trash TTK');
      for (const cls of CLASSES) T.ok(Math.abs(by[cls] / all - 1) <= B.classSpread, 'act ' + a + ' ' + cls + ' TTK ' + by[cls].toFixed(2) + ' vs median ' + all.toFixed(2));
    }
  });

  T.test('elite time-to-kill per act: champion and Keeper class medians in band', () => {
    for (const a in ACTS) {
      const roster = L.actRoster(BD, Number(a));
      const ch = [], kp = [];
      for (const cls of CLASSES) {
        const c = [], k = [];
        ACTS[a].forEach((n, i) => {
          const x = L.ttkOne(BD, cls, n, 'ch' + i, roster[i % roster.length].id, 'champion'); if (x != null) c.push(x);
          const y = L.ttkOne(BD, cls, n, 'kp' + i, roster[(i + 1) % roster.length].id, 'keeper'); if (y != null) k.push(y);
        });
        ch.push(L.med(c)); kp.push(L.med(k));
      }
      T.between(L.med(ch), B.championTTK[0], B.championTTK[1], 'act ' + a + ' champion TTK');
      T.between(L.med(kp), B.keeperTTK[0], B.keeperTTK[1], 'act ' + a + ' Keeper TTK');
    }
  });

  T.test('an idle hero dies to an unanswered pack of four in ' + B.packKill.join('–') + ' s (per act, class median)', () => {
    for (const a in ACTS) {
      const v = CLASSES.map((cls) => L.mean(ACTS[a].map((n) => L.packKill(BD, cls, n, 'pack' + n)).filter((x) => x != null)));
      T.between(L.med(v), B.packKill[0], B.packKill[1], 'act ' + a + ' pack kill time');
    }
  });

  T.test('act boss fights: length, heavy hits and jabs in band (class medians)', () => {
    for (const n of [3, 6, 9, 12]) {
      const runs = CLASSES.map((cls) => L.bossFight(BD, cls, n, 'boss' + n + ':0'));
      const lens = runs.filter((r) => r.len != null).map((r) => r.len);
      T.ok(lens.length >= 3, 'floor ' + n + ': at least three classes beat the boss (' + lens.length + ')');
      T.between(L.med(lens), B.bossFight[0], B.bossFight[1], 'floor ' + n + ' boss fight length');
      const heavy = L.med(runs.flatMap((r) => r.heavy)), jab = L.med(runs.flatMap((r) => r.jab));
      if (heavy != null) T.between(heavy, B.bossHeavy[0], B.bossHeavy[1], 'floor ' + n + ' heavy hit share of life');
      T.between(jab, B.bossJab[0], B.bossJab[1], 'floor ' + n + ' jab share of life');
    }
  });
};
