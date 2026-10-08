// @ts-check
// Event → sound (07 §5.3). Every sim event type is either cued here or listed in SILENT, and a test
// keeps it that way. A cue returns a sound id, [id, opts], a list of those, or null.
(function (BD) {
  'use strict';

  const currentWorld = () => BD.audio.host.world();
  const ent = (id) => {
    const w = currentWorld();
    return w && id != null ? BD.sim.entities.get(w, id) : null;
  };
  const isPlayer = (id) => {
    const w = currentWorld();
    return !!(w && w.player && w.player.id === id);
  };
  const at = (ev, extra) => Object.assign({ x: ev.x, y: ev.y }, extra || {});
  const has = (tags, t) => !!(tags && tags.indexOf(t) >= 0);

  const MELEE = {
    dagger: 'melee_dagger', sword: 'melee_sword', club: 'melee_club', mace: 'melee_mace', staff: 'melee_staff',
    arrow: 'ranged_impact', bolt: 'ranged_impact',
  };
  const ELEMENT_HIT = { fire: 'fire_hit', cold: 'cold_hit', light: 'zap', pois: 'poison_hit' };
  const SHOT = { arrow: 'bow', bolt: 'crossbow' };
  const NOVA_SOUND = { fire: 'explosion', cold: 'cold_hit' };   // any other school zaps
  const DEATH = { undead: 'death_undead', beast: 'death_beast', demon: 'death_demon', human: 'death_human', construct: 'death_construct' };
  // per-ability cast voices; anything not listed falls back to its school
  const CAST = {
    teleport: 'teleport', shadowstep: 'teleport', vault: 'evade', charge: 'javelin', avalanche_leap: 'javelin',
    war_cry: 'shout', valkyries_call: 'shout', second_wind: 'heal', brace: 'block', energy_shield: 'spell', bloodlust: 'shout',
    javelin: 'javelin', sky_spear: 'javelin', smoke_bomb: 'evade', lightning_sentry: 'summon', death_sentry: 'summon',
    spark: 'zap', chain_lightning: 'zap', frost_nova: 'cold_hit', blizzard: 'cold_hit', meteor: 'fire_cast', rain_of_arrows: 'bow',
    multishot: 'bow', aimed_shot: 'bow', piercing_shot: 'bow', pinning_shot: 'bow', bash: null, whirlwind: 'melee_sword',
  };
  const SCHOOL_CAST = {
    fire: 'fire_cast', cold: 'spell', storm: 'zap', holy: 'spell', shadow: 'evade', poison: 'spell',
    blood: null, steel: null, dust: 'evade', gold: 'spell', ki: null,
  };

  const CUES = {
    damage(ev) {
      if (ev.isDot || !ev.total) return null;
      if (isPlayer(ev.tgtId)) return ['hurt', { vol: has(ev.tags, 'heavy') ? 1.3 : 1, priority: true }];
      const src = ent(ev.srcId);
      if (!src) return null;
      if (src.kind === 'player' || src.kind === 'ally') {
        const out = [];
        const w = currentWorld();
        const fx = src.kind === 'player' ? BD.sim.stats.statsOf(w, src).weapon.fx : null;
        if (ev.abilityId === 'bash') out.push(['bash', at(ev)]);
        else if (has(ev.tags, 'projectile') || (!has(ev.tags, 'melee') && ev.abilityId !== 'attack')) {
          out.push([ELEMENT_HIT[ev.maxPart] || 'ranged_impact', at(ev)]);
        } else out.push([MELEE[fx] || 'melee_club', at(ev, { vol: src.kind === 'ally' ? 0.5 : 1 })]);
        if (ev.crit) out.push(['crit_ring', at(ev)]);
        return out;
      }
      return ['melee_club', at(ev, { vol: 0.4 })];   // monsters hurting allies
    },
    miss: (ev) => (isPlayer(ev.srcId) || isPlayer(ev.tgtId) ? ['miss', at(ev)] : null),
    dodge: (ev) => ['dodge', at(ev)],
    block: (ev) => ['block', at(ev, { priority: isPlayer(ev.id) })],
    evade: (ev) => ['evade', at(ev)],
    crit: () => null,   // the damage cue layers the crit ring
    'ability.cast'(ev) {
      if (!isPlayer(ev.id)) return null;
      if (ev.abilityId === 'attack') {
        if (SHOT[ev.weapon]) return [SHOT[ev.weapon], at(ev)];
        return ev.weapon === 'staff' && currentWorld().player.def === 'magician' ? ['wand', at(ev)] : null;
      }
      if (Object.prototype.hasOwnProperty.call(CAST, ev.abilityId)) return CAST[ev.abilityId] ? [CAST[ev.abilityId], at(ev)] : null;
      const sk = BD.data.skills[ev.abilityId];
      if (!sk) return null;
      if (sk.school === 'ki') {
        const combo = currentWorld().player.resources.combo;
        return ['ki_charge', at(ev, { stack: combo ? combo.n + 1 : 1 })];
      }
      const id = SCHOOL_CAST[sk.school];
      if (id) return [id, at(ev)];
      return has(sk.tags, 'projectile') ? ['bow', at(ev)] : null;
    },
    'ability.impact'(ev) {
      const sk = BD.data.skills[ev.abilityId];
      if (!sk) return null;
      if (has(sk.tags, 'slam')) return ['slam', at(ev, { reverb: 0.3 })];
      if (has(sk.tags, 'finisher') && sk.school === 'ki') return ['ki_release', at(ev)];
      return null;
    },
    'ability.explode': (ev) => ['explosion', at(ev, { reverb: 0.25 })],
    'ability.land': (ev) => ['slam', at(ev, { vol: 0.6 })],
    'ability.reject': (ev) => (ev.abilityId === 'interact' || ev.abilityId === 'equip' || isPlayer(ev.id) ? ['denied', {}] : null),
    explode: (ev) => ['explosion', at(ev, { reverb: 0.25 })],
    'corpse.explode': (ev) => ['explosion', at(ev, { vol: 0.8 })],
    'power.nova': (ev) => [NOVA_SOUND[ev.school] || 'zap', at(ev)],
    shatter: (ev) => ['cold_hit', at(ev, { pitch: 0.8 })],
    reaction: (ev) => ['reaction', at(ev)],
    chain: (ev) => ['zap', at(ev, { vol: 0.6 })],
    beam: (ev) => ['zap', at(ev, { vol: 0.5 })],
    blink: (ev) => (ev.id === (currentWorld() && currentWorld().player.id) ? null : ['teleport', at(ev, { vol: 0.6 })]),
    leap: (ev) => ['javelin', at(ev, { vol: 0.6 })],
    dash: (ev) => ['evade', at(ev)],
    heal: (ev) => (isPlayer(ev.id) && ev.amount >= 5 ? ['heal', {}] : null),
    'status.apply'(ev) {
      if (ev.status === 'frozen') return ['cold_hit', at(ev)];
      if (ev.status === 'stunned') return ['melee_mace', at(ev, { vol: 0.4, pitch: 0.7 })];
      return null;
    },
    'mod.shield': (ev) => ['block', at(ev, { vol: 0.5 })],
    absorb: (ev) => ['block', at(ev, { vol: 0.4, pitch: 1.3 })],
    'ally.spawn': (ev) => ['summon', at(ev)],
    deploy: (ev) => ['summon', at(ev, { vol: 0.7 })],
    'bone_wall': (ev) => ['death_undead', at(ev)],
    rally: (ev) => ['shout', at(ev, { vol: 0.5, pitch: 1.3 })],
    rout: (ev) => ['shout', at(ev, { vol: 0.5, pitch: 0.8 })],
    // monsters
    'monster.windup': (ev) => (ev.heavy ? ['windup', at(ev)] : null),
    'monster.shoot': (ev) => [ev.kind && /bolt|fire|ice|spark|orb|magic/.test(ev.kind) ? 'wand' : 'bow', at(ev, { vol: 0.6 })],
    'monster.alert': (ev) => (ev.keeper || ev.rank === 'champion' ? ['alert', at(ev)] : null),
    death(ev) {
      if (ev.kind === 'player') return [['player_death', { priority: true }]];
      if (ev.kind === 'ally') return ['death_construct', at(ev, { vol: 0.5 })];
      return [DEATH[ev.family] || 'death_human', at(ev, { vol: ev.rank === 'normal' ? 0.7 : 1 })];
    },
    'telegraph.start': (ev) => (!ev.friendly && ev.heavy ? ['windup', { vol: 0.8 }] : null),
    'telegraph.end': () => null,
    'keeper.reveal': (ev) => ['dread', at(ev, { priority: true })],
    'keeper.dead': (ev) => ['announce', at(ev)],
    'egg.hatch': (ev) => ['death_beast', at(ev, { pitch: 1.4, vol: 0.6 })],
    burrow: (ev) => ['step_dirt', at(ev, { vol: 4 })],
    emerge: (ev) => ['step_dirt', at(ev, { vol: 5 })],
    // bosses
    'boss.wake': (ev) => [['boss_wake', at(ev, { priority: true, reverb: 0.4 })]],
    'boss.phase': (ev) => [['boss_enrage', at(ev, { priority: true, reverb: 0.4 })]],
    'boss.exposed': () => [['exposed', { priority: true }]],
    exposed: (ev) => (ev.boss ? null : ['exposed', at(ev, { vol: 0.5 })]),
    'boss.defeat': (ev) => [['boss_defeat', at(ev, { priority: true, reverb: 0.5 })]],
    'boss.leap': (ev) => ['windup', at(ev)],
    'boss.land': (ev) => ['slam', at(ev, { priority: true, reverb: 0.4 })],
    'boss.cast': (ev) => ['fire_cast', at(ev)],
    'boss.summon': (ev) => ['summon', at(ev, { pitch: 0.6 })],
    'boss.split': (ev) => ['explosion', at(ev, { pitch: 1.3 })],
    'boss.wings': (ev) => ['evade', at(ev, { pitch: 0.5, vol: 1.5 })],
    // loot & items
    gold: (ev) => ['gold', at(ev)],
    'loot.pickup': (ev) => (ev.kind === 'item' || ev.kind === 'scroll' ? ['loot', at(ev)] : null),
    'loot.drop'(ev) {
      if (ev.rarity === 'legendary' || ev.rarity === 'set') return [['drop_legendary', at(ev, { priority: true })]];
      if (ev.rarity === 'rare') return ['drop_rare', at(ev)];
      if (ev.rarity === 'magic') return ['drop_magic', at(ev, { vol: 0.6 })];
      return null;
    },
    'loot.fountain': (ev) => ['chest', at(ev, { pitch: 0.8 })],
    'item.equip': (ev) => ['equip_' + (ev.material || 'cloth'), {}],
    'item.unequip': () => ['equip_cloth', { vol: 0.6 }],
    'flask.drink': () => ['flask', {}],
    'flask.charge': (ev) => ['ui_click', at(ev, { pitch: 1.6 })],
    'flask.upgrade': () => ['ui_confirm', {}],
    'key.pickup': (ev) => ['equip_jewel', at(ev)],
    'seal.pickup': (ev) => ['drop_rare', at(ev)],
    'shop.buy': () => ['buy', {}],
    'shop.sell': () => ['sell', {}],
    gamble: () => ['buy', { pitch: 0.9 }],
    enhance: () => ['equip_metal', { pitch: 1.2 }],
    reforge: () => ['equip_metal', { pitch: 0.9 }],
    reroll: () => ['spell', {}],
    blessing: () => ['heal', {}],
    bargain: () => ['dread', {}],
    respec: () => ['ui_confirm', {}],
    stash: () => ['equip_leather', {}],
    'skill.learn': () => ['ui_confirm', {}],
    'attr.spend': () => ['ui_click', {}],
    levelup: () => [['level', { priority: true }]],
    // world
    'chest.open': (ev) => (ev.cursed ? [['chest', at(ev)], ['dread', at(ev)]] : ['chest', at(ev)]),
    'trap.trigger': (ev) => ['trap', at(ev)],
    'trap.reveal': (ev) => ['alert', at(ev, { pitch: 0.7 })],
    'trap.disarm': (ev) => ['ui_confirm', at(ev)],
    'trap.disarm.fail': (ev) => ['trap', at(ev)],
    'trap.disarm.start': (ev) => ['ui_click', at(ev)],
    'gate.open': (ev) => ['gate', at(ev)],
    lever: (ev) => ['door', at(ev)],
    'seal.break': (ev) => [['seal_break', at(ev, { priority: true, reverb: 0.5 })]],
    'sanctum.seal': (ev) => ['gate', at(ev)],
    'portal.open': (ev) => ['portal', at(ev)],
    'waypoint.activate': (ev) => ['waypoint', at(ev)],
    'waypoint.touch': () => null,
    'waypoint.travel': () => ['portal', { pitch: 1.2 }],
    'floor.descend': () => ['stairs', {}],
    'town.arrive': () => null,
    'event.start': (ev) => ['dread', at(ev, { priority: true })],
    'event.wave': () => ['windup', {}],
    'event.complete': (ev) => ['fanfare', at(ev)],
    'shrine.offer': (ev) => ['spell', at(ev, { pitch: 0.7 })],
    rest: () => ['rest', {}],
    revive: () => ['heal', {}],
    countdown: (ev) => (ev.n ? ['countdown', {}] : ['countdown_go', {}]),
    'act.complete': () => [['fanfare', { priority: true }]],
    'run.victory': () => [['victory', { priority: true }]],
    'npc.talk': () => ['ui_click', {}],
    reveal: (ev) => ['spell', at(ev, { pitch: 0.6 })],
    'floor.explored': () => ['announce', {}],
    combo: () => null,       // the ki charge voices each builder already
    momentum: (ev) => (ev.on ? ['shout', { vol: 0.4, pitch: 1.4 }] : null),
  };

  // events that are deliberately silent: bookkeeping, visual-only, or voiced by a neighbouring cue
  const SILENT = ['resource.short',
    'ability.cancel', 'ability.end', 'ability.ready', 'act.complete.ui', 'announce', 'bar.change', 'bone_wall.end', 'brand',
    'collide', 'corpse', 'corpse.eaten', 'corpse.end', 'deploy.end', 'ally.end', 'floor.enter', 'keeper.ping', 'knockback', 'lob',
    'monster.attack', 'monster.cancel', 'power', 'projectile.end', 'projectile.hit', 'projectile.spawn', 'resource.change',
    'run.death', 'run.harvest', 'save.request', 'shimmer', 'spawn', 'status.end', 'xp', 'zone.end', 'zone.resolve', 'zone.tick'];

  /** normalise a cue's result to a list of [id, opts] */
  function resolve(ev) {
    const fn = CUES[ev.type];
    if (!fn) return [];
    const r = fn(ev);
    if (!r) return [];
    if (typeof r === 'string') return [[r, {}]];
    return Array.isArray(r[0]) ? r : [r];
  }

  function wire(bus) {
    for (const type in CUES) bus.on(type, (ev) => { for (const [id, o] of resolve(ev)) BD.audio.synth.play(id, o); });
  }

  BD.audio.cues = { CUES, SILENT, resolve, wire };
})(globalThis.BD);
