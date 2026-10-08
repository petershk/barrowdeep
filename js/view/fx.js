// @ts-check
// Pooled particles + shapes. Tile-space x,y; height z in screen px (at Z = 1); velocities per ms.
// Spawn rates are per second (accumulated), never per frame (07 §4.1). Light schools draw additively;
// dark matter (palette SCHOOL_NORMAL_BLEND: smoke, blood, dust, poison) draws source-over, first,
// because additive light can't show it (ART_DIRECTION.md).
(function (BD) {
  'use strict';

  const iso = BD.view.iso;
  const Palette = BD.view.palette;
  const CAP = 1500;
  const parts = [];
  for (let i = 0; i < CAP; i++) {
    parts.push({
      on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: 0, t: 0, life: 1, size: 1, color: '#fff',
      ambient: false, normal: false, soft: false,
    });
  }
  let live = 0, cursor = 0;
  const shapes = [];
  const lights = [];
  const tmp = { x: 0, y: 0 };
  const glowCache = new Map();
  /** the only three pulse periods (07 §1.5) */
  const BEAT = { ambient: 1600, attention: 600, danger: 160 };

  function reduced() { return BD.view.host.prefs.particles === 'reduced'; }
  /** 0..1 sine on one of the shared beats */
  function beat(kind, t) { return 0.5 + 0.5 * Math.sin((t / (BEAT[kind] || BEAT.ambient)) * Math.PI * 2); }

  /** spawn one particle; ambient motes are dropped first when the pool is full.
   *  o.blend 'normal' draws it source-over (dark matter); o.soft draws a soft blob instead of a pixel */
  function spark(x, y, o) {
    if (o.ambient && live > CAP * 0.7) return;
    if (reduced() && Math.random() < 0.5) return;
    let p = null;
    for (let k = 0; k < CAP; k++) {
      const c = parts[(cursor + k) % CAP];
      if (!c.on) {
        p = c;
        cursor = (cursor + k + 1) % CAP;
        break;
      }
    }
    if (!p) {
      for (const c of parts) {
        if (!c.ambient) continue;
        p = c;
        live--;
        break;
      }
    }
    if (!p) return;
    live++;
    p.on = true;
    p.x = x;
    p.y = y;
    p.z = o.z != null ? o.z : 8;
    p.vx = o.vx || 0;
    p.vy = o.vy || 0;
    p.vz = o.vz || 0;
    p.g = o.g != null ? o.g : 0.0002;
    p.t = 0;
    p.life = o.life || 400;
    p.size = o.size || 2;
    p.color = o.color || '#fff';
    p.ambient = !!o.ambient;
    p.normal = o.blend === 'normal';
    p.soft = !!o.soft;
  }
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (v) => (Array.isArray(v) ? rnd(v[0], v[1]) : v);
  /** half the sparks take the mid colour, the rest split 60/40 between core and edge */
  function sparkColor(pal) {
    if (Math.random() < 0.5) return pal.mid;
    return Math.random() < 0.6 ? pal.core : pal.edge;
  }
  /** 'normal' when a school is dark matter (or the recipe says so), else 'lighter' */
  function blendOf(def, schoolName) {
    if (def.blend) return def.blend;
    return Palette.SCHOOL_NORMAL_BLEND[schoolName] ? 'normal' : 'lighter';
  }

  function shape(s) {
    s.t = s.t || 0;
    s.delay = s.delay || 0;
    if (!s.blend) s.blend = 'lighter';
    shapes.push(s);
  }
  function light(x, y, radius, color, intensity, life) { lights.push({ x, y, radius, color, intensity, life, t: 0 }); }

  /** particle budget: busy screens (packs with DoTs) spawn fewer sparks per recipe */
  function budget() {
    if (live > CAP * 0.75) return 0.35;
    return live > CAP * 0.5 ? 0.6 : 1;
  }

  /** play a data recipe at (x,y); o: { dir:{x,y}, school, pal (overrides 'auto'), scale, x1, y1 } */
  function play(id, x, y, o) {
    const r = BD.view.fxRecipes[id];
    if (!r) return;
    o = o || {};
    const nameOf = (school) => (school === 'auto' ? o.school || 'steel' : school);
    const sch = (school) => {
      if (school === 'auto' && o.pal) return o.pal;
      return Palette.SCHOOL[nameOf(school)] || Palette.SCHOOL.steel;
    };
    const ang = o.dir ? Math.atan2(o.dir.y, o.dir.x) : 0;
    const k = o.scale || 1;
    const bk = budget();
    for (const pd of r.particles || []) {
      const pal = sch(pd.palette);
      const blend = blendOf(pd, nameOf(pd.palette));
      const n = Math.round(pd.count * k * bk);
      for (let i = 0; i < n; i++) {
        let a;
        if (pd.shape === 'cone') a = ang + rnd(-(pd.spread || 0.7), pd.spread || 0.7);
        else a = Math.random() * Math.PI * 2;
        const sp = pick(pd.speed);
        const r0 = pd.radius ? Math.random() * pd.radius * Math.sqrt(k) : 0;
        spark(x + Math.cos(a) * r0, y + Math.sin(a) * r0, {
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          z: pick(pd.z || [6, 14]), vz: pick(pd.vz || [0.01, 0.04]), g: pd.g != null ? pd.g : 0.0002,
          life: pick(pd.life || [250, 450]), size: pick(pd.size || [1.5, 3]),
          color: pd.color ? pal[pd.color] : sparkColor(pal), blend, soft: !!pd.soft,
        });
      }
    }
    for (const sd of r.shapes || []) {
      const name = nameOf(sd.palette || 'auto');
      shape(Object.assign({}, sd, { x, y, ang, pal: sch(sd.palette || 'auto'), k, x1: o.x1, y1: o.y1, blend: blendOf(sd, name) }));
    }
    if (r.light) light(x, y, r.light.radius * k, r.light.color || sch('auto').mid, r.light.intensity, r.light.life);
    if (r.shake) BD.view.camera.addTrauma(r.shake * Math.max(0.6, Math.min(1.6, k)));
  }

  function update(ms) {
    for (const p of parts) {
      if (!p.on) continue;
      p.t += ms;
      if (p.t >= p.life) {
        p.on = false;
        live--;
        continue;
      }
      p.x += p.vx * ms;
      p.y += p.vy * ms;
      p.vz -= p.g * ms;
      p.z += p.vz * ms * 6;
      if (p.z < 0) {
        p.z = 0;
        p.vz *= -0.4;
        p.vx *= 0.6;
        p.vy *= 0.6;
      }
    }
    for (let i = 0; i < shapes.length; i++) {
      const s = shapes[i];
      s.t += ms;
      if (s.t - s.delay >= s.life) shapes.splice(i--, 1);
    }
    for (let i = 0; i < lights.length; i++) {
      const l = lights[i];
      l.t += ms;
      if (l.t >= l.life) lights.splice(i--, 1);
    }
  }

  function glow(color) {
    let c = glowCache.get(color);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, Palette.rgba(color, 1));
    gr.addColorStop(0.35, Palette.rgba(color, 0.5));
    gr.addColorStop(1, Palette.rgba(color, 0));
    g.fillStyle = gr;
    g.fillRect(0, 0, 32, 32);
    glowCache.set(color, c);
    return c;
  }

  function drawParticles(ctx, normal, zk) {
    for (const p of parts) {
      if (!p.on || p.normal !== normal) continue;
      iso.toScreen(p.x, p.y, tmp);
      const a = 1 - p.t / p.life;
      const sy = tmp.y - p.z * zk;
      if (p.soft) {
        // a soft puff grows as it fades (smoke, poison clouds)
        const r = p.size * zk * (1.2 + 0.8 * (1 - a));
        ctx.globalAlpha = a * (normal ? 0.55 : 0.8);
        ctx.drawImage(glow(p.color), tmp.x - r, sy - r, r * 2, r * 2);
        continue;
      }
      const sz = p.size * (0.6 + 0.4 * a) * zk;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.fillRect(tmp.x - sz / 2, sy - sz / 2, sz, sz);
    }
  }
  function drawShapes(ctx, blend, zk) {
    for (const s of shapes) {
      if (s.blend === blend && s.t >= s.delay) BD.view.fxShapes.draw(ctx, s, (s.t - s.delay) / s.life, zk);
    }
  }

  function draw(ctx) {
    const v = iso.view, zk = v.Z * v.dpr;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    drawParticles(ctx, true, zk);
    ctx.globalAlpha = 1;
    drawShapes(ctx, 'normal', zk);
    ctx.globalCompositeOperation = 'lighter';
    drawParticles(ctx, false, zk);
    ctx.globalAlpha = 1;
    drawShapes(ctx, 'lighter', zk);
    ctx.restore();
  }

  function collectLights() {
    for (const l of lights) BD.view.lighting.add(l.x, l.y, l.radius, l.color, l.intensity * (1 - l.t / l.life), 0);
  }
  function clear() {
    for (const p of parts) p.on = false;
    live = 0;
    shapes.length = 0;
    lights.length = 0;
  }

  BD.view.fx = { spark, shape, light, play, update, draw, glow, beat, BEAT, collectLights, clear, rnd, get live() { return live; } };
})(globalThis.BD);
