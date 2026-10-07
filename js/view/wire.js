// @ts-check
// Event → visual reactions. Gameplay never names a colour or an effect; the view decides here.
(function (BD) {
  'use strict';

  const Fx = () => BD.view.fx;
  const FloatText = () => BD.view.floattext;
  const EntityView = BD.view.entities;
  const Entities = () => BD.sim.entities;
  const currentWorld = () => BD.view.host.world();

  const ELEMENT_FLAIR = { fire: 'flair_fire', cold: 'flair_cold', light: 'flair_light', pois: 'flair_pois' };
  const WEAPON_IMPACT = {
    dagger: 'impact_dagger', sword: 'impact_sword', staff: 'impact_staff', club: 'impact_club',
    mace: 'impact_mace', arrow: 'impact_arrow', bolt: 'impact_bolt',
  };
  const STATUS_WORDS = {
    burning: 'Burning', chilled: 'Chilled', frozen: 'Frozen', shocked: 'Shocked', poisoned: 'Poisoned',
    bleeding: 'Bleeding', stunned: 'Stunned', feared: 'Feared', weakened: 'Weakened', vulnerable: 'Vulnerable',
    rooted: 'Rooted', slowed: 'Slowed', blinded: 'Blinded', taunted: 'Taunted',
  };
  const hasTag = (ev, tag) => !!(ev.tags && ev.tags.indexOf(tag) >= 0);

  // Player hit recipe: melee swings use the weapon's signature impact, projectiles the arrow, the rest magic.
  function playerHitRecipe(ev, weaponFx) {
    if ((ev.abilityId === 'attack' || hasTag(ev, 'melee')) && weaponFx) return WEAPON_IMPACT[weaponFx] || 'impact_club';
    return hasTag(ev, 'projectile') ? 'impact_arrow' : 'impact_magic';
  }

  /** hitstop for a crit, a killing blow or a heavy hit */
  function hitstopMs(ev) {
    if (ev.crit) return 55;
    return ev.lethal ? 40 : 70;
  }
  function damageTextStyle(ev, toPlayer) {
    if (toPlayer) return 'taken';
    return ev.crit ? 'crit' : 'dmg';
  }

  function onDamage(ev) {
    const w = currentWorld();
    EntityView.onDamage(w, ev);
    const tgt = Entities().get(w, ev.tgtId), src = Entities().get(w, ev.srcId);
    const toPlayer = tgt && tgt.kind === 'player';
    const x = ev.x, y = ev.y;
    if (!ev.isDot) {
      if (src && src.kind === 'player' && !toPlayer) {
        const fx = hasTag(ev, 'projectile') ? null : BD.sim.stats.statsOf(w, src).weapon.fx;
        Fx().play(playerHitRecipe(ev, fx), x, y, {
          dir: { x: x - src.x, y: y - src.y },
          school: BD.view.palette.ELEMENT_SCHOOL[ev.maxPart] || 'general',
          scale: ev.crit ? 1.6 : 1,
        });
      } else if (toPlayer) {
        Fx().play('monster_hit', x, y, { dir: src ? { x: x - src.x, y: y - src.y } : null });
        BD.view.camera.addTrauma(ev.tags && ev.tags.indexOf('heavy') >= 0 ? 0.5 : 0.15);
      } else Fx().play('impact_magic', x, y, { school: BD.view.palette.ELEMENT_SCHOOL[ev.maxPart] || 'general' });
      for (const el in ev.parts) if (ELEMENT_FLAIR[el] && ev.parts[el] > ev.total * 0.15) Fx().play(ELEMENT_FLAIR[el], x, y);
      if (ev.crit || ev.lethal || (ev.tags && ev.tags.indexOf('heavy') >= 0)) BD.view.host.hitstop(hitstopMs(ev));
      if (ev.crit) BD.view.camera.addTrauma(0.15);
    }
    FloatText().add(String(ev.total), x, y, damageTextStyle(ev, toPlayer), { id: ev.tgtId });
  }

  /** a new world or floor: drop every transient visual */
  function wireResets(bus) {
    bus.on('app.world', () => {
      Fx().clear();
      FloatText().clear();
      EntityView.clear();
      BD.view.world.clear();
      BD.view.tiles.invalidate();
    });
    bus.on('floor.enter', () => {
      Fx().clear();
      FloatText().clear();
      EntityView.clear();
      BD.view.world.clear();
      BD.view.camera.cam.init = false;
    });
  }

  /** hits, misses, healing, xp, statuses, deaths and alerts */
  function wireCombat(bus) {
    bus.on('damage', onDamage);
    bus.on('miss', (ev) => {
      if (ev.reason === 'whiff') Fx().play('whiff', ev.x, ev.y);
      else if (ev.reason === 'immune') FloatText().add('Immune', ev.x, ev.y, 'miss', { id: ev.tgtId });
    });
    bus.on('dodge', (ev) => FloatText().add(ev.tgtId === 1 ? 'Dodge' : 'Miss', ev.x, ev.y, 'miss', { id: ev.tgtId }));
    bus.on('block', (ev) => {
      Fx().play('block', ev.x, ev.y);
      FloatText().add('Block', ev.x, ev.y, 'miss', { id: ev.id });
    });
    bus.on('heal', (ev) => {
      const e = Entities().get(currentWorld(), ev.id);
      if (!e) return;
      FloatText().merge('heal' + ev.id, ev.amount, e.x, e.y, 'heal', (n) => '+' + Math.round(n));
    });
    bus.on('xp', (ev) => {
      const p = currentWorld().player;
      FloatText().merge('xp', ev.amount, p.x, p.y, 'xp', (n) => '+' + Math.round(n) + ' xp');
    });
    bus.on('status.apply', (ev) => {
      if (!STATUS_WORDS[ev.status] || ev.id === 1) return;
      FloatText().add(STATUS_WORDS[ev.status], ev.x, ev.y, 'status', { id: ev.id, color: BD.view.palette.STATUS_COLOR[ev.status] });
    });
    bus.on('reaction', (ev) => FloatText().add(ev.name + '!', ev.x, ev.y, 'reaction', { id: ev.tgtId }));
    bus.on('death', (ev) => {
      if (ev.kind === 'player') return;
      const elite = ev.rank && ev.rank !== 'normal' && ev.rank !== 'minion';
      Fx().play(elite ? 'death_elite' : 'death', ev.x, ev.y, { school: BD.view.palette.ELEMENT_SCHOOL[ev.element] || 'bone' });
      BD.view.world.addGhost(currentWorld(), ev);
      BD.view.camera.addTrauma(elite ? 0.3 : 0.05);
    });
    bus.on('monster.alert', (ev) => {
      EntityView.stateOf(ev.id).alertT = 900;
      FloatText().add('!', ev.x, ev.y, 'alert', { id: ev.id });
    });
  }

  /** movement skills, zones, attacks and ability effects */
  function wireActions(bus) {
    bus.on('levelup', (ev) => Fx().play('levelup', ev.x, ev.y));
    bus.on('evade', (ev) => Fx().play('evade', ev.fromX, ev.fromY, { x1: ev.x, y1: ev.y }));
    bus.on('flask.drink', (ev) => Fx().play('heal', ev.x, ev.y));
    bus.on('blink', (ev) => {
      Fx().play('blink', ev.fromX, ev.fromY, { school: 'portal' });
      Fx().play('blink', ev.x, ev.y, { school: 'portal' });
    });
    bus.on('dash', (ev) => Fx().play('evade', ev.fromX, ev.fromY, { x1: ev.x, y1: ev.y }));
    bus.on('exposed', (ev) => {
      Fx().play('exposed', ev.x, ev.y);
      FloatText().add('EXPOSED', ev.x, ev.y, 'exposed', { id: ev.id });
    });
    bus.on('zone.resolve', (ev) => {
      if (ev.kind === 'charge_mark') return;
      const sch = ev.school || 'blood';
      const cx = ev.cx != null ? ev.cx : ev.tiles[0][0];
      const cy = ev.cy != null ? ev.cy : ev.tiles[0][1];
      Fx().play(ev.heavy ? 'zone_heavy' : 'zone_hit', cx, cy, { school: sch, scale: Math.min(2.2, Math.sqrt(ev.tiles.length) / 2) });
    });
    bus.on('monster.attack', (ev) => {
      const e = Entities().get(currentWorld(), ev.id), t = Entities().get(currentWorld(), ev.targetId);
      if (e && t) EntityView.onAttack(ev.id, t.x, t.y, e);
    });
    bus.on('ability.impact', (ev) => {
      const w = currentWorld();
      if (ev.id === w.player.id && (ev.kind === 'melee')) EntityView.onAttack(ev.id, ev.tx, ev.ty, w.player);
      if (BD.view.skillFx) BD.view.skillFx.impact(w, ev);
    });
    bus.on('ability.cast', (ev) => {
      if (BD.view.skillFx) BD.view.skillFx.cast(currentWorld(), ev);
    });
    bus.on('ability.explode', (ev) => {
      if (BD.view.skillFx) BD.view.skillFx.explode(currentWorld(), ev);
    });
    bus.on('ability.land', (ev) => {
      if (BD.view.skillFx) BD.view.skillFx.land(currentWorld(), ev);
    });
    bus.on('chain', (ev) => Fx().shape({
      kind: 'beam', x: ev.fromX, y: ev.fromY, x1: ev.x, y1: ev.y, life: 180, pal: BD.view.palette.SCHOOL.storm,
    }));
    bus.on('projectile.hit', (ev) => {
      if (ev.wall) Fx().play('whiff', ev.x, ev.y);
    });
  }

  /** seals, portals, waypoints, loot and exploration */
  function wireWorld(bus) {
    bus.on('seal.break', (ev) => Fx().play('seal_break', ev.x, ev.y));
    bus.on('portal.open', (ev) => Fx().play('portal', ev.x, ev.y));
    bus.on('waypoint.activate', (ev) => Fx().play('portal', ev.x, ev.y, { school: 'storm' }));
    bus.on('revive', (ev) => Fx().play('blink', ev.x, ev.y, { school: 'shadow' }));
    bus.on('loot.drop', (ev) => {
      BD.view.items.onDrop(ev);
      if (ev.rarity === 'legendary') Fx().play('levelup', ev.x, ev.y, { scale: 0.6 });
      else if (ev.rarity === 'rare') Fx().play('blink', ev.x, ev.y, { school: 'gold' });
    });
    bus.on('gold', (ev) => FloatText().merge('gold', ev.amount, ev.x, ev.y, 'gold', (n) => '+' + n + ' gold'));
    bus.on('flask.charge', (ev) => FloatText().add('+1 flask', ev.x, ev.y, 'heal'));
    bus.on('loot.fountain', (ev) => Fx().play('loot_fountain', ev.x, ev.y));
    bus.on('power.nova', (ev) => Fx().play('zone_hit', ev.x, ev.y, { school: ev.school === 'holy' ? 'holy' : ev.school || 'fire' }));
    bus.on('floor.explored', () => {
      const p = currentWorld().player;
      Fx().play('explored', p.x, p.y);
    });
  }

  function wire(bus) {
    if (BD.view.skillFx) BD.view.skillFx.wire(bus);
    wireResets(bus);
    wireCombat(bus);
    wireActions(bus);
    wireWorld(bus);
  }

  // per-frame updates and top-layer draws
  BD.view.render.hooks.fx.push((ctx, world, alpha, t, realMs) => {
    const ms = BD.view.host.paused() ? 0 : realMs;
    Fx().update(ms);
    FloatText().update(ms);
    BD.view.world.update(ms);
    Fx().draw(ctx);
  });
  BD.view.render.hooks.top.push((ctx) => FloatText().draw(ctx));

  BD.view.wire = wire;
})(globalThis.BD);
