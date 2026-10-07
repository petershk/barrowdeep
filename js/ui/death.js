// @ts-check
// Death panel — the Ferryman's Bargain vs Harvest, with exact consequences (01 §8.1) — and the
// victory panel. The death is already saved when this opens.
(function (BD) {
  'use strict';

  const { h } = BD.ui.dom;

  function buildDeath(el, arg) {
    const w = BD.app.world, r = w.run, p = w.player;
    const chance = BD.sim.death.bargainChance(w);
    const souls = BD.sim.death.souls(w);
    el.appendChild(h('h2.death-title', 'You have died'));
    el.appendChild(h('div.death-cause', r.deathCause || 'Slain'));
    const where = typeof r.deathFloor === 'number' ? 'floor ' + r.deathFloor : 'a guardian\'s lair';
    el.appendChild(h('div.death-sub.muted', p.name + ', level ' + p.level + ' ' + BD.data.classes[p.cls].name + ' — ' + where));
    const inLair = typeof r.deathFloor === 'string' && r.deathFloor[0] === 'a';
    const returnTo = inLair ? ' — beside the gate; the guardian recovers fully.' : '\'s stairs.';
    const ferry = h('div.death-choice', [
      h('h3', "The Ferryman's Bargain"),
      chance > 0
        ? h('p', 'A ' + chance + '% chance to return. Success: you wake in Brennor at full life, lose half your gold ('
          + Math.floor(p.gold / 2) + '), and a portal waits back to the floor' + returnTo)
        : h('p.muted', 'The Ferryman will bargain no more. (Three bargains per descent.)'),
      chance > 0 ? h('p.muted', 'Failure: the soul is harvested as below. Bargains used: ' + r.bargainsUsed + ' / 3.') : null,
      h('button.btn.primary', { data: { action: 'bargain' }, disabled: chance <= 0 }, 'Bargain (' + chance + '%)'),
    ]);
    const harvest = h('div.death-choice', [
      h('h3', 'Harvest'),
      h('p', 'Bank ' + souls + ' souls for the Soul Shrine. ' + p.name + ' is gone.'),
      h('button.btn.danger', { data: { action: 'harvest' } }, 'Harvest ' + souls + ' souls'),
    ]);
    el.appendChild(h('div.death-cols', [ferry, harvest]));
    if (arg && arg.result) el.appendChild(h('div.death-result', arg.result));
    BD.ui.dom.delegate(el, {
      bargain: () => {
        const ok = BD.sim.commands.apply(w, { type: 'Bargain' });
        if (ok) { BD.ui.panels.close('death'); BD.app.dispatch(w); BD.app.saveNow('bargain'); }
        else { BD.app.dispatch(w); finish(w, 'The Ferryman takes his due.'); }
      },
      harvest: () => { BD.sim.commands.apply(w, { type: 'Harvest' }); BD.app.dispatch(w); finish(w, null); },
    });
  }

  function finish(w, line) {
    BD.ui.panels.close('death');
    BD.ui.panels.open('harvested', { souls: BD.sim.death.souls(w), line });
  }
  function buildHarvested(el, arg) {
    el.appendChild(h('h2', 'Harvested'));
    if (arg.line) el.appendChild(h('p.death-cause', arg.line));
    el.appendChild(h('p', arg.souls + ' souls flow to the Soul Shrine.'));
    el.appendChild(h('p.muted', 'Spend them on new legendaries, backgrounds and comforts for the next descent.'));
    el.appendChild(h('div.row', { style: 'justify-content:center' }, [
      h('button.btn.primary', { data: { action: 'menu' } }, 'Return to the menu'),
    ]));
    BD.ui.dom.delegate(el, { menu: () => { BD.ui.panels.closeAll(); BD.app.toMenu(); } });
  }

  function buildVictory(el, arg) {
    const w = BD.app.world, p = w.player;
    el.appendChild(h('h2.victory-title', 'Malgoth Falls'));
    el.appendChild(h('p', BD.data.strings.t('victory')));
    const mins = Math.round((w.run.timeMs || 0) / 60000);
    el.appendChild(h('div.col', [
      h('div', p.name + ', level ' + p.level + ' ' + BD.data.classes[p.cls].name),
      h('div.muted', 'Descent: ' + mins + ' minutes · Keepers slain: ' + w.run.keepersSlain + ' · Bargains: ' + w.run.bargainsUsed),
      h('div.gold', arg.souls + ' souls banked.'),
      h('div', 'Ascension unlocked for ' + BD.data.difficulties[w.run.difficulty].name + '.'),
    ]));
    el.appendChild(h('div.row', { style: 'justify-content:center;margin-top:12px' }, [
      h('button.btn.primary', { data: { action: 'menu' } }, 'Return to the menu'),
    ]));
    BD.ui.dom.delegate(el, { menu: () => { BD.ui.panels.closeAll(); BD.app.toMenu(); } });
  }

  BD.ui.panels.register({ id: 'death', build: buildDeath, closeOnEsc: false });
  BD.ui.panels.register({ id: 'harvested', build: buildHarvested, closeOnEsc: false });
  BD.ui.panels.register({ id: 'victory', build: buildVictory, closeOnEsc: false });
})(globalThis.BD);
