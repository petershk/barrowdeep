// @ts-check
// Choose, place and stamp set-piece templates.
(function (BD) {
  'use strict';

  const { T } = BD.data.tiles;
  const C = BD.sim.gen.carve;

  const MARKERS = 'CBSMETL';

  function candidates(biome, floorN) {
    return BD.data.setpieces.filter((s) => s.biomes.includes(biome) && s.minFloor <= floorN && !(floorN === 1 && s.rows.join('').includes('E')));
  }

  /** Stamp a template at (ox,oy). Registers a room and markers. */
  function stamp(p, sp, ox, oy, rng) {
    const fluid = p.biome === 'hell' || p.biome === 'sanctum' ? T.LAVA : T.WATER;
    const kinds = BD.data.decorKinds[p.biome] || ['bones'];
    for (let j = 0; j < sp.h; j++) {
      for (let i = 0; i < sp.w; i++) {
        const ch = sp.rows[j][i], x = ox + i, y = oy + j, k = C.idx(p, x, y);
        p.protect[k] = 1;
        let t = T.FLOOR;
        if (ch === '#') t = T.WALL;
        else if (ch === 'P') t = T.PILLAR;
        else if (ch === '~') t = fluid;
        else if (ch === 'd') { t = T.DECOR; p.decor[k] = rng.pick(kinds); }
        else if (ch === 'H') { t = T.WALL; p.hidden.push(k); }
        else if (MARKERS.includes(ch)) p.markers.push({ ch, x, y, sp: sp.id });
        p.tiles[k] = t;
      }
    }
    // open the tile just outside each border entrance so corridors and tunnels can attach
    for (let j = 0; j < sp.h; j++) for (let i = 0; i < sp.w; i++) {
      if (sp.rows[j][i] !== '.') continue;
      const x = ox + i, y = oy + j;
      if (j === 0) C.setFree(p, x, y - 1, T.FLOOR);
      if (j === sp.h - 1) C.setFree(p, x, y + 1, T.FLOOR);
      if (i === 0) C.setFree(p, x - 1, y, T.FLOOR);
      if (i === sp.w - 1) C.setFree(p, x + 1, y, T.FLOOR);
    }
    const room = { x: ox, y: oy, w: sp.w, h: sp.h, cx: ox + (sp.w >> 1), cy: oy + (sp.h >> 1), setpiece: sp.id };
    p.rooms.push(room);
    p.setpieces.push(sp.id);
    return room;
  }

  /**
   * Place `count` set pieces. mode 'solid' needs untouched rock (room layouts, before carving);
   * mode 'overlay' stamps over an existing layout (organic layouts), avoiding protected tiles.
   */
  function place(p, rng, count, mode) {
    const list = rng.shuffle(candidates(p.biome, p.n).slice());
    let placed = 0;
    for (const sp of list) {
      if (placed >= count) break;
      for (let attempt = 0; attempt < 60; attempt++) {
        const ox = rng.int(3, p.w - sp.w - 3), oy = rng.int(3, p.h - sp.h - 3);
        let ok = true;
        if (mode === 'solid') ok = C.rectFree(p, ox, oy, sp.w, sp.h, 2);
        else {
          let floorNear = 0;
          for (let j = oy - 1; j <= oy + sp.h && ok; j++) for (let i = ox - 1; i <= ox + sp.w; i++) {
            const k = C.idx(p, i, j);
            if (p.protect[k]) { ok = false; break; }
            if (p.tiles[k] === T.FLOOR) floorNear++;
          }
          ok = ok && floorNear > (sp.w * sp.h) / 3;
        }
        if (!ok) continue;
        stamp(p, sp, ox, oy, rng);
        placed++;
        break;
      }
    }
    return placed;
  }

  BD.sim.gen.setpieces = { candidates, stamp, place };
})(globalThis.BD);
