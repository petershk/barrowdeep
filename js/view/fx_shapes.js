// @ts-check
// Shape kinds for FX: ring (iso ellipse expanding), flash (radial), arc (crescent/cleave), spike
// (thrust), star (rays squashed 0.55 in y), dash (speed lines), spin, beam (jagged), bar (overhead).
(function (BD) {
  'use strict';

  const iso = BD.view.iso;
  const P = BD.view.palette;
  const a = { x: 0, y: 0 }, b = { x: 0, y: 0 };

  function draw(ctx, s, t, zk) {
    const S = iso.view.S;
    iso.toScreen(s.x, s.y, a);
    const fade = 1 - t;
    const k = s.k || 1;
    const pal = s.pal || P.SCHOOL.general;
    const lift = (s.z != null ? s.z : 10) * zk;
    switch (s.kind) {
      case 'ring': {
        const r = ((s.from || 0.2) + ((s.to || 1.2) - (s.from || 0.2)) * Math.sqrt(t)) * k;
        ctx.globalAlpha = fade * 0.9;
        ctx.strokeStyle = pal.mid; ctx.lineWidth = Math.max(1, 3 * zk * fade);
        ctx.beginPath(); ctx.ellipse(a.x, a.y, r * iso.HW * S, r * iso.HH * S, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = pal.core; ctx.lineWidth = Math.max(1, zk * fade);
        ctx.stroke();
        break;
      }
      case 'flash': {
        const r = (s.radius || 1) * k * iso.HW * S * (0.6 + 0.4 * t);
        ctx.globalAlpha = fade * (s.alpha || 0.9);
        ctx.drawImage(BD.view.fx.glow(pal.core), a.x - r, a.y - lift - r * 0.7, r * 2, r * 1.4);
        break;
      }
      case 'arc': {
        // crescent across the strike direction, sampled in the iso plane
        const half = s.half || 1.05, r = (s.radius || 0.6) * k;
        const sweep = Math.min(1, t * 1.6);
        ctx.globalAlpha = fade;
        for (const [w, col] of [[(s.width || 4.5) * zk, pal.mid], [1.4 * zk, pal.core]]) {
          ctx.strokeStyle = col; ctx.lineWidth = w;
          ctx.beginPath();
          const n = 14;
          for (let i = 0; i <= n; i++) {
            const ang = s.ang - half + (2 * half * i * sweep) / n;
            const tx = s.x + Math.cos(ang) * r, ty = s.y + Math.sin(ang) * r;
            iso.toScreen(tx, ty, b);
            if (i === 0) ctx.moveTo(b.x, b.y - lift); else ctx.lineTo(b.x, b.y - lift);
          }
          ctx.stroke();
        }
        break;
      }
      case 'spike': {
        const len = (s.len || 17) * zk * (0.5 + t), ang = s.vert ? Math.PI / 2 : Math.atan2((Math.cos(s.ang) + Math.sin(s.ang)) * iso.HH, (Math.cos(s.ang) - Math.sin(s.ang)) * iso.HW);
        ctx.globalAlpha = fade;
        ctx.strokeStyle = pal.core; ctx.lineWidth = (s.w || 2.4) * zk;
        const cx = a.x - (s.vert ? 0 : Math.cos(ang) * len * 0.5), cy = a.y - lift - (s.vert ? len * (1 - t) : Math.sin(ang) * len * 0.5);
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len); ctx.stroke();
        break;
      }
      case 'star': {
        const rays = s.rays || 5, r = (s.radius || 0.9) * k * iso.HW * S * (0.4 + 0.6 * t);
        ctx.globalAlpha = fade;
        ctx.strokeStyle = pal.core; ctx.lineWidth = 2 * zk;
        ctx.beginPath();
        for (let i = 0; i < rays; i++) {
          const ang = s.ang + (i / rays) * Math.PI * 2;
          ctx.moveTo(a.x, a.y - lift); ctx.lineTo(a.x + Math.cos(ang) * r, a.y - lift + Math.sin(ang) * r * 0.55);
        }
        ctx.stroke();
        break;
      }
      case 'dash': {
        iso.toScreen(s.x1 != null ? s.x1 : s.x, s.y1 != null ? s.y1 : s.y, b);
        ctx.globalAlpha = fade * 0.8;
        ctx.strokeStyle = pal.mid; ctx.lineWidth = 2 * zk;
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath(); ctx.moveTo(a.x, a.y - lift + i * 4 * zk); ctx.lineTo(a.x + (b.x - a.x) * (0.3 + 0.7 * t), a.y - lift + (b.y - a.y) * (0.3 + 0.7 * t) + i * 4 * zk); ctx.stroke();
        }
        break;
      }
      case 'spin': {
        const r = (s.radius || 1) * k;
        ctx.globalAlpha = fade;
        ctx.strokeStyle = pal.core; ctx.lineWidth = 3 * zk;
        for (let j = 0; j < 2; j++) {
          ctx.beginPath();
          for (let i = 0; i <= 10; i++) {
            const ang = t * 9 + j * Math.PI + (i / 10) * 1.6;
            iso.toScreen(s.x + Math.cos(ang) * r, s.y + Math.sin(ang) * r, b);
            if (i === 0) ctx.moveTo(b.x, b.y - lift); else ctx.lineTo(b.x, b.y - lift);
          }
          ctx.stroke();
        }
        break;
      }
      case 'beam': {
        iso.toScreen(s.x1, s.y1, b);
        ctx.globalAlpha = fade;
        for (const [w, col] of [[4 * zk, pal.mid], [1.5 * zk, pal.core]]) {
          ctx.strokeStyle = col; ctx.lineWidth = w;
          ctx.beginPath(); ctx.moveTo(a.x, a.y - lift);
          const n = 7;
          for (let i = 1; i < n; i++) {
            const f = i / n;
            ctx.lineTo(a.x + (b.x - a.x) * f + (Math.random() - 0.5) * 10 * zk, a.y - lift + (b.y - a.y) * f + (Math.random() - 0.5) * 10 * zk);
          }
          ctx.lineTo(b.x, b.y - lift); ctx.stroke();
        }
        break;
      }
      case 'column': {
        const h = (s.height || 120) * zk;
        ctx.globalAlpha = fade * 0.85;
        const g = ctx.createLinearGradient(0, a.y - h, 0, a.y);
        g.addColorStop(0, P.rgba(pal.core, 0)); g.addColorStop(0.7, P.rgba(pal.mid, 0.6)); g.addColorStop(1, P.rgba(pal.core, 0.9));
        ctx.fillStyle = g;
        const w = (s.width || 10) * zk * (1 - t * 0.5);
        ctx.fillRect(a.x - w / 2, a.y - h, w, h);
        break;
      }
      default: break;
    }
    ctx.globalAlpha = 1;
  }

  BD.view.fxShapes = { draw };
})(globalThis.BD);
