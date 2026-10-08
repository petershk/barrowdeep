// @ts-check
// Soul Shrine (01 §8.3): breadth unlocks bought with souls; Ascension levels per difficulty.
(function (BD) {
  'use strict';

  const { h } = BD.ui.dom;

  function build(el) {
    const m = BD.ui.meta.get();
    el.appendChild(h('h2', 'The Soul Shrine'));
    const tally = '   (gathered in all: ' + m.soulsTotal + ' · descents: ' + m.runs + ' · victories: ' + m.victories + ')';
    el.appendChild(h('div.shrine-souls', [h('span', 'Souls: '), h('b.souls', String(m.souls)), h('span.muted', tally)]));
    const list = h('div.shrine-list');
    for (const perk of BD.data.shrine) {
      const owned = !!m.unlocks[perk.id];
      const locked = perk.requires && !m.unlocks[perk.requires];
      let tag = 'div.shrine-perk';
      if (owned) tag += '.owned';
      if (locked) tag += '.locked';
      list.appendChild(h(tag, [
        h('div', [h('div.perk-name', perk.name), h('div.muted.small', perk.desc)]),
        owned
          ? h('span.gold', 'Unlocked')
          : h('button.btn.tiny', {
            data: { action: 'buy', id: perk.id },
            disabled: locked || m.souls < perk.cost,
          }, perk.cost + ' souls'),
      ]));
    }
    el.appendChild(list);
    const asc = Object.entries(m.ascension || {});
    el.appendChild(h('h3', 'Ascension'));
    const ascLine = ([d, n]) => h('div', BD.data.difficulties[d].name + ': up to Ascension ' + Math.min(10, n));
    el.appendChild(asc.length
      ? h('div', asc.map(ascLine))
      : h('div.muted', 'Defeat Malgoth to unlock Ascension on that difficulty.'));
    el.appendChild(h('div.row', { style: 'justify-content:center;margin-top:12px' }, [
      h('button.btn', { data: { action: 'back' } }, 'Back'),
    ]));
    BD.ui.dom.delegate(el, {
      buy: (t) => {
        const perk = BD.data.shrine.find((p) => p.id === t.dataset.id);
        if (!perk || m.unlocks[perk.id] || m.souls < perk.cost) return;
        m.souls -= perk.cost;
        m.unlocks[perk.id] = true;
        BD.ui.meta.save();
        BD.ui.panels.rebuild('shrine');
      },
      back: () => {
        BD.ui.panels.close('shrine');
        BD.ui.menu.open();
      },
    });
  }

  BD.ui.panels.register({ id: 'shrine', build, wide: true, closeOnEsc: false });
})(globalThis.BD);
