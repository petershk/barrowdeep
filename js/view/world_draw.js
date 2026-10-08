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
  // ART_DIRECTION.md: a telegraph is one shape (its outer silhouette, no per-tile grid) whose fill rises
  // and whose sweep closes from the edge to the centre; hostile = red-orange, solid edge (colour-blind:
  // magenta + hatching); friendly = bone, dashed edge, fill ≤ 0.2. Lingering hostile ground: element
  // fill ≈ 0.35 + a solid hostile edge; lingering friendly ground: fill ≤ 0.2 + a dashed bone rim.
  const zoneCache = new WeakMap();   // view-only per-zone data (never written onto the sim object)
  const key = (x, y) => x * 8192 + y;

  function zoneView(z) {
    let v = zoneCache.get(z);
    if (!v) {
      v = { acc: 0, inset: 0, n: -1 };
      zoneCache.set(z, v);
    }
    return v;
  }
  /** deepest tile distance (in tiles) from the shape's edge, for the edge→centre sweep */
  function insetOf(tiles, set) {
    const depth = new Map();
    let frontier = [];
    for (const [x, y] of tiles) {
      if (!set.has(key(x + 1, y)) || !set.has(key(x - 1, y)) || !set.has(key(x, y + 1)) || !set.has(key(x, y - 1))) {
        depth.set(key(x, y), 0);
        frontier.push([x, y]);
      }
    }
    let d = 0;
    while (frontier.length) {
      const next = [];
      d++;
      for (const [x, y] of frontier) {
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
          const k = key(nx, ny);
          if (!set.has(k) || depth.has(k)) continue;
          depth.set(k, d);
          next.push([nx, ny]);
        }
      }
      frontier = next;
    }
    return d - 1 + 0.5;
  }
  /** the union of the tiles' diamonds as one path (same winding: a fill covers each pixel once) */
  function fillPath(ctx, tiles) {
    ctx.beginPath();
    for (const [x, y] of tiles) {
      iso.toScreen(x - 0.5, y - 0.5, tmp);
      ctx.moveTo(tmp.x, tmp.y);
      iso.toScreen(x + 0.5, y - 0.5, tmp);
      ctx.lineTo(tmp.x, tmp.y);
      iso.toScreen(x + 0.5, y + 0.5, tmp);
      ctx.lineTo(tmp.x, tmp.y);
      iso.toScreen(x - 0.5, y + 0.5, tmp);
      ctx.lineTo(tmp.x, tmp.y);
      ctx.closePath();
    }
  }
  function edge(ctx, x0, y0, x1, y1) {
    iso.toScreen(x0, y0, tmp);
    ctx.moveTo(tmp.x, tmp.y);
    iso.toScreen(x1, y1, tmp);
    ctx.lineTo(tmp.x, tmp.y);
  }
  /** only the outer edges: a tile side whose neighbour is not in the set */
  function outlinePath(ctx, tiles, set) {
    ctx.beginPath();
    for (const [x, y] of tiles) {
      if (!set.has(key(x, y - 1))) edge(ctx, x - 0.5, y - 0.5, x + 0.5, y - 0.5);
      if (!set.has(key(x + 1, y))) edge(ctx, x + 0.5, y - 0.5, x + 0.5, y + 0.5);
      if (!set.has(key(x, y + 1))) edge(ctx, x + 0.5, y + 0.5, x - 0.5, y + 0.5);
      if (!set.has(key(x - 1, y))) edge(ctx, x - 0.5, y + 0.5, x - 0.5, y - 0.5);
    }
  }
  function strokeOutline(ctx, tiles, set, col, alpha, width, dashed) {
    const d = iso.view.dpr * iso.view.Z;
    outlinePath(ctx, tiles, set);
    ctx.lineCap = 'round';
    ctx.lineWidth = width * iso.view.dpr;
    ctx.strokeStyle = Palette.rgba(col, alpha);
    if (dashed) ctx.setLineDash([5 * d, 4 * d]);
    ctx.stroke();
    if (dashed) ctx.setLineDash([]);
    ctx.lineCap = 'butt';
  }
  /** the sweep: inside the shape, a band from the edge inward k of the way to the centre. Stroked in
   *  tile space (the iso transform) so the band is even in every direction. */
  function sweep(ctx, tiles, set, inset, k, col, alpha) {
    if (k <= 0) return;
    const v = iso.view, S = v.S;
    ctx.save();
    fillPath(ctx, tiles);
    ctx.clip();
    ctx.transform(iso.HW * S, iso.HH * S, -iso.HW * S, iso.HH * S, v.ox, v.oy);
    ctx.beginPath();
    const seg = (ax, ay, bx, by) => {
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
    };
    for (const [x, y] of tiles) {
      if (!set.has(key(x, y - 1))) seg(x - 0.5, y - 0.5, x + 0.5, y - 0.5);
      if (!set.has(key(x + 1, y))) seg(x + 0.5, y - 0.5, x + 0.5, y + 0.5);
      if (!set.has(key(x, y + 1))) seg(x - 0.5, y + 0.5, x + 0.5, y + 0.5);
      if (!set.has(key(x - 1, y))) seg(x - 0.5, y - 0.5, x - 0.5, y + 0.5);
    }
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = 2 * inset * k;
    ctx.strokeStyle = Palette.rgba(col, alpha);
    ctx.stroke();
    ctx.restore();
  }
  /** colour-blind hostile: diagonal hatching inside the shape */
  function hatch(ctx, tiles, alpha) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of tiles) {
      iso.toScreen(x, y, tmp);
      x0 = Math.min(x0, tmp.x);
      x1 = Math.max(x1, tmp.x);
      y0 = Math.min(y0, tmp.y);
      y1 = Math.max(y1, tmp.y);
    }
    const pad = iso.HW * iso.view.S, step = 6 * iso.view.dpr * iso.view.Z;
    ctx.save();
    fillPath(ctx, tiles);
    ctx.clip();
    ctx.beginPath();
    for (let x = x0 - pad - (y1 - y0) - pad; x < x1 + pad; x += step) {
      ctx.moveTo(x, y1 + pad);
      ctx.lineTo(x + (y1 - y0) + 2 * pad, y0 - pad);
    }
    ctx.lineWidth = Math.max(1, iso.view.dpr);
    ctx.strokeStyle = Palette.rgba(Palette.MEANING.hostileCB, alpha);
    ctx.stroke();
    ctx.restore();
  }
  function zoneShape(z, f, telegraph) {
    const tiles = [];
    for (const [x, y] of z.tiles) {
      if (x < 0 || y < 0 || x >= f.w || y >= f.h) continue;
      const i = Grid.idx(f, x, y);
      // a telegraph shows on walkable tiles even unexplored (the player must see it coming)
      if (telegraph ? !BD.data.tiles.WALK[f.tiles[i]] && !f.explored[i] : !f.explored[i]) continue;
      tiles.push([x, y]);
    }
    const set = new Set(tiles.map(([x, y]) => key(x, y)));
    const v = zoneView(z);
    if (v.n !== tiles.length) {
      v.n = tiles.length;
      v.inset = insetOf(tiles, set);
    }
    return { tiles, set, inset: v.inset };
  }

  function drawTelegraph(ctx, z, sh, t, cb) {
    const k = 1 - Math.max(0, z.armMs) / Math.max(1, z.armTotal);
    const friendly = z.faction === 'player';
    const M = Palette.MEANING;
    if (friendly) {
      const breathe = BD.view.fx.beat('ambient', t);
      fillPath(ctx, sh.tiles);
      ctx.fillStyle = Palette.rgba(M.friendly, 0.06 + 0.1 * k);
      ctx.fill();
      sweep(ctx, sh.tiles, sh.set, sh.inset, k, M.friendly, 0.08);
      strokeOutline(ctx, sh.tiles, sh.set, M.friendly, 0.5 + 0.25 * k + 0.1 * breathe, 1.5, true);
      return;
    }
    const col = cb ? M.hostileCB : M.hostile;
    // the danger beat in the last third
    const pulse = k > 0.66 ? BD.view.fx.beat('danger', t) : 0;
    fillPath(ctx, sh.tiles);
    ctx.fillStyle = Palette.rgba(col, 0.16 + 0.4 * k);
    ctx.fill();
    sweep(ctx, sh.tiles, sh.set, sh.inset, k, col, 0.3);
    if (cb) hatch(ctx, sh.tiles, 0.35 + 0.4 * k);
    strokeOutline(ctx, sh.tiles, sh.set, col, Math.min(1, 0.55 + 0.45 * k + 0.2 * pulse), 1.5 + k + pulse, false);
  }

  const MOTE_PUFF = { vz: 0.012, g: -0.00003, life: 900, size: 4, z: 2, ambient: true, blend: 'normal', soft: true };
  const MOTE_SPARK = { vz: 0.03, g: -0.00003, life: 550, size: 2, z: 2, ambient: true, blend: 'lighter', soft: false };
  /** lingering ground: element fill, faction edge, and motes per second (never per frame) */
  function drawLingering(ctx, z, sh, t, cb, ms) {
    const sch = Palette.SCHOOL[z.school] || Palette.SCHOOL.steel;
    const fade = Math.min(1, z.durMs / 600);
    const friendly = z.faction === 'player' && !z.noFaction;
    const breathe = BD.view.fx.beat('ambient', t + (z.id || 0) * 137);
    const M = Palette.MEANING;
    fillPath(ctx, sh.tiles);
    ctx.fillStyle = Palette.rgba(sch.mid, (friendly ? 0.14 : 0.3 + 0.06 * breathe) * fade);
    ctx.fill();
    if (friendly) strokeOutline(ctx, sh.tiles, sh.set, M.friendly, 0.6 * fade, 1.2, true);
    else {
      strokeOutline(ctx, sh.tiles, sh.set, sch.edge, 0.5 * fade, 3.5, false);
      strokeOutline(ctx, sh.tiles, sh.set, cb ? M.hostileCB : M.hostile, 0.9 * fade, 1.5, false);
      if (cb) hatch(ctx, sh.tiles, 0.3 * fade);
    }
    const v = zoneView(z);
    v.acc += (Math.min(10, sh.tiles.length * 0.8) * ms) / 1000;
    // dark matter drifts up as soft source-over puffs; light schools throw additive motes
    const normal = !!Palette.SCHOOL_NORMAL_BLEND[z.school];
    const mote = normal ? MOTE_PUFF : MOTE_SPARK;
    while (v.acc >= 1 && sh.tiles.length) {
      v.acc -= 1;
      const [tx, ty] = sh.tiles[Math.floor(Math.random() * sh.tiles.length)];
      const color = Math.random() < 0.6 ? sch.mid : sch.core;
      BD.view.fx.spark(tx + Math.random() - 0.5, ty + Math.random() - 0.5, Object.assign({ color }, mote));
    }
  }

  let lastZoneT = 0;
  function drawZones(ctx, world, alpha, t) {
    const f = world.floor;
    const cb = BD.view.host.prefs.colorblind;
    const ms = BD.view.host.paused() ? 0 : Math.min(100, Math.max(0, t - lastZoneT));
    lastZoneT = t;
    ctx.save();
    for (const z of f.zones) {
      if (z.cancelled) continue;
      const telegraph = !z.resolved && z.telegraph;
      if (!telegraph && !z.resolved) continue;
      if (!z.tiles.some(([x, y]) => x >= 0 && y >= 0 && x < f.w && y < f.h && f.explored[Grid.idx(f, x, y)])) continue;
      const sh = zoneShape(z, f, telegraph);
      if (!sh.tiles.length) continue;
      if (telegraph) drawTelegraph(ctx, z, sh, t, cb);
      else drawLingering(ctx, z, sh, t, cb, ms);
      if (!telegraph && (z.school === 'fire' || z.school === 'lava' || z.school === 'storm')) {
        const cx = z.cx != null ? z.cx : sh.tiles[0][0];
        const cy = z.cy != null ? z.cy : sh.tiles[0][1];
        BD.view.lighting.add(cx, cy, 2.5, Palette.SCHOOL[z.school].mid, 0.4 * Math.min(1, z.durMs / 600), 0.3);
      }
    }
    ctx.restore();
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
      pal: g.pal, palKey: g.palKey, flip: g.flip, scale: g.scale, alpha: 1 - Math.max(0, g.t - 150) / 250,
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
    const col = Palette.MEANING.souls;   // every portal is the one purple (ART_DIRECTION.md)
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
    ctx.globalAlpha = 0.5 + 0.2 * Math.sin((t / 1.6) * Math.PI * 2);   // the ambient beat
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
      const sch = Palette.SCHOOL[kd.school] || Palette.SCHOOL.steel;
      iso.toScreen(x, y, tmp);
      const sy = tmp.y - 14 * zk;
      const sdx = (pr.dx - pr.dy) * iso.HW, sdy = (pr.dx + pr.dy) * iso.HH, sl = Math.hypot(sdx, sdy) || 1;
      const ux = sdx / sl, uy = sdy / sl;
      ctx.save();
      // dark matter (blood, poison) can't glow: it draws source-over
      ctx.globalCompositeOperation = Palette.SCHOOL_NORMAL_BLEND[kd.school] ? 'source-over' : 'lighter';
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
  /** the aura colours of an elite: every champion mod stacks a ring; unique/keeper gold, champion blue */
  function auraColours(e) {
    const M = Palette.MEANING;
    if (e.mods && e.mods.length) return e.mods.map((m) => Palette.MOD_AURA[m] || M.champion);
    return [e.rank === 'champion' ? M.champion : M.unique];
  }
  function eliteAura(ctx, e, ep, t) {
    const zk = iso.view.Z * iso.view.dpr;
    const cols = auraColours(e);
    const pulse = 0.55 + 0.25 * BD.view.fx.beat('ambient', t);
    const minion = e.rank === 'minion';
    const cursed = Palette.MOD_AURA.cursed;
    cols.forEach((col, i) => {
      const radius = (minion ? 0.38 : 0.46) + i * 0.08;
      const width = (minion ? 1 : 2) * iso.view.dpr;
      // cursed is dark: a wider source-over ring that reads as a shadow, not a light
      if (col === cursed) Overlays().ring(ctx, ep.x, ep.y, radius, col, width * 2, 0.85);
      else Overlays().ring(ctx, ep.x, ep.y, radius, col, width, pulse);
    });
    if (minion) return;
    iso.toScreen(ep.x, ep.y, tmp);
    const r = 18 * zk;
    const glowCol = cols.find((c) => c !== cursed);
    ctx.save();
    if (glowCol) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.22 * pulse;
      ctx.drawImage(BD.view.fx.glow(glowCol), tmp.x - r, tmp.y - 22 * zk - r, r * 2, r * 2);
    }
    if (cols.indexOf(cursed) >= 0) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.45 * pulse;
      ctx.drawImage(BD.view.fx.glow(cursed), tmp.x - r * 1.1, tmp.y - r * 0.5, r * 2.2, r);
    }
    ctx.restore();
  }
  /** the locked target: a white floor ring and four crosshair ticks */
  function lockOn(ctx, ep) {
    const col = Palette.MEANING.lockon, S = iso.view.S, dpr = iso.view.dpr;
    Overlays().ring(ctx, ep.x, ep.y, 0.55, col, 1.5 * dpr, 0.85);
    iso.toScreen(ep.x, ep.y, tmp);
    const rx = 0.55 * iso.HW * S, ry = 0.55 * iso.HH * S, tick = 4 * S;
    ctx.save();
    ctx.strokeStyle = Palette.rgba(col, 0.9);
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x0 = tmp.x + dx * (rx - tick * 0.4), y0 = tmp.y + dy * (ry - tick * 0.2);
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + dx * tick, y0 + dy * tick * 0.5);
    }
    ctx.stroke();
    ctx.restore();
  }
  function aura(ctx, world, e, ep, s, t) {
    if (e.kind !== 'monster') return;
    if (e.rank === 'champion' || e.rank === 'unique' || e.rank === 'keeper' || e.rank === 'minion') eliteAura(ctx, e, ep, t);
    if (e.ai && e.ai.state === 'exposed') {
      Overlays().ring(ctx, ep.x, ep.y, 0.6, Palette.MEANING.exposed, 3 * iso.view.dpr, 0.6 + 0.4 * BD.view.fx.beat('attention', t));
    }
    if (world.player.lockId === e.id) lockOn(ctx, ep);
  }

  // ---------- health bars & nameplates (overlay) ----------
  function barColour(e, elite) {
    const M = Palette.MEANING;
    if (e.kind === 'ally') return '#4ab0ff';
    if (e.rank === 'champion') return M.champion;
    return elite ? M.unique : M.life;
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
        ctx.fillStyle = e.rank === 'champion' ? Palette.MEANING.champion : Palette.MEANING.unique;
        ctx.fillText(e.name, tmp.x, top - 4 * iso.view.dpr);
      }
      statusRow(ctx, e, tmp.x - w / 2, top + h + 2 * iso.view.dpr);
    }
  }

  /** a status glyph per status under the bar (one glyph each, debuffs first; 07 §2.4) */
  function statusRow(ctx, e, x, y) {
    const px = Math.max(2, Math.round(1.6 * iso.view.dpr));
    let i = 0;
    for (const pass of [true, false]) {
      for (const st of e.statuses) {
        const sd = BD.data.statuses[st.id];
        if (!sd || sd.hiddenChip || i > 5 || !!sd.debuff !== pass) continue;
        Overlays().statusGlyph(ctx, st.id, x + i * 8 * px, y, px);
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
