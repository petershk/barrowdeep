// @ts-check
// HUD plate: life orb (left), resource orb (right, colour by resource), flask belt + skill bar + portal slot,
// XP strip with level and percent, status chips above the skill row. Orbs and bars update every frame; text only when changed.
(function (BD) {
  'use strict';

  const { h, setText, root } = BD.ui.dom;
  let el = null, life = null, res = null, xp = null, flask = null, portal = null, chips = null, pips = null;
  const SHORT_FLASH_MS = 700;          // the resource orb flashes this long when a click couldn't pay
  const ORB_PX = 134;                  // orb canvas size in CSS px (the bronze ring around it is CSS)
  let shortUntil = -1;
  const Palette = BD.view.palette;
  const M = Palette.MEANING;
  /** orb liquid: [surface, depth] from the meaning colour (ART_DIRECTION.md: rage / energy / mana / focus / life) */
  const liquid = (hex) => [Palette.shade(hex, 1.15), Palette.shade(hex, 0.32)];
  const ORB_COL = {
    life: liquid(M.life), rage: liquid(M.rage), energy: liquid(M.energy), mana: liquid(M.mana), focus: liquid(M.focus),
  };
  const PORTAL_PATH = 'M12 12m-1 0a1 1 0 1 0 2 0a3 3 0 1 0-6 0a5 5 0 1 0 10 0a7 7 0 1 0-14 0';

  /** the label of a rebindable key ("Q", "R"), so the HUD never shows a stale binding */
  const keyLabel = (action) => BD.input.bindings.pretty(BD.input.bindings.keyOf(action));

  /** a stroke-only inline SVG icon (24×24 box, currentColor) */
  function icon(d, size) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.6');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
    return svg;
  }

  function orb(cls) {
    const cv = /** @type {HTMLCanvasElement} */ (h('canvas', { width: ORB_PX, height: ORB_PX }));
    const val = h('div.orb-val');
    const lab = h('div.orb-lab');
    const wrap = h('div.orb.' + cls, [cv, h('div.orb-plaque', [val, lab])]);
    return { wrap, cv, val, lab, level: -1, t: 0 };
  }

  function mountBelt() {
    flask = { el: h('button.flask', { type: 'button' }), vials: h('div.vials'), n: h('div.flask-n'), key: h('div.key') };
    BD.ui.dom.append(flask.el, [flask.vials, flask.key, flask.n]);
    flask.el.addEventListener('mousedown', (ev) => {
      ev.stopPropagation();
      if (!BD.app.paused()) BD.input.intent.issue({ type: 'DrinkFlask' });
    });
    portal = { el: h('button.portal-slot', { type: 'button' }), n: h('div.sk-count'), key: h('div.sk-key') };
    BD.ui.dom.append(portal.el, [icon(PORTAL_PATH, 30), portal.key, portal.n]);
    portal.el.addEventListener('mousedown', (ev) => {
      ev.stopPropagation();
      if (!BD.app.paused()) BD.input.intent.issue({ type: 'ReadScroll', kind: 'portal' });
    });
  }

  function mount() {
    life = orb('life');
    res = orb('res');
    mountBelt();
    xp = { bar: h('div.xp-fill'), lv: h('span.xp-lv'), pct: h('span.xp-pct'), wrap: null };
    xp.wrap = h('div.xp', [xp.bar, h('div.xp-ticks')]);
    chips = h('div.chips');
    pips = h('div.pips');
    const mid = h('div.hud-mid', [
      chips,
      h('div.hud-row', [flask.el, h('div.bar-slot'), portal.el]),
      h('div.xp-row', [xp.lv, xp.wrap, xp.pct]),
    ]);
    el = h('div.hud', [h('div.hud-plate'), h('div.hud-crest'), life.wrap, mid, res.wrap]);
    root().appendChild(el);
    root().appendChild(pips);
  }

  function drawOrb(o, frac, colTop, colBot, t, pulse) {
    const g = o.cv.getContext('2d');
    const W = o.cv.width, C = W / 2, R = C - 1;
    g.clearRect(0, 0, W, W);
    g.save();
    g.beginPath();
    g.arc(C, C, R, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = M.outline;
    g.fillRect(0, 0, W, W);
    // liquid with a wavy surface
    const top = C + R - frac * 2 * R;
    const gr = g.createLinearGradient(0, top, 0, W);
    gr.addColorStop(0, colTop);
    gr.addColorStop(1, colBot);
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(0, W);
    for (let x = 0; x <= W; x += 4) g.lineTo(x, top + Math.sin(x / 12 + t / 260) * (frac > 0.02 && frac < 0.98 ? 2.5 : 0));
    g.lineTo(W, W);
    g.closePath();
    g.fill();
    if (pulse) {
      g.fillStyle = Palette.rgba(pulse, 0.02 + 0.24 * BD.view.fx.beat('attention', t));
      g.fillRect(0, 0, W, W);
    }
    // glass highlight
    const hl = g.createRadialGradient(W * 0.35, W * 0.3, 2, W * 0.42, W * 0.36, W * 0.42);
    hl.addColorStop(0, 'rgba(255,255,255,0.32)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hl;
    g.fillRect(0, 0, W, W);
    g.restore();
  }

  let t = 0;
  function frame(world, ms) {
    if (!el) mount();
    t += ms;
    const p = world.player;
    const s = BD.sim.stats.statsOf(world, p);
    const lf = Math.max(0, p.hp) / s.maxLife;
    const low = lf < 0.25 && !p.dead;
    drawOrb(life, lf, ORB_COL.life[0], ORB_COL.life[1], t, low ? M.lifeLow : null);
    life.wrap.classList.toggle('low', low);
    setText(life.val, (p.dead ? 0 : Math.ceil(Math.max(0, p.hp))) + ' / ' + s.maxLife);
    setText(life.lab, 'Life');
    const kind = BD.data.classes[p.cls].resource;
    const { frac, txt, lab, pulse } = resourceReadout(p, kind);
    const c = ORB_COL[kind];
    let resPulse = pulse ? M.text : null;
    if (t < shortUntil) resPulse = M.bad;
    drawOrb(res, frac, c[0], c[1], t, resPulse);
    res.wrap.dataset.kind = kind;
    setText(res.val, txt);
    setText(res.lab, lab);
    xpFrame(p);
    beltFrame(p);
    chipFrame(world, p);
    pipsFrame(world, p);
  }

  function xpFrame(p) {
    const need = BD.sim.progression.xpToNext(p.level);
    const pct = p.level >= 30 ? 100 : Math.min(100, (p.xp / need) * 100);
    xp.bar.style.width = pct.toFixed(2) + '%';
    setText(xp.lv, 'Level ' + p.level);
    setText(xp.pct, p.level >= 30 ? 'max' : Math.floor(pct) + '%');
    xp.wrap.title = 'Level ' + p.level + (p.level < 30 ? ' — ' + Math.floor(p.xp) + ' / ' + need + ' experience' : '');
  }

  /** flask: one vial per charge slot; portal scroll count (Revelation scrolls show in its tooltip) */
  function beltFrame(p) {
    const fl = p.flask;
    if (flask.vials.childElementCount !== fl.max) {
      BD.ui.dom.clear(flask.vials);
      for (let i = 0; i < fl.max; i++) flask.vials.appendChild(h('div.vial'));
    }
    for (let i = 0; i < fl.max; i++) flask.vials.children[i].classList.toggle('full', i < fl.charges);
    flask.el.classList.toggle('empty', fl.charges <= 0);
    setText(flask.n, fl.charges + '/' + fl.max);
    setText(flask.key, keyLabel('flask'));
    flask.el.title = 'Healing Flask — ' + fl.charges + ' of ' + fl.max + ' charges';
    const n = p.pouch.portal || 0;
    setText(portal.n, '×' + n);
    setText(portal.key, keyLabel('portal'));
    portal.el.classList.toggle('poor', n <= 0);
    portal.el.title = 'Town Portal scrolls: ' + n + (p.pouch.reveal ? ' · Revelation: ' + p.pouch.reveal : '');
  }

  /** fill fraction, number text, label and pulse for the resource orb */
  function resourceReadout(p, kind) {
    const r = p.resources;
    let frac = 0, txt = '', lab = '', pulse = false;
    if (kind === 'rage') {
      frac = r.rage.cur / r.rage.max;
      txt = Math.floor(r.rage.cur) + '';
      lab = p.momentum ? 'Momentum' : 'Rage';
      pulse = p.momentum;
    } else if (kind === 'energy') {
      frac = r.energy.cur / r.energy.max;
      txt = Math.floor(r.energy.cur) + '';
      lab = 'Energy';
    } else if (kind === 'mana') {
      frac = r.mana.max ? r.mana.cur / r.mana.max : 0;
      txt = Math.floor(r.mana.cur) + ' / ' + Math.round(r.mana.max);
      lab = r.surge ? 'Surge' : 'Mana';
      pulse = r.surge;
    } else if (kind === 'focus') {
      frac = r.focus.n / 5;
      txt = r.focus.n + ' / 5';
      lab = 'Focus';
    }
    return { frac, txt, lab, pulse };
  }

  function chipFrame(world, p) {
    const want = p.statuses.filter((st) => BD.data.statuses[st.id] && !BD.data.statuses[st.id].hiddenChip && st.id !== 'healing');
    const key = want.map((s) => s.id).join(',');
    if (chips.dataset.key !== key) {
      BD.ui.dom.clear(chips);
      for (const st of want) {
        const d = BD.data.statuses[st.id];
        const col = Palette.STATUS_COLOR[st.id] || M.muted;
        const style = { borderColor: col, color: col };
        chips.appendChild(h('div.chip' + (d.debuff ? '.debuff' : ''), { title: chipTitle(st, d), style }, [
          h('span.chip-name', d.name), h('span.chip-t'),
        ]));
      }
      chips.dataset.key = key;
    }
    want.forEach((st, i) => {
      const c = chips.children[i];
      if (c) setText(c.lastChild, chipTime(st));
    });
  }

  /** "Shrine of Wrath — +25% damage until you leave this floor." */
  function chipTitle(st, d) {
    const text = (BD.data.statusText[st.id] || '').replace('{m}', String(Math.round(st.magnitude || 0)));
    return text ? d.name + ' — ' + text : d.name;
  }

  /** seconds left; floor-long buffs (shrines) say so */
  function chipTime(st) {
    if (st.remainingMs > 0) return (st.remainingMs / 1000).toFixed(1) + 's';
    return st.id.startsWith('shrine_') ? 'floor' : '';
  }

  /** how many pips are lit and how many there are: combo points, else focus, else none */
  function pipCount(world, p, r) {
    if (r.combo) return { n: r.combo.n, max: BD.sim.resources.comboMax(world, p) };
    if (r.focus) return { n: r.focus.n, max: 5 };
    return { n: 0, max: 0 };
  }

  /** combo / focus pips above the player */
  function pipsFrame(world, p) {
    const r = p.resources;
    const { n, max } = pipCount(world, p, r);
    if (!max || BD.app.state !== 'playing' || BD.ui.panels.top()) {
      pips.style.display = 'none';
      return;
    }
    pips.style.display = '';
    const key = n + '/' + max;
    if (pips.dataset.key !== key) {
      BD.ui.dom.clear(pips);
      const kindSel = r.focus ? '.focus' : '';
      for (let i = 0; i < max; i++) pips.appendChild(h('div.pip' + (i < n ? '.on' : '') + kindSel));
      pips.dataset.key = key;
    }
    const iso = BD.view.iso, v = iso.view;
    const pos = BD.view.entities.pos(p, 0, { x: 0, y: 0 });
    const o = iso.toScreen(pos.x, pos.y, { x: 0, y: 0 });
    pips.style.left = o.x / v.dpr + 'px';
    pips.style.top = (o.y - 46 * v.Z * v.dpr * BD.view.entities.actorK() - 30) / v.dpr + 'px';
  }

  /** a click fell back to the basic attack for lack of resource: flash the resource orb */
  function short() { shortUntil = t + SHORT_FLASH_MS; }

  BD.ui.hud.add({ frame });
  BD.ui.hudOrbs = { frame, short, icon, keyLabel };
})(globalThis.BD);
