// @ts-check
// Ground items: category icon with a rarity glow (radius (9 + 7·tier)·Z, alpha 0.14 + 0.09·tier),
// motes per second by tier, a light shaft for legendaries, a beam for the seal/key, a hop on drop,
// and name labels (Alt, or hover).
(function (BD) {
  'use strict';

  const iso = BD.view.iso;
  const Palette = BD.view.palette;
  const Render = BD.view.render;
  const Grid = BD.core.grid;
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
    if (g.kind === 'gold') return Palette.MEANING.gold;
    if (g.kind === 'orb') return Palette.MEANING.lifeLow;
    if (g.kind === 'seal' || g.kind === 'key') return Palette.SCHOOL.seal.mid;
    if (g.kind === 'scroll') return Palette.RARITY.common;
    return Palette.RARITY[g.item.rarity];
  }
  /** the shared ambient beat (1.6 s), -1..1 */
  const ambient = () => Math.sin((Render.timeMs / BD.view.fx.BEAT.ambient) * Math.PI * 2);

  function bucket(world, put) {
    const f = world.floor;
    for (const g of f.items) {
      if (!f.explored[Grid.idx(f, g.x, g.y)]) continue;
      put(g.x + g.y, { order: 0.5, draw: () => drawItem(world, g) });
    }
  }

  /** glow tier: an item's rarity; the seal and key glow like legendaries; gold, orbs and scrolls don't */
  function tierOf(g) {
    if (g.kind === 'item') return TIER[g.item.rarity];
    return g.kind === 'seal' || g.kind === 'key' ? 3 : 0;
  }

  function drawItem(world, g) {
    const ctx = Render.ctx, S = iso.view.S, zk = iso.view.Z * iso.view.dpr;
    const tier = tierOf(g);
    const col = colorOf(g);
    const d = drops.get(g.uid);
    let hop = 0, x = g.x, y = g.y;
    if (d) {
      const k = Math.min(1, d.t / 420);
      x = d.fromX + (g.x - d.fromX) * k;
      y = d.fromY + (g.y - d.fromY) * k;
      hop = Math.sin(k * Math.PI) * 18 * zk;
    }
    iso.toScreen(x, y, tmp);
    // ground glow
    const r = (9 + 7 * tier) * zk;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.14 + 0.09 * tier + (tier >= 2 ? 0.05 * ambient() : 0);
    ctx.drawImage(BD.view.fx.glow(col), tmp.x - r, tmp.y - r * 0.55, r * 2, r * 1.1);
    ctx.restore();
    Render.drawArt(artOf(g), 'idle', 0, x, y, { dy: -hop - 2 * S });
    if (tier >= 3 && g.kind === 'item') BD.view.lighting.add(g.x, g.y, 3, col, 0.8, 0.1);
    if (g.kind === 'seal' || g.kind === 'key') BD.view.lighting.add(g.x, g.y, 4, Palette.SCHOOL.seal.mid, 1, 0.2);
  }

  /** after lighting: legendary shafts, seal beams (visible across the screen) */
  function shafts(ctx, world) {
    const f = world.floor, zk = iso.view.Z * iso.view.dpr;
    for (const g of f.items) {
      const leg = g.kind === 'item' && g.item.rarity === 'legendary';
      const beam = g.kind === 'seal' || g.kind === 'key';
      if (!leg && !beam) continue;
      if (!f.explored[Grid.idx(f, g.x, g.y)]) continue;
      iso.toScreen(g.x, g.y, tmp);
      const h = (beam ? 260 : 200) * zk;
      const w = (beam ? 12 : 9) * zk;
      const col = beam ? Palette.SCHOOL.seal.mid : Palette.RARITY.legendary;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const gr = ctx.createLinearGradient(0, tmp.y - h, 0, tmp.y);
      gr.addColorStop(0, Palette.rgba(col, 0));
      gr.addColorStop(0.8, Palette.rgba(col, 0.35));
      gr.addColorStop(1, Palette.rgba(beam ? Palette.SCHOOL.seal.core : Palette.SCHOOL.fire.core, 0.6));
      ctx.fillStyle = gr;
      const sway = ambient() * 0.15 + 0.85;
      ctx.fillRect(tmp.x - (w * sway) / 2, tmp.y - h, w * sway, h);
      ctx.restore();
    }
  }

  /** motes per second by tier (spawned with an accumulator, never per frame) */
  function motes(world, ms) {
    const f = world.floor;
    for (const g of f.items) {
      const tier = g.kind === 'item' ? TIER[g.item.rarity] : 0;
      if (!tier || !f.visible[Grid.idx(f, g.x, g.y)]) continue;
      const rate = [0, 1.5, 4, 9][tier];
      let a = (moteAcc.get(g.uid) || 0) + (rate * ms) / 1000;
      while (a >= 1) {
        a -= 1;
        const mx = g.x + (Math.random() - 0.5) * 0.6, my = g.y + (Math.random() - 0.5) * 0.6;
        BD.view.fx.spark(mx, my, { z: 2, vz: 0.04, g: -0.00004, life: 900, size: 1.6 + tier * 0.4, color: colorOf(g), ambient: true });
      }
      moteAcc.set(g.uid, a);
    }
    for (const [uid, d] of drops) {
      d.t += ms;
      if (d.t > 420) drops.delete(uid);
    }
  }

  /** labels: Alt shows all; hovering a tile shows that one */
  function labels(ctx, world) {
    const f = world.floor, m = BD.view.host.pointer;
    const all = BD.view.host.showLabels;
    const dpr = iso.view.dpr;
    ctx.save();
    ctx.font = Math.round(12 * dpr) + 'px Georgia, serif';
    ctx.textAlign = 'center';
    for (const g of f.items) {
      if (g.kind !== 'item' && g.kind !== 'scroll') continue;
      if (!f.explored[Grid.idx(f, g.x, g.y)]) continue;
      const hov = m.hoverTile && m.hoverTile.x === g.x && m.hoverTile.y === g.y;
      if (!all && !hov) continue;
      const scrollName = g.scroll === 'portal' ? 'Town Portal Scroll' : 'Scroll of Revelation';
      const name = g.kind === 'scroll' ? scrollName : BD.sim.items.derive(g.item).name;
      const tag = g.kind === 'item' && BD.view.host.prefs.colorblind ? Palette.RARITY_TAG[g.item.rarity] + ' ' : '';
      iso.toScreen(g.x, g.y, tmp);
      const txt = tag + name, w = ctx.measureText(txt).width + 10 * dpr;
      const y = tmp.y - 22 * iso.view.Z * dpr;
      ctx.fillStyle = 'rgba(8,6,4,0.82)';
      ctx.fillRect(tmp.x - w / 2, y - 12 * dpr, w, 16 * dpr);
      ctx.fillStyle = g.kind === 'item' ? Palette.RARITY[g.item.rarity] : Palette.RARITY.common;
      ctx.fillText(txt, tmp.x, y);
    }
    ctx.restore();
  }

  function onDrop(ev) { if (ev.fromX !== ev.x || ev.fromY !== ev.y) drops.set(ev.uid, { t: 0, fromX: ev.fromX, fromY: ev.fromY }); }

  BD.view.items = { bucket, drawItem, shafts, motes, labels, onDrop, artOf };
  Render.hooks.fx.push((ctx, world, alpha, t, realMs) => {
    shafts(ctx, world);
    motes(world, BD.view.host.paused() ? 0 : realMs);
  });
  Render.hooks.top.push((ctx, world) => labels(ctx, world));
})(globalThis.BD);
