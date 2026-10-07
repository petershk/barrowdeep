// @ts-check
// Frame renderer: fog → floor chunks → flat props → zones → diagonal sorted layer (walls, props,
// items, corpses, actors) → lighting multiply → overlays → additive FX → floating text.
(function (BD) {
  'use strict';

  const { T, PROPS } = BD.data.tiles;
  const iso = BD.view.iso;
  const V = BD.view.entities;
  const SP = BD.view.sprites;
  const L = BD.view.lighting;

  /** @type {HTMLCanvasElement} */ let canvas = null;
  /** @type {CanvasRenderingContext2D} */ let ctx = null;
  const tmp = { x: 0, y: 0 }, tmp2 = { x: 0, y: 0 };
  let cutFade = null, cutKey = '';
  let timeMs = 0;
  const hooks = { underActors: [], overlays: [], fx: [], top: [] }; // other view modules plug in here

  function init(cv) {
    canvas = cv;
    ctx = cv.getContext('2d', { alpha: false });
    resize();
  }
  function resize() {
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth, h = window.innerHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    iso.setScale(iso.view.Z, dpr);
    iso.view.w = canvas.width; iso.view.h = canvas.height;
  }
  function setZoom(z) { iso.setScale(z, iso.view.dpr); }

  // ---------- flat props: stairs ----------
  const flatCache = new Map();
  function stairsCanvas(kind, biome) {
    const key = kind + biome;
    let c = flatCache.get(key);
    if (c) return c;
    const pal = BD.data.biomes[biome].pal;
    c = document.createElement('canvas'); c.width = 32; c.height = 17;
    const g = c.getContext('2d');
    const steps = 4;
    for (let s = 0; s < steps; s++) {
      const k = kind === 'up' ? 1.1 + s * 0.18 : 0.75 - s * 0.17;
      const col = BD.view.palette.shade(pal.wallTop, k);
      const shrink = s * 2;
      g.fillStyle = col;
      for (let r = 0; r < 16 - shrink * 2; r++) {
        const hw = (r < 8 - shrink ? r + 1 : 16 - shrink * 2 - r) * 2;
        g.fillRect(16 - hw, r + shrink + (kind === 'up' ? -s : s) * 0.5, hw * 2, 1);
      }
    }
    if (kind === 'sealed') {
      g.fillStyle = '#c02020';
      for (let i = -4; i <= 4; i++) { g.fillRect(16 + i * 2, 8 + i, 2, 1); g.fillRect(16 - i * 2, 8 + i, 2, 1); }
    }
    flatCache.set(key, c);
    return c;
  }

  function drawArt(id, frame, fi, tx, ty, opts) {
    const spr = SP.get(id, frame, fi, opts);
    if (!spr) return null;
    const S = iso.view.S * (opts && opts.scale ? opts.scale : 1);
    iso.toScreen(tx, ty, tmp);
    const dx = Math.round(tmp.x - (spr.w * S) / 2 + (opts && opts.dx ? opts.dx : 0));
    const dy = Math.round(tmp.y + iso.HH * iso.view.S * 0.5 + 3 * iso.view.S - spr.h * S + (opts && opts.dy ? opts.dy : 0));
    if (opts && opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
    ctx.drawImage(spr.canvas, dx, dy, spr.w * S, spr.h * S);
    if (opts && opts.alpha !== undefined) ctx.globalAlpha = 1;
    return { x: dx, y: dy, w: spr.w * S, h: spr.h * S };
  }

  function shadow(tx, ty, r) {
    iso.toScreen(tx, ty, tmp);
    const S = iso.view.S;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(tmp.x, tmp.y + 2.5 * S, 7 * S * (r || 1), 3 * S * (r || 1), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /** wall cutaway alpha per tile (fades 150 ms) */
  function cutawayAlpha(f, i, x, y, pp, realMs, hover) {
    const near = (cx, cy) => x + y > cx + cy && x + y <= cx + cy + 4 && Math.abs((x - y) - (cx - cy)) <= 3 && x >= cx - 1 && y >= cy - 1;
    const want = near(pp.x, pp.y) || (hover && near(hover.x, hover.y)) ? 0.35 : 1;
    const cur = cutFade[i] || 1;
    const step = realMs / 150 * 0.65;
    const nv = want < cur ? Math.max(want, cur - step) : Math.min(want, cur + step);
    cutFade[i] = nv;
    return nv;
  }

  function draw(world, alpha, realMs) {
    if (!ctx || !world || !world.floor) return;
    timeMs += realMs;
    const f = world.floor, p = world.player, v = iso.view;
    const biome = BD.data.biomes[f.biome];
    const pal = biome.pal;
    if (cutKey !== f.key + f.seed) { cutKey = f.key + f.seed; cutFade = new Float32Array(f.w * f.h); V.clear(); BD.view.camera.cam.init = false; }
    V.tick(realMs);
    const pp = V.pos(p, alpha, { x: 0, y: 0 });
    const hover = BD.input && BD.input.mouse ? BD.input.mouse.hoverTile : null;
    BD.view.camera.update(pp.x, pp.y, realMs, v.w, v.h, null);
    const cam = BD.view.camera.cam;
    const baseOx = v.ox, baseOy = v.oy;
    v.ox += Math.round(cam.shakeX); v.oy += Math.round(cam.shakeY);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, v.w, v.h);
    BD.view.tiles.drawFloor(ctx, f);

    // visible tile window
    const S = v.S;
    iso.toTileF(0, 0, tmp); const a = { x: tmp.x, y: tmp.y };
    iso.toTileF(v.w, 0, tmp); const b = { x: tmp.x, y: tmp.y };
    iso.toTileF(0, v.h + 60 * S, tmp); const c = { x: tmp.x, y: tmp.y };
    iso.toTileF(v.w, v.h + 60 * S, tmp); const d = { x: tmp.x, y: tmp.y };
    const sMin = Math.max(0, Math.floor(Math.min(a.x + a.y, b.x + b.y)) - 2);
    const sMax = Math.min(f.w + f.h - 2, Math.ceil(Math.max(c.x + c.y, d.x + d.y)) + 2);
    const dMin = Math.floor(Math.min(a.x - a.y, c.x - c.y)) - 2, dMax = Math.ceil(Math.max(b.x - b.y, d.x - d.y)) + 2;

    // flat features (stairs, waypoint glow plates)
    for (const fp of flatFeatures(f)) {
      if (!f.explored[fp.y * f.w + fp.x]) continue;
      const t = f.tiles[fp.y * f.w + fp.x];
      const kind = t === T.STAIRS_UP ? 'up' : t === T.STAIRS_SEALED ? 'sealed' : t === T.STAIRS_DOWN ? 'down' : null;
      if (!kind) continue;
      iso.toScreen(fp.x, fp.y, tmp);
      ctx.drawImage(stairsCanvas(kind, f.biome), tmp.x - 16 * S, tmp.y - 8 * S, 32 * S, 17 * S);
    }
    for (const fn of hooks.underActors) fn(ctx, world, alpha, timeMs);

    // bucket actors / items / corpses by diagonal
    const buckets = new Map();
    const put = (s, item) => { let l = buckets.get(s); if (!l) buckets.set(s, (l = [])); l.push(item); };
    const addActor = (e) => {
      const ep = V.pos(e, alpha, { x: 0, y: 0 });
      const vis = e.kind === 'player' || f.visible[e.y * f.w + e.x];
      if (!vis) return;
      const depth = e.move ? Math.max(e.move.fromX + e.move.fromY, e.move.toX + e.move.toY) : e.x + e.y;
      put(depth, { kind: 'actor', e, ep, order: 2 });
    };
    addActor(p);
    for (const e of f.entities.values()) if (!e.dead || e.dying) addActor(e);
    if (BD.view.world) BD.view.world.bucket(world, put, alpha);

    for (let s = sMin; s <= sMax; s++) {
      const x0 = Math.max(0, s - (f.h - 1)), x1 = Math.min(f.w - 1, s);
      for (let x = x0; x <= x1; x++) {
        const y = s - x;
        const dd = x - y;
        if (dd < dMin || dd > dMax) continue;
        const i = y * f.w + x;
        if (!f.explored[i]) continue;
        const t = f.tiles[i];
        if (PROPS[t].tall) drawTall(f, t, x, y, i, pp, realMs, hover);
        else if (t === T.DECOR) drawDecor(f, x, y, i);
        else if (t === T.WAYPOINT) drawArt('prop_waypoint', 'idle', 0, x, y);
        else if (t === T.PORTAL_STONE) drawArt('prop_portal_stone', 'idle', 0, x, y);
        else if (t === T.WELL) drawArt('prop_well', 'idle', 0, x, y);
      }
      const list = buckets.get(s);
      if (list) {
        list.sort((m, n) => m.order - n.order);
        for (const it of list) {
          if (it.kind === 'actor') drawActor(world, it.e, it.ep, alpha);
          else if (it.draw) it.draw(ctx, it);
        }
      }
    }

    // lights from tiles and decor
    collectStaticLights(f, sMin, sMax);
    if (BD.view.fx) BD.view.fx.collectLights(world);
    const R = f.fovRadius || 6;
    L.draw(ctx, f, pp, R, timeMs);

    for (const fn of hooks.overlays) fn(ctx, world, alpha, timeMs, realMs);
    v.ox = baseOx; v.oy = baseOy;
    for (const fn of hooks.fx) fn(ctx, world, alpha, timeMs, realMs);
    for (const fn of hooks.top) fn(ctx, world, alpha, timeMs, realMs);
  }

  let featCache = null, featKey = '';
  function flatFeatures(f) {
    const k = f.key + f.seed;
    if (k === featKey) return featCache;
    featKey = k; featCache = [];
    for (let i = 0; i < f.tiles.length; i++) {
      const t = f.tiles[i];
      if (t === T.STAIRS_UP || t === T.STAIRS_DOWN || t === T.STAIRS_SEALED) featCache.push({ x: i % f.w, y: (i / f.w) | 0 });
    }
    return featCache;
  }

  function drawTall(f, t, x, y, i, pp, realMs, hover) {
    const biome = f.biome;
    if (t === T.GATE) {
      // draw the 2×2 gate once, from its top-left tile
      if (f.gatePos && x === f.gatePos.x + 1 && y === f.gatePos.y + 1) drawArt(f.gateOpen ? 'prop_gate_open' : 'prop_gate', 'idle', 0, x - 0.5, y - 0.5, { scale: 1 });
      return;
    }
    let kind = t === T.PILLAR ? 'pillar' : 'wall';
    if (f.town) {
      if (!f._bset) { f._bset = new Set(); for (const k in f.town.buildings) for (const [bx, by] of f.town.buildings[k]) f._bset.add(by * f.w + bx); }
      if (t === T.TOWN_DOOR) kind = 'door';
      else if (f._bset.has(i)) kind = 'building';
    }
    const pr = BD.view.tiles.getPrism(biome, kind);
    const al = cutawayAlpha(f, i, x, y, pp, realMs, hover);
    const S = iso.view.S;
    iso.toScreen(x, y, tmp);
    if (al < 1) ctx.globalAlpha = al;
    ctx.drawImage(pr.canvas, Math.round(tmp.x - pr.ax * S), Math.round(tmp.y - pr.ay * S), pr.canvas.width * S, pr.canvas.height * S);
    if (al < 1) ctx.globalAlpha = 1;
  }

  function drawDecor(f, x, y, i) {
    const kind = f.decor[i] || 'bones';
    const id = 'prop_' + kind;
    if (BD.view.art[id]) drawArt(id, 'idle', 0, x, y);
  }

  function collectStaticLights(f, sMin, sMax) {
    for (let s = sMin; s <= sMax; s++) {
      const x0 = Math.max(0, s - (f.h - 1)), x1 = Math.min(f.w - 1, s);
      for (let x = x0; x <= x1; x++) {
        const y = s - x, i = y * f.w + x;
        if (!f.explored[i]) continue;
        const t = f.tiles[i];
        const pl = PROPS[t].light;
        if (pl && (t !== T.LAVA || (x + y) % 2 === 0)) L.add(x, y, pl.radius, pl.color, pl.intensity, t === T.LAVA ? 0.3 : 0.1);
        if (t === T.DECOR) {
          const dl = BD.data.decorLights[f.decor[i]];
          if (dl) L.add(x, y, dl.radius, dl.color, dl.intensity, dl.flicker);
        }
      }
    }
  }

  function drawActor(world, e, ep, alpha) {
    const s = V.stateOf(e.id);
    const art = V.artOf(e);
    const flip = e.dir >= 2 && e.dir <= 5;
    const S = iso.view.S;
    let frame = 'idle', fi = 0;
    if (e.dying || e.dead) { frame = 'death'; fi = Math.min(2, Math.floor(Math.max(0, s.dieT) / 110)); }
    else if (s.hurt > 0) frame = 'hurt';
    else if (e.attack && e.attack.phase === 'windup' && e.attack.remaining < 150) frame = 'attack';
    else if (s.lunge > 0) frame = 'attack';
    else if (e.move) { frame = 'walk'; fi = Math.floor((e.move.elapsed / e.move.dur) * 2) % 2; }
    let dx = 0, dy = 0;
    const px = iso.view.Z * iso.view.dpr;
    if (s.recoil > 0) { const rf = s.recoil / 150, sv = screenDir(s.rx, s.ry); dx += sv.x * 6 * px * rf * rf; dy += sv.y * 6 * px * rf * rf; }
    if (s.lunge > 0) { const lf = Math.sin((1 - s.lunge / 80) * Math.PI), sv = screenDir(s.lx, s.ly); dx += sv.x * 6 * px * lf; dy += sv.y * 6 * px * lf; }
    if (e.move && !e.move.kind) dy -= Math.abs(Math.sin((e.move.elapsed / e.move.dur) * Math.PI)) * S;
    if (e.airborne) dy -= e.airborne * S;
    const scale = V.scaleOf(e);
    const opts = { flip, pal: V.palOf(e), palKey: e.def + (e.rank === 'keeper' || e.rank === 'unique' ? e.rank : ''), scale, dx, dy };
    for (const fn of actorUnder) fn(ctx, world, e, ep, s, timeMs);
    if (!e.dead) shadow(ep.x, ep.y, scale);
    const box = drawArt(art, frame, fi, ep.x, ep.y, opts);
    if (box) {
      if (s.flash > 0) { ctx.globalAlpha = (s.flash / 120) * (BD.ui && BD.ui.options ? BD.ui.options.get('flash') / 100 : 1); drawArt(art, frame, fi, ep.x, ep.y, Object.assign({}, opts, { tint: '#ffffff', palKey: 'white' })); ctx.globalAlpha = 1; }
      if (e.attack && e.attack.telegraph && e.attack.phase === 'windup') {
        const pulse = 0.4 + 0.5 * Math.abs(Math.sin(timeMs / 55));
        const late = e.attack.remaining < 250;
        const jx = late ? (Math.random() * 2 - 1) * 3.5 * iso.view.Z : 0, jy = late ? (Math.random() * 2 - 1) * 1.6 * iso.view.Z : 0;
        ctx.globalAlpha = pulse;
        drawArt(art, frame, fi, ep.x, ep.y, Object.assign({}, opts, { tint: '#ff3020', palKey: 'red', dx: opts.dx + jx, dy: opts.dy + jy }));
        ctx.globalAlpha = 1;
      }
      e._box = box;
    }
    for (const fn of actorOver) fn(ctx, world, e, ep, s, timeMs, box);
  }
  const actorUnder = [], actorOver = [];
  const sd = { x: 0, y: 0 };
  /** unit screen-space vector for a tile-space direction */
  function screenDir(tx, ty) {
    const x = (tx - ty) * iso.HW, y = (tx + ty) * iso.HH, l = Math.hypot(x, y) || 1;
    sd.x = x / l; sd.y = y / l;
    return sd;
  }

  function screenCanvas() { return canvas; }

  BD.view.render = { init, resize, setZoom, draw, drawArt, shadow, hooks, actorUnder, actorOver, screenCanvas, get ctx() { return ctx; }, get timeMs() { return timeMs; } };
})(globalThis.BD);
