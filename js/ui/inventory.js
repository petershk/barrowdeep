// @ts-check
// Inventory (I): paper doll + pack list (sort by rarity / slot / value / item level, filter
// "usable by me", item lock), pouch and gold. Right-click equips; Shift-click moves to the open
// stash or shop; dropping rare+ asks first.
(function (BD) {
  'use strict';

  const { h } = BD.ui.dom;
  const Commands = () => BD.sim.commands;
  const SLOTS = [
    ['helm', 'Helm'], ['amulet', 'Amulet'], ['weapon', 'Weapon'], ['chest', 'Armour'],
    ['offhand', 'Offhand'], ['cloak', 'Cloak'], ['ring1', 'Ring'], ['ring2', 'Ring'],
  ];
  /** the item-art category whose faded silhouette marks an empty doll slot */
  const SLOT_ART = {
    helm: 'helm', amulet: 'amulet', weapon: 'blade', chest: 'armour', offhand: 'shield', cloak: 'cloak', ring1: 'ring', ring2: 'ring',
  };
  const ICON_SCALE = 4;   // 12×12 item art → 48 px
  const ORDER = { legendary: 0, rare: 1, magic: 2, common: 3 };
  let sortBy = 'rarity', usableOnly = false, confirmUid = null;

  /** a selector suffix such as '.sel' when the condition holds, else nothing */
  const flag = (on, cls) => (on ? cls : '');

  function iconEl(item) {
    const art = BD.view.itemArt.artFor(BD.sim.items.derive(item).category);
    return h('img.it-icon', { src: BD.view.sprites.dataURL(art, ICON_SCALE), alt: '' });
  }

  function itemCell(world, item, where, extra) {
    const d = BD.sim.items.derive(item);
    const ok = BD.sim.inventory.canEquip(world, world.player, item).ok;
    const sel = 'div.it-cell.r-' + item.rarity + flag(!ok, '.unusable') + flag(item.locked, '.locked');
    const el = h(sel, { data: Object.assign({ uid: item.uid, where }, extra || {}) }, [
      iconEl(item), h('span.it-cell-name', d.name + (item.enhance ? ' +' + item.enhance : '')),
    ]);
    BD.ui.tooltip.bind(el, (c) => BD.ui.itemTooltip.body(c, world, item, { compare: where !== 'equip' }));
    return el;
  }

  function sorted(world, list) {
    const out = list.slice();
    const key = {
      rarity: (it) => ORDER[it.rarity] * 1000 - it.ilvl,
      slot: (it) => BD.data.bases[it.base].slot + ORDER[it.rarity],
      value: (it) => -BD.sim.items.derive(it).value,
      ilvl: (it) => -it.ilvl,
    }[sortBy];
    out.sort((a, b) => {
      if (key(a) < key(b)) return -1;
      return key(a) > key(b) ? 1 : 0;
    });
    return usableOnly ? out.filter((it) => BD.sim.loot.usableBy(world.player.cls, BD.data.bases[it.base])) : out;
  }

  function build(el) {
    const w = BD.app.world, p = w.player;
    el.appendChild(h('h2', 'Inventory'));
    const left = buildLeftColumn(w, p);
    const pack = buildPackList(w, p);
    el.appendChild(h('div.inv-cols', [left, buildRightColumn(p, pack)]));
    buildDropConfirm(el, p);
    el.appendChild(h('div.row', { style: 'justify-content:center;margin-top:10px' }, [
      h('button.btn', { data: { action: 'close' } }, 'Close (I)'),
    ]));
    wireEvents(el, w);
    addDropButtons(pack, w);
  }

  /** paper doll, gold / pouch line and the scroll buttons */
  function buildLeftColumn(w, p) {
    const doll = h('div.doll');
    for (const [slot, label] of SLOTS) {
      const it = p.equip[slot];
      const ghost = h('img.slot-ghost', { src: BD.view.sprites.dataURL(BD.view.itemArt.artFor(SLOT_ART[slot]), ICON_SCALE), alt: '' });
      const cell = it ? itemCell(w, it, 'equip', { slot }) : h('div.it-cell.empty', { data: { slot }, title: label + ' (empty)' }, ghost);
      doll.appendChild(h('div.doll-slot.slot-' + slot, [h('div.doll-label', label), cell]));
    }
    return h('div.col', [doll,
      h('div.pouch-row', [
        h('span', [h('span.muted', 'Gold '), h('b.gold', String(p.gold))]),
        h('span', [h('span.muted', 'Town Portal '), String(p.pouch.portal || 0)]),
        h('span', [h('span.muted', 'Revelation '), String(p.pouch.reveal || 0)]),
      ]),
      h('div.row', [
        h('button.btn.tiny', { data: { action: 'read', kind: 'portal' }, disabled: !p.pouch.portal }, 'Read Portal (R)'),
        h('button.btn.tiny', { data: { action: 'read', kind: 'reveal' }, disabled: !p.pouch.reveal }, 'Read Revelation'),
      ]),
    ]);
  }

  function buildPackTools() {
    const sortBtn = (k) => h('button.btn.tiny' + flag(sortBy === k, '.primary'), { data: { action: 'sort', key: k } },
      k === 'ilvl' ? 'level' : k);
    return h('div.row.pack-tools', [
      h('span.muted', 'Sort:'), ...['rarity', 'slot', 'value', 'ilvl'].map(sortBtn),
      h('button.btn.tiny' + flag(usableOnly, '.primary'), { data: { action: 'usable' } }, 'Usable by me'),
    ]);
  }

  function buildPackList(w, p) {
    const pack = h('div.pack-list');
    for (const it of sorted(w, p.pack)) pack.appendChild(itemCell(w, it, 'pack'));
    // free space is one quiet line, not a column of empty boxes
    const free = BD.sim.inventory.PACK - p.pack.length;
    if (free > 0) pack.appendChild(h('div.it-cell.empty.ghost', free + (free === 1 ? ' free slot' : ' free slots')));
    return pack;
  }

  /** pack header, sort tools, the pack list and the controls hint */
  function buildRightColumn(p, pack) {
    const tools = buildPackTools();
    return h('div.col', [
      h('div.pack-head', [h('b', 'Pack'), h('span.muted', p.pack.length + ' / ' + BD.sim.inventory.PACK)]), tools, pack,
      h('div.muted.small',
        'Right-click: equip. Shift-click: move to stash / sell. Ctrl-click: lock. Drop with the ✕ that appears on hover.'),
    ]);
  }

  function buildDropConfirm(el, p) {
    if (!confirmUid) return;
    const it = p.pack.find((x) => x.uid === confirmUid);
    if (!it) return;
    el.appendChild(h('div.confirm', [
      h('span', 'Drop ' + BD.sim.items.derive(it).name + '?'),
      h('button.btn.tiny.danger', { data: { action: 'dropYes' } }, 'Drop'),
      h('button.btn.tiny', { data: { action: 'dropNo' } }, 'Keep'),
    ]));
  }

  const refresh = () => BD.ui.panels.rebuild('inventory');

  function onContextMenu(ev, w) {
    ev.preventDefault();
    const cell = BD.ui.dom.closest(ev.target, '.it-cell');
    if (!cell || !cell.dataset.uid) return;
    if (cell.dataset.where === 'pack') Commands().apply(w, { type: 'Equip', uid: cell.dataset.uid });
    else if (cell.dataset.where === 'equip') Commands().apply(w, { type: 'Unequip', slot: cell.dataset.slot });
    BD.ui.tooltip.hide();
    refresh();
  }

  function onClick(ev, w) {
    const cell = BD.ui.dom.closest(ev.target, '.it-cell');
    if (!cell || !cell.dataset.uid) return;
    const uid = cell.dataset.uid;
    if (ev.ctrlKey && cell.dataset.where === 'pack') {
      Commands().apply(w, { type: 'Lock', uid });
      refresh();
      return;
    }
    if (ev.shiftKey && cell.dataset.where === 'pack' && BD.ui.transfer) {
      BD.ui.transfer(uid);
      refresh();
      return;
    }
    if (ev.altKey && cell.dataset.where === 'pack') {
      askDrop(w, uid);
      return;
    }
  }

  function wireEvents(el, w) {
    el.addEventListener('contextmenu', (ev) => onContextMenu(ev, w));
    el.addEventListener('click', (ev) => onClick(ev, w));
    BD.ui.dom.delegate(el, {
      sort: (t) => {
        sortBy = t.dataset.key;
        refresh();
      },
      usable: () => {
        usableOnly = !usableOnly;
        refresh();
      },
      read: (t) => {
        Commands().apply(w, { type: 'ReadScroll', kind: t.dataset.kind });
        BD.ui.panels.close('inventory');
      },
      dropYes: () => {
        Commands().apply(w, { type: 'Drop', uid: confirmUid });
        confirmUid = null;
        refresh();
      },
      dropNo: () => {
        confirmUid = null;
        refresh();
      },
      close: () => BD.ui.panels.close('inventory'),
    });
  }

  /** the ✕ drop button shown on hover over each pack item */
  function addDropButtons(pack, w) {
    for (const cell of pack.querySelectorAll('.it-cell[data-uid]')) {
      const x = h('button.drop-x', { title: 'Drop' }, '✕');
      x.addEventListener('click', (ev) => {
        ev.stopPropagation();
        askDrop(w, /** @type {HTMLElement} */ (cell).dataset.uid);
      });
      cell.appendChild(x);
    }
  }

  function askDrop(w, uid) {
    const it = w.player.pack.find((x) => x.uid === uid);
    if (!it || it.locked) return;
    if (it.rarity === 'rare' || it.rarity === 'legendary') {
      confirmUid = uid;
      BD.ui.panels.rebuild('inventory');
      return;
    }
    BD.sim.commands.apply(w, { type: 'Drop', uid });
    BD.ui.panels.rebuild('inventory');
  }

  function onOpen() {
    confirmUid = null;
  }

  BD.ui.panels.register({ id: 'inventory', build, wide: true, swappable: true, pausesWorld: true, onOpen });
})(globalThis.BD);
