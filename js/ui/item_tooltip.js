// @ts-check
// Item tooltips: rarity-coloured name + shape tag, type line, base stats, affixes (hooks and procs
// styled differently, legendary power in orange italic), requirement (red if unmet), permission,
// and comparison vs equipped (▲ / ▼ per stat, DPS delta, both rings compared).
(function (BD) {
  'use strict';

  const { h } = BD.ui.dom;
  const P = () => BD.view.palette;
  const seen = new Set();   // legendary "unveil" shimmer the first time it is hovered

  function body(c, world, item, opts) {
    const p = world.player;
    const v = BD.sim.itemsDescribe.view(world, p, item);
    const tag = P().RARITY_TAG[item.rarity];
    const unveil = item.rarity === 'legendary' && !seen.has(item.uid);
    if (unveil) seen.add(item.uid);
    c.appendChild(h('div.it-name.r-' + item.rarity + (unveil ? '.unveil' : ''), (tag ? tag + ' ' : '') + v.name + (v.enhance ? ' +' + v.enhance : '')));
    c.appendChild(h('div.tt-sub', v.type + ' · item level ' + v.ilvl));
    for (const b of v.base) c.appendChild(h('div.it-base', b));
    for (const l of v.lines) c.appendChild(h('div.it-line.k-' + l.kind, l.text));
    if (v.power) c.appendChild(h('div.it-power', v.power));
    if (v.req) c.appendChild(h('div.it-req' + (v.req.met ? '' : '.bad'), v.req.text));
    if (v.perm) c.appendChild(h('div.it-req.bad', v.perm));
    if (opts && opts.price != null) c.appendChild(h('div.it-price', (opts.priceLabel || 'Price') + ': ' + opts.price + ' gold'));
    else c.appendChild(h('div.it-value.muted', 'Sells for ' + Math.round(v.value / 5) + ' gold'));
    if (opts && opts.compare === false) return;
    const cmp = BD.sim.itemsDescribe.compare(world, p, item);
    for (const cm of cmp) {
      if (cm.equipped && cm.equipped.uid === item.uid) continue;
      const head = cm.equipped ? 'Compared with ' + BD.sim.items.derive(cm.equipped).name + (cmp.length > 1 ? ' (' + (cm.slot === 'ring1' ? 'left' : 'right') + ' ring)' : '') : 'Slot empty';
      const box = h('div.it-cmp', [h('div.it-cmp-head', head)]);
      const dps = Math.round(cm.dps * 10) / 10;
      if (Math.abs(dps) >= 0.1) box.appendChild(h('div.' + (dps > 0 ? 'up' : 'down'), (dps > 0 ? '▲ +' : '▼ ') + dps + ' damage per second'));
      const eh = Math.round(cm.ehp);
      if (Math.abs(eh) >= 1) box.appendChild(h('div.' + (eh > 0 ? 'up' : 'down'), (eh > 0 ? '▲ +' : '▼ ') + eh + ' effective life'));
      for (const r of cm.rows.slice(0, 8)) box.appendChild(h('div.' + (r.delta > 0 ? 'up' : 'down'), (r.delta > 0 ? '▲ +' : '▼ ') + r.delta + ' ' + r.label));
      c.appendChild(box);
    }
  }

  BD.ui.itemTooltip = { body };
})(globalThis.BD);
