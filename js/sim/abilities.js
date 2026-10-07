// @ts-check
// Ability engine (06 §7): resolve target → validate → (reject | approach | commit) → action
// (wind-up/cast) → impact (delivery + effects, in effects.js). Rejected casts cost nothing.
(function (BD) {
  'use strict';

  const Entities = BD.sim.entities;
  const Targeting = BD.sim.targeting;
  const Resources = () => BD.sim.resources;
  const Stats = () => BD.sim.stats;
  const Balance = BD.data.balance;
  const Grid = BD.core.grid;
  const { within, cheb, dirOf } = BD.core.util;

  const SkillBalance = Balance.skills;

  const PER_RANK_TABLE_LEN = 5;        // perRank tables cover ranks 1–5; higher ranks keep scaling
  const CHANNEL_RELEASE_MS = 260;      // a channel ends once the button hasn't been re-held for this long

  /** all ability defs by id (skills register into BD.data.skills) */
  function def(id) { return id === 'attack' ? BD.data.basicAttack : BD.data.skills[id]; }

  /** hard + soft ranks; soft ranks only on skills with ≥1 hard point; total capped at 8 */
  function rankOf(world, p, id) {
    if (id === 'attack') return 1;
    const hard = p.skills[id] || 0;
    if (!hard) return 0;
    const s = Stats().statsOf(world, p);
    return Math.min(SkillBalance.rankCap, hard + (s['skill_plus_' + id] || 0) + (s.all_skills || 0));
  }
  /** universal rank scaling 1 + 0.2(r−1), or perRank */
  function scale(eff, rank, key) {
    const k = key || 'mult';
    if (eff.perRank) {
      const beyond = rank > PER_RANK_TABLE_LEN ? 1 + SkillBalance.rankScaleStep * (rank - PER_RANK_TABLE_LEN) : 1;
      return eff.perRank[Math.min(eff.perRank.length, rank) - 1] * beyond;
    }
    return (eff[k] || 0) * (1 + SkillBalance.rankScaleStep * (rank - 1));
  }
  /** apply breakpoints: returns { effects, set } for this rank */
  function resolved(ab, rank, p) {
    const out = Object.assign({}, ab);
    out.effects = (ab.effects || []).slice();
    out.selfEffects = (ab.selfEffects || []).slice();
    for (const bp of ab.breakpoints || []) {
      if (rank < bp.rank) continue;
      if (bp.add) out.effects = out.effects.concat(bp.add);
      if (bp.addSelf) out.selfEffects = out.selfEffects.concat(bp.addSelf);
      if (bp.set) {
        for (const k in bp.set) {
          const v = bp.set[k];
          out[k] = typeof v === 'object' && !Array.isArray(v) ? Object.assign({}, out[k], v) : v;
        }
      }
    }
    if (BD.sim.powers && p) BD.sim.powers.modifyAbility(out, rank, p);
    return out;
  }

  /** basic attack specialised to the equipped weapon */
  function basicFor(world, p) {
    const s = Stats().statsOf(world, p);
    const w = s.weapon;
    const ab = Object.assign({}, BD.data.basicAttack);
    if (w.projectile) {
      ab.targeting = { mode: 'unit', range: w.range, requiresLOS: true, outOfRange: 'approach' };
      ab.delivery = { kind: 'projectile', projectile: w.projectile, pierce: w.pierce || 0, hitTiming: 'onImpact' };
      ab.tags = ['attack', 'basic', 'projectile'];
    } else if (w.reachLine) {
      ab.targeting = { mode: 'unit', range: w.reachLine, requiresLOS: true, outOfRange: 'approach' };
      ab.area = { shape: 'line', length: w.reachLine };
      ab.tags = ['attack', 'basic', 'melee'];
    } else ab.tags = ['attack', 'basic', 'melee'];
    if (BD.sim.powers) BD.sim.powers.modifyAbility(ab, 1, p);
    return ab;
  }

  function cooldownLeft(p, ab) {
    if (ab.charges) {
      const c = p.charges && p.charges[ab.id];
      return c && c.n <= 0 ? c.ms : 0;
    }
    return p.cooldowns[ab.id] || 0;
  }
  function cdTime(world, p, ab) {
    const s = Stats().statsOf(world, p);
    let ms = ab.cooldownMs || 0;
    const cfn = BD.sim.effects.scripts[ab.id + '.cooldown'];
    if (cfn) ms = cfn(world, p, ab, ms);
    if (BD.sim.powers) ms = BD.sim.powers.cooldown(world, p, ab, ms);
    return ms * (1 - Math.min(SkillBalance.cdrCapPct, s.cdr_pct || 0) / 100);
  }
  function maxCharges(world, p, ab) {
    let n = ab.charges || 0;
    if (BD.sim.powers) n = BD.sim.powers.charges(world, p, ab, n);
    return n;
  }

  /** timing: weapon cycle with impact at 40%, or spell cast with impact at the end */
  function timing(world, p, ab) {
    const s = Stats().statsOf(world, p);
    if (ab.castMs != null) {
      const c = ab.castMs / (ab.noIas ? 1 : 1 + s.ias / 100);
      return { windup: c, recover: ab.recoverMs || 0 };
    }
    if (ab.isSpell) return { windup: s.spellCastMs, recover: 0 };
    const cyc = s.attackCycleMs;
    return { windup: cyc * Balance.player.impactFrac, recover: cyc * (1 - Balance.player.impactFrac) };
  }

  function reject(world, p, ab, reason, extra) {
    world.events.push({ type: 'ability.reject', id: p.id, abilityId: ab.id, reason: BD.data.strings.t(reason, extra) });
    return { reject: reason };
  }

  /** resolve aim → target {entity?, x, y} */
  function resolveTarget(world, p, ab, aim) {
    const t = ab.targeting || { mode: 'self' };
    if (t.mode === 'self') return { x: p.x, y: p.y, self: true };
    if (aim === 'auto' || !aim) aim = Targeting.autoAim(world, p, t.range || 1);
    if (t.mode === 'unit') {
      let e = aim.entityId != null ? Entities.get(world, aim.entityId) : null;
      if (e && (e.dead || e.hp <= 0 || e.faction === 'player')) e = null;
      if (!e && aim.x != null) {
        const f = world.floor;
        const id = f.occ[Grid.idx(f, aim.x, aim.y)];
        const o = id ? Entities.get(world, id) : null;
        if (o && o.faction !== 'player') e = o;
        else e = Targeting.nearestEnemy(world, aim.x, aim.y, 1.5, 'player', null);
      }
      if (!e) return null;
      return { entity: e, x: e.x, y: e.y };
    }
    let x = aim.x, y = aim.y;
    let ent = aim.entityId != null ? Entities.get(world, aim.entityId) : null;
    if (ent && (ent.dead || ent.faction === 'player')) ent = null;
    if (ent) {
      x = ent.x;
      y = ent.y;
    }
    if (x == null) return null;
    if (t.mode === 'direction') return directionTarget(world, p, t, ent, x, y);
    return { x, y, entity: ent };
  }

  /** a clicked enemy is approached; otherwise swing toward the cursor from where we stand */
  function directionTarget(world, p, t, ent, x, y) {
    if (!ent) {
      const f = world.floor, id = f.occ[Grid.idx(f, x, y)];
      const o = id && id !== p.id ? Entities.get(world, id) : null;
      if (o && o.faction !== 'player') ent = o;
    }
    if (ent && cheb(p.x, p.y, ent.x, ent.y) <= (t.range || 1)) return { x: ent.x, y: ent.y, entity: ent };
    if (ent) return { x: ent.x, y: ent.y, entity: ent };
    const dx = Math.sign(x - p.x), dy = Math.sign(y - p.y);
    if (!dx && !dy) {
      const d = BD.core.util.DIRS[p.dir];
      return { x: p.x + d[0], y: p.y + d[1], entity: null };
    }
    return { x: p.x + dx, y: p.y + dy, entity: null };
  }

  /** @returns {{ok?:true, reject?:string, approach?:true}} exactly one of the three is set */
  function validate(world, p, ab, rank, tgt) {
    const t = ab.targeting || { mode: 'self' };
    if (!tgt) return reject(world, p, ab, 'no_target');
    if (p.attack && p.attack.phase === 'windup') return reject(world, p, ab, 'not_ready');
    if (p.attack && p.attack.phase === 'channel' && ab.id !== p.attack.abilityId) return reject(world, p, ab, 'not_ready');
    if (cooldownLeft(p, ab) > 0) return reject(world, p, ab, ab.charges ? 'no_charges' : 'not_ready');
    const res = ab.resource || { type: 'none', cost: 0 };
    if (!Resources().canPay(p, res.type, res.cost, res.minStart)) return reject(world, p, ab, 'no_resource', { res: res.type });
    if (ab.requires && !ab.requires(world, p)) return reject(world, p, ab, 'not_ready');
    if (t.mode !== 'self') {
      const range = t.range || 1;
      const inRange = range <= 1.5 && (ab.delivery.kind === 'melee')
        ? cheb(p.x, p.y, tgt.x, tgt.y) <= Math.max(1, Math.round(range))
        : within(p.x, p.y, tgt.x, tgt.y, range);
      const needLOS = t.requiresLOS !== false;
      const los = !needLOS || Targeting.hasLOS(world, p.x, p.y, tgt.x, tgt.y);
      if (!inRange || !los) {
        if (t.outOfRange === 'approach' && (tgt.entity || t.mode !== 'unit')) return { approach: true };
        return reject(world, p, ab, !los ? 'no_los' : 'out_of_range');
      }
      if (t.requiresVisible) {
        const f = world.floor;
        const ti = Grid.idx(f, tgt.x, tgt.y);
        if (!f.explored[ti] || (t.mode === 'point' && !f.visible[ti])) return reject(world, p, ab, 'out_of_range');
      }
    }
    if (BD.sim.effects.precheck) {
      const pr = BD.sim.effects.precheck(world, p, ab, rank, tgt);
      if (pr) return reject(world, p, ab, pr);
    }
    return { ok: true };
  }

  /**
   * Try to cast. aim: {x,y}|{entityId}|'auto'. Returns 'cast' | 'approach' | 'reject'.
   */
  function tryCast(world, p, abilityId, aim, opts) {
    const base = abilityId === 'attack' ? basicFor(world, p) : def(abilityId);
    if (!base) return 'reject';
    const rank = rankOf(world, p, abilityId);
    if (!rank) {
      reject(world, p, base, 'not_ready');
      return 'reject';
    }
    const ab = resolved(base, rank, p);
    if (abilityId === 'attack') {
      ab.targeting = base.targeting;
      ab.delivery = base.delivery;
      ab.area = base.area;
      ab.tags = base.tags;
    }
    // channel: holding re-issues keep it alive
    if (p.attack && p.attack.phase === 'channel' && p.attack.abilityId === abilityId) {
      p.attack.heldMs = 0;
      if (aim && aim !== 'auto' && aim.x != null) p.attack.moveTo = { x: aim.x, y: aim.y };
      return 'cast';
    }
    const tgt = resolveTarget(world, p, ab, aim);
    const v = validate(world, p, ab, rank, tgt);
    if (v.reject) return 'reject';
    if (v.approach) {
      p.intent = {
        kind: 'approachThenCast', abilityId, targetId: tgt.entity ? tgt.entity.id : null,
        x: tgt.x, y: tgt.y, range: ab.targeting.range, hold: !!(opts && opts.hold),
      };
      if (!tgt.entity) p.intent.kind = 'approachPoint';
      return 'approach';
    }
    commit(world, p, ab, rank, tgt, opts);
    return 'cast';
  }

  function commit(world, p, ab, rank, tgt, opts) {
    const res = ab.resource || { type: 'none', cost: 0 };
    const spent = res.type && res.type !== 'none' && res.cost ? Resources().spend(world, p, res.type, res.cost) : 0;
    const cd = cdTime(world, p, ab);
    if (ab.charges) {
      p.charges = p.charges || {};
      const mc = maxCharges(world, p, ab);
      const c = p.charges[ab.id] || (p.charges[ab.id] = { n: mc, ms: 0 });
      c.n--;
      if (c.ms <= 0) c.ms = cd;
    } else if (cd > 0) p.cooldowns[ab.id] = cd;
    if (tgt.x !== p.x || tgt.y !== p.y) p.dir = dirOf(tgt.x - p.x, tgt.y - p.y);
    const tm = timing(world, p, ab);
    const comboHeld = Resources().combo(p);
    const focusSpent = res.type === 'focus' ? spent : 0;
    p.attack = {
      abilityId: ab.id, rank, phase: ab.channel ? 'channel' : 'windup',
      remaining: ab.channel ? ab.channel.tickMs : tm.windup, recover: tm.recover,
      tx: tgt.x, ty: tgt.y, targetId: tgt.entity ? tgt.entity.id : null, spentType: res.type, spent, cdSet: cd, comboHeld,
      focusHeld: p.resources.focus ? p.resources.focus.n + focusSpent : 0,
      heldMs: 0, cancellable: !!ab.cancelOnMove,
      telegraph: !!ab.selfTelegraph,
    };
    p.lastActMs = world.time;
    if (ab.isSpell && res.cost && res.type === 'mana') p.lastCastMs = world.time;
    world.events.push({
      type: 'ability.cast', id: p.id, abilityId: ab.id, x: p.x, y: p.y, tx: tgt.x, ty: tgt.y,
      windupMs: tm.windup, weapon: Stats().statsOf(world, p).weapon.fx,
    });
    if (ab.selfTelegraph) {
      const tiles = BD.sim.targeting.areaTiles(ab.area, p.x, p.y, p.x, p.y, p.dir);
      const z = BD.sim.zones.create(world, {
        tiles, cx: p.x, cy: p.y, armMs: tm.windup, telegraph: true,
        faction: 'player', srcId: p.id, resolve: null, kind: 'self_tele',
      });
      p.attack.teleZone = z.id;
    }
    if (ab.onCommit) BD.sim.effects.special(world, p, ab, rank, 'commit', p.attack);
    if (tm.windup <= 0 && !ab.channel) actionTick(world, p, 0);
  }

  /** Cancel the player's own wind-up/cast/channel: refunds resource and cooldown. */
  function cancel(world, p, why) {
    const a = p.attack;
    if (!a) return;
    if (a.teleZone) {
      const zs = world.floor.zones, zi = zs.findIndex((z) => z.id === a.teleZone);
      if (zi >= 0) {
        zs.splice(zi, 1);
        world.events.push({ type: 'telegraph.end', zoneId: a.teleZone });
      }
    }
    if (a.phase === 'windup') {
      const ab = def(a.abilityId);
      if (a.spent) Resources().refund(world, p, a.spentType, a.spent);
      if (ab && ab.charges && p.charges[ab.id]) p.charges[ab.id].n++;
      else if (a.cdSet) p.cooldowns[a.abilityId] = 0;
      world.events.push({ type: 'ability.cancel', id: p.id, abilityId: a.abilityId, why });
    }
    if (a.phase === 'channel') world.events.push({ type: 'ability.end', id: p.id, abilityId: a.abilityId });
    p.attack = null;
  }

  /** per-step: advance the player's action (and allies'). */
  function actionTick(world, p, dt) {
    const a = p.attack;
    if (!a) return;
    const clk = BD.sim.status.clockMult(world, p);
    if (clk === 0 && a.phase === 'windup') {
      cancel(world, p, 'stunned');
      return;
    }
    a.remaining -= dt * (clk || 0);
    if (a.phase === 'channel') {
      a.heldMs += dt;
      if (a.remaining <= 0) {
        const ab = resolved(def(a.abilityId), a.rank, p);
        const cost = (ab.channel.costPerSec * ab.channel.tickMs) / 1000;
        if (a.heldMs > CHANNEL_RELEASE_MS || !Resources().canPay(p, ab.resource.type, cost)) {
          cancel(world, p, 'released');
          return;
        }
        Resources().spend(world, p, ab.resource.type, cost);
        a.remaining += ab.channel.tickMs;
        BD.sim.effects.impact(world, p, ab, a.rank, a);
      }
      return;
    }
    if (a.phase === 'windup' && a.remaining <= 0) {
      const ab = a.abilityId === 'attack' ? basicFor(world, p) : resolved(def(a.abilityId), a.rank, p);
      a.phase = 'recover';
      const left = a.remaining;
      a.remaining = a.recover + left;
      BD.sim.effects.impact(world, p, ab, a.rank, a);
      if (p.attack === a && a.remaining <= 0) p.attack = null;
      return;
    }
    if (a.phase === 'recover' && a.remaining <= 0) p.attack = null;
  }

  function chargeTick(world, p, dt) {
    if (!p.charges) return;
    for (const id in p.charges) {
      const c = p.charges[id], ab = def(id);
      const mc = maxCharges(world, p, ab);
      if (c.n >= mc) {
        c.ms = 0;
        c.n = mc;
        continue;
      }
      c.ms -= dt;
      if (c.ms <= 0) {
        c.n++;
        c.ms = c.n < mc ? cdTime(world, p, ab) : 0;
        world.events.push({ type: 'ability.ready', id: p.id, abilityId: id });
      }
    }
    for (const id in p.cooldowns) {
      const cd = p.cooldowns[id];
      if (cd > 0 && cd - dt <= 0 && id !== 'evade') world.events.push({ type: 'ability.ready', id: p.id, abilityId: id });
    }
  }

  /** Fired by PlayerIntent once in range (approachThenCast). */
  function fireApproach(world, p, it) {
    const aim = it.targetId != null ? { entityId: it.targetId } : { x: it.x, y: it.y };
    return tryCast(world, p, it.abilityId, aim, { hold: it.hold }) === 'cast';
  }

  function system(world, dt) {
    const p = world.player;
    if (!p || p.dead) return;
    chargeTick(world, p, dt);
    actionTick(world, p, dt);
  }

  /** passive stat mods from skills (keystones etc.) */
  function passiveMods(world, p, add) {
    for (const id in p.skills) {
      const ab = BD.data.skills[id];
      if (ab && ab.passive) ab.passive(p.skills[id], add, ab.name);
    }
    if (BD.sim.powers) BD.sim.powers.statMods(world, p, add);
  }

  BD.sim.abilities = {
    def, rankOf, scale, resolved, basicFor, cooldownLeft, cdTime, maxCharges, timing,
    tryCast, validate, resolveTarget, commit, cancel, actionTick, fireApproach, system, passiveMods,
  };
  BD.sim.world.addSystem('abilities', system, 8);
})(globalThis.BD);
