// @ts-check
// Class resources (02, 05 §2): Rage (+Momentum), Energy + Combo (+Ambush), Mana + Surge
// (+Energy Shield), Focus (+Steady Hand). Also life regeneration. All timers are world time.
(function (BD) {
  'use strict';

  const PlayerBalance = BD.data.balance.player;
  const Stats = () => BD.sim.stats;
  const Skills = BD.data.skills;       // keystone numbers live in their skill's `params`

  function init(world, p) {
    const cls = BD.data.classes[p.cls];
    const r = {};
    if (cls.resource === 'rage') r.rage = { cur: PlayerBalance.rageFloor, max: PlayerBalance.rageMax };
    if (cls.resource === 'energy') {
      r.energy = { cur: PlayerBalance.energyMax, max: PlayerBalance.energyMax };
      r.combo = { n: 0, windowMs: 0 };
    }
    if (cls.resource === 'mana') {
      r.mana = { cur: 0, max: 0 };
      r.surge = false;
    }
    if (cls.resource === 'focus') r.focus = { n: 0, lastTargetId: null, lastGainMs: -1e9, stillMs: 0, lastDealtMs: -1e9 };
    p.resources = r;
    p.momentum = false;
  }

  const kind = (p) => BD.data.classes[p.cls].resource;
  const keystone = (p, id) => !!(p.skills && p.skills[id]);
  const emit = (world, p) => world.events.push({ type: 'resource.change', id: p.id });

  /** current amount for costs */
  function amount(p, type) {
    const r = p.resources;
    if (type === 'rage') return r.rage ? r.rage.cur : 0;
    if (type === 'energy') return r.energy ? r.energy.cur : 0;
    if (type === 'mana') return r.mana ? r.mana.cur : 0;
    if (type === 'focus') return r.focus ? r.focus.n : 0;
    return Infinity;
  }
  function canPay(p, type, cost, minStart) {
    if (type === 'none' || !type) return true;
    if (cost === 'all') return amount(p, type) >= (minStart || 0);
    return amount(p, type) >= Math.max(cost, minStart || 0);
  }
  /** spend; returns what was spent (for refunds) */
  function spend(world, p, type, cost) {
    const r = p.resources;
    let spent = 0;
    if (type === 'rage' && r.rage) {
      spent = cost === 'all' ? r.rage.cur : cost;
      r.rage.cur -= spent;
    } else if (type === 'energy' && r.energy) {
      spent = cost === 'all' ? r.energy.cur : cost;
      r.energy.cur -= spent;
    } else if (type === 'mana' && r.mana) {
      spent = cost === 'all' ? r.mana.cur : cost;
      r.mana.cur -= spent;
      if (spent > 0) {
        p.lastCastMs = world.time;
        r.surge = false;
      }
    } else if (type === 'focus' && r.focus) {
      spent = cost === 'all' ? r.focus.n : Math.min(r.focus.n, cost);
      r.focus.n -= spent;
    }
    if (spent) {
      emit(world, p);
      checkMomentum(world, p);
    }
    return spent;
  }
  function refund(world, p, type, n) {
    if (!n) return;
    gain(world, p, type, n, true);
  }
  function gain(world, p, type, n, raw) {
    const r = p.resources;
    if (type === 'rage' && r.rage) {
      const s = Stats().statsOf(world, p);
      r.rage.cur = Math.min(r.rage.max, r.rage.cur + (raw ? n : n * (1 + s.rage_gen_pct / 100)));
      checkMomentum(world, p);
    } else if (type === 'energy' && r.energy) {
      r.energy.cur = Math.min(r.energy.max, r.energy.cur + n);
    } else if (type === 'mana' && r.mana) {
      r.mana.cur = Math.min(r.mana.max, r.mana.cur + n);
    } else if (type === 'focus' && r.focus) {
      r.focus.n = Math.min(PlayerBalance.focusMax, r.focus.n + n);
      r.focus.lastGainMs = world.time;
    } else {
      return;
    }
    emit(world, p);
  }

  // ---- combo ----
  function comboMax(world, p) {
    return PlayerBalance.comboMax + (Stats().statsOf(world, p).combo_max || 0) + (keystone(p, 'endless_flurry') ? 1 : 0);
  }
  function addCombo(world, p, n) {
    const c = p.resources.combo;
    if (!c) return;
    const before = c.n;
    c.n = Math.min(comboMax(world, p), c.n + n);
    c.windowMs = PlayerBalance.comboWindowMs + (Stats().statsOf(world, p).combo_window_s || 0) * 1000;
    if (c.n > before) world.events.push({ type: 'combo', id: p.id, n: c.n });
    emit(world, p);
  }
  function takeCombo(world, p) {
    const c = p.resources.combo;
    if (!c) return 0;
    const n = c.n;
    c.n = 0;
    if (n) emit(world, p);
    return n;
  }
  const combo = (p) => (p.resources.combo ? p.resources.combo.n : 0);

  // ---- momentum ----
  function checkMomentum(world, p) {
    if (!p.resources.rage) return;
    const th = Stats().statsOf(world, p).momentum_thresh;
    const on = p.resources.rage.cur > th;
    if (on !== p.momentum) {
      p.momentum = on;
      Stats().bump(p);
      world.events.push({ type: 'momentum', id: p.id, on });
    }
  }
  function traitMods(world, p, add) {
    if (p.momentum) {
      add('dmg_pct', PlayerBalance.momentumDmg, 'Momentum');
      add('ias', PlayerBalance.momentumIas, 'Momentum');
    }
    if (keystone(p, 'juggernaut')) {
      add('knockback_immune', true, 'Juggernaut');
      add('chill_immune', true, 'Juggernaut');
      add('slow_immune', true, 'Juggernaut');
    }
  }
  /** +crit from focus (Steady Hand) and Tiger Strike r3 charges */
  function critBonus(world, p) {
    let c = 0;
    if (p.resources.focus) c += p.resources.focus.n * PlayerBalance.focusCritPer;
    return c;
  }

  // ---- hits ----
  /** called by the damage pipeline's on-hit hook */
  function onHit(world, src, tgt, pk, res) {
    if (src && src.kind === 'player' && tgt.kind !== 'player') {
      const r = src.resources;
      if (r.rage && pk.abilityId === 'attack') gain(world, src, 'rage', PlayerBalance.rageBasicGen);
      if (r.focus) {
        // focus builds from basic shots on the same target (and from standing still): skills only spend it
        const f = r.focus;
        f.lastDealtMs = world.time;
        const gap = world.time - f.lastGainMs >= PlayerBalance.focusSameTargetGapMs;
        if (pk.abilityId === 'attack' && f.lastTargetId === tgt.id && gap) gain(world, src, 'focus', 1);
        f.lastTargetId = tgt.id;
      }
    }
    if (tgt.kind === 'player') {
      const r = tgt.resources;
      if (r.rage) {
        tgt.lastHitMs = world.time;
        const br = BD.sim.status.has(tgt, 'braced');
        if (br) gain(world, tgt, 'rage', BD.data.statuses.braced.ragePerHit);
        if (keystone(tgt, 'juggernaut')) gain(world, tgt, 'rage', (res.total / Stats().statsOf(world, tgt).maxLife) * 100);
      }
      // a real blow knocks focus off; a swarm's nibbles don't
      const blow = res.total >= Stats().statsOf(world, tgt).maxLife * PlayerBalance.focusKnockPct / 100;
      if (r.focus && r.focus.n > 0 && !pk.isDot && blow) {
        const keep = Stats().statsOf(world, tgt).focus_keep_pct || 0;
        if (!world.rng.chance(keep / 100)) {
          r.focus.n--;
          emit(world, tgt);
        }
      }
    }
  }

  /** Energy Shield keystone: 40% of damage taken drains mana instead */
  function absorb(world, p, total) {
    if (!keystone(p, 'energy_shield') || !p.resources.mana) return total;
    const m = p.resources.mana;
    const take = Math.min(m.cur, total * Skills.energy_shield.params.absorb);
    m.cur -= take;
    if (take > 0) emit(world, p);
    return total - take;
  }

  // ---- per-step ----
  function tickRage(world, p, r, s, sec) {
    if (keystone(p, 'bloodlust')) {
      const bl = Skills.bloodlust.params;   // above the threshold, drain max life per second (never kills)
      if (r.rage.cur > bl.rageThreshold) p.hp = Math.max(1, p.hp - s.maxLife * bl.drainPct * sec);
    } else if (world.time - Math.max(p.lastHitMs, p.lastDamagedMs) > PlayerBalance.rageDecayDelayMs
      && r.rage.cur > PlayerBalance.rageFloor) {
      r.rage.cur = Math.max(PlayerBalance.rageFloor, r.rage.cur - PlayerBalance.rageDecay * sec);
      checkMomentum(world, p);
    }
  }
  /** combo points expire when their window runs out */
  function tickCombo(world, p, r, dt) {
    r.combo.windowMs -= dt;
    if (r.combo.windowMs <= 0) {
      r.combo.n = 0;
      emit(world, p);
    }
  }
  function tickMana(world, p, r, s, sec) {
    r.mana.max = s.maxMana;
    const delay = PlayerBalance.surgeDelayMs - (s.surge_delay_s || 0) * 1000;
    const surge = world.time - p.lastCastMs >= delay;
    if (surge !== r.surge) {
      r.surge = surge;
      emit(world, p);
    }
    let mult = 1;
    if (surge) mult = keystone(p, 'energy_shield') ? Skills.energy_shield.params.surgeMult : PlayerBalance.surgeMult;
    r.mana.cur = Math.min(r.mana.max, r.mana.cur + s.manaRegenPerS * mult * sec);
  }
  /** focus builds while standing still in combat and drains after a lull */
  function tickFocus(world, p, r, dt, inCombat) {
    const f = r.focus;
    const still = !p.move && !p.intent.path;
    if (still && inCombat) {
      f.stillMs += dt;
      if (f.stillMs >= PlayerBalance.focusStillMs) {
        f.stillMs -= PlayerBalance.focusStillMs;
        gain(world, p, 'focus', 1);
      }
    } else {
      f.stillMs = 0;
    }
    if (f.n > 0 && world.time - f.lastDealtMs > PlayerBalance.focusLoseMs && world.time - f.lastGainMs > PlayerBalance.focusLoseMs) {
      f.n = 0;
      emit(world, p);
    }
  }
  /** life regeneration (05 §2): 0.4%/s, 3%/s out of combat after 4 s without damage */
  function tickLife(world, p, s, sec, inCombat) {
    if (p.hp < s.maxLife) {
      const ooc = world.time - p.lastDamagedMs > PlayerBalance.oocDelayMs && !inCombat;
      const pct = (ooc ? PlayerBalance.oocRegenPct : PlayerBalance.lifeRegenPct) + (s.life_regen_pct || 0);
      p.hp = Math.min(s.maxLife, p.hp + (s.maxLife * pct / 100) * sec);
    } else if (p.hp > s.maxLife) {
      p.hp = s.maxLife;
    }
  }

  function system(world, dt) {
    const p = world.player;
    if (!p || p.dead || !p.resources) return;
    const r = p.resources, s = Stats().statsOf(world, p), sec = dt / 1000;
    const inCombat = BD.sim.ai ? BD.sim.ai.playerInCombat(world) : false;
    if (r.rage) tickRage(world, p, r, s, sec);
    if (r.energy) r.energy.cur = Math.min(r.energy.max, r.energy.cur + (PlayerBalance.energyRegen + (s.energy_regen || 0)) * sec);
    if (r.combo && r.combo.n > 0) tickCombo(world, p, r, dt);
    if (r.mana) tickMana(world, p, r, s, sec);
    if (r.focus) tickFocus(world, p, r, dt, inCombat);
    tickLife(world, p, s, sec, inCombat);
  }

  BD.sim.resources = {
    init, kind, amount, canPay, spend, refund, gain, addCombo, takeCombo, combo, comboMax,
    checkMomentum, traitMods, critBonus, onHit, absorb, system, keystone,
  };
  BD.sim.damage.onHitHooks.push(onHit);
  BD.sim.world.addSystem('resources', system, 35);
})(globalThis.BD);
