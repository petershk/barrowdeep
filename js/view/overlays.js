// @ts-check
// Overlays that must never be hidden: hover tile, path destination, target marker, health bars,
// interact prompts, item labels, Exposed rings (07 §1.2 step 7).
(function (BD) {
  'use strict';

  const iso = BD.view.iso;
  const { WALK } = BD.data.tiles;
  const tmp = { x: 0, y: 0 };

  function diamondPath(ctx, x, y, k) {
    const S = iso.view.S;
    iso.toScreen(x, y, tmp);
    const hw = iso.HW * S * (k || 1), hh = iso.HH * S * (k || 1);
    ctx.beginPath();
    ctx.moveTo(tmp.x, tmp.y - hh); ctx.lineTo(tmp.x + hw, tmp.y); ctx.lineTo(tmp.x, tmp.y + hh); ctx.lineTo(tmp.x - hw, tmp.y);
    ctx.closePath();
  }

  function ring(ctx, x, y, r, col, width, alpha) {
    const S = iso.view.S;
    iso.toScreen(x, y, tmp);
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.strokeStyle = col; ctx.lineWidth = width * iso.view.dpr;
    ctx.beginPath(); ctx.ellipse(tmp.x, tmp.y, r * iso.HW * S, r * iso.HH * S, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  function hover(ctx, world) {
    const m = BD.view.host.pointer, f = world.floor;
    if (!m.inside || !m.hoverTile || m.hoverEntity) return;
    const { x, y } = m.hoverTile;
    if (x < 0 || y < 0 || x >= f.w || y >= f.h || !f.explored[y * f.w + x]) return;
    const ok = WALK[f.tiles[y * f.w + x]];
    diamondPath(ctx, x, y, 0.92);
    ctx.lineWidth = iso.view.dpr;
    ctx.strokeStyle = ok ? 'rgba(255,255,255,0.45)' : 'rgba(150,150,150,0.4)';
    ctx.stroke();
    if (!ok) {
      iso.toScreen(x, y, tmp);
      const s = 4 * iso.view.S;
      ctx.beginPath();
      ctx.moveTo(tmp.x - s, tmp.y - s / 2); ctx.lineTo(tmp.x + s, tmp.y + s / 2);
      ctx.moveTo(tmp.x + s, tmp.y - s / 2); ctx.lineTo(tmp.x - s, tmp.y + s / 2);
      ctx.stroke();
    }
  }

  function pathDest(ctx, world, alpha, t) {
    const p = world.player, it = p.intent;
    if (!it || it.kind !== 'move' || !it.path || !it.path.length) return;
    const [x, y] = it.path[it.path.length - 1];
    const k = 0.5 + 0.15 * Math.sin(t / 95);
    diamondPath(ctx, x, y, k);
    ctx.strokeStyle = 'rgba(232,210,140,0.7)'; ctx.lineWidth = iso.view.dpr; ctx.stroke();
  }

  BD.view.overlays = { diamondPath, ring, hover, pathDest };
  BD.view.render.hooks.underActors.push((ctx, world, alpha, t) => { pathDest(ctx, world, alpha, t); });
  BD.view.render.hooks.overlays.push((ctx, world) => hover(ctx, world));
})(globalThis.BD);
