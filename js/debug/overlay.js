// @ts-check
// Debug overlay (06 §14), F3 cycles: off → stats → stats + world layers (reach mask, pack ids, AI
// states, zones). Loaded only with ?debug=1.
(function (BD) {
  'use strict';

  const iso = BD.view.iso;
  let mode = 0, box = null, fps = 60, stepMs = 0, renderMs = 0, frames = 0, acc = 0;

  // time the sim step and the render without touching their code
  const step0 = BD.sim.world.step;
  BD.sim.world.step = function (w, dt) {
    const t = performance.now();
    step0(w, dt);
    stepMs = stepMs * 0.95 + (performance.now() - t) * 0.05;
  };
  const draw0 = BD.view.render.draw;
  BD.view.render.draw = function (w, a, r) {
    const t = performance.now();
    draw0(w, a, r);
    renderMs = renderMs * 0.95 + (performance.now() - t) * 0.05;
    if (mode && w && w.floor) tick(w, r);
  };

  window.addEventListener('keydown', (e) => { if (e.code === 'F3') { e.preventDefault(); setMode((mode + 1) % 3); } });
  function setMode(m) { mode = m; if (box) box.style.display = m ? '' : 'none'; }

  function tick(w, realMs) {
    frames++; acc += realMs;
    if (acc >= 500) { fps = Math.round((frames * 1000) / acc); frames = 0; acc = 0; }
    if (!box) { box = document.createElement('pre'); box.className = 'debug-overlay'; document.body.appendChild(box); }
    const f = w.floor;
    let mons = 0, awake = 0;
    for (const e of f.entities.values()) {
      if (e.faction !== 'monster' || e.dead) continue;
      mons++;
      if (e.ai && e.ai.state !== 'idle' && e.ai.state !== 'dormant') awake++;
    }
    const p = w.player;
    box.textContent = [
      'seed ' + w.run.seed + '   floor ' + f.key + '   AL ' + f.al + '   biome ' + f.biome,
      'fps ' + fps + '   step ' + stepMs.toFixed(2) + ' ms   render ' + renderMs.toFixed(2) + ' ms',
      'monsters ' + mons + ' (' + awake + ' awake)   projectiles ' + f.projectiles.length
        + '   zones ' + f.zones.length + '   items ' + (f.items || []).length,
      'particles ' + BD.view.fx.live + '   voices ' + (BD.audio.synth ? BD.audio.synth.voiceCount : 0)
        + '   time ' + (w.time / 1000).toFixed(1) + ' s',
      'player ' + p.x + ',' + p.y + '   L' + p.level + '   hp ' + Math.round(p.hp) + '   intent ' + (p.intent ? p.intent.kind : '-'),
      mode === 2 ? 'layers: reach mask (red) · zones · AI state #pack' : 'F3: world layers',
    ].join('\n');
  }

  const a = { x: 0, y: 0 };
  BD.view.render.hooks.top.push((ctx, w) => {
    if (mode !== 2) return;
    const f = w.floor, S = iso.view.S;
    ctx.save();
    ctx.font = Math.max(9, 4 * S) + 'px monospace';
    ctx.textAlign = 'center';
    // reach mask: explored walkable tiles the level entrance can't reach
    if (f.reach) {
      ctx.fillStyle = 'rgba(255,40,40,0.3)';
      for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
        const i = y * f.w + x;
        if (!f.explored[i] || f.reach[i] >= 0 || !BD.sim.entities.walkable(f, x, y)) continue;
        iso.toScreen(x, y, a);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y - iso.HH * S);
        ctx.lineTo(a.x + iso.HW * S, a.y);
        ctx.lineTo(a.x, a.y + iso.HH * S);
        ctx.lineTo(a.x - iso.HW * S, a.y);
        ctx.fill();
      }
    }
    for (const z of f.zones) {
      ctx.fillStyle = z.faction === 'player' ? 'rgba(80,160,255,0.35)' : 'rgba(255,200,40,0.35)';
      for (const [x, y] of z.tiles || []) { iso.toScreen(x, y, a); ctx.fillRect(a.x - 3 * S, a.y - 1.5 * S, 6 * S, 3 * S); }
    }
    for (const e of f.entities.values()) {
      if (e.dead || e.faction !== 'monster' || !f.visible[e.y * f.w + e.x]) continue;
      iso.toScreen(e.x, e.y, a);
      const st = e.ai ? e.ai.state : '?';
      ctx.fillStyle = st === 'windup' ? '#ff6040' : st === 'idle' || st === 'dormant' ? '#9a9a9a' : '#ffe080';
      ctx.fillText(st + (e.packId != null ? ' #' + e.packId : ''), a.x, a.y - 30 * S);
    }
    ctx.restore();
  });

  BD.debug.overlay = { get mode() { return mode; }, setMode };
})(globalThis.BD);
