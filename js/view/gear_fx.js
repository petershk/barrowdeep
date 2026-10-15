// @ts-check
// Gear effects on the hero (ART_DIRECTION.md "The hero's gear"): a rare or legendary weapon glows in its
// rarity colour; an elemental weapon sheds its element; every legendary sheds its own school from where it is
// worn (blade, helm, cloak, chest, amulet) in that school's motion: fire and holy light rise, frost hangs and
// twinkles, lightning jitters, poison and blood drip, shadow smokes outward, souls spiral in, dust settles.
// A rare or better ring glints at the weapon hand; an amulet sparkles at the neck in its colour.
// Drawn after the hero's body each frame; time-seeded, so there is no particle state.
(function (BD) {
  'use strict';

  const Palette = BD.view.palette;
  const Paperdoll = () => BD.view.paperdoll;
  const EntityView = BD.view.entities;
  const { SCHOOL, SCHOOL_NORMAL_BLEND, RARITY } = Palette;
  const MOTES = 5;                     // particles per emitter
  /** how a school moves, and how fast one mote lives (ms) */
  const MOTION = {
    fire: ['rise', 900], holy: ['rise', 1600], lava: ['rise', 900], cold: ['twinkle', 1500], steel: ['twinkle', 1400],
    gold: ['twinkle', 1300], storm: ['jitter', 600], poison: ['drip', 1300], blood: ['drip', 1100],
    shadow: ['smoke', 1800], portal: ['spiral', 1600], dust: ['fall', 1700], bone: ['fall', 1500],
  };
  const ARMOUR_DEFAULT = 'gold';       // a legendary armour piece with no signature sheds gold motes

  /** art-pixel → screen mapping for the drawn sprite (mirrored when the hero faces left) */
  function frameOf(e, box, artId) {
    const art = BD.view.art[artId];
    if (!art || !box) return null;
    const w = art.frames.idle[0][0].length;
    const k = box.w / w;
    const flip = !!EntityView.stateOf(e.id).flip;
    return { k, at: (x, y) => ({ x: box.x + (flip ? w - 1 - x + 0.5 : x + 0.5) * k, y: box.y + (y + 0.5) * k }), h: box.h / k };
  }

  /** where each worn piece's effect comes from, as a segment in art pixels (x0,y0 → x1,y1) */
  function regions(artId, wk) {
    const cl = Paperdoll().CLASS[artId], ov = Paperdoll().WEAPON[wk];
    if (!cl) return null;
    const [cx, cy, len] = cl.cloak;
    return {
      blade: ov ? [cl.hand[0], cl.hand[1], cl.hand[0], cl.hand[1] - ov.g] : null,
      head: [cl.helm[0] + 1, cl.helm[1], cl.helm[0] + 6, cl.helm[1]],
      back: [cx + 1, cy + 1, cx + 1, cy + len - 2],
      body: [cl.shoulders[0][0] + 1, cl.shoulders[0][1] + 2, cl.shoulders[1][0] - 1, cl.shoulders[1][1] + 6],
      neck: [cl.neck[0], cl.neck[1], cl.neck[0], cl.neck[1]],
      hand: [cl.hand[0], cl.hand[1], cl.hand[0], cl.hand[1]],
    };
  }

  /** the emitters for what the hero wears: [region, school] */
  function emitters(g) {
    const L = Paperdoll().LEGEND, out = [];
    const sig = (id) => (id !== '-' && L[id] && L[id].fx) || null;
    if (SCHOOL[g.elem]) out.push(['blade', g.elem]);
    if (sig(g.wLeg)) out.push(['blade', sig(g.wLeg)]);
    if (sig(g.oLeg)) out.push(['hand', sig(g.oLeg)]);
    if (g.cRar === 'legendary') out.push(['body', sig(g.cLeg) || ARMOUR_DEFAULT]);
    if (g.hRar === 'legendary') out.push(['head', sig(g.hLeg) || ARMOUR_DEFAULT]);
    if (g.kRar === 'legendary') out.push(['back', sig(g.kLeg) || ARMOUR_DEFAULT]);
    if (sig(g.aLeg)) out.push(['neck', sig(g.aLeg)]);
    return out;
  }

  function draw(ctx, world, e, ep, s, timeMs, box) {
    if (e.kind !== 'player' || e.dead || !e.equip || !box) return;
    const g = Paperdoll().gearOf(e);
    const artId = EntityView.artOf(e);
    const fr = frameOf(e, box, artId), reg = regions(artId, g.wk);
    if (!fr || !reg) return;
    ctx.save();
    if (reg.blade && Paperdoll().RANK[g.wRar] >= Paperdoll().RANK.rare) weaponGlow(ctx, fr, reg.blade, RARITY[g.wRar], timeMs);
    emitters(g).forEach(([where, school], n) => {
      if (reg[where]) motes(ctx, fr, reg[where], school, timeMs + n * 397);
    });
    const ring = g.rLeg !== '-' ? 'gold' : null;
    if (ring || Paperdoll().RANK[g.rRar] >= Paperdoll().RANK.rare) glint(ctx, fr, reg.hand, RARITY[g.rRar] || RARITY.legendary, timeMs);
    if (g.aRar !== '-') amuletSparkle(ctx, fr, reg.neck, g, timeMs);
    ctx.restore();
  }

  function weaponGlow(ctx, fr, seg, col, timeMs) {
    const mid = fr.at((seg[0] + seg[2]) / 2, (seg[1] + seg[3]) / 2);
    const r = 8 * fr.k, pulse = 0.75 + 0.25 * Math.sin(timeMs / 260);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.32 * pulse;
    ctx.drawImage(BD.view.fx.glow(col), mid.x - r, mid.y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  }

  function motes(ctx, fr, seg, school, timeMs) {
    const sch = SCHOOL[school], [kind, period] = MOTION[school] || MOTION.gold, size = Math.max(1, Math.round(fr.k));
    if (!sch) return;
    ctx.globalCompositeOperation = SCHOOL_NORMAL_BLEND[school] ? 'source-over' : 'lighter';
    for (let i = 0; i < MOTES; i++) {
      const p = (timeMs / period + i / MOTES) % 1;
      const along = (i * 0.37 + 0.15) % 1;
      const bx = seg[0] + (seg[2] - seg[0]) * along, by = seg[1] + (seg[3] - seg[1]) * along;
      const m = MOVE[kind](p, i, timeMs);
      const pt = fr.at(bx + m.dx, by + m.dy);
      ctx.globalAlpha = m.a;
      ctx.fillStyle = p < 0.35 ? sch.core : sch.mid;
      ctx.fillRect(Math.round(pt.x), Math.round(pt.y), size * m.w, size);
    }
    ctx.globalAlpha = 1;
  }

  /** where a mote is (art px from its spot), how bright and how wide, by motion */
  const MOVE = {
    rise: (p, i) => ({ dx: Math.sin(p * 6 + i) * 0.8, dy: -p * 9, a: 1 - p, w: 1 }),
    twinkle: (p, i) => ({ dx: (i % 2 ? 1 : -1) * p * 2.5, dy: -p * 2, a: Math.abs(Math.sin(p * Math.PI * 3)) * (1 - p), w: 1 }),
    jitter: (p, i, t) => {
      const j = Math.floor(t / 70) + i * 13;
      return { dx: ((j * 7) % 5) - 2, dy: ((j * 11) % 5) - 2, a: (j % 3) === 0 ? 1 : 0.35, w: (j % 2) + 1 };
    },
    drip: (p, i) => ({ dx: (i % 3) - 1, dy: p * 7, a: 0.9 * (1 - p), w: 1 }),
    smoke: (p, i) => ({ dx: (i % 2 ? 1 : -1) * p * 4, dy: -p * 3, a: 0.6 * (1 - p), w: 2 }),
    spiral: (p, i) => {
      const ang = i * 1.3 + p * 6, r = 5 * (1 - p);
      return { dx: Math.cos(ang) * r, dy: Math.sin(ang) * r * 0.6, a: 0.9 * p, w: 1 };
    },
    fall: (p, i) => ({ dx: Math.sin(p * 4 + i) * 1.2, dy: p * 5, a: 0.7 * (1 - p), w: 1 }),
  };

  /** a ring's glint: a short four-point star at the weapon hand every couple of seconds */
  function glint(ctx, fr, seg, col, timeMs) {
    const p = (timeMs % 2400) / 2400;
    if (p > 0.18) return;
    const a = Math.sin((p / 0.18) * Math.PI), c = fr.at(seg[0], seg[1]), k = Math.max(1, Math.round(fr.k));
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a;
    ctx.fillStyle = col;
    ctx.fillRect(Math.round(c.x - k * 2), Math.round(c.y), k * 5, k);
    ctx.fillRect(Math.round(c.x), Math.round(c.y - k * 2), k, k * 5);
    ctx.globalAlpha = 1;
  }

  /** an amulet's colour: a legendary's own stone colour, else its rarity colour */
  function amuletColour(g) {
    const L = g.aLeg !== '-' && Paperdoll().LEGEND[g.aLeg];
    return (L && L.pal && L.pal.J) || RARITY[g.aRar] || RARITY.common;
  }
  /** sparkles come more often the rarer the amulet (ms between them); magic and better also glow softly */
  const AMULET_PERIOD = { common: 3200, magic: 2400, rare: 1800, legendary: 1300 };

  /** the amulet at the neck: a soft glow in its colour and a small star that blooms and fades */
  function amuletSparkle(ctx, fr, seg, g, timeMs) {
    const col = amuletColour(g), c = fr.at(seg[0], seg[1]), k = Math.max(1, Math.round(fr.k));
    const rank = Paperdoll().RANK[g.aRar] || 0;
    ctx.globalCompositeOperation = 'lighter';
    if (rank >= 1) {
      const r = (2.5 + rank * 0.8) * fr.k;
      ctx.globalAlpha = 0.16 + 0.06 * rank + 0.08 * Math.sin(timeMs / 300);
      ctx.drawImage(BD.view.fx.glow(col), c.x - r, c.y - r, r * 2, r * 2);
    }
    const period = AMULET_PERIOD[g.aRar] || AMULET_PERIOD.common;
    const p = ((timeMs + 517) % period) / period;
    if (p < 0.22) {
      const q = p / 0.22, arm = Math.round(1 + Math.sin(q * Math.PI) * (1 + rank * 0.5));
      ctx.globalAlpha = Math.sin(q * Math.PI);
      ctx.fillStyle = col;
      ctx.fillRect(Math.round(c.x - k * arm), Math.round(c.y), k * (arm * 2 + 1), k);
      ctx.fillRect(Math.round(c.x), Math.round(c.y - k * arm), k, k * (arm * 2 + 1));
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(c.x), Math.round(c.y), k, k);
    }
    ctx.globalAlpha = 1;
  }

  BD.view.render.actorOver.push(draw);
  BD.view.gearFx = { draw, emitters };
})(globalThis.BD);
