// @ts-check
// Travelling projectiles (06 §8.4): straight lines to range + 1, DDA tile traversal each step so
// fast shots can't skip tiles, no homing unless a skill says so. They can be sidestepped.
(function (BD) {
  'use strict';

  const Grid = BD.core.grid;
  const Entities = BD.sim.entities;
  const { SEE } = BD.data.tiles;
  const ProjectileData = () => BD.data.projectiles;

  const MAX_TRAVERSE_TILES = 64;     // safety cap on tiles visited by one traversal
  const DEFAULT_RANGE = 7;           // tiles, when neither the skill nor the monster names one
  const PIERCE_ALL = 99;             // pierce: 'all' as a count no volley reaches
  const VOLLEY_HITS_PER_TARGET = 2;  // one volley strikes each enemy at most this often
  const ERRATIC_SEED_PHASE = 97;     // erratic shots: per-projectile phase offset...
  const ERRATIC_PERIOD_MS = 70;      // ...wobble period (ms per radian)...
  const ERRATIC_AMPLITUDE = 0.35;    // ...and sideways drift per tile travelled
  const RICOCHET_RANGE = 4;          // a ricochet seeks the next enemy within this many tiles

  /** distance from p0 to the first tile edge crossed moving in direction s (tiles centred on integers) */
  const toFirstEdge = (p0, i, s) => (s > 0 ? i + 0.5 - p0 : p0 - (i - 0.5));

  /** visit tiles crossed by the segment (x0,y0)→(x1,y1) in tile-centre coordinates (excludes start tile) */
  function traverse(x0, y0, x1, y1, cb) {
    let ix = Math.round(x0), iy = Math.round(y0);
    const ex = Math.round(x1), ey = Math.round(y1);
    const dx = x1 - x0, dy = y1 - y0;
    const sx = dx > 0 ? 1 : -1;
    const sy = dy > 0 ? 1 : -1;
    const tdx = dx ? Math.abs(1 / dx) : Infinity;
    const tdy = dy ? Math.abs(1 / dy) : Infinity;
    let tmx = dx ? toFirstEdge(x0, ix, sx) * tdx : Infinity;
    let tmy = dy ? toFirstEdge(y0, iy, sy) * tdy : Infinity;
    for (let g = 0; g < MAX_TRAVERSE_TILES && (ix !== ex || iy !== ey); g++) {
      if (tmx > 1 && tmy > 1) break;
      if (tmx < tmy) {
        ix += sx;
        tmx += tdx;
      } else {
        iy += sy;
        tmy += tdy;
      }
      if (cb(ix, iy) === false) return false;
    }
    return true;
  }

  function spawn(world, o) {
    const f = world.floor;
    const kind = ProjectileData()[o.kind] || ProjectileData().arrow;
    const len = Math.hypot(o.dx, o.dy) || 1;
    const pr = {
      id: world.nextId++, kind: o.kind, srcId: o.srcId, faction: o.faction, x: o.x, y: o.y, dx: o.dx / len, dy: o.dy / len,
      speed: o.speed || kind.speed, maxDist: o.maxDist, dist: 0, pierce: o.pierce || 0, hitIds: [], payload: o.payload,
      stopAt: o.stopAt || null, element: kind.element, ricochet: o.ricochet || 0, returns: !!o.returns, returning: false,
      erratic: !!kind.erratic, seed: world.nextId,
    };
    f.projectiles.push(pr);
    world.events.push({ type: 'projectile.spawn', id: pr.id, kind: pr.kind, srcId: pr.srcId, x: pr.x, y: pr.y, dx: pr.dx, dy: pr.dy });
    return pr;
  }

  /** Fire the projectiles of an ability (count, spread, pierce from delivery). */
  function fireAbility(world, caster, ab, rank, a, tx, ty, ctx) {
    const d = ab.delivery;
    const s = BD.sim.stats.statsOf(world, caster.kind === 'monster' ? caster : world.player);
    let count = d.count || 1;
    if (d.extraFromStat) count += s.extra_projectiles || 0;
    const spread = ((d.spread || 0) * Math.PI) / 180;
    let ax = tx - caster.x, ay = ty - caster.y;
    if (!ax && !ay) {
      const v = BD.core.util.DIRS[caster.dir];
      ax = v[0];
      ay = v[1];
    }
    const base = Math.atan2(ay, ax);
    const range = (ab.targeting && ab.targeting.range) || DEFAULT_RANGE;
    const kind = d.projectile || 'arrow';
    // a volley strikes each enemy at most twice: later arrows pass through (big targets can't eat a whole volley)
    const group = { hits: 0, abilityId: ab.id, ids: count > 1 ? [] : null };
    const casterId = caster.kind === 'ally' ? caster.ownerId || caster.id : caster.id;
    for (let i = 0; i < count; i++) {
      const ang = count > 1 ? base - spread / 2 + (spread * i) / (count - 1) : base;
      spawn(world, {
        kind, srcId: ctx.srcId, faction: caster.faction, x: caster.x, y: caster.y, dx: Math.cos(ang), dy: Math.sin(ang),
        maxDist: d.maxDist || range + 1, pierce: d.pierce === 'all' ? PIERCE_ALL : d.pierce || 0, ricochet: d.ricochet || 0,
        returns: !!d.returns,
        stopAt: d.stopAtTarget ? { x: tx, y: ty } : null,
        payload: {
          type: 'ability', abilityId: ab.id, rank, combo: ctx.combo, focus: ctx.focus, casterId,
          forceCrit: ctx.forceCrit, critAdd: ctx.critAdd, packetMult: ctx.packetMult, idx: i, group,
        },
      });
    }
  }

  /** Monster projectile carrying a ready damage packet template. */
  function fireMonster(world, m, tx, ty, kind, amounts, extra) {
    const range = (extra && extra.range) || DEFAULT_RANGE;
    return spawn(world, {
      kind, srcId: m.id, faction: m.faction, x: m.x, y: m.y, dx: tx - m.x, dy: ty - m.y, maxDist: range + 1, pierce: 0,
      payload: { type: 'packet', amounts, onHit: (extra && extra.onHit) || null },
    });
  }

  const countOf = (a, v) => {
    let n = 0;
    for (let i = 0; i < a.length; i++) if (a[i] === v) n++;
    return n;
  };
  function hitEntity(world, pr, tgt) {
    const pl = pr.payload;
    pr.hitIds.push(tgt.id);
    if (pl.group && pl.group.ids) pl.group.ids.push(tgt.id);
    world.events.push({ type: 'projectile.hit', id: pr.id, kind: pr.kind, tgtId: tgt.id, x: tgt.x, y: tgt.y });
    if (pl.type === 'packet') {
      const r = BD.sim.damage.dealDamage(world, {
        srcId: pr.srcId, tgtId: tgt.id, amounts: pl.amounts, tags: ['projectile', 'ranged'],
        canCrit: false, canDodge: true, canBlock: true, mult: 1,
      });
      if (r && pl.onHit) {
        for (const oh of pl.onHit) {
          BD.sim.status.apply(world, tgt, oh.status, { durMs: oh.durMs, magnitude: oh.mag, sourceId: pr.srcId, hit: r.total });
        }
      }
      return;
    }
    const caster = Entities.get(world, pl.casterId);
    if (!caster) return;
    const ab = BD.sim.abilities.def(pl.abilityId) || BD.data.basicAttack;
    const rab = pl.abilityId === 'attack' ? BD.sim.abilities.basicFor(world, caster) : BD.sim.abilities.resolved(ab, pl.rank, caster);
    const ctx = BD.sim.effects.baseCtx(world, caster, rab, pl.rank, null);
    ctx.srcId = pr.srcId;
    ctx.combo = pl.combo;
    ctx.focus = pl.focus;
    ctx.forceCrit = pl.forceCrit;
    ctx.critAdd = pl.critAdd || 0;
    ctx.packetMult = pl.packetMult || 1;
    ctx.cx = pr.x - pr.dx;
    ctx.cy = pr.y - pr.dy;
    ctx.centerId = tgt.id;
    ctx.projectile = pr;
    if (pr.returning && rab.returnMult) ctx.packetMult *= rab.returnMult;
    // an exploding projectile damages the struck target through its explosion only (never twice)
    let res;
    if (rab.delivery && rab.delivery.explode) res = explode(world, pr, tgt.x, tgt.y, rab, ctx) || [];
    else res = BD.sim.hits.applyEffects(world, ctx, rab.effects, [tgt]);
    BD.sim.effects.special(world, caster, rab, pl.rank, 'projectileHit', { pr, tgt, res, ctx });
    const lands = pl.idx === 0 || (rab.delivery && rab.delivery.eachLands);
    if (caster.kind === 'player' && lands) BD.sim.effects.afterHits(world, caster, rab, pl.rank, null, res);
  }

  function explode(world, pr, x, y, rab, ctx) {
    const pl = pr.payload;
    const caster = Entities.get(world, pl.casterId);
    if (!caster) return;
    const area = rab.delivery.explode;
    world.events.push({ type: 'ability.explode', abilityId: rab.id, x, y, area, kind: pr.kind });
    const c2 = Object.assign({}, ctx, { centerId: null });
    const res = BD.sim.effects.areaAt(world, c2, rab, x, y, area, rab.explodeEffects || rab.effects);
    BD.sim.effects.special(world, caster, rab, pl.rank, 'explode', { x, y, ctx: c2, pr });
    return res;
  }

  /** may this projectile strike entity e (occupying tile id)? a volley group lands at most twice per target */
  function canHit(pr, e, id) {
    const g = pr.payload.group;
    if (e.faction === pr.faction || !(e.hp > 0) || e.untargetable) return false;
    if (pr.hitIds.indexOf(id) >= 0) return false;
    if (g && g.ids && countOf(g.ids, id) >= VOLLEY_HITS_PER_TARGET) return false;
    return !(e.move && e.move.kind === 'leap');
  }

  /** an exploding ability projectile that stops (wall or aimed tile) still explodes there */
  function explodeStopped(world, pr, x, y) {
    const pl = pr.payload;
    const rab = BD.sim.abilities.def(pl.abilityId);
    if (!rab || !rab.delivery || !rab.delivery.explode) return;
    const caster = Entities.get(world, pl.casterId);
    if (!caster) return;
    explode(world, pr, x, y, BD.sim.abilities.resolved(rab, pl.rank, caster), BD.sim.effects.baseCtx(world, caster, rab, pl.rank, null));
  }

  /** off the map, opaque, or a blocking object (low ones, like bone walls, let shots over) */
  function blocksShot(f, x, y) {
    if (x < 0 || y < 0 || x >= f.w || y >= f.h) return true;
    const k = Grid.idx(f, x, y);
    return !SEE[f.tiles[k]] || (!!f.block[k] && !(f.low && f.low[k]));
  }

  /**
   * One tile crossed this step. `move` = { x, y, dead } is the step's destination and fate; a bounce
   * rewrites the destination. Returns false to stop the traversal.
   */
  function crossTile(world, f, pr, move, tx, ty) {
    if (blocksShot(f, tx, ty)) {
      if (pr.ricochet > 0) {
        pr.ricochet--;
        pr.dx = -pr.dx;
        pr.dy = -pr.dy;
        move.x = pr.x;
        move.y = pr.y;
        return false;
      }
      world.events.push({ type: 'projectile.hit', id: pr.id, kind: pr.kind, wall: true, x: pr.x, y: pr.y });
      if (pr.payload.type === 'ability') explodeStopped(world, pr, Math.round(pr.x), Math.round(pr.y));
      move.dead = true;
      return false;
    }
    const id = f.occ[Grid.idx(f, tx, ty)];
    if (id) {
      const e = Entities.get(world, id);
      if (e && canHit(pr, e, id)) {
        hitEntity(world, pr, e);
        if (pr.pierce > 0) {
          pr.pierce--;
        } else if (pr.ricochet > 0) {
          pr.ricochet--;
          retarget(world, pr, e);
          move.x = e.x;
          move.y = e.y;
          return false;
        } else {
          move.dead = true;
          return false;
        }
      }
    }
    if (pr.stopAt && tx === pr.stopAt.x && ty === pr.stopAt.y) {
      explodeStopped(world, pr, tx, ty);
      move.dead = true;
      return false;
    }
    return true;
  }

  /** a returning projectile at full range turns back toward its caster */
  function turnBack(world, pr) {
    pr.returning = true;
    pr.dist = 0;
    pr.hitIds = [];
    const c = Entities.get(world, pr.payload.casterId) || world.player;
    const l = Math.hypot(c.x - pr.x, c.y - pr.y) || 1;
    pr.dx = (c.x - pr.x) / l;
    pr.dy = (c.y - pr.y) / l;
    pr.maxDist = l;
  }

  /** move one projectile through this step; returns true when it ends */
  function advance(world, f, pr, dt) {
    const step = (pr.speed * dt) / 1000;
    const move = { x: pr.x + pr.dx * step, y: pr.y + pr.dy * step, dead: false };
    if (pr.erratic) {
      const w = Math.sin((world.time + pr.seed * ERRATIC_SEED_PHASE) / ERRATIC_PERIOD_MS) * ERRATIC_AMPLITUDE;
      move.x += -pr.dy * w * step;
      move.y += pr.dx * w * step;
    }
    traverse(pr.x, pr.y, move.x, move.y, (tx, ty) => crossTile(world, f, pr, move, tx, ty));
    pr.dist += step;
    pr.x = move.x;
    pr.y = move.y;
    if (!move.dead && pr.dist >= pr.maxDist) {
      if (pr.returns && !pr.returning) turnBack(world, pr);
      else move.dead = true;
    }
    return move.dead;
  }

  function system(world, dt) {
    const f = world.floor;
    const list = f.projectiles;
    for (let i = 0; i < list.length; i++) {
      const pr = list[i];
      if (!advance(world, f, pr, dt)) continue;
      list.splice(i--, 1);
      world.events.push({ type: 'projectile.end', id: pr.id, kind: pr.kind, x: pr.x, y: pr.y });
    }
  }

  function retarget(world, pr, from) {
    const next = BD.sim.targeting.nearestEnemy(world, from.x, from.y, RICOCHET_RANGE, pr.faction, {
      exclude: new Set(pr.hitIds), los: true,
    });
    if (!next) {
      pr.dist = pr.maxDist;
      return;
    }
    const l = Math.hypot(next.x - from.x, next.y - from.y) || 1;
    pr.dx = (next.x - from.x) / l;
    pr.dy = (next.y - from.y) / l;
    pr.x = from.x;
    pr.y = from.y;
    pr.dist = 0;
    pr.maxDist = l + 1;
  }

  BD.sim.projectiles = { traverse, spawn, fireAbility, fireMonster, system, explode };
  BD.sim.world.addSystem('projectiles', system, 20);
})(globalThis.BD);
