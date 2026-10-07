'use strict';
const { loadBD } = require('../harness');

module.exports = (T) => {
  const BD = loadBD();
  const { makeRng } = BD.core.rng;
  const G = BD.core.grid;
  const U = BD.core.util;

  T.test('rng streams reproducible and independent', () => {
    const a = makeRng('abc'), b = makeRng('abc'), c = makeRng('abd');
    const sa = [], sb = [], sc = [];
    for (let i = 0; i < 50; i++) { sa.push(a.next()); sb.push(b.next()); sc.push(c.next()); }
    T.deepEq(sa, sb);
    T.ok(JSON.stringify(sa) !== JSON.stringify(sc));
    T.ok(sa.every((v) => v >= 0 && v < 1));
  });
  T.test('rng state save/restore', () => {
    const a = makeRng(42); a.next(); a.next();
    const st = a.state(); const x = a.next();
    const b = makeRng(1); b.setState(st);
    T.eq(b.next(), x);
  });
  T.test('rng int range inclusive', () => {
    const r = makeRng(7); const seen = new Set();
    for (let i = 0; i < 2000; i++) seen.add(r.int(1, 6));
    T.deepEq([...seen].sort(), [1, 2, 3, 4, 5, 6]);
  });
  T.test('shapes', () => {
    T.eq(G.shapeOffsets('circle', 1).length, 9);
    T.eq(G.shapeOffsets('circle', 2).length, 21);
    T.eq(G.shapeOffsets('cross', 1).length, 5);
    T.eq(G.shapeOffsets('diamond', 1).length, 5);
    T.eq(G.shapeOffsets('square', 1).length, 9);
    T.eq(G.shapeOffsets('ring', 1).length, 8);
    T.eq(G.shapeTiles({ shape: 'arc3' }, 5, 5, null, 0).length, 3);
    T.eq(G.rayTiles(0, 0, 1, 0, 4).length, 4);
    const cone = G.shapeTiles({ shape: 'cone', length: 3, angle: 90 }, 0, 0, { x: 1, y: 0 }, 0);
    T.ok(cone.every(([x]) => x > 0));
  });
  T.test('bfs and astar avoid corner cutting', () => {
    const w = 5, h = 5;
    // wall at (1,0) and (0,1): (0,0)->(1,1) diagonal must not be allowed
    const walls = new Set(['1,0', '0,1']);
    const walk = (x, y) => x >= 0 && y >= 0 && x < w && y < h && !walls.has(x + ',' + y);
    const d = G.bfs(w, h, [[0, 0]], walk);
    T.eq(d[1 * w + 1], -1);
    const p = G.astar(w, h, 4, 4, 0, 4, walk);
    T.eq(p.length, 4);
    T.deepEq(p[p.length - 1], [0, 4]);
  });
  T.test('los blocked by wall', () => {
    const clear = (x, y) => !(x === 2 && y === 0);
    T.ok(!G.los(0, 0, 4, 0, clear));
    T.ok(G.los(0, 1, 4, 1, clear));
  });
  T.test('rle roundtrip', () => {
    const r = makeRng(3); const a = new Uint8Array(2000);
    for (let i = 0; i < a.length; i++) a[i] = r.chance(0.2) ? 1 : 0;
    const back = U.rleDecode(U.rleEncode(a), a.length);
    T.deepEq(Array.from(back), Array.from(a));
  });
  T.test('scheduler orders by time', () => {
    const S = BD.core.scheduler; const log = [];
    S.register('t_a', (w, p) => log.push(p));
    const world = { time: 0, scheduled: [] };
    S.schedule(world, 30, 't_a', 3); S.schedule(world, 10, 't_a', 1); S.schedule(world, 20, 't_a', 2);
    world.time = 25; S.runDue(world);
    T.deepEq(log, [1, 2]);
  });
};
