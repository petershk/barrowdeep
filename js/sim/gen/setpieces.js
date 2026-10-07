// @ts-check
// Choose, place and stamp set-piece templates.
(function (BD) {
  'use strict';

  const { T } = BD.data.tiles;
  const Carve = BD.sim.gen.carve;

  const MARKERS = 'CBSMETL';
  const PLACE_TRIES = 60;         // random spots tried per set piece
  const MAP_MARGIN = 3;           // set pieces keep this many tiles from the map edge
  const SOLID_MARGIN = 2;         // 'solid' mode: rock this thick around the template

  function candidates(biome, floorN) {
    // no elite markers on the first floor
    const fits = (s) => s.biomes.includes(biome) && s.minFloor <= floorN && !(floorN === 1 && s.rows.join('').includes('E'));
    return BD.data.setpieces.filter(fits);
  }

  /** Stamp a template at (ox,oy). Registers a room and markers. */
  function stamp(p, sp, ox, oy, rng) {
    const fluid = p.biome === 'hell' || p.biome === 'sanctum' ? T.LAVA : T.WATER;
    const kinds = BD.data.decorKinds[p.biome] || ['bones'];
    for (let j = 0; j < sp.h; j++) {
      for (let i = 0; i < sp.w; i++) {
        const ch = sp.rows[j][i], x = ox + i, y = oy + j, k = Carve.idx(p, x, y);
        p.protect[k] = 1;
        let t = T.FLOOR;
        if (ch === '#') t = T.WALL;
        else if (ch === 'P') t = T.PILLAR;
        else if (ch === '~') t = fluid;
        else if (ch === 'd') {
          t = T.DECOR;
          p.decor[k] = rng.pick(kinds);
        } else if (ch === 'H') {
          t = T.WALL;
          p.hidden.push(k);
        }
        else if (MARKERS.includes(ch)) p.markers.push({ ch, x, y, sp: sp.id });
        p.tiles[k] = t;
      }
    }
    // open the tile just outside each border entrance so corridors and tunnels can attach
    for (let j = 0; j < sp.h; j++) for (let i = 0; i < sp.w; i++) {
      if (sp.rows[j][i] !== '.') continue;
      const x = ox + i, y = oy + j;
      if (j === 0) Carve.setFree(p, x, y - 1, T.FLOOR);
      if (j === sp.h - 1) Carve.setFree(p, x, y + 1, T.FLOOR);
      if (i === 0) Carve.setFree(p, x - 1, y, T.FLOOR);
      if (i === sp.w - 1) Carve.setFree(p, x + 1, y, T.FLOOR);
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
      for (let attempt = 0; attempt < PLACE_TRIES; attempt++) {
        const ox = rng.int(MAP_MARGIN, p.w - sp.w - MAP_MARGIN), oy = rng.int(MAP_MARGIN, p.h - sp.h - MAP_MARGIN);
        const ok = mode === 'solid' ? Carve.rectFree(p, ox, oy, sp.w, sp.h, SOLID_MARGIN) : overlayFits(p, sp, ox, oy);
        if (!ok) continue;
        stamp(p, sp, ox, oy, rng);
        placed++;
        break;
      }
    }
    return placed;
  }

  /** 'overlay' mode: no protected tile under or around the template, and over a third of it already floor */
  function overlayFits(p, sp, ox, oy) {
    let floorNear = 0;
    for (let j = oy - 1; j <= oy + sp.h; j++) for (let i = ox - 1; i <= ox + sp.w; i++) {
      const k = Carve.idx(p, i, j);
      if (p.protect[k]) return false;
      if (p.tiles[k] === T.FLOOR) floorNear++;
    }
    return floorNear > (sp.w * sp.h) / 3;
  }

  BD.sim.gen.setpieces = { candidates, stamp, place };
})(globalThis.BD);
