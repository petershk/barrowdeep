// @ts-check
// Boss arenas (04 §5): small authored levels entered through the gate. Key 'a' + floor, seed
// run.seed + ':arena:' + n, AL of floor n. The player arrives at the south; the boss waits north.
(function (BD) {
  'use strict';

  const { T } = BD.data.tiles;
  const C = BD.sim.gen.carve;
  const { makeRng } = BD.core.rng;

  const LAYOUTS = {
    crypt: { w: 17, h: 15, build: crypt },
    throne: { w: 19, h: 15, build: throne },
    cavern: { w: 21, h: 17, build: cavern },
    lava_hall: { w: 21, h: 17, build: lavaHall },
  };

  function generate(spec) {
    const fl = BD.data.floors.byN(spec.n);
    const boss = BD.data.bosses[fl.boss];
    const L = LAYOUTS[boss.arena];
    const rng = makeRng(spec.seed + ':arena:' + spec.n);
    const biome = BD.data.biomes[fl.biome];
    const p = C.newPlan({ n: spec.n, al: fl.al, biome: biome.id, seed: spec.seed }, L.w + 4, L.h + 6);
    p.arena = { boss: boss.id };
    const ox = 2, oy = 2;
    C.fillRect(p, ox, oy, L.w, L.h, T.FLOOR);
    // a short entry hall at the south
    const cx = ox + (L.w >> 1);
    C.fillRect(p, cx - 1, oy + L.h, 3, 3, T.FLOOR);
    L.build(p, rng, ox, oy, L.w, L.h);
    p.spawnPos = { x: cx, y: oy + L.h + 1 };
    p.upPos = null;
    p.rooms = [{ x: ox, y: oy, w: L.w, h: L.h, cx, cy: oy + (L.h >> 1) }];
    p.keeperRoom = p.rooms[0];
    p.arena.bossPos = { x: cx, y: oy + 3 };
    p.arena.exitPos = { x: cx, y: oy + L.h - 2 };
    p.reachDist = C.reach(p, [p.spawnPos.x, p.spawnPos.y]);
    p.spawns.push({ id: 0, members: [{ def: boss.id, x: p.arena.bossPos.x, y: p.arena.bossPos.y, rank: 'boss', name: boss.name }], kind: 'boss' });
    if (p.arena.extraSpawns) for (const s of p.arena.extraSpawns) p.spawns.push(s);
    return p;
  }

  function decorRing(p, rng, ox, oy, w, h, kinds, step) {
    for (let x = ox + 1; x < ox + w - 1; x += step) { C.set(p, x, oy, T.DECOR); p.decor[C.idx(p, x, oy)] = rng.pick(kinds); }
    for (let y = oy + 2; y < oy + h - 2; y += step) {
      for (const x of [ox, ox + w - 1]) { C.set(p, x, y, T.DECOR); p.decor[C.idx(p, x, y)] = rng.pick(kinds); }
    }
  }

  function crypt(p, rng, ox, oy, w, h) {
    for (const [px, py] of [[4, 4], [w - 5, 4], [4, h - 5], [w - 5, h - 5]]) C.set(p, ox + px, oy + py, T.PILLAR);
    decorRing(p, rng, ox, oy, w, h, ['coffin', 'coffin', 'candles'], 3);
  }
  function throne(p, rng, ox, oy, w, h) {
    const cx = ox + (w >> 1);
    C.set(p, cx, oy, T.DECOR); p.decor[C.idx(p, cx, oy)] = 'altar';
    for (const [bx, by] of [[3, 3], [w - 4, 3], [3, h - 4], [w - 4, h - 4]]) { C.set(p, ox + bx, oy + by, T.DECOR); p.decor[C.idx(p, ox + bx, oy + by)] = 'brazier'; }
    p.arena.anchors = [[cx, oy + 2], [ox + 3, oy + 4], [ox + w - 4, oy + 4], [ox + 3, oy + h - 5], [ox + w - 4, oy + h - 5]];
    for (const [px, py] of [[6, 6], [w - 7, 6], [6, h - 7], [w - 7, h - 7]]) C.set(p, ox + px, oy + py, T.PILLAR);
  }
  function cavern(p, rng, ox, oy, w, h) {
    const cx = ox + w / 2 - 0.5, cy = oy + h / 2 - 0.5;
    for (let y = oy; y < oy + h; y++) for (let x = ox; x < ox + w; x++) {
      const nx = (x - cx) / (w / 2), ny = (y - cy) / (h / 2);
      if (nx * nx + ny * ny > 1.0 + rng.range(-0.08, 0.05) && !(y >= oy + h - 2 && Math.abs(x - (ox + (w >> 1))) <= 1)) C.set(p, x, y, T.WALL);
    }
    for (const [dx, dy] of [[-7, -4], [7, -4], [-7, 4], [7, 4]]) {
      const x = Math.round(cx + dx), y = Math.round(cy + dy);
      if (C.get(p, x, y) !== T.FLOOR) continue;
      (p.arena.extraSpawns = p.arena.extraSpawns || []).push({ id: 1 + (p.arena.extraSpawns ? p.arena.extraSpawns.length : 0), members: [{ def: 'egg_clutch', x, y, rank: 'normal', hpMult: 1.5, eggSac: true }], kind: 'eggs' });
    }
    p.arena.webs = [];
    for (let i = 0; i < 6; i++) { const x = ox + rng.int(2, w - 3), y = oy + rng.int(2, h - 4); if (C.get(p, x, y) === T.FLOOR) p.arena.webs.push([x, y]); }
  }
  function lavaHall(p, rng, ox, oy, w, h) {
    C.fillRect(p, ox, oy, w, h, T.LAVA);
    const plat = [[ox + (w >> 1) - 4, oy + 1, 9, 6], [ox + 1, oy + h - 8, 7, 6], [ox + w - 8, oy + h - 8, 7, 6]];
    for (const [x, y, pw, ph] of plat) C.fillRect(p, x, y, pw, ph, T.FLOOR);
    const cx = ox + (w >> 1);
    // bridges
    C.fillRect(p, cx - 1, oy + 7, 3, h - 7, T.FLOOR);
    C.fillRect(p, ox + 7, oy + h - 6, w - 14, 2, T.FLOOR);
    for (const [px, py] of [[cx - 3, oy + 2], [cx + 3, oy + 2], [ox + 3, oy + h - 6], [ox + w - 4, oy + h - 6]]) C.set(p, px, py, T.PILLAR);
  }

  BD.sim.gen.arena = { generate, LAYOUTS };
})(globalThis.BD);
