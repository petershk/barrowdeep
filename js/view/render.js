// @ts-check
// Frame renderer: fog → floor chunks → flat props → zones → diagonal sorted layer (walls, props,
// items, corpses, actors) → lighting multiply → overlays → additive FX → floating text.
(function (BD) {
  'use strict';

  const { T, PROPS } = BD.data.tiles;
  const iso = BD.view.iso;
  const EntityView = BD.view.entities;
  const Sprites = BD.view.sprites;
  const Lighting = BD.view.lighting;
  const Grid = BD.core.grid;
  const { MEANING, STATUS_COLOR } = BD.view.palette;

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
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    iso.setScale(zoomSetting === 'auto' ? iso.autoZoom(w) : iso.view.Z, dpr);
    iso.view.w = canvas.width;
    iso.view.h = canvas.height;
  }
  /** a zoom from iso.ZOOMS, or 'auto' (follows the window width, see iso.autoZoom) */
  let zoomSetting = /** @type {number|string} */ (1.5);
  function setZoom(z) {
    zoomSetting = z;
    const width = typeof window !== 'undefined' ? window.innerWidth : 1600;
    const zz = z === 'auto' ? iso.autoZoom(width) : Number(z);
    iso.setScale(zz, iso.view.dpr);
  }

  // ---------- flat props: stairs ----------
  const flatCache = new Map();
  function stairsCanvas(kind, lookKey) {
    const key = kind + lookKey;
    let c = flatCache.get(key);
    if (c) return c;
    const pal = BD.data.looks[lookKey].pal;
    c = document.createElement('canvas');
    c.width = 32;
    c.height = 17;
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
      for (let i = -4; i <= 4; i++) {
        g.fillRect(16 + i * 2, 8 + i, 2, 1);
        g.fillRect(16 - i * 2, 8 + i, 2, 1);
      }
    }
    flatCache.set(key, c);
    return c;
  }

  function drawArt(id, frame, fi, tx, ty, opts) {
    const spr = Sprites.get(id, frame, fi, opts);
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
    // firmer than the spec's 0.45 so actors sit on every floor (ART_DIRECTION "World and characters")
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.ellipse(tmp.x, tmp.y + 2.5 * S, 8.4 * S * (r || 1), 3.6 * S * (r || 1), 0, 0, Math.PI * 2);
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
    const f = world.floor, v = iso.view;
    resetOnFloorChange(f);
    EntityView.tick(realMs);
    const pp = EntityView.pos(world.player, alpha, { x: 0, y: 0 });
    const hover = BD.view.host.pointer.hoverTile;
    BD.view.camera.update(pp.x, pp.y, realMs, v.w, v.h, null);
    const cam = BD.view.camera.cam;
    const baseOx = v.ox, baseOy = v.oy;
    v.ox += Math.round(cam.shakeX);
    v.oy += Math.round(cam.shakeY);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, v.w, v.h);
    BD.view.tiles.drawFloor(ctx, f);

    const win = visibleWindow(f);
    BD.view.tiles.drawLava(ctx, f, timeMs);
    drawFlatFeatures(f);
    for (const fn of hooks.underActors) fn(ctx, world, alpha, timeMs);
    const buckets = bucketByDiagonal(world, alpha);
    drawDiagonals(world, win, buckets, { pp, realMs, hover, alpha });

    // lights from tiles and decor
    collectStaticLights(f, win.sMin, win.sMax);
    if (BD.view.fx) BD.view.fx.collectLights(world);
    const R = f.fovRadius || 6;
    Lighting.draw(ctx, f, pp, R, timeMs);
    drawFogAndVignette(f, pp);

    for (const fn of hooks.overlays) fn(ctx, world, alpha, timeMs, realMs);
    v.ox = baseOx;
    v.oy = baseOy;
    for (const fn of hooks.fx) fn(ctx, world, alpha, timeMs, realMs);
    for (const fn of hooks.top) fn(ctx, world, alpha, timeMs, realMs);
  }

  /** Off-map and unexplored space is the biome's fog (07 §1.2 step 1), lifted toward the floor colour near
   *  the hero so rooms sit in a murky haze instead of floating on black; then a soft vignette band at the
   *  edge of vision (07 §1.3). 'lighten' only raises pixels darker than the fog, so the lit world is untouched. */
  function drawFogAndVignette(f, pp) {
    const v = iso.view, look = BD.data.lookOf(f), pal = look.pal;
    if (fogKey !== look.key) {
      fogKey = look.key;
      fogInner = BD.view.tiles.mix(pal.fog, pal.floorA, 0.12);
      fogOuter = pal.fog;
    }
    iso.toScreen(pp.x, pp.y, tmp);
    const cx = tmp.x, cy = tmp.y, big = Math.hypot(v.w, v.h);
    ctx.save();
    ctx.globalCompositeOperation = 'lighten';
    const haze = ctx.createRadialGradient(cx, cy, 0, cx, cy, big * 0.5);
    haze.addColorStop(0, fogInner);
    haze.addColorStop(1, fogOuter);
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, v.w, v.h);
    ctx.globalCompositeOperation = 'source-over';
    const vig = ctx.createRadialGradient(cx, cy, Math.min(v.w, v.h) * 0.36, cx, cy, big * 0.62);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, BD.view.palette.rgba(fogOuter, 0.7));
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, v.w, v.h);
    ctx.restore();
  }
  let fogKey = '', fogInner = '#000000', fogOuter = '#000000';

  /** a new floor: fresh cutaway fades, entity visual state and camera */
  function resetOnFloorChange(f) {
    if (cutKey === f.key + f.seed) return;
    cutKey = f.key + f.seed;
    cutFade = new Float32Array(f.w * f.h);
    EntityView.clear();
    BD.view.camera.cam.init = false;
  }

  /** the on-screen tile window as diagonal ranges: s = x + y (draw order), d = x - y */
  function visibleWindow(f) {
    const v = iso.view, S = v.S;
    iso.toTileF(0, 0, tmp);
    const a = { x: tmp.x, y: tmp.y };
    iso.toTileF(v.w, 0, tmp);
    const b = { x: tmp.x, y: tmp.y };
    iso.toTileF(0, v.h + 60 * S, tmp);
    const c = { x: tmp.x, y: tmp.y };
    iso.toTileF(v.w, v.h + 60 * S, tmp);
    const d = { x: tmp.x, y: tmp.y };
    const sMin = Math.max(0, Math.floor(Math.min(a.x + a.y, b.x + b.y)) - 2);
    const sMax = Math.min(f.w + f.h - 2, Math.ceil(Math.max(c.x + c.y, d.x + d.y)) + 2);
    const dMin = Math.floor(Math.min(a.x - a.y, c.x - c.y)) - 2, dMax = Math.ceil(Math.max(b.x - b.y, d.x - d.y)) + 2;
    return { sMin, sMax, dMin, dMax };
  }

  function stairsKind(t) {
    if (t === T.STAIRS_UP) return 'up';
    if (t === T.STAIRS_SEALED) return 'sealed';
    return t === T.STAIRS_DOWN ? 'down' : null;
  }

  /** flat features (stairs, waypoint glow plates) */
  function drawFlatFeatures(f) {
    const S = iso.view.S;
    for (const fp of flatFeatures(f)) {
      if (!f.explored[Grid.idx(f, fp.x, fp.y)]) continue;
      const kind = stairsKind(f.tiles[Grid.idx(f, fp.x, fp.y)]);
      if (!kind) continue;
      iso.toScreen(fp.x, fp.y, tmp);
      ctx.drawImage(stairsCanvas(kind, BD.data.lookOf(f).key), tmp.x - 16 * S, tmp.y - 8 * S, 32 * S, 17 * S);
    }
  }

  /** visible actors, items, corpses and objects, bucketed by diagonal (x + y) */
  function bucketByDiagonal(world, alpha) {
    const f = world.floor;
    const buckets = new Map();
    const put = (s, item) => {
      let l = buckets.get(s);
      if (!l) buckets.set(s, (l = []));
      l.push(item);
    };
    const addActor = (e) => {
      const ep = EntityView.pos(e, alpha, { x: 0, y: 0 });
      const vis = e.kind === 'player' || f.visible[Grid.idx(f, e.x, e.y)];
      if (!vis) return;
      const depth = e.move ? Math.max(e.move.fromX + e.move.fromY, e.move.toX + e.move.toY) : e.x + e.y;
      put(depth, { kind: 'actor', e, ep, order: 2 });
    };
    addActor(world.player);
    for (const e of f.entities.values()) if (!e.dead || e.dying) addActor(e);
    if (BD.view.world) BD.view.world.bucket(world, put, alpha);
    return buckets;
  }

  /** back to front, one diagonal at a time: its tall tiles and props, then its bucketed things */
  function drawDiagonals(world, win, buckets, at) {
    const f = world.floor;
    for (let s = win.sMin; s <= win.sMax; s++) {
      const x0 = Math.max(0, s - (f.h - 1)), x1 = Math.min(f.w - 1, s);
      for (let x = x0; x <= x1; x++) {
        const y = s - x;
        const dd = x - y;
        if (dd < win.dMin || dd > win.dMax) continue;
        const i = Grid.idx(f, x, y);
        if (!f.explored[i]) continue;
        drawTileProp(f, f.tiles[i], x, y, i, at);
      }
      const list = buckets.get(s);
      if (list) {
        list.sort((m, n) => m.order - n.order);
        for (const it of list) {
          if (it.kind === 'actor') drawActor(world, it.e, it.ep, at.alpha);
          else if (it.draw) it.draw(ctx, it);
        }
      }
    }
  }

  function drawTileProp(f, t, x, y, i, at) {
    if (PROPS[t].tall) drawTall(f, t, x, y, i, at.pp, at.realMs, at.hover);
    else if (t === T.DECOR) drawDecor(f, x, y, i);
    else if (t === T.WAYPOINT) drawArt('prop_waypoint', 'idle', 0, x, y);
    else if (t === T.PORTAL_STONE) drawArt('prop_portal_stone', 'idle', 0, x, y);
    else if (t === T.WELL) drawArt('prop_well', 'idle', 0, x, y);
  }

  let featCache = null, featKey = '';
  function flatFeatures(f) {
    const k = f.key + f.seed;
    if (k === featKey) return featCache;
    featKey = k;
    featCache = [];
    for (let i = 0; i < f.tiles.length; i++) {
      const t = f.tiles[i];
      if (t === T.STAIRS_UP || t === T.STAIRS_DOWN || t === T.STAIRS_SEALED) featCache.push({ x: i % f.w, y: (i / f.w) | 0 });
    }
    return featCache;
  }

  function drawTall(f, t, x, y, i, pp, realMs, hover) {
    const biome = BD.data.lookOf(f).key;
    if (t === T.GATE) {
      // draw the 2×2 gate once, from its top-left tile
      if (f.gatePos && x === f.gatePos.x + 1 && y === f.gatePos.y + 1) {
        drawArt(f.gateOpen ? 'prop_gate_open' : 'prop_gate', 'idle', 0, x - 0.5, y - 0.5, { scale: 1 });
      }
      return;
    }
    let kind = t === T.PILLAR ? 'pillar' : 'wall';
    if (f.town) {
      if (!f._bset) {
        f._bset = new Set();
        for (const k in f.town.buildings) for (const [bx, by] of f.town.buildings[k]) f._bset.add(Grid.idx(f, bx, by));
      }
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
        const y = s - x, i = Grid.idx(f, x, y);
        if (!f.explored[i]) continue;
        const t = f.tiles[i];
        const pl = PROPS[t].light;
        if (pl && (t !== T.LAVA || (x + y) % 2 === 0)) Lighting.add(x, y, pl.radius, pl.color, pl.intensity, t === T.LAVA ? 0.3 : 0.1);
        if (t === T.DECOR) {
          const dl = BD.data.decorLights[f.decor[i]];
          if (dl) Lighting.add(x, y, dl.radius, dl.color, dl.intensity, dl.flicker);
        }
      }
    }
  }

  /** which animation frame an actor shows: death, hurt, attack, walk or idle */
  function actorFrame(e, s) {
    let frame = 'idle', fi = 0;
    if (e.dying || e.dead) {
      frame = 'death';
      fi = Math.min(2, Math.floor(Math.max(0, s.dieT) / 110));
    } else if (s.hurt > 0) frame = 'hurt';
    else if (e.attack && e.attack.phase === 'windup' && e.attack.remaining < 150) frame = 'attack';
    else if (s.lunge > 0) frame = 'attack';
    else if (e.move) {
      frame = 'walk';
      fi = Math.floor((e.move.elapsed / e.move.dur) * 2) % 2;
    }
    return { frame, fi };
  }

  /** screen offset from hit recoil, attack lunge, walk bob and being airborne */
  function actorOffset(e, s) {
    const S = iso.view.S;
    let dx = 0, dy = 0;
    const px = iso.view.Z * iso.view.dpr;
    if (s.recoil > 0) {
      const rf = s.recoil / 150, sv = screenDir(s.rx, s.ry);
      dx += sv.x * 6 * px * rf * rf;
      dy += sv.y * 6 * px * rf * rf;
    }
    if (s.lunge > 0) {
      const lf = Math.sin((1 - s.lunge / 80) * Math.PI), sv = screenDir(s.lx, s.ly);
      dx += sv.x * 6 * px * lf;
      dy += sv.y * 6 * px * lf;
    }
    if (e.move && !e.move.kind) dy -= Math.abs(Math.sin((e.move.elapsed / e.move.dur) * Math.PI)) * S;
    if (e.airborne) dy -= e.airborne * S;
    return { dx, dy };
  }

  function drawActor(world, e, ep, alpha) {
    const s = EntityView.stateOf(e.id);
    const art = EntityView.artOf(e);
    const flip = spinning(e) ? Math.floor(timeMs / SPIN_FLIP_MS) % 2 === 0 : e.dir >= 2 && e.dir <= 5;
    const { frame, fi } = actorFrame(e, s);
    const { dx, dy } = actorOffset(e, s);
    const scale = EntityView.scaleOf(e);
    const opts = {
      flip, pal: EntityView.palOf(e), palKey: e.def + (e.rank === 'keeper' || e.rank === 'unique' ? e.rank : ''),
      scale, dx, dy, doll: BD.view.paperdoll ? BD.view.paperdoll.dollOf(e) : '', rim: !e.dead,
    };
    for (const fn of actorUnder) fn(ctx, world, e, ep, s, timeMs);
    if (e.kind === 'player') heroHalo(ep.x, ep.y);
    if (!e.dead) shadow(ep.x, ep.y, scale);
    const windup = !e.dead && e.attack && e.attack.telegraph && e.attack.phase === 'windup';
    if (windup) windupJudder(e, opts);
    if (windup) drawRim(ep, art, frame, fi, opts, MEANING.hostile, Math.min(1, windupPulse() + 0.1));
    else if (frozen(e)) drawRim(ep, art, frame, fi, opts, STATUS_COLOR.frozen, 0.85);
    const box = drawArt(art, frame, fi, ep.x, ep.y, opts);
    if (box) {
      for (const fn of hooks.actorBody || []) fn(ctx, e, art, frame, fi, ep, opts, box);   // statuses on the body (overlays.js)
      if (s.flash > 0) {
        const flashPref = BD.view.host.prefs.flash / 100;
        ctx.globalAlpha = (s.flash / 120) * flashPref;
        drawArt(art, frame, fi, ep.x, ep.y, Object.assign({}, opts, { tint: '#ffffff', palKey: 'white' }));
        ctx.globalAlpha = 1;
      }
      if (windup) {
        // a faint wash so the body warms with the rim; the sprite itself must still read (ART_DIRECTION)
        ctx.globalAlpha = 0.18 * windupPulse();
        drawArt(art, frame, fi, ep.x, ep.y, Object.assign({}, opts, { tint: MEANING.hostile, palKey: 'red' }));
        ctx.globalAlpha = 1;
      }
      e._box = box;
    }
    for (const fn of actorOver) fn(ctx, world, e, ep, s, timeMs, box);
  }

  /** the wind-up pulse (07 §2.4) */
  const windupPulse = () => 0.4 + 0.5 * Math.abs(Math.sin(timeMs / 55));
  /** shake in the last 250 ms before the blow lands (moves the sprite and its rim together) */
  function windupJudder(e, opts) {
    if (e.attack.remaining >= 250) return;
    opts.dx += (Math.random() * 2 - 1) * 3.5 * iso.view.Z;
    opts.dy += (Math.random() * 2 - 1) * 1.6 * iso.view.Z;
  }
  /** an outline around the normal sprite, drawn as a one-colour silhouette offset one art pixel in four
   *  directions behind it: pulsing hostile red for a telegraphed wind-up, frost for Frozen */
  function drawRim(ep, art, frame, fi, opts, col, alpha) {
    const S = iso.view.S * (opts.scale || 1);
    ctx.globalAlpha = alpha;
    for (const [ox, oy] of RIM_OFFSETS) {
      const o = Object.assign({}, opts, { tint: col, palKey: 'rim' + col, rim: false, dx: opts.dx + ox * S, dy: opts.dy + oy * S });
      drawArt(art, frame, fi, ep.x, ep.y, o);
    }
    ctx.globalAlpha = 1;
  }
  const RIM_OFFSETS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const SPIN_FLIP_MS = 90;   // a channelled spin (Whirlwind) turns the body this often
  const spinning = (e) => !!(e.attack && e.attack.phase === 'channel' && e.attack.abilityId === 'whirlwind');
  const frozen = (e) => !e.dead && !!e.statuses && e.statuses.some((st) => st.id === 'frozen');

  /** the hero's soft warm floor halo, so the player is found first in any crowd */
  function heroHalo(tx, ty) {
    iso.toScreen(tx, ty, tmp);
    const S = iso.view.S, r = 20 * S;
    ctx.save();
    ctx.translate(tmp.x, tmp.y + 2.5 * S);
    ctx.scale(1, 0.5);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, 'rgba(255,243,216,0.20)');
    g.addColorStop(0.5, 'rgba(255,243,216,0.08)');
    g.addColorStop(1, 'rgba(255,243,216,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.restore();
  }
  const actorUnder = [], actorOver = [];
  const sd = { x: 0, y: 0 };
  /** unit screen-space vector for a tile-space direction */
  function screenDir(tx, ty) {
    const x = (tx - ty) * iso.HW, y = (tx + ty) * iso.HH, l = Math.hypot(x, y) || 1;
    sd.x = x / l;
    sd.y = y / l;
    return sd;
  }

  function screenCanvas() { return canvas; }

  BD.view.render = {
    init, resize, setZoom, draw, drawArt, shadow, hooks, actorUnder, actorOver, screenCanvas,
    get ctx() { return ctx; },
    get timeMs() { return timeMs; },
  };
})(globalThis.BD);
