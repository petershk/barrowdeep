// @ts-check
// Waypoint travel menu, load screen, journal (J) and NPC talk routing.
(function (BD) {
  'use strict';

  const { h } = BD.ui.dom;

  function buildWaypoints(el) {
    const w = BD.app.world, r = w.run;
    el.appendChild(h('h2', 'Waypoints'));
    const list = h('div.choice-list');
    const wpEntry = (n) => [n, BD.data.lookFor(BD.data.floors.byN(n).biome, n).name + ' — floor ' + n];
    const entries = [[0, 'Town of Brennor']].concat(BD.data.floors.WAYPOINTS.map(wpEntry));
    if (r.flags.sanctum) entries.push([13, "Malgoth's Sanctum"]);
    const here = w.floor.key === 'town' ? 0 : w.floor.n;
    for (const [n, name] of entries) {
      const on = n === 0 || n === 13 || r.waypoints.includes(n);
      let tag = 'div.choice';
      if (!on) tag += '.locked';
      if (n === here) tag += '.sel';
      list.appendChild(h(tag, {
        data: { action: on && n !== here ? 'go' : '', n },
      }, [h('b', name), on ? null : h('span.muted', ' — not yet attuned')]));
    }
    el.appendChild(list);
    el.appendChild(h('div.row', { style: 'justify-content:center;margin-top:10px' }, [
      h('button.btn', { data: { action: 'close' } }, 'Close'),
    ]));
    BD.ui.dom.delegate(el, {
      go: (t) => {
        BD.ui.panels.close('waypoints');
        BD.input.intent.issue({ type: 'TravelWaypoint', floor: Number(t.dataset.n) });
      },
      close: () => BD.ui.panels.close('waypoints'),
    });
  }

  function buildLoad(el) {
    el.appendChild(h('h2', 'Continue'));
    const chars = BD.ui.saves.list();
    const list = h('div.choice-list');
    if (!chars.length) list.appendChild(h('div.muted', 'No characters yet.'));
    for (const c of chars) {
      const cls = BD.data.classes[c.cls];
      const where = c.floor ? 'floor ' + c.floor : 'Brennor';
      let status = where;
      if (!c.alive) status = c.victory ? 'Victorious' : 'Fallen';
      const summary = 'Level ' + c.level + ' ' + cls.name + ' · ' + BD.data.difficulties[c.difficulty].name + ' · ' + status;
      const rowTag = 'div.choice.load-row' + (c.alive ? '' : '.locked');
      list.appendChild(h(rowTag, { data: { action: c.alive ? 'load' : '', id: c.id } }, [
        h('img.load-art', { src: BD.view.sprites.dataURL(cls.art, 2), alt: '' }),
        h('div', [h('b', c.name), h('div.muted', summary)]),
        c.alive
          ? h('button.btn.tiny.danger', { data: { action: 'sacrifice', id: c.id }, title: 'Sacrifice for half the souls' }, 'Sacrifice')
          : h('button.btn.tiny', { data: { action: 'forget', id: c.id } }, 'Forget'),
      ]));
    }
    el.appendChild(list);
    el.appendChild(h('div.row', { style: 'justify-content:space-between;margin-top:12px' }, [
      h('button.btn', { data: { action: 'back' } }, 'Back'),
      h('div.row', [
        h('button.btn', { data: { action: 'export' } }, 'Export characters'),
        h('button.btn', { data: { action: 'import' } }, 'Import'),
      ]),
    ]));
    BD.ui.dom.delegate(el, {
      load: (t) => {
        const w = BD.ui.saves.loadChar(t.dataset.id);
        if (!w) return;
        BD.ui.panels.closeAll();
        BD.app.setWorld(w);
      },
      sacrifice: (t, ev) => {
        ev.stopPropagation();
        const w = BD.ui.saves.loadChar(t.dataset.id);
        if (!w) return;
        const s = BD.sim.death.souls(w, true);
        if (!confirm('Sacrifice ' + w.player.name + ' for ' + s + ' souls? This cannot be undone.')) return;
        BD.ui.meta.addSouls(s);
        BD.ui.saves.markDead(t.dataset.id);
        BD.ui.panels.rebuild('load');
      },
      forget: (t, ev) => {
        ev.stopPropagation();
        BD.ui.saves.deleteChar(t.dataset.id);
        BD.ui.panels.rebuild('load');
      },
      back: () => {
        BD.ui.panels.close('load');
        BD.ui.menu.open();
      },
      export: () => BD.ui.saves.exportAll(),
      import: () => BD.ui.saves.importFile(() => BD.ui.panels.rebuild('load')),
    });
  }

  function buildJournal(el) {
    const w = BD.app.world, r = w.run, p = w.player;
    const mins = Math.floor((r.timeMs || 0) / 60000);
    el.appendChild(h('h2', 'Journal'));
    el.appendChild(h('div.col', [
      h('div', [h('b', 'Goal: '), BD.ui.log.questText(w)]),
      h('div', [h('b', 'Act: '), String(Math.min(4, r.act)), ' · deepest floor ', String(r.deepestFloor)]),
      h('div', [h('b', 'Keepers slain: '), String(r.keepersSlain), ' · guardians slain: ', String(r.bossesKilled.length)]),
      h('div', [h('b', 'Time: '), mins + ' min', ' · bargains used: ', r.bargainsUsed + ' / 3']),
      h('div', [h('b', 'Blessing: '), r.blessing && BD.data.blessings ? BD.data.blessings[r.blessing].name : 'none']),
      h('div', [h('b', 'Difficulty: '), BD.data.difficulties[r.difficulty].name + (r.ascension ? ' · Ascension ' + r.ascension : '')]),
      h('div', [h('b', 'Seed: '), h('input.seed', { type: 'text', readonly: true, value: r.seed })]),
      h('div.muted', p.name + ' the ' + BD.data.backgrounds[p.background].name),
    ]));
    el.appendChild(h('div.row', { style: 'justify-content:center;margin-top:10px' }, [
      h('button.btn', { data: { action: 'close' } }, 'Close (J)'),
    ]));
    BD.ui.dom.delegate(el, { close: () => BD.ui.panels.close('journal') });
  }

  function buildShrine(el, arg) {
    el.appendChild(h('h2', 'A Shrine'));
    el.appendChild(h('p.muted', 'Choose one blessing. It lasts until you leave this floor.'));
    const row = h('div.col');
    for (const id of arg.options) {
      const b = BD.data.shrineBuffs.find((x) => x.id === id);
      row.appendChild(h('button.btn', { data: { action: 'pick', id } }, b.name + ' — ' + b.desc));
    }
    el.appendChild(row);
    BD.ui.dom.delegate(el, {
      pick: (t) => {
        BD.sim.commands.apply(BD.app.world, { type: 'ShrineChoose', id: t.dataset.id });
        BD.ui.panels.close('shrinechoice');
      },
    });
  }
  BD.ui.panels.register({ id: 'shrinechoice', build: buildShrine });
  BD.ui.panels.register({ id: 'waypoints', build: buildWaypoints });
  BD.ui.panels.register({ id: 'load', build: buildLoad, closeOnEsc: false });
  BD.ui.panels.register({ id: 'journal', build: buildJournal, swappable: true });
})(globalThis.BD);
