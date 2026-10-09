// Data integrity: ids, references, reachability of every drop, stat keys, behaviours, sprites.
'use strict';
const fs = require('fs');
const path = require('path');
const { loadBD } = require('./harness');

module.exports = (T) => {
  const art = ['js/view/sprite_art.js', 'js/view/prop_art.js', 'js/view/item_art.js'].filter((f) => fs.existsSync(path.join(__dirname, '..', f)));
  const BD = loadBD({ extra: ['js/view/ns_view_stub.js'].filter((f) => fs.existsSync(path.join(__dirname, '..', f))).concat(art) });
  const D = BD.data;
  const snake = /^[a-z][a-z0-9_]*$/;

  T.test('ids are snake_case and match their keys', () => {
    for (const table of ['monsters', 'packs', 'bases', 'affixes', 'legendaries', 'skills', 'statuses', 'championMods', 'projectiles', 'zones', 'biomes', 'classes']) {
      for (const k in D[table]) {
        T.ok(snake.test(k), table + '.' + k + ' is not snake_case');
        if (D[table][k].id) T.eq(D[table][k].id, k, table + '.' + k + ' id mismatch');
      }
    }
  });

  T.test('stat keys used by affixes, implicits and skills are registered', () => {
    for (const a of Object.values(D.affixes)) if (a.stat && a.stat !== 'skill_plus') T.ok(D.stats.isKey(a.stat), 'affix ' + a.id + ' -> ' + a.stat);
    for (const b of Object.values(D.bases)) for (const k in b.implicit) T.ok(D.stats.isKey(k), 'implicit ' + b.id + '.' + k);
    for (const s of Object.values(D.skills)) T.ok(D.stats.isKey('skill_plus_' + s.id), 'skill_plus_' + s.id);
  });

  T.test('references resolve: packs, legendaries, skills, monster projectiles and zones', () => {
    for (const pk of Object.values(D.packs)) for (const m of pk.members.concat(pk.floor1 || [])) T.ok(D.monsters[m.def], 'pack member ' + m.def);
    for (const L of Object.values(D.legendaries)) { T.ok(D.bases[L.base], 'legendary base ' + L.base); for (const a of L.affixes) T.ok(D.affixes[a], L.id + ' affix ' + a); }
    for (const s of Object.values(D.skills)) {
      for (const e of (s.effects || []).concat(s.selfEffects || [])) if (e.type === 'status' || e.type === 'buff') T.ok(D.statuses[e.id], s.id + ' status ' + e.id);
      for (const bp of s.breakpoints || []) for (const e of (bp.add || []).concat(bp.addSelf || [])) if (e.type === 'status' || e.type === 'buff') T.ok(D.statuses[e.id], s.id + ' bp status ' + e.id);
      if (s.delivery && s.delivery.projectile) T.ok(D.projectiles[s.delivery.projectile], s.id + ' projectile');
    }
    for (const m of Object.values(D.monsters)) for (const b of m.behaviours) {
      if (b.projectile) T.ok(D.projectiles[b.projectile], m.id + ' projectile ' + b.projectile);
      if (b.zone) T.ok(D.zones[b.zone], m.id + ' zone ' + b.zone);
    }
  });

  T.test('every monster has a sprite and behaviours that exist', () => {
    for (const m of Object.values(D.monsters)) {
      if (BD.view && BD.view.art) T.ok(BD.view.art[m.sprite], m.id + ' sprite ' + m.sprite);
      for (const b of m.behaviours) T.ok(BD.sim.ai.BEH[b.id], m.id + ' behaviour ' + b.id);
    }
  });

  T.test('set pieces: rectangular, a border entrance at least 2 wide, markers known', () => {
    const runs = (cells) => { let best = 0, cur = 0; for (const c of cells) { if (c === '.') { cur++; best = Math.max(best, cur); } else cur = 0; } return best; };
    for (const sp of D.setpieces) {
      T.ok(sp.rows.every((r) => r.length === sp.w), sp.id + ' not rectangular');
      for (const r of sp.rows) for (const ch of r) T.ok('#.P~dCBSMETLH'.includes(ch), sp.id + ' unknown marker ' + ch);
      const border = [runs(sp.rows[0]), runs(sp.rows[sp.h - 1]), runs(sp.rows.map((r) => r[0])), runs(sp.rows.map((r) => r[sp.w - 1]))];
      T.ok(Math.max(...border) >= 2, sp.id + ' has no 2-wide entrance');
      if (sp.rows.join('').includes('E')) T.ok(sp.minFloor >= 2, sp.id + ' has an elite spot on floor 1');
    }
  });

  T.test('every base, affix and legendary is reachable from drops', () => {
    const w = BD.sim.world.createWorld({ seed: 'reach', cls: 'fighter', name: 't' });
    w.run.flags.ledger = 3;
    w.run.bossesKilled = ['grulk'];   // legendaries drop only once the first act boss has fallen
    BD.sim.run.travel(w, 4, 'spawn');  // past Act I, whose rare/legendary chances are halved
    const rng = BD.core.rng.makeRng('reach');
    const bases = new Set(), affixes = new Set(), legs = new Set();
    for (const cls of Object.keys(D.classes)) {
      for (let i = 0; i < 2500; i++) {
        const it = BD.sim.loot.rollItem(w, rng, { ilvl: 1 + (i % 30), cls, mf: 400 });
        bases.add(it.base);
        for (const a of it.affixes) affixes.add(a.id);
        if (it.legendary) legs.add(it.legendary);
        BD.sim.items.derive(it);
      }
    }
    const missingB = Object.keys(D.bases).filter((k) => !bases.has(k));
    const missingA = Object.keys(D.affixes).filter((k) => !affixes.has(k) && !D.affixes[k].legendaryOnly && !(k === 'skill_plus' && false));
    const missingL = Object.keys(D.legendaries).filter((k) => !legs.has(k));
    T.eq(missingB.join(','), '', 'unreachable bases');
    T.eq(missingA.join(','), '', 'unreachable affixes');
    T.eq(missingL.join(','), '', 'unreachable legendaries');
  });

  T.test('smart loot: about 72% of drops usable by the class', () => {
    const w = BD.sim.world.createWorld({ seed: 'smart', cls: 'magician', name: 't' });
    BD.sim.run.travel(w, 1, 'spawn');
    const rng = BD.core.rng.makeRng('smart');
    for (const cls of Object.keys(D.classes)) {
      let use = 0; const n = 3000;
      for (let i = 0; i < n; i++) { const it = BD.sim.loot.rollItem(w, rng, { ilvl: 5, cls, rarity: 'magic' }); if (BD.sim.loot.usableBy(cls, D.bases[it.base])) use++; }
      T.between(use / n, 0.66, 0.78, cls + ' usable share');
    }
  });

  T.test('item rules: at most 1 hook and 1 proc, no duplicate stats, affix counts by rarity', () => {
    const w = BD.sim.world.createWorld({ seed: 'rules', cls: 'fighter', name: 't' });
    BD.sim.run.travel(w, 1, 'spawn');
    const rng = BD.core.rng.makeRng('rules');
    for (let i = 0; i < 3000; i++) {
      const it = BD.sim.loot.rollItem(w, rng, { ilvl: 10, rarity: i % 2 ? 'rare' : 'magic' });
      const bands = it.affixes.map((a) => D.affixes[a.id].band);
      T.ok(bands.filter((b) => b === 'hook').length <= 1, 'two hooks');
      T.ok(bands.filter((b) => b === 'proc').length <= 1, 'two procs');
      const stats = it.affixes.map((a) => D.affixes[a.id].stat || a.id);
      T.eq(new Set(stats).size, stats.length, 'duplicate stat on ' + it.base);
      const extra = D.bases[it.base].slot === 'amulet' ? 1 : 0;
      if (it.rarity === 'magic') T.between(it.affixes.length, 1, 2 + extra);
      if (it.rarity === 'rare') T.between(it.affixes.length, 3, 4 + extra);
    }
  });

  T.test('every legendary power that exists so far has an implementation', () => {
    const dir = path.join(__dirname, '..', 'js', 'sim');
    const src = fs.readdirSync(dir).filter((f) => f === 'powers.js' || f.startsWith('skills_')).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
    const missing = [];
    for (const L of Object.values(D.legendaries)) {
      if (L.cls && !Object.values(D.skills).some((s) => s.cls === L.cls)) continue; // class arrives in M7
      if (!src.includes("'" + L.id + "'") && !src.includes(L.id + ':')) missing.push(L.id);
    }
    T.eq(missing.join(','), '', 'unimplemented powers');
  });
};
