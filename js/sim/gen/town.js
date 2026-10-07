// @ts-check
// Town of Brennor from its authored map (data/town.js). NPCs are floor objects (they can't be hit).
(function (BD) {
  'use strict';

  const { T } = BD.data.tiles;
  const Carve = BD.sim.gen.carve;

  function generate(spec) {
    const TownData = BD.data.town;
    const h = TownData.map.length, w = TownData.map[0].length;
    for (const r of TownData.map) if (r.length !== w) throw new Error('town map row length ' + r.length + ' != ' + w);
    const p = Carve.newPlan({ n: 0, al: 1, biome: 'town', seed: spec.seed + ':town' }, w, h);
    p.road = new Uint8Array(w * h);
    p.decal = {};
    p.town = { doors: [], buildings: {} };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = Carve.idx(p, x, y);
      p.tiles[i] = readTile(p, TownData, TownData.map[y][x], x, y, i);
    }
    // the door tile and its two neighbours on the building's front row form the 3-wide door
    for (const d of p.town.doors) for (const dx of [-1, 1]) {
      const i = Carve.idx(p, d.x + dx, d.y);
      if ('STHC'.includes(TownData.map[d.y][d.x + dx])) p.tiles[i] = T.TOWN_DOOR;
    }
    p.upPos = p.spawnPos;
    p.rooms = [{ x: 1, y: 1, w: w - 2, h: h - 2, cx: w >> 1, cy: h >> 1 }];
    p.reachDist = Carve.reach(p, [p.spawnPos.x, p.spawnPos.y]);
    return p;
  }

  /** map characters that are plain decor tiles */
  const DECOR = { g: 'gravestone', b: 'barrel', x: 'crate', q: 'tree' };

  /** the tile for one map character at (x, y); records doors, landmarks, decor and NPCs on the plan */
  function readTile(p, TownData, ch, x, y, i) {
    if (ch === '#') return T.WALL;
    if ('STHC'.includes(ch)) {
      (p.town.buildings[ch] = p.town.buildings[ch] || []).push([x, y]);
      return T.WALL;
    }
    if ('1234'.includes(ch)) {
      p.town.doors.push({ x, y, role: TownData.doors[ch] });
      return T.TOWN_DOOR;
    }
    if (ch === 'w') return T.WELL;
    if (ch === 'W') {
      p.waypointPos = { x, y };
      return T.WAYPOINT;
    }
    if (ch === 'o') {
      p.portalPos = { x, y };
      return T.PORTAL_STONE;
    }
    if (ch === 'E') {
      if (!p.downPos) p.downPos = { x, y };
      return T.STAIRS_DOWN;
    }
    if (ch === '@') p.spawnPos = { x, y };
    else if (ch === 'r') p.road[i] = 1;
    else if (ch === ',') p.decal[i] = 'grave';
    else if (Object.prototype.hasOwnProperty.call(DECOR, ch)) {
      p.decor[i] = DECOR[ch];
      return T.DECOR;
    } else if (TownData.npcs[ch]) p.objects.push({ kind: 'npc', role: TownData.npcs[ch].role, x, y });
    return T.FLOOR;
  }

  BD.sim.gen.town = { generate };
})(globalThis.BD);
