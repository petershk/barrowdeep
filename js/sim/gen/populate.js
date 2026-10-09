// @ts-check
// Populate a floor plan: monster budget of packs (05 §7), champion packs, unique elites, the Keeper,
// set-piece markers (chests, piles, shrines, traps), floor event. Samples reachable tiles only.
(function (BD) {
  'use strict';

  const { T } = BD.data.tiles;
  const Carve = BD.sim.gen.carve;
  const Balance = BD.data.balance;
  const GenBalance = Balance.gen;
  const Ascension = BD.data.ascension;
  const { cheb } = BD.core.util;
  const idx = Carve.idx;

  const START_CLEAR_R = 2;            // no monsters in the 5×5 block around the up stairs
  const CLUSTER_R = 4;                // default search radius for a pack's tiles
  const KEEPER_CLUSTER_R = 5;
  const KEEPER_SIGNATURES = ['quake', 'grasp', 'bone_hurl', 'charge_line', 'rally'];
  const BUDGET_RAMP_FLOORS = 11;      // the budget ramps from budgetMin on floor 1 to budgetMax on floor 12
  const SPACING_STEP = 2;            // pack spacing relaxes in these steps (Balance.gen.packSpacing → minPackSpacing)
  const MAX_PACKS = 60;               // guard on the pack loop
  const PACK_R = 3;                   // pack tiles within this radius of the anchor
  const SPREAD_PACK_R = 6;            // ... or this for packs marked `spread`
  const LOOT_STRIDE = 7919;           // a prime stride spreads chests and piles over the free tiles

  const MARKER_OBJECTS = { C: 'chest', B: 'pile', S: 'shrine', T: 'trap', L: 'lever' };

  function eliteName(rng) {
    const EliteNames = BD.data.eliteNames;
    return rng.pick(EliteNames.FIRST) + rng.pick(EliteNames.SECOND) + ' ' + rng.pick(EliteNames.TITLE);
  }

  function modPool(spec) {
    const lore = !!(spec.unlocks && spec.unlocks.champion_lore);
    const early = (k) => typeof spec.n === 'number' && BD.data.championMods[k].minFloor > spec.n;
    return Object.keys(BD.data.championMods).filter((k) => (lore || !BD.data.championMods[k].lore) && !early(k));
  }
  function rollMods(rng, spec, n) {
    const pool = rng.shuffle(modPool(spec).slice());
    return pool.slice(0, n);
  }
  function eliteModCount(spec) {
    const d = BD.data.difficulties[spec.difficulty || 'penitent'];
    return Math.max(d.eliteMods, (spec.ascension || 0) >= Ascension.elite_mods.level ? Ascension.elite_mods.minMods : 1);
  }

  /** free reachable tiles around an anchor (BFS), avoiding taken tiles */
  function cluster(p, dist, taken, ax, ay, n, maxR) {
    const out = [];
    const seen = new Set([idx(p, ax, ay)]);
    let frontier = [[ax, ay]];
    for (let r = 0; r <= (maxR || CLUSTER_R) && out.length < n; r++) {
      const next = [];
      for (const [x, y] of frontier) {
        const i = idx(p, x, y);
        if (out.length < n && p.tiles[i] === T.FLOOR && dist[i] >= 0 && !taken.has(i)) {
          out.push([x, y]);
          taken.add(i);
        }
        for (const [dx, dy] of BD.core.util.DIRS) {
          const nx = x + dx, ny = y + dy, k = idx(p, nx, ny);
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
    for (const m of list) {
      const n = rng.int(m.n[0], m.n[1]);
      for (let i = 0; i < n; i++) members.push(m.def);
    }
    return { id, pk, members };
  }
  function actSpecies(act) {
    return Object.values(BD.data.monsters).filter((m) => m.act === act && !m.spawner && !m.spawnOnly && m.role !== 'bomber');
  }

  /**
   * Shared state for one populate run: reachable distances, taken tiles, the shuffled list of
   * candidate floor tiles away from the start, and addPack().
   */
  function startContext(p, rng, fl) {
    const dist = p.reachDist;
    const taken = new Set();
    const up = p.upPos;
    for (let dy = -START_CLEAR_R; dy <= START_CLEAR_R; dy++) {
      for (let dx = -START_CLEAR_R; dx <= START_CLEAR_R; dx++) taken.add(idx(p, up.x + dx, up.y + dy));
    }
    if (p.spawnPos) taken.add(idx(p, p.spawnPos.x, p.spawnPos.y));
    const keeperTiles = new Set(Carve.roomTiles(p, p.keeperRoom).map(([x, y]) => idx(p, x, y)));
    const awayFromStart = ([x, y]) => cheb(x, y, up.x, up.y) >= GenBalance.minStartDist && !keeperTiles.has(idx(p, x, y));
    const floorList = rng.shuffle(Carve.reachableFloor(p, dist).filter(awayFromStart));
    let packId = 0;
    const addPack = (members, o) => {
      const id = packId++;
      p.spawns.push(Object.assign({ id, members, counted: false }, o));
      return id;
    };
    return { dist, act: fl.act, inAct: (fl.n - 1) % 3, taken, floorList, addPack };
  }

  /** the Keeper and its minions, gathered around the centre of the keeper room */
  function placeKeeper(ctx, p, rng, fl, spec) {
    const { dist, act, taken } = ctx;
    const kt = Carve.roomTiles(p, p.keeperRoom).filter(([x, y]) => p.tiles[idx(p, x, y)] === T.FLOOR && dist[idx(p, x, y)] >= 0);
    const fromCentre = (t) => cheb(t[0], t[1], p.keeperRoom.cx, p.keeperRoom.cy);
    const kc = kt.sort((a, b) => fromCentre(a) - fromCentre(b))[0];
    const species = rng.pick(actSpecies(act).filter((m) => m.role === 'brute' || m.role === 'tank' || m.role === 'skirmisher'));
    const minionSp = rng.pick(actSpecies(act));
    const nMin = rng.int(GenBalance.keeperMinions[0], GenBalance.keeperMinions[1]);
    const spots = cluster(p, dist, taken, kc[0], kc[1], 1 + nMin, KEEPER_CLUSTER_R);
    // rally (a buff, no telegraph) is never a Keeper's only signature: the first is always an attack to read and dodge
    const attacks = rng.shuffle(KEEPER_SIGNATURES.filter((s) => s !== 'rally'));
    const sigs = [attacks[0]].concat(rng.shuffle(attacks.slice(1).concat(['rally'])));
    const minMoves = (spec.ascension || 0) >= Ascension.keeper_moves.level ? Ascension.keeper_moves.minMoves : 1;
    const nSig = Math.max(BD.data.difficulties[spec.difficulty || 'penitent'].keeperMoves, minMoves);
    const members = spots.map(([x, y], i) => i === 0
      ? {
        def: species.id, x, y, rank: 'keeper', keeper: true,
        name: eliteName(rng), mods: rollMods(rng, spec, eliteModCount(spec)),
        signature: sigs.slice(0, nSig), carries: fl.actEnd ? 'key' : 'seal',
      }
      : { def: minionSp.id, x, y, rank: 'minion' });
    ctx.addPack(members, { kind: 'keeper' });
  }

  /**
   * Returns nextAnchor(): set-piece 'M' markers first, then shuffled floor tiles kept apart from
   * other packs (the spacing relaxes when space runs out). null when nothing is left.
   */
  function anchorPicker(ctx, p) {
    const { dist, taken, floorList } = ctx;
    const mSpots = p.markers.filter((m) => m.ch === 'M');
    const anchors = [];
    for (let i = 0; i < mSpots.length; i += 2) anchors.push([mSpots[i].x, mSpots[i].y]);
    let fi = 0, spacing = GenBalance.packSpacing;
    const farFromPacks = (a) => p.spawns.every((pk) => cheb(pk.members[0].x, pk.members[0].y, a[0], a[1]) >= spacing);
    return () => {
      while (anchors.length) {
        const a = anchors.shift();
        if (!taken.has(idx(p, a[0], a[1])) && dist[idx(p, a[0], a[1])] >= 0) return a;
      }
      for (;;) {
        while (fi < floorList.length) {
          const a = floorList[fi++];
          if (taken.has(idx(p, a[0], a[1]))) continue;
          if (farFromPacks(a)) return a;
        }
        if (spacing <= GenBalance.minPackSpacing) return null;
        spacing -= SPACING_STEP;
        fi = 0;
      }
    };
  }

  function championCount(rng, floorN) {
    if (floorN === 1) return 0;
    if (floorN <= 3) return 1;
    return rng.int(1, 2);
  }

  /** a champion pack at anchor a; returns how many monsters it placed */
  function placeChampionPack(ctx, p, rng, spec, a) {
    const sp = rng.pick(actSpecies(ctx.act).filter((m) => m.role !== 'spawner'));
    const n = rng.int(GenBalance.championSize[0], GenBalance.championSize[1]);
    const spots = cluster(p, ctx.dist, ctx.taken, a[0], a[1], n, PACK_R);
    const ascBonus = (spec.ascension || 0) >= Ascension.elite_mods.level ? Ascension.elite_mods.championExtraMods : 0;
    const mods = rollMods(rng, spec, Math.max(1, eliteModCount(spec) - 1 + ascBonus));
    ctx.addPack(spots.map(([x, y]) => ({ def: sp.id, x, y, rank: 'champion', mods })), { kind: 'champion', counted: true });
    return spots.length;
  }

  /** a normal pack (and its corpse props) at anchor a; returns how many monsters it placed */
  function placeNormalPack(ctx, p, rng, fl, a) {
    const { dist, taken } = ctx;
    const { id, pk, members } = packDefsFor(ctx.act, ctx.inAct, rng, fl.n);
    const spots = cluster(p, dist, taken, a[0], a[1], members.length, pk.spread ? SPREAD_PACK_R : PACK_R);
    const packMembers = spots.map(([x, y], i) => ({ def: members[i], x, y, rank: 'normal' }));
    ctx.addPack(packMembers, { kind: id, counted: true, leader: pk.leader || null });
    // corpse props: never stacked, never on another object's tile, and they don't block monster spots
    if (pk.corpses) {
      const busy = new Set(taken);
      for (const o of p.objects) busy.add(idx(p, o.x, o.y));
      for (let i = 0; i < pk.corpses; i++) {
        const t = cluster(p, dist, busy, a[0], a[1], 1, CLUSTER_R)[0];
        if (t) p.objects.push({ kind: 'corpse_prop', x: t[0], y: t[1], def: 'skeleton' });
      }
    }
    return spots.length;
  }

  /** normal and champion packs until the monster budget runs out; returns the budget left */
  function placePacks(ctx, p, rng, fl, spec, nextAnchor) {
    const diff = BD.data.difficulties[spec.difficulty || 'penitent'];
    const ascMult = (spec.ascension || 0) >= Ascension.density.level ? Ascension.density.budgetMult : 1;
    const ramp = (fl.n - 1) / BUDGET_RAMP_FLOORS;
    let budget = Math.round(BD.core.util.lerp(GenBalance.budgetMin, GenBalance.budgetMax, ramp) * diff.spawn * ascMult);
    let champsLeft = championCount(rng, fl.n);
    let guard = 0;
    while (budget > 0 && guard++ < MAX_PACKS) {
      const a = nextAnchor();
      if (!a) break;
      if (champsLeft > 0 && (budget < GenBalance.championLowBudget || rng.chance(GenBalance.championChance))) {
        champsLeft--;
        budget -= placeChampionPack(ctx, p, rng, spec, a);
        continue;
      }
      budget -= placeNormalPack(ctx, p, rng, fl, a);
    }
    return budget;
  }

  /** unique elites (floors 3+: 0–1 besides the Keeper), on a set-piece 'E' marker when there is one */
  function placeElites(ctx, p, rng, fl, spec, nextAnchor) {
    const elites = fl.n >= GenBalance.eliteFloor ? rng.int(0, 1) : 0;
    const eSpots = p.markers.filter((m) => m.ch === 'E');
    for (let k = 0; k < elites; k++) {
      const a = eSpots.length ? [eSpots[0].x, eSpots[0].y] : nextAnchor();
      if (!a) break;
      const eliteRole = (m) => m.role === 'brute' || m.role === 'tank' || m.role === 'skirmisher' || m.role === 'caster';
      const sp = rng.pick(actSpecies(ctx.act).filter(eliteRole));
      const minSp = rng.pick(actSpecies(ctx.act));
      const size = 1 + rng.int(GenBalance.eliteMinions[0], GenBalance.eliteMinions[1]);
      const spots = cluster(p, ctx.dist, ctx.taken, a[0], a[1], size, CLUSTER_R);
      const members = spots.map(([x, y], i) => (i === 0
        ? { def: sp.id, x, y, rank: 'unique', name: eliteName(rng), mods: rollMods(rng, spec, eliteModCount(spec)) }
        : { def: minSp.id, x, y, rank: 'minion' }));
      ctx.addPack(members, { kind: 'unique' });
    }
  }

  /** a few chests and loot piles in rooms (not on packs, not near the stairs) */
  function placeRoomLoot(ctx, p, rng) {
    const { taken } = ctx;
    const roomTiles = new Set();
    for (const r of p.rooms) {
      if (r.setpiece || r === p.upRoom) continue;
      for (const [x, y] of Carve.roomTiles(p, r)) roomTiles.add(idx(p, x, y));
    }
    const free = ctx.floorList.filter(([x, y]) => roomTiles.has(idx(p, x, y)) && !taken.has(idx(p, x, y)));
    const nChest = rng.int(GenBalance.roomChests[0], GenBalance.roomChests[1]);
    const nPile = rng.int(GenBalance.roomPiles[0], GenBalance.roomPiles[1]);
    for (let i = 0; i < nChest + nPile && i < free.length; i++) {
      const [x, y] = free[(i * LOOT_STRIDE) % free.length];
      if (taken.has(idx(p, x, y))) continue;
      taken.add(idx(p, x, y));
      p.objects.push({ kind: i < nChest ? 'chest' : 'pile', x, y });
    }
  }

  function run(p, rng, fl, spec) {
    const ctx = startContext(p, rng, fl);
    if (fl.keeper) placeKeeper(ctx, p, rng, fl, spec);
    const nextAnchor = anchorPicker(ctx, p);
    const budget = placePacks(ctx, p, rng, fl, spec, nextAnchor);
    placeElites(ctx, p, rng, fl, spec, nextAnchor);
    // set-piece objects
    for (const m of p.markers) {
      const kind = MARKER_OBJECTS[m.ch];
      if (kind) p.objects.push({ kind, x: m.x, y: m.y, sp: m.sp });
    }
    placeRoomLoot(ctx, p, rng);
    if (BD.sim.gen.objects) BD.sim.gen.objects.run(p, rng, fl, spec, ctx.taken);
    p.budget = budget;
  }

  BD.sim.gen.populate = { run, eliteName, cluster };
})(globalThis.BD);
