// @ts-check
// Shape kinds for FX: ring (iso ellipse expanding), flash (radial), arc (crescent/cleave), spike
// (thrust), star (rays squashed 0.55 in y), dash (speed lines), spin, beam (jagged), column (overhead),
// lob (arcing projectile).
(function (BD) {
  'use strict';

  const iso = BD.view.iso;
  const Palette = BD.view.palette;
  const a = { x: 0, y: 0 }, b = { x: 0, y: 0 };

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
      const r = (s.radius || 1) * k * iso.HW * S * (0.6 + 0.4 * t);
      ctx.globalAlpha = fade * (s.alpha || 0.9);
      ctx.drawImage(BD.view.fx.glow(pal.core), a.x - r, a.y - lift - r * 0.7, r * 2, r * 1.4);
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
      ctx.globalAlpha = fade;
      ctx.strokeStyle = pal.core;
      ctx.lineWidth = (s.w || 2.4) * zk;
      let cx = a.x - Math.cos(ang) * len * 0.5, cy = a.y - lift - Math.sin(ang) * len * 0.5;
      if (s.vert) {
        // a vertical spike rises out of the ground instead of thrusting
        cx = a.x;
        cy = a.y - lift - len * (1 - t);
      }
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
      ctx.stroke();
    },
    star(ctx, s, t, zk, { S, fade, k, pal, lift }) {
      const rays = s.rays || 5, r = (s.radius || 0.9) * k * iso.HW * S * (0.4 + 0.6 * t);
      ctx.globalAlpha = fade;
      ctx.strokeStyle = pal.core;
      ctx.lineWidth = 2 * zk;
      ctx.beginPath();
      for (let i = 0; i < rays; i++) {
        const ang = s.ang + (i / rays) * Math.PI * 2;
        ctx.moveTo(a.x, a.y - lift);
        ctx.lineTo(a.x + Math.cos(ang) * r, a.y - lift + Math.sin(ang) * r * 0.55);
      }
      ctx.stroke();
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
      ctx.globalAlpha = fade;
      ctx.strokeStyle = pal.core;
      ctx.lineWidth = 3 * zk;
      for (let j = 0; j < 2; j++) {
        ctx.beginPath();
        for (let i = 0; i <= 10; i++) {
          const ang = t * 9 + j * Math.PI + (i / 10) * 1.6;
          iso.toScreen(s.x + Math.cos(ang) * r, s.y + Math.sin(ang) * r, b);
          if (i === 0) ctx.moveTo(b.x, b.y - lift);
          else ctx.lineTo(b.x, b.y - lift);
        }
        ctx.stroke();
      }
    },
    beam(ctx, s, t, zk, { fade, pal, lift }) {
      iso.toScreen(s.x1, s.y1, b);
      ctx.globalAlpha = fade;
      for (const [w, col] of [[4 * zk, pal.mid], [1.5 * zk, pal.core]]) {
        ctx.strokeStyle = col;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y - lift);
        const n = 7;
        for (let i = 1; i < n; i++) {
          const f = i / n;
          const jx = (Math.random() - 0.5) * 10 * zk, jy = (Math.random() - 0.5) * 10 * zk;
          ctx.lineTo(a.x + (b.x - a.x) * f + jx, a.y - lift + (b.y - a.y) * f + jy);
        }
        ctx.lineTo(b.x, b.y - lift);
        ctx.stroke();
      }
    },
    column(ctx, s, t, zk, { fade, pal }) {
      const h = (s.height || 120) * zk;
      ctx.globalAlpha = fade * 0.85;
      const g = ctx.createLinearGradient(0, a.y - h, 0, a.y);
      g.addColorStop(0, Palette.rgba(pal.core, 0));
      g.addColorStop(0.7, Palette.rgba(pal.mid, 0.6));
      g.addColorStop(1, Palette.rgba(pal.core, 0.9));
      ctx.fillStyle = g;
      const w = (s.width || 10) * zk * (1 - t * 0.5);
      ctx.fillRect(a.x - w / 2, a.y - h, w, h);
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
  };

  function draw(ctx, s, t, zk) {
    iso.toScreen(s.x, s.y, a);
    const frame = {
      S: iso.view.S,
      fade: 1 - t,
      k: s.k || 1,
      pal: s.pal || Palette.SCHOOL.general,
      lift: (s.z != null ? s.z : 10) * zk,
    };
    if (Object.prototype.hasOwnProperty.call(SHAPES, s.kind)) SHAPES[s.kind](ctx, s, t, zk, frame);
    ctx.globalAlpha = 1;
  }

  BD.view.fxShapes = { draw };
})(globalThis.BD);
