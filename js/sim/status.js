// @ts-check
// Statuses: apply (with boss rules), tick (world time), DoTs through the damage pipeline,
// clock multipliers, stat contributions. Entity timers never use wall-clock time.
(function (BD) {
  'use strict';

  const SD = BD.data.statuses;
  const B = BD.data.balance;
  const bump = (e) => BD.sim.stats.bump(e);
  const isBoss = (e) => BD.sim.entities.isBoss(e);

  function has(e, id) { for (const s of e.statuses) if (s.id === id) return s; return null; }
  function stacks(e, id) { let n = 0; for (const s of e.statuses) if (s.id === id) n += s.stacks || 1; return n; }

  /**
   * @param {{durMs?:number, magnitude?:number, sourceId?:number|null, hit?:number, element?:string, mag?:number}} o
   * hit: the applying hit's damage (for DoT magnitudes)
   */
  function apply(world, e, id, o) {
    o = o || {};
    let def = SD[id];
    if (!def || !e || e.hp <= 0) return null;
    let durMs = o.durMs != null ? o.durMs : def.durMs;
    let mag = o.mag != null ? o.mag : o.magnitude != null ? o.magnitude : def.mag || 0;
    // boss / keeper rules (05 §2.4)
    if (isBoss(e) && def.boss !== undefined) {
      if (def.boss === 'ignore') return null;
      if (typeof def.boss === 'number') durMs *= def.boss;
      else { id = def.boss; mag = def.bossMag || (SD[id].mag || 0); durMs = def.bossDurMs || durMs; def = SD[id]; }
    }
    // immunities
    if (e.kind === 'player') {
      const st = BD.sim.stats.statsOf(world, e);
      if ((id === 'chilled' && st.chill_immune) || (id === 'slowed' && st.slow_immune)) return null;
    }
    if (id === 'feared' && e.kind === 'monster' && BD.sim.monsters && BD.sim.monsters.fearless(e)) return null;
    let s = null;
    const dot = def.dot && o.hit ? (o.hit * def.pct) / Math.max(1, durMs / B.combat.dotTickMs) : 0;
    if (def.stack === 'stack') {
      const list = e.statuses.filter((x) => x.id === id);
      if (list.length >= (def.max || 5)) {
        // at the cap: refresh the stack closest to expiring
        s = list.sort((a, b) => a.remainingMs - b.remainingMs)[0];
        s.remainingMs = durMs;
        s.dot = Math.max(s.dot || 0, dot);
        s.sourceId = o.sourceId;
      } else {
        s = {
          id, remainingMs: durMs, magnitude: mag, stacks: 1, sourceId: o.sourceId == null ? null : o.sourceId,
          tick: B.combat.dotTickMs, dot, element: def.dot || o.element || null,
        };
        e.statuses.push(s);
      }
    } else {
      s = has(e, id);
      if (s) {
        s.remainingMs = Math.max(s.remainingMs, durMs);
        s.magnitude = Math.max(s.magnitude || 0, mag);
        if (dot > (s.dot || 0)) { s.dot = dot; s.sourceId = o.sourceId; }
      } else {
        s = {
          id, remainingMs: durMs, magnitude: mag, stacks: 1, sourceId: o.sourceId == null ? null : o.sourceId,
          tick: B.combat.dotTickMs, dot, element: def.dot || null,
        };
        if (def.shield) s.pool = mag;
        e.statuses.push(s);
        world.events.push({ type: 'status.apply', id: e.id, status: id, durMs, x: e.x, y: e.y });
      }
    }
    if (def.shield) s.pool = Math.max(s.pool || 0, mag);
    if (id === 'frozen' || id === 'stunned') cancelWindup(world, e);
    if (id === 'feared' && e.ai) { e.ai.fleeFrom = o.sourceId; }
    bump(e);
    return s;
  }

  function cancelWindup(world, e) {
    if (e.kind === 'player' && e.attack && BD.sim.abilities) BD.sim.abilities.cancel(world, e, 'stunned');
  }

  function remove(world, e, id) {
    const before = e.statuses.length;
    e.statuses = e.statuses.filter((s) => s.id !== id);
    if (e.statuses.length !== before) { bump(e); world.events.push({ type: 'status.end', id: e.id, status: id }); }
  }
  function cleanse(world, e, ids) { for (const id of ids) remove(world, e, id); }

  /** Tick all statuses on all entities. DoTs resolve every 500 ms through the pipeline. */
  function system(world, dt) {
    tickEntity(world, world.player, dt);
    for (const e of world.floor.entities.values()) if (!e.dead && e.statuses.length) tickEntity(world, e, dt);
  }
  function tickEntity(world, e, dt) {
    if (!e || e.dead || !e.statuses.length) return;
    let changed = false;
    for (let i = 0; i < e.statuses.length; i++) {
      const s = e.statuses[i];
      const def = SD[s.id];
      if (s.dot) {
        s.tick -= dt;
        if (s.tick <= 0) {
          s.tick += B.combat.dotTickMs;
          const amounts = {}; amounts[s.element || 'phys'] = s.dot;
          BD.sim.damage.dealDamage(world, {
            srcId: s.sourceId, tgtId: e.id, amounts, tags: ['dot', s.id],
            canCrit: false, canDodge: false, canBlock: false, mult: 1, isDot: true,
          });
          if (e.hp <= 0) return;
        }
      }
      if (def.hot) heal(world, e, (s.magnitude * Math.min(dt, Math.max(0, s.remainingMs))) / def.durMs);
      if (def.durMs === 0 && s.remainingMs === 0) continue; // until removed
      s.remainingMs -= dt;
      if (s.remainingMs <= 0) {
        e.statuses.splice(i--, 1);
        changed = true;
        world.events.push({ type: 'status.end', id: e.id, status: s.id });
      }
    }
    if (changed) bump(e);
  }

  function heal(world, e, amount) {
    if (amount <= 0 || e.hp <= 0) return 0;
    const max = BD.sim.stats.statsOf(world, e).maxLife;
    const before = e.hp;
    e.hp = Math.min(max, e.hp + amount);
    const got = e.hp - before;
    if (got >= 1) world.events.push({ type: 'heal', id: e.id, amount: got });
    return got;
  }

  /** Action-clock multiplier: chilled 0.5, frozen/stunned/exposed 0, enraged 1.3, haste. */
  function clockMult(world, e) {
    let k = 1;
    for (const s of e.statuses) {
      const c = SD[s.id].clock;
      if (c === 0) return 0;
      if (c) k *= c;
    }
    if (e.kind === 'monster' && BD.sim.monsters) k *= BD.sim.monsters.speedMult(world, e);
    return k;
  }
  /** movement duration multiplier from slows/roots (Infinity = can't move) */
  function moveMult(world, e) {
    let k = 1;
    for (const s of e.statuses) {
      const d = SD[s.id];
      if (d.noMove) return Infinity;
      if (d.moveSlow) k = Math.max(k, 1 / (1 - Math.min(0.9, s.magnitude || d.mag || 0.3)));
    }
    return k;
  }
  /** damage-taken multiplier (shocked, vulnerable, exposed…) */
  function takenMult(world, e) {
    let k = 1;
    for (const s of e.statuses) { const t = SD[s.id].takenMult; if (t) k += t; }
    return k;
  }
  function dealtMult(world, e) {
    let k = 1;
    for (const s of e.statuses) { const t = SD[s.id].dealtMult; if (t) k += t; }
    return Math.max(0.1, k);
  }
  function invulnerable(e) { for (const s of e.statuses) if (SD[s.id].invuln) return true; return false; }

  /** stat contributions of buffs (player and monsters) */
  function statMods(world, e, add) {
    for (const s of e.statuses) {
      const d = SD[s.id];
      if (d.dmgPct) add('dmg_pct', s.magnitude, d.name);
      if (d.armorPct) add('armor_pct', s.magnitude, d.name);
      if (d.drPct) add('dr_pct', s.magnitude, d.name);
      if (d.movePct) add('move_pct', s.magnitude, d.name);
      if (d.regenPct) add('life_regen_pct', s.magnitude, d.name);
      if (d.hasteMove) { add('move_pct', d.hasteMove, d.name); add('ias', d.hasteIas, d.name); }
      if (d.flag) add(d.flag, true, d.name);
      if (s.id === 'braced') add('dr_pct', s.magnitude, d.name);
      if (s.id === 'oath') { add('dmg_pct', 25, d.name); add('dr_pct', 20, d.name); }
    }
  }

  BD.sim.status = {
    has, stacks, apply, remove, cleanse, system, heal,
    clockMult, moveMult, takenMult, dealtMult, invulnerable, statMods, isBoss,
  };
  BD.sim.world.addSystem('status', system, 30);
})(globalThis.BD);
