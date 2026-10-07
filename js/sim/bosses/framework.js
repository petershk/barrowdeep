// @ts-check
// Boss and Keeper framework (06 §8.3, 04 §5): opener, no-repeat weighted kit, periodic Crushing
// Blow, phase table on HP, Exposed after heavy moves, flask orbs at 75/50/25%, summon cap, lines.
// Keepers use the same decide() with one or two signature moves.
(function (BD) {
  'use strict';

  const Entities = BD.sim.entities;
  const Ai = () => BD.sim.ai;
  const AiMoves = () => BD.sim.ai_moves;
  const { cheb } = BD.core.util;
  const BossBalance = BD.data.balance.bosses;   // special / signature timings, Crushing Blow range, summon cap
  const Ascension = BD.data.ascension;

  const NEVER_MS = 1e12;                // a timer that never fires
  const RECOVER_MS = 300;               // recovery after a move that names no `after`
  const SUMMON_SCATTER = 3;             // adds without spawn points appear within this many tiles
  /** move implementations: { start(world, e, move, ctx) → cost ms | null, resolve?(world, e, act) → ms } */
  const moves = {};
  function registerMove(id, impl) { moves[id] = impl; }

  function bossState(world, e) {
    if (!e.ai.boss) {
      const d = BD.sim.monsters.defOf(e);
      const rng = world.rng;
      e.ai.boss = {
        phase: 0, opened: false, last: null, cds: {}, orbs: 0, rallied: false,
        nextSpecial: world.time
          + (d.specialEvery ? rng.range(d.specialEvery[0], d.specialEvery[1]) * BossBalance.firstSpecialScale : BossBalance.firstSpecialMs),
        nextCrush: world.time + (d.crushing ? d.crushing.everyMs + rng.range(-d.crushing.jitter, d.crushing.jitter) : NEVER_MS),
        nextSig: world.time + rng.range(BossBalance.keeperFirstSigMs[0], BossBalance.keeperFirstSigMs[1]),
      };
    }
    return e.ai.boss;
  }

  /** current phase modifiers for a move */
  function moveParams(d, st, m) {
    const ph = st.phase > 0 && d.phases ? d.phases[st.phase - 1] : null;
    return ph && ph.mods && ph.mods[m.move] ? Object.assign({}, m, ph.mods[m.move]) : m;
  }

  /** Called by the AI runner before behaviours. Returns a cost, or null to fall through (jab/chase). */
  function decide(world, e, ctx) {
    if (BD.sim.entities.isBoss(e)) return decideBoss(world, e, ctx);
    if (e.signature) return decideKeeper(world, e, ctx);
    return null;
  }

  function decideBoss(world, e, ctx) {
    const d = BD.sim.monsters.defOf(e);
    const st = bossState(world, e);
    const rng = world.rng;
    if (!st.opened && d.opener) {
      st.opened = true;
      const m = d.kit.find((k) => k.move === d.opener);
      st.last = m.move;
      st.cds[m.move] = world.time + m.cdMs;
      const c = moves[m.move].start(world, e, moveParams(d, st, m), ctx);
      if (c != null) return c;
    }
    // Crushing Blow: every 8 s ±2 when the player is within 1–2 tiles
    if (d.crushing && world.time >= st.nextCrush && ctx.dist <= BossBalance.crushRange) {
      st.nextCrush = world.time + d.crushing.everyMs + rng.range(-d.crushing.jitter, d.crushing.jitter);
      return moves.crushing_blow.start(world, e, d.crushing, ctx);
    }
    if (world.time >= st.nextSpecial) {
      const usable = (m) => m.move !== st.last
        && ctx.dist >= m.minRange && ctx.dist <= m.maxRange + 0.5
        && !(st.cds[m.move] > world.time)
        && (m.phase == null || m.phase === st.phase || (st.allMoves && m.move !== 'imp_call'))
        && moves[m.move];
      const fits = d.kit.filter(usable);
      if (fits.length) {
        const m = rng.weighted(fits, (k) => k.weight);
        const mp = moveParams(d, st, m);
        const c = moves[m.move].start(world, e, mp, ctx);
        if (c != null) {
          st.last = m.move;
          st.cds[m.move] = world.time + m.cdMs * (mp.cdMult || 1);
          const every = st.phase > 0 && d.phase2Every ? d.phase2Every : d.specialEvery;
          st.nextSpecial = world.time + rng.range(every[0], every[1]);
          return c;
        }
      }
      // nothing fits: walk toward the player (the jab behaviour does this)
    }
    return null;
  }

  function decideKeeper(world, e, ctx) {
    const st = bossState(world, e);
    const max = BD.sim.stats.statsOf(world, e).maxLife;
    // Rally: once at 50% HP, summon 2 pack minions
    if (e.signature.indexOf('rally') >= 0 && !st.rallied && e.hp <= max * BossBalance.keeperRallyAt) {
      st.rallied = true;
      return moves.rally.start(world, e, {}, ctx);
    }
    if (world.time < st.nextSig) return null;
    const sigs = e.signature.filter((s) => s !== 'rally' && moves['sig_' + s]);
    for (const s of world.rng.shuffle(sigs.slice())) {
      const c = moves['sig_' + s].start(world, e, {}, ctx);
      if (c != null) {
        st.nextSig = world.time + world.rng.range(BossBalance.keeperSigMs[0], BossBalance.keeperSigMs[1]);
        return c;
      }
    }
    return null;
  }

  /** Phase transitions on HP thresholds + orbs at 75/50/25% (damage hook). */
  BD.sim.damage.onHitHooks.push((world, src, tgt) => {
    if (!BD.sim.entities.isBoss(tgt) || tgt.hp <= 0) return;
    const d = BD.sim.monsters.defOf(tgt);
    const st = bossState(world, tgt);
    const max = BD.sim.stats.statsOf(world, tgt).maxLife;
    const pct = (tgt.hp / max) * 100;
    while (d.orbsAt && st.orbs < d.orbsAt.length && pct <= d.orbsAt[st.orbs]) {
      st.orbs++;
      BD.sim.loot.dropAt(world, tgt.x, tgt.y, { kind: 'orb' });
    }
    if (d.phases && st.phase < d.phases.length) {
      const ph = d.phases[st.phase];
      const early = Ascension.early_enrage;   // a single-phase boss enrages earlier
      const at = world.run.ascension >= early.level && st.phase === 0 && d.phases.length === 1 ? early.atPct : ph.atPct;
      if (pct <= at) enterPhase(world, tgt, d, st);
    }
  });

  function enterPhase(world, e, d, st) {
    const ph = d.phases[st.phase];
    st.phase++;
    e.bossSpeed = ph.speedMult || 1;
    BD.sim.stats.bump(e);
    world.events.push({ type: 'boss.phase', id: e.id, phase: st.phase, name: ph.name, line: d.lines.enrage, x: e.x, y: e.y });
    world.events.push({ type: 'announce', text: d.lines.enrage, style: 'boss' });
    if (ph.onEnter && phaseHooks[ph.onEnter]) phaseHooks[ph.onEnter](world, e, d, st);
    st.nextSpecial = world.time + BossBalance.phaseSpecialDelayMs;
  }
  const phaseHooks = {};
  function registerPhase(id, fn) { phaseHooks[id] = fn; }

  /** live adds spawned by this boss */
  function addsOf(world, e) {
    let n = 0;
    for (const o of world.floor.entities.values()) {
      if (!o.dead && o.spawnedBy === e.id) n++;
    }
    return n;
  }

  /** Boss wake (alert) and defeat */
  function onWake(world, e) {
    const d = BD.sim.monsters.defOf(e);
    if (e.ai.woke) return;
    e.ai.woke = true;
    world.events.push({ type: 'boss.wake', id: e.id, name: d.name, line: d.lines.wake, x: e.x, y: e.y });
    world.events.push({ type: 'announce', text: d.lines.wake, style: 'boss' });
  }
  BD.sim.damage.onKillHooks.push((world, e) => {
    if (e.rank !== 'boss' && e.rank !== 'malgoth') return;
    const isShade = e.shadeOf != null || e.isShade;
    if (isShade && BD.sim.bossfight && !BD.sim.bossfight.allShadesDead(world, e)) return;
    const d = BD.sim.monsters.defOf(e);
    // adds crumble with their master
    for (const o of world.floor.entities.values()) {
      if (o.spawnedBy === e.id && !o.dead) BD.sim.damage.kill(world, o, null, { tags: ['crumble'], amounts: { phys: 1 } });
    }
    world.events.push({ type: 'boss.defeat', id: e.id, def: d.id, name: d.name, line: d.lines.defeat, x: e.x, y: e.y });
    if (BD.sim.bossfight) BD.sim.bossfight.onBossDead(world, e, d);
  });


  // ---------------- helpers shared by every boss module ----------------
  /** zone(s) + wind-up in one call; the zone ids are cancelled if the wind-up is interrupted */
  function telegraph(world, e, zones, action, ms) {
    e.ai.zoneIds = zones.map((z) => z.id);
    return Ai().windup(world, e, action, ms);
  }
  const resolveNoop = { resolve: (world, e, act) => act.after || RECOVER_MS };

  /** resolve() that waits act.after (or a fixed ms) */
  const after = (ms) => (world, e, act) => act.after || ms;

  /** spawn up to count adds (respecting cap and the boss's summonCap) at from[] or around the boss */
  function summon(world, e, def, count, cap, from) {
    const room = Math.min(cap, BD.sim.monsters.defOf(e).summonCap || BossBalance.defaultSummonCap) - addsOf(world, e);
    let n = 0;
    for (let i = 0; i < Math.min(count, room); i++) {
      const scatter = () => [
        e.x + world.rng.int(-SUMMON_SCATTER, SUMMON_SCATTER),
        e.y + world.rng.int(-SUMMON_SCATTER, SUMMON_SCATTER),
      ];
      const at = from ? from[i % from.length] : scatter();
      if (BD.sim.monsters.spawn(world, def, at[0], at[1], { spawnedBy: e.id, noLoot: true, noXp: true, packId: e.packId })) n++;
    }
    if (n) world.events.push({ type: 'boss.summon', id: e.id, x: e.x, y: e.y });
    return n;
  }

  /** delayed strike scheduled by a sweeping move (rows of a cone, waves of fire) */
  BD.core.scheduler.register('boss.zone', (world, pl) => {
    const e = Entities.get(world, pl.srcId);
    if (!e || e.dead) return;
    AiMoves().strike(world, e, pl.tiles, pl.armMs, pl.mult, {
      school: pl.school, kind: pl.kind, element: pl.element || null,
      statuses: pl.statuses || [], linger: pl.linger || null, knockback: pl.knockback || 0,
    });
  });

  BD.sim.bosses = {
    moves, registerMove, decide, bossState, enterPhase, registerPhase, addsOf, onWake, phaseHooks,
    telegraph, resolveNoop, after, summon,
  };
})(globalThis.BD);
