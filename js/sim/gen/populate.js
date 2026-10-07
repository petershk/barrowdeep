// @ts-check
// Populate a floor plan: monster budget of packs (05 §7), champion packs, unique elites, the Keeper,
// set-piece markers (chests, piles, shrines, traps), floor event. Samples reachable tiles only.
(function (BD) {
  'use strict';

  const { T } = BD.data.tiles;
  const C = BD.sim.gen.carve;
  const B = BD.data.balance;
  const { cheb } = BD.core.util;

  function eliteName(rng) {
    const N = BD.data.eliteNames;
    return rng.pick(N.FIRST) + rng.pick(N.SECOND) + ' ' + rng.pick(N.TITLE);
  }

  function modPool(spec) {
    const lore = !!(spec.unlocks && spec.unlocks.champion_lore);
    return Object.keys(BD.data.championMods).filter((k) => lore || !BD.data.championMods[k].lore);
  }
  function rollMods(rng, spec, n) {
    const pool = rng.shuffle(modPool(spec).slice());
    return pool.slice(0, n);
  }
  function eliteModCount(spec) {
    const d = BD.data.difficulties[spec.difficulty || 'penitent'];
    return Math.max(d.eliteMods, (spec.ascension || 0) >= 1 ? 2 : 1);
  }

  /** free reachable tiles around an anchor (BFS), avoiding taken tiles */
  function cluster(p, dist, taken, ax, ay, n, maxR) {
    const out = [];
    const seen = new Set([ay * p.w + ax]);
    let frontier = [[ax, ay]];
    for (let r = 0; r <= (maxR || 4) && out.length < n; r++) {
      const next = [];
      for (const [x, y] of frontier) {
        const i = y * p.w + x;
        if (out.length < n && p.tiles[i] === T.FLOOR && dist[i] >= 0 && !taken.has(i)) { out.push([x, y]); taken.add(i); }
        for (const [dx, dy] of BD.core.util.DIRS) {
          const nx = x + dx, ny = y + dy, k = ny * p.w + nx;
          if (nx < 0 || ny < 0 || nx >= p.w || ny >= p.h || seen.has(k)) continue;
          seen.add(k);
          if (BD.data.tiles.WALK[p.tiles[k]]) next.push([nx, ny]);
        }
      }
      frontier = next;
    }
    return out;
  }

  function packDefsFor(act, inAct, rng, floorN) {
    const packs = Object.entries(BD.data.packs).filter(([, pk]) => pk.act === act);
    const [id, pk] = rng.weighted(packs, ([, q]) => q.weight[inAct]);
    const members = [];
    const list = floorN === 1 && pk.floor1 ? pk.floor1 : pk.members;
    for (const m of list) { const n = rng.int(m.n[0], m.n[1]); for (let i = 0; i < n; i++) members.push(m.def); }
    return { id, pk, members };
  }
  function actSpecies(act) {
    return Object.values(BD.data.monsters).filter((m) => m.act === act && !m.spawner && !m.spawnOnly && m.role !== 'bomber');
  }

  function run(p, rng, fl, spec) {
    const dist = p.reachDist;
    const act = fl.act;
    const inAct = (fl.n - 1) % 3;
    const taken = new Set();
    const up = p.upPos;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) taken.add((up.y + dy) * p.w + up.x + dx);
    if (p.spawnPos) taken.add(p.spawnPos.y * p.w + p.spawnPos.x);
    const keeperTiles = new Set(C.roomTiles(p, p.keeperRoom).map(([x, y]) => y * p.w + x));
    const floorList = rng.shuffle(C.reachableFloor(p, dist).filter(([x, y]) => cheb(x, y, up.x, up.y) >= 10 && !keeperTiles.has(y * p.w + x)));
    let packId = 0;
    const addPack = (members, o) => {
      const id = packId++;
      p.spawns.push(Object.assign({ id, members, counted: false }, o));
      return id;
    };
    // ---- Keeper ----
    if (fl.keeper) {
      const kt = C.roomTiles(p, p.keeperRoom).filter(([x, y]) => p.tiles[y * p.w + x] === T.FLOOR && dist[y * p.w + x] >= 0);
      const kc = kt.sort((a, b) => cheb(a[0], a[1], p.keeperRoom.cx, p.keeperRoom.cy) - cheb(b[0], b[1], p.keeperRoom.cx, p.keeperRoom.cy))[0];
      const species = rng.pick(actSpecies(act).filter((m) => m.role === 'brute' || m.role === 'tank' || m.role === 'skirmisher'));
      const minionSp = rng.pick(actSpecies(act));
      const nMin = rng.int(2, 4);
      const spots = cluster(p, dist, taken, kc[0], kc[1], 1 + nMin, 5);
      const sigs = rng.shuffle(['quake', 'grasp', 'bone_hurl', 'charge_line', 'rally']);
      const nSig = Math.max(BD.data.difficulties[spec.difficulty || 'penitent'].keeperMoves, (spec.ascension || 0) >= 3 ? 2 : 1);
      const members = spots.map(([x, y], i) => i === 0
        ? { def: species.id, x, y, rank: 'keeper', keeper: true, name: eliteName(rng), mods: rollMods(rng, spec, eliteModCount(spec)), signature: sigs.slice(0, nSig), carries: fl.actEnd ? 'key' : 'seal' }
        : { def: minionSp.id, x, y, rank: 'minion' });
      addPack(members, { kind: 'keeper' });
    }
    // ---- normal packs up to the budget ----
    const diff = BD.data.difficulties[spec.difficulty || 'penitent'];
    let budget = Math.round(BD.core.util.lerp(B.gen.budgetMin, B.gen.budgetMax, (fl.n - 1) / 11) * diff.spawn * ((spec.ascension || 0) >= 6 ? 1.25 : 1));
    // set-piece monster spots get packs first
    const mSpots = p.markers.filter((m) => m.ch === 'M');
    const anchors = [];
    for (let i = 0; i < mSpots.length; i += 2) anchors.push([mSpots[i].x, mSpots[i].y]);
    let fi = 0;
    const nextAnchor = () => {
      while (anchors.length) { const a = anchors.shift(); if (!taken.has(a[1] * p.w + a[0]) && dist[a[1] * p.w + a[0]] >= 0) return a; }
      while (fi < floorList.length) {
        const a = floorList[fi++];
        if (taken.has(a[1] * p.w + a[0])) continue;
        // spread packs: keep anchors ≥ 7 tiles from other packs
        let ok = true;
        for (const pk of p.spawns) { const m = pk.members[0]; if (cheb(m.x, m.y, a[0], a[1]) < 7) { ok = false; break; } }
        if (ok) return a;
      }
      return null;
    };
    const champCount = fl.n === 1 ? 0 : fl.n <= 3 ? 1 : rng.int(1, 2);
    let champsLeft = champCount;
    let guard = 0;
    while (budget > 0 && guard++ < 60) {
      const a = nextAnchor();
      if (!a) break;
      if (champsLeft > 0 && (budget < 20 || rng.chance(0.4))) {
        champsLeft--;
        const sp = rng.pick(actSpecies(act).filter((m) => m.role !== 'spawner'));
        const n = rng.int(3, 4);
        const spots = cluster(p, dist, taken, a[0], a[1], n, 3);
        const mods = rollMods(rng, spec, Math.max(1, eliteModCount(spec) - 1 + ((spec.ascension || 0) >= 1 ? 1 : 0)));
        addPack(spots.map(([x, y]) => ({ def: sp.id, x, y, rank: 'champion', mods })), { kind: 'champion', counted: true });
        budget -= spots.length;
        continue;
      }
      const { id, pk, members } = packDefsFor(act, inAct, rng, fl.n);
      const spots = cluster(p, dist, taken, a[0], a[1], members.length, pk.spread ? 6 : 3);
      addPack(spots.map(([x, y], i) => ({ def: members[i], x, y, rank: 'normal' })), { kind: id, counted: true, leader: pk.leader || null });
      budget -= spots.length;
      if (pk.corpses) for (let i = 0; i < pk.corpses; i++) { const t = cluster(p, dist, new Set(taken), a[0], a[1], 1, 4)[0]; if (t) p.objects.push({ kind: 'corpse_prop', x: t[0], y: t[1], def: 'skeleton' }); }
    }
    // ---- unique elites (floors 3+: 0–1 besides the Keeper) ----
    const elites = fl.n >= 3 ? rng.int(0, 1) : 0;
    const eSpots = p.markers.filter((m) => m.ch === 'E');
    for (let k = 0; k < elites; k++) {
      const a = eSpots.length ? [eSpots[0].x, eSpots[0].y] : nextAnchor();
      if (!a) break;
      const sp = rng.pick(actSpecies(act).filter((m) => m.role === 'brute' || m.role === 'tank' || m.role === 'skirmisher' || m.role === 'caster'));
      const minSp = rng.pick(actSpecies(act));
      const spots = cluster(p, dist, taken, a[0], a[1], 1 + rng.int(2, 4), 4);
      addPack(spots.map(([x, y], i) => (i === 0 ? { def: sp.id, x, y, rank: 'unique', name: eliteName(rng), mods: rollMods(rng, spec, eliteModCount(spec)) } : { def: minSp.id, x, y, rank: 'minion' })), { kind: 'unique' });
    }
    // ---- set-piece objects ----
    for (const m of p.markers) {
      const kind = { C: 'chest', B: 'pile', S: 'shrine', T: 'trap', L: 'lever' }[m.ch];
      if (kind) p.objects.push({ kind, x: m.x, y: m.y, sp: m.sp });
    }
    // a few chests and loot piles in rooms (not on packs, not near the stairs)
    const roomTiles = new Set();
    for (const r of p.rooms) if (!r.setpiece && r !== p.upRoom) for (const [x, y] of C.roomTiles(p, r)) roomTiles.add(y * p.w + x);
    const free = floorList.filter(([x, y]) => roomTiles.has(y * p.w + x) && !taken.has(y * p.w + x));
    const nChest = rng.int(1, 3), nPile = rng.int(1, 2);
    for (let i = 0; i < nChest + nPile && i < free.length; i++) {
      const [x, y] = free[(i * 7919) % free.length];
      if (taken.has(y * p.w + x)) continue;
      taken.add(y * p.w + x);
      p.objects.push({ kind: i < nChest ? 'chest' : 'pile', x, y });
    }
    if (BD.sim.gen.objects) BD.sim.gen.objects.run(p, rng, fl, spec, taken);
    p.budget = budget;
  }

  BD.sim.gen.populate = { run, eliteName, cluster };
})(globalThis.BD);
