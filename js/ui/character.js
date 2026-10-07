// @ts-check
// Character sheet (C): attributes with +1 / +5 and undo-until-close, derived stats with breakdown
// tooltips generated from statsOf().breakdown — no formulas here.
(function (BD) {
  'use strict';

  const { h } = BD.ui.dom;
  const CMD = () => BD.sim.commands;
  const ATTR = [
    ['str', 'Strength', '+3% damage with Strength weapons, +0.5 armour'],
    ['dex', 'Dexterity', '+3% damage with Dexterity weapons, +0.1% crit chance, +2 evasion'],
    ['mag', 'Magic', '+3% spell damage and Magic-weapon damage, +1.5 mana (Magician), better status chances'],
    ['vit', 'Vitality', '+3 life'],
  ];
  let session = { str: 0, dex: 0, mag: 0, vit: 0 };

  function onOpen() { session = { str: 0, dex: 0, mag: 0, vit: 0 }; }

  function breakdownTip(s, key, label, total) {
    return (c) => {
      c.appendChild(h('div.tt-title', label));
      const rows = (key === 'life' ? s.bdLife.concat(s.bd.life || []) : s.bd[key]) || [];
      for (const r of rows) {
        const val = typeof r.value === 'number' ? (r.value > 0 ? '+' : '') + BD.core.util.fmtNum(r.value) : r.value;
        c.appendChild(h('div.tt-line', r.source + ': ' + val));
      }
      c.appendChild(h('div.tt-line.dmg', '= ' + total));
    };
  }

  function build(el) {
    const w = BD.app.world, p = w.player;
    const s = BD.sim.stats.statsOf(w, p);
    const cls = BD.data.classes[p.cls];
    el.appendChild(h('h2', p.name + ' — level ' + p.level + ' ' + cls.name));
    const left = h('div.col');
    left.appendChild(h('h3', 'Attributes' + (p.unspent.attr ? ' — ' + p.unspent.attr + ' to spend' : '')));
    for (const [k, name, help] of ATTR) {
      const row = h('div.attr-row', [
        h('span.attr-name', name), h('b.attr-val', String(s[k])),
        h('button.btn.tiny', { data: { action: 'add', key: k, n: 1 }, disabled: !p.unspent.attr }, '+1'),
        h('button.btn.tiny', { data: { action: 'add', key: k, n: 5 }, disabled: p.unspent.attr < 1 }, '+5'),
        h('button.btn.tiny', { data: { action: 'undo', key: k }, disabled: !session[k] }, 'Undo'),
      ]);
      BD.ui.tooltip.bind(row, (c) => {
        c.appendChild(h('div.tt-title', name));
        c.appendChild(h('div.tt-desc', help));
        breakdownTip(s, k, name, s[k])(c);
      });
      left.appendChild(row);
    }
    const right = h('div.col');
    const stat = (label, val, key) => {
      const r = h('div.stat-row', [h('span', label), h('b', String(val))]);
      if (key) BD.ui.tooltip.bind(r, breakdownTip(s, key, label, val));
      return r;
    };
    const w8 = s.weapon;
    right.appendChild(h('h3', 'Offense'));
    right.appendChild(stat('Weapon', w8.name || w8.baseName || 'Fists'));
    right.appendChild(stat('Weapon damage', w8.dmg[0] + '–' + w8.dmg[1]));
    right.appendChild(stat('Damage bonus', '+' + Math.round(s.dmg_pct + 3 * s.wieldValue) + '%', 'dmg_pct'));
    right.appendChild(stat('Attack cycle', Math.round(s.attackCycleMs) + ' ms', 'ias'));
    right.appendChild(stat('Critical chance', BD.core.util.fmtNum(s.critChance) + '%', 'crit'));
    right.appendChild(stat('Critical damage', '×' + BD.core.util.fmtNum(s.critMult), 'crit_dmg'));
    if (p.cls === 'magician') right.appendChild(stat('Spell damage', '+' + Math.round(s.spell_pct + 3 * s.mag) + '%', 'spell_pct'));
    right.appendChild(h('h3', 'Defense'));
    right.appendChild(stat('Life', s.maxLife, 'life'));
    right.appendChild(stat('Armour', s.armorTotal, 'armor'));
    right.appendChild(stat('Evasion', s.evasionTotal, 'evasion'));
    if (s.blockChance) right.appendChild(stat('Block chance', BD.core.util.fmtNum(s.blockChance) + '%', 'block'));
    right.appendChild(stat('Resists (F / C / L / P)', [s.res.fire, s.res.cold, s.res.light, s.res.pois].join(' / '), 'res_all'));
    right.appendChild(h('h3', 'Utility'));
    right.appendChild(stat('Movement speed', '+' + Math.round(s.move_pct) + '%', 'move_pct'));
    right.appendChild(stat('Magic find', '+' + Math.round(s.magic_find) + '%', 'magic_find'));
    right.appendChild(stat('Gold find', '+' + Math.round(s.gold_find) + '%', 'gold_find'));
    right.appendChild(stat('Gold', p.gold));
    el.appendChild(h('div.char-cols', [left, right]));
    el.appendChild(h('div.row', { style: 'justify-content:center;margin-top:12px' }, [
      h('button.btn', { data: { action: 'close' } }, 'Close (C)'),
    ]));
    BD.ui.dom.delegate(el, {
      add: (t) => {
        const k = t.dataset.key, n = Math.min(Number(t.dataset.n), p.unspent.attr);
        if (n > 0 && CMD().apply(w, { type: 'SpendAttr', key: k, n })) {
          session[k] += n;
          BD.ui.panels.rebuild('character');
        }
      },
      undo: (t) => {
        const k = t.dataset.key;
        if (session[k] > 0 && CMD().apply(w, { type: 'UnspendAttr', key: k, n: session[k], max: session[k] })) {
          session[k] = 0;
          BD.ui.panels.rebuild('character');
        }
      },
      close: () => BD.ui.panels.close('character'),
    });
  }

  BD.ui.panels.register({ id: 'character', build, onOpen, swappable: true });
})(globalThis.BD);
