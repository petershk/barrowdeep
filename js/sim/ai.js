// @ts-check
// AI runner (06 §8.1). Each monster has an action clock (ai.timer, scaled by statuses). When it
// reaches 0 the monster decides: state transitions → first behaviour that returns an action wins →
// every action returns its cost in ms. Wind-ups are states with world-time timers.
(function (BD) {
  'use strict';

  const Entities = BD.sim.entities;
  const Monsters = BD.sim.monsters;
  const Balance = BD.data.balance;
  const Ascension = BD.data.ascension;
  const { within, cheb, dirOf } = BD.core.util;

  const COMBAT_RADIUS = 10;            // an awake monster this close (per axis) means "in combat"
  const DECOY_RANGE = 8;               // decoy allies farther than this are never picked as targets
  const IDLE_NOTICE_MS = 200;          // idle monsters look for the player this often…
  const IDLE_NOTICE_JITTER_MS = 10;    // …plus (id % 7) of these, so they don't all look on one tick
  const RETARGET_EVERY_S = 3;          // decisions in every 3rd second may re-pick a target…
  const RETARGET_CHANCE = 0.05;        // …with this chance
  const SIGHT_REFRESH_RANGE = 12;      // seeing the target within this range resets the leash clock
  const IDLE_RETRY_MS = 250;           // AI waits this long when no behaviour wants to act
  const FLEE_RETRY_MS = 300;           // a fleeing monster that can't step waits this long
  const HOME_REST_MS = 500;            // pause after a monster gets home and resets
  const HOME_RETRY_MS = 400;           // a homing monster that can't step waits this long

  /** @type {Record<string, any>} behaviour id → { decide?, resolve?, onHit?, onDeath?, passive? } */
  const BEH = {};
  function registerBehaviour(id, impl) { BEH[id] = impl; }

  const isAwake = (e) => e.ai && e.ai.state !== 'idle' && e.ai.state !== 'dormant';
  function isDormantOrBusy(e) { return !!(e.ai && e.ai.state === 'dormant'); }

  /** Is any awake monster within 10 tiles of the player? */
  function playerInCombat(world) {
    const p = world.player;
    if (world.floor._combatT === world.time) return world.floor._combat;
    let c = false;
    for (const e of world.floor.entities.values()) {
      if (e.dead || e.faction !== 'monster' || !isAwake(e)) continue;
      if (Math.abs(e.x - p.x) <= COMBAT_RADIUS && Math.abs(e.y - p.y) <= COMBAT_RADIUS) {
        c = true;
        break;
      }
    }
    world.floor._combatT = world.time;
    world.floor._combat = c;
    return c;
  }

  /** Wake a monster (damage, notice, pack call). force skips the reaction beat. */
  function alert(world, e, src, force) {
    if (!e.ai || e.dead) return;
    const ai = e.ai;
    if (ai.state === 'idle' || ai.state === 'dormant') {
      const wasDormant = ai.state === 'dormant';
      ai.state = 'alert';
      ai.timer = force ? 0 : Balance.monsters.reactionMs;
      ai.targetId = src && src.faction === 'player' ? src.id : world.player.id;
      ai.lastSeenMs = world.time;
      if (wasDormant) BD.sim.stats.bump(e);
      world.events.push({ type: 'monster.alert', id: e.id, x: e.x, y: e.y, rank: e.rank, keeper: e.keeper });
      if (BD.sim.entities.isBoss(e) && BD.sim.bosses) BD.sim.bosses.onWake(world, e);
      if (e.keeper && BD.sim.floors) BD.sim.floors.keeperSeen(world, e);
      // the pack wakes with it (Unseen's hidden first hit doesn't alert the rest)
      if (e.packId != null && !(src && src.kind === 'player' && src._silentHit)) {
        for (const o of world.floor.entities.values()) {
          if (o !== e && o.packId === e.packId && o.ai && o.ai.state === 'idle') alert(world, o, src, false);
        }
      }
    } else if (src && src.faction === 'player') ai.lastSeenMs = world.time;
  }

  function targetOf(world, e) {
    const ai = e.ai;
    // taunt overrides
    const t = BD.sim.status.has(e, 'taunted');
    if (t && t.sourceId != null) {
      const tt = Entities.get(world, t.sourceId);
      if (tt && !tt.dead) return tt;
    }
    let tgt = ai.targetId != null ? Entities.get(world, ai.targetId) : null;
    if (!tgt || tgt.dead || tgt.hp <= 0 || tgt.faction === e.faction) {
      tgt = world.player;
      ai.targetId = tgt.id;
    }
    return tgt;
  }

  /** periodically re-pick between the player and decoy allies (clone 40%, valkyrie 50%) */
  function retarget(world, e) {
    const allies = world.floor.allies || [];
    let pick = world.player;
    for (const id of allies) {
      const a = Entities.get(world, id);
      if (!a || a.dead || !a.decoy) continue;
      if (cheb(a.x, a.y, e.x, e.y) > DECOY_RANGE) continue;
      if (world.rng.chance(a.decoy)) {
        pick = a;
        break;
      }
    }
    e.ai.targetId = pick.id;
  }

  function notice(world, e) {
    if (e.ai.held) return;
    const p = world.player;
    const d = Monsters.defOf(e);
    const ai = e.ai;
    if (ai.state === 'dormant') {
      const b = Monsters.behaviour(e, 'dormant');
      if (b && within(e.x, e.y, p.x, p.y, b.wakeDist)) alert(world, e, p, false);
      return;
    }
    if (p.dead) return;
    let range = (d.aggro && d.aggro.notice) || Balance.monsters.notice;
    if (BD.sim.powers) range = BD.sim.powers.noticeRange(world, p, range);
    if (BD.sim.status.has(p, 'hidden')) return;
    if (!within(e.x, e.y, p.x, p.y, range)) return;
    if (!BD.sim.targeting.hasLOS(world, e.x, e.y, p.x, p.y)) return;
    alert(world, e, p, false);
  }

  /** start a wind-up action (telegraphed) */
  function windup(world, e, action, ms, telegraph) {
    e.ai.state = 'windup';
    e.ai.action = action;
    e.ai.timer = ms;
    e.ai.windupTotal = ms;
    e.attack = { phase: 'windup', remaining: ms, telegraph: telegraph !== false };
    world.events.push({ type: 'monster.windup', id: e.id, kind: action.kind, ms, x: e.x, y: e.y, heavy: !!action.heavy });
    return ms;
  }

  function step(world, e, dt) {
    const ai = e.ai;
    if (!ai || e.dead || e.dying) return;
    if (ai.state === 'idle' || ai.state === 'dormant') {
      // cheap: only look for the player every ~200 ms
      ai.timer -= dt;
      if (ai.timer > 0) return;
      ai.timer = IDLE_NOTICE_MS + (e.id % 7) * IDLE_NOTICE_JITTER_MS;
      notice(world, e);
      if (BD.sim.ai_passive) BD.sim.ai_passive(world, e);
      return;
    }
    const clk = BD.sim.status.clockMult(world, e);
    if (e.attack && e.attack.phase === 'windup') e.attack.remaining -= dt * clk;
    if (clk === 0) {
      if (ai.state === 'windup' && (BD.sim.status.has(e, 'stunned') || BD.sim.status.has(e, 'frozen'))) cancelWindup(world, e);
      return;
    }
    // periodic mod effects run on their own world-time cooldowns
    if (BD.sim.mods) BD.sim.mods.tick(world, e, dt);
    ai.timer -= dt * clk;
    if (ai.timer > 0) return;
    if (e.move) return;            // finish the step first
    if (ai.state === 'windup') {
      resolveAction(world, e);
      return;
    }
    if (ai.state === 'exposed') {
      ai.state = 'chase';
      BD.sim.status.remove(world, e, 'exposed');
    }
    decide(world, e);
  }

  function cancelWindup(world, e) {
    // a burrow cut short (stunned, frozen) surfaces where it is: never left underground and untargetable
    const kind = e.ai.action && e.ai.action.kind;
    if (e.untargetable && (kind === 'burrow_travel' || kind === 'burrow_emerge')) {
      e.untargetable = false;
      world.events.push({ type: 'emerge', id: e.id, x: e.x, y: e.y });
    }
    e.ai.state = 'chase';
    e.ai.action = null;
    e.attack = null;
    world.events.push({ type: 'monster.cancel', id: e.id });
    if (e.ai.zoneIds) {
      for (const zid of e.ai.zoneIds) {
        const z = world.floor.zones.find((q) => q.id === zid);
        if (z) {
          z.cancelled = true;
          world.floor.zones.splice(world.floor.zones.indexOf(z), 1);
          world.events.push({ type: 'telegraph.end', zoneId: zid });
        }
      }
      e.ai.zoneIds = null;
    }
  }

  function resolveAction(world, e) {
    const ai = e.ai, act = ai.action;
    e.attack = null;
    ai.state = 'chase';
    ai.action = null;
    ai.zoneIds = null;
    const impl = BEH[act.kind] || (BD.sim.bosses && BD.sim.bosses.moves[act.kind]);
    let after = 0;
    if (impl && impl.resolve) after = impl.resolve(world, e, act) || 0;
    ai.timer = Math.max(0, after);
    if (act.exposedMs && ai.state !== 'exposed') makeExposed(world, e, act.exposedMs);
  }

  function makeExposed(world, e, ms) {
    const k = world.run.ascension >= Ascension.exposed.level ? Ascension.exposed.exposedMult : 1;
    const dur = ms * k;
    e.ai.state = 'exposed';
    e.ai.timer = dur;
    BD.sim.status.apply(world, e, 'exposed', { durMs: dur, sourceId: e.id });
    world.events.push({ type: 'exposed', id: e.id, x: e.x, y: e.y, ms: dur, boss: BD.sim.entities.isBoss(e) });
    if (BD.sim.entities.isBoss(e)) world.events.push({ type: 'boss.exposed', id: e.id });
  }

  function decide(world, e) {
    const ai = e.ai;
    const d = Monsters.defOf(e);
    const tgt = targetOf(world, e);
    const ctx = { tgt, dist: Math.hypot(tgt.x - e.x, tgt.y - e.y), adj: cheb(tgt.x, tgt.y, e.x, e.y) <= 1, los: null };
    ctx.hasLos = () => (ctx.los === null ? (ctx.los = BD.sim.targeting.hasLOS(world, e.x, e.y, tgt.x, tgt.y)) : ctx.los);
    if (ai.state === 'alert') {
      ai.state = 'chase';
      retarget(world, e);
    }
    if ((world.time / 1000 | 0) % RETARGET_EVERY_S === 0 && world.rng.chance(RETARGET_CHANCE)) retarget(world, e);
    ai.timer = decideCost(world, e, d, ctx);
  }

  /** the first of flee → leash → boss script → behaviours that acts; returns its cost in ms */
  function decideCost(world, e, d, ctx) {
    const ai = e.ai;
    // fear / flee
    if (BD.sim.status.has(e, 'feared') || ai.fleeMs > world.time) return flee(world, e, ctx);
    // leash: home if too far and the player hasn't been seen for 4 s
    const leash = (d.aggro && d.aggro.leash) || Balance.monsters.leash;
    if (ctx.hasLos() && ctx.dist <= SIGHT_REFRESH_RANGE) ai.lastSeenMs = world.time;
    const lostSight = world.time - ai.lastSeenMs > Balance.monsters.leashLostMs;
    if (!e.keeper && e.rank !== 'boss' && cheb(e.x, e.y, e.home.x, e.home.y) > leash && lostSight) return goHome(world, e);
    if ((BD.sim.entities.isBoss(e) || e.signature) && BD.sim.bosses) {
      const c = BD.sim.bosses.decide(world, e, ctx);
      if (c != null) return c;
    }
    for (const b of d.behaviours || []) {
      const impl = BEH[b.id];
      if (!impl || !impl.decide) continue;
      const cost = impl.decide(world, e, b, ctx);
      if (cost != null) return cost;
    }
    return IDLE_RETRY_MS;
  }

  function moveCost(world, e) {
    const s = BD.sim.stats.statsOf(world, e);
    return s.moveMs * BD.sim.status.moveMult(world, e);
  }
  /** one step along a field; returns cost or null */
  function stepAlong(world, e, field, away) {
    if (e.immobile || BD.sim.status.moveMult(world, e) === Infinity) return null;
    const nx = BD.sim.pathing.stepOnField(world, e, field, away);
    if (!nx) return null;
    const ms = moveCost(world, e);
    if (!BD.sim.movement.startStep(world, e, nx[0], nx[1], ms)) return null;
    if (BD.sim.mods) BD.sim.mods.onStep(world, e);
    return ms;
  }
  /** chase the target; phasing monsters go straight through walls */
  function chase(world, e, tgt) {
    if (Monsters.hasBehaviour(e, 'phase')) {
      if (e.immobile) return null;
      const st = BD.sim.pathing.phaseStep(world, e, tgt.x, tgt.y);
      if (!st) return null;
      const ms = moveCost(world, e);
      e.phase = true;
      const f = world.floor;
      e.move = { fromX: e.x, fromY: e.y, toX: st[0], toY: st[1], elapsed: 0, dur: ms };
      e.dir = dirOf(st[0] - e.x, st[1] - e.y);
      Entities.relocate(f, e, st[0], st[1]);
      return ms;
    }
    if (tgt.kind === 'player') return stepAlong(world, e, BD.sim.pathing.chaseField(world), false);
    const path = BD.sim.pathing.path(world, e.x, e.y, tgt.x, tgt.y);
    if (!path || !path.length) return null;
    const ms = moveCost(world, e);
    return BD.sim.movement.startStep(world, e, path[0][0], path[0][1], ms) ? ms : null;
  }
  function flee(world, e, ctx) {
    const c = stepAlong(world, e, BD.sim.pathing.chaseField(world), true);
    return c != null ? c : FLEE_RETRY_MS;
  }
  function goHome(world, e) {
    const path = BD.sim.pathing.path(world, e.x, e.y, e.home.x, e.home.y);
    if (!path || !path.length || cheb(e.x, e.y, e.home.x, e.home.y) <= 1) {
      e.ai.state = 'idle';
      e.ai.timer = HOME_REST_MS;
      e.hp = BD.sim.stats.statsOf(world, e).maxLife;
      return HOME_REST_MS;
    }
    const ms = moveCost(world, e);
    return BD.sim.movement.startStep(world, e, path[0][0], path[0][1], ms) ? ms : HOME_RETRY_MS;
  }

  function system(world, dt) {
    for (const e of world.floor.entities.values()) {
      if (e.kind === 'monster') step(world, e, dt);
    }
  }

  function flinch(world, e, src, pk, res) {
    if (!e.ai || e.dead || e.hp <= 0 || pk.isDot || e.untargetable) return;
    const r = Balance.monsters.ranks[e.rank];
    if (r && (r.boss || r.steady)) return;
    const c = Balance.combat;
    if (world.time - (e.lastFlinchMs || -1e9) < (c.flinchIcdMs || 500)) return;
    const max = BD.sim.stats.statsOf(world, e).maxLife;
    if (res.total < max * (c.flinchPct || 0.12) && !res.crit) return;
    e.lastFlinchMs = world.time;
    const kind = e.ai.action && e.ai.action.kind;
    if (e.ai.state === 'windup' && (kind === 'melee' || kind === 'shoot')) cancelWindup(world, e);
    e.ai.timer = Math.max(e.ai.timer, c.flinchMs || 220);
    world.events.push({ type: 'flinch', id: e.id, srcId: src ? src.id : null, x: e.x, y: e.y });
  }

  // reactive behaviour hooks
  BD.sim.damage.onHitHooks.push((world, src, tgt, pk, res) => {
    if (tgt.kind === 'monster') {
      flinch(world, tgt, src, pk, res);
      const d = Monsters.defOf(tgt);
      for (const b of (d && d.behaviours) || []) if (BEH[b.id] && BEH[b.id].onHit) BEH[b.id].onHit(world, tgt, b, src, res, pk);
    }
    if (src && src.kind === 'monster' && !pk.isDot) {
      const d = Monsters.defOf(src);
      for (const b of (d && d.behaviours) || []) if (BEH[b.id] && BEH[b.id].onDealt) BEH[b.id].onDealt(world, src, b, tgt, res, pk);
      for (const oh of (d && d.onHit) || []) {
        if (!world.rng.chance(oh.chance)) continue;
        BD.sim.status.apply(world, tgt, oh.status, { durMs: oh.durMs, magnitude: oh.mag, sourceId: src.id, hit: res.total });
      }
    }
  });
  BD.sim.damage.onKillHooks.push((world, victim, killer, info) => {
    const d = Monsters.defOf(victim);
    for (const b of (d && d.behaviours) || []) if (BEH[b.id] && BEH[b.id].onDeath) BEH[b.id].onDeath(world, victim, b, killer, info);
  });

  BD.sim.ai = {
    BEH, registerBehaviour, alert, isAwake, isDormantOrBusy, playerInCombat, windup, decide, resolveAction,
    cancelWindup, makeExposed, flinch, stepAlong, chase, flee, moveCost, targetOf, step, system,
  };
  BD.sim.world.addSystem('ai', system, 15);
})(globalThis.BD);
