// @ts-check
// World things beyond tiles and actors: zones/telegraphs, corpses and death ghosts, floor objects,
// projectiles, auras, health bars, nameplates, status pips, "!" alerts.
(function (BD) {
  'use strict';

  const iso = BD.view.iso;
  const Palette = BD.view.palette;
  const Render = BD.view.render;
  const EntityView = BD.view.entities;
  const Overlays = () => BD.view.overlays;
  const Grid = BD.core.grid;
  const tmp = { x: 0, y: 0 }, tmp2 = { x: 0, y: 0 };
  const ghosts = [];

  // ---------- zones ----------
  /** friendly telegraphs are gold; hostile ones red, or orange in colourblind mode */
  function telegraphColour(friendly, colorblind) {
    if (friendly) return '#ffd27a';
    return colorblind ? '#ff9a20' : '#ff3a1a';
  }
  function drawZones(ctx, world, alpha, t) {
    const f = world.floor;
    const cb = BD.view.host.prefs.colorblind;
    for (const z of f.zones) {
      if (z.cancelled) continue;
      const vis = z.tiles.some(([x, y]) => x >= 0 && y >= 0 && x < f.w && y < f.h && f.explored[Grid.idx(f, x, y)]);
      if (!vis) continue;
      if (!z.resolved && z.telegraph) {
        const k = 1 - Math.max(0, z.armMs) / Math.max(1, z.armTotal);
        const friendly = z.faction === 'player';
        const col = telegraphColour(friendly, cb);
        const fillA = friendly ? 0.08 + 0.18 * k : 0.16 + 0.4 * k;
        const strokeA = friendly ? 0.35 + 0.3 * k : 0.55 + 0.45 * k;
        for (const [x, y] of z.tiles) {
          if (x < 0 || y < 0 || x >= f.w || y >= f.h) continue;
          // a telegraph shows on walkable tiles even unexplored (the player must see it coming)
          if (!BD.data.tiles.WALK[f.tiles[Grid.idx(f, x, y)]] && !f.explored[Grid.idx(f, x, y)]) continue;
          Overlays().diamondPath(ctx, x, y, 0.96);
          ctx.fillStyle = Palette.rgba(col, fillA);
          ctx.fill();
          ctx.lineWidth = iso.view.dpr;
          ctx.strokeStyle = Palette.rgba(col, strokeA);
          ctx.stroke();
          // progress sweep: an inner diamond grows from the edge to the centre
          Overlays().diamondPath(ctx, x, y, 0.96 * k);
          ctx.fillStyle = Palette.rgba(col, friendly ? 0.15 : 0.35);
          ctx.fill();
          if (cb && !friendly) {
            Overlays().diamondPath(ctx, x, y, 0.5);
            ctx.strokeStyle = 'rgba(40,120,255,0.8)';
            ctx.stroke();
          }
        }
        continue;
      }
      if (!z.resolved) continue;
      // lingering ground effects
      const sch = Palette.SCHOOL[z.school] || Palette.SCHOOL.general;
      const fade = Math.min(1, z.durMs / 600);
      for (const [x, y] of z.tiles) {
        if (x < 0 || y < 0 || x >= f.w || y >= f.h || !f.explored[Grid.idx(f, x, y)]) continue;
        const fl = 0.75 + 0.25 * Math.sin(t / 160 + x * 1.7 + y * 2.3);
        Overlays().diamondPath(ctx, x, y, 0.92);
        ctx.fillStyle = Palette.rgba(sch.mid, 0.22 * fade * fl);
        ctx.fill();
        ctx.strokeStyle = Palette.rgba(sch.edge, 0.35 * fade);
        ctx.lineWidth = iso.view.dpr;
        ctx.stroke();
        if (Math.random() < 0.02 * fade && BD.view.fx) {
          const sx = x + Math.random() - 0.5, sy = y + Math.random() - 0.5;
          BD.view.fx.spark(sx, sy, { vz: 0.03, g: -0.00003, life: 500, size: 2, color: sch.mid, z: 2, ambient: true });
        }
      }
      if (z.school === 'fire' || z.school === 'lava' || z.school === 'storm') {
        BD.view.lighting.add(z.cx, z.cy, 2.5, sch.mid, 0.4 * fade, 0.3);
      }
    }
  }

  // ---------- buckets: corpses, ghosts, objects ----------
  function bucket(world, put, alpha) {
    const f = world.floor;
    for (const c of f.corpses) {
      if (!f.explored[Grid.idx(f, c.x, c.y)]) continue;
      put(c.x + c.y, { order: 0, draw: () => drawCorpse(c) });
    }
    for (const g of ghosts) put(Math.round(g.x + g.y), { order: 1, draw: () => drawGhost(g) });
    for (const o of f.objects) {
      if (!f.explored[Grid.idx(f, o.x, o.y)]) continue;
      put(o.x + o.y, { order: 1, draw: () => drawObject(world, o) });
    }
    if (BD.view.items) BD.view.items.bucket(world, put);
  }

  function drawCorpse(c) {
    const d = BD.data.monsters[c.def];
    if (!d) return;
    const fade = c.prop ? 0.8 : Math.min(1, c.ms / 2000);
    Render.drawArt(d.sprite, 'corpse', 0, c.x, c.y, {
      pal: d.pal || null, palKey: c.def + 'c', flip: c.dir >= 2 && c.dir <= 5, alpha: fade, dy: 4 * iso.view.S,
    });
  }
  function drawGhost(g) {
    const fi = Math.min(2, Math.floor(g.t / 110));
    Render.drawArt(g.art, 'death', fi, g.x, g.y, {
      pal: g.pal, palKey: g.palKey, flip: g.flip, scale: g.scale, alpha: 1 - Math.max(0, g.t - 300) / 100,
    });
  }
  function drawObject(world, o) {
    const map = {
      chest: o.opened ? 'prop_chest_open' : 'prop_chest',
      pile: 'prop_pile', shrine: 'prop_shrine', lever: 'prop_lever', altar: 'prop_altar',
    };
    if (o.kind === 'trap') {
      if (o.visible && !o.disarmed) drawTrap(o);
      return;
    }
    if (o.kind === 'pile' && o.used) return;
    if (o.kind === 'npc') {
      const n = Object.values(BD.data.town.npcs).find((q) => q.role === o.role);
      if (n) {
        Render.shadow(o.x, o.y, 1);
        Render.drawArt(n.art, 'idle', 0, o.x, o.y, { pal: n.pal, palKey: 'npc_' + o.role, flip: o.x > world.player.x });
      }
      return;
    }
    if (o.kind === 'portal' || o.kind === 'exit_portal') {
      drawPortal(o, world);
      return;
    }
    const id = map[o.kind];
    if (id) Render.drawArt(id, 'idle', 0, o.x, o.y, { alpha: o.kind === 'shrine' && o.used ? 0.6 : 1 });
  }
  function drawPortal(o, world) {
    const ctx = Render.ctx, zk = iso.view.Z * iso.view.dpr;
    iso.toScreen(o.x, o.y, tmp);
    const t = Render.timeMs / 1000;
    const col = o.kind === 'exit_portal' ? '#ffd27a' : '#b06aff';
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = 0.35 - i * 0.08;
      ctx.drawImage(BD.view.fx.glow(col), tmp.x - (14 + i * 6) * zk, tmp.y - (52 + i * 4) * zk, (28 + i * 12) * zk, (52 + i * 8) * zk);
    }
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = col;
    ctx.lineWidth = 2 * zk;
    ctx.beginPath();
    ctx.ellipse(tmp.x, tmp.y - 22 * zk, 9 * zk, 20 * zk, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.5 + 0.2 * Math.sin(t * 4);
    ctx.fillStyle = Palette.rgba(col, 0.4);
    ctx.beginPath();
    ctx.ellipse(tmp.x, tmp.y - 22 * zk, 7 * zk, 17 * zk, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    BD.view.lighting.add(o.x, o.y, 3, col, 0.9, 0.15);
    if (Math.random() < 0.3) {
      const sx = o.x + (Math.random() - 0.5) * 0.5, sy = o.y + (Math.random() - 0.5) * 0.5;
      BD.view.fx.spark(sx, sy, { z: 10 + Math.random() * 30, vz: 0.02, g: -0.00003, life: 700, size: 2, color: col, ambient: true });
    }
  }

  function drawTrap(o) {
    Overlays().diamondPath(Render.ctx, o.x, o.y, 0.6);
    Render.ctx.strokeStyle = 'rgba(160,130,90,0.55)';
    Render.ctx.lineWidth = iso.view.dpr;
    Render.ctx.stroke();
    iso.toScreen(o.x, o.y, tmp);
    Render.ctx.fillStyle = 'rgba(40,30,20,0.6)';
    const s = iso.view.S;
    for (let i = -2; i <= 2; i++) Render.ctx.fillRect(tmp.x + i * 3 * s, tmp.y - s, s, s * 2);
  }

  function addGhost(world, ev) {
    const d = BD.data.monsters[ev.def] || (BD.data.bosses && BD.data.bosses[ev.def]);
    if (!d) return;
    const e = { def: ev.def, rank: ev.rank, palOverride: null, kind: 'monster', dir: 2 };
    ghosts.push({
      art: d.sprite, pal: EntityView.palOf(e), palKey: ev.def + ev.rank, x: ev.x, y: ev.y, flip: false, scale: d.scale || 1, t: 0,
    });
  }

  // ---------- projectiles (after lighting so they glow) ----------
  const SHAFT_LEN = { arrow: 12, bolt: 9, spear: 16 };   // streak length of shafted projectiles, art px
  const GLOW_RADIUS = { orb_big: 11, spark: 6 };          // glow radius of the others, art px (default 8)
  function drawProjectiles(ctx, world, alpha) {
    const f = world.floor;
    const zk = iso.view.Z * iso.view.dpr;
    const step = BD.core.scheduler.STEP_MS;
    for (const pr of f.projectiles) {
      const x = pr.x + pr.dx * (pr.speed * step * alpha) / 1000, y = pr.y + pr.dy * (pr.speed * step * alpha) / 1000;
      if (!f.visible[Grid.idx(f, Math.round(x), Math.round(y))]) continue;
      const kd = BD.data.projectiles[pr.kind] || {};
      const sch = Palette.SCHOOL[kd.school] || Palette.SCHOOL.general;
      iso.toScreen(x, y, tmp);
      const sy = tmp.y - 14 * zk;
      const sdx = (pr.dx - pr.dy) * iso.HW, sdy = (pr.dx + pr.dy) * iso.HH, sl = Math.hypot(sdx, sdy) || 1;
      const ux = sdx / sl, uy = sdy / sl;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      if (kd.sprite === 'arrow' || kd.sprite === 'bolt' || kd.sprite === 'spear') {
        const len = SHAFT_LEN[kd.sprite] * zk;
        ctx.strokeStyle = sch.mid;
        ctx.lineWidth = (kd.sprite === 'spear' ? 3 : 2) * zk;
        ctx.beginPath();
        ctx.moveTo(tmp.x - ux * len, sy - uy * len);
        ctx.lineTo(tmp.x, sy);
        ctx.stroke();
        ctx.strokeStyle = sch.core;
        ctx.lineWidth = zk;
        ctx.beginPath();
        ctx.moveTo(tmp.x - ux * len * 0.5, sy - uy * len * 0.5);
        ctx.lineTo(tmp.x + ux * 2 * zk, sy + uy * 2 * zk);
        ctx.stroke();
      } else {
        const r = (GLOW_RADIUS[kd.sprite] || 8) * zk;
        ctx.drawImage(BD.view.fx.glow(sch.mid), tmp.x - r * 1.6, sy - r * 1.6, r * 3.2, r * 3.2);
        ctx.drawImage(BD.view.fx.glow(sch.core), tmp.x - r * 0.6, sy - r * 0.6, r * 1.2, r * 1.2);
        if (Math.random() < 0.5) BD.view.fx.spark(x, y, { z: 14, vz: 0.01, g: 0, life: 260, size: 2, color: sch.mid, ambient: true });
      }
      ctx.restore();
      if (kd.light) BD.view.lighting.add(x, y, 2.2, kd.light, 0.7, 0.1);
    }
  }

  // ---------- auras (under actors) ----------
  function aura(ctx, world, e, ep, s, t) {
    if (e.kind !== 'monster') return;
    const zk = iso.view.Z * iso.view.dpr;
    if (e.rank === 'champion' || e.rank === 'unique' || e.rank === 'keeper' || e.rank === 'minion') {
      const col = e.mods && e.mods.length ? Palette.MOD_AURA[e.mods[0]] || '#ffffff' : '#ffd23a';
      const pulse = 0.55 + 0.25 * Math.sin((t / 1600) * Math.PI * 2);
      const minion = e.rank === 'minion';
      const radius = minion ? 0.38 : 0.48;
      const width = (minion ? 1 : 2) * (iso.view.dpr);
      Overlays().ring(ctx, ep.x, ep.y, radius, col, width, pulse);
      if (e.rank !== 'minion') {
        iso.toScreen(ep.x, ep.y, tmp);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.25 * pulse;
        const r = 18 * zk;
        ctx.drawImage(BD.view.fx.glow(col), tmp.x - r, tmp.y - 22 * zk - r, r * 2, r * 2);
        ctx.restore();
      }
    }
    if (e.ai && e.ai.state === 'exposed') Overlays().ring(ctx, ep.x, ep.y, 0.6, '#ffd23a', 3 * iso.view.dpr, 0.6 + 0.4 * Math.sin(t / 95));
    if (world.player.lockId === e.id) Overlays().ring(ctx, ep.x, ep.y, 0.55, '#fff3c0', 1.5 * iso.view.dpr, 0.8);
  }

  // ---------- health bars & nameplates (overlay) ----------
  function barColour(e, elite) {
    if (e.kind === 'ally') return '#4ab0ff';
    if (e.rank === 'champion') return '#5a8aff';
    return elite ? '#e0b020' : '#c02020';
  }
  function bars(ctx, world) {
    const f = world.floor;
    const always = BD.view.host.showBars || BD.view.host.prefs.alwaysBars;
    const hover = BD.view.host.pointer.hoverEntity;
    const zk = iso.view.Z * iso.view.dpr;
    for (const e of f.entities.values()) {
      if (e.dead || e.untargetable || !f.visible[Grid.idx(f, e.x, e.y)] || e.faction === 'player' && e.kind !== 'ally') continue;
      const max = BD.sim.stats.statsOf(world, e).maxLife;
      const elite = e.rank !== 'normal' && e.rank !== 'minion';
      if (!(always || e === hover || (e.hp < max && e.kind === 'monster') || elite || e.kind === 'ally')) continue;
      if (e.rank === 'boss' || e.rank === 'malgoth') continue;
      const ep = EntityView.pos(e, 0, tmp2);
      iso.toScreen(ep.x, ep.y, tmp);
      const box = e._box;
      const top = box ? box.y - 6 * iso.view.dpr : tmp.y - 50 * zk;
      const w = (elite ? 40 : 28) * zk * 0.7, h = Math.max(3, 3 * iso.view.dpr);
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(tmp.x - w / 2 - 1, top - 1, w + 2, h + 2);
      ctx.fillStyle = barColour(e, elite);
      ctx.fillRect(tmp.x - w / 2, top, w * Math.max(0, e.hp / max), h);
      if (elite && e.name) {
        ctx.font = `${Math.round(11 * Math.max(1, iso.view.dpr))}px Georgia, serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#000';
        ctx.fillText(e.name, tmp.x + 1, top - 4 * iso.view.dpr + 1);
        ctx.fillStyle = e.rank === 'champion' ? '#7aa0ff' : '#ffd23a';
        ctx.fillText(e.name, tmp.x, top - 4 * iso.view.dpr);
      }
      // status pips
      let i = 0;
      for (const st of e.statuses) {
        const sd = BD.data.statuses[st.id];
        if (!sd || sd.hiddenChip || i > 5) continue;
        ctx.fillStyle = Palette.STATUS_COLOR[st.id] || '#fff';
        const px = tmp.x - w / 2 + i * 6 * iso.view.dpr, py = top + h + 2 * iso.view.dpr;
        ctx.fillRect(px, py, 4 * iso.view.dpr, 4 * iso.view.dpr);
        i++;
      }
    }
  }

  function update(ms) {
    for (let i = 0; i < ghosts.length; i++) {
      ghosts[i].t += ms;
      if (ghosts[i].t > 400) ghosts.splice(i--, 1);
    }
  }
  function clear() { ghosts.length = 0; }

  BD.view.world = { bucket, drawZones, drawProjectiles, aura, bars, addGhost, update, clear };
  Render.hooks.underActors.push(drawZones);
  Render.actorUnder.push(aura);
  Render.hooks.overlays.push(bars);
  Render.hooks.fx.push(drawProjectiles);
})(globalThis.BD);
