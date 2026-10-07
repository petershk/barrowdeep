// @ts-check
// Event → visual reactions. Gameplay never names a colour or an effect; the view decides here.
(function (BD) {
  'use strict';

  const FX = () => BD.view.fx;
  const FT = () => BD.view.floattext;
  const V = BD.view.entities;
  const E = () => BD.sim.entities;
  const W = () => BD.app.world;

  const ELEMENT_FLAIR = { fire: 'flair_fire', cold: 'flair_cold', light: 'flair_light', pois: 'flair_pois' };
  const WEAPON_IMPACT = { dagger: 'impact_dagger', sword: 'impact_sword', staff: 'impact_staff', club: 'impact_club', mace: 'impact_mace', arrow: 'impact_arrow', bolt: 'impact_bolt' };
  const STATUS_WORDS = { burning: 'Burning', chilled: 'Chilled', frozen: 'Frozen', shocked: 'Shocked', poisoned: 'Poisoned', bleeding: 'Bleeding', stunned: 'Stunned', feared: 'Feared', weakened: 'Weakened', vulnerable: 'Vulnerable', rooted: 'Rooted', slowed: 'Slowed', blinded: 'Blinded', taunted: 'Taunted' };

  function wire(bus) {
    bus.on('app.world', () => { FX().clear(); FT().clear(); V.clear(); BD.view.world.clear(); BD.view.tiles.invalidate(); });
    bus.on('floor.enter', () => { FX().clear(); FT().clear(); V.clear(); BD.view.world.clear(); BD.view.camera.cam.init = false; });

    bus.on('damage', (ev) => {
      const w = W();
      V.onDamage(w, ev);
      const tgt = E().get(w, ev.tgtId), src = E().get(w, ev.srcId);
      const toPlayer = tgt && tgt.kind === 'player';
      const x = ev.x, y = ev.y;
      if (!ev.isDot) {
        if (src && src.kind === 'player' && !toPlayer) {
          const fx = ev.tags && ev.tags.indexOf('projectile') >= 0 ? null : BD.sim.stats.statsOf(w, src).weapon.fx;
          const recipe = (ev.abilityId === 'attack' || (ev.tags && ev.tags.indexOf('melee') >= 0)) && fx ? WEAPON_IMPACT[fx] || 'impact_club' : ev.tags && ev.tags.indexOf('projectile') >= 0 ? 'impact_arrow' : 'impact_magic';
          FX().play(recipe, x, y, { dir: { x: x - src.x, y: y - src.y }, school: BD.view.palette.ELEMENT_SCHOOL[ev.maxPart] || 'general', scale: ev.crit ? 1.6 : 1 });
        } else if (toPlayer) {
          FX().play('monster_hit', x, y, { dir: src ? { x: x - src.x, y: y - src.y } : null });
          BD.view.camera.addTrauma(ev.tags && ev.tags.indexOf('heavy') >= 0 ? 0.5 : 0.15);
        } else FX().play('impact_magic', x, y, { school: BD.view.palette.ELEMENT_SCHOOL[ev.maxPart] || 'general' });
        for (const el in ev.parts) if (ELEMENT_FLAIR[el] && ev.parts[el] > ev.total * 0.15) FX().play(ELEMENT_FLAIR[el], x, y);
        if (ev.crit || ev.lethal || (ev.tags && ev.tags.indexOf('heavy') >= 0)) BD.app.hitstop(ev.crit ? 55 : ev.lethal ? 40 : 70);
        if (ev.crit) BD.view.camera.addTrauma(0.15);
      }
      FT().add(String(ev.total), x, y, toPlayer ? 'taken' : ev.crit ? 'crit' : 'dmg', { id: ev.tgtId });
    });
    bus.on('miss', (ev) => {
      if (ev.reason === 'whiff') FX().play('whiff', ev.x, ev.y);
      else if (ev.reason === 'immune') FT().add('Immune', ev.x, ev.y, 'miss', { id: ev.tgtId });
    });
    bus.on('dodge', (ev) => FT().add(ev.tgtId === 1 ? 'Dodge' : 'Miss', ev.x, ev.y, 'miss', { id: ev.tgtId }));
    bus.on('block', (ev) => { FX().play('block', ev.x, ev.y); FT().add('Block', ev.x, ev.y, 'miss', { id: ev.id }); });
    bus.on('heal', (ev) => {
      const e = E().get(W(), ev.id);
      if (!e) return;
      FT().merge('heal' + ev.id, ev.amount, e.x, e.y, 'heal', (n) => '+' + Math.round(n));
    });
    bus.on('xp', (ev) => { const p = W().player; FT().merge('xp', ev.amount, p.x, p.y, 'xp', (n) => '+' + Math.round(n) + ' xp'); });
    bus.on('status.apply', (ev) => { if (STATUS_WORDS[ev.status] && ev.id !== 1) FT().add(STATUS_WORDS[ev.status], ev.x, ev.y, 'status', { id: ev.id, color: BD.view.palette.STATUS_COLOR[ev.status] }); });
    bus.on('reaction', (ev) => FT().add(ev.name + '!', ev.x, ev.y, 'reaction', { id: ev.tgtId }));
    bus.on('death', (ev) => {
      if (ev.kind === 'player') return;
      const elite = ev.rank && ev.rank !== 'normal' && ev.rank !== 'minion';
      FX().play(elite ? 'death_elite' : 'death', ev.x, ev.y, { school: BD.view.palette.ELEMENT_SCHOOL[ev.element] || 'bone' });
      BD.view.world.addGhost(W(), ev);
      BD.view.camera.addTrauma(elite ? 0.3 : 0.05);
    });
    bus.on('monster.alert', (ev) => { V.stateOf(ev.id).alertT = 900; FT().add('!', ev.x, ev.y, 'alert', { id: ev.id }); });
    bus.on('levelup', (ev) => FX().play('levelup', ev.x, ev.y));
    bus.on('evade', (ev) => FX().play('evade', ev.fromX, ev.fromY, { x1: ev.x, y1: ev.y }));
    bus.on('flask.drink', (ev) => FX().play('heal', ev.x, ev.y));
    bus.on('blink', (ev) => { FX().play('blink', ev.fromX, ev.fromY, { school: 'portal' }); FX().play('blink', ev.x, ev.y, { school: 'portal' }); });
    bus.on('dash', (ev) => FX().play('evade', ev.fromX, ev.fromY, { x1: ev.x, y1: ev.y }));
    bus.on('exposed', (ev) => { FX().play('exposed', ev.x, ev.y); FT().add('EXPOSED', ev.x, ev.y, 'exposed', { id: ev.id }); });
    bus.on('zone.resolve', (ev) => {
      if (ev.kind === 'charge_mark') return;
      const sch = ev.school || 'blood';
      FX().play(ev.heavy ? 'zone_heavy' : 'zone_hit', ev.cx != null ? ev.cx : ev.tiles[0][0], ev.cy != null ? ev.cy : ev.tiles[0][1], { school: sch, scale: Math.min(2.2, Math.sqrt(ev.tiles.length) / 2) });
    });
    bus.on('monster.attack', (ev) => { const e = E().get(W(), ev.id), t = E().get(W(), ev.targetId); if (e && t) V.onAttack(ev.id, t.x, t.y, e); });
    bus.on('ability.impact', (ev) => {
      const w = W();
      if (ev.id === w.player.id && (ev.kind === 'melee')) V.onAttack(ev.id, ev.tx, ev.ty, w.player);
      if (BD.view.skillFx) BD.view.skillFx.impact(w, ev);
    });
    bus.on('ability.cast', (ev) => { if (BD.view.skillFx) BD.view.skillFx.cast(W(), ev); });
    bus.on('ability.explode', (ev) => { if (BD.view.skillFx) BD.view.skillFx.explode(W(), ev); });
    bus.on('ability.land', (ev) => { if (BD.view.skillFx) BD.view.skillFx.land(W(), ev); });
    bus.on('chain', (ev) => FX().shape({ kind: 'beam', x: ev.fromX, y: ev.fromY, x1: ev.x, y1: ev.y, life: 180, pal: BD.view.palette.SCHOOL.storm }));
    bus.on('projectile.hit', (ev) => { if (ev.wall) FX().play('whiff', ev.x, ev.y); });
    bus.on('seal.break', (ev) => FX().play('seal_break', ev.x, ev.y));
    bus.on('portal.open', (ev) => FX().play('portal', ev.x, ev.y));
    bus.on('waypoint.activate', (ev) => FX().play('portal', ev.x, ev.y, { school: 'storm' }));
    bus.on('revive', (ev) => FX().play('blink', ev.x, ev.y, { school: 'shadow' }));
    bus.on('floor.explored', () => { const p = W().player; FX().play('explored', p.x, p.y); });
  }

  // per-frame updates and top-layer draws
  BD.view.render.hooks.fx.push((ctx, world, alpha, t, realMs) => {
    const ms = BD.app.paused() ? 0 : realMs;
    FX().update(ms); FT().update(ms); BD.view.world.update(ms);
    FX().draw(ctx);
  });
  BD.view.render.hooks.top.push((ctx) => FT().draw(ctx));

  BD.view.wire = wire;
})(globalThis.BD);
