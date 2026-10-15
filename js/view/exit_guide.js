// @ts-check
// The way out, once a floor is done (ART_DIRECTION.md "Beacons"): when the seal breaks, the floor is fully
// explored, the gate key is in hand or the act boss falls, the floor lights up (a wave of light runs out from
// the hero, lighting.js) and the exit is marked three ways: a pillar of light on it, a trail of light flowing
// along the floor from the hero toward it, and an arrow at the screen edge while it is off screen.
// View-only: it reads the floor and pathfinds on it, and never changes the sim.
(function (BD) {
  'use strict';

  const iso = BD.view.iso;
  const Grid = BD.core.grid;
  const Palette = BD.view.palette;
  const Lighting = BD.view.lighting;
  const Render = BD.view.render;
  const EXIT = Palette.MEANING.friendly;          // exits are bone, like the stairs beacon and the minimap mark
  const TRAIL_STEPS = 48;                          // tiles of trail drawn ahead of the hero
  const REPATH_MS = 500;
  const ARROW_MARGIN = 70;                         // CSS px from the screen edge
  const HUD_CLEAR = 190;                           // CSS px kept clear above the HUD plate
  const LABEL = { stairs: 'Stairs down', gate: 'Boss gate', portal: 'Portal home' };

  /** the exit of a finished floor, or null while there is still something to do (or nowhere to go) */
  function exitOf(world) {
    const f = world.floor, r = world.run;
    if (!f || f.key === 'town' || f.n === BD.data.floors.LAST) return null;
    if (typeof f.key === 'string') {
      const p = f.bossDead && f.objects.find((o) => o.kind === 'exit_portal');
      return p ? { x: p.x, y: p.y, kind: 'portal' } : null;
    }
    const fl = BD.data.floors.byN(f.n);
    if (fl.actEnd) {
      const g = f.gatePos;
      return g && r.flags['key' + f.n] ? { x: g.at.x, y: g.at.y, kind: 'gate' } : null;
    }
    if (!f.downPos || !(f.sealBroken || f.fullyExplored)) return null;
    return { x: f.downPos.x, y: f.downPos.y, kind: 'stairs' };
  }

  // per-floor state: was the floor already done, the last path and when it was found
  let floorKey = '', done = false, path = [], pathAt = -1e9, pathFrom = '';

  function update(world, timeMs) {
    const f = world.floor, p = world.player;
    const k = f.key + ':' + f.seed;
    const ex = exitOf(world);
    if (k !== floorKey) {
      floorKey = k;
      done = !!ex;
      path = [];
      if (done) Lighting.setReveal(f, p.x, p.y, timeMs, true);
    } else if (ex && !done) {
      done = true;
      Lighting.setReveal(f, p.x, p.y, timeMs, false);
    }
    if (!ex) return null;
    const from = p.x + ',' + p.y;
    if (from !== pathFrom || timeMs - pathAt > REPATH_MS) {
      const walk = (x, y) => BD.sim.entities.walkable(f, x, y);
      path = Grid.astar(f.w, f.h, p.x, p.y, ex.x, ex.y, walk, { allowGoalBlocked: true, partial: true }) || [];
      pathAt = timeMs;
      pathFrom = from;
    }
    return ex;
  }

  /** after the light: a line of glowing diamonds along the floor, pulses running from the hero to the exit */
  function trail(ctx, world, alpha, timeMs) {
    const ex = update(world, timeMs);
    if (!ex || !path.length) return;
    const f = world.floor, S = iso.view.S, o = { x: 0, y: 0 };
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const n = Math.min(TRAIL_STEPS, path.length);
    for (let i = 0; i < n; i++) {
      const [x, y] = path[i];
      const ti = Grid.idx(f, x, y);
      if (!f.explored[ti] || (f.occ[ti] && f.visible[ti])) continue;
      const pulse = Math.pow(Math.max(0, Math.cos(i * 0.32 - timeMs / 240)), 8);
      const fade = 1 - (i / (n + 6)) * 0.7;
      iso.toScreen(x, y, o);
      diamond(ctx, o, (5 + 3 * pulse) * S, EXIT, (0.3 + 0.55 * pulse) * fade);
      diamond(ctx, o, (1.5 + 1.5 * pulse) * S, '#ffffff', (0.25 + 0.6 * pulse) * fade);
    }
    ctx.restore();
  }

  /** a flat iso diamond `w` px across (half as tall) centred on a tile */
  function diamond(ctx, o, w, col, a) {
    const h = w / 2;
    ctx.globalAlpha = a;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(o.x, o.y - h);
    ctx.lineTo(o.x + w, o.y);
    ctx.lineTo(o.x, o.y + h);
    ctx.lineTo(o.x - w, o.y);
    ctx.closePath();
    ctx.fill();
  }

  /** after the light: a soft pillar of light standing on the exit, breathing on the ambient beat */
  function pillar(ctx, world, alpha, timeMs) {
    const ex = done && exitOf(world);
    if (!ex) return;
    const S = iso.view.S, o = iso.toScreen(ex.x, ex.y, { x: 0, y: 0 });
    const k = 0.75 + 0.25 * BD.view.fx.beat('ambient', timeMs);
    const w = 7 * S, hgt = 90 * S;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(0, o.y - hgt, 0, o.y);
    g.addColorStop(0, Palette.rgba(EXIT, 0));
    g.addColorStop(0.7, Palette.rgba(EXIT, 0.18 * k));
    g.addColorStop(1, Palette.rgba(EXIT, 0.42 * k));
    ctx.fillStyle = g;
    ctx.fillRect(o.x - w / 2, o.y - hgt, w, hgt);
    ctx.fillRect(o.x - w / 6, o.y - hgt, w / 3, hgt);
    ctx.restore();
  }

  /** on top: while the exit is off screen, an arrow at the edge points at it, with what it is and how far */
  function arrow(ctx, world, alpha, timeMs) {
    const ex = done && exitOf(world);
    if (!ex) return;
    const v = iso.view, dpr = v.dpr, o = iso.toScreen(ex.x, ex.y, { x: 0, y: 0 });
    const scale = (BD.view.host.prefs && BD.view.host.prefs.uiScale) || 1;
    const m = ARROW_MARGIN * dpr, top = m, bottom = v.h - (HUD_CLEAR * scale) * dpr;
    if (o.x > m && o.x < v.w - m && o.y > top && o.y < bottom) return;
    const cx = v.w / 2, cy = (top + bottom) / 2;
    const dx = o.x - cx, dy = o.y - cy;
    const t = Math.min(Math.abs((v.w / 2 - m) / (dx || 1e-6)), Math.abs(((bottom - top) / 2) / (dy || 1e-6)));
    const ax = cx + dx * t, ay = cy + dy * t, ang = Math.atan2(dy, dx);
    const pulse = 0.75 + 0.25 * BD.view.fx.beat('attention', timeMs), s = 13 * dpr;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(12,9,7,0.85)';
    ctx.strokeStyle = EXIT;
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.arc(0, 0, s * 1.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.rotate(ang);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = EXIT;
    ctx.beginPath();
    ctx.moveTo(s * 1.3, 0);
    ctx.lineTo(-s * 0.8, -s);
    ctx.lineTo(-s * 0.3, 0);
    ctx.lineTo(-s * 0.8, s);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    label(ctx, ex, world, ax, ay, ang, s * 1.9);
  }

  /** what the exit is and how many tiles away, set inward of the medallion (radius r) so they never overlap */
  function label(ctx, ex, world, ax, ay, ang, r) {
    const p = world.player, dpr = iso.view.dpr;
    const dist = Math.round(Math.hypot(ex.x - p.x, ex.y - p.y));
    const text = LABEL[ex.kind] + ' · ' + dist;
    ctx.save();
    ctx.font = Math.round(17 * dpr) + 'px "IM Fell English SC", Georgia, serif';
    const tw = ctx.measureText(text).width, ux = -Math.cos(ang), uy = -Math.sin(ang);
    const off = r + 10 * dpr + Math.abs(ux) * tw / 2 + Math.abs(uy) * 10 * dpr;
    const x = ax + ux * off, y = ay + uy * off;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3 * dpr;
    ctx.strokeStyle = '#0a0806';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = EXIT;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  Render.hooks.overlays.push(trail);
  Render.hooks.overlays.push(pillar);
  Render.hooks.top.push(arrow);
  BD.view.exitGuide = { exitOf };
})(globalThis.BD);
