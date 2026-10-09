// @ts-check
// Player-facing combat glue: basic attack (as an ability), force attack, UseSkill command,
// flask, corpses. Everything routes through the ability engine and the damage pipeline.
(function (BD) {
  'use strict';

  const Entities = BD.sim.entities;
  const Abilities = () => BD.sim.abilities;
  const Balance = BD.data.balance;
  const Ascension = BD.data.ascension;
  const Commands = BD.sim.commands;
  const Grid = BD.core.grid;

  const AIR_SWING_SNAP_RADIUS = 1.5;   // a force-attack near an enemy snaps onto it
  const SHORT_NOTICE_MS = 1200;        // how often "not enough resource" is announced while falling back

  /** the skill on the left-click slot, if it can sit there (ignores whether it's affordable) */
  function slottedPrimary(p) {
    const id = p.bar.lmb;
    return id && p.skills[id] && Abilities().canBePrimary(BD.data.skills[id]) ? id : null;
  }
  /** what a left click on an enemy casts: the left-click skill while the hero can pay for it, else the basic attack */
  function primaryId(world, p) {
    const id = slottedPrimary(p);
    return id && Abilities().affordable(world, p, id) ? id : 'attack';
  }
  /** the click fell back to the basic attack for lack of resource: say so (throttled) so the orb can flash */
  function noteShort(world, p, id, wanted) {
    const want = wanted || slottedPrimary(p);
    if (id !== 'attack' || !want || world.time - (p.shortNoticeMs || -1e9) < SHORT_NOTICE_MS) return;
    p.shortNoticeMs = world.time;
    world.events.push({ type: 'resource.short', id: p.id, abilityId: want, res: BD.sim.resources.kind(p) });
  }

  function basicRange(world, p) {
    const id = primaryId(world, p);
    if (id !== 'attack') return BD.data.skills[id].targeting.range || 1;
    const w = BD.sim.stats.statsOf(world, p).weapon;
    if (w.projectile) return w.range;
    return w.reachLine ? w.reachLine : 1;
  }

  /** Engage intent fires this when in range. */
  function playerBasicAttack(world, p, t) {
    if (p.attack) return false;
    const id = primaryId(world, p);
    noteShort(world, p, id);
    return Abilities().tryCast(world, p, id, { entityId: t.id, x: t.x, y: t.y }) === 'cast';
  }

  /** Shift+click: attack the tile in place (no movement). */
  function forceAttack(world, p, x, y) {
    if (p.attack) return;
    const f = world.floor;
    const occ = f.occ[Grid.idx(f, x, y)];
    const t = occ && occ !== p.id ? Entities.get(world, occ) : null;
    const id = primaryId(world, p);
    if (t && t.faction !== 'player') {
      noteShort(world, p, id);
      Abilities().tryCast(world, p, id, { entityId: t.id, x: t.x, y: t.y });
      return;
    }
    // a left-click skill aimed at the ground: a swing toward the tile, or a shot at it when in range (never a walk)
    const tg = id === 'attack' ? null : BD.data.skills[id].targeting;
    if (tg && (tg.mode === 'direction' || (tg.mode === 'point' && BD.core.util.within(p.x, p.y, x, y, tg.range)))) {
      Abilities().tryCast(world, p, id, { x, y });
      return;
    }
    // swing at the air toward the tile
    const w = BD.sim.stats.statsOf(world, p).weapon;
    const near = BD.sim.targeting.nearestEnemy(world, x, y, AIR_SWING_SNAP_RADIUS, 'player', null);
    if (near && (w.projectile || BD.core.util.cheb(p.x, p.y, near.x, near.y) <= 1)) {
      Abilities().tryCast(world, p, 'attack', { entityId: near.id });
      return;
    }
    p.dir = BD.core.util.dirOf(x - p.x, y - p.y);
    world.events.push({ type: 'miss', srcId: p.id, tgtId: null, reason: 'whiff', tags: ['melee'], x, y });
  }

  // ---- commands ----
  Commands.register('UseSkill', (world, c) => {
    const p = world.player;
    const id = p.bar[c.slot];
    if (!id) return;
    // mid-swing: buffer the cast (a held button only re-buffers once the swing is recovering)
    if (p.attack && p.attack.phase === 'recover') {
      p.queued = { id, slot: c.slot, aim: c.aim, hold: c.hold };
      return;
    }
    if (p.attack && p.attack.phase === 'windup') {
      if (!c.hold) p.queued = { id, slot: c.slot, aim: c.aim, hold: c.hold };
      return;
    }
    castOrFallback(world, p, c.slot, id, c.aim, c.hold);
  });

  /**
   * The right-click skill aimed at an enemy but unaffordable falls back like a left click: the hero attacks it
   * (left-click skill or basic attack) and the orb flashes. Holding the button then builds the resource with
   * attacks and spends it on the skill as soon as it can.
   */
  function castOrFallback(world, p, slot, id, aim, hold) {
    const t = slot === 'rmb' && aim && aim.entityId != null ? Entities.get(world, aim.entityId) : null;
    const aimed = BD.data.skills[id] && BD.data.skills[id].targeting && BD.data.skills[id].targeting.mode !== 'self';
    if (t && aimed && !t.dead && t.faction !== 'player' && !Abilities().affordable(world, p, id)) {
      noteShort(world, p, 'attack', id);
      p.intent = { kind: 'engage', targetId: t.id, hold: false };
      return;
    }
    Abilities().tryCast(world, p, id, aim, { hold });
  }
  Commands.register('DrinkFlask', (world) => drinkFlask(world, world.player));

  /** fire a buffered cast when the current action ends */
  function queueSystem(world) {
    const p = world.player;
    if (!p || p.dead || p.attack || !p.queued) return;
    const q = p.queued;
    p.queued = null;
    castOrFallback(world, p, q.slot, q.id, q.aim, q.hold);
  }

  function drinkFlask(world, p) {
    const fl = p.flask;
    if ((p.cooldowns.flask || 0) > 0) return BD.sim.interact.deny(world, 'flask_cd');
    if (fl.charges <= 0) return BD.sim.interact.deny(world, 'no_flask');
    const s = BD.sim.stats.statsOf(world, p);
    fl.charges--;
    p.cooldowns.flask = Balance.player.flaskCdMs;
    let pct = Balance.player.flaskHealPct * (1 + (s.flask_heal_pct || 0) / 100);
    if (world.run.ascension >= Ascension.flask.level) pct *= Ascension.flask.healMult;
    BD.sim.status.apply(world, p, 'healing', { durMs: Balance.player.flaskHealMs, magnitude: (s.maxLife * pct) / 100 });
    BD.sim.status.cleanse(world, p, ['poisoned', 'bleeding']);
    world.events.push({ type: 'flask.drink', id: p.id, charges: fl.charges, x: p.x, y: p.y });
    return true;
  }

  // ---- corpses: sim objects with a lifetime (revives, ghouls, Death Sentry, Pyre) ----
  BD.sim.damage.onKillHooks.push((world, e) => {
    const d = BD.sim.monsters.defOf(e);
    if (!d || d.spawner || d.role === 'bomber') return;   // bombers blow themselves up
    const max = BD.sim.stats.statsOf(world, e).maxLife;
    world.floor.corpses.push({
      id: e.id, def: e.def, x: e.x, y: e.y, packId: e.packId, rank: e.rank, maxLife: max,
      ms: Balance.monsters.corpseMs, dir: e.dir, palOverride: e.palOverride || null, risen: !!e.risen,
    });
    world.events.push({ type: 'corpse', id: e.id, def: e.def, x: e.x, y: e.y });
  });
  function corpseSystem(world, dt) {
    const c = world.floor.corpses;
    for (let i = 0; i < c.length; i++) {
      c[i].ms -= dt;
      if (c[i].ms <= 0) {
        world.events.push({ type: 'corpse.end', id: c[i].id });
        c.splice(i--, 1);
      }
    }
  }

  BD.sim.combat = { primaryId, basicRange, playerBasicAttack, forceAttack, drinkFlask, queueSystem, corpseSystem };
  BD.sim.world.addSystem('queue', queueSystem, 9);
  BD.sim.world.addSystem('corpses', corpseSystem, 40);
})(globalThis.BD);
