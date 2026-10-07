// @ts-check
// Symmetric recursive shadowcasting (A. Ford). Marks floor.visible / explored / seen.
(function (BD) {
  'use strict';

  const { SEE } = BD.data.tiles;

  const QUAD = [
    (ox, oy, r, c) => [ox + c, oy - r], // north
    (ox, oy, r, c) => [ox + r, oy + c], // east
    (ox, oy, r, c) => [ox + c, oy + r], // south
    (ox, oy, r, c) => [ox - r, oy + c], // west
  ];

  /**
   * @param {number} w @param {number} h
   * @param {(x:number,y:number)=>boolean} blocks
   * @param {(x:number,y:number)=>void} mark
   */
  function shadowcast(w, h, ox, oy, radius, blocks, mark) {
    mark(ox, oy);
    const r2 = (radius + 0.5) * (radius + 0.5);
    const inR = (x, y) => (x - ox) * (x - ox) + (y - oy) * (y - oy) <= r2;
    for (let q = 0; q < 4; q++) {
      const tf = QUAD[q];
      const isWall = (r, c) => { const [x, y] = tf(ox, oy, r, c); return x < 0 || y < 0 || x >= w || y >= h || blocks(x, y); };
      const reveal = (r, c) => { const [x, y] = tf(ox, oy, r, c); if (x >= 0 && y >= 0 && x < w && y < h && inR(x, y)) mark(x, y); };
      const scan = (depth, start, end) => {
        if (depth > radius) return;
        let prevWall = null;
        const minC = Math.floor(depth * start + 0.5), maxC = Math.ceil(depth * end - 0.5);
        for (let c = minC; c <= maxC; c++) {
          const wall = isWall(depth, c);
          const sym = c >= depth * start && c <= depth * end;
          if (wall || sym) reveal(depth, c);
          if (prevWall === true && !wall) start = (2 * c - 1) / (2 * depth);
          if (prevWall === false && wall) scan(depth + 1, start, (2 * c - 1) / (2 * depth));
          prevWall = wall;
        }
        if (prevWall === false) scan(depth + 1, start, end);
      };
      scan(1, -1, 1);
    }
  }

  /** Recompute the floor's visibility from the player. */
  function refresh(world) {
    const f = world.floor, p = world.player;
    if (!f || !p) return;
    const radius = Math.round(BD.sim.stats ? BD.sim.stats.statsOf(world, p).light_radius : 6) + (f.extraLight || 0);
    f.visible.fill(0);
    const tiles = f.tiles, w = f.w;
    shadowcast(f.w, f.h, p.x, p.y, f.biome === 'town' ? 30 : radius, (x, y) => !SEE[tiles[y * w + x]],(x, y) => {
      const i = y * w + x;
      f.visible[i] = 1;
      if (!f.explored[i]) { f.explored[i] = 1; f.exploreDirty = true; }
      if (!f.seen[i]) { f.seen[i] = 1; f.seenCount++; }
    });
    f.fovVersion = (f.fovVersion || 0) + 1;
    f.fovRadius = radius;
  }

  BD.sim.fov = { shadowcast, refresh };
})(globalThis.BD);
