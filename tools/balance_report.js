// Balance report against the 05 §4 bands. node tools/balance_report.js [quick|full] [section...]
// sections: ttk, pack, boss, density. "full" samples more seeds and floors; bot full runs live in tools/bot.js.
'use strict';
const L = require('./balance_lib');

const mode = process.argv[2] || 'quick';
const sections = process.argv.slice(3);
const want = (s) => !sections.length || sections.includes(s);
const CLASSES = process.env.BAL_CLASSES ? process.env.BAL_CLASSES.split(',') : ['fighter', 'assassin', 'magician', 'valkyrie'];
const FLOORS = process.env.BAL_FLOORS ? process.env.BAL_FLOORS.split(',').map(Number) : mode === 'full' ? [1, 2, 4, 5, 7, 8, 10, 11, 12] : [1, 4, 7, 10, 12];
const SEEDS = mode === 'full' ? 4 : +(process.env.BAL_SEEDS || 2);
const BD = L.makeBD();
const B = L.BANDS;
const fmt = (v) => (v == null ? '  -  ' : v.toFixed(1).padStart(5));
const band = (v, [lo, hi]) => (v == null ? '?' : v < lo ? 'LOW' : v > hi ? 'HIGH' : 'ok');
const out = { ttk: {}, pack: {}, boss: {} };

if (want('ttk')) {
  console.log('\n== Time to kill (s): trash ' + B.trashTTK + ', champion ' + B.championTTK + ', keeper ' + B.keeperTTK);
  console.log('floor AL  class      trash  champ  keeper');
  for (const n of FLOORS) {
    const fl = BD.data.floors.byN(n);
    const roster = L.actRoster(BD, fl.act);
    const meds = {};
    for (const cls of CLASSES) {
      const t = [], c = [], k = [];
      for (let s = 0; s < SEEDS; s++) {
        for (let i = 0; i < Math.min(4, roster.length); i++) { const v = L.ttkOne(BD, cls, n, 'ttk' + s + i, roster[(i + s) % roster.length].id, 'normal'); if (v != null) t.push(v); }
        const v1 = L.ttkOne(BD, cls, n, 'ch' + s, roster[s % roster.length].id, 'champion'); if (v1 != null) c.push(v1);
        const v2 = L.ttkOne(BD, cls, n, 'kp' + s, roster[(s + 1) % roster.length].id, 'keeper'); if (v2 != null) k.push(v2);
      }
      const r = { trash: L.med(t), champion: L.med(c), keeper: L.med(k) };
      meds[cls] = r.trash;
      (out.ttk[n] = out.ttk[n] || {})[cls] = r;
      console.log(String(n).padStart(5), String(fl.al).padStart(3), ' ' + cls.padEnd(9), fmt(r.trash), fmt(r.champion), fmt(r.keeper), '  ', band(r.trash, B.trashTTK), band(r.champion, B.championTTK), band(r.keeper, B.keeperTTK));
    }
    const all = L.med(Object.values(meds).filter((v) => v != null));
    const spread = CLASSES.map((c) => (meds[c] == null ? '?' : ((meds[c] / all - 1) * 100).toFixed(0) + '%')).join(' ');
    console.log('      spread vs median ' + fmt(all) + ': ' + spread);
  }
}

if (want('pack')) {
  console.log('\n== Idle hero vs 4 melee trash: seconds to die (band ' + B.packKill + ')');
  for (const n of FLOORS) {
    const row = CLASSES.map((cls) => { const v = L.packKill(BD, cls, n, 'pack' + n); (out.pack[n] = out.pack[n] || {})[cls] = v; return cls.slice(0, 4) + fmt(v) + ' ' + band(v, B.packKill); });
    console.log('floor', String(n).padStart(2), row.join('  '));
  }
}

if (want('boss')) {
  console.log('\n== Boss fights (bot): length ' + B.bossFight + ' s (Malgoth ' + B.malgothFight + '), heavy ' + B.bossHeavy.map((x) => x * 100 + '%') + ', jab ' + B.bossJab.map((x) => x * 100 + '%'));
  for (const n of mode === 'full' ? [3, 6, 9, 12, 13] : [3, 6, 9, 12]) {
    for (const cls of CLASSES) {
      const r = L.bossFight(BD, cls, n, 'boss' + n);
      (out.boss[n] = out.boss[n] || {})[cls] = r;
      const lenBand = n === 13 ? B.malgothFight : B.bossFight;
      console.log('floor', String(n).padStart(2), cls.padEnd(9), r.dead ? 'DIED at ' + fmt(r.diedAt) : 'len ' + fmt(r.len) + ' ' + band(r.len, lenBand),
        ' heavy', r.heavyMed == null ? '-' : (r.heavyMed * 100).toFixed(0) + '% ' + band(r.heavyMed, B.bossHeavy), ' jab', r.jabMed == null ? '-' : (r.jabMed * 100).toFixed(1) + '% ' + band(r.jabMed, B.bossJab), ' flasks', r.flasks);
    }
  }
}

if (process.env.BAL_JSON) require('fs').writeFileSync(process.env.BAL_JSON, JSON.stringify(out, null, 1));
