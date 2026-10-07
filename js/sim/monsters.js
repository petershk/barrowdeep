// @ts-check
// Monster instances: creation from plans/spawns, derived-stat contributions from rank and mods,
// runtime spawns (adds, revives, splits, egg spawns). Static data stays in the def (06 §5.1).
(function (BD) {
  'use strict';

  const Entities = BD.sim.entities;
  const MonsterData = () => BD.data.monsters;
  const ChampionMods = () => BD.data.championMods;
  const Grid = BD.core.grid;

  const SPAWN_SEARCH_RADIUS = 4;
  const DORMANT_DR_PCT = 40;           // statues take this much less damage until they wake
  const HASTE_ASCENSION = 2;           // from this ascension on, monsters are faster…
  const HASTE_ASCENSION_MULT = 1.1;    // …by this factor
  const NEVER_SEEN_MS = -1e9;

  function defOf(e) { return MonsterData()[e.def] || (BD.data.bosses && BD.data.bosses[e.def]) || null; }
  function family(e) {
    const d = defOf(e);
    return d ? d.family : '';
  }
  function hasBehaviour(e, id) {
    const d = defOf(e);
    return !!(d && d.behaviours && d.behaviours.some((b) => b.id === id));
  }
  function behaviour(e, id) {
    const d = defOf(e);
    if (!d || !d.behaviours) return null;
    return d.behaviours.find((b) => b.id === id) || null;
  }
  function fearless(e) { return hasBehaviour(e, 'fearless') || !!BD.sim.entities.rankOf(e).fearless; }
  function blockFront(e) {
    const b = behaviour(e, 'block_front');
    return b ? b.pct : 0;
  }

  /** Create a monster entity (not yet placed). m: plan member {def, x, y, rank, mods, name, keeper, packLeader} */
  function create(world, f, id, m, pack) {
    const d = MonsterData()[m.def] || BD.data.bosses[m.def];
    let packId = null;
    if (m.packId != null) packId = m.packId;
    else if (pack) packId = pack.id;
    const e = Entities.makeEntity(id, 'monster', m.def, m.x, m.y, {
      rank: m.rank || 'normal', mods: (m.mods || []).slice(), packId, al: m.al || f.al,
      name: m.name || null, keeper: !!m.keeper, faction: 'monster', palOverride: m.palOverride || null, hpMult: m.hpMult || 1,
      hpBase: m.hpBase || null, dmgMult: m.dmgMult || 1, signature: m.signature || null, eventId: m.eventId || null,
      ai: {
        state: 'idle', timer: 0, targetId: null, action: null, phase: 0, cds: {}, noticed: false, lastSeenMs: NEVER_SEEN_MS, fleeMs: 0,
      },
      counted: !!(pack && pack.counted), spawnedBy: m.spawnedBy || null, noLoot: !!m.noLoot, noXp: !!m.noXp,
    });
    if (d && d.behaviours && d.behaviours.some((b) => b.id === 'dormant')) e.ai.state = 'dormant';
    if (d && d.spawner) e.immobile = true;
    e.hp = BD.sim.stats.statsOf(world, e).maxLife;
    if (m.hpFrac) e.hp = Math.max(1, Math.round(e.hp * m.hpFrac));
    e.dir = (id * 7) % 8;   // scatter facings
    return e;
  }

  /** Spawn at runtime (adds, revives, splits): runtime ids, nearest free reachable tile, not saved. */
  function spawn(world, def, x, y, o) {
    const f = world.floor;
    // runtime spawns only land on tiles reachable from the level's entrance (never in sealed pockets)
    const reachable = f.reach ? (sx, sy) => f.reach[Grid.idx(f, sx, sy)] >= 0 : null;
    const spot = Entities.nearestFree(f, x, y, SPAWN_SEARCH_RADIUS, reachable);
    if (!spot) return null;
    const id = world.nextId++;
    const spec = Object.assign({ def, x: spot.x, y: spot.y, al: f.al, rank: 'normal' }, o || {});
    const e = create(world, f, id, spec, o && o.pack ? o.pack : null);
    e.runtime = true;
    e.home = { x: spot.x, y: spot.y };
    f.entities.set(id, e);
    Entities.occupy(f, e);
    world.events.push({ type: 'spawn', id, def, x: spot.x, y: spot.y, rank: e.rank });
    if (o && o.alert !== false && BD.sim.ai) BD.sim.ai.alert(world, e, world.player, true);
    return e;
  }
  /** zone payload helper: spawn one def on each tile */
  function spawnAt(world, sp, tiles, srcId) {
    const owner = Entities.get(world, srcId);
    for (const [x, y] of tiles) {
      spawn(world, sp.def, x, y, { noLoot: true, noXp: true, packId: owner ? owner.packId : null, spawnedBy: srcId });
    }
  }

  /** derived-stat contributions from mods (called by statsOf) */
  function modStats(world, e, s, add) {
    for (const id of e.mods) {
      const m = ChampionMods()[id];
      if (!m) continue;
      if (m.dmgMult) {
        s.dmgLo *= m.dmgMult;
        s.dmgHi *= m.dmgMult;
      }
      if (m.dr) add('dr_pct', m.dr, m.name);
      if (m.knockImmune) add('knockback_immune', true, m.name);
    }
    if (e.ai && e.ai.state === 'dormant') add('dr_pct', DORMANT_DR_PCT, 'Dormant');
    // Fanatic: the whole pack attacks faster
    if (e.packId != null && packHasMod(world, e.packId, 'fanatic')) s.attackCycleMs /= ChampionMods().fanatic.packIas;
  }
  function packHasMod(world, packId, mod) {
    const f = world.floor;
    f._packMods = f._packMods || {};
    const k = packId + ':' + mod;
    if (f._packMods[k] === undefined) {
      let has = false;
      for (const e of f.entities.values()) {
        if (e.packId === packId && e.mods.indexOf(mod) >= 0) {
          has = true;
          break;
        }
      }
      f._packMods[k] = has;
    }
    return f._packMods[k];
  }
  function speedMult(world, e) {
    let k = 1;
    for (const id of e.mods) {
      const m = ChampionMods()[id];
      if (m && m.speedMult) k *= m.speedMult;
    }
    if (world.run.ascension >= HASTE_ASCENSION) k *= HASTE_ASCENSION_MULT;
    if (e.bossSpeed) k *= e.bossSpeed;
    return k;
  }

  /** damage packet amounts for a monster's basic hit (05 §3), including mod element adds */
  function hitAmounts(world, e, mult) {
    const s = BD.sim.stats.statsOf(world, e);
    const d = defOf(e);
    const v = (s.dmgLo + world.rng.next() * (s.dmgHi - s.dmgLo)) * (mult || 1);
    const out = {};
    out[d.element || 'phys'] = v;
    for (const id of e.mods) {
      const m = ChampionMods()[id];
      if (m && m.addElement) out[m.addElement] = (out[m.addElement] || 0) + v * m.addPct;
    }
    return out;
  }
  /** average damage of one basic hit (for zone multipliers and traps) */
  function avgDmg(world, e) {
    const s = BD.sim.stats.statsOf(world, e);
    return (s.dmgLo + s.dmgHi) / 2;
  }

  BD.sim.monsters = {
    defOf, family, hasBehaviour, behaviour, fearless, blockFront, create, spawn, spawnAt,
    modStats, speedMult, hitAmounts, avgDmg, packHasMod,
  };
})(globalThis.BD);
