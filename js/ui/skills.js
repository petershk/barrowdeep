// @ts-check
// Skills panel (K): three branch columns drawn as a tree (tier rows + connectors), rank pips,
// learn (+), assign to RMB / 1–4, breakpoints highlighted, "Now / Next" via tooltip (Shift).
(function (BD) {
  'use strict';

  const { h } = BD.ui.dom;
  const CMD = () => BD.sim.commands;
  const TIER_LVL = { 1: 1, 2: 6, 3: 12, 4: 18 };

  function build(el) {
    const w = BD.app.world, p = w.player;
    const cls = BD.data.classes[p.cls];
    el.appendChild(h('h2', 'Skills — ' + cls.name));
    el.appendChild(h('div.skills-head', [
      h('span', 'Unspent points: '), h('b.gold', String(p.unspent.skill)),
      h('span.muted', '  ·  Click + to learn. Click a slot letter to place a skill on the bar.'),
    ]));
    const cols = h('div.skill-cols');
    for (const br of cls.branches) {
      const col = h('div.skill-col', [h('h3', br.name)]);
      const list = Object.values(BD.data.skills).filter((s) => s.cls === p.cls && s.branch === br.id).sort((a, b) => a.tier - b.tier);
      list.forEach((ab, i) => {
        if (i > 0) col.appendChild(h('div.skill-link' + (p.skills[list[i - 1].id] ? '.on' : '')));
        col.appendChild(card(w, p, ab));
      });
      cols.appendChild(col);
    }
    el.appendChild(cols);
    el.appendChild(h('div.row', { style: 'justify-content:center;margin-top:12px' }, [
      h('button.btn', { data: { action: 'close' } }, 'Close (K)'),
    ]));
    BD.ui.dom.delegate(el, {
      learn: (t) => { if (CMD().apply(w, { type: 'SpendSkill', id: t.dataset.id })) BD.ui.panels.rebuild('skills'); },
      assign: (t) => {
        const slot = t.dataset.slot;
        CMD().apply(w, { type: 'SetBar', slot, id: p.bar[slot] === t.dataset.id ? null : t.dataset.id });
        BD.ui.panels.rebuild('skills');
      },
      close: () => BD.ui.panels.close('skills'),
    });
  }

  function card(w, p, ab) {
    const hard = p.skills[ab.id] || 0;
    const rank = BD.sim.abilities.rankOf(w, p, ab.id);
    const max = ab.tier === 4 ? 1 : 5;
    const can = BD.sim.progression.canLearn(w, p, ab.id);
    const locked = p.level < TIER_LVL[ab.tier];
    const pips = h('div.pips-row');
    for (let i = 1; i <= max; i++) {
      const fill = i <= hard ? '.on' : i <= rank ? '.soft' : '';
      const bp = (i === 3 || i === 5) && max === 5 ? '.bp' : '';
      pips.appendChild(h('span.rp' + fill + bp));
    }
    const slotBtn = (s) => h('button.slot-btn' + (p.bar[s] === ab.id ? '.on' : ''), {
      data: { action: 'assign', slot: s, id: ab.id },
      disabled: !hard,
      title: 'Place on ' + (s === 'rmb' ? 'right mouse' : 'slot ' + s[1]),
    }, s === 'rmb' ? 'R' : s[1]);
    const slotBtns = ab.passive
      ? h('div.slot-btns', h('span.muted.small', 'Keystone'))
      : h('div.slot-btns', ['rmb', 's1', 's2', 's3', 's4'].map(slotBtn));
    const sub = (ab.keystone ? 'Keystone' : 'Tier ' + ab.tier)
      + (locked ? ' · level ' + TIER_LVL[ab.tier] : '')
      + (rank > hard ? ' · +' + (rank - hard) : '');
    const el = h('div.skill-card' + (hard ? '.learned' : '') + (locked ? '.locked' : '') + (ab.keystone ? '.keystone' : ''), [
      h('img.sk-icon', { src: BD.view.icons.url(ab.icon), alt: '' }),
      h('div.skill-meta', [h('div.skill-name', ab.name), h('div.skill-sub.muted', sub), pips]),
      h('button.btn.learn', { data: { action: 'learn', id: ab.id }, disabled: !can.ok, title: can.ok ? 'Learn' : can.why }, '+'),
      slotBtns,
    ]);
    BD.ui.tooltip.bind(el, (c, shift) => BD.ui.dom.append(c, BD.ui.tooltip.skillBody(w, p, ab.id, shift, Math.max(1, rank))));
    return el;
  }

  BD.ui.panels.register({ id: 'skills', build, wide: true, swappable: true });
})(globalThis.BD);
