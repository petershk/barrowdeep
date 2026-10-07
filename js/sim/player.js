// @ts-check
// The player entity and PlayerIntent: the single place for click-to-move paths, pending
// interactions, engage locks and queued casts (06 §7.2).
(function (BD) {
  'use strict';

  const E = BD.sim.entities;
  const M = BD.sim.movement;
  const G = BD.core.grid;
  const B = BD.data.balance;
  const { within, cheb } = BD.core.util;

  function create(world, opts) {
    const cls = opts.cls || 'fighter';
    const attrs = Object.assign({}, B.player.attrBase[cls] || B.player.attrBase.fighter);
    const p = E.makeEntity(1, 'player', cls, 0, 0, {
      cls, name: opts.name || 'Wanderer', background: opts.background || 'wanderer', level: 1, xp: 0, attrs,
      unspent: { attr: 0, skill: 0 }, skills: {}, bar: { rmb: null, s1: null, s2: null, s3: null, s4: null },
      resources: {}, equip: { weapon: null, offhand: null, chest: null, helm: null, cloak: null, amulet: null, ring1: null, ring2: null },
      pack: [], pouch: { portal: 1, reveal: 0 }, flask: { charges: B.player.flaskBase, max: B.player.flaskBase, permMax: B.player.flaskBase }, gold: 0,
      intent: { kind: 'idle' }, faction: 'player', lastHitMs: -1e9, lastDamagedMs: -1e9, lastCastMs: -1e9, attack: null,
    });
    p.hp = 1;
    return p;
  }

  function onFloorEnter(world) {
    const p = world.player;
    p.intent = { kind: 'idle' };
    p.attack = null;
  }

  function moveMs(world, p) {
    const s = BD.sim.stats ? BD.sim.stats.statsOf(world, p) : null;
    const pct = s ? s.move_pct : 0;
    return B.player.moveMs / (1 + pct / 100);
  }

  /** Path to (gx,gy); if the goal is blocked, path to the nearest reachable tile. */
  function pathTo(world, p, gx, gy, adjacentOk) {
    const f = world.floor;
    const walk = (x, y) => E.walkable(f, x, y) && (!E.occupant(f, x, y) || E.occupant(f, x, y) === p.id || cheb(x, y, p.x, p.y) > 1);
    let path = G.astar(f.w, f.h, p.x, p.y, gx, gy, walk, { allowGoalBlocked: adjacentOk, budget: f.w * f.h, partial: true });
    if (path && adjacentOk && path.length && E.occupant(f, gx, gy) && path[path.length - 1][0] === gx && path[path.length - 1][1] === gy) path.pop();
    return path;
  }

  /** Per-step intent processing for the player. Runs before movement completes. */
  function system(world, dt) {
    const p = world.player;
    if (!p || p.dead) return;
    tickTimers(world, p, dt);
    if (p.move) return;                       // mid-step: wait for the tile
    if (p.attack) return;                     // mid-attack/cast: abilities system owns it
    if (BD.sim.status && BD.sim.status.clockMult(world, p) === 0) return; // stunned / frozen
    const it = p.intent;
    if (it.kind === 'move') followPath(world, p, it);
    else if (it.kind === 'engage' || it.kind === 'approachThenCast') engage(world, p, it);
    else if (it.kind === 'interact') interact(world, p, it);
  }

  function tickTimers(world, p, dt) {
    for (const k in p.cooldowns) { if (p.cooldowns[k] > 0) p.cooldowns[k] = Math.max(0, p.cooldowns[k] - dt); }
    if (p.evadeCharges !== undefined && p.cooldowns.evade === 0) {
      const max = 1 + ((BD.sim.stats && BD.sim.stats.statsOf(world, p).evade_charges) || 0);
      if (p.evadeCharges < max) { p.evadeCharges++; if (p.evadeCharges < max) p.cooldowns.evade = evadeCd(world, p); }
      else if (max === 1) p.evadeCharges = undefined;
    }
  }

  function followPath(world, p, it) {
    if (!it.path || !it.path.length) { p.intent = { kind: 'idle' }; return; }
    const [nx, ny] = it.path[0];
    if (M.startStep(world, p, nx, ny, moveMs(world, p))) { it.path.shift(); onStep(world, p); return; }
    // blocked: re-path once toward the final goal
    const goal = it.path[it.path.length - 1];
    if (it.repaths === undefined) it.repaths = 0;
    if (it.repaths++ < 3) { it.path = pathTo(world, p, goal[0], goal[1], true) || []; }
    else p.intent = { kind: 'idle' };
  }

  function onStep(world, p) {
    BD.sim.fov.refresh(world);
    if (BD.sim.floors) BD.sim.floors.onPlayerStep(world);
  }

  function engage(world, p, it) {
    const t = E.get(world, it.targetId);
    if (!t || t.hp <= 0 || t.dead) { p.intent = { kind: 'idle' }; return; }
    const reach = it.kind === 'engage' ? BD.sim.combat.basicRange(world, p) : it.range;
    const inRange = reach <= 1.5 ? cheb(p.x, p.y, t.x, t.y) <= 1 && G.canStep(p.x, p.y, Math.sign(t.x - p.x), Math.sign(t.y - p.y), (x, y) => E.walkable(world.floor, x, y) || (x === t.x && y === t.y))
      : within(p.x, p.y, t.x, t.y, reach) && BD.sim.targeting.hasLOS(world, p.x, p.y, t.x, t.y);
    if (inRange) {
      if (it.kind === 'engage') { BD.sim.combat.playerBasicAttack(world, p, t); if (!it.hold) p.intent = { kind: 'idle' }; }
      else { const ok = BD.sim.abilities.fireApproach(world, p, it); if (!ok || !it.hold) p.intent = { kind: 'idle' }; }
      return;
    }
    // step toward (re-path when the target changed tile)
    if (!it.path || it.goalX !== t.x || it.goalY !== t.y || !it.path.length) {
      it.path = pathTo(world, p, t.x, t.y, true) || [];
      it.goalX = t.x; it.goalY = t.y;
    }
    if (!it.path.length) { p.intent = { kind: 'idle' }; return; }
    const [nx, ny] = it.path[0];
    if (M.startStep(world, p, nx, ny, moveMs(world, p))) { it.path.shift(); onStep(world, p); }
    else it.path = null;
  }

  function interact(world, p, it) {
    if (cheb(p.x, p.y, it.x, it.y) <= 1) {
      p.intent = { kind: 'idle' };
      if (BD.sim.interact) BD.sim.interact.at(world, it.x, it.y);
      return;
    }
    if (!it.path || !it.path.length) {
      it.path = pathTo(world, p, it.x, it.y, true) || [];
      if (!it.path.length) { p.intent = { kind: 'idle' }; return; }
    }
    const [nx, ny] = it.path[0];
    if (M.startStep(world, p, nx, ny, moveMs(world, p))) { it.path.shift(); onStep(world, p); }
    else it.path = null;
  }

  /** Universal Evade: 2 tiles toward (dirX,dirY), 120 ms invulnerable, 3 s cooldown, free. */
  function evade(world, p, dirX, dirY) {
    if ((p.cooldowns.evade || 0) > 0 && !(p.evadeCharges > 0)) return reject(world, p, 'evade', 'Not ready');
    if (BD.sim.status && BD.sim.status.clockMult(world, p) === 0) return false;
    const s = BD.sim.stats ? BD.sim.stats.statsOf(world, p) : { evade_charges: 0 };
    let dx = Math.sign(dirX), dy = Math.sign(dirY);
    if (!dx && !dy) { const d = BD.core.util.DIRS[p.dir]; dx = d[0]; dy = d[1]; }
    // cancel our own wind-up / cast (refunded)
    if (p.attack && BD.sim.abilities) BD.sim.abilities.cancel(world, p, 'evade');
    const land = M.dashLanding(world, p, p.x + dx * B.player.evadeTiles, p.y + dy * B.player.evadeTiles, B.player.evadeTiles);
    if (!land) return reject(world, p, 'evade', 'No room');
    const fromX = p.x, fromY = p.y;
    M.displace(world, p, land.x, land.y, B.player.evadeMs, 'evade');
    p.dir = BD.core.util.dirOf(dx, dy);
    if (BD.sim.status) BD.sim.status.apply(world, p, 'evading', { durMs: B.player.evadeInvulnMs, sourceId: p.id });
    const maxCharges = 1 + (s.evade_charges || 0);
    if (maxCharges > 1) {
      p.evadeCharges = (p.evadeCharges === undefined ? maxCharges : p.evadeCharges) - 1;
      if (!(p.cooldowns.evade > 0)) p.cooldowns.evade = evadeCd(world, p);
    } else p.cooldowns.evade = evadeCd(world, p);
    p.intent = { kind: 'idle' };
    world.events.push({ type: 'evade', id: p.id, fromX, fromY, x: land.x, y: land.y });
    if (BD.sim.items) BD.sim.items.onEvade(world, p, fromX, fromY);
    onStep(world, p);
    return true;
  }
  function evadeCd(world, p) {
    const s = BD.sim.stats ? BD.sim.stats.statsOf(world, p) : null;
    return Math.max(500, B.player.evadeCdMs - (s && s.evade_cd_ms ? s.evade_cd_ms : 0));
  }

  function reject(world, p, what, reason) {
    world.events.push({ type: 'ability.reject', id: p.id, abilityId: what, reason });
    return false;
  }

  BD.sim.player = { create, onFloorEnter, moveMs, pathTo, system, evade, reject, onStep };
  BD.sim.world.addSystem('player', system, 5);
})(globalThis.BD);
