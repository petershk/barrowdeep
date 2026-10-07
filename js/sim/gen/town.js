// @ts-check
// Town of Brennor from its authored map (data/town.js). NPCs are floor objects (they can't be hit).
(function (BD) {
  'use strict';

  const { T } = BD.data.tiles;
  const C = BD.sim.gen.carve;

  function generate(spec) {
    const D = BD.data.town;
    const h = D.map.length, w = D.map[0].length;
    for (const r of D.map) if (r.length !== w) throw new Error('town map row length ' + r.length + ' != ' + w);
    const p = C.newPlan({ n: 0, al: 1, biome: 'town', seed: spec.seed + ':town' }, w, h);
    p.road = new Uint8Array(w * h);
    p.decal = {};
    p.town = { doors: [], buildings: {} };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const ch = D.map[y][x], i = y * w + x;
      let t = T.FLOOR;
      if (ch === '#') t = T.WALL;
      else if ('STHC'.includes(ch)) { t = T.WALL; (p.town.buildings[ch] = p.town.buildings[ch] || []).push([x, y]); }
      else if ('1234'.includes(ch)) { t = T.TOWN_DOOR; p.town.doors.push({ x, y, role: D.doors[ch] }); }
      else if (ch === 'w') t = T.WELL;
      else if (ch === 'W') { t = T.WAYPOINT; p.waypointPos = { x, y }; }
      else if (ch === 'o') { t = T.PORTAL_STONE; p.portalPos = { x, y }; }
      else if (ch === 'E') { t = T.STAIRS_DOWN; if (!p.downPos) p.downPos = { x, y }; }
      else if (ch === '@') p.spawnPos = { x, y };
      else if (ch === 'r') p.road[i] = 1;
      else if (ch === ',') p.decal[i] = 'grave';
      else if (ch === 'g') { t = T.DECOR; p.decor[i] = 'gravestone'; }
      else if (ch === 'b') { t = T.DECOR; p.decor[i] = 'barrel'; }
      else if (ch === 'x') { t = T.DECOR; p.decor[i] = 'crate'; }
      else if (ch === 'q') { t = T.DECOR; p.decor[i] = 'tree'; }
      else if (D.npcs[ch]) p.objects.push({ kind: 'npc', role: D.npcs[ch].role, x, y });
      p.tiles[i] = t;
    }
    // the door tile and its two neighbours on the building's front row form the 3-wide door
    for (const d of p.town.doors) for (const dx of [-1, 1]) {
      const i = d.y * w + d.x + dx;
      if ('STHC'.includes(D.map[d.y][d.x + dx])) p.tiles[i] = T.TOWN_DOOR;
    }
    p.upPos = p.spawnPos;
    p.rooms = [{ x: 1, y: 1, w: w - 2, h: h - 2, cx: w >> 1, cy: h >> 1 }];
    p.reachDist = C.reach(p, [p.spawnPos.x, p.spawnPos.y]);
    return p;
  }

  BD.sim.gen.town = { generate };
})(globalThis.BD);
