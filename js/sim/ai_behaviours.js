// @ts-check
// Behaviour vocabulary (04 §3.2), each implemented once. decide() returns a cost in ms or null.
(function (BD) {
  'use strict';

  const Ai = BD.sim.ai;
  const Entities = BD.sim.entities;
  const Monsters = BD.sim.monsters;
  const Zones = () => BD.sim.zones;
  const reg = Ai.registerBehaviour;
  const { within, cheb, dirOf, DIRS } = BD.core.util;
  const Grid = BD.core.grid;

  const AiBalance = BD.data.balance.ai;   // behaviour defaults, read live so balance patches reach them

  // shared timings (ms)
  const RETRY_MS = 300;                // a behaviour that can't act this turn waits this long
  const RECOVER_MS = 300;              // default recovery after utility actions (revive, eat, wall)
  const AFTER_ACTION_MS = 400;         // pause after a revive, emerge or blink
  const NOTHING_LEFT_MS = 200;         // resolve found its corpse gone
  // melee / shoot
  const MELEE_WINDUP_FRAC = 0.8;       // melee wind-up is at most this share of the attack cycle
  const SHOOT_WINDUP_FRAC = 0.4;       // shooter wind-up share of the attack cycle
  const SMOKE_RETRY_MS = 400;          // a shooter that can't see into smoke and can't chase waits this long
  // search radii and pauses
  const EAT_SEARCH_RADIUS = 4;
  const EMERGE_SEARCH_RADIUS = 3;
  const EMERGE_DISPLACE_MS = 120;
  const SPAWN_PAUSE_MS = 500;
  const EXPLODE_CHASE_RETRY_MS = 250;
  const BLINK_SEARCH_RADIUS = 3;
  const LOB_PAUSE_MS = 500;

  const cdReady = (world, e, key) => !(e.ai.cds[key] > world.time);
  const setCd = (world, e, key, ms) => { e.ai.cds[key] = world.time + ms; };
  const stats = (world, e) => BD.sim.stats.statsOf(world, e);
  /** can e melee t from where it stands (adjacent, no corner cutting)? */
  function canMelee(world, e, t) {
    if (cheb(e.x, e.y, t.x, t.y) !== 1) return false;
    const dx = t.x - e.x, dy = t.y - e.y;
    if (dx && dy) {
      const f = world.floor;
      return Entities.walkable(f, e.x + dx, e.y) || Entities.walkable(f, e.x, e.y + dy) || !!e.phase;
    }
    return true;
  }

  // ---- melee: approach; wind-up; misses if the target leaves reach ----
  reg('melee', {
    decide(world, e, b, ctx) {
      if (canMelee(world, e, ctx.tgt)) {
        const s = stats(world, e);
        e.dir = dirOf(ctx.tgt.x - e.x, ctx.tgt.y - e.y);
        const w = Math.min(s.windupMs, s.attackCycleMs * MELEE_WINDUP_FRAC);
        const recover = Math.max(AiBalance.melee.minRecoverMs, s.attackCycleMs - w);
        return Ai.windup(world, e, { kind: 'melee', targetId: ctx.tgt.id, recover }, w);
      }
      const c = Ai.chase(world, e, ctx.tgt);
      return c != null ? c : RETRY_MS;
    },
    resolve(world, e, act) {
      const t = Entities.get(world, act.targetId);
      world.events.push({ type: 'monster.attack', id: e.id, targetId: act.targetId, x: e.x, y: e.y });
      if (t && !t.dead && t.hp > 0 && canMelee(world, e, t)) {
        BD.sim.damage.dealDamage(world, {
          srcId: e.id, tgtId: t.id, amounts: Monsters.hitAmounts(world, e), tags: ['melee', 'monster'],
          canCrit: false, canDodge: true, canBlock: true, mult: 1,
        });
      } else world.events.push({ type: 'miss', srcId: e.id, tgtId: act.targetId, reason: 'whiff', tags: ['melee'], x: e.x, y: e.y });
      return act.recover;
    },
  });

  // ---- shoot: travelling projectile at the target's tile; needs LOS; seeks a firing spot ----
  reg('shoot', {
    decide(world, e, b, ctx) {
      const range = b.range || AiBalance.shoot.range;
      const tgtInSmoke = ctx.tgt.kind === 'player' && BD.sim.zones.inSmoke(world, ctx.tgt.x, ctx.tgt.y);
      if (tgtInSmoke) return Ai.chase(world, e, ctx.tgt) || SMOKE_RETRY_MS;
      if (ctx.dist <= range + 0.5 && ctx.hasLos()) {
        e.dir = dirOf(ctx.tgt.x - e.x, ctx.tgt.y - e.y);
        const s = stats(world, e);
        const w = Math.min(AiBalance.shoot.maxWindupMs, s.attackCycleMs * SHOOT_WINDUP_FRAC);
        const act = {
          kind: 'shoot', targetId: ctx.tgt.id, tx: ctx.tgt.x, ty: ctx.tgt.y,
          projectile: b.projectile, range, recover: Math.max(AiBalance.shoot.minRecoverMs, s.attackCycleMs - w),
        };
        return Ai.windup(world, e, act, w, false);
      }
      if (ctx.tgt.kind !== 'player') return Ai.chase(world, e, ctx.tgt);
      const kite = Monsters.behaviour(e, 'kite');
      const field = BD.sim.pathing.losField(world, kite ? kite.min : 1, range);
      const c = Ai.stepAlong(world, e, field, false);
      return c != null ? c : Ai.chase(world, e, ctx.tgt) || RETRY_MS;
    },
    resolve(world, e, act) {
      const t = Entities.get(world, act.targetId);
      const tx = t ? t.x : act.tx;
      const ty = t ? t.y : act.ty;
      const d = Monsters.defOf(e);
      const onHit = (d.onHit || [])
        .filter((o) => world.rng.chance(o.chance))
        .map((o) => ({ status: o.status, durMs: o.durMs, mag: o.mag }));
      if (act.projectile === 'blood_bolt') onHit.push({ status: 'weakened', durMs: AiBalance.shoot.bloodBoltWeakenMs });
      BD.sim.projectiles.fireMonster(world, e, tx, ty, act.projectile, Monsters.hitAmounts(world, e), { range: act.range, onHit });
      world.events.push({ type: 'monster.shoot', id: e.id, kind: act.projectile, x: e.x, y: e.y });
      return act.recover;
    },
  });

  // ---- kite: keep distance between min and max ----
  reg('kite', {
    decide(world, e, b, ctx) {
      if (ctx.dist < b.min && ctx.tgt.kind === 'player') return Ai.stepAlong(world, e, BD.sim.pathing.chaseField(world), true);
      return null;
    },
  });

  // ---- coward: flee for 1.5 s when hit (chance); the pack routs when its leader dies ----
  reg('coward', {
    onHit(world, e, b) {
      if (world.rng.chance(b.fleePct)) e.ai.fleeMs = world.time + AiBalance.coward.fleeMs;
    },
    onDeath() {},
  });
  BD.sim.damage.onKillHooks.push((world, victim) => {
    if (victim.packId == null) return;
    for (const o of world.floor.entities.values()) {
      if (o.packId !== victim.packId || o.dead) continue;
      const c = Monsters.behaviour(o, 'coward');
      if (c && c.routOn === victim.def) {
        o.ai.fleeMs = world.time + AiBalance.coward.routFleeMs;
        world.events.push({ type: 'rout', id: o.id, x: o.x, y: o.y });
      }
    }
  });

  // ---- revive: raise a same-pack corpse (each corpse once) ----
  reg('revive', {
    decide(world, e, b) {
      if (!cdReady(world, e, 'revive')) return null;
      const c = (world.floor.corpses || []).find((k) => !k.revived && k.packId === e.packId && k.packId != null
        && within(e.x, e.y, k.x, k.y, b.radius) && k.def !== e.def);
      if (!c) return null;
      setCd(world, e, 'revive', b.cdMs);
      return Ai.windup(world, e, { kind: 'revive', corpseId: c.id, recover: RECOVER_MS }, AiBalance.revive.windupMs, false);
    },
    resolve(world, e, act) {
      const c = (world.floor.corpses || []).find((k) => k.id === act.corpseId);
      if (!c || c.revived) return NOTHING_LEFT_MS;
      c.revived = true;
      world.floor.corpses.splice(world.floor.corpses.indexOf(c), 1);
      const rank = c.rank === 'minion' ? 'minion' : 'normal';
      const m = Monsters.spawn(world, c.def, c.x, c.y, { packId: c.packId, noLoot: true, noXp: true, rank });
      world.events.push({ type: 'revive', id: m ? m.id : null, by: e.id, x: c.x, y: c.y });
      return AFTER_ACTION_MS;
    },
  });

  // ---- eat_corpse: heal and enrage ----
  reg('eat_corpse', {
    decide(world, e, b, ctx) {
      const tune = AiBalance.eat_corpse;
      const max = stats(world, e).maxLife;
      if (e.hp > max * tune.belowLifeFrac || !cdReady(world, e, 'eat')) return null;
      const c = (world.floor.corpses || []).find((k) => !k.eaten && within(e.x, e.y, k.x, k.y, EAT_SEARCH_RADIUS));
      if (!c) return null;
      if (cheb(e.x, e.y, c.x, c.y) <= 1) {
        setCd(world, e, 'eat', tune.cooldownMs);
        return Ai.windup(world, e, { kind: 'eat_corpse', corpseId: c.id, heal: b.heal, recover: RECOVER_MS }, tune.windupMs, false);
      }
      const path = BD.sim.pathing.path(world, e.x, e.y, c.x, c.y);
      if (!path || !path.length) return null;
      const ms = Ai.moveCost(world, e);
      return BD.sim.movement.startStep(world, e, path[0][0], path[0][1], ms) ? ms : null;
    },
    resolve(world, e, act) {
      const c = (world.floor.corpses || []).find((k) => k.id === act.corpseId);
      if (!c) return NOTHING_LEFT_MS;
      world.floor.corpses.splice(world.floor.corpses.indexOf(c), 1);
      BD.sim.status.heal(world, e, stats(world, e).maxLife * act.heal);
      BD.sim.status.apply(world, e, 'enraged', { durMs: AiBalance.eat_corpse.enrageMs });
      world.events.push({ type: 'corpse.eaten', id: e.id, x: c.x, y: c.y });
      return RECOVER_MS;
    },
  });

  // ---- bone_wall: a 3-tile wall segment (6 s) between itself and the player ----
  reg('bone_wall', {
    decide(world, e, b, ctx) {
      const tune = AiBalance.bone_wall;
      if (!cdReady(world, e, 'wall') || ctx.dist > tune.maxDist || ctx.dist < tune.minDist || !ctx.hasLos()) return null;
      setCd(world, e, 'wall', b.cdMs);
      return Ai.windup(world, e, { kind: 'bone_wall', tx: ctx.tgt.x, ty: ctx.tgt.y, recover: RECOVER_MS }, tune.windupMs, false);
    },
    resolve(world, e, act) {
      const f = world.floor;
      const mx = Math.round((e.x + act.tx) / 2), my = Math.round((e.y + act.ty) / 2);
      const dx = act.tx - e.x, dy = act.ty - e.y;
      const px = -Math.sign(dy), py = Math.sign(dx);           // perpendicular
      const tiles = [];
      for (let k = -1; k <= 1; k++) {
        const x = mx + px * k, y = my + py * k;
        if (Entities.isFree(f, x, y)) {
          tiles.push([x, y]);
          f.block[Grid.idx(f, x, y)] = 1;
        }
      }
      if (tiles.length) {
        f.blockVer = (f.blockVer || 0) + 1;
        f.boneWalls = f.boneWalls || [];
        f.boneWalls.push({ tiles, until: world.time + AiBalance.bone_wall.lifeMs });
        BD.core.scheduler.after(world, AiBalance.bone_wall.lifeMs, 'bone_wall.end', { tiles });
        world.events.push({ type: 'bone_wall', tiles });
      }
      return RECOVER_MS;
    },
  });
  BD.core.scheduler.register('bone_wall.end', (world, pl) => {
    const f = world.floor;
    for (const [x, y] of pl.tiles) f.block[Grid.idx(f, x, y)] = 0;
    f.blockVer = (f.blockVer || 0) + 1;
    if (f.boneWalls) f.boneWalls = f.boneWalls.filter((w) => w.until > world.time);
    world.events.push({ type: 'bone_wall.end', tiles: pl.tiles });
  });

  // ---- drain: heal pct of damage dealt ----
  reg('drain', { onDealt(world, e, b, tgt, res) { BD.sim.status.heal(world, e, res.total * b.pct); } });

  // ---- burrow: submerge, travel, emerge under the player after an 800 ms ring telegraph ----
  reg('burrow', {
    decide(world, e, b, ctx) {
      const tune = AiBalance.burrow;
      if (!cdReady(world, e, 'burrow') || ctx.dist < tune.minDist || ctx.tgt.kind !== 'player') return null;
      setCd(world, e, 'burrow', b.cdMs * (e.ai.burrowK || 1));
      e.untargetable = true;
      world.events.push({ type: 'burrow', id: e.id, x: e.x, y: e.y });
      return Ai.windup(world, e, { kind: 'burrow_travel', recover: 0, mult: b.mult || tune.mult }, tune.travelMs, false);
    },
  });
  reg('burrow_travel', {
    resolve(world, e, act) {
      const p = world.player;
      const tiles = [[p.x, p.y]];
      Zones().create(world, {
        tiles, cx: p.x, cy: p.y, armMs: AiBalance.burrow.telegraphMs, faction: 'monster', srcId: e.id, school: 'dust', heavy: true,
        resolve: { type: 'packet', amounts: Monsters.hitAmounts(world, e, act.mult) }, kind: 'burrow',
      });
      e.ai.state = 'windup';
      e.ai.action = { kind: 'burrow_emerge', zx: p.x, zy: p.y, exposedMs: e.rank === 'boss' ? AiBalance.burrow.bossExposedMs : 0 };
      e.ai.timer = AiBalance.burrow.telegraphMs;
      return AiBalance.burrow.telegraphMs;
    },
  });
  reg('burrow_emerge', {
    resolve(world, e, act) {
      const f = world.floor;
      e.untargetable = false;
      const notOnMark = (x, y) => !(x === act.zx && y === act.zy);
      const spot = Entities.nearestFree(f, act.zx, act.zy, EMERGE_SEARCH_RADIUS, notOnMark) || { x: e.x, y: e.y };
      BD.sim.movement.displace(world, e, spot.x, spot.y, EMERGE_DISPLACE_MS, 'blink');
      world.events.push({ type: 'emerge', id: e.id, x: spot.x, y: spot.y });
      return AFTER_ACTION_MS;
    },
  });

  // ---- dormant: statue until close (handled in notice) ----
  reg('dormant', {});
  reg('fearless', {});
  reg('phase', {});
  reg('evade', {});
  reg('block_front', {});

  // ---- spawn: stationary spawner ----
  reg('spawn', {
    decide(world, e, b) {
      if (!cdReady(world, e, 'spawn')) return RETRY_MS;
      setCd(world, e, 'spawn', b.every);
      let n = 0;
      for (const o of world.floor.entities.values()) if (o.spawnedBy === e.id && !o.dead) n++;
      if (n >= b.cap) return SPAWN_PAUSE_MS;
      Monsters.spawn(world, b.what, e.x, e.y, { spawnedBy: e.id, noLoot: true, noXp: false, packId: e.packId });
      return SPAWN_PAUSE_MS;
    },
  });

  // ---- explode: run at the player; when adjacent light the fuse; explode ----
  reg('explode', {
    decide(world, e, b, ctx) {
      if (cheb(e.x, e.y, ctx.tgt.x, ctx.tgt.y) <= 1) {
        const tiles = Grid.shapeOffsets('circle', b.radius).map(([dx, dy]) => [e.x + dx, e.y + dy]);
        const z = Zones().create(world, {
          tiles, cx: e.x, cy: e.y, armMs: b.fuseMs, faction: 'monster', srcId: e.id, school: 'fire', heavy: true,
          resolve: { type: 'packet', amounts: Monsters.hitAmounts(world, e, b.dmgMult) }, kind: 'imp_blast',
        });
        e.ai.zoneIds = [z.id];
        return Ai.windup(world, e, { kind: 'explode', recover: 0 }, b.fuseMs);
      }
      return Ai.chase(world, e, ctx.tgt) || EXPLODE_CHASE_RETRY_MS;
    },
    resolve(world, e) {
      e.noLoot = e.noLoot || false;
      world.events.push({ type: 'explode', id: e.id, x: e.x, y: e.y });
      BD.sim.damage.kill(world, e, null, { tags: ['self'], amounts: { fire: 1 } });
      return 0;
    },
  });

  // ---- split: on death, split into smaller monsters ----
  reg('split', {
    onDeath(world, e, b) {
      const max = stats(world, e).maxLife;
      for (let i = 0; i < b.count; i++) {
        Monsters.spawn(world, b.into, e.x, e.y, { hpBase: max * b.hpPct, packId: e.packId, noLoot: true, rank: 'normal' });
      }
    },
  });

  // ---- blink_away: teleport away when the player gets adjacent ----
  reg('blink_away', {
    decide(world, e, b, ctx) {
      if (!ctx.adj || !cdReady(world, e, 'blink')) return null;
      setCd(world, e, 'blink', b.cdMs);
      const f = world.floor, t = ctx.tgt;
      const dx = Math.sign(e.x - t.x) || 1, dy = Math.sign(e.y - t.y);
      const spot = Entities.nearestFree(f, e.x + dx * b.dist, e.y + dy * b.dist, BLINK_SEARCH_RADIUS)
        || Entities.nearestFree(f, e.x - dy * b.dist, e.y + dx * b.dist, BLINK_SEARCH_RADIUS);
      if (!spot) return null;
      const fx = e.x, fy = e.y;
      BD.sim.movement.displace(world, e, spot.x, spot.y, 1, 'blink');
      e.move = null;
      world.events.push({ type: 'blink', id: e.id, fromX: fx, fromY: fy, x: spot.x, y: spot.y });
      return AFTER_ACTION_MS;
    },
  });

  // ---- charge_line: telegraphed line charge; hitting a wall = Exposed 2 s ----
  reg('charge_line', {
    decide(world, e, b, ctx) {
      if (!cdReady(world, e, 'charge') || ctx.dist < AiBalance.charge_line.minDist || ctx.dist > b.len + 0.5 || !ctx.hasLos()) return null;
      setCd(world, e, 'charge', b.cdMs || AiBalance.charge_line.cooldownMs);
      const tiles = Grid.rayTiles(e.x, e.y, ctx.tgt.x - e.x, ctx.tgt.y - e.y, b.len);
      e.dir = dirOf(ctx.tgt.x - e.x, ctx.tgt.y - e.y);
      const z = Zones().create(world, {
        tiles, cx: e.x, cy: e.y, armMs: b.windupMs, faction: 'monster', srcId: e.id, school: 'blood', heavy: true,
        resolve: null, kind: 'charge_mark',
      });
      e.ai.zoneIds = [z.id];
      return Ai.windup(world, e, { kind: 'charge_line', tiles, mult: b.mult || AiBalance.charge_line.mult, heavy: true }, b.windupMs);
    },
    resolve(world, e, act) { return BD.sim.ai_moves.chargeLine(world, e, act.tiles, act.mult, AiBalance.charge_line.wallExposedMs); },
  });

  // ---- cleave_cone: telegraphed cone; Exposed 1 s after ----
  reg('cleave_cone', {
    decide(world, e, b, ctx) {
      if (!cdReady(world, e, 'cleave') || ctx.dist > b.radius + 0.5) return null;
      setCd(world, e, 'cleave', b.cdMs || AiBalance.cleave_cone.cooldownMs);
      const aim = { x: ctx.tgt.x - e.x, y: ctx.tgt.y - e.y };
      const tiles = Grid.shapeTiles({ shape: 'cone', length: b.radius, angle: AiBalance.cleave_cone.angle }, e.x, e.y, aim, e.dir);
      e.dir = dirOf(ctx.tgt.x - e.x, ctx.tgt.y - e.y);
      const z = Zones().create(world, {
        tiles, cx: e.x, cy: e.y, armMs: b.windupMs, faction: 'monster', srcId: e.id, school: 'blood', heavy: true,
        resolve: { type: 'packet', amounts: Monsters.hitAmounts(world, e, b.mult || AiBalance.cleave_cone.mult) }, kind: 'cleave',
      });
      e.ai.zoneIds = [z.id];
      return Ai.windup(world, e, { kind: 'cleave_cone', exposedMs: AiBalance.cleave_cone.exposedMs, heavy: true }, b.windupMs);
    },
    resolve() { return AiBalance.cleave_cone.recoverMs; },
  });

  // ---- lob: a projectile that creates a zone at the player's tile after armMs ----
  reg('lob', {
    decide(world, e, b, ctx) {
      const range = b.range || AiBalance.shoot.range;
      if (!cdReady(world, e, 'lob') || ctx.dist > range || ctx.dist < AiBalance.lob.minDist || !ctx.hasLos()) return null;
      setCd(world, e, 'lob', b.cdMs);
      const t = ctx.tgt;
      world.events.push({ type: 'lob', srcId: e.id, fromX: e.x, fromY: e.y, x: t.x, y: t.y, ms: b.armMs, kind: b.zone });
      const zd = BD.data.zones[b.zone];
      const statuses = zd && zd.status ? [{ id: zd.status, durMs: zd.statusMs, mag: zd.statusMag }] : [];
      Zones().create(world, {
        tiles: [[t.x, t.y]], cx: t.x, cy: t.y, armMs: b.armMs, faction: 'monster', srcId: e.id,
        school: zd ? zd.school : 'bone', kind: b.zone + '_lob',
        resolve: { type: 'packet', amounts: { phys: 0.0001 }, statuses, linger: { kind: b.zone, durMs: AiBalance.lob.lingerMs } },
      });
      return LOB_PAUSE_MS;
    },
  });

  // ---- death_zone: on death, a zone at its tile after a swelling telegraph ----
  reg('death_zone', {
    onDeath(world, e, b) {
      const tune = AiBalance.death_zone;
      const tiles = Grid.shapeOffsets('circle', 1).map(([dx, dy]) => [e.x + dx, e.y + dy]);
      const zd = BD.data.zones[b.zone];
      Zones().create(world, {
        tiles, cx: e.x, cy: e.y, armMs: b.armMs, faction: 'monster', srcId: null, school: zd.school, kind: 'death_' + b.zone,
        resolve: {
          type: 'packet', amounts: { pois: Monsters.avgDmg(world, e) * tune.dmgMult },
          statuses: [{ id: 'poisoned', durMs: tune.poisonMs }],
          linger: { kind: b.zone, durMs: tune.lingerMs, amount: Monsters.avgDmg(world, e) * tune.lingerMult },
        },
      });
    },
  });

  BD.sim.ai_helpers = { cdReady, setCd, canMelee };
})(globalThis.BD);
