// @ts-check
// Player-facing combat glue: basic attack (as an ability), force attack, UseSkill command,
// flask, corpses. Everything routes through the ability engine and the damage pipeline.
(function (BD) {
  'use strict';

  const E = BD.sim.entities;
  const AB = () => BD.sim.abilities;
  const B = BD.data.balance;
  const CMD = BD.sim.commands;

  function basicRange(world, p) {
    const w = BD.sim.stats.statsOf(world, p).weapon;
    return w.projectile ? w.range : w.reachLine ? w.reachLine : 1;
  }

  /** Engage intent fires this when in range. */
  function playerBasicAttack(world, p, t) {
    if (p.attack) return false;
    return AB().tryCast(world, p, 'attack', { entityId: t.id, x: t.x, y: t.y }) === 'cast';
  }

  /** Shift+click: attack the tile in place (no movement). */
  function forceAttack(world, p, x, y) {
    if (p.attack) return;
    const f = world.floor;
    const occ = f.occ[y * f.w + x];
    const t = occ && occ !== p.id ? E.get(world, occ) : null;
    if (t && t.faction !== 'player') { AB().tryCast(world, p, 'attack', { entityId: t.id }); return; }
    // swing at the air toward the tile
    const w = BD.sim.stats.statsOf(world, p).weapon;
    const near = BD.sim.targeting.nearestEnemy(world, x, y, 1.5, 'player', null);
    if (near && (w.projectile || BD.core.util.cheb(p.x, p.y, near.x, near.y) <= 1)) { AB().tryCast(world, p, 'attack', { entityId: near.id }); return; }
    p.dir = BD.core.util.dirOf(x - p.x, y - p.y);
    world.events.push({ type: 'miss', srcId: p.id, tgtId: null, reason: 'whiff', tags: ['melee'], x, y });
  }

  // ---- commands ----
  CMD.register('UseSkill', (world, c) => {
    const p = world.player;
    const id = p.bar[c.slot];
    if (!id) return;
    if (p.attack && p.attack.phase === 'recover') { p.queued = { id, aim: c.aim, hold: c.hold }; return; }
    if (p.attack && p.attack.phase === 'windup') { if (!c.hold) p.queued = { id, aim: c.aim, hold: c.hold }; return; }
    AB().tryCast(world, p, id, c.aim, { hold: c.hold });
  });
  CMD.register('DrinkFlask', (world) => drinkFlask(world, world.player));

  /** fire a buffered cast when the current action ends */
  function queueSystem(world) {
    const p = world.player;
    if (!p || p.dead || p.attack || !p.queued) return;
    const q = p.queued; p.queued = null;
    AB().tryCast(world, p, q.id, q.aim, { hold: q.hold });
  }

  function drinkFlask(world, p) {
    const fl = p.flask;
    if ((p.cooldowns.flask || 0) > 0) return BD.sim.interact.deny(world, 'flask_cd');
    if (fl.charges <= 0) return BD.sim.interact.deny(world, 'no_flask');
    const s = BD.sim.stats.statsOf(world, p);
    fl.charges--;
    p.cooldowns.flask = B.player.flaskCdMs;
    let pct = B.player.flaskHealPct * (1 + (s.flask_heal_pct || 0) / 100);
    if (world.run.ascension >= 4) pct *= 0.8;
    BD.sim.status.apply(world, p, 'healing', { durMs: B.player.flaskHealMs, magnitude: (s.maxLife * pct) / 100 });
    BD.sim.status.cleanse(world, p, ['poisoned', 'bleeding']);
    world.events.push({ type: 'flask.drink', id: p.id, charges: fl.charges, x: p.x, y: p.y });
    return true;
  }

  // ---- corpses: sim objects with a lifetime (revives, ghouls, Death Sentry, Pyre) ----
  BD.sim.damage.onKillHooks.push((world, e) => {
    const d = BD.sim.monsters.defOf(e);
    if (!d || d.spawner || e.def === 'hellimp') return;
    const max = BD.sim.stats.statsOf(world, e).maxLife;
    world.floor.corpses.push({ id: e.id, def: e.def, x: e.x, y: e.y, packId: e.packId, rank: e.rank, maxLife: max, ms: B.monsters.corpseMs, dir: e.dir, palOverride: e.palOverride || null });
    world.events.push({ type: 'corpse', id: e.id, def: e.def, x: e.x, y: e.y });
  });
  function corpseSystem(world, dt) {
    const c = world.floor.corpses;
    for (let i = 0; i < c.length; i++) { c[i].ms -= dt; if (c[i].ms <= 0) { world.events.push({ type: 'corpse.end', id: c[i].id }); c.splice(i--, 1); } }
  }

  BD.sim.combat = { basicRange, playerBasicAttack, forceAttack, drinkFlask, queueSystem, corpseSystem };
  BD.sim.world.addSystem('queue', queueSystem, 9);
  BD.sim.world.addSystem('corpses', corpseSystem, 40);
})(globalThis.BD);
