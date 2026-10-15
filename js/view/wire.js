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

  // Player hit recipe: melee swings use the weapon's signature impact; elemental hits the element's
  // motif (impact_fire, impact_cold, impact_storm, impact_poison, impact_shadow); other projectiles the arrow.
  function playerHitRecipe(ev, weaponFx, school) {
    if ((ev.abilityId === 'attack' || hasTag(ev, 'melee')) && weaponFx) return WEAPON_IMPACT[weaponFx] || 'impact_club';
    if (BD.view.fxRecipes['impact_' + school]) return 'impact_' + school;
    return hasTag(ev, 'projectile') ? 'impact_arrow' : 'impact_magic';
  }
  /** skills whose hits get a recipe of their own on top of the normal impact, in the skill's school */
  const HEAVY_HIT = { aimed_shot: 'heavy_shot' };
  /** the direction of each killing blow, read by the death that follows it in the same event batch */
  const killDir = new Map();
  const isElite = (e) => !!(e && e.rank && e.rank !== 'normal' && e.rank !== 'minion');

  /** hitstop (ms): elite kill 80, crit 65, heavy 60, kill 50; 0 = none */
  function hitstopMs(ev, tgt) {
    if (ev.lethal && isElite(tgt)) return 80;
    if (ev.crit) return 65;
    if (hasTag(ev, 'heavy') || HEAVY_HIT[ev.abilityId]) return 60;
    return ev.lethal ? 50 : 0;
  }
  /** dealt numbers are bone, tinted by a non-physical element's mid colour; taken numbers are red */
  function damageText(ev, toPlayer) {
    const Palette = BD.view.palette;
    if (toPlayer) return { style: 'taken', color: null };
    if (ev.crit) return { style: 'crit', color: null };
    const sch = ev.maxPart && ev.maxPart !== 'phys' ? Palette.SCHOOL[Palette.ELEMENT_SCHOOL[ev.maxPart]] : null;
    return { style: 'dmg', color: sch ? sch.mid : null };
  }

  function playHitFx(w, ev, src, tgt, toPlayer) {
    const x = ev.x, y = ev.y;
    const school = BD.view.palette.ELEMENT_SCHOOL[ev.maxPart] || 'steel';
    let recipe = 'impact_magic';
    if (src && src.kind === 'player' && !toPlayer) {
      const fx = hasTag(ev, 'projectile') ? null : BD.sim.stats.statsOf(w, src).weapon.fx;
      recipe = playerHitRecipe(ev, fx, school);
      Fx().play(recipe, x, y, { dir: { x: x - src.x, y: y - src.y }, school, scale: ev.crit ? 1.6 : 1 });
      if (ev.crit) Fx().play('crit_accent', x, y);
      if (HEAVY_HIT[ev.abilityId]) {
        const sk = BD.data.skills[ev.abilityId];
        const dir = { x: x - src.x, y: y - src.y };
        Fx().play(HEAVY_HIT[ev.abilityId], x, y, { dir, school: (sk && sk.school) || school, scale: ev.crit ? 1.4 : 1 });
      }
    } else if (toPlayer) {
      Fx().play('monster_hit', x, y, { dir: src ? { x: x - src.x, y: y - src.y } : null });
      if (hasTag(ev, 'heavy')) BD.view.camera.addTrauma(0.15);
    } else {
      recipe = BD.view.fxRecipes['impact_' + school] ? 'impact_' + school : 'impact_magic';
      Fx().play(recipe, x, y, { school });
    }
    // enchanted-weapon flair: a second element on the hit gets its own small motif
    for (const el in ev.parts) {
      if (!ELEMENT_FLAIR[el] || ev.parts[el] <= ev.total * 0.15) continue;
      if (recipe === 'impact_' + BD.view.palette.ELEMENT_SCHOOL[el]) continue;
      Fx().play(ELEMENT_FLAIR[el], x, y);
    }
    const stop = hitstopMs(ev, tgt);
    if (stop) BD.view.host.hitstop(stop);
    if (ev.crit) BD.view.camera.addTrauma(0.1);
  }

  function onDamage(ev) {
    const w = currentWorld();
    EntityView.onDamage(w, ev);
    const tgt = Entities().get(w, ev.tgtId), src = Entities().get(w, ev.srcId);
    const toPlayer = tgt && tgt.kind === 'player';
    if (!ev.isDot) playHitFx(w, ev, src, tgt, toPlayer);
    if (ev.lethal && src && !toPlayer) {
      const l = Math.hypot(ev.x - src.x, ev.y - src.y) || 1, push = ev.crit || hasTag(ev, 'heavy') || HEAVY_HIT[ev.abilityId] ? 0.5 : 0.3;
      killDir.set(ev.tgtId, { x: (ev.x - src.x) / l * push, y: (ev.y - src.y) / l * push });
    }
    const dt = damageText(ev, toPlayer);
    if (ev.isDot) {
      // damage over time merges per target per second instead of a number every tick
      FloatText().merge('dot' + ev.tgtId, ev.total, ev.x, ev.y, dt.style, (n) => String(Math.round(n)), { color: dt.color, id: ev.tgtId });
    } else FloatText().add(String(ev.total), ev.x, ev.y, dt.style, { id: ev.tgtId, color: dt.color });
  }

  /** a new world or floor: drop every transient visual */
  function wireResets(bus) {
    bus.on('app.world', () => {
      killDir.clear();
      Fx().clear();
      FloatText().clear();
      EntityView.clear();
      BD.view.world.clear();
      BD.view.overlays.clearBody();
      BD.view.tiles.invalidate();
    });
    bus.on('floor.enter', () => {
      Fx().clear();
      FloatText().clear();
      EntityView.clear();
      BD.view.world.clear();
      BD.view.overlays.clearBody();
      BD.view.camera.cam.init = false;
    });
  }

  /** hits, misses, healing, xp, statuses, deaths and alerts */
  function wireCombat(bus) {
    bus.on('damage', onDamage);
    bus.on('flinch', (ev) => {
      const s = EntityView.stateOf(ev.id);
      s.recoil = 220;
      s.hurt = 220;
      BD.view.host.hitstop(25);
    });
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
      if (BD.view.fxRecipes['status_' + ev.status]) Fx().play('status_' + ev.status, ev.x, ev.y);
      if (!STATUS_WORDS[ev.status] || ev.id === 1) return;
      // one word per status per group: a nova that freezes five monsters says FROZEN once
      if (!FloatText().once('status:' + ev.status, ev.x, ev.y, 600, 3)) return;
      FloatText().add(STATUS_WORDS[ev.status], ev.x, ev.y, 'status', { id: ev.id, color: BD.view.palette.STATUS_COLOR[ev.status] });
    });
    bus.on('reaction', (ev) => FloatText().add(ev.name + '!', ev.x, ev.y, 'reaction', { id: ev.tgtId }));
    bus.on('death', (ev) => {
      if (ev.kind === 'player') return;
      const elite = ev.rank && ev.rank !== 'normal' && ev.rank !== 'minion';
      const push = killDir.get(ev.id) || null;
      killDir.delete(ev.id);
      // the elite recipe carries its own shake; the spray follows the killing blow
      Fx().play(elite ? 'death_elite' : 'death', ev.x, ev.y, { school: BD.view.palette.ELEMENT_SCHOOL[ev.element] || 'bone', dir: push });
      BD.view.world.addGhost(currentWorld(), ev, elite ? null : push);
      if (!elite) BD.view.camera.addTrauma(0.05);
    });
    bus.on('monster.alert', (ev) => {
      EntityView.stateOf(ev.id).alertT = 900;
      // one "!" per pack: the first monster to spot you speaks for the ones beside it
      if (FloatText().once('alert', ev.x, ev.y, 1200, 4)) FloatText().add('!', ev.x, ev.y, 'alert', { id: ev.id });
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
    // one handler, one recipe per resolve (skill_fx picks a dedicated recipe or the generic hit)
    bus.on('zone.resolve', (ev) => {
      if (BD.view.skillFx) BD.view.skillFx.zoneResolve(ev);
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
      kind: 'beam', x: ev.fromX, y: ev.fromY, x1: ev.x, y1: ev.y, life: 140, pal: BD.view.palette.SCHOOL.storm,
    }));
    bus.on('projectile.hit', (ev) => {
      if (ev.wall) Fx().play('whiff', ev.x, ev.y);
    });
  }

  const rarityPals = {};
  /** a school-shaped palette for a rarity colour */
  function rarityPal(rarity) {
    const Palette = BD.view.palette;
    if (!rarityPals[rarity]) {
      const c = Palette.RARITY[rarity];
      rarityPals[rarity] = { core: Palette.shade(c, 1.35), mid: c, edge: Palette.shade(c, 0.6) };
    }
    return rarityPals[rarity];
  }

  /** seals, portals, waypoints, loot and exploration */
  function wireWorld(bus) {
    bus.on('seal.break', (ev) => Fx().play('seal_break', ev.x, ev.y));
    bus.on('portal.open', (ev) => Fx().play('portal', ev.x, ev.y));
    bus.on('waypoint.activate', (ev) => Fx().play('portal', ev.x, ev.y));
    // a monster raising a corpse is shadow; the hero getting up again is life
    bus.on('revive', (ev) => {
      if (ev.by != null) Fx().play('blink', ev.x, ev.y, { school: 'shadow' });
      else Fx().play('heal', ev.x, ev.y, { scale: 1.5 });
    });
    bus.on('loot.drop', (ev) => {
      BD.view.items.onDrop(ev);
      // the drop moment takes the rarity colour (the legendary column matches its ground shaft)
      if (ev.rarity === 'legendary') Fx().play('legendary_drop', ev.x, ev.y, { pal: rarityPal('legendary') });
      else if (ev.rarity === 'rare') Fx().play('rare_drop', ev.x, ev.y, { pal: rarityPal('rare') });
    });
    bus.on('gold', (ev) => FloatText().merge('gold', ev.amount, ev.x, ev.y, 'gold', (n) => '+' + n + ' gold'));
    bus.on('flask.charge', (ev) => FloatText().add('+1 flask', ev.x, ev.y, 'heal'));
    bus.on('loot.fountain', (ev) => Fx().play('loot_fountain', ev.x, ev.y));
    bus.on('power.nova', (ev) => {
      const school = ev.school === 'holy' ? 'holy' : BD.view.palette.ELEMENT_SCHOOL[ev.school] || 'fire';
      Fx().play('zone_hit', ev.x, ev.y, { school, scale: 1.4 });
      if (BD.view.fxRecipes['impact_' + school]) Fx().play('impact_' + school, ev.x, ev.y, { school, scale: 1.6 });
    });
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
    if (BD.view.skillFx) BD.view.skillFx.chargeTick(world, ms);
    Fx().update(ms);
    FloatText().update(ms);
    BD.view.world.update(ms);
    Fx().draw(ctx);
  });
  BD.view.render.hooks.top.push((ctx) => FloatText().draw(ctx));

  BD.view.wire = wire;
})(globalThis.BD);
