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

  const MEANING = BD.view.palette.MEANING;
  // colours are meanings (ART_DIRECTION.md): dealt bone, taken red, crit gold, xp bronze, alert hostile
  const STYLES = {
    dmg: { color: MEANING.dmg, size: 16, dur: 700, rise: 26 },
    crit: { color: MEANING.crit, size: 22, dur: 900, rise: 30, punch: true },
    taken: { color: MEANING.dmgTaken, size: 16, dur: 800, rise: 24 },
    heal: { color: MEANING.good, size: 15, dur: 900, rise: 22 },
    status: { color: MEANING.text, size: 13, dur: 900, rise: 18, caps: true },
    reaction: { color: MEANING.reaction, size: 16, dur: 1100, rise: 34, caps: true, punch: true },
    xp: { color: MEANING.xp, size: 12, dur: 1000, rise: 20 },
    gold: { color: MEANING.gold, size: 12, dur: 1000, rise: 20 },
    miss: { color: MEANING.muted, size: 12, dur: 600, rise: 16 },
    alert: { color: MEANING.alert, size: 22, dur: 650, rise: 18, bold: true },
    exposed: { color: MEANING.exposed, size: 16, dur: 1200, rise: 28, caps: true, punch: true },
    info: { color: MEANING.friendly, size: 13, dur: 1400, rise: 24 },
  };

  function mode() { return BD.view.host.prefs.damageNumbers; }

  /** once(key, x, y, ms, tiles): true the first time key shows near (x,y) within ms; later ones are the
   *  same news (a whole pack spotting you, a whole pack freezing) and are dropped */
  const recent = [];
  function once(key, x, y, ms, tiles) {
    const now = BD.view.render.timeMs;
    for (let i = recent.length - 1; i >= 0; i--) {
      const r = recent[i];
      if (now - r.t > r.ms) recent.splice(i, 1);
      else if (r.key === key && Math.abs(r.x - x) <= tiles && Math.abs(r.y - y) <= tiles) return false;
    }
    recent.push({ key, x, y, t: now, ms });
    return true;
  }
  /** add(text, x, y, style, {id, color}) — id stacks multiple texts on one target */
  function add(text, x, y, style, o) {
    const m = mode();
    if (m === 'off' && style !== 'alert' && style !== 'exposed') return null;
    if (m === 'numbers' && (style === 'status' || style === 'reaction' || style === 'xp' || style === 'gold')) return null;
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
    // a burst on one target fans out sideways (0, right, left, further right, …) instead of a tall column
    const ring = Math.ceil(off / 2), side = off % 2 ? ring : -ring;
    const item = {
      text: String(text), x, y, t: 0, st, off: off ? 0.5 + ring * 0.4 : 0, color: o.color || st.color,
      jx: side * 16 + (Math.random() - 0.5) * 8,
    };
    list.push(item);
    return item;
  }
  /** merged per-second pickups (xp, gold, heal) and damage-over-time ticks; o as add() */
  function merge(key, amount, x, y, style, fmt, o) {
    const m = merges.get(key);
    const now = BD.view.render.timeMs;
    if (m && now - m.t < 1000) {
      m.amount += amount;
      m.item.text = fmt(m.amount);
      m.item.t = Math.min(m.item.t, 200);
      return;
    }
    const item = add(fmt(amount), x, y, style, o);
    if (item) merges.set(key, { amount, t: now, item });
  }

  function update(ms) {
    for (let i = 0; i < list.length; i++) {
      list[i].t += ms;
      if (list[i].t >= list[i].st.dur) list.splice(i--, 1);
    }
  }

  function draw(ctx) {
    const v = iso.view, zk = v.Z * v.dpr;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const f of list) {
      const st = f.st, k = f.t / st.dur;
      iso.toScreen(f.x, f.y, tmp);
      let scale = 1;
      if (st.punch) scale = k < 0.12 ? 0.6 + (k / 0.12) * 0.9 : 1.5 - Math.min(0.5, (k - 0.12) * 2.5);
      const size = st.size * scale * Math.max(1, v.dpr) * (0.85 + 0.15 * v.Z);
      ctx.font = (st.bold || st.punch ? 'bold ' : '') + Math.round(size) + 'px Georgia, serif';
      const y = tmp.y - 46 * zk * BD.view.entities.actorK() - st.rise * k * zk - f.off * 13 * v.dpr;
      ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      const txt = st.caps ? f.text.toUpperCase() : f.text;
      ctx.lineWidth = Math.max(2, 3 * v.dpr);
      ctx.strokeStyle = MEANING.outline;
      ctx.strokeText(txt, tmp.x + f.jx * v.dpr, y);
      ctx.fillStyle = f.color;
      ctx.fillText(txt, tmp.x + f.jx * v.dpr, y);
    }
    ctx.restore();
  }
  function clear() {
    list.length = 0;
    merges.clear();
    stackT.clear();
    recent.length = 0;
  }

  BD.view.floattext = { add, once, merge, update, draw, clear, STYLES };
})(globalThis.BD);
