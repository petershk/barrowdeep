// @ts-check
// Malgoth's Sanctum (04 §5.5): an authored level. Entry hall with two guard packs (Warband +
// Coven), then a circular chamber (radius 10) with 4 pillars. The fight starts when the player
// enters the chamber: the way back seals, countdown. 28 wide; taller than 28 to fit the hall.
(function (BD) {
  'use strict';

  const { T } = BD.data.tiles;
  const C = BD.sim.gen.carve;

  function generate(spec, rng) {
    const W = 28, H = 40;
    const p = C.newPlan(spec, W, H);
    const cx = 14, cy = 12, R = 10;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d2 <= (R + 0.5) * (R + 0.5)) C.set(p, x, y, T.FLOOR);
    }
    for (const [dx, dy] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) C.set(p, cx + dx, cy + dy, T.PILLAR);
    // the threshold (sealed when the fight starts) and the entry hall
    C.fillRect(p, cx - 1, cy + R + 1, 3, 2, T.FLOOR);
    C.fillRect(p, cx - 6, cy + R + 3, 13, 12, T.FLOOR);
    for (const [bx, by] of [[cx - 6, cy + R + 3], [cx + 6, cy + R + 3], [cx - 6, cy + R + 14], [cx + 6, cy + R + 14]]) { C.set(p, bx, by, T.DECOR); p.decor[C.idx(p, bx, by)] = 'brazier'; }
    for (const [bx, by] of [[cx - 9, cy], [cx + 9, cy], [cx, cy - 9]]) { C.set(p, bx, by, T.DECOR); p.decor[C.idx(p, bx, by)] = 'brazier'; }
    p.spawnPos = { x: cx, y: cy + R + 13 };
    p.upPos = null;
    p.sanctum = { cx, cy, r: R, door: [[cx - 1, cy + R + 1], [cx, cy + R + 1], [cx + 1, cy + R + 1], [cx - 1, cy + R + 2], [cx, cy + R + 2], [cx + 1, cy + R + 2]] };
    p.arena = { boss: 'malgoth', bossPos: { x: cx, y: cy - 4 }, exitPos: { x: cx, y: cy + 6 }, sanctum: true };
    p.rooms = [{ x: cx - R, y: cy - R, w: 2 * R + 1, h: 2 * R + 1, cx, cy }, { x: cx - 6, y: cy + R + 3, w: 13, h: 12, cx, cy: cy + R + 8 }];
    p.keeperRoom = p.rooms[0];
    p.reachDist = C.reach(p, [p.spawnPos.x, p.spawnPos.y]);
    // guards: a Warband and a Coven in the hall
    const guards = [['hell_knight', -3, 4], ['lesser_demon', -4, 5], ['lesser_demon', -2, 5], ['succubus', 3, 5], ['succubus', 4, 4], ['chaos_spawn', 2, 6], ['chaos_spawn', 4, 6]];
    p.spawns.push({ id: 0, members: guards.slice(0, 3).map(([def, dx, dy]) => ({ def, x: cx + dx, y: cy + R + dy, rank: 'normal' })), kind: 'warband', counted: true });
    p.spawns.push({ id: 1, members: guards.slice(3).map(([def, dx, dy]) => ({ def, x: cx + dx, y: cy + R + dy, rank: 'normal' })), kind: 'coven', counted: true });
    p.spawns.push({ id: 2, members: [{ def: 'malgoth', x: cx, y: cy - 4, rank: 'malgoth', name: 'Malgoth' }], kind: 'boss' });
    void rng;
    return p;
  }

  BD.sim.gen.sanctum = { generate };
})(globalThis.BD);
