// @ts-check
// Mouse: hover tile/entity, clicks, holds, wheel zoom. Commands go through input/intent.
(function (BD) {
  'use strict';

  const iso = BD.view.iso;
  const m = { screen: { x: 0, y: 0 }, hoverTile: null, hoverEntity: null, inside: false };

  function toDevice(ev) {
    const dpr = iso.view.dpr;
    return { x: ev.clientX * dpr, y: ev.clientY * dpr };
  }

  /** Enemy under the cursor: sprite box hit first, then the tile, then nearest within r. */
  function entityAt(world, screen, tile, r) {
    const f = world.floor;
    let best = null, bestD = Infinity;
    for (const e of f.entities.values()) {
      if (e.dead || e.faction === 'player' || e.untargetable) continue;
      if (!f.visible[e.y * f.w + e.x]) continue;
      const b = e._box;
      if (b && screen && screen.x >= b.x && screen.x <= b.x + b.w && screen.y >= b.y && screen.y <= b.y + b.h) {
        const d = Math.abs(screen.x - (b.x + b.w / 2)) + Math.abs(screen.y - (b.y + b.h / 2));
        if (d < bestD) { bestD = d; best = e; }
      }
    }
    if (best) return best;
    if (!tile) return null;
    const id = f.occ[tile.y * f.w + tile.x];
    if (id && id !== world.player.id) { const e = f.entities.get(id); if (e && e.faction !== 'player' && !e.untargetable) return e; }
    if (r) {
      for (const e of f.entities.values()) {
        if (e.dead || e.faction === 'player' || e.untargetable || !f.visible[e.y * f.w + e.x]) continue;
        const d = Math.hypot(e.x - tile.x, e.y - tile.y);
        if (d <= r && d < bestD) { bestD = d; best = e; }
      }
    }
    return best;
  }

  function attach(canvas) {
    const update = (ev) => {
      m.screen = toDevice(ev);
      m.inside = true;
      m.hoverTile = iso.toTile(m.screen.x, m.screen.y, { x: 0, y: 0 });
      const w = BD.app.world;
      m.hoverEntity = w && w.floor ? entityAt(w, m.screen, m.hoverTile) : null;
    };
    canvas.addEventListener('mousemove', update);
    canvas.addEventListener('mouseleave', () => { m.inside = false; });
    canvas.addEventListener('mousedown', (ev) => {
      update(ev);
      BD.app.userGesture();
      if (ev.button === 0) BD.input.intent.leftDown(m.hoverTile, m.screen, ev.shiftKey);
      else if (ev.button === 2) { BD.input.intent.hold.keys.rmb = true; BD.input.intent.skill('rmb', m.hoverTile, m.screen, false); }
      ev.preventDefault();
    });
    window.addEventListener('mouseup', (ev) => {
      if (ev.button === 0) BD.input.intent.leftUp();
      else if (ev.button === 2) BD.input.intent.hold.keys.rmb = false;
    });
    canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
    canvas.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const zs = iso.ZOOMS;
      let k = zs.indexOf(iso.view.Z);
      if (k < 0) k = 1;
      k = Math.max(0, Math.min(zs.length - 1, k + (ev.deltaY > 0 ? -1 : 1)));
      BD.view.render.setZoom(zs[k]);
      if (BD.ui.options) BD.ui.options.set('zoom', zs[k]);
    }, { passive: false });
  }

  /** recompute hover each frame (the camera moves under a still mouse) */
  function frame() {
    if (!m.inside || (BD.input.gamepad && BD.input.gamepad.pad.active)) return;
    m.hoverTile = iso.toTile(m.screen.x, m.screen.y, { x: 0, y: 0 });
    const w = BD.app.world;
    m.hoverEntity = w && w.floor ? entityAt(w, m.screen, m.hoverTile) : null;
  }

  BD.input.mouse = Object.assign(m, { attach, entityAt, frame });
})(globalThis.BD);
