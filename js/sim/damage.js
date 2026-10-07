// @ts-check
// The single entry point for ALL damage (06 §6): dodge → block → crit → multipliers →
// mitigation → shields → apply → on-hit. Kill processing is deferred to the end of the step.
(function (BD) {
  'use strict';

  const Balance = BD.data.balance;
  const Entities = BD.sim.entities;
  const Stats = () => BD.sim.stats;
  const Status = () => BD.sim.status;

  /** hooks: (world, src, tgt, packet, result) — status chances, leech, procs, resources, retaliation */
  const onHitHooks = [];
  /** hooks: (world, victim, killer, packet) */
  const onKillHooks = [];
  /** hooks: (world, src, tgt, packet, el) → extra multiplier (1 = none); situational only */
  const multHooks = [];

  /**
   * @typedef {{ srcId:number|null, tgtId:number, amounts:Record<string,number>, tags:string[], canCrit:boolean,
   *   canDodge:boolean, canBlock:boolean, mult:number, abilityId?:string, isDot?:boolean, forceCrit?:boolean,
   *   noOnHit?:boolean, critChanceAdd?:number, al?:number }} DamagePacket
   */

  function emitMiss(world, p, src, tgt, reason) {
    world.events.push({
      type: reason === 'dodge' ? 'dodge' : 'miss', srcId: p.srcId, tgtId: p.tgtId, reason,
      tags: p.tags, abilityId: p.abilityId, x: tgt.x, y: tgt.y,
    });
    if (reason !== 'immune') wake(world, tgt, src);
    return null;
  }

  const hasTag = (p, t) => p.tags && p.tags.indexOf(t) >= 0;
  const alOf = (world, e) => (e ? (e.kind === 'player' ? world.floor.al : e.al || world.floor.al) : world.floor.al);

  function rollDodge(world, src, tgt, p) {
    if (!(hasTag(p, 'melee') || hasTag(p, 'projectile'))) return false;
    if (src && Status().has(src, 'blinded') && world.rng.chance(BD.data.statuses.blinded.missChance)) return true;
    const ts = Stats().statsOf(world, tgt);
    if (tgt.kind === 'player') {
      const E_ = ts.evasionTotal, al = alOf(world, src);
      const ch = Math.min(Balance.combat.dodgeCap, E_ / (E_ + Balance.combat.evadeK + Balance.combat.evadePerAL * al));
      return world.rng.chance(ch);
    }
    return ts.evadeChance > 0 && world.rng.chance(ts.evadeChance);
  }

  function rollBlock(world, src, tgt, p) {
    if (!(hasTag(p, 'melee') || hasTag(p, 'projectile'))) return false;
    if (tgt.kind === 'player') {
      const ch = Stats().statsOf(world, tgt).blockChance;
      return ch > 0 && world.rng.chance(ch / 100);
    }
    // block_front: frontal hits only, AoE bypasses
    if (hasTag(p, 'aoe') || !src) return false;
    const bf = BD.sim.monsters && BD.sim.monsters.blockFront(tgt);
    if (!bf) return false;
    if (BD.sim.ai && BD.sim.ai.isDormantOrBusy && BD.sim.ai.isDormantOrBusy(tgt)) return false;
    if (!BD.sim.targeting.inFront(tgt, src.x, src.y)) return false;
    return world.rng.chance(bf);
  }

  function rollCrit(world, src, p) {
    if (p.forceCrit) return true;
    if (!src) return false;
    const s = Stats().statsOf(world, src);
    const resourceBonus = src.kind === 'player' && BD.sim.resources ? BD.sim.resources.critBonus(world, src) : 0;
    const ch = (s.critChance || 0) + (p.critChanceAdd || 0) + resourceBonus;
    return ch > 0 && world.rng.chance(Math.min(Balance.combat.critCap + 40, ch) / 100);
  }

  /** situational multipliers: weakened, vulnerable/shocked/exposed, vs-family, elites, hooks */
  function multipliers(world, src, tgt, p, el) {
    let k = Status().takenMult(world, tgt);
    if (src) k *= Status().dealtMult(world, src);
    if (src && src.kind !== 'monster' && tgt.kind === 'monster') {
      const s = src.kind === 'player' ? Stats().statsOf(world, src) : null;
      const fam = BD.sim.monsters ? BD.sim.monsters.family(tgt) : '';
      if (s) {
        if (fam === 'undead' && s.dmg_vs_undead_pct) k *= 1 + s.dmg_vs_undead_pct / 100;
        if (fam === 'demon' && s.dmg_vs_demon_pct) k *= 1 + s.dmg_vs_demon_pct / 100;
        if (tgt.rank !== 'normal' && s.dmg_vs_elite_pct) k *= 1 + s.dmg_vs_elite_pct / 100;
      }
    }
    for (let i = 0; i < multHooks.length; i++) k *= multHooks[i](world, src, tgt, p, el);
    return k;
  }

  function mitigation(world, src, tgt, el) {
    const ts = Stats().statsOf(world, tgt);
    if (tgt.kind === 'player' || tgt.kind === 'ally') {
      let m = 0;
      if (el === 'phys') {
        const A = ts.armorTotal || 0, al = alOf(world, src);
        m = Math.min(Balance.combat.armorCap, A / (A + Balance.combat.armorK + Balance.combat.armorPerAL * al));
      } else m = (ts.res ? ts.res[el] || 0 : 0) / 100;
      return 1 - (1 - m) * (1 - (ts.dr_pct || 0) / 100);
    }
    if (el === 'phys') return Math.min(0.75, (ts.dr_pct || 0) / 100);
    return Math.max(-1, Math.min(0.9, (ts.res ? ts.res[el] || 0 : 0) / 100));
  }

  function absorbShields(world, tgt, total) {
    const sh = Status().has(tgt, 'shielded');
    if (sh && sh.pool > 0) {
      const a = Math.min(sh.pool, total);
      sh.pool -= a; total -= a;
      if (sh.pool <= 0) Status().remove(world, tgt, 'shielded');
      world.events.push({ type: 'absorb', id: tgt.id, amount: a });
    }
    if (tgt.kind === 'player' && BD.sim.resources) total = BD.sim.resources.absorb(world, tgt, total);
    return total;
  }

  /** @param {DamagePacket} p */
  function dealDamage(world, p) {
    const src = Entities.get(world, p.srcId), tgt = Entities.get(world, p.tgtId);
    if (!tgt || tgt.hp <= 0 || tgt.dead) return null;
    if (src && src.faction === tgt.faction && src !== tgt && !p.noFaction) return null; // monsters never damage each other
    if (Status().invulnerable(tgt) || tgt.untargetable) return emitMiss(world, p, src, tgt, 'immune');
    if (p.canDodge && rollDodge(world, src, tgt, p)) return emitMiss(world, p, src, tgt, 'dodge');
    const blocked = p.canBlock && rollBlock(world, src, tgt, p);
    const crit = p.canCrit && rollCrit(world, src, p);
    let total = 0;
    const parts = {};
    const critMult = crit ? Stats().statsOf(world, src).critMult : 1;
    for (const el in p.amounts) {
      let v = p.amounts[el] * p.mult * multipliers(world, src, tgt, p, el);
      if (crit) v *= critMult;
      v *= 1 - mitigation(world, src, tgt, el);
      if (blocked) v *= 1 - Balance.combat.blockReduce;
      if (v > 0) { parts[el] = v; total += v; }
    }
    total = absorbShields(world, tgt, total);
    total = Math.max(1, Math.round(total));
    if (p.nonLethal && total >= tgt.hp) total = Math.max(0, tgt.hp - 1);
    tgt.hp -= total;
    if (tgt.kind === 'player') tgt.lastDamagedMs = world.time;
    if (src && src.kind === 'player') src.lastHitMs = world.time;
    const ev = {
      type: 'damage', srcId: p.srcId, tgtId: tgt.id, total, parts, crit, blocked,
      tags: p.tags, abilityId: p.abilityId, isDot: !!p.isDot,
      x: tgt.x, y: tgt.y, lethal: tgt.hp <= 0, maxPart: maxPart(parts),
    };
    world.events.push(ev);
    if (blocked) world.events.push({ type: 'block', id: tgt.id, srcId: p.srcId, x: tgt.x, y: tgt.y });
    if (crit) world.events.push({ type: 'crit', srcId: p.srcId, tgtId: tgt.id });
    const res = { total, crit, blocked, parts };
    if (!p.isDot && !p.noOnHit) for (let i = 0; i < onHitHooks.length; i++) onHitHooks[i](world, src, tgt, p, res);
    wake(world, tgt, src);
    if (tgt.hp <= 0) kill(world, tgt, src, p);
    return res;
  }
  function maxPart(parts) { let best = 'phys', v = -1; for (const k in parts) if (parts[k] > v) { v = parts[k]; best = k; } return best; }

  /** Every damage source wakes and alerts (including DoTs). */
  function wake(world, tgt, src) {
    if (tgt.kind === 'monster' && BD.sim.ai) BD.sim.ai.alert(world, tgt, src);
  }

  /** Mark dead now; full processing at the end of the step. */
  function kill(world, tgt, src, p) {
    if (tgt.dying) return;
    tgt.hp = 0;
    tgt.dying = true;
    world.pendingDeaths = world.pendingDeaths || [];
    world.pendingDeaths.push({
      id: tgt.id, killerId: src ? src.id : null, abilityId: p ? p.abilityId : null, tags: p ? p.tags : [],
      overkill: p ? p.amounts : null, element: p ? maxPart(p.amounts) : 'phys',
    });
  }

  /** End-of-step death processing (registered last). */
  function deathSystem(world) {
    const list = world.pendingDeaths;
    if (!list || !list.length) return;
    world.pendingDeaths = [];
    for (const d of list) {
      const e = Entities.get(world, d.id);
      if (!e || e.dead) continue;
      const killer = Entities.get(world, d.killerId);
      if (e.kind === 'player') {
        e.dead = true;
        world.events.push({ type: 'death', id: e.id, kind: 'player', killerId: d.killerId, abilityId: d.abilityId, x: e.x, y: e.y });
        if (BD.sim.death) BD.sim.death.onPlayerDeath(world, d);
        continue;
      }
      e.dead = true;
      const f = world.floor;
      Entities.vacate(f, e);
      f.entities.delete(e.id);
      if (e.kind === 'ally') { world.events.push({ type: 'death', id: e.id, kind: 'ally', x: e.x, y: e.y }); continue; }
      world.events.push({
        type: 'death', id: e.id, kind: e.kind, def: e.def, rank: e.rank, family: BD.sim.monsters ? BD.sim.monsters.family(e) : '',
        killerId: d.killerId, x: e.x, y: e.y, element: d.element,
      });
      for (let i = 0; i < onKillHooks.length; i++) onKillHooks[i](world, e, killer, d);
    }
  }

  BD.sim.damage = { dealDamage, kill, wake, mitigation, multipliers, onHitHooks, onKillHooks, multHooks, deathSystem };
  BD.sim.world.addSystem('deaths', deathSystem, 100);
})(globalThis.BD);
