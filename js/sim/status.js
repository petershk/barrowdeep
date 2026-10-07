// @ts-check
// Statuses: apply (with boss rules), tick (world time), DoTs through the damage pipeline,
// clock multipliers, stat contributions. Entity timers never use wall-clock time.
(function (BD) {
  'use strict';

  const StatusData = BD.data.statuses;
  const Balance = BD.data.balance;
  const bump = (e) => BD.sim.stats.bump(e);
  const isBoss = (e) => BD.sim.entities.isBoss(e);

  function has(e, id) {
    for (const s of e.statuses) if (s.id === id) return s;
    return null;
  }
  function stacks(e, id) {
    let n = 0;
    for (const s of e.statuses) if (s.id === id) n += s.stacks || 1;
    return n;
  }

  /** explicit mag, then magnitude, then the status default */
  function magnitudeOf(o, def) {
    if (o.mag != null) return o.mag;
    if (o.magnitude != null) return o.magnitude;
    return def.mag || 0;
  }

  /**
   * Boss / keeper rules (05 §2.4): a status may be ignored (null), shortened, or swapped for
   * a boss-specific one. Returns the status actually applied.
   */
  function bossRule(e, id, def, durMs, mag) {
    if (!isBoss(e) || def.boss === undefined) return { id, def, durMs, mag };
    if (def.boss === 'ignore') return null;
    if (typeof def.boss === 'number') return { id, def, durMs: durMs * def.boss, mag };
    const bossId = def.boss;
    return {
      id: bossId,
      def: StatusData[bossId],
      mag: def.bossMag || (StatusData[bossId].mag || 0),
      durMs: def.bossDurMs || durMs,
    };
  }

  function newStatus(id, durMs, mag, o, dot, element) {
    return {
      id, remainingMs: durMs, magnitude: mag, stacks: 1, sourceId: o.sourceId == null ? null : o.sourceId,
      tick: Balance.combat.dotTickMs, dot, element,
    };
  }

  /** stacking status: add a stack, or at the cap refresh the stack closest to expiring */
  function applyStack(e, id, def, durMs, mag, o, dot) {
    const list = e.statuses.filter((x) => x.id === id);
    if (list.length >= (def.max || Balance.combat.defaultMaxStacks)) {
      const s = list.sort((a, b) => a.remainingMs - b.remainingMs)[0];
      s.remainingMs = durMs;
      s.dot = Math.max(s.dot || 0, dot);
      s.sourceId = o.sourceId;
      return s;
    }
    const s = newStatus(id, durMs, mag, o, dot, def.dot || o.element || null);
    e.statuses.push(s);
    return s;
  }

  /** single-instance status: refresh (longest duration, strongest magnitude/DoT wins) or add */
  function applySingle(world, e, id, def, durMs, mag, o, dot) {
    let s = has(e, id);
    if (s) {
      s.remainingMs = Math.max(s.remainingMs, durMs);
      s.magnitude = Math.max(s.magnitude || 0, mag);
      if (dot > (s.dot || 0)) {
        s.dot = dot;
        s.sourceId = o.sourceId;
      }
      return s;
    }
    s = newStatus(id, durMs, mag, o, dot, def.dot || null);
    if (def.shield) s.pool = mag;
    e.statuses.push(s);
    world.events.push({ type: 'status.apply', id: e.id, status: id, durMs, x: e.x, y: e.y });
    return s;
  }

  /**
   * @param {{durMs?:number, magnitude?:number, sourceId?:number|null, hit?:number, element?:string, mag?:number}} o
   * hit: the applying hit's damage (for DoT magnitudes)
   */
  function apply(world, e, id, o) {
    o = o || {};
    const asked = StatusData[id];
    if (!asked || !e || e.hp <= 0) return null;
    const rule = bossRule(e, id, asked, o.durMs != null ? o.durMs : asked.durMs, magnitudeOf(o, asked));
    if (!rule) return null;
    id = rule.id;
    const { def, durMs, mag } = rule;
    // immunities
    if (e.kind === 'player') {
      const st = BD.sim.stats.statsOf(world, e);
      if ((id === 'chilled' && st.chill_immune) || (id === 'slowed' && st.slow_immune)) return null;
    }
    if (id === 'feared' && e.kind === 'monster' && BD.sim.monsters && BD.sim.monsters.fearless(e)) return null;
    const dot = def.dot && o.hit ? (o.hit * def.pct) / Math.max(1, durMs / Balance.combat.dotTickMs) : 0;
    const s = def.stack === 'stack'
      ? applyStack(e, id, def, durMs, mag, o, dot)
      : applySingle(world, e, id, def, durMs, mag, o, dot);
    if (def.shield) s.pool = Math.max(s.pool || 0, mag);
    if (id === 'frozen' || id === 'stunned') cancelWindup(world, e);
    if (id === 'feared' && e.ai) e.ai.fleeFrom = o.sourceId;
    bump(e);
    return s;
  }

  function cancelWindup(world, e) {
    if (e.kind === 'player' && e.attack && BD.sim.abilities) BD.sim.abilities.cancel(world, e, 'stunned');
  }

  function remove(world, e, id) {
    const before = e.statuses.length;
    e.statuses = e.statuses.filter((s) => s.id !== id);
    if (e.statuses.length !== before) {
      bump(e);
      world.events.push({ type: 'status.end', id: e.id, status: id });
    }
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
      const def = StatusData[s.id];
      if (s.dot) {
        s.tick -= dt;
        if (s.tick <= 0) {
          s.tick += Balance.combat.dotTickMs;
          const amounts = {};
          amounts[s.element || 'phys'] = s.dot;
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
      const c = StatusData[s.id].clock;
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
      const d = StatusData[s.id];
      if (d.noMove) return Infinity;
      if (d.moveSlow) k = Math.max(k, 1 / (1 - Math.min(Balance.combat.maxSlow, s.magnitude || d.mag || Balance.combat.defaultSlow)));
    }
    return k;
  }
  /** damage-taken multiplier (shocked, vulnerable, exposed…) */
  function takenMult(world, e) {
    let k = 1;
    for (const s of e.statuses) {
      const t = StatusData[s.id].takenMult;
      if (t) k += t;
    }
    return k;
  }
  function dealtMult(world, e) {
    let k = 1;
    for (const s of e.statuses) {
      const t = StatusData[s.id].dealtMult;
      if (t) k += t;
    }
    return Math.max(Balance.combat.minDealtMult, k);
  }
  function invulnerable(e) {
    for (const s of e.statuses) if (StatusData[s.id].invuln) return true;
    return false;
  }

  /** stat contributions of buffs (player and monsters) */
  function statMods(world, e, add) {
    for (const s of e.statuses) {
      const d = StatusData[s.id];
      if (d.dmgPct) add('dmg_pct', s.magnitude, d.name);
      if (d.armorPct) add('armor_pct', s.magnitude, d.name);
      if (d.drPct) add('dr_pct', s.magnitude, d.name);
      if (d.movePct) add('move_pct', s.magnitude, d.name);
      if (d.regenPct) add('life_regen_pct', s.magnitude, d.name);
      if (d.hasteMove) {
        add('move_pct', d.hasteMove, d.name);
        add('ias', d.hasteIas, d.name);
      }
      if (d.flag) add(d.flag, true, d.name);
      if (s.id === 'braced') add('dr_pct', s.magnitude, d.name);
      if (s.id === 'oath') {
        add('dmg_pct', d.grants.dmg_pct, d.name);
        add('dr_pct', d.grants.dr_pct, d.name);
      }
    }
  }

  BD.sim.status = {
    has, stacks, apply, remove, cleanse, system, heal,
    clockMult, moveMult, takenMult, dealtMult, invulnerable, statMods, isBoss,
  };
  BD.sim.world.addSystem('status', system, 30);
})(globalThis.BD);
