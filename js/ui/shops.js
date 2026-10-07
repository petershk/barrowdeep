// @ts-check
// Town shops on one template (07 §6.3): wares on the left with comparison, pack on the right,
// a services row, buyback. Smith, Curio Dealer, Temple and Home (rest + stash).
(function (BD) {
  'use strict';

  const { h } = BD.ui.dom;
  const Commands = () => BD.sim.commands;
  const Economy = () => BD.sim.economy;
  let sel = null, tab = 'wares', stashTab = 0;

  /** a selector suffix such as '.sel' when the condition holds, else nothing */
  const flag = (on, cls) => (on ? cls : '');

  function cell(w, item, opts) {
    const d = BD.sim.items.derive(item);
    const usable = BD.sim.inventory.canEquip(w, w.player, item).ok;
    const cellSel = 'div.it-cell.r-' + item.rarity + flag(sel === item.uid, '.selected') + flag(!usable, '.unusable');
    const el = h(cellSel, { data: opts.data }, [
      h('img.it-icon', { src: BD.view.sprites.dataURL(BD.view.itemArt.artFor(d.category), 3), alt: '' }),
      h('span.it-cell-name', d.name + (item.enhance ? ' +' + item.enhance : '')),
      opts.price != null ? h('span.it-cell-price', opts.price + 'g') : null,
    ]);
    const tipOpts = { price: opts.price, priceLabel: opts.priceLabel, compare: opts.compare !== false };
    BD.ui.tooltip.bind(el, (c) => BD.ui.itemTooltip.body(c, w, item, tipOpts));
    return el;
  }

  function packColumn(w, verb, priceFn) {
    const p = w.player;
    const list = h('div.pack-list.shop-pack');
    for (const it of p.pack) {
      list.appendChild(cell(w, it, { data: { action: 'packClick', uid: it.uid }, price: priceFn ? priceFn(it) : null, priceLabel: verb }));
    }
    const help = verb ? 'Shift-click or right-click to ' + verb.toLowerCase() + '. Click to select for services.' : 'Click to select.';
    return h('div.col', [
      h('div.pack-head', [h('b', 'Pack '), h('span.muted', p.pack.length + ' / 30 · '), h('b.gold', p.gold + ' gold')]),
      h('div.muted.small', help),
      list,
    ]);
  }
  function equippedColumn(w) {
    const p = w.player;
    const list = h('div.pack-list.shop-pack');
    for (const s in p.equip) {
      if (p.equip[s]) list.appendChild(cell(w, p.equip[s], { data: { action: 'packClick', uid: p.equip[s].uid }, compare: false }));
    }
    return list;
  }

  function header(el, title, sub) {
    el.appendChild(h('h2', title));
    if (sub) el.appendChild(h('div.shop-sub.muted', sub));
  }
  function footer(el, id) {
    el.appendChild(h('div.row', { style: 'justify-content:center;margin-top:10px' }, [
      h('button.btn', { data: { action: 'close' } }, 'Leave'),
    ]));
    return { close: () => BD.ui.panels.close(id) };
  }
  function rightClickSell(el, w, verb) {
    el.addEventListener('contextmenu', (ev) => {
      const c = BD.ui.dom.closest(ev.target, '[data-action="packClick"]');
      if (!c) return;
      ev.preventDefault();
      verb(c.dataset.uid);
    });
  }

  // ---------------- Smith ----------------
  function buildSmith(el) {
    const w = BD.app.world, t = Economy().townState(w), cs = Economy().costs(w);
    header(el, 'Garran the Smith', 'Arms and armour of the town\'s forge. Stock changes when you reroll or a new act begins.');
    const tabBtn = (id, label) => h('button.btn.tiny' + flag(tab === id, '.primary'), { data: { action: 'tab', t: id } }, label);
    const tabs = h('div.row.tabs', [tabBtn('wares', 'Wares'), tabBtn('buyback', 'Buyback (' + t.buyback.length + ')')]);
    const wares = buildSmithWares(w, t);
    const svc = buildSmithServices(w, cs);
    el.appendChild(h('div.shop-cols', [
      h('div.col', [tabs, wares, svc]),
      h('div.col', [packColumn(w, 'Sell', Economy().sellPrice), h('div.muted.small', 'Equipped (select to enhance):'), equippedColumn(w)]),
    ]));
    wireSmith(el, w);
  }

  /** the stock (or buyback) list with prices */
  function buildSmithWares(w, t) {
    const wares = h('div.pack-list.shop-wares');
    const list = tab === 'buyback' ? t.buyback : t.stock;
    list.forEach((it, i) => {
      const price = tab === 'buyback' ? Economy().sellPrice(it) : Economy().price(it);
      wares.appendChild(cell(w, it, { data: { action: 'buy', idx: i }, price, priceLabel: 'Price' }));
    });
    if (!list.length) wares.appendChild(h('div.muted', tab === 'buyback' ? 'Nothing sold this visit.' : 'Sold out.'));
    return wares;
  }

  /** reroll and enhance buttons, plus reforge for a selected rare */
  function buildSmithServices(w, cs) {
    const selItem = sel ? Economy().findItem(w, sel) : null;
    const enhanceOff = !selItem || (selItem.enhance || 0) >= 5 || w.player.gold < Economy().enhanceCost(w, selItem);
    const enhanceLabel = selItem
      ? 'Enhance ' + BD.sim.items.derive(selItem).name + ' to +' + ((selItem.enhance || 0) + 1)
        + ' (' + Economy().enhanceCost(w, selItem) + 'g)'
      : 'Enhance (select an item)';
    const svc = h('div.services', [
      h('button.btn', { data: { action: 'reroll' }, disabled: w.player.gold < cs.reroll },
        'Reroll stock (' + (cs.reroll ? cs.reroll + 'g' : 'free') + ')'),
      h('button.btn', { data: { action: 'enhance' }, disabled: enhanceOff }, enhanceLabel),
    ]);
    if (selItem && selItem.rarity === 'rare') svc.appendChild(buildReforgeRow(w, cs, selItem));
    return svc;
  }

  function buildReforgeRow(w, cs, selItem) {
    const d = BD.sim.items.derive(selItem);
    const rf = h('div.reforge', [h('span.muted', 'Reforge one affix (' + cs.reforge + 'g): ')]);
    d.lines.filter((l) => !l.implicit).forEach((l, j) => {
      const text = BD.sim.itemsDescribe.view(w, w.player, selItem).lines[d.lines.indexOf(l)].text;
      rf.appendChild(h('button.btn.tiny', { data: { action: 'reforge', j }, disabled: w.player.gold < cs.reforge }, text));
    });
    return rf;
  }

  function wireSmith(el, w) {
    const f = footer(el, 'smith');
    const rb = () => BD.ui.panels.rebuild('smith');
    rightClickSell(el, w, (uid) => {
      Commands().apply(w, { type: 'Sell', uid });
      rb();
    });
    el.addEventListener('click', (ev) => {
      const c = BD.ui.dom.closest(ev.target, '[data-action="packClick"]');
      if (c && /** @type {MouseEvent} */ (ev).shiftKey) {
        Commands().apply(w, { type: 'Sell', uid: c.dataset.uid });
        ev.stopPropagation();
        rb();
      }
    }, true);
    BD.ui.dom.delegate(el, Object.assign(f, {
      tab: (tg) => {
        tab = tg.dataset.t;
        rb();
      },
      buy: (tg) => {
        Commands().apply(w, { type: 'Buy', idx: Number(tg.dataset.idx), from: tab === 'buyback' ? 'buyback' : 'stock' });
        rb();
      },
      reroll: () => {
        Commands().apply(w, { type: 'Reroll' });
        rb();
      },
      enhance: () => {
        Commands().apply(w, { type: 'Enhance', uid: sel });
        rb();
      },
      reforge: (tg) => {
        const it = Economy().findItem(w, sel);
        const d = BD.sim.items.derive(it);
        const nonImpl = d.lines.filter((l) => !l.implicit);
        const target = nonImpl[Number(tg.dataset.j)];
        const idx = it.affixes.findIndex((a) => a.id === target.affix);
        Commands().apply(w, { type: 'Reforge', uid: sel, affixIdx: idx });
        rb();
      },
      packClick: (tg) => {
        sel = sel === tg.dataset.uid ? null : tg.dataset.uid;
        rb();
      },
    }));
  }

  // ---------------- Curio Dealer ----------------
  const GAMBLE_SLOTS = [
    ['weapon', 'Weapon'], ['offhand', 'Offhand'], ['chest', 'Armour'], ['helm', 'Helm'],
    ['cloak', 'Cloak'], ['amulet', 'Amulet'], ['ring', 'Ring'],
  ];
  function buildCurio(el, arg) {
    const w = BD.app.world, cs = Economy().costs(w);
    header(el, 'Vesk the Curio Dealer', 'Pick a slot and pay. 60% magic, 32% rare, 8% legendary — at the act\'s item level.');
    const grid = h('div.gamble-grid', GAMBLE_SLOTS.map(([s, n]) =>
      h('button.btn', { data: { action: 'gamble', slot: s }, disabled: w.player.gold < cs.gamble }, n + ' — ' + cs.gamble + 'g')));
    const last = arg && arg.last ? Economy().findItem(w, arg.last) : null;
    const received = last ? h('div.col', [h('div.muted', 'You receive:'), cell(w, last, { data: {} })]) : null;
    el.appendChild(h('div.shop-cols', [h('div.col', [grid, received]), packColumn(w, 'Sell', Economy().sellPrice)]));
    const f = footer(el, 'curio');
    rightClickSell(el, w, (uid) => {
      Commands().apply(w, { type: 'Sell', uid });
      BD.ui.panels.rebuild('curio');
    });
    BD.ui.dom.delegate(el, Object.assign(f, {
      gamble: (tg) => {
        const uid = Commands().apply(w, { type: 'Gamble', slot: tg.dataset.slot });
        const s = BD.ui.panels.stack.find((x) => x.id === 'curio');
        if (s && uid) s.arg = { last: uid };
        BD.ui.panels.rebuild('curio');
      },
      packClick: () => {},
    }));
  }

  // ---------------- Temple ----------------
  function buildTemple(el) {
    const w = BD.app.world, r = w.run, t = Economy().townState(w), cs = Economy().costs(w), p = w.player;
    header(el, 'Mother Alys of the Temple', 'Scrolls, blessings for the road, and the unmaking of choices.');
    const bless = h('div.col', [h('h3', 'Blessing — until you next return to town (' + cs.blessing + 'g)')]);
    if (r.blessing) {
      const b = BD.data.blessings[r.blessing];
      bless.appendChild(h('div.gold', 'Blessed: ' + b.name + ' (' + b.desc + ')'));
    } else {
      for (const id of t.blessOffer) {
        const b = BD.data.blessings[id];
        bless.appendChild(h('button.btn', { data: { action: 'bless', id }, disabled: p.gold < cs.blessing }, b.name + ' — ' + b.desc));
      }
    }
    const flaskDone = t.flaskUpgradedAct >= r.act || p.flask.permMax >= BD.data.balance.player.flaskPermMax;
    const svc = h('div.col', [
      h('h3', 'Services'),
      h('button.btn', { data: { action: 'scroll' }, disabled: p.gold < cs.portal },
        'Town Portal scroll — ' + cs.portal + 'g (you carry ' + (p.pouch.portal || 0) + ')'),
      h('button.btn', { data: { action: 'flask' }, disabled: flaskDone || p.gold < cs.flask },
        flaskDone ? 'Flask already deepened this act' : 'Deepen the flask: +1 charge — ' + cs.flask + 'g'),
      h('button.btn.danger', { data: { action: 'respec' }, disabled: p.gold < cs.respec },
        'Respec skills and attributes — ' + cs.respec + 'g'),
      h('div.muted.small', 'Respec cost rises with every respec this descent.'),
    ]);
    el.appendChild(h('div.shop-cols', [bless, svc]));
    const f = footer(el, 'temple');
    const rb = () => BD.ui.panels.rebuild('temple');
    BD.ui.dom.delegate(el, Object.assign(f, {
      bless: (tg) => {
        Commands().apply(w, { type: 'Bless', id: tg.dataset.id });
        rb();
      },
      scroll: () => {
        Commands().apply(w, { type: 'BuyScroll', kind: 'portal' });
        rb();
      },
      flask: () => {
        Commands().apply(w, { type: 'FlaskUpgrade' });
        rb();
      },
      respec: () => {
        if (!confirm('Unlearn every skill and attribute point?')) return;
        Commands().apply(w, { type: 'Respec' });
        rb();
      },
    }));
  }

  // ---------------- Home: rest + stash ----------------
  function buildHome(el) {
    const w = BD.app.world, p = w.player;
    const tabs = w.stash || [[]];
    const n = (w.run.flags.stashTabs || 1);
    if (stashTab >= n) stashTab = 0;
    header(el, 'Your Hearth', 'Rest is free. The stash is shared by every character you make.');
    const tabRow = h('div.row.tabs', [h('button.btn', { data: { action: 'rest' } }, 'Rest (full restore, refill the flask)')]);
    for (let i = 0; i < n; i++) {
      tabRow.appendChild(h('button.btn.tiny' + flag(i === stashTab, '.primary'), { data: { action: 'stab', i } }, 'Tab ' + (i + 1)));
    }
    const tabItems = tabs[stashTab] || [];
    const list = h('div.pack-list.shop-wares');
    for (const it of tabItems) list.appendChild(cell(w, it, { data: { action: 'unstash', uid: it.uid } }));
    for (let i = tabItems.length; i < 20; i++) list.appendChild(h('div.it-cell.empty.ghost'));
    el.appendChild(h('div.shop-cols', [
      h('div.col', [
        tabRow,
        h('div.muted.small', 'Click a stashed item to take it. Shift-click or right-click a pack item to stash it.'),
        list,
      ]),
      packColumn(w, 'Stash', null),
    ]));
    const f = footer(el, 'home');
    const rb = () => {
      BD.app.bus.emit({ type: 'stash.changed' });
      BD.ui.panels.rebuild('home');
    };
    rightClickSell(el, w, (uid) => {
      Commands().apply(w, { type: 'Stash', uid, tab: stashTab });
      rb();
    });
    BD.ui.dom.delegate(el, Object.assign(f, {
      rest: () => {
        Commands().apply(w, { type: 'Rest' });
        BD.app.dispatch(w);
        BD.ui.log.line('You rest by the hearth.');
      },
      stab: (tg) => {
        stashTab = Number(tg.dataset.i);
        BD.ui.panels.rebuild('home');
      },
      unstash: (tg) => {
        Commands().apply(w, { type: 'Unstash', uid: tg.dataset.uid, tab: stashTab });
        rb();
      },
      packClick: (tg, ev) => {
        if (!ev.shiftKey) return;
        Commands().apply(w, { type: 'Stash', uid: tg.dataset.uid, tab: stashTab });
        rb();
      },
    }));
  }

  /** Shift-click from the inventory: sell at a shop, stash at home */
  BD.ui.transfer = (uid) => {
    const w = BD.app.world;
    if (BD.ui.panels.isOpen('home')) Commands().apply(w, { type: 'Stash', uid, tab: stashTab });
    else if (BD.ui.panels.isOpen('smith') || BD.ui.panels.isOpen('curio')) Commands().apply(w, { type: 'Sell', uid });
  };

  function onOpen() {
    sel = null;
    tab = 'wares';
  }
  const opts = { wide: true, onOpen };
  BD.ui.panels.register(Object.assign({ id: 'smith', build: buildSmith }, opts));
  BD.ui.panels.register(Object.assign({ id: 'curio', build: buildCurio }, opts));
  BD.ui.panels.register(Object.assign({ id: 'temple', build: buildTemple }, opts));
  BD.ui.panels.register(Object.assign({ id: 'home', build: buildHome }, opts));
})(globalThis.BD);
