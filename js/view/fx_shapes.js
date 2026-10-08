// @ts-check
// Shape kinds for FX: ring (iso ellipse expanding), flash (school mid with a small core), arc
// (crescent/cleave), spike (thrust), star (rays squashed 0.55 in y), dash (speed lines), spin, beam
// (jagged), column (soft-edged, with a bright core line), lob (arcing projectile), and the element
// motifs from ART_DIRECTION.md: fork (lightning), crystal (cold), tongues (fire), puff (poison/smoke).
(function (BD) {
  'use strict';

  const iso = BD.view.iso;
  const Palette = BD.view.palette;
  const a = { x: 0, y: 0 }, b = { x: 0, y: 0 };
  const columnCache = new Map();

  /** a soft-edged column sprite: bright centre, transparent sides, fading to nothing at the top */
  function columnSprite(pal) {
    const key = pal.core + pal.mid;
    let c = columnCache.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = 32;
    c.height = 64;
    const g = c.getContext('2d');
    const h = g.createLinearGradient(0, 0, 32, 0);
    h.addColorStop(0, Palette.rgba(pal.mid, 0));
    h.addColorStop(0.3, Palette.rgba(pal.mid, 0.55));
    h.addColorStop(0.5, Palette.rgba(pal.core, 0.9));
    h.addColorStop(0.7, Palette.rgba(pal.mid, 0.55));
    h.addColorStop(1, Palette.rgba(pal.mid, 0));
    g.fillStyle = h;
    g.fillRect(0, 0, 32, 64);
    g.globalCompositeOperation = 'destination-in';
    const v = g.createLinearGradient(0, 0, 0, 64);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(0.55, 'rgba(0,0,0,0.7)');
    v.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = v;
    g.fillRect(0, 0, 32, 64);
    columnCache.set(key, c);
    return c;
  }

  /** per-shape random layout, rolled once (so a shape doesn't re-randomise every frame) */
  function seeds(s, n) {
    if (!s.seeds) {
      s.seeds = [];
      for (let i = 0; i < n * 4; i++) s.seeds.push(Math.random());
    }
    return s.seeds;
  }

  /** a jagged polyline from (x0,y0) to (x1,y1), jitter in px */
  function jagged(ctx, x0, y0, x1, y1, segs, jit) {
    ctx.moveTo(x0, y0);
    for (let i = 1; i < segs; i++) {
      const f = i / segs;
      ctx.lineTo(x0 + (x1 - x0) * f + (Math.random() - 0.5) * jit, y0 + (y1 - y0) * f + (Math.random() - 0.5) * jit);
    }
    ctx.lineTo(x1, y1);
  }

  /** a ray set from the origin, stroked wide in mid (underlay) then thin in core */
  function strokeTwice(ctx, fade, pal, wide, thin, path) {
    ctx.globalAlpha = fade * 0.45;
    ctx.strokeStyle = pal.mid;
    ctx.lineWidth = wide;
    ctx.beginPath();
    path();
    ctx.stroke();
    ctx.globalAlpha = fade;
    ctx.strokeStyle = pal.core;
    ctx.lineWidth = thin;
    ctx.beginPath();
    path();
    ctx.stroke();
  }

  // shape kind → draws one frame. ctx alpha is reset to 1 by draw() afterwards.
  //   a = the shape origin on screen; frame = { S: device px per art px, fade: 1 - t, k: size scale,
  //   pal: school colours, lift: px above the ground }
  const SHAPES = {
    ring(ctx, s, t, zk, { S, fade, k, pal }) {
      const r = ((s.from || 0.2) + ((s.to || 1.2) - (s.from || 0.2)) * Math.sqrt(t)) * k;
      ctx.globalAlpha = fade * 0.9;
      ctx.strokeStyle = pal.mid;
      ctx.lineWidth = Math.max(1, 3 * zk * fade);
      ctx.beginPath();
      ctx.ellipse(a.x, a.y, r * iso.HW * S, r * iso.HH * S, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = pal.core;
      ctx.lineWidth = Math.max(1, zk * fade);
      ctx.stroke();
    },
    flash(ctx, s, t, zk, { S, fade, k, pal, lift }) {
      // the school's mid colour (~60%) with a small bright core (~30% of the size); not white
      const r = (s.radius || 1) * k * iso.HW * S * (0.6 + 0.4 * t);
      const al = fade * (s.alpha || 0.9);
      ctx.globalAlpha = al * 0.6;
      ctx.drawImage(BD.view.fx.glow(pal.mid), a.x - r, a.y - lift - r * 0.7, r * 2, r * 1.4);
      const rc = r * 0.3;
      ctx.globalAlpha = al;
      ctx.drawImage(BD.view.fx.glow(pal.core), a.x - rc, a.y - lift - rc * 0.8, rc * 2, rc * 1.6);
    },
    arc(ctx, s, t, zk, { fade, k, pal, lift }) {
      // crescent across the strike direction, sampled in the iso plane
      const half = s.half || 1.05, r = (s.radius || 0.6) * k;
      const sweep = Math.min(1, t * 1.6);
      ctx.globalAlpha = fade;
      for (const [w, col] of [[(s.width || 4.5) * zk, pal.mid], [1.4 * zk, pal.core]]) {
        ctx.strokeStyle = col;
        ctx.lineWidth = w;
        ctx.beginPath();
        const n = 14;
        for (let i = 0; i <= n; i++) {
          const ang = s.ang - half + (2 * half * i * sweep) / n;
          const tx = s.x + Math.cos(ang) * r, ty = s.y + Math.sin(ang) * r;
          iso.toScreen(tx, ty, b);
          if (i === 0) ctx.moveTo(b.x, b.y - lift);
          else ctx.lineTo(b.x, b.y - lift);
        }
        ctx.stroke();
      }
    },
    spike(ctx, s, t, zk, { fade, pal, lift }) {
      const len = (s.len || 17) * zk * (0.5 + t);
      const ang = s.vert
        ? Math.PI / 2
        : Math.atan2((Math.cos(s.ang) + Math.sin(s.ang)) * iso.HH, (Math.cos(s.ang) - Math.sin(s.ang)) * iso.HW);
      let cx = a.x - Math.cos(ang) * len * 0.5, cy = a.y - lift - Math.sin(ang) * len * 0.5;
      if (s.vert) {
        // a vertical spike rises out of the ground instead of thrusting
        cx = a.x;
        cy = a.y - lift - len * (1 - t);
      }
      const w = (s.w || 2.4) * zk;
      ctx.lineCap = 'round';
      strokeTwice(ctx, fade, pal, w * 2.6, w, () => {
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
      });
      ctx.lineCap = 'butt';
    },
    star(ctx, s, t, zk, { S, fade, k, pal, lift }) {
      const rays = s.rays || 5, r = (s.radius || 0.9) * k * iso.HW * S * (0.4 + 0.6 * Math.sqrt(t));
      const rot = s.rot != null ? s.rot : s.ang;
      strokeTwice(ctx, fade, pal, 5 * zk, (s.w || 2) * zk, () => {
        for (let i = 0; i < rays; i++) {
          const ang = rot + (i / rays) * Math.PI * 2;
          ctx.moveTo(a.x, a.y - lift);
          ctx.lineTo(a.x + Math.cos(ang) * r, a.y - lift + Math.sin(ang) * r * 0.55);
        }
      });
    },
    dash(ctx, s, t, zk, { fade, pal, lift }) {
      const endX = s.x1 != null ? s.x1 : s.x;
      const endY = s.y1 != null ? s.y1 : s.y;
      iso.toScreen(endX, endY, b);
      ctx.globalAlpha = fade * 0.8;
      ctx.strokeStyle = pal.mid;
      ctx.lineWidth = 2 * zk;
      const reach = 0.3 + 0.7 * t;
      for (let i = -1; i <= 1; i++) {
        const y0 = a.y - lift + i * 4 * zk;
        ctx.beginPath();
        ctx.moveTo(a.x, y0);
        ctx.lineTo(a.x + (b.x - a.x) * reach, y0 + (b.y - a.y) * reach);
        ctx.stroke();
      }
    },
    spin(ctx, s, t, zk, { fade, k, pal, lift }) {
      const r = (s.radius || 1) * k;
      const blades = () => {
        for (let j = 0; j < 2; j++) {
          for (let i = 0; i <= 10; i++) {
            const ang = t * 9 + j * Math.PI + (i / 10) * 1.6;
            iso.toScreen(s.x + Math.cos(ang) * r, s.y + Math.sin(ang) * r, b);
            if (i === 0) ctx.moveTo(b.x, b.y - lift);
            else ctx.lineTo(b.x, b.y - lift);
          }
        }
      };
      strokeTwice(ctx, fade, pal, 8 * zk, 3 * zk, blades);
    },
    beam(ctx, s, t, zk, { fade, pal, lift }) {
      iso.toScreen(s.x1, s.y1, b);
      ctx.globalAlpha = fade;
      for (const [w, col] of [[4 * zk, pal.mid], [1.5 * zk, pal.core]]) {
        ctx.strokeStyle = col;
        ctx.lineWidth = w;
        ctx.beginPath();
        jagged(ctx, a.x, a.y - lift, b.x, b.y - lift, 7, 10 * zk);
        ctx.stroke();
      }
    },
    column(ctx, s, t, zk, { fade, pal }) {
      // soft horizontal edges (a pre-rendered sprite) plus an additive core line
      const h = (s.height || 120) * zk;
      const w = (s.width || 10) * zk * (1 - t * 0.5) * 1.8;
      ctx.globalAlpha = fade;
      ctx.drawImage(columnSprite(pal), a.x - w / 2, a.y - h, w, h);
      const g = ctx.createLinearGradient(0, a.y - h, 0, a.y);
      g.addColorStop(0, Palette.rgba(pal.core, 0));
      g.addColorStop(1, Palette.rgba(pal.core, 0.95));
      ctx.fillStyle = g;
      const cw = Math.max(1, 1.5 * zk);
      ctx.fillRect(a.x - cw / 2, a.y - h, cw, h);
    },
    lob(ctx, s, t, zk, { pal }) {
      // an arcing projectile from (x,y) to (x1,y1)
      const px = s.x + (s.x1 - s.x) * t, py = s.y + (s.y1 - s.y) * t;
      iso.toScreen(px, py, b);
      const hgt = Math.sin(t * Math.PI) * (s.big ? 160 : 60) * zk + 10 * zk;
      const r = (s.big ? 14 : 6) * zk;
      ctx.globalAlpha = 1;
      ctx.drawImage(BD.view.fx.glow(pal.mid), b.x - r * 1.5, b.y - hgt - r * 1.5, r * 3, r * 3);
      ctx.drawImage(BD.view.fx.glow(pal.core), b.x - r * 0.6, b.y - hgt - r * 0.6, r * 1.2, r * 1.2);
      if (Math.random() < 0.6) {
        BD.view.fx.spark(px, py, { z: hgt / zk, vz: 0, g: 0.0002, life: 300, size: 2, color: pal.mid, ambient: true });
      }
    },
    fork(ctx, s, t, zk, { S, k, pal, lift }) {
      // lightning: 2–3 jagged forks from the hit, re-jittered each frame, strobing twice
      if (!(t < 0.35 || (t > 0.5 && t < 0.8))) return;
      const n = s.forks || 3, sd = seeds(s, n);
      const r = (s.radius || 0.9) * k * iso.HW * S;
      const fade = t < 0.35 ? 1 : 0.7;
      for (const [w, col, al] of [[3.5 * zk, pal.mid, 0.8], [1.3 * zk, pal.core, 1]]) {
        ctx.globalAlpha = fade * al;
        ctx.strokeStyle = col;
        ctx.lineWidth = w;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const ang = (s.ang || 0) + (i / n) * Math.PI * 2 + sd[i] * 1.2;
          const len = r * (0.6 + 0.5 * sd[n + i]);
          jagged(ctx, a.x, a.y - lift, a.x + Math.cos(ang) * len, a.y - lift + Math.sin(ang) * len * 0.6, 4, 7 * zk);
        }
        ctx.stroke();
      }
    },
    crystal(ctx, s, t, zk, { S, k, pal, lift }) {
      // cold: a 6-ray crystal star with barbs; bursts out, then hangs and fades slowly
      const rays = s.rays || 6;
      const r = (s.radius || 0.8) * k * iso.HW * S * Math.min(1, t * 5);
      const fade = t < 0.45 ? 1 : (1 - t) / 0.55;
      const barb = r * 0.28;
      strokeTwice(ctx, fade, pal, 4.5 * zk, 1.6 * zk, () => {
        for (let i = 0; i < rays; i++) {
          const ang = (i / rays) * Math.PI * 2 + Math.PI / 2;
          const cx = Math.cos(ang), cy = Math.sin(ang) * 0.55;
          const ex = a.x + cx * r, ey = a.y - lift + cy * r;
          ctx.moveTo(a.x, a.y - lift);
          ctx.lineTo(ex, ey);
          const mx = a.x + cx * r * 0.6, my = a.y - lift + cy * r * 0.6;
          for (const side of [-0.7, 0.7]) {
            ctx.moveTo(mx, my);
            ctx.lineTo(mx + Math.cos(ang + side) * barb, my + Math.sin(ang + side) * barb * 0.55);
          }
        }
      });
    },
    tongues(ctx, s, t, zk, { S, k, pal, lift }) {
      // fire: flame tongues that rise and narrow as they burn out
      const n = s.n || 5, sd = seeds(s, n);
      const spread = (s.radius || 0.6) * k * iso.HW * S;
      const fade = 1 - t;
      for (let i = 0; i < n; i++) {
        const ox = (sd[i] - 0.5) * 2 * spread, oy = (sd[n + i] - 0.5) * spread * 0.5;
        const life = Math.sin(Math.min(1, t * 1.4) * Math.PI);
        const h = (s.height || 18) * zk * (0.6 + 0.6 * sd[2 * n + i]) * life * Math.sqrt(k);
        const w = (s.w || 4) * zk * (1 - t * 0.6);
        const bx = a.x + ox, by = a.y - lift * 0.3 + oy - t * 10 * zk;
        for (const [col, f, al] of [[pal.mid, 1, 0.85], [pal.core, 0.45, 1]]) {
          ctx.globalAlpha = fade * al;
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.moveTo(bx - w * f, by);
          ctx.quadraticCurveTo(bx - w * f * 0.6, by - h * 0.5, bx + (sd[3 * n + i] - 0.5) * w, by - h * f);
          ctx.quadraticCurveTo(bx + w * f * 0.6, by - h * 0.5, bx + w * f, by);
          ctx.closePath();
          ctx.fill();
        }
      }
    },
    puff(ctx, s, t, zk, { S, k, pal, lift }) {
      // poison / smoke: soft blobs that swell and drift up
      const n = s.n || 5, sd = seeds(s, n);
      const spread = (s.radius || 0.6) * k * iso.HW * S;
      const glowImg = BD.view.fx.glow(pal.mid);
      for (let i = 0; i < n; i++) {
        const ang = sd[i] * Math.PI * 2, d = spread * (0.3 + 0.7 * sd[n + i]) * (0.4 + 0.6 * t);
        const r = (s.size || 7) * zk * (0.7 + 0.6 * sd[2 * n + i]) * (0.6 + 0.8 * t);
        ctx.globalAlpha = (1 - t) * (s.alpha || 0.6);
        ctx.drawImage(glowImg, a.x + Math.cos(ang) * d - r, a.y - lift + Math.sin(ang) * d * 0.55 - t * 10 * zk - r, r * 2, r * 2);
      }
    },
  };

  function draw(ctx, s, t, zk) {
    iso.toScreen(s.x, s.y, a);
    const frame = {
      S: iso.view.S,
      fade: 1 - t,
      k: s.k || 1,
      pal: s.pal || Palette.SCHOOL.steel,
      lift: (s.z != null ? s.z : 10) * zk,
    };
    if (Object.prototype.hasOwnProperty.call(SHAPES, s.kind)) SHAPES[s.kind](ctx, s, t, zk, frame);
    ctx.globalAlpha = 1;
  }

  BD.view.fxShapes = { draw };
})(globalThis.BD);
