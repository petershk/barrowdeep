// @ts-check
// Wall lights: torches, candle brackets, lanterns and braziers hung on wall faces that look onto the floor,
// so a dungeon has warm pools of light of its own instead of only the hero's circle (ART_DIRECTION.md,
// "World and characters"). View-only and seeded from the tile coordinates: the sim never sees them.
// The fitting is drawn with its wall (so actors in front still hide it), the flame's halo and sparks after
// the light multiply so the flame reads as emissive.
(function (BD) {
  'use strict';

  const iso = BD.view.iso;
  const Grid = BD.core.grid;
  const { T, PROPS } = BD.data.tiles;
  const Palette = BD.view.palette;
  const Lighting = BD.view.lighting;
  const Tiles = () => BD.view.tiles;

  const FIRE = Palette.SCHOOL.fire;
  const IRON = '#2a241e', IRON_LIT = '#6a5a48', WOOD = '#8a5a30', WAX = '#e8e0c8';
  /** per biome: which fitting, its light (radius in tiles) and how often a wall face gets one */
  const STYLE = {
    church: { kind: 'candles', color: '#ffc070', radius: 4.5, intensity: 1.2, flicker: 0.12, chance: 30 },
    catacombs: { kind: 'torch', color: '#ff9a40', radius: 5, intensity: 1.35, flicker: 0.22, chance: 30 },
    caves: { kind: 'lantern', color: '#ffb868', radius: 4.5, intensity: 1.2, flicker: 0.08, chance: 24 },
    hell: { kind: 'brazier', color: '#ff7a30', radius: 5, intensity: 1.35, flicker: 0.25, chance: 45 },
    sanctum: { kind: 'brazier', color: '#ff7a30', radius: 5, intensity: 1.35, flicker: 0.25, chance: 40 },
  };
  /** wall dressing without light: hanging banners [cloth, trim] and cobwebs in a face's top corner (% of faces) */
  const DRESS = {
    church: { banner: ['#5a1414', '#c9a227'], bannerChance: 8, web: 10 },
    catacombs: { banner: null, bannerChance: 0, web: 16 },
    caves: { banner: null, bannerChance: 0, web: 0 },
    hell: { banner: ['#1c0c0a', '#a02a10'], bannerChance: 8, web: 0 },
    sanctum: { banner: ['#2e1430', '#c9a227'], bannerChance: 14, web: 0 },
  };
  const WEB = 'rgba(214,208,192,0.42)';
  const WEB_PX = [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [3, 1], [1, 3], [2, 3],
    [3, 2], [5, 2], [2, 5], [4, 3], [3, 4], [6, 1], [1, 6]];
  const SPACING = 4;          // tiles (Chebyshev) between two fittings
  const MOUNT_DY = -8;        // art px above the tile centre: two fifths up the wall face
  const FACE_DX = 8;          // art px from the tile centre to the middle of a face

  /** the fittings of a floor, found once per floor: { x, y, face: -1 left (looks to +y) | 1 right (to +x) } */
  let key = '', list = [], byTile = new Map(), style = null, dress = null;
  function fittings(f) {
    const k = f.key + ':' + f.seed;
    if (k === key) return list;
    key = k;
    list = [];
    byTile = new Map();
    const look = BD.data.lookOf(f);
    style = f.town ? null : STYLE[look.biome] || null;
    dress = f.town ? null : DRESS[look.biome] || null;
    if (!style) return list;
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) place(f, x, y);
    return list;
  }

  const open = (f, x, y) => x < f.w && y < f.h && PROPS[f.tiles[Grid.idx(f, x, y)]].walk && !isHazard(f.tiles[Grid.idx(f, x, y)]);
  const isHazard = (t) => t === T.WATER || t === T.LAVA || t === T.CHASM;

  /** the point `d` tiles out from a face: the left face looks down +y, the right face down +x */
  function inFront(x, y, face, d = 1) {
    if (face < 0) return { x, y: y + d };
    return { x: x + d, y };
  }

  function place(f, x, y) {
    if (f.tiles[Grid.idx(f, x, y)] !== T.WALL) return;
    for (const face of [-1, 1]) {
      const front = inFront(x, y, face);
      if (!open(f, front.x, front.y)) continue;
      const type = pick(x, y, face);
      if (!type) continue;
      const glow = inFront(x, y, face, 0.7);
      const s = { type, x, y, face, seed: Tiles().hash(x, y, 47), lx: glow.x, ly: glow.y };
      if (type === 'light') list.push(s);
      byTile.set(Grid.idx(f, x, y), s);
      return;
    }
  }

  /** what hangs on this face: a light (spaced out), else a banner, else a cobweb, else nothing */
  function pick(x, y, face) {
    const roll = Tiles().hash(x, y, 40 + face) % 100;
    const far = !list.some((s) => Math.max(Math.abs(s.x - x), Math.abs(s.y - y)) < SPACING);
    if (roll < style.chance && far) return 'light';
    const r2 = Tiles().hash(x, y, 60 + face) % 100;
    if (dress && dress.banner && r2 < dress.bannerChance) return 'banner';
    if (dress && r2 >= 100 - dress.web) return 'web';
    return null;
  }

  /** lights of the fittings on explored walls inside the drawn window (render.js collectStaticLights) */
  function collectLights(f, sMin, sMax) {
    fittings(f);
    if (!style) return;
    for (const s of list) {
      if (s.x + s.y < sMin || s.x + s.y > sMax || !f.explored[Grid.idx(f, s.x, s.y)]) continue;
      Lighting.add(s.lx, s.ly, style.radius, style.color, style.intensity, style.flicker);
    }
  }

  /** flames drawn this frame, for the halo pass: screen x, y and the fitting */
  const lit = [];

  /** render.js calls this right after a wall prism is drawn (at the wall's cut-away alpha; a faded wall's
   *  fitting fades with it and skips its halo) */
  function drawOn(ctx, f, x, y, i, timeMs, al) {
    fittings(f);
    const s = style && byTile.get(i);
    if (!s) return;
    const S = iso.view.S, o = iso.toScreen(x, y, { x: 0, y: 0 });
    if (s.type !== 'light') {
      drawDress(ctx, o, s, S);
      return;
    }
    const mx = o.x + s.face * FACE_DX * S, my = o.y + MOUNT_DY * S;
    const px = (dx, dy, w, h, col) => {
      ctx.fillStyle = col;
      ctx.fillRect(Math.round(mx + dx * S), Math.round(my + dy * S), w * S, h * S);
    };
    const frame = Math.floor(timeMs / 110 + (s.seed % 7)) % 3;
    const flameAt = FITTING[style.kind](px, s.face, frame);
    if (al < 1 || !Lighting.sourceSeen(f, { x: s.lx, y: s.ly })) return;
    lit.push({ x: mx + flameAt.dx * S, y: my + flameAt.dy * S, s, r: flameAt.r });
  }

  /** Face-local art pixels: u runs along the face from its outer corner, k down from its top edge. The left
   *  face's top edge climbs half a pixel per pixel toward the corner the faces share; the right mirrors it. */
  function facePx(ctx, o, face, S) {
    return (u, k, w, h, col) => {
      const dx = face < 0 ? -16 + u : 15 - u - (w - 1);
      const dy = Math.floor(-19 + u * 0.5) + k;
      ctx.fillStyle = col;
      ctx.fillRect(Math.round(o.x + dx * S), Math.round(o.y + dy * S), w * S, h * S);
    };
  }

  function drawDress(ctx, o, s, S) {
    const px = facePx(ctx, o, s.face, S);
    if (s.type === 'web') {
      for (const [u, k] of WEB_PX) px(u, k, 1, 1, WEB);
      return;
    }
    // a banner: a dark rod, five cloth columns that follow the face's slope, trimmed, with a swallow-tail hem
    const [cloth, trim] = dress.banner;
    const len = 9 + (s.seed % 3);
    for (let c = 0; c < 7; c++) px(5 + c, 2, 1, 1, IRON);
    for (let c = 0; c < 5; c++) {
      const edge = c === 0 || c === 4;
      const hem = c === 2 ? len - 2 : len;
      px(6 + c, 3, 1, hem, edge ? trim : cloth);
    }
    px(8, 6, 1, 2, trim);
    px(7, 7, 3, 1, trim);
  }

  const LEAN = [0, -1, 1];
  /** a flame 3 px wide at its base, `rows` tall, its tongue leaning with the frame */
  function flame(px, dx, dy, frame, rows) {
    const lean = LEAN[frame];
    px(dx - 1, dy, 3, 1, FIRE.edge);
    px(dx, dy, 1, 1, FIRE.mid);
    px(dx - 1, dy - 1, 3, 1, FIRE.mid);
    px(dx, dy - 1, 1, 1, FIRE.core);
    px(dx, dy - 2, 1, 1, FIRE.core);
    if (rows > 3) px(dx + Math.max(0, lean), dy - 3, 1, 1, FIRE.mid);
    if (rows > 4) px(dx + lean, dy - 4, 1, 1, FIRE.edge);
  }

  const FITTING = {
    torch(px, face, frame) {
      px(-1, 1, 3, 1, IRON);
      px(0, 0, 1, 3, IRON_LIT);
      const tx = face < 0 ? -1 : 1;
      px(tx, -3, 1, 4, WOOD);
      px(tx - 1, -4, 3, 1, IRON);
      flame(px, tx, -5, frame, 5);
      return { dx: tx + 0.5, dy: -6.5, r: 12 };
    },
    candles(px, face, frame) {
      px(-2, 1, 5, 1, IRON);
      px(-2, 0, 1, 1, IRON_LIT);
      px(2, 0, 1, 1, IRON_LIT);
      for (const cx of [-2, 0, 2]) {
        const tall = cx === 0 ? 3 : 2;
        px(cx, 1 - tall, 1, tall, WAX);
        px(cx, -tall, 1, 1, frame === (cx + 2) / 2 ? FIRE.mid : FIRE.core);
        px(cx, -tall - 1, 1, 1, frame === 1 && cx !== 0 ? FIRE.edge : FIRE.mid);
      }
      return { dx: 0.5, dy: -3, r: 8 };
    },
    lantern(px, face, frame) {
      px(0, -6, 1, 2, IRON);
      px(-1, -4, 3, 1, IRON_LIT);
      px(-1, -3, 3, 3, frame === 2 ? '#ffd890' : '#ffcc78');
      px(0, -2, 1, 1, '#fff2c8');
      px(-1, -3, 1, 3, IRON);
      px(1, -3, 1, 3, IRON);
      px(-1, 0, 3, 1, IRON_LIT);
      return { dx: 0.5, dy: -1.5, r: 8 };
    },
    brazier(px, face, frame) {
      px(-2, -1, 5, 1, IRON_LIT);
      px(-1, 0, 3, 1, IRON);
      px(0, 1, 1, 2, IRON);
      px(-1, -2, 3, 1, '#ff5a1a');
      flame(px, -1, -3, frame, 3);
      flame(px, 1, -3, (frame + 1) % 3, 4);
      return { dx: 0.5, dy: -4, r: 11 };
    },
  };

  /** after the light multiply: a soft additive halo and a rising spark or two per lit flame */
  function halos(ctx, world, alpha, timeMs) {
    if (!lit.length || !style) return;
    const S = iso.view.S;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const l of lit) {
      const fl = 0.8 + 0.2 * Math.sin(timeMs / 70 + l.s.seed) * Math.sin(timeMs / 23 + l.s.x);
      const r = l.r * S;
      const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, r);
      g.addColorStop(0, Palette.rgba(style.color, 0.42 * fl));
      g.addColorStop(0.35, Palette.rgba(style.color, 0.14 * fl));
      g.addColorStop(1, Palette.rgba(style.color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(l.x - r, l.y - r, r * 2, r * 2);
      if (style.kind !== 'lantern') spark(ctx, l, timeMs, S);
    }
    ctx.restore();
    lit.length = 0;
  }

  /** one ember climbing about 10 art px above the flame every ~1.3 s */
  function spark(ctx, l, timeMs, S) {
    const period = 1300 + (l.s.seed % 500);
    const p = ((timeMs + l.s.seed) % period) / period;
    if (p > 0.7) return;
    const k = p / 0.7;
    const sx = l.x + Math.sin(k * 5 + l.s.seed) * 1.5 * S, sy = l.y - k * 10 * S;
    ctx.fillStyle = Palette.rgba(FIRE.mid, 0.9 * (1 - k));
    ctx.fillRect(Math.round(sx), Math.round(sy), S, S);
  }

  BD.view.render.hooks.overlays.push(halos);
  BD.view.sconces = { fittings, collectLights, drawOn, STYLE };
})(globalThis.BD);
