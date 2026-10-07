// @ts-check
// Character saves (06 §12): seed + run + player + floor deltas. Load = regenerate the floor from its
// seed and apply the delta. Saves happen only in a safe state, so they never need AI timers, zones,
// projectiles or scheduled events. Storage lives in the app (localStorage adapter).
(function (BD) {
  'use strict';

  const Util = BD.core.util;
  const VERSION = BD.sim.world.SAVE_VERSION;
  /** migrations[i] upgrades a save from version i+1 to i+2, so VERSION === migrations.length + 1 */
  const migrations = [];

  const SANCTUM_FLOOR = BD.data.floors.LAST;   // its boss fight has no arena: a save there resumes at the floor start
  const ANY_DISTANCE = 99;                     // a radius covering the whole floor

  const TRANSIENT = ['intent', 'attack', 'move', 'queued', 'lockId', 'airborne', '_zt', '_silentHit'];
  function cleanPlayer(p) {
    const c = Util.clone(p);
    for (const k of TRANSIENT) delete c[k];
    delete c.stash;
    c.statuses = (c.statuses || []).filter((s) => BD.data.statuses[s.id] && !BD.data.statuses[s.id].invuln && s.id !== 'healing');
    return c;
  }

  /** safe: no awake monster within 15 tiles, no zones, no projectiles, not in a live boss fight */
  function isSafe(world) {
    const f = world.floor, p = world.player;
    if (!f || !p || p.dead) return false;
    if (world.run.countdownMs > 0) return false;
    if (BD.sim.bossfight && BD.sim.bossfight.liveFight(world) && (f.zones.length || anyAwake(world, ANY_DISTANCE))) return false;
    if (f.projectiles.length) return false;
    if (BD.core.scheduler.pendingFloorEvents(world)) return false;
    if (f.zones.some((z) => !z.resolved || z.faction === 'monster')) return false;
    return !anyAwake(world, BD.data.balance.player.safeRadius);
  }
  function anyAwake(world, r) {
    const p = world.player;
    for (const e of world.floor.entities.values()) {
      if (e.dead || e.faction !== 'monster' || !e.ai) continue;
      if (e.ai.state === 'idle' || e.ai.state === 'dormant') continue;
      if (Math.max(Math.abs(e.x - p.x), Math.abs(e.y - p.y)) <= r) return true;
    }
    return false;
  }

  /** @returns {any} a JSON-safe character save */
  function serialize(world, savedAt) {
    const f = world.floor;
    const arena = typeof f.key === 'string' && f.key[0] === 'a';
    // a saved game never resumes inside a live boss fight: it resumes at the gate
    let key = f.key, pos = { x: world.player.x, y: world.player.y };
    const inFight = (arena && !f.bossDead) || (f.n === SANCTUM_FLOOR && BD.sim.bossfight && BD.sim.bossfight.liveFight(world));
    if (inFight) {
      key = arena ? Number(f.key.slice(1)) : SANCTUM_FLOOR;
      pos = null;
    }
    const deltas = Object.assign({}, world.floorDeltas);
    if (key === f.key) deltas[f.key] = BD.sim.floors.snapshot(world);
    return {
      v: VERSION, savedAt: savedAt || 0, seed: world.run.seed, run: Util.clone(world.run), player: cleanPlayer(world.player),
      worldTime: world.time, rngState: world.rng.state(), lootRngState: world.lootRng.state(), nextId: world.nextId,
      floor: { key, pos, arenaRetreat: arena && !f.bossDead }, floorDeltas: Util.clone(deltas),
      scheduled: Util.clone(BD.core.scheduler.runEvents(world)), nextSeq: world.nextSeq || 0,
    };
  }

  /**
   * Make a save's player agree with the current content: items with an unknown base are dropped,
   * points in removed skills are refunded, unknown statuses / bar slots / backgrounds are cleared.
   * Unknown affixes and legendaries are already ignored by items.derive. Returns what was fixed.
   */
  function reconcile(p) {
    const D = BD.data, fixed = [];
    const known = (it) => it && D.bases[it.base];
    for (const slot in p.equip || {}) {
      if (p.equip[slot] && !known(p.equip[slot])) {
        fixed.push('item ' + p.equip[slot].base);
        p.equip[slot] = null;
      }
    }
    p.pack = (p.pack || []).filter((e) => {
      const ok = known(e.item || e);
      if (!ok) fixed.push('item ' + (e.item || e).base);
      return ok;
    });
    for (const id in p.skills || {}) {
      if (!D.skills[id]) {
        fixed.push('skill ' + id);
        p.unspent.skill += p.skills[id];
        delete p.skills[id];
      }
    }
    for (const k in p.bar || {}) if (p.bar[k] && !D.skills[p.bar[k]]) p.bar[k] = null;
    if (p.bar && !('lmb' in p.bar)) p.bar.lmb = null;          // saves from before the left-click slot
    p.statuses = (p.statuses || []).filter((st) => D.statuses[st.id]);
    if (p.background && !D.backgrounds[p.background]) {
      fixed.push('background ' + p.background);
      p.background = Object.keys(D.backgrounds)[0];
    }
    return fixed;
  }

  /** @returns {any} world */
  function deserialize(save) {
    let s = Util.clone(save);
    for (let v = s.v || 1; v <= migrations.length; v++) s = migrations[v - 1](s);
    const fixed = reconcile(s.player);
    if (fixed.length) Util.warnOnce('save reconciled with current content: ' + fixed.join(', '));
    const world = BD.sim.world.createWorld({ seed: s.seed, cls: s.player.cls, name: s.player.name, difficulty: s.run.difficulty });
    world.time = s.worldTime;
    world.nextId = s.nextId;
    world.rng.setState(s.rngState);
    world.lootRng.setState(s.lootRngState);
    world.run = Util.clone(s.run);
    world.floorDeltas = Util.clone(s.floorDeltas || {});
    const p = Object.assign(world.player, Util.clone(s.player));
    p.intent = { kind: 'idle' };
    p.attack = null;
    p.move = null;
    BD.sim.stats.bump(p);
    world.floor = null;
    const key = s.floor.key;
    BD.sim.run.travel(world, key, arrivalOf(s.floor));
    // arrival side effects (town restock, blessing offers) already happened before the save
    world.run = Util.clone(s.run);
    world.rng.setState(s.rngState);
    world.lootRng.setState(s.lootRngState);
    world.scheduled = Util.clone(s.scheduled || []);
    world.nextSeq = s.nextSeq || 0;
    world.events.length = 0;
    return world;
  }

  /** where a loaded save puts the player: the saved tile, or the gate / up stairs after a boss-fight retreat */
  function arrivalOf(floor) {
    if (floor.pos) return { x: floor.pos.x, y: floor.pos.y, exact: true };
    return floor.arenaRetreat ? 'gate' : 'up';
  }

  /** the save test's hash: player, run, floor deltas (incl. the current floor's), both RNG states */
  function saveHash(world) {
    const deltas = Object.assign({}, world.floorDeltas);
    deltas[world.floor.key] = BD.sim.floors.snapshot(world);
    for (const k in deltas) {
      const d = deltas[k];
      const survivors = d.survivors.map((x) => ({ id: x.id, hp: Math.round(x.hp * 100), x: x.x, y: x.y }));
      deltas[k] = Object.assign({}, d, { timeOnFloor: 0, survivors });
    }
    const p = cleanPlayer(world.player);
    delete p.statsVersion;
    return Util.hashOf({ p, run: world.run, deltas, rng: world.rng.state(), loot: world.lootRng.state() });
  }

  BD.sim.save = { VERSION, migrations, serialize, deserialize, reconcile, isSafe, saveHash, cleanPlayer };
})(globalThis.BD);
