// @ts-check
// HUD: life orb (left), resource orb (right, colour by resource), XP strip, flask + pouch,
// status chips above the life orb. Orbs and bars update every frame; text only when changed.
(function (BD) {
  'use strict';

  const { h, setText, root } = BD.ui.dom;
  let el = null, life = null, res = null, xp = null, flask = null, pouch = null, chips = null, pips = null;
  const Palette = BD.view.palette;
  const M = Palette.MEANING;
  /** orb liquid: [surface, depth] from the meaning colour (ART_DIRECTION.md: rage / energy / mana / focus / life) */
  const liquid = (hex) => [Palette.shade(hex, 1.15), Palette.shade(hex, 0.32)];
  const ORB_COL = {
    life: liquid(M.life), rage: liquid(M.rage), energy: liquid(M.energy), mana: liquid(M.mana), focus: liquid(M.focus),
  };

  function orb(cls) {
    const cv = /** @type {HTMLCanvasElement} */ (h('canvas', { width: 96, height: 96 }));
    const val = h('div.orb-val');
    const lab = h('div.orb-lab');
    const wrap = h('div.orb.' + cls, [cv, val, lab]);
    return { wrap, cv, val, lab, level: -1, t: 0 };
  }

  function mount() {
    life = orb('life');
    res = orb('res');
    xp = { bar: h('div.xp-fill'), wrap: null };
    xp.wrap = h('div.xp', [xp.bar]);
    flask = { el: h('div.flask', { title: 'Healing Flask (Q)' }, [h('div.flask-glass'), h('div.flask-n'), h('div.key', 'Q')]) };
    pouch = h('div.pouch');
    chips = h('div.chips');
    pips = h('div.pips');
    el = h('div.hud', [chips, life.wrap, h('div.hud-mid', [h('div.hud-row', [flask.el, pouch, h('div.bar-slot')]), xp.wrap]), res.wrap]);
    root().appendChild(el);
    root().appendChild(pips);
  }

  function drawOrb(o, frac, colTop, colBot, t, pulse) {
    const g = o.cv.getContext('2d');
    const W = 96, R = 44;
    g.clearRect(0, 0, W, W);
    g.save();
    g.beginPath();
    g.arc(48, 48, R, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = M.outline;
    g.fillRect(0, 0, W, W);
    // liquid with a wavy surface
    const top = 48 + R - frac * 2 * R;
    const gr = g.createLinearGradient(0, top, 0, 96);
    gr.addColorStop(0, colTop);
    gr.addColorStop(1, colBot);
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(0, 96);
    for (let x = 0; x <= W; x += 4) g.lineTo(x, top + Math.sin(x / 9 + t / 260) * (frac > 0.02 && frac < 0.98 ? 2 : 0));
    g.lineTo(W, 96);
    g.closePath();
    g.fill();
    if (pulse) {
      g.fillStyle = Palette.rgba(pulse, 0.14 + 0.12 * Math.sin(t / 95));
      g.fillRect(0, 0, W, W);
    }
    // glass highlight
    const hl = g.createRadialGradient(34, 30, 2, 40, 36, 40);
    hl.addColorStop(0, 'rgba(255,255,255,0.35)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hl;
    g.fillRect(0, 0, W, W);
    g.restore();
    ring(g, M.border, 3, R + 1);
    ring(g, M.outline, 1, R + 3);
  }

  /** a circular rim around the orb */
  function ring(g, color, width, radius) {
    g.strokeStyle = color;
    g.lineWidth = width;
    g.beginPath();
    g.arc(48, 48, radius, 0, Math.PI * 2);
    g.stroke();
  }

  let t = 0;
  function frame(world, ms) {
    if (!el) mount();
    t += ms;
    const p = world.player;
    const s = BD.sim.stats.statsOf(world, p);
    const lf = Math.max(0, p.hp) / s.maxLife;
    drawOrb(life, lf, ORB_COL.life[0], ORB_COL.life[1], t, lf < 0.25 && !p.dead ? M.lifeLow : null);
    setText(life.val, (p.dead ? 0 : Math.ceil(Math.max(0, p.hp))) + ' / ' + s.maxLife);
    setText(life.lab, 'Life');
    const kind = BD.data.classes[p.cls].resource;
    const { frac, txt, lab, pulse } = resourceReadout(p, kind);
    const c = ORB_COL[kind];
    drawOrb(res, frac, c[0], c[1], t, pulse ? M.text : null);
    setText(res.val, txt);
    setText(res.lab, lab);
    // xp
    const need = BD.sim.progression.xpToNext(p.level);
    xp.bar.style.width = (p.level >= 30 ? 100 : Math.min(100, (p.xp / need) * 100)).toFixed(2) + '%';
    xp.wrap.title = 'Level ' + p.level + (p.level < 30 ? ' — ' + Math.floor(p.xp) + ' / ' + need + ' experience' : '');
    // flask
    setText(flask.el.querySelector('.flask-n'), p.flask.charges + '/' + p.flask.max);
    flask.el.classList.toggle('empty', p.flask.charges <= 0);
    flask.el.style.setProperty('--fill', String(p.flask.charges / Math.max(1, p.flask.max)));
    // pouch
    const pt = 'Portal ' + (p.pouch.portal || 0) + (p.pouch.reveal ? ' · Revelation ' + p.pouch.reveal : '');
    setText(pouch, pt);
    // status chips (real names for every buff)
    chipFrame(world, p);
    pipsFrame(world, p);
  }

  /** fill fraction, number text, label and pulse for the resource orb */
  function resourceReadout(p, kind) {
    const r = p.resources;
    let frac = 0, txt = '', lab = '', pulse = false;
    if (kind === 'rage') {
      frac = r.rage.cur / r.rage.max;
      txt = Math.floor(r.rage.cur) + '';
      lab = p.momentum ? 'Rage · Momentum' : 'Rage';
      pulse = p.momentum;
    } else if (kind === 'energy') {
      frac = r.energy.cur / r.energy.max;
      txt = Math.floor(r.energy.cur) + '';
      lab = 'Energy';
    } else if (kind === 'mana') {
      frac = r.mana.max ? r.mana.cur / r.mana.max : 0;
      txt = Math.floor(r.mana.cur) + ' / ' + Math.round(r.mana.max);
      lab = r.surge ? 'Mana · Surge' : 'Mana';
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
        const style = { borderColor: Palette.STATUS_COLOR[st.id] || M.muted };
        chips.appendChild(h('div.chip' + (d.debuff ? '.debuff' : ''), { title: d.name, style }, [
          h('span.chip-name', d.name), h('span.chip-t'),
        ]));
      }
      chips.dataset.key = key;
    }
    want.forEach((st, i) => {
      const c = chips.children[i];
      if (c) setText(c.lastChild, st.remainingMs > 0 ? (st.remainingMs / 1000).toFixed(1) + 's' : '');
    });
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
    pips.style.top = (o.y - 46 * v.Z * v.dpr - 30) / v.dpr + 'px';
  }

  BD.ui.hud.add({ frame });
  BD.ui.hudOrbs = { frame };
})(globalThis.BD);
