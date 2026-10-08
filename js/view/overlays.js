// @ts-check
// Overlays that must never be hidden: hover tile, path destination, target marker, health bars,
// interact prompts, item labels, Exposed rings (07 §1.2 step 7).
(function (BD) {
  'use strict';

  const iso = BD.view.iso;
  const { WALK } = BD.data.tiles;
  const Grid = BD.core.grid;
  const tmp = { x: 0, y: 0 };

  function diamondPath(ctx, x, y, k) {
    const S = iso.view.S;
    iso.toScreen(x, y, tmp);
    const hw = iso.HW * S * (k || 1), hh = iso.HH * S * (k || 1);
    ctx.beginPath();
    ctx.moveTo(tmp.x, tmp.y - hh);
    ctx.lineTo(tmp.x + hw, tmp.y);
    ctx.lineTo(tmp.x, tmp.y + hh);
    ctx.lineTo(tmp.x - hw, tmp.y);
    ctx.closePath();
  }

  function ring(ctx, x, y, r, col, width, alpha) {
    const S = iso.view.S;
    iso.toScreen(x, y, tmp);
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.strokeStyle = col;
    ctx.lineWidth = width * iso.view.dpr;
    ctx.beginPath();
    ctx.ellipse(tmp.x, tmp.y, r * iso.HW * S, r * iso.HH * S, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function hover(ctx, world) {
    const m = BD.view.host.pointer, f = world.floor;
    if (!m.inside || !m.hoverTile || m.hoverEntity) return;
    const { x, y } = m.hoverTile;
    if (x < 0 || y < 0 || x >= f.w || y >= f.h || !f.explored[Grid.idx(f, x, y)]) return;
    const ok = WALK[f.tiles[Grid.idx(f, x, y)]];
    diamondPath(ctx, x, y, 0.92);
    ctx.lineWidth = iso.view.dpr;
    ctx.strokeStyle = ok ? 'rgba(255,255,255,0.45)' : 'rgba(150,150,150,0.4)';
    ctx.stroke();
    if (!ok) {
      iso.toScreen(x, y, tmp);
      const s = 4 * iso.view.S;
      ctx.beginPath();
      ctx.moveTo(tmp.x - s, tmp.y - s / 2);
      ctx.lineTo(tmp.x + s, tmp.y + s / 2);
      ctx.moveTo(tmp.x + s, tmp.y - s / 2);
      ctx.lineTo(tmp.x - s, tmp.y + s / 2);
      ctx.stroke();
    }
  }

  function pathDest(ctx, world, alpha, t) {
    const p = world.player, it = p.intent;
    if (!it || it.kind !== 'move' || !it.path || !it.path.length) return;
    const [x, y] = it.path[it.path.length - 1];
    const k = 0.5 + 0.15 * Math.sin((t / 600) * Math.PI * 2);   // the attention beat
    diamondPath(ctx, x, y, k);
    ctx.strokeStyle = BD.view.palette.rgba(BD.view.palette.MEANING.friendly, 0.7);
    ctx.lineWidth = iso.view.dpr;
    ctx.stroke();
  }

  // ---------- status glyphs (07 §2.4: one small pixel icon per status, never shared) ----------
  // 5×5 art pixels each. Debuffs sit on a dark tile; buffs on a dark tile framed in "good" green.
  const GLYPHS = {
    burning: ['..#..', '.##..', '.###.', '#####', '.###.'],
    chilled: ['#.#.#', '.###.', '##.##', '.###.', '#.#.#'],
    frozen: ['#####', '#...#', '#.#.#', '#...#', '#####'],
    shocked: ['...##', '..##.', '.####', '.##..', '##...'],
    poisoned: ['..#..', '.###.', '#####', '#####', '.###.'],
    bleeding: ['#####', '#.#.#', '#.#..', '..#..', '..#..'],
    stunned: ['####.', '#..#.', '#.##.', '#....', '#####'],
    feared: ['.###.', '#.#.#', '#####', '.###.', '.#.#.'],
    weakened: ['..#..', '..#..', '#.#.#', '.###.', '..#..'],
    vulnerable: ['.###.', '#...#', '#.#.#', '#...#', '.###.'],
    exposed: ['.....', '.###.', '#.#.#', '.###.', '.....'],
    rooted: ['..#..', '..#..', '.###.', '#.#.#', '#.#.#'],
    slowed: ['..#..', '.#...', '#####', '.#...', '..#..'],
    blinded: ['.....', '.....', '#####', '.#.#.', '.....'],
    taunted: ['.###.', '.###.', '..#..', '.....', '..#..'],
    enraged: ['..#..', '.#.#.', '#...#', '..#..', '.#.#.'],
    hidden: ['..#..', '.###.', '##.##', '#...#', '#...#'],
    hasted: ['#.#..', '.#.#.', '..#.#', '.#.#.', '#.#..'],
    shielded: ['#####', '#...#', '#...#', '.#.#.', '..#..'],
    braced: ['#...#', '#####', '..#..', '..#..', '.###.'],
    knockback_immune: ['..#..', '.###.', '..#..', '#.#.#', '.###.'],
    war_cry: ['#.#.#', '#.#.#', '#.#.#', '.....', '#.#.#'],
    armor_up: ['##.##', '#####', '#####', '.###.', '..#..'],
    ambush_ready: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
    vault_ready: ['..#..', '..#..', '#####', '..#..', '..#..'],
    aegis: ['.###.', '#####', '#.#.#', '#####', '.###.'],
    oath: ['#...#', '##.##', '#####', '.###.', '..#..'],
    shrine_damage: ['#...#', '.#.#.', '#####', '.#.#.', '#...#'],
    shrine_speed: ['##...', '.##..', '..##.', '.##..', '##...'],
    shrine_regen: ['.....', '.#.#.', '#####', '.###.', '..#..'],
    healing: ['..#..', '.###.', '#####', '.###.', '..#..'],
  };
  const glyphCache = new Map();
  /** a 7×7 canvas: backing, buff frame, and the glyph in the status colour */
  function glyphCanvas(id) {
    let c = glyphCache.get(id);
    if (c) return c;
    const Palette = BD.view.palette;
    const sd = BD.data.statuses[id] || {};
    const rows = GLYPHS[id] || ['.....', '.###.', '.#.#.', '.###.', '.....'];
    c = document.createElement('canvas');
    c.width = c.height = 7;
    const g = c.getContext('2d');
    g.fillStyle = Palette.rgba(Palette.MEANING.outline, 0.85);
    g.fillRect(0, 0, 7, 7);
    if (sd.buff) {
      g.strokeStyle = Palette.MEANING.good;
      g.lineWidth = 1;
      g.strokeRect(0.5, 0.5, 6, 6);
    }
    g.fillStyle = Palette.STATUS_COLOR[id] || Palette.MEANING.friendly;
    rows.forEach((row, y) => {
      for (let x = 0; x < 5; x++) if (row[x] === '#') g.fillRect(x + 1, y + 1, 1, 1);
    });
    glyphCache.set(id, c);
    return c;
  }
  /** draw a status glyph with its top-left at (x,y), `px` device px per glyph pixel */
  function statusGlyph(ctx, id, x, y, px) {
    const smooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(glyphCanvas(id), Math.round(x), Math.round(y), 7 * px, 7 * px);
    ctx.imageSmoothingEnabled = smooth;
  }

  // ---------- status on the body (07 §2.4): tints, embers, drips, sparks, circling stars ----------
  // one tint at a time, strongest first: [status, tint colour (STATUS_COLOR), alpha]
  const TINTS = [['frozen', 0.5], ['chilled', 0.3], ['burning', 0.16], ['poisoned', 0.14]];
  // per-second body particles: embers rise off a burning body; poison and blood drip
  const EMBER = { vz: 0.035, g: -0.00004, life: 550, size: 1.6, ambient: true, blend: 'lighter', z0: 0.2 };
  const DRIP = { vz: 0, g: 0.0003, life: 700, size: 1.8, ambient: true, blend: 'normal', z0: 0.35 };
  const BODY_MOTES = [
    { id: 'burning', rate: 6, school: 'fire', mote: EMBER },
    { id: 'poisoned', rate: 3, school: 'poison', mote: DRIP },
    { id: 'bleeding', rate: 3, school: 'blood', mote: DRIP },
  ];
  const bodyState = new Map();   // entity id → { t, acc: {status: n}, spark }

  function has(e, id) {
    for (const st of e.statuses) if (st.id === id) return true;
    return false;
  }
  function bodyTint(e, art, frame, fi, ep, opts) {
    for (const [id, al] of TINTS) {
      if (!has(e, id)) continue;
      const tint = BD.view.palette.STATUS_COLOR[id];
      BD.view.render.drawArt(art, frame, fi, ep.x, ep.y, Object.assign({}, opts, { tint, palKey: 'st_' + id, alpha: al }));
      return;
    }
  }
  function bodyMotes(e, ep, box, st, ms) {
    const zk = iso.view.Z * iso.view.dpr;
    const bodyH = box.h / zk;
    for (const bm of BODY_MOTES) {
      if (!has(e, bm.id)) continue;
      let acc = (st.acc[bm.id] || 0) + (bm.rate * ms) / 1000;
      const pal = BD.view.palette.SCHOOL[bm.school];
      while (acc >= 1) {
        acc -= 1;
        const z = bodyH * (bm.mote.z0 + 0.45 * Math.random());
        const color = Math.random() < 0.6 ? pal.mid : pal.core;
        BD.view.fx.spark(ep.x + (Math.random() - 0.5) * 0.3, ep.y + (Math.random() - 0.5) * 0.3, Object.assign({ z, color }, bm.mote));
      }
      st.acc[bm.id] = acc;
    }
    // shocked: a spark jumps across the body about every 300 ms
    if (!has(e, 'shocked')) return;
    st.spark -= ms;
    if (st.spark > 0) return;
    st.spark = 220 + Math.random() * 160;
    BD.view.fx.shape({
      kind: 'fork', forks: 2, radius: 0.35, life: 110, x: ep.x, y: ep.y, z: bodyH * (0.3 + 0.5 * Math.random()),
      ang: Math.random() * 6.28, pal: BD.view.palette.SCHOOL.storm, k: 1,
    });
  }
  /** stunned: three stars circling over the head */
  function stunStars(ctx, box, t) {
    const zk = iso.view.Z * iso.view.dpr;
    const cx = box.x + box.w / 2, cy = box.y - 2 * zk;
    const s = Math.max(1, Math.round(zk));
    ctx.save();
    ctx.fillStyle = BD.view.palette.STATUS_COLOR.stunned;
    for (let i = 0; i < 3; i++) {
      const a = (t / 600) * Math.PI * 2 + (i * Math.PI * 2) / 3;
      const x = cx + Math.cos(a) * 7 * zk, y = cy + Math.sin(a) * 2.5 * zk;
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(a);
      ctx.fillRect(x - s / 2, y - s * 1.5, s, s * 3);
      ctx.fillRect(x - s * 1.5, y - s / 2, s * 3, s);
    }
    ctx.restore();
  }
  /** render.js calls this after an actor's body is drawn (hooks.actorBody) */
  function statusBody(ctx, e, art, frame, fi, ep, opts, box) {
    if (!e.statuses || !e.statuses.length || e.dead || e.dying) {
      bodyState.delete(e.id);
      return;
    }
    const now = BD.view.render.timeMs;
    let st = bodyState.get(e.id);
    if (!st) {
      st = { t: now, acc: {}, spark: 0 };
      bodyState.set(e.id, st);
    }
    const ms = BD.view.host.paused() ? 0 : Math.min(100, Math.max(0, now - st.t));
    st.t = now;
    bodyTint(e, art, frame, fi, ep, opts);
    if (box) {
      bodyMotes(e, ep, box, st, ms);
      if (has(e, 'stunned')) stunStars(ctx, box, now);
    }
  }
  function clearBody() { bodyState.clear(); }

  BD.view.overlays = { diamondPath, ring, hover, pathDest, statusGlyph, statusBody, clearBody, GLYPHS };
  BD.view.render.hooks.actorBody = BD.view.render.hooks.actorBody || [];
  BD.view.render.hooks.actorBody.push(statusBody);
  BD.view.render.hooks.underActors.push((ctx, world, alpha, t) => { pathDest(ctx, world, alpha, t); });
  BD.view.render.hooks.overlays.push((ctx, world) => hover(ctx, world));
})(globalThis.BD);
