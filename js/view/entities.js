// @ts-check
// Visual-only per-entity state (interpolated position, flash, recoil, lunge, animation timers),
// keyed by entity id and cleared on floor change. Never mutates the world.
(function (BD) {
  'use strict';

  const STEP = BD.core.scheduler.STEP_MS;
  /** @type {Map<number, any>} */
  const vis = new Map();
  const CLASS_ART = { fighter: 'fighter', assassin: 'thief', magician: 'magician', valkyrie: 'valkyrie' };

  function stateOf(id) {
    let s = vis.get(id);
    if (!s) {
      s = {
        flash: 0, recoil: 0, rx: 0, ry: 0, lunge: 0, lx: 0, ly: 0, hurt: 0, alertT: 0, dieT: -1,
        walkPhase: 0, lastX: null, lastY: null, windup: 0, aura: 0, fade: 1,
      };
      vis.set(id, s);
    }
    return s;
  }
  function clear() { vis.clear(); }

  /** interpolated tile position */
  function pos(e, alpha, out) {
    const m = e.move;
    if (!m) { out.x = e.x; out.y = e.y; return out; }
    const t = Math.min(1, (m.elapsed + alpha * STEP) / m.dur);
    out.x = m.fromX + (m.toX - m.fromX) * t;
    out.y = m.fromY + (m.toY - m.fromY) * t;
    return out;
  }

  function artOf(e) {
    if (e.kind === 'player') return CLASS_ART[e.cls] || 'fighter';
    const d = (BD.data.monsters && BD.data.monsters[e.def]) || (BD.data.bosses && BD.data.bosses[e.def]);
    if (d) return d.sprite;
    if (e.kind === 'ally') return e.art || 'valkyrie';
    return 'skeleton';
  }
  const palCache = new Map();
  /** Keepers and unique elites get a distinct palette (gilded / spectral); bosses use their own. */
  function palOf(e) {
    const d = (BD.data.monsters && BD.data.monsters[e.def]) || (BD.data.bosses && BD.data.bosses[e.def]);
    let pal = d && d.pal ? d.pal : null;
    if (e.palOverride) pal = Object.assign({}, pal || {}, e.palOverride);
    if (d && (e.rank === 'keeper' || e.rank === 'unique')) {
      const key = e.def + e.rank;
      let c = palCache.get(key);
      if (!c) {
        const base = Object.assign({}, BD.view.art[d.sprite] ? BD.view.art[d.sprite].pal : {}, pal || {});
        c = {};
        const P = BD.view.palette;
        const tint = e.rank === 'keeper' ? [255, 200, 80] : [150, 190, 255];
        for (const k in base) {
          const [r, g, b] = P.rgb(base[k]);
          const l = (r + g + b) / 3 / 255;
          const mix = (t) => Math.round(Math.min(255, t * (0.35 + 0.85 * l)));
          c[k] = '#' + ((1 << 24) | (mix(tint[0]) << 16) | (mix(tint[1]) << 8) | mix(tint[2])).toString(16).slice(1);
        }
        palCache.set(key, c);
      }
      pal = c;
    }
    return pal;
  }
  function scaleOf(e) {
    const d = (BD.data.monsters && BD.data.monsters[e.def]) || (BD.data.bosses && BD.data.bosses[e.def]);
    return d && d.scale ? d.scale : 1;
  }

  /** advance visual timers by real ms */
  function tick(realMs) {
    for (const s of vis.values()) {
      if (s.flash > 0) s.flash = Math.max(0, s.flash - realMs);
      if (s.recoil > 0) s.recoil = Math.max(0, s.recoil - realMs);
      if (s.lunge > 0) s.lunge = Math.max(0, s.lunge - realMs);
      if (s.hurt > 0) s.hurt = Math.max(0, s.hurt - realMs);
      if (s.alertT > 0) s.alertT = Math.max(0, s.alertT - realMs);
      if (s.dieT >= 0) s.dieT += realMs;
    }
  }

  // ---- event hooks (subscribed by render) ----
  function onDamage(world, ev) {
    const s = stateOf(ev.tgtId);
    s.flash = 120; s.hurt = 120;
    const src = BD.sim.entities.get(world, ev.srcId), tgt = BD.sim.entities.get(world, ev.tgtId);
    if (src && tgt && !ev.isDot) {
      const dx = tgt.x - src.x, dy = tgt.y - src.y, l = Math.hypot(dx, dy) || 1;
      s.recoil = 150; s.rx = dx / l; s.ry = dy / l;
    }
  }
  function onAttack(id, tx, ty, e) {
    const s = stateOf(id);
    const dx = tx - e.x, dy = ty - e.y, l = Math.hypot(dx, dy) || 1;
    s.lunge = 80; s.lx = dx / l; s.ly = dy / l;
  }

  BD.view.entities = { vis, stateOf, clear, pos, artOf, palOf, scaleOf, tick, onDamage, onAttack, CLASS_ART };
})(globalThis.BD);
