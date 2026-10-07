// @ts-check
// Traps and the floor event (04 §4, §6), placed after packs. Traps go in rooms or on set-piece T
// markers — never in corridors 2 or less wide, never within 6 tiles of the stairs.
(function (BD) {
  'use strict';

  const { T } = BD.data.tiles;
  const Carve = BD.sim.gen.carve;
  const { cheb } = BD.core.util;

  function corridorish(p, x, y) {
    // a tile is in a narrow corridor if both perpendicular sides are blocked within 1 tile
    const wk = (a, b) => BD.data.tiles.WALK[Carve.get(p, a, b)] === 1;
    const horiz = (!wk(x, y - 1) || !wk(x, y + 1))
      && ((!wk(x, y - 1) && !wk(x, y + 1)) || (!wk(x, y - 2) && !wk(x, y + 1)) || (!wk(x, y - 1) && !wk(x, y + 2)));
    const vert = (!wk(x - 1, y) || !wk(x + 1, y))
      && ((!wk(x - 1, y) && !wk(x + 1, y)) || (!wk(x - 2, y) && !wk(x + 1, y)) || (!wk(x - 1, y) && !wk(x + 2, y)));
    return horiz || vert;
  }

  function run(p, rng, fl, spec, taken) {
    const dist = p.reachDist;
    const far = (x, y) => cheb(x, y, p.upPos.x, p.upPos.y) > 6 && (!p.downPos || cheb(x, y, p.downPos.x, p.downPos.y) > 6);
    const kinds = Object.keys(BD.data.traps);
    // set-piece T markers became trap objects in populate; give them a kind
    for (const o of p.objects) if (o.kind === 'trap' && !o.trap) o.trap = rng.pick(kinds);
    // 2–5 more traps in rooms (from floor 2)
    if (fl.n >= 2) {
      const cands = [];
      for (const r of p.rooms) {
        if (r === p.upRoom || r.setpiece) continue;
        for (const [x, y] of Carve.roomTiles(p, r)) {
          const i = y * p.w + x;
          if (p.tiles[i] === T.FLOOR && dist[i] >= 0 && !taken.has(i) && far(x, y) && !corridorish(p, x, y)) cands.push([x, y]);
        }
      }
      rng.shuffle(cands);
      const n = rng.int(2, 5);
      for (let k = 0; k < n && k < cands.length; k++) {
        const [x, y] = cands[k];
        taken.add(y * p.w + x);
        const trap = rng.pick(kinds);
        const o = { kind: 'trap', trap, x, y };
        if (trap === 'dart') {
          // the emitter faces along a row or column; darts fly along the line
          const horiz = rng.chance(0.5);
          o.dx = horiz ? 1 : 0; o.dy = horiz ? 0 : 1;
        }
        p.objects.push(o);
      }
    }
    // the floor event (~70% of floors)
    if (rng.chance(BD.data.eventChance)) {
      const ev = rng.weighted(Object.entries(BD.data.floorEvents), ([, e]) => e.weight)[0];
      placeEvent(p, rng, fl, ev, taken, far);
    }
  }

  function placeEvent(p, rng, fl, id, taken, far) {
    const dist = p.reachDist;
    const rooms = rng.shuffle(p.rooms.filter((r) => r !== p.upRoom && r !== p.keeperRoom && !r.setpiece));
    const room = rooms[0];
    if (!room) return;
    const spots = Carve.roomTiles(p, room).filter(([x, y]) => {
      const i = y * p.w + x;
      return p.tiles[i] === T.FLOOR && dist[i] >= 0 && !taken.has(i) && far(x, y);
    });
    if (!spots.length) return;
    const centre = spots.sort((a, b) => cheb(a[0], a[1], room.cx, room.cy) - cheb(b[0], b[1], room.cx, room.cy))[0];
    taken.add(centre[1] * p.w + centre[0]);
    p.event = { id, state: 'idle', x: centre[0], y: centre[1], room: { x: room.x, y: room.y, w: room.w, h: room.h } };
    if (id === 'cursed_chest') p.objects.push({ kind: 'chest', cursed: true, x: centre[0], y: centre[1] });
    else if (id === 'shrine') p.objects.push({ kind: 'shrine', x: centre[0], y: centre[1], event: true });
    else if (id === 'blood_altar') p.objects.push({ kind: 'altar', x: centre[0], y: centre[1] });
    else if (id === 'trapped_vault') {
      p.objects.push({ kind: 'chest', vault: true, x: centre[0], y: centre[1] });
      const ring = spots.filter(([x, y]) => cheb(x, y, centre[0], centre[1]) === 2 || cheb(x, y, centre[0], centre[1]) === 1).slice(0, 5);
      for (const [x, y] of ring) {
        taken.add(y * p.w + x);
        p.objects.push({ kind: 'trap', trap: rng.pick(['spike', 'fire_vent', 'gas']), x, y, visible: true });
      }
    } else if (id === 'hoarder') {
      const hoarder = { def: 'hoarder', x: centre[0], y: centre[1], rank: 'unique', name: 'The Hoarder', eventId: 'hoarder' };
      p.spawns.push({ id: 900, members: [hoarder], kind: 'event' });
    } else if (id === 'restless_dead') {
      const graves = spots.filter(([x, y]) => cheb(x, y, centre[0], centre[1]) <= 2);
      p.event.tiles = graves;
      p.decal = p.decal || {};
      for (const [x, y] of graves) p.decal[y * p.w + x] = 'grave';
    }
  }

  BD.sim.gen.objects = { run };
})(globalThis.BD);
