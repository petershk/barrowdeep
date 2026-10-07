// @ts-check
// Impact delivery: melee areas, projectiles, lobs, delayed zones, dashes, leaps, blinks, chains,
// channels, summons. Skill-specific rules live in the special-script registry (skill_scripts.js).
(function (BD) {
  'use strict';

  const Entities = BD.sim.entities;
  const Targeting = BD.sim.targeting;
  const Hits = BD.sim.hits;
  const { within, cheb, dirOf } = BD.core.util;

  /** @type {Record<string, (world:any, caster:any, ab:any, rank:number, arg:any)=>any>} */
  const scripts = {};
  /** hooks run before every impact: (world, caster, ab, rank, ctx, action) */
  const preImpact = [];
  function register(name, fn) { scripts[name] = fn; }
  /** run a special script hook: '<abilityId>.<phase>' or a named special effect */
  function special(world, caster, ab, rank, phase, arg) {
    const fn = scripts[ab.id + '.' + phase] || scripts[phase];
    return fn ? fn(world, caster, ab, rank, arg) : undefined;
  }
  /** validation hook (e.g. no room to land) → reason string or null */
  function precheck(world, p, ab, rank, tgt) {
    const fn = scripts[ab.id + '.precheck'];
    if (fn) return fn(world, p, ab, rank, tgt) || null;
    if (ab.delivery && (ab.delivery.kind === 'leap' || ab.delivery.kind === 'blink')) {
      const spot = landingSpot(world, p, tgt.x, tgt.y);
      if (!spot) return 'no_room';
    }
    return null;
  }

  function landingSpot(world, p, x, y) {
    const f = world.floor;
    if (Entities.isFree(f, x, y)) return { x, y };
    // nearest free walkable tile on the path back toward the origin
    const ray = BD.core.grid.rayTiles(x, y, p.x - x, p.y - y, Math.ceil(Math.hypot(p.x - x, p.y - y)));
    for (const [rx, ry] of ray) { if (rx === p.x && ry === p.y) break; if (Entities.isFree(f, rx, ry)) return { x: rx, y: ry }; }
    return null;
  }

  function baseCtx(world, caster, ab, rank, a) {
    return {
      caster, srcId: a && a.srcId != null ? a.srcId : caster.id, ab, rank,
      combo: a ? a.comboHeld || 0 : 0, focus: a ? a.focusHeld || 0 : 0,
      cx: caster.x, cy: caster.y, tags: ab.tags, forceCrit: false, critAdd: 0, packetMult: 1, centerId: a ? a.targetId : null,
    };
  }

  /** The impact of an ability (end of wind-up / each channel tick). */
  function impact(world, caster, ab, rank, a) {
    const ctx = baseCtx(world, caster, ab, rank, a);
    for (let i = 0; i < preImpact.length; i++) preImpact[i](world, caster, ab, rank, ctx, a);
    if (scripts[ab.id + '.before']) { if (scripts[ab.id + '.before'](world, caster, ab, rank, { a, ctx }) === false) return; }
    const d = ab.delivery || { kind: 'instant' };
    const target = a.targetId != null ? Entities.get(world, a.targetId) : null;
    let tx = a.tx, ty = a.ty;
    if (target && target.hp > 0 && !target.dead && ab.targeting && ab.targeting.mode === 'unit') { tx = target.x; ty = target.y; }
    world.events.push({
      type: 'ability.impact', id: caster.id, abilityId: ab.id, x: caster.x, y: caster.y, tx, ty, rank,
      kind: d.kind, area: ab.area || null,
      weapon: caster.kind === 'player' ? BD.sim.stats.statsOf(world, caster).weapon.fx : null,
    });
    let results = [];
    switch (d.kind) {
      case 'melee': results = melee(world, ctx, ab, tx, ty, target); break;
      case 'channel': results = areaAt(world, ctx, ab, caster.x, caster.y, ab.area || { shape: 'circle', radius: 1 }); break;
      case 'projectile': BD.sim.projectiles.fireAbility(world, caster, ab, rank, a, tx, ty, ctx); break;
      case 'lob': BD.sim.zones.lob(world, caster, ab, rank, a, tx, ty, ctx); break;
      case 'zone': BD.sim.zones.fromAbility(world, caster, ab, rank, a, tx, ty, ctx); break;
      case 'chain': {
        const first = target || Targeting.nearestEnemy(world, tx, ty, 1.5, caster.faction, null);
        results = chain(world, ctx, ab, first, d.jumps || 4, d.jumpRange || 3);
        break;
      }
      case 'dash': results = dash(world, ctx, ab, target, tx, ty); break;
      case 'leap': leap(world, ctx, ab, tx, ty); break;
      case 'blink': blink(world, ctx, ab, tx, ty, target); break;
      case 'instant': results = ab.area ? areaAt(world, ctx, ab, caster.x, caster.y, ab.area) : []; break;
      case 'summon': case 'deploy': if (BD.sim.allies) BD.sim.allies.fromAbility(world, caster, ab, rank, a, tx, ty, ctx); break;
      default: break;
    }
    if (ab.selfEffects && ab.selfEffects.length) Hits.applyEffects(world, ctx, ab.selfEffects, [caster]);
    special(world, caster, ab, rank, 'impact', { a, ctx, results, tx, ty });
    if (caster.kind === 'player' && results && results.length) afterHits(world, caster, ab, rank, a, results);
    return results;
  }

  /** resource generation on landed hits (builders), combo build/consume */
  function afterHits(world, p, ab, rank, a, results) {
    const landed = results.filter((r) => r.res && r.res.total > 0);
    const Resources = BD.sim.resources;
    if (ab.resource && ab.resource.gen && landed.length) Resources.gain(world, p, ab.resource.type, ab.resource.gen);
    if (ab.resource && ab.resource.combo === 'build' && landed.length) Resources.addCombo(world, p, ab.resource.comboAdd || 1);
    if (ab.resource && ab.resource.combo === 'finish' && landed.length) Resources.takeCombo(world, p);
    special(world, p, ab, rank, 'landed', { a, landed, results });
    if (BD.sim.powers) BD.sim.powers.afterHits(world, p, ab, rank, landed);
  }

  function melee(world, ctx, ab, tx, ty, target) {
    const caster = ctx.caster;
    const area = ab.area || { shape: 'single' };
    if (area.shape === 'single') {
      // unit melee: the target must still be in reach, else the swing whiffs
      const reach = Math.max(1, Math.round((ab.targeting && ab.targeting.range) || 1));
      if (!target || target.dead || target.hp <= 0 || cheb(caster.x, caster.y, target.x, target.y) > reach) {
        world.events.push({
          type: 'miss', srcId: caster.id, tgtId: target ? target.id : null, reason: 'whiff',
          tags: ab.tags, abilityId: ab.id, x: tx, y: ty,
        });
        return [];
      }
      caster.dir = dirOf(target.x - caster.x, target.y - caster.y) ;
      ctx.centerId = target.id;
      return Hits.applyEffects(world, ctx, ab.effects, [target]);
    }
    if (tx !== caster.x || ty !== caster.y) caster.dir = dirOf(tx - caster.x, ty - caster.y);
    const tiles = Targeting.areaTiles(area, tx, ty, caster.x, caster.y, caster.dir);
    const targets = Targeting.entitiesOnTiles(world, tiles, caster.faction);
    // centre = the tile in front for arc3
    const front = BD.core.util.DIRS[caster.dir];
    const cid = world.floor.occ[(caster.y + front[1]) * world.floor.w + caster.x + front[0]];
    ctx.centerId = target && targets.includes(target) ? target.id : cid || null;
    if (!targets.length) {
      world.events.push({ type: 'miss', srcId: caster.id, tgtId: null, reason: 'whiff', tags: ab.tags, abilityId: ab.id, x: tx, y: ty });
    }
    return Hits.applyEffects(world, ctx, ab.effects, targets);
  }

  function areaAt(world, ctx, ab, cx, cy, area, effects) {
    const tiles = Targeting.areaTiles(area, cx, cy, ctx.caster.x, ctx.caster.y, ctx.caster.dir);
    const targets = Targeting.entitiesOnTiles(world, tiles, ctx.caster.faction);
    ctx.cx = cx; ctx.cy = cy; ctx.aoe = area.shape !== 'single';
    return Hits.applyEffects(world, ctx, effects || ab.effects, targets);
  }

  function chain(world, ctx, ab, first, jumps, range) {
    if (!first) return [];
    const hit = new Set();
    const results = [];
    let cur = first, from = ctx.caster, mult = 1;
    const falloff = (ab.delivery && ab.delivery.falloff) || 0.1;
    const allowRepeat = !!(ab.delivery && ab.delivery.repeat);
    for (let i = 0; i <= jumps && cur; i++) {
      world.events.push({ type: 'chain', srcId: ctx.caster.id, fromX: from.x, fromY: from.y, x: cur.x, y: cur.y, abilityId: ab.id, i });
      ctx.packetMult = mult; ctx.centerId = cur.id;
      results.push(...Hits.applyEffects(world, ctx, i === 0 ? ab.effects : ab.jumpEffects || ab.effects, [cur]));
      hit.add(cur.id);
      mult *= 1 - falloff;
      from = cur;
      const excl = allowRepeat ? new Set([cur.id]) : hit;
      cur = Targeting.nearestEnemy(world, from.x, from.y, range, ctx.caster.faction, { exclude: excl, los: true });
    }
    ctx.packetMult = 1;
    return results;
  }

  function dash(world, ctx, ab, target, tx, ty) {
    const caster = ctx.caster;
    const f = world.floor;
    if (!target || target.dead) return [];
    // land on the free tile adjacent to the target nearest to us along the path
    const path = BD.sim.player.pathTo(world, caster, target.x, target.y, true) || [];
    let land = path.length ? path[path.length - 1] : null;
    if (land && !Entities.isFree(f, land[0], land[1])) land = null;
    if (!land) {
      const n = Entities.nearestFree(f, target.x, target.y, 2, (x, y) => cheb(x, y, target.x, target.y) === 1);
      land = n ? [n.x, n.y] : null;
    }
    if (!land) return [];
    const fromX = caster.x, fromY = caster.y;
    const tiles = Math.max(1, cheb(fromX, fromY, land[0], land[1]));
    BD.sim.movement.displace(world, caster, land[0], land[1], 40 * tiles, 'dash');
    caster.dir = dirOf(target.x - land[0], target.y - land[1]);
    if (caster.kind === 'player') BD.sim.player.onStep(world, caster);
    world.events.push({ type: 'dash', id: caster.id, fromX, fromY, x: land[0], y: land[1], abilityId: ab.id });
    special(world, caster, ab, ctx.rank, 'path', { path, fromX, fromY, ctx });
    ctx.centerId = target.id;
    return Hits.applyEffects(world, ctx, ab.effects, [target]);
  }

  function leap(world, ctx, ab, tx, ty) {
    const caster = ctx.caster;
    const spot = landingSpot(world, caster, tx, ty);
    if (!spot) return;
    const air = (ab.delivery && ab.delivery.airMs) || 300;
    const fromX = caster.x, fromY = caster.y;
    BD.sim.movement.displace(world, caster, spot.x, spot.y, air, 'leap');
    BD.sim.status.apply(world, caster, 'airborne', { durMs: air });
    world.events.push({ type: 'leap', id: caster.id, fromX, fromY, x: spot.x, y: spot.y, ms: air, abilityId: ab.id });
    BD.core.scheduler.after(world, air, 'ability.land', { casterId: caster.id, abilityId: ab.id, rank: ctx.rank, x: spot.x, y: spot.y });
  }
  BD.core.scheduler.register('ability.land', (world, pl) => {
    const caster = Entities.get(world, pl.casterId);
    if (!caster || caster.dead) return;
    const ab = BD.sim.abilities.resolved(BD.sim.abilities.def(pl.abilityId), pl.rank, caster);
    const ctx = baseCtx(world, caster, ab, pl.rank, null);
    if (caster.kind === 'player') BD.sim.player.onStep(world, caster);
    world.events.push({ type: 'ability.land', id: caster.id, abilityId: ab.id, x: pl.x, y: pl.y, area: ab.area });
    const res = areaAt(world, ctx, ab, pl.x, pl.y, ab.area || { shape: 'circle', radius: 1 });
    if (ab.landSelf) Hits.applyEffects(world, ctx, ab.landSelf, [caster]);
    special(world, caster, ab, pl.rank, 'land', { ctx, results: res });
    if (caster.kind === 'player') afterHits(world, caster, ab, pl.rank, null, res);
  });

  function blink(world, ctx, ab, tx, ty, target) {
    const caster = ctx.caster;
    let spot = null;
    if (ab.delivery.behind && target) spot = Targeting.behind(world, target);
    else spot = landingSpot(world, caster, tx, ty);
    if (!spot) return;
    const fromX = caster.x, fromY = caster.y;
    BD.sim.movement.displace(world, caster, spot.x, spot.y, 1, 'blink');
    caster.move = null;
    if (target) caster.dir = dirOf(target.x - spot.x, target.y - spot.y);
    world.events.push({ type: 'blink', id: caster.id, fromX, fromY, x: spot.x, y: spot.y, abilityId: ab.id });
    if (caster.kind === 'player') BD.sim.player.onStep(world, caster);
    if (ab.area) areaAt(world, ctx, ab, spot.x, spot.y, ab.area);
  }

  BD.sim.effects = { preImpact, register, special, scripts, precheck, impact, areaAt, chain, melee, landingSpot, baseCtx, afterHits };
})(globalThis.BD);
