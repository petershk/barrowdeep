// @ts-check
// Ground items: category icon with a rarity glow (radius (9 + 7·tier)·Z, alpha 0.14 + 0.09·tier),
// motes per second by tier, a light shaft for legendaries, a beam for the seal/key, a hop on drop,
// and name labels (Alt, or hover).
(function (BD) {
  'use strict';

  const iso = BD.view.iso;
  const P = BD.view.palette;
  const R = BD.view.render;
  const tmp = { x: 0, y: 0 };
  const TIER = { common: 0, magic: 1, rare: 2, legendary: 3 };
  const drops = new Map();          // uid → { t, fromX, fromY }
  const moteAcc = new Map();

  function artOf(g) {
    if (g.kind === 'gold') return 'item_gold';
    if (g.kind === 'orb') return 'item_orb_flask';
    if (g.kind === 'scroll') return 'item_scroll';
    if (g.kind === 'seal') return 'item_seal';
    if (g.kind === 'key') return 'item_key';
    return BD.view.itemArt.artFor(BD.sim.items.derive(g.item).category);
  }
  function colorOf(g) {
    if (g.kind === 'gold') return '#ffd23a';
    if (g.kind === 'orb') return '#ff4040';
    if (g.kind === 'seal' || g.kind === 'key') return '#ff3020';
    if (g.kind === 'scroll') return '#e8e0c8';
    return P.RARITY[g.item.rarity];
  }

  function bucket(world, put) {
    const f = world.floor;
    for (const g of f.items) {
      if (!f.explored[g.y * f.w + g.x]) continue;
      put(g.x + g.y, { order: 0.5, draw: () => drawItem(world, g) });
    }
  }

  function drawItem(world, g) {
    const ctx = R.ctx, S = iso.view.S, zk = iso.view.Z * iso.view.dpr;
    const tier = g.kind === 'item' ? TIER[g.item.rarity] : g.kind === 'seal' || g.kind === 'key' ? 3 : 0;
    const col = colorOf(g);
    const d = drops.get(g.uid);
    let hop = 0, x = g.x, y = g.y;
    if (d) {
      const k = Math.min(1, d.t / 420);
      x = d.fromX + (g.x - d.fromX) * k; y = d.fromY + (g.y - d.fromY) * k;
      hop = Math.sin(k * Math.PI) * 18 * zk;
    }
    iso.toScreen(x, y, tmp);
    // ground glow
    if (g.kind !== 'gold' || true) {
      const r = (9 + 7 * tier) * zk;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.14 + 0.09 * tier + (tier >= 2 ? 0.05 * Math.sin(R.timeMs / 600) : 0);
      ctx.drawImage(BD.view.fx.glow(col), tmp.x - r, tmp.y - r * 0.55, r * 2, r * 1.1);
      ctx.restore();
    }
    R.drawArt(artOf(g), 'idle', 0, x, y, { dy: -hop - 2 * S });
    if (tier >= 3 && g.kind === 'item') BD.view.lighting.add(g.x, g.y, 3, col, 0.8, 0.1);
    if (g.kind === 'seal' || g.kind === 'key') BD.view.lighting.add(g.x, g.y, 4, '#ff4030', 1, 0.2);
  }

  /** after lighting: legendary shafts, seal beams (visible across the screen) */
  function shafts(ctx, world) {
    const f = world.floor, zk = iso.view.Z * iso.view.dpr;
    for (const g of f.items) {
      const leg = g.kind === 'item' && g.item.rarity === 'legendary';
      const beam = g.kind === 'seal' || g.kind === 'key';
      if (!leg && !beam) continue;
      if (!f.explored[g.y * f.w + g.x]) continue;
      iso.toScreen(g.x, g.y, tmp);
      const h = (beam ? 260 : 200) * zk, w = (beam ? 12 : 9) * zk;
      const col = beam ? '#ff4030' : '#ff8a2a';
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const gr = ctx.createLinearGradient(0, tmp.y - h, 0, tmp.y);
      gr.addColorStop(0, P.rgba(col, 0)); gr.addColorStop(0.8, P.rgba(col, 0.35)); gr.addColorStop(1, P.rgba('#ffffff', 0.6));
      ctx.fillStyle = gr;
      const sway = Math.sin(R.timeMs / 600) * 0.15 + 0.85;
      ctx.fillRect(tmp.x - (w * sway) / 2, tmp.y - h, w * sway, h);
      ctx.restore();
    }
  }

  /** motes per second by tier (spawned with an accumulator, never per frame) */
  function motes(world, ms) {
    const f = world.floor;
    for (const g of f.items) {
      const tier = g.kind === 'item' ? TIER[g.item.rarity] : 0;
      if (!tier || !f.visible[g.y * f.w + g.x]) continue;
      const rate = [0, 1.5, 4, 9][tier];
      let a = (moteAcc.get(g.uid) || 0) + (rate * ms) / 1000;
      while (a >= 1) {
        a -= 1;
        BD.view.fx.spark(g.x + (Math.random() - 0.5) * 0.6, g.y + (Math.random() - 0.5) * 0.6, { z: 2, vz: 0.04, g: -0.00004, life: 900, size: 1.6 + tier * 0.4, color: colorOf(g), ambient: true });
      }
      moteAcc.set(g.uid, a);
    }
    for (const [uid, d] of drops) { d.t += ms; if (d.t > 420) drops.delete(uid); }
  }

  /** labels: Alt shows all; hovering a tile shows that one */
  function labels(ctx, world) {
    const f = world.floor, m = BD.input.mouse;
    const all = BD.app.showLabels;
    const dpr = iso.view.dpr;
    ctx.save();
    ctx.font = Math.round(12 * dpr) + 'px Georgia, serif';
    ctx.textAlign = 'center';
    for (const g of f.items) {
      if (g.kind !== 'item' && g.kind !== 'scroll') continue;
      if (!f.explored[g.y * f.w + g.x]) continue;
      const hov = m.hoverTile && m.hoverTile.x === g.x && m.hoverTile.y === g.y;
      if (!all && !hov) continue;
      const name = g.kind === 'scroll' ? (g.scroll === 'portal' ? 'Town Portal Scroll' : 'Scroll of Revelation') : BD.sim.items.derive(g.item).name;
      const tag = g.kind === 'item' && BD.ui.options && BD.ui.options.get('colorblind') ? P.RARITY_TAG[g.item.rarity] + ' ' : '';
      iso.toScreen(g.x, g.y, tmp);
      const txt = tag + name, w = ctx.measureText(txt).width + 10 * dpr;
      const y = tmp.y - 22 * iso.view.Z * dpr;
      ctx.fillStyle = 'rgba(8,6,4,0.82)';
      ctx.fillRect(tmp.x - w / 2, y - 12 * dpr, w, 16 * dpr);
      ctx.fillStyle = g.kind === 'item' ? P.RARITY[g.item.rarity] : '#e8e0c8';
      ctx.fillText(txt, tmp.x, y);
    }
    ctx.restore();
  }

  function onDrop(ev) { if (ev.fromX !== ev.x || ev.fromY !== ev.y) drops.set(ev.uid, { t: 0, fromX: ev.fromX, fromY: ev.fromY }); }

  BD.view.items = { bucket, drawItem, shafts, motes, labels, onDrop, artOf };
  R.hooks.fx.push((ctx, world, alpha, t, realMs) => { shafts(ctx, world); motes(world, BD.app.paused() ? 0 : realMs); });
  R.hooks.top.push((ctx, world) => labels(ctx, world));
})(globalThis.BD);
