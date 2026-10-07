// @ts-check
// One floating tooltip. Content builders live with their panels (skills, items, stats).
// Hold Shift for the formula breakdown / next-rank preview.
(function (BD) {
  'use strict';

  const { h, root, clear } = BD.ui.dom;
  let el = null, anchor = null, builder = null;

  function mount() { el = h('div.tooltip.hidden'); root().appendChild(el); }

  /** show(anchorEl, buildFn(container, shiftHeld)) */
  function show(a, build) {
    if (!el) mount();
    anchor = a; builder = build;
    render();
  }
  function render() {
    if (!anchor || !builder) return;
    clear(el);
    builder(el, !!(BD.input.keyboard && (BD.input.keyboard.down.has('ShiftLeft') || BD.input.keyboard.down.has('ShiftRight'))));
    el.classList.remove('hidden');
    const r = anchor.getBoundingClientRect();
    const tw = el.offsetWidth, th = el.offsetHeight;
    let x = r.left + r.width / 2 - tw / 2, y = r.top - th - 8;
    if (y < 4) y = r.bottom + 8;
    x = Math.max(4, Math.min(window.innerWidth - tw - 4, x));
    y = Math.max(4, Math.min(window.innerHeight - th - 4, y));
    el.style.left = x + 'px'; el.style.top = y + 'px';
  }
  function hide() { if (el) el.classList.add('hidden'); anchor = null; builder = null; }

  /** attach hover tooltips to an element */
  function bind(target, build) {
    target.addEventListener('mouseenter', () => show(target, build));
    target.addEventListener('mouseleave', hide);
  }

  function init() {
    window.addEventListener('keydown', (ev) => { if (ev.key === 'Shift' && anchor) render(); });
    window.addEventListener('keyup', (ev) => { if (ev.key === 'Shift' && anchor) setTimeout(render, 0); });
  }

  /** skill tooltip body (shared by bar, panel, creation) */
  function skillBody(world, p, id, shift, rank) {
    const d = BD.sim.describe.describe(world, p, id, rank);
    const kids = [h('div.tt-title', d.name), h('div.tt-sub', [
      d.keystone ? 'Keystone' : 'Tier ' + d.tier + (d.rank ? ' · Rank ' + d.rank : ''),
      d.cost ? ' · ' + d.cost : '',
      d.cooldown ? ' · Cooldown ' + d.cooldown : '',
    ])];
    kids.push(h('div.tt-desc', d.desc));
    for (const l of d.lines) kids.push(h('div.tt-line' + (l.kind === 'damage' ? '.dmg' : ''), l.text));
    for (const b of d.breakpoints) kids.push(h('div.tt-bp' + (b.active ? '.on' : ''), 'Rank ' + b.rank + ': ' + b.text));
    if (shift && !d.keystone && d.rank < 5) {
      const n = BD.sim.describe.describe(world, p, id, d.rank + 1);
      kids.push(h('div.tt-next', 'Next rank:'));
      for (const l of n.lines) if (l.kind === 'damage') kids.push(h('div.tt-line.dmg', l.text));
    } else if (!d.keystone) kids.push(h('div.tt-hint', 'Hold Shift for the next rank.'));
    return kids;
  }

  BD.ui.tooltip = { init, show, hide, bind, render, skillBody };
})(globalThis.BD);
