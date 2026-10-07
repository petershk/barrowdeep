// @ts-check
// Debug arena panel (06 §14), F4: spawn any monster / champion / boss at any AL, forge items, set
// level, godmode, a DPS dummy, travel, scenario save/load, bot watch at 1×–8×, and the Data Lab
// (BD.data.patch with persisted patches and a MODDED DATA badge). Loaded only with ?debug=1.
(function (BD) {
  'use strict';

  const { h } = BD.ui.dom;
  const W = () => BD.app.world;
  const st = { god: false, dummy: null, dps: [], bot: null, speed: 1 };
  const LAB_KEY = 'bd_datalab';

  // ---------------- Data Lab ----------------
  function readLab() { try { return JSON.parse(localStorage.getItem(LAB_KEY) || '[]'); } catch (e) { return []; } }
  function bumpAll() { const w = W(); if (w) for (const e of BD.sim.entities.all(w)) BD.sim.stats.bump(e); }
  /** patch(table, id, fields): shallow-merge fields into BD.data[table][id] and persist */
  BD.data.patch = function patch(table, id, fields, noSave) {
    const t = BD.data[table];
    if (!t || !t[id]) throw new Error('no ' + table + '.' + id);
    Object.assign(t[id], fields);
    if (!noSave) { const lab = readLab(); lab.push({ table, id, fields }); localStorage.setItem(LAB_KEY, JSON.stringify(lab)); }
    bumpAll();
    if (W()) W().run.flags.modded = true;
    badge();
  };
  function badge() {
    let b = document.querySelector('.modded-badge');
    const on = readLab().length > 0;
    if (on && !b) { b = h('div.modded-badge', 'MODDED DATA'); document.body.appendChild(b); }
    if (!on && b) b.remove();
  }
  for (const p of readLab()) { try { BD.data.patch(p.table, p.id, p.fields, true); } catch (e) { console.warn('datalab', e); } }

  // ---------------- per-step hooks ----------------
  BD.app.postStep = (w) => {
    const p = w.player;
    if (st.god && !p.dead) {
      const s = BD.sim.stats.statsOf(w, p);
      p.hp = s.maxLife;
      for (const k in p.resources) { const r = p.resources[k]; if (r && r.cur != null && k !== 'rage') r.cur = r.max != null ? r.max : s['max' + k[0].toUpperCase() + k.slice(1)] || r.cur; }
      if (p.flask) p.flask.charges = Math.max(p.flask.charges, 1);
    }
    const d = st.dummy;
    if (d) {
      if (d.dead || !w.floor.entities.has(d.id)) st.dummy = null;
      else { d.hp = BD.sim.stats.statsOf(w, d).maxLife; d.ai.state = 'idle'; d.ai.held = true; }
    }
    if (st.bot && !st.bot.done && w.time % (BD.core.scheduler.STEP_MS * 8) < BD.core.scheduler.STEP_MS) BD.debug.bot.decide(st.bot);
  };
  BD.app.bus.on('damage', (ev) => { if (st.dummy && ev.tgtId === st.dummy.id) st.dps.push([W().time, ev.total]); });
  BD.app.bus.on('app.world', () => { st.dummy = null; st.bot = null; BD.app.timeScale = 1; });
  function dps() { const w = W(); const from = w.time - 10000; st.dps = st.dps.filter((d) => d[0] >= from); const span = st.dps.length ? Math.max(1000, w.time - st.dps[0][0]) : 1; return st.dps.reduce((a, d) => a + d[1], 0) / (span / 1000); }

  // ---------------- actions ----------------
  function ahead(n) { const p = W().player; return { x: p.x + n, y: p.y }; }
  function spawn(def, rank, al, count) {
    const w = W(), at = ahead(4);
    const mods = rank === 'champion' ? w.rng.shuffle(Object.keys(BD.data.championMods)).slice(0, 2) : [];
    for (let i = 0; i < count; i++) {
      const e = BD.sim.monsters.spawn(w, def, at.x + (i % 3), at.y + Math.floor(i / 3), { rank, al: al || w.floor.al, mods, name: rank === 'boss' && BD.data.bosses[def] ? BD.data.bosses[def].name : null });
      if (e && rank === 'boss' && BD.sim.bosses && BD.sim.bosses.onWake) BD.sim.bosses.onWake(w, e);
    }
  }
  function forge(slot, rarity, ilvl) {
    const w = W(), p = w.player;
    const it = BD.sim.loot.rollItem(w, w.lootRng, { ilvl, rarity, slot: slot || undefined, usable: true });
    BD.sim.loot.dropAt(w, p.x, p.y, { kind: 'item', item: it });
  }
  function setLevel(n) {
    const w = W(), p = w.player, B = BD.data.balance.player;
    n = Math.max(1, Math.min(B.levelCap, n));
    const d = n - p.level;
    p.level = n; p.xp = 0;
    if (d > 0) { p.unspent.attr += d * B.attrPerLevel; p.unspent.skill += d * B.skillPerLevel; }
    BD.sim.stats.bump(p);
    p.hp = BD.sim.stats.statsOf(w, p).maxLife;
  }
  function dummy() {
    const w = W(), at = ahead(3);
    const e = BD.sim.monsters.spawn(w, 'skeleton', at.x, at.y, { noLoot: true, noXp: true, name: 'Training Dummy', hpMult: 50 });
    if (e) { e.ai.held = true; st.dummy = e; st.dps = []; }
  }
  function travel(n) { const w = W(); BD.sim.run.travel(w, n, 'spawn'); }
  function reveal() { const f = W().floor; f.explored.fill(1); BD.view.tiles.invalidate(); }
  function saveScenario(slot) { localStorage.setItem('bd_scenario_' + slot, JSON.stringify(BD.sim.save.serialize(W()))); }
  function loadScenario(slot) { const s = localStorage.getItem('bd_scenario_' + slot); if (s) BD.app.setWorld(BD.sim.save.deserialize(JSON.parse(s))); }
  function bot(on, speed) {
    st.speed = speed;
    BD.app.timeScale = on ? speed : 1;
    st.bot = on ? BD.debug.bot.make(W(), { maxFloor: 13 }) : null;
  }

  // ---------------- panel ----------------
  const sel = (name, opts, v) => h('select', { name }, opts.map((o) => { const e = h('option', { value: o }, o); if (o === v) e.selected = true; return e; }));
  const num = (name, v, w) => h('input', { name, type: 'number', value: String(v), style: 'width:' + (w || 56) + 'px' });
  const btn = (action, label) => h('button.btn.tiny', { data: { action } }, label);
  function build(el) {
    const w = W(), f = w.floor;
    const mons = Object.keys(BD.data.monsters).filter((k) => !BD.data.bosses[k]).sort();
    el.appendChild(h('h2', 'Debug Arena'));
    el.appendChild(h('div.dbg-grid', [
      h('div', [h('h3', 'Spawn'), sel('mon', mons, 'skeleton'), sel('rank', ['normal', 'champion', 'keeper', 'unique'], 'normal'), ' AL ', num('al', f.al || 1), ' × ', num('count', 3, 44), ' ', btn('spawn', 'Spawn')]),
      h('div', [h('h3', 'Boss'), sel('boss', Object.keys(BD.data.bosses)), ' ', btn('boss', 'Summon')]),
      h('div', [h('h3', 'Forge'), sel('slot', ['', 'weapon', 'offhand', 'helm', 'armor', 'gloves', 'boots', 'belt', 'cloak', 'amulet', 'ring']), sel('rarity', ['magic', 'rare', 'legendary', 'common'], 'rare'), ' ilvl ', num('ilvl', f.al || 1), ' ', btn('forge', 'Forge')]),
      h('div', [h('h3', 'Hero'), 'Level ', num('level', w.player.level), ' ', btn('level', 'Set'), ' ', btn('heal', 'Heal'), ' ', btn('reveal', 'Reveal map'),
        h('label', [h('input', { type: 'checkbox', name: 'god', checked: st.god }), ' Godmode'])]),
      h('div', [h('h3', 'Travel'), 'Floor ', num('floor', Math.max(1, f.n || 1)), ' ', btn('travel', 'Go'), ' ', btn('town', 'Town')]),
      h('div', [h('h3', 'DPS dummy'), btn('dummy', 'Place dummy'), ' ', h('span.dbg-dps', st.dummy ? dps().toFixed(1) + ' dps' : '—')]),
      h('div', [h('h3', 'Scenario'), sel('scn', ['1', '2', '3']), ' ', btn('ssave', 'Save'), ' ', btn('sload', 'Load')]),
      h('div', [h('h3', 'Bot watch'), sel('speed', ['1', '2', '4', '8'], String(st.speed)), ' ', btn('bot', st.bot ? 'Stop bot' : 'Run bot')]),
      h('div.dbg-wide', [h('h3', 'Data Lab'), sel('table', ['monsters', 'skills', 'bases', 'affixes', 'legendaries', 'bosses', 'balance']), ' id ', h('input', { name: 'pid', style: 'width:120px' }),
        h('textarea', { name: 'fields', rows: 2, style: 'width:100%', placeholder: '{"hp": 40}' }), btn('patch', 'Apply patch'), ' ', btn('unpatch', 'Clear patches (reload)'), ' ', h('span.muted.small', readLab().length + ' active')]),
    ]));
    const val = (n) => /** @type {HTMLInputElement} */ (el.querySelector('[name="' + n + '"]')).value;
    BD.ui.dom.delegate(el, {
      spawn: () => spawn(val('mon'), val('rank'), +val('al'), +val('count')),
      boss: () => spawn(val('boss'), 'boss', 0, 1),
      forge: () => forge(val('slot'), val('rarity'), +val('ilvl')),
      level: () => setLevel(+val('level')),
      heal: () => { const p = W().player; p.hp = BD.sim.stats.statsOf(W(), p).maxLife; },
      reveal,
      travel: () => travel(+val('floor')),
      town: () => travel('town'),
      dummy,
      ssave: () => saveScenario(val('scn')),
      sload: () => loadScenario(val('scn')),
      bot: () => { bot(!st.bot, +val('speed')); BD.ui.panels.rebuild('arena'); },
      patch: () => { try { BD.data.patch(val('table'), val('pid'), JSON.parse(val('fields'))); BD.ui.panels.rebuild('arena'); } catch (e) { alert(String(e)); } },
      unpatch: () => { localStorage.removeItem(LAB_KEY); location.reload(); },
    });
    el.querySelector('[name="god"]').addEventListener('change', (e) => { st.god = /** @type {HTMLInputElement} */ (e.target).checked; });
  }
  BD.ui.panels.register({ id: 'arena', build, modal: false, pausesWorld: false, closeOnEsc: true });
  setInterval(() => { const s = document.querySelector('.dbg-dps'); if (s && st.dummy) s.textContent = dps().toFixed(1) + ' dps'; }, 500);
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'F4' || BD.app.state !== 'playing') return;
    e.preventDefault();
    if (BD.ui.panels.isOpen('arena')) BD.ui.panels.close('arena'); else BD.ui.panels.open('arena');
  });
  badge();

  BD.debug.arena = { st, spawn, forge, setLevel, dummy, travel, bot, dps };
})(globalThis.BD);
