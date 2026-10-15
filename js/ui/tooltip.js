// @ts-check
// One floating tooltip. Content builders live with their panels (skills, items, stats).
// Hold Shift for the formula breakdown / next-rank preview.
(function (BD) {
  'use strict';

  const { h, root, clear } = BD.ui.dom;
  let el = null, anchor = null, builder = null;

  function mount() {
    el = h('div.tooltip.hidden');
    root().appendChild(el);
  }

  /** show(anchorEl, buildFn(container, shiftHeld)) */
  function show(a, build) {
    if (!el) mount();
    anchor = a;
    builder = build;
    render();
  }
  function render() {
    if (!anchor || !builder) return;
    clear(el);
    builder(el, !!(BD.input.keyboard && (BD.input.keyboard.down.has('ShiftLeft') || BD.input.keyboard.down.has('ShiftRight'))));
    el.classList.remove('hidden');
    const pos = place(anchor, el.offsetWidth, el.offsetHeight);
    el.style.left = pos.x + 'px';
    el.style.top = pos.y + 'px';
  }

  const GAP = 8, MARGIN = 4;

  /**
   * Where the tooltip goes: never on top of the element it describes. Panel content (cards, item cells)
   * prefers the side, except 3-column skill cards which prefer below/above so neighbouring trees stay visible.
   * The first side with room wins; with no room anywhere, the roomiest side is used.
   * @param {Element} a anchor element @param {number} tw @param {number} th
   */
  function place(a, tw, th) {
    const r = a.getBoundingClientRect();
    const inPanel = !!a.closest('.panel');
    const inSkillCols = !!a.closest('.skill-cols');
    const W = window.innerWidth, H = window.innerHeight;
    const clampX = (x) => Math.max(MARGIN, Math.min(W - tw - MARGIN, x));
    const clampY = (y) => Math.max(MARGIN, Math.min(H - th - MARGIN, y));
    const midX = clampX(r.left + r.width / 2 - tw / 2), midY = clampY(r.top + r.height / 2 - th / 2);
    const sides = {
      right: { room: W - r.right - GAP - MARGIN, need: tw, x: r.right + GAP, y: midY },
      left: { room: r.left - GAP - MARGIN, need: tw, x: r.left - GAP - tw, y: midY },
      above: { room: r.top - GAP - MARGIN, need: th, x: midX, y: r.top - GAP - th },
      below: { room: H - r.bottom - GAP - MARGIN, need: th, x: midX, y: r.bottom + GAP },
    };
    let order = ['above', 'below', 'right', 'left'];
    if (inSkillCols) order = ['below', 'above', 'right', 'left'];
    else if (inPanel) order = ['right', 'left', 'above', 'below'];
    let best = sides[order[0]];
    for (const k of order) {
      const s = sides[k];
      if (s.room >= s.need) return { x: s.x, y: s.y };
      if (s.room - s.need > best.room - best.need) best = s;
    }
    return { x: Math.max(MARGIN, best.x), y: Math.max(MARGIN, best.y) };
  }
  function hide() {
    if (el) el.classList.add('hidden');
    anchor = null;
    builder = null;
  }

  /** attach hover tooltips to an element */
  function bind(target, build) {
    target.addEventListener('mouseenter', () => show(target, build));
    target.addEventListener('mouseleave', hide);
  }

  function init() {
    window.addEventListener('keydown', (ev) => {
      if (ev.key === 'Shift' && anchor) render();
    });
    window.addEventListener('keyup', (ev) => {
      if (ev.key === 'Shift' && anchor) setTimeout(render, 0);
    });
  }

  /** "Keystone", or "Tier 2 · Rank 3" */
  function tierLabel(d) {
    if (d.keystone) return 'Keystone';
    return 'Tier ' + d.tier + (d.rank ? ' · Rank ' + d.rank : '');
  }

  /** skill tooltip body (shared by bar, panel, creation) */
  function skillBody(world, p, id, shift, rank) {
    const d = BD.sim.describe.describe(world, p, id, rank);
    const kids = [h('div.tt-title', d.name), h('div.tt-sub', [
      tierLabel(d),
      d.cost ? ' · ' + d.cost : '',
      d.cooldown ? ' · Cooldown ' + d.cooldown : '',
    ])];
    kids.push(h('div.tt-desc', d.desc));
    for (const l of d.lines) kids.push(h('div.tt-line' + (l.kind === 'damage' ? '.dmg' : ''), l.text));
    for (const b of d.breakpoints) kids.push(h('div.tt-bp' + (b.active ? '.on' : ''), 'Rank ' + b.rank + ': ' + b.text));
    if (d.forms.length) {
      kids.push(h('div.tt-forms', 'Forms (pick one, rank ' + d.formRank + '):'));
      for (const f of d.forms) kids.push(h('div.tt-form' + (f.on ? '.on' : ''), [h('b', f.name + ' — ' + f.verb + '. '), f.text]));
    }
    if (shift && !d.keystone && d.rank < 5) {
      const n = BD.sim.describe.describe(world, p, id, d.rank + 1);
      kids.push(h('div.tt-next', 'Next rank:'));
      for (const l of n.lines) if (l.kind === 'damage') kids.push(h('div.tt-line.dmg', l.text));
    } else if (!d.keystone) kids.push(h('div.tt-hint', 'Hold Shift for the next rank.'));
    return kids;
  }

  BD.ui.tooltip = { init, show, hide, bind, render, skillBody };
})(globalThis.BD);
