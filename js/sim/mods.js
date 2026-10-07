// @ts-check
// Champion mod runtime effects (04 §3.5): periodic bursts, teleports, mortars, shields, trails,
// on-hit/dealt effects and death bursts. All telegraphed through zones.
(function (BD) {
  'use strict';

  const ChampionMods = () => BD.data.championMods;
  const Entities = BD.sim.entities;
  const Monsters = BD.sim.monsters;
  const AiMoves = () => BD.sim.ai_moves;
  const { cheb } = BD.core.util;
  const hasMod = (e, id) => e.mods && e.mods.indexOf(id) >= 0;

  function due(world, e, key, every) {
    const cds = e.ai.cds;
    if (cds[key] == null) { cds[key] = world.time + every * (0.4 + 0.6 * ((e.id % 10) / 10)); return false; }
    if (world.time < cds[key]) return false;
    cds[key] = world.time + every;
    return true;
  }

  function tick(world, e) {
    if (!e.mods.length || e.ai.state === 'windup') return;
    const p = world.player;
    const near = cheb(e.x, e.y, p.x, p.y) <= 9;
    for (const id of e.mods) {
      const m = ChampionMods()[id];
      if (!m) continue;
      if (m.periodic && near && due(world, e, 'mod_' + id, m.periodic.everyMs)) {
        const pd = m.periodic;
        AiMoves().strike(world, e, AiMoves().circle(e.x, e.y, pd.radius), pd.armMs, pd.mult, {
          element: pd.element, school: pd.school, statuses: [{ id: pd.status, durMs: pd.statusMs }],
          cx: e.x, cy: e.y, kind: 'mod_burst',
        });
      }
      if (m.teleportEveryMs && near && due(world, e, 'mod_tp', m.teleportEveryMs)) {
        const spot = Entities.nearestFree(world.floor, p.x, p.y, 2, (x, y) => cheb(x, y, p.x, p.y) === 1);
        if (spot) {
          world.events.push({ type: 'shimmer', id: e.id, x: e.x, y: e.y, ms: m.shimmerMs });
          BD.core.scheduler.after(world, m.shimmerMs, 'mod.teleport', { id: e.id, x: spot.x, y: spot.y });
        }
      }
      if (m.mortar && near && due(world, e, 'mod_mortar', m.mortar.everyMs)) {
        const md = m.mortar;
        world.events.push({ type: 'lob', srcId: e.id, fromX: e.x, fromY: e.y, x: p.x, y: p.y, ms: md.armMs, kind: 'mortar' });
        AiMoves().strike(world, e, AiMoves().circle(p.x, p.y, md.radius), md.armMs, md.mult, {
          element: md.element, school: md.school, cx: p.x, cy: p.y, kind: 'mortar',
        });
      }
      if (m.shield && due(world, e, 'mod_shield', m.shield.everyMs)) {
        let best = null;
        for (const o of world.floor.entities.values()) {
          if (o.dead || o.faction !== 'monster' || o === e || cheb(o.x, o.y, e.x, e.y) > m.shield.radius) continue;
          if (!best || o.hp / BD.sim.stats.statsOf(world, o).maxLife < best.hp / BD.sim.stats.statsOf(world, best).maxLife) best = o;
        }
        if (best) {
          const magnitude = BD.sim.stats.statsOf(world, best).maxLife * m.shield.pct;
          BD.sim.status.apply(world, best, 'shielded', { durMs: 6000, magnitude });
          world.events.push({ type: 'mod.shield', from: e.id, to: best.id });
        }
      }
    }
  }
  BD.core.scheduler.register('mod.teleport', (world, pl) => {
    const e = Entities.get(world, pl.id);
    if (!e || e.dead) return;
    const spot = Entities.isFree(world.floor, pl.x, pl.y) ? pl : Entities.nearestFree(world.floor, pl.x, pl.y, 2);
    if (!spot) return;
    const fx = e.x, fy = e.y;
    BD.sim.movement.displace(world, e, spot.x, spot.y, 1, 'blink');
    e.move = null;
    world.events.push({ type: 'blink', id: e.id, fromX: fx, fromY: fy, x: spot.x, y: spot.y });
  });

  function onStep(world, e) {
    if (!hasMod(e, 'molten')) return;
    // the trail is left on the tile being stepped off
    const tile = [e.move ? e.move.fromX : e.x, e.move ? e.move.fromY : e.y];
    const amount = Monsters.avgDmg(world, e) * 0.15;
    BD.sim.zones.ground(world, 'molten_trail', [tile], { durMs: 3000, faction: 'monster', srcId: e.id, amount });
  }

  BD.sim.damage.onHitHooks.push((world, src, tgt, pk, res) => {
    // dealt by a modded monster
    if (src && src.kind === 'monster' && src.mods.length && !pk.isDot) {
      for (const id of src.mods) {
        const m = ChampionMods()[id];
        if (m && m.onHit) BD.sim.status.apply(world, tgt, m.onHit.status, { durMs: m.onHit.durMs, sourceId: src.id });
        if (m && m.leech) BD.sim.status.heal(world, src, res.total * m.leech);
      }
    }
    // taken by a lightning-enchanted monster: release sparks (visible crackle aura)
    const sparkReady = (e) => !e._sparkAt || world.time - e._sparkAt >= ChampionMods().lightning_enchanted.sparkCdMs;
    if (tgt.kind === 'monster' && hasMod(tgt, 'lightning_enchanted') && !pk.isDot && sparkReady(tgt)) {
      Object.defineProperty(tgt, '_sparkAt', { value: world.time, writable: true, configurable: true, enumerable: false });
      const amt = Monsters.avgDmg(world, tgt) * 0.5;
      for (let i = 0; i < 3; i++) {
        const a = world.rng.range(0, Math.PI * 2);
        BD.sim.projectiles.spawn(world, {
          kind: 'spark', srcId: tgt.id, faction: 'monster', x: tgt.x, y: tgt.y, dx: Math.cos(a), dy: Math.sin(a), maxDist: 5,
          payload: { type: 'packet', amounts: { light: amt } },
        });
      }
    }
  });

  BD.sim.damage.onKillHooks.push((world, e) => {
    if (!e.mods || !e.mods.length) return;
    for (const id of e.mods) {
      const m = ChampionMods()[id];
      if (!m || !m.deathZone) continue;
      const dz = m.deathZone;
      const tiles = AiMoves().circle(e.x, e.y, dz.radius);
      const amounts = {}; amounts[dz.element] = Monsters.avgDmg(world, e) * dz.mult;
      BD.sim.zones.create(world, {
        tiles, cx: e.x, cy: e.y, armMs: dz.armMs, faction: 'monster', srcId: null, school: dz.school, heavy: true, kind: 'death_burst',
        resolve: { type: 'packet', amounts, statuses: dz.status ? [{ id: dz.status, durMs: dz.statusMs }] : [] },
      });
    }
  });

  BD.sim.mods = { tick, onStep, hasMod };
})(globalThis.BD);
