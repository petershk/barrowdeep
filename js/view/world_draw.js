// @ts-check
// World things beyond tiles and actors: zones/telegraphs, corpses and death ghosts, floor objects,
// projectiles, auras, health bars, nameplates, status pips, "!" alerts.
(function (BD) {
  'use strict';

  const iso = BD.view.iso;
  const P = BD.view.palette;
  const R = BD.view.render;
  const V = BD.view.entities;
  const OV = () => BD.view.overlays;
  const tmp = { x: 0, y: 0 }, tmp2 = { x: 0, y: 0 };
  const ghosts = [];

  // ---------- zones ----------
  function drawZones(ctx, world, alpha, t) {
    const f = world.floor;
    const cb = BD.ui.options && BD.ui.options.get('colorblind');
    for (const z of f.zones) {
      if (z.cancelled) continue;
      const vis = z.tiles.some(([x, y]) => x >= 0 && y >= 0 && x < f.w && y < f.h && f.explored[y * f.w + x]);
      if (!vis) continue;
      if (!z.resolved && z.telegraph) {
        const k = 1 - Math.max(0, z.armMs) / Math.max(1, z.armTotal);
        const friendly = z.faction === 'player';
        const col = friendly ? '#ffd27a' : cb ? '#ff9a20' : '#ff3a1a';
        const fillA = friendly ? 0.08 + 0.18 * k : 0.16 + 0.4 * k;
        const strokeA = friendly ? 0.35 + 0.3 * k : 0.55 + 0.45 * k;
        for (const [x, y] of z.tiles) {
          if (x < 0 || y < 0 || x >= f.w || y >= f.h || !BD.data.tiles.WALK[f.tiles[y * f.w + x]] && !f.explored[y * f.w + x]) continue;
          OV().diamondPath(ctx, x, y, 0.96);
          ctx.fillStyle = P.rgba(col, fillA); ctx.fill();
          ctx.lineWidth = iso.view.dpr; ctx.strokeStyle = P.rgba(col, strokeA); ctx.stroke();
          // progress sweep: an inner diamond grows from the edge to the centre
          OV().diamondPath(ctx, x, y, 0.96 * k);
          ctx.fillStyle = P.rgba(col, friendly ? 0.15 : 0.35); ctx.fill();
          if (cb && !friendly) { OV().diamondPath(ctx, x, y, 0.5); ctx.strokeStyle = 'rgba(40,120,255,0.8)'; ctx.stroke(); }
        }
        continue;
      }
      if (!z.resolved) continue;
      // lingering ground effects
      const sch = P.SCHOOL[z.school] || P.SCHOOL.general;
      const fade = Math.min(1, z.durMs / 600);
      for (const [x, y] of z.tiles) {
        if (x < 0 || y < 0 || x >= f.w || y >= f.h || !f.explored[y * f.w + x]) continue;
        const fl = 0.75 + 0.25 * Math.sin(t / 160 + x * 1.7 + y * 2.3);
        OV().diamondPath(ctx, x, y, 0.92);
        ctx.fillStyle = P.rgba(sch.mid, 0.22 * fade * fl); ctx.fill();
        ctx.strokeStyle = P.rgba(sch.edge, 0.35 * fade); ctx.lineWidth = iso.view.dpr; ctx.stroke();
        if (Math.random() < 0.02 * fade && BD.view.fx) BD.view.fx.spark(x + Math.random() - 0.5, y + Math.random() - 0.5, { vz: 0.03, g: -0.00003, life: 500, size: 2, color: sch.mid, z: 2, ambient: true });
      }
      if (z.school === 'fire' || z.school === 'lava' || z.school === 'storm') BD.view.lighting.add(z.cx, z.cy, 2.5, sch.mid, 0.4 * fade, 0.3);
    }
  }

  // ---------- buckets: corpses, ghosts, objects ----------
  function bucket(world, put, alpha) {
    const f = world.floor;
    for (const c of f.corpses) {
      if (!f.explored[c.y * f.w + c.x]) continue;
      put(c.x + c.y, { order: 0, draw: () => drawCorpse(c) });
    }
    for (const g of ghosts) put(Math.round(g.x + g.y), { order: 1, draw: () => drawGhost(g) });
    for (const o of f.objects) {
      if (!f.explored[o.y * f.w + o.x]) continue;
      put(o.x + o.y, { order: 1, draw: () => drawObject(world, o) });
    }
    if (BD.view.items) BD.view.items.bucket(world, put);
  }

  function drawCorpse(c) {
    const d = BD.data.monsters[c.def];
    if (!d) return;
    const fade = c.prop ? 0.8 : Math.min(1, c.ms / 2000);
    R.drawArt(d.sprite, 'corpse', 0, c.x, c.y, { pal: d.pal || null, palKey: c.def + 'c', flip: c.dir >= 2 && c.dir <= 5, alpha: fade, dy: 4 * iso.view.S });
  }
  function drawGhost(g) {
    const fi = Math.min(2, Math.floor(g.t / 110));
    R.drawArt(g.art, 'death', fi, g.x, g.y, { pal: g.pal, palKey: g.palKey, flip: g.flip, scale: g.scale, alpha: 1 - Math.max(0, g.t - 300) / 100 });
  }
  function drawObject(world, o) {
    const map = { chest: o.opened ? 'prop_chest_open' : 'prop_chest', pile: 'prop_pile', shrine: 'prop_shrine', lever: 'prop_lever' };
    if (o.kind === 'trap') { if (o.visible && !o.disarmed) drawTrap(o); return; }
    if (o.kind === 'pile' && o.used) return;
    const id = map[o.kind];
    if (id) R.drawArt(id, 'idle', 0, o.x, o.y, { alpha: o.kind === 'shrine' && o.used ? 0.6 : 1 });
  }
  function drawTrap(o) {
    OV().diamondPath(R.ctx, o.x, o.y, 0.6);
    R.ctx.strokeStyle = 'rgba(160,130,90,0.55)'; R.ctx.lineWidth = iso.view.dpr; R.ctx.stroke();
    iso.toScreen(o.x, o.y, tmp);
    R.ctx.fillStyle = 'rgba(40,30,20,0.6)';
    const s = iso.view.S;
    for (let i = -2; i <= 2; i++) R.ctx.fillRect(tmp.x + i * 3 * s, tmp.y - s, s, s * 2);
  }

  function addGhost(world, ev) {
    const d = BD.data.monsters[ev.def] || (BD.data.bosses && BD.data.bosses[ev.def]);
    if (!d) return;
    const e = { def: ev.def, rank: ev.rank, palOverride: null, kind: 'monster', dir: 2 };
    ghosts.push({ art: d.sprite, pal: V.palOf(e), palKey: ev.def + ev.rank, x: ev.x, y: ev.y, flip: false, scale: d.scale || 1, t: 0 });
  }

  // ---------- projectiles (after lighting so they glow) ----------
  function drawProjectiles(ctx, world, alpha) {
    const f = world.floor;
    const zk = iso.view.Z * iso.view.dpr;
    const step = BD.core.scheduler.STEP_MS;
    for (const pr of f.projectiles) {
      const x = pr.x + pr.dx * (pr.speed * step * alpha) / 1000, y = pr.y + pr.dy * (pr.speed * step * alpha) / 1000;
      if (!f.visible[Math.round(y) * f.w + Math.round(x)]) continue;
      const kd = BD.data.projectiles[pr.kind] || {};
      const sch = P.SCHOOL[kd.school] || P.SCHOOL.general;
      iso.toScreen(x, y, tmp);
      const sy = tmp.y - 14 * zk;
      const sdx = (pr.dx - pr.dy) * iso.HW, sdy = (pr.dx + pr.dy) * iso.HH, sl = Math.hypot(sdx, sdy) || 1;
      const ux = sdx / sl, uy = sdy / sl;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      if (kd.sprite === 'arrow' || kd.sprite === 'bolt' || kd.sprite === 'spear') {
        const len = (kd.sprite === 'spear' ? 16 : kd.sprite === 'bolt' ? 9 : 12) * zk;
        ctx.strokeStyle = sch.mid; ctx.lineWidth = (kd.sprite === 'spear' ? 3 : 2) * zk;
        ctx.beginPath(); ctx.moveTo(tmp.x - ux * len, sy - uy * len); ctx.lineTo(tmp.x, sy); ctx.stroke();
        ctx.strokeStyle = sch.core; ctx.lineWidth = zk;
        ctx.beginPath(); ctx.moveTo(tmp.x - ux * len * 0.5, sy - uy * len * 0.5); ctx.lineTo(tmp.x + ux * 2 * zk, sy + uy * 2 * zk); ctx.stroke();
      } else {
        const r = (kd.sprite === 'orb_big' ? 11 : kd.sprite === 'spark' ? 6 : 8) * zk;
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
      const col = e.mods && e.mods.length ? P.MOD_AURA[e.mods[0]] || '#ffffff' : '#ffd23a';
      const pulse = 0.55 + 0.25 * Math.sin((t / 1600) * Math.PI * 2);
      OV().ring(ctx, ep.x, ep.y, e.rank === 'minion' ? 0.38 : 0.48, col, (e.rank === 'minion' ? 1 : 2) * (iso.view.dpr), pulse);
      if (e.rank !== 'minion') { iso.toScreen(ep.x, ep.y, tmp); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.25 * pulse; const r = 18 * zk; ctx.drawImage(BD.view.fx.glow(col), tmp.x - r, tmp.y - 22 * zk - r, r * 2, r * 2); ctx.restore(); }
    }
    if (e.ai && e.ai.state === 'exposed') OV().ring(ctx, ep.x, ep.y, 0.6, '#ffd23a', 3 * iso.view.dpr, 0.6 + 0.4 * Math.sin(t / 95));
    if (world.player.lockId === e.id) OV().ring(ctx, ep.x, ep.y, 0.55, '#fff3c0', 1.5 * iso.view.dpr, 0.8);
  }

  // ---------- health bars & nameplates (overlay) ----------
  function bars(ctx, world) {
    const f = world.floor, app = BD.app;
    const always = app.showBars || (BD.ui.options && BD.ui.options.get('alwaysBars'));
    const hover = BD.input.mouse.hoverEntity;
    const zk = iso.view.Z * iso.view.dpr;
    for (const e of f.entities.values()) {
      if (e.dead || e.untargetable || !f.visible[e.y * f.w + e.x] || e.faction === 'player' && e.kind !== 'ally') continue;
      const max = BD.sim.stats.statsOf(world, e).maxLife;
      const elite = e.rank !== 'normal' && e.rank !== 'minion';
      if (!(always || e === hover || (e.hp < max && e.kind === 'monster') || elite || e.kind === 'ally')) continue;
      if (e.rank === 'boss' || e.rank === 'malgoth') continue;
      const ep = V.pos(e, 0, tmp2);
      iso.toScreen(ep.x, ep.y, tmp);
      const box = e._box;
      const top = box ? box.y - 6 * iso.view.dpr : tmp.y - 50 * zk;
      const w = (elite ? 40 : 28) * zk * 0.7, h = Math.max(3, 3 * iso.view.dpr);
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(tmp.x - w / 2 - 1, top - 1, w + 2, h + 2);
      ctx.fillStyle = e.kind === 'ally' ? '#4ab0ff' : e.rank === 'champion' ? '#5a8aff' : elite ? '#e0b020' : '#c02020';
      ctx.fillRect(tmp.x - w / 2, top, w * Math.max(0, e.hp / max), h);
      if (elite && e.name) {
        ctx.font = `${Math.round(11 * Math.max(1, iso.view.dpr))}px Georgia, serif`;
        ctx.textAlign = 'center'; ctx.fillStyle = '#000';
        ctx.fillText(e.name, tmp.x + 1, top - 4 * iso.view.dpr + 1);
        ctx.fillStyle = e.rank === 'champion' ? '#7aa0ff' : '#ffd23a';
        ctx.fillText(e.name, tmp.x, top - 4 * iso.view.dpr);
      }
      // status pips
      let i = 0;
      for (const st of e.statuses) {
        const sd = BD.data.statuses[st.id];
        if (!sd || sd.hiddenChip || i > 5) continue;
        ctx.fillStyle = P.STATUS_COLOR[st.id] || '#fff';
        const px = tmp.x - w / 2 + i * 6 * iso.view.dpr, py = top + h + 2 * iso.view.dpr;
        ctx.fillRect(px, py, 4 * iso.view.dpr, 4 * iso.view.dpr);
        i++;
      }
    }
  }

  function update(ms) { for (let i = 0; i < ghosts.length; i++) { ghosts[i].t += ms; if (ghosts[i].t > 400) ghosts.splice(i--, 1); } }
  function clear() { ghosts.length = 0; }

  BD.view.world = { bucket, drawZones, drawProjectiles, aura, bars, addGhost, update, clear };
  R.hooks.underActors.push(drawZones);
  R.actorUnder.push(aura);
  R.hooks.overlays.push(bars);
  R.hooks.fx.push(drawProjectiles);
})(globalThis.BD);
