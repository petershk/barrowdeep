// @ts-check
// Behaviour vocabulary (04 §3.2), each implemented once. decide() returns a cost in ms or null.
(function (BD) {
  'use strict';

  const AI = BD.sim.ai;
  const E = BD.sim.entities;
  const MON = BD.sim.monsters;
  const Z = () => BD.sim.zones;
  const reg = AI.registerBehaviour;
  const { within, cheb, dirOf, DIRS } = BD.core.util;
  const G = BD.core.grid;

  const cdReady = (world, e, key) => !(e.ai.cds[key] > world.time);
  const setCd = (world, e, key, ms) => { e.ai.cds[key] = world.time + ms; };
  const stats = (world, e) => BD.sim.stats.statsOf(world, e);
  /** can e melee t from where it stands (adjacent, no corner cutting)? */
  function canMelee(world, e, t) {
    if (cheb(e.x, e.y, t.x, t.y) !== 1) return false;
    const dx = t.x - e.x, dy = t.y - e.y;
    if (dx && dy) { const f = world.floor; return E.walkable(f, e.x + dx, e.y) || E.walkable(f, e.x, e.y + dy) || !!e.phase; }
    return true;
  }

  // ---- melee: approach; wind-up; misses if the target leaves reach ----
  reg('melee', {
    decide(world, e, b, ctx) {
      if (canMelee(world, e, ctx.tgt)) {
        const s = stats(world, e);
        e.dir = dirOf(ctx.tgt.x - e.x, ctx.tgt.y - e.y);
        const w = Math.min(s.windupMs, s.attackCycleMs * 0.8);
        return AI.windup(world, e, { kind: 'melee', targetId: ctx.tgt.id, recover: Math.max(150, s.attackCycleMs - w) }, w);
      }
      const c = AI.chase(world, e, ctx.tgt);
      return c != null ? c : 300;
    },
    resolve(world, e, act) {
      const t = E.get(world, act.targetId);
      world.events.push({ type: 'monster.attack', id: e.id, targetId: act.targetId, x: e.x, y: e.y });
      if (t && !t.dead && t.hp > 0 && canMelee(world, e, t)) {
        BD.sim.damage.dealDamage(world, {
          srcId: e.id, tgtId: t.id, amounts: MON.hitAmounts(world, e), tags: ['melee', 'monster'],
          canCrit: false, canDodge: true, canBlock: true, mult: 1,
        });
      } else world.events.push({ type: 'miss', srcId: e.id, tgtId: act.targetId, reason: 'whiff', tags: ['melee'], x: e.x, y: e.y });
      return act.recover;
    },
  });

  // ---- shoot: travelling projectile at the target's tile; needs LOS; seeks a firing spot ----
  reg('shoot', {
    decide(world, e, b, ctx) {
      const range = b.range || 6;
      if (ctx.tgt.kind === 'player' && BD.sim.zones.inSmoke(world, ctx.tgt.x, ctx.tgt.y)) return AI.chase(world, e, ctx.tgt) || 400;
      if (ctx.dist <= range + 0.5 && ctx.hasLos()) {
        e.dir = dirOf(ctx.tgt.x - e.x, ctx.tgt.y - e.y);
        const s = stats(world, e);
        const w = Math.min(450, s.attackCycleMs * 0.4);
        const act = {
          kind: 'shoot', targetId: ctx.tgt.id, tx: ctx.tgt.x, ty: ctx.tgt.y,
          projectile: b.projectile, range, recover: Math.max(200, s.attackCycleMs - w),
        };
        return AI.windup(world, e, act, w, false);
      }
      if (ctx.tgt.kind !== 'player') return AI.chase(world, e, ctx.tgt);
      const kite = MON.behaviour(e, 'kite');
      const field = BD.sim.pathing.losField(world, kite ? kite.min : 1, range);
      const c = AI.stepAlong(world, e, field, false);
      return c != null ? c : AI.chase(world, e, ctx.tgt) || 300;
    },
    resolve(world, e, act) {
      const t = E.get(world, act.targetId);
      const tx = t ? t.x : act.tx, ty = t ? t.y : act.ty;
      const d = MON.defOf(e);
      const onHit = (d.onHit || [])
        .filter((o) => world.rng.chance(o.chance))
        .map((o) => ({ status: o.status, durMs: o.durMs, mag: o.mag }));
      if (act.projectile === 'blood_bolt') onHit.push({ status: 'weakened', durMs: 4000 });
      BD.sim.projectiles.fireMonster(world, e, tx, ty, act.projectile, MON.hitAmounts(world, e), { range: act.range, onHit });
      world.events.push({ type: 'monster.shoot', id: e.id, kind: act.projectile, x: e.x, y: e.y });
      return act.recover;
    },
  });

  // ---- kite: keep distance between min and max ----
  reg('kite', {
    decide(world, e, b, ctx) {
      if (ctx.dist < b.min && ctx.tgt.kind === 'player') return AI.stepAlong(world, e, BD.sim.pathing.chaseField(world), true);
      return null;
    },
  });

  // ---- coward: flee for 1.5 s when hit (chance); the pack routs when its leader dies ----
  reg('coward', {
    onHit(world, e, b) { if (world.rng.chance(b.fleePct)) e.ai.fleeMs = world.time + 1500; },
    onDeath() {},
  });
  BD.sim.damage.onKillHooks.push((world, victim) => {
    if (victim.packId == null) return;
    for (const o of world.floor.entities.values()) {
      if (o.packId !== victim.packId || o.dead) continue;
      const c = MON.behaviour(o, 'coward');
      if (c && c.routOn === victim.def) { o.ai.fleeMs = world.time + 4000; world.events.push({ type: 'rout', id: o.id, x: o.x, y: o.y }); }
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
      return AI.windup(world, e, { kind: 'revive', corpseId: c.id, recover: 300 }, 800, false);
    },
    resolve(world, e, act) {
      const c = (world.floor.corpses || []).find((k) => k.id === act.corpseId);
      if (!c || c.revived) return 200;
      c.revived = true;
      world.floor.corpses.splice(world.floor.corpses.indexOf(c), 1);
      const rank = c.rank === 'minion' ? 'minion' : 'normal';
      const m = MON.spawn(world, c.def, c.x, c.y, { packId: c.packId, noLoot: true, noXp: true, rank });
      world.events.push({ type: 'revive', id: m ? m.id : null, by: e.id, x: c.x, y: c.y });
      return 400;
    },
  });

  // ---- eat_corpse: heal and enrage ----
  reg('eat_corpse', {
    decide(world, e, b, ctx) {
      const max = stats(world, e).maxLife;
      if (e.hp > max * 0.8 || !cdReady(world, e, 'eat')) return null;
      const c = (world.floor.corpses || []).find((k) => !k.eaten && within(e.x, e.y, k.x, k.y, 4));
      if (!c) return null;
      if (cheb(e.x, e.y, c.x, c.y) <= 1) {
        setCd(world, e, 'eat', 6000);
        return AI.windup(world, e, { kind: 'eat_corpse', corpseId: c.id, heal: b.heal, recover: 300 }, 700, false);
      }
      const path = BD.sim.pathing.path(world, e.x, e.y, c.x, c.y);
      if (!path || !path.length) return null;
      const ms = AI.moveCost(world, e);
      return BD.sim.movement.startStep(world, e, path[0][0], path[0][1], ms) ? ms : null;
    },
    resolve(world, e, act) {
      const c = (world.floor.corpses || []).find((k) => k.id === act.corpseId);
      if (!c) return 200;
      world.floor.corpses.splice(world.floor.corpses.indexOf(c), 1);
      BD.sim.status.heal(world, e, stats(world, e).maxLife * act.heal);
      BD.sim.status.apply(world, e, 'enraged', { durMs: 5000 });
      world.events.push({ type: 'corpse.eaten', id: e.id, x: c.x, y: c.y });
      return 300;
    },
  });

  // ---- bone_wall: a 3-tile wall segment (6 s) between itself and the player ----
  reg('bone_wall', {
    decide(world, e, b, ctx) {
      if (!cdReady(world, e, 'wall') || ctx.dist > 6 || ctx.dist < 2.5 || !ctx.hasLos()) return null;
      setCd(world, e, 'wall', b.cdMs);
      return AI.windup(world, e, { kind: 'bone_wall', tx: ctx.tgt.x, ty: ctx.tgt.y, recover: 300 }, 600, false);
    },
    resolve(world, e, act) {
      const f = world.floor;
      const mx = Math.round((e.x + act.tx) / 2), my = Math.round((e.y + act.ty) / 2);
      const dx = act.tx - e.x, dy = act.ty - e.y;
      const px = -Math.sign(dy), py = Math.sign(dx);           // perpendicular
      const tiles = [];
      for (let k = -1; k <= 1; k++) {
        const x = mx + px * k, y = my + py * k;
        if (E.isFree(f, x, y)) { tiles.push([x, y]); f.block[y * f.w + x] = 1; }
      }
      if (tiles.length) {
        f.blockVer = (f.blockVer || 0) + 1;
        f.boneWalls = f.boneWalls || [];
        f.boneWalls.push({ tiles, until: world.time + 6000 });
        BD.core.scheduler.after(world, 6000, 'bone_wall.end', { tiles });
        world.events.push({ type: 'bone_wall', tiles });
      }
      return 300;
    },
  });
  BD.core.scheduler.register('bone_wall.end', (world, pl) => {
    const f = world.floor;
    for (const [x, y] of pl.tiles) f.block[y * f.w + x] = 0;
    f.blockVer = (f.blockVer || 0) + 1;
    if (f.boneWalls) f.boneWalls = f.boneWalls.filter((w) => w.until > world.time);
    world.events.push({ type: 'bone_wall.end', tiles: pl.tiles });
  });

  // ---- drain: heal pct of damage dealt ----
  reg('drain', { onDealt(world, e, b, tgt, res) { BD.sim.status.heal(world, e, res.total * b.pct); } });

  // ---- burrow: submerge, travel, emerge under the player after an 800 ms ring telegraph ----
  reg('burrow', {
    decide(world, e, b, ctx) {
      if (!cdReady(world, e, 'burrow') || ctx.dist < 2.5 || ctx.tgt.kind !== 'player') return null;
      setCd(world, e, 'burrow', b.cdMs * (e.ai.burrowK || 1));
      e.untargetable = true;
      world.events.push({ type: 'burrow', id: e.id, x: e.x, y: e.y });
      return AI.windup(world, e, { kind: 'burrow_travel', recover: 0, mult: b.mult || 1.5 }, 900, false);
    },
  });
  reg('burrow_travel', {
    resolve(world, e, act) {
      const p = world.player;
      const tiles = [[p.x, p.y]];
      Z().create(world, { tiles, cx: p.x, cy: p.y, armMs: 800, faction: 'monster', srcId: e.id, school: 'dust', heavy: true,
        resolve: { type: 'packet', amounts: MON.hitAmounts(world, e, act.mult) }, kind: 'burrow' });
      e.ai.state = 'windup'; e.ai.action = { kind: 'burrow_emerge', zx: p.x, zy: p.y, exposedMs: e.rank === 'boss' ? 1400 : 0 };
      e.ai.timer = 800;
      return 800;
    },
  });
  reg('burrow_emerge', {
    resolve(world, e, act) {
      const f = world.floor;
      e.untargetable = false;
      const spot = E.nearestFree(f, act.zx, act.zy, 3, (x, y) => !(x === act.zx && y === act.zy)) || { x: e.x, y: e.y };
      BD.sim.movement.displace(world, e, spot.x, spot.y, 120, 'blink');
      world.events.push({ type: 'emerge', id: e.id, x: spot.x, y: spot.y });
      return 400;
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
      if (!cdReady(world, e, 'spawn')) return 300;
      setCd(world, e, 'spawn', b.every);
      let n = 0;
      for (const o of world.floor.entities.values()) if (o.spawnedBy === e.id && !o.dead) n++;
      if (n >= b.cap) return 500;
      MON.spawn(world, b.what, e.x, e.y, { spawnedBy: e.id, noLoot: true, noXp: false, packId: e.packId });
      return 500;
    },
  });

  // ---- explode: run at the player; when adjacent light the fuse; explode ----
  reg('explode', {
    decide(world, e, b, ctx) {
      if (cheb(e.x, e.y, ctx.tgt.x, ctx.tgt.y) <= 1) {
        const tiles = G.shapeOffsets('circle', b.radius).map(([dx, dy]) => [e.x + dx, e.y + dy]);
        const z = Z().create(world, {
          tiles, cx: e.x, cy: e.y, armMs: b.fuseMs, faction: 'monster', srcId: e.id, school: 'fire', heavy: true,
          resolve: { type: 'packet', amounts: MON.hitAmounts(world, e, b.dmgMult) }, kind: 'imp_blast',
        });
        e.ai.zoneIds = [z.id];
        return AI.windup(world, e, { kind: 'explode', recover: 0 }, b.fuseMs);
      }
      return AI.chase(world, e, ctx.tgt) || 250;
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
        MON.spawn(world, b.into, e.x, e.y, { hpBase: max * b.hpPct, packId: e.packId, noLoot: true, rank: 'normal' });
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
      const spot = E.nearestFree(f, e.x + dx * b.dist, e.y + dy * b.dist, 3) || E.nearestFree(f, e.x - dy * b.dist, e.y + dx * b.dist, 3);
      if (!spot) return null;
      const fx = e.x, fy = e.y;
      BD.sim.movement.displace(world, e, spot.x, spot.y, 1, 'blink');
      e.move = null;
      world.events.push({ type: 'blink', id: e.id, fromX: fx, fromY: fy, x: spot.x, y: spot.y });
      return 400;
    },
  });

  // ---- charge_line: telegraphed line charge; hitting a wall = Exposed 2 s ----
  reg('charge_line', {
    decide(world, e, b, ctx) {
      if (!cdReady(world, e, 'charge') || ctx.dist < 2 || ctx.dist > b.len + 0.5 || !ctx.hasLos()) return null;
      setCd(world, e, 'charge', b.cdMs || 7000);
      const tiles = G.rayTiles(e.x, e.y, ctx.tgt.x - e.x, ctx.tgt.y - e.y, b.len);
      e.dir = dirOf(ctx.tgt.x - e.x, ctx.tgt.y - e.y);
      const z = Z().create(world, {
        tiles, cx: e.x, cy: e.y, armMs: b.windupMs, faction: 'monster', srcId: e.id, school: 'blood', heavy: true,
        resolve: null, kind: 'charge_mark',
      });
      e.ai.zoneIds = [z.id];
      return AI.windup(world, e, { kind: 'charge_line', tiles, mult: b.mult || 1.8, heavy: true }, b.windupMs);
    },
    resolve(world, e, act) { return BD.sim.ai_moves.chargeLine(world, e, act.tiles, act.mult, 2000); },
  });

  // ---- cleave_cone: telegraphed cone; Exposed 1 s after ----
  reg('cleave_cone', {
    decide(world, e, b, ctx) {
      if (!cdReady(world, e, 'cleave') || ctx.dist > b.radius + 0.5) return null;
      setCd(world, e, 'cleave', b.cdMs || 5000);
      const aim = { x: ctx.tgt.x - e.x, y: ctx.tgt.y - e.y };
      const tiles = G.shapeTiles({ shape: 'cone', length: b.radius, angle: 100 }, e.x, e.y, aim, e.dir);
      e.dir = dirOf(ctx.tgt.x - e.x, ctx.tgt.y - e.y);
      const z = Z().create(world, {
        tiles, cx: e.x, cy: e.y, armMs: b.windupMs, faction: 'monster', srcId: e.id, school: 'blood', heavy: true,
        resolve: { type: 'packet', amounts: MON.hitAmounts(world, e, b.mult || 1.6) }, kind: 'cleave',
      });
      e.ai.zoneIds = [z.id];
      return AI.windup(world, e, { kind: 'cleave_cone', exposedMs: 1000, heavy: true }, b.windupMs);
    },
    resolve() { return 200; },
  });

  // ---- lob: a projectile that creates a zone at the player's tile after armMs ----
  reg('lob', {
    decide(world, e, b, ctx) {
      if (!cdReady(world, e, 'lob') || ctx.dist > (b.range || 6) || ctx.dist < 1.5 || !ctx.hasLos()) return null;
      setCd(world, e, 'lob', b.cdMs);
      const t = ctx.tgt;
      world.events.push({ type: 'lob', srcId: e.id, fromX: e.x, fromY: e.y, x: t.x, y: t.y, ms: b.armMs, kind: b.zone });
      const zd = BD.data.zones[b.zone];
      const statuses = zd && zd.status ? [{ id: zd.status, durMs: zd.statusMs, mag: zd.statusMag }] : [];
      Z().create(world, {
        tiles: [[t.x, t.y]], cx: t.x, cy: t.y, armMs: b.armMs, faction: 'monster', srcId: e.id,
        school: zd ? zd.school : 'bone', kind: b.zone + '_lob',
        resolve: { type: 'packet', amounts: { phys: 0.0001 }, statuses, linger: { kind: b.zone, durMs: 3000 } },
      });
      return 500;
    },
  });

  // ---- death_zone: on death, a zone at its tile after a swelling telegraph ----
  reg('death_zone', {
    onDeath(world, e, b) {
      const tiles = G.shapeOffsets('circle', 1).map(([dx, dy]) => [e.x + dx, e.y + dy]);
      const zd = BD.data.zones[b.zone];
      Z().create(world, {
        tiles, cx: e.x, cy: e.y, armMs: b.armMs, faction: 'monster', srcId: null, school: zd.school, kind: 'death_' + b.zone,
        resolve: {
          type: 'packet', amounts: { pois: MON.avgDmg(world, e) * 0.5 }, statuses: [{ id: 'poisoned', durMs: 4000 }],
          linger: { kind: b.zone, durMs: 4000, amount: MON.avgDmg(world, e) * 0.1 },
        },
      });
    },
  });

  BD.sim.ai_helpers = { cdReady, setCd, canMelee };
})(globalThis.BD);
