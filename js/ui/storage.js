// @ts-check
// Storage adapter (06 §12): bd2_index, bd2_char_<id>, bd2_meta. Every write is try/catch; a quota
// error emits save.fail and the UI shows a persistent warning with an export button.
// Export/import characters as JSON files (download via Blob link; import via <input type=file>).
(function (BD) {
  'use strict';

  const P = 'bd2_';
  function read(key) {
    try { const raw = localStorage.getItem(P + key); return raw ? JSON.parse(raw) : null; }
    catch (e) { BD.core.util.warnOnce('storage read ' + key, e); return null; }
  }
  function write(key, val) {
    try { localStorage.setItem(P + key, JSON.stringify(val)); return true; }
    catch (e) {
      BD.core.util.warnOnce('storage write ' + key, e);
      BD.app.bus.emit({ type: 'save.fail', key, error: String(e && e.name) });
      return false;
    }
  }
  function remove(key) { try { localStorage.removeItem(P + key); } catch (e) { BD.core.util.warnOnce('storage remove', e); } }

  // ---------------- characters ----------------
  function list() { return read('index') || []; }
  function saveChar(world, why) {
    const id = world.run.charId;
    if (!id) return false;
    const s = BD.sim.save.serialize(world, Date.now());
    s.why = why;
    if (!write('char_' + id, s)) return false;
    const p = world.player, r = world.run;
    const entry = { id, name: p.name, cls: p.cls, level: p.level, floor: r.floor, difficulty: r.difficulty, alive: !r.dead || false, savedAt: s.savedAt, victory: !!r.victory, ascension: r.ascension || 0 };
    const idx = list().filter((c) => c.id !== id);
    idx.unshift(entry);
    write('index', idx);
    BD.app.bus.emit({ type: 'save.ok', why });
    return true;
  }
  function loadChar(id) {
    const s = read('char_' + id);
    if (!s) return null;
    return BD.sim.save.deserialize(s);
  }
  function deleteChar(id) {
    remove('char_' + id);
    write('index', list().filter((c) => c.id !== id));
  }
  function markDead(id) {
    const idx = list();
    const e = idx.find((c) => c.id === id);
    if (e) { e.alive = false; write('index', idx); }
  }

  // ---------------- meta (souls, unlocks, stash, hints) ----------------
  const META_DEFAULT = { souls: 0, soulsTotal: 0, unlocks: {}, stash: [[]], hints: {}, ascension: {}, runs: 0, victories: 0 };
  let metaCache = null;
  function meta() {
    if (!metaCache) metaCache = Object.assign({}, META_DEFAULT, read('meta') || {});
    return metaCache;
  }
  function saveMeta() { write('meta', meta()); }
  function addSouls(n) { const m = meta(); m.souls += n; m.soulsTotal += n; m.runs++; saveMeta(); }

  // ---------------- export / import ----------------
  function exportAll() {
    const out = { kind: 'barrowdeep-export', v: 1, meta: meta(), chars: {} };
    for (const c of list()) out.chars[c.id] = read('char_' + c.id);
    out.index = list();
    const blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'barrowdeep-characters.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function importFile(onDone) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json';
    inp.addEventListener('change', () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        try {
          const data = JSON.parse(String(rd.result));
          if (data.kind !== 'barrowdeep-export') throw new Error('not a Barrowdeep export');
          for (const id in data.chars) write('char_' + id, data.chars[id]);
          const idx = list();
          for (const e of data.index || []) if (!idx.some((c) => c.id === e.id)) idx.push(e);
          write('index', idx);
          if (data.meta) { metaCache = Object.assign({}, META_DEFAULT, data.meta); saveMeta(); }
          onDone && onDone(true);
        } catch (e) { BD.core.util.warnOnce('import failed', e); onDone && onDone(false, String(e)); }
      };
      rd.readAsText(f);
    });
    inp.click();
  }

  BD.ui.saves = { read, write, list, saveChar, loadChar, deleteChar, markDead, exportAll, importFile };
  BD.ui.meta = { get: meta, save: saveMeta, addSouls };
})(globalThis.BD);
