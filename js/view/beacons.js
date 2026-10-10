// @ts-check
// Beacons: the way on and the way home must be easy to find. Stairs get their own light, a rim that pulses
// on the ambient beat, a bobbing chevron and drifting motes; open portals, the active waypoint and the town
// portal stone (while a portal is open) shed a steady inward spiral of portal purple (ART_DIRECTION.md).
(function (BD) {
  'use strict';

  const iso = BD.view.iso;
  const Grid = BD.core.grid;
  const T = BD.data.tiles.T;
  const Palette = BD.view.palette;
  const Lighting = BD.view.lighting;
  const Fx = () => BD.view.fx;
  const tmp = { x: 0, y: 0 };

  const EXIT = Palette.MEANING.friendly;      // the minimap marks stairs in the same bone colour
  const SEALED = Palette.SCHOOL.seal.mid;
  const PORTAL = Palette.SCHOOL.portal;
  const NEAR = 16;                             // tiles: farther beacons don't spend particles
  const RATE = { portal: 0.045, waypoint: 0.03, stone: 0.03, stairs: 0.008 };   // particles per ms

  /** stairs, the waypoint and the portal stone of a floor, found once per floor */
  let featKey = '', feats = [];
  function features(f) {
    const k = f.key + ':' + f.seed;
    if (k === featKey) return feats;
    featKey = k;
    feats = [];
    for (let i = 0; i < f.tiles.length; i++) {
      const t = f.tiles[i];
      if (t === T.STAIRS_UP || t === T.STAIRS_DOWN || t === T.STAIRS_SEALED || t === T.WAYPOINT || t === T.PORTAL_STONE) {
        feats.push({ t, x: i % f.w, y: (i / f.w) | 0, acc: 0 });
      }
    }
    return feats;
  }

  /** portal purple the way the waypoint and stone are lit when they would take you somewhere */
  function active(world, fe) {
    if (fe.t === T.PORTAL_STONE) return !!world.run.portal;
    if (fe.t !== T.WAYPOINT) return false;
    const f = world.floor;
    return world.run.waypoints.includes(f.key === 'town' ? 0 : f.n);
  }

  /** whole particles owed after dt ms at `rate`, carrying the fraction in o.acc */
  function owed(o, rate, dt) {
    o.acc = (o.acc || 0) + rate * dt;
    const n = Math.floor(o.acc);
    o.acc -= n;
    return n;
  }

  function portalColor(c) {
    if (c < 0.55) return PORTAL.mid;
    return c < 0.85 ? PORTAL.core : PORTAL.edge;
  }

  /** one mote of the spiral: starts on a ring, curls inward and rises */
  function spiralMote(x, y) {
    const a = Math.random() * Math.PI * 2, r = 0.5 + Math.random() * 0.35;
    const vIn = 0.00035 + Math.random() * 0.0002, vRound = 0.0007;
    Fx().spark(x + Math.cos(a) * r, y + Math.sin(a) * r, {
      vx: -Math.cos(a) * vIn - Math.sin(a) * vRound, vy: -Math.sin(a) * vIn + Math.cos(a) * vRound,
      z: 4 + Math.random() * 34, vz: 0.012, g: -0.00001, life: 800 + Math.random() * 400,
      size: 1.5 + Math.random() * 1.5, color: portalColor(Math.random()), ambient: true,
    });
  }

  /** a mote over the stairs: sinks into the way down, drifts up off the way up */
  function stairMote(fe) {
    const down = fe.t === T.STAIRS_DOWN;
    Fx().spark(fe.x + (Math.random() - 0.5) * 0.7, fe.y + (Math.random() - 0.5) * 0.7, {
      z: down ? 26 + Math.random() * 8 : 2, vz: down ? -0.012 : 0.03, g: 0, life: 1100 + Math.random() * 400,
      size: 1.5 + Math.random(), color: EXIT, ambient: true,
    });
  }

  function emitAll(world, dt) {
    const f = world.floor, p = world.player;
    for (const fe of features(f)) {
      if (!f.explored[Grid.idx(f, fe.x, fe.y)]) continue;
      const near = Math.abs(fe.x - p.x) + Math.abs(fe.y - p.y) < NEAR;
      if (fe.t === T.STAIRS_UP || fe.t === T.STAIRS_DOWN) {
        Lighting.add(fe.x, fe.y, 2.5, EXIT, 0.55, 0.05);
        if (near) for (let n = owed(fe, RATE.stairs, dt); n > 0; n--) stairMote(fe);
      } else if (active(world, fe)) {
        Lighting.add(fe.x, fe.y, 3, PORTAL.mid, 0.6, 0.1);
        if (near) for (let n = owed(fe, fe.t === T.WAYPOINT ? RATE.waypoint : RATE.stone, dt); n > 0; n--) spiralMote(fe.x, fe.y);
      }
    }
    for (const o of f.objects) {
      if (o.kind !== 'portal' && o.kind !== 'exit_portal') continue;
      for (let n = owed(o, RATE.portal, dt); n > 0; n--) spiralMote(o.x, o.y);
    }
  }

  /** the rim and chevron, drawn after lighting so darkness never swallows them */
  function drawStairs(ctx, f, fe, timeMs) {
    const sealed = fe.t === T.STAIRS_SEALED;
    const col = sealed ? SEALED : EXIT;
    const b = Fx().beat('ambient', timeMs);
    const dpr = iso.view.dpr, S = iso.view.S;
    ctx.save();
    BD.view.overlays.diamondPath(ctx, fe.x, fe.y, 1.05);
    ctx.strokeStyle = col;
    ctx.globalAlpha = (sealed ? 0.25 : 0.4) + 0.35 * b;
    ctx.lineWidth = Math.max(2 * dpr, S);
    ctx.stroke();
    if (!sealed) {
      iso.toScreen(fe.x, fe.y, tmp);
      const down = fe.t === T.STAIRS_DOWN;
      const cy = tmp.y - (20 + 3 * b) * S, w = 5 * S, h = (down ? 4 : -4) * S;
      ctx.globalAlpha = 0.6 + 0.4 * b;
      ctx.lineWidth = 2 * S;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (const k of [0, 1]) {
        const y0 = cy + k * 5 * S * (down ? 1 : -1) - h / 2;
        ctx.moveTo(tmp.x - w, y0);
        ctx.lineTo(tmp.x, y0 + h);
        ctx.lineTo(tmp.x + w, y0);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  let lastMs = 0;
  BD.view.render.hooks.underActors.push((ctx, world, alpha, timeMs) => {
    const dt = Math.min(100, Math.max(0, timeMs - lastMs));
    lastMs = timeMs;
    emitAll(world, dt);
  });
  BD.view.render.hooks.overlays.push((ctx, world, alpha, timeMs) => {
    const f = world.floor;
    for (const fe of features(f)) {
      const isStairs = fe.t === T.STAIRS_UP || fe.t === T.STAIRS_DOWN || fe.t === T.STAIRS_SEALED;
      if (isStairs && f.explored[Grid.idx(f, fe.x, fe.y)]) drawStairs(ctx, f, fe, timeMs);
    }
  });

  BD.view.beacons = { features, active };
})(globalThis.BD);
