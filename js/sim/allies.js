// @ts-check
// Player-side summons and deployables (one ally runner): shadow clones, Valkyrie spirits (entities
// that monsters may target as decoys), and sentries (non-blocking deployables on a tile).
(function (BD) {
  'use strict';

  const Entities = BD.sim.entities;
  const Hits = () => BD.sim.hits;
  const { cheb, within, dirOf } = BD.core.util;
  /** deployable/summon kinds register their tick here */
  const kinds = {};
  function registerKind(id, impl) { kinds[id] = impl; }

  // ---------------- entity allies (clones, spirits) ----------------
  function spawnAlly(world, owner, o) {
    const f = world.floor;
    const spot = Entities.nearestFree(f, o.x, o.y, 3);
    if (!spot) return null;
    const id = world.nextId++;
    const ownerStats = BD.sim.stats.statsOf(world, owner);
    const a = Entities.makeEntity(id, 'ally', o.kind, spot.x, spot.y, {
      faction: 'player', ownerId: owner.id, ownerEquip: owner.equip, art: o.art, palOverride: o.pal || null, allyKind: o.kind,
      lifeMs: o.lifeMs, mult: o.mult, decoy: o.decoy || 0, rank: 'normal', runtime: true, abilityRank: o.rank || 1,
      maxLifeOwn: Math.round(ownerStats.maxLife * (o.lifePct || 0.5)), cd: 0, javelinCd: 0, throws: !!o.throws,
    });
    a.hp = a.maxLifeOwn;
    a.dir = owner.dir;
    f.entities.set(id, a);
    Entities.occupy(f, a);
    f.allies = f.allies || [];
    f.allies.push(id);
    world.events.push({ type: 'ally.spawn', id, kind: o.kind, x: a.x, y: a.y });
    return a;
  }
  /** allies' derived stats: life of their own, owner's offense */
  function stats(world, a) {
    const owner = world.player;
    const os = BD.sim.stats.statsOf(world, owner);
    const s = BD.sim.stats.newStats();
    s.maxLife = a.maxLifeOwn || 50;
    s.armorTotal = os.armorTotal; s.res = os.res; s.evasionTotal = os.evasionTotal; s.blockChance = 0;
    s.critChance = os.critChance; s.critMult = os.critMult; s.dr_pct = 0;
    s.weapon = os.weapon; s.wieldValue = os.wieldValue; s.attackCycleMs = os.attackCycleMs; s.moveMs = 280;
    s.statusChanceMult = os.statusChanceMult;
    return s;
  }

  function allyStep(world, a, dt) {
    const f = world.floor, owner = world.player;
    a.lifeMs -= dt;
    if (a.lifeMs <= 0 || owner.dead) { despawn(world, a); return; }
    if (a.move) return;
    a.cd -= dt; a.javelinCd -= dt;
    if (a.cd > 0) return;
    // pick the nearest enemy near the owner (the locked target first)
    let t = owner.lockId != null ? Entities.get(world, owner.lockId) : null;
    if (!t || t.dead || t.hp <= 0 || !within(t.x, t.y, owner.x, owner.y, 9)) {
      t = BD.sim.targeting.nearestEnemy(world, a.x, a.y, 8, 'player', null);
    }
    if (!t) {
      // follow the owner
      if (cheb(a.x, a.y, owner.x, owner.y) > 2) stepToward(world, a, owner.x, owner.y);
      a.cd = 200;
      return;
    }
    if (a.throws && a.javelinCd <= 0 && cheb(a.x, a.y, t.x, t.y) >= 2 && BD.sim.targeting.hasLOS(world, a.x, a.y, t.x, t.y)) {
      a.javelinCd = 2500; a.cd = 500;
      const ab = BD.sim.abilities.resolved(BD.data.skills.javelin, a.abilityRank, owner);
      const ctx = BD.sim.effects.baseCtx(world, owner, ab, a.abilityRank, null);
      ctx.srcId = a.id; ctx.packetMult = a.mult;
      BD.sim.projectiles.fireAbility(world, a, ab, a.abilityRank, null, t.x, t.y, ctx);
      return;
    }
    if (cheb(a.x, a.y, t.x, t.y) <= 1) {
      a.dir = dirOf(t.x - a.x, t.y - a.y);
      const h = Hits().computeHit(world, owner, { tags: ['melee'] }, { source: 'weapon', mult: a.mult }, 1, { rng: world.rng });
      BD.sim.damage.dealDamage(world, {
        srcId: a.id, tgtId: t.id, amounts: h.amounts, tags: ['melee', 'ally'],
        canCrit: true, canDodge: true, canBlock: true, mult: 1, abilityId: 'ally',
      });
      world.events.push({ type: 'ability.impact', id: a.id, abilityId: 'ally', x: a.x, y: a.y, tx: t.x, ty: t.y, kind: 'melee' });
      a.cd = Math.max(450, BD.sim.stats.statsOf(world, owner).attackCycleMs);
      return;
    }
    stepToward(world, a, t.x, t.y);
    a.cd = 0;
  }
  function stepToward(world, a, x, y) {
    const path = BD.sim.pathing.path(world, a.x, a.y, x, y);
    if (path && path.length && BD.sim.movement.startStep(world, a, path[0][0], path[0][1], 260)) return true;
    return false;
  }
  function despawn(world, a) {
    const f = world.floor;
    if (a.dead) return;
    a.dead = true;
    Entities.vacate(f, a);
    f.entities.delete(a.id);
    f.allies = (f.allies || []).filter((id) => id !== a.id);
    world.events.push({ type: 'ally.end', id: a.id, kind: a.allyKind, x: a.x, y: a.y });
  }
  function alliesOf(world, kind) {
    const out = [];
    for (const id of world.floor.allies || []) {
      const a = Entities.get(world, id);
      if (a && !a.dead && (!kind || a.allyKind === kind)) out.push(a);
    }
    return out;
  }

  // ---------------- deployables (sentries) ----------------
  function deploy(world, d) {
    const f = world.floor;
    f.deployables = f.deployables || [];
    d.id = world.nextId++;
    f.deployables.push(d);
    world.events.push({ type: 'deploy', id: d.id, kind: d.kind, x: d.x, y: d.y });
    return d;
  }
  function deployed(world, kind) { return (world.floor.deployables || []).filter((d) => d.kind === kind); }
  function removeDeploy(world, d) {
    const f = world.floor;
    f.deployables = f.deployables.filter((x) => x !== d);
    world.events.push({ type: 'deploy.end', id: d.id, kind: d.kind, x: d.x, y: d.y });
  }

  function system(world, dt) {
    const f = world.floor;
    if (f.allies && f.allies.length) {
      for (const id of f.allies.slice()) {
        const a = Entities.get(world, id);
        if (a && !a.dead) allyStep(world, a, dt);
      }
    }
    if (f.deployables && f.deployables.length) {
      for (const d of f.deployables.slice()) {
        const k = kinds[d.kind];
        if (k) k.tick(world, d, dt);
      }
    }
    // Shieldmaiden's Oath: a buff while a Valkyrie spirit fights beside you
    const p = world.player;
    if (p && p.skills && p.skills.shieldmaidens_oath) {
      const on = alliesOf(world, 'valkyrie').length > 0;
      const has = BD.sim.status.has(p, 'oath');
      if (on && !has) BD.sim.status.apply(world, p, 'oath', { durMs: 0 });
      else if (!on && has) BD.sim.status.remove(world, p, 'oath');
    }
  }

  /** delivery 'summon' / 'deploy' → class scripts decide what appears */
  function fromAbility(world, caster, ab, rank, a, tx, ty, ctx) {
    BD.sim.effects.special(world, caster, ab, rank, 'summon', { a, tx, ty, ctx });
  }

  /** despawn runtime allies on floor change (they are not saved) */
  function clear(world) { if (world.floor) { world.floor.allies = []; world.floor.deployables = []; } }

  BD.sim.allies = { spawnAlly, stats, despawn, alliesOf, deploy, deployed, removeDeploy, registerKind, system, fromAbility, clear, kinds };
  BD.sim.world.addSystem('allies', system, 18);
})(globalThis.BD);
