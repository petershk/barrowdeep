// @ts-check
// Floating text (07 §4.4): pooled, stacked per target, styled by event (not by caller colour).
// XP/gold/heal pickups merge per second. Options: off / numbers / full.
(function (BD) {
  'use strict';

  const iso = BD.view.iso;
  const list = [];
  const stackT = new Map();
  const merges = new Map();
  const tmp = { x: 0, y: 0 };

  const STYLES = {
    dmg: { color: '#e8e0d0', size: 13, dur: 700, rise: 26 },
    crit: { color: '#ffd23a', size: 19, dur: 900, rise: 30, punch: true },
    taken: { color: '#ff5040', size: 14, dur: 800, rise: 24 },
    heal: { color: '#6ad06a', size: 13, dur: 900, rise: 22 },
    status: { color: '#ffffff', size: 11, dur: 900, rise: 18, caps: true },
    reaction: { color: '#ffb0ff', size: 16, dur: 1100, rise: 34, caps: true, punch: true },
    xp: { color: '#c0a0ff', size: 11, dur: 1000, rise: 20 },
    gold: { color: '#ffd23a', size: 12, dur: 1000, rise: 20 },
    miss: { color: '#a0a0a0', size: 11, dur: 600, rise: 16 },
    alert: { color: '#ffd23a', size: 22, dur: 900, rise: 18, bold: true },
    exposed: { color: '#ffd23a', size: 16, dur: 1200, rise: 28, caps: true, punch: true },
    info: { color: '#e8d8b0', size: 13, dur: 1400, rise: 24 },
  };

  function mode() { return BD.view.host.prefs.damageNumbers; }

  /** add(text, x, y, style, {id, color}) — id stacks multiple texts on one target */
  function add(text, x, y, style, o) {
    const m = mode();
    if (m === 'off' && style !== 'alert' && style !== 'exposed') return;
    if (m === 'numbers' && (style === 'status' || style === 'reaction' || style === 'xp' || style === 'gold')) return;
    o = o || {};
    const st = STYLES[style] || STYLES.dmg;
    let off = 0;
    if (o.id != null) {
      const now = BD.view.render.timeMs;
      const last = stackT.get(o.id) || { t: -1e9, n: 0 };
      const n = now - last.t < 160 ? last.n + 1 : 0;
      stackT.set(o.id, { t: now, n });
      off = n;
    }
    if (list.length > 120) list.shift();
    list.push({ text: String(text), x, y, t: 0, st, off, color: o.color || st.color, jx: (Math.random() - 0.5) * 10 });
  }
  /** merged per-second pickups (xp, gold, heal) */
  function merge(key, amount, x, y, style, fmt) {
    const m = merges.get(key);
    const now = BD.view.render.timeMs;
    if (m && now - m.t < 1000) { m.amount += amount; m.item.text = fmt(m.amount); m.item.t = Math.min(m.item.t, 200); return; }
    add(fmt(amount), x, y, style);
    merges.set(key, { amount, t: now, item: list[list.length - 1] });
  }

  function update(ms) { for (let i = 0; i < list.length; i++) { list[i].t += ms; if (list[i].t >= list[i].st.dur) list.splice(i--, 1); } }

  function draw(ctx) {
    const v = iso.view, zk = v.Z * v.dpr;
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const f of list) {
      const st = f.st, k = f.t / st.dur;
      iso.toScreen(f.x, f.y, tmp);
      let scale = 1;
      if (st.punch) scale = k < 0.12 ? 0.6 + (k / 0.12) * 0.9 : 1.5 - Math.min(0.5, (k - 0.12) * 2.5);
      const size = st.size * scale * Math.max(1, v.dpr) * (0.85 + 0.15 * v.Z);
      ctx.font = (st.bold || st.punch ? 'bold ' : '') + Math.round(size) + 'px Georgia, serif';
      const y = tmp.y - 46 * zk - st.rise * k * zk - f.off * 13 * v.dpr;
      ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      const txt = st.caps ? f.text.toUpperCase() : f.text;
      ctx.lineWidth = Math.max(2, 3 * v.dpr);
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(txt, tmp.x + f.jx * v.dpr, y);
      ctx.fillStyle = f.color;
      ctx.fillText(txt, tmp.x + f.jx * v.dpr, y);
    }
    ctx.restore();
  }
  function clear() { list.length = 0; merges.clear(); stackT.clear(); }

  BD.view.floattext = { add, merge, update, draw, clear, STYLES };
})(globalThis.BD);
