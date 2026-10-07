// @ts-check
// The act-end loop: Gate Key → gate → arena with a 3-2-1 countdown → fight → loot fountain and an
// exit portal to town → next act's waypoint (01 §4). A saved game never resumes inside a live fight.
(function (BD) {
  'use strict';

  const I = () => BD.sim.interact;
  const FL = BD.data.floors;
  const COUNTDOWN = 3000;

  function useGate(world) {
    const f = world.floor, r = world.run;
    if (!r.flags['key' + f.n]) { I().deny(world, 'gate_locked'); return; }
    if (!f.gateOpen) {
      f.gateOpen = true;
      world.events.push({ type: 'gate.open', x: f.gatePos.x, y: f.gatePos.y });
      I().announce(world, 'gate_open');
    }
    enterArena(world, f.n);
  }

  function enterArena(world, n) {
    BD.sim.run.travel(world, 'a' + n, 'spawn');
    const f = world.floor;
    if (f.bossDead) { placeExit(world); return; }
    world.run.countdownMs = COUNTDOWN;
    world.run.countdownShown = 4;
    // the boss waits; the player may position during the countdown
    for (const e of f.entities.values()) if (e.ai) { e.ai.state = 'idle'; e.ai.timer = COUNTDOWN + 100; e.ai.held = true; }
    if (f.arena && f.arena.webs) {
      for (const [x, y] of f.arena.webs) BD.sim.zones.ground(world, 'web', [[x, y]], { durMs: 1e9, faction: 'monster' });
    }
  }

  function system(world, dt) {
    const r = world.run;
    if (!(r.countdownMs > 0)) return;
    r.countdownMs -= dt;
    const n = Math.ceil(r.countdownMs / 1000);
    if (n !== r.countdownShown && n > 0) {
      r.countdownShown = n;
      world.events.push({ type: 'countdown', n });
      world.events.push({ type: 'announce', text: String(n), style: 'countdown' });
    }
    if (r.countdownMs <= 0) {
      r.countdownMs = 0;
      world.events.push({ type: 'announce', text: BD.data.strings.t('fight'), style: 'countdown' });
      world.events.push({ type: 'countdown', n: 0 });
      for (const e of world.floor.entities.values()) {
        if (e.ai && e.ai.held) {
          e.ai.held = false;
          BD.sim.ai.alert(world, e, world.player, true);
        }
      }
    }
  }

  function onBossDead(world, e, d) {
    const f = world.floor, r = world.run;
    f.bossDead = true;
    const malgoth = d.id === 'malgoth';
    BD.sim.loot.bossDrop(world, e, malgoth);
    if (!r.bossesKilled.includes(d.id)) r.bossesKilled.push(d.id);
    r.bossesSlain++;
    world.events.push({ type: 'announce', text: BD.data.strings.t('boss_slain', { name: d.name }), style: 'boss' });
    if (malgoth) { if (BD.sim.death) BD.sim.death.onVictory(world); return; }
    // act transition: next act's waypoint, town stock moves on
    const act = FL.byN(f.n).act;
    const next = FL.firstOfAct(act + 1);
    if (act < 4 && !r.waypoints.includes(next)) r.waypoints.push(next);
    if (act === 4) r.flags.sanctum = true;
    r.flags['act' + act + 'Done'] = true;
    world.events.push({ type: 'act.complete', act });
    placeExit(world, e.x, e.y);
  }

  function placeExit(world, x, y) {
    const f = world.floor;
    if (f.objects.some((o) => o.kind === 'exit_portal')) return;
    const at = f.arena && f.arena.exitPos ? f.arena.exitPos : { x: x || f.spawnPos.x, y: y || f.spawnPos.y };
    const spot = BD.sim.entities.nearestFree(f, at.x, at.y, 4) || at;
    f.objects.push({ kind: 'exit_portal', x: spot.x, y: spot.y });
    world.events.push({ type: 'portal.open', x: spot.x, y: spot.y, exit: true });
  }

  BD.sim.interact.registerObject('exit_portal', (world) => {
    world.run.act = Math.max(world.run.act, Math.min(4, FL.byN(world.floor.n).act + 1));
    BD.sim.run.travel(world, 'town', 'portal');
  });

  /** a fight is live: boss alive and awake in this arena */
  function liveFight(world) {
    const f = world.floor;
    if (!(typeof f.key === 'string' && f.key[0] === 'a') && f.n !== 13) return false;
    if (f.bossDead) return false;
    for (const e of f.entities.values()) if (BD.sim.entities.isBoss(e) && !e.dead) return true;
    return false;
  }
  function allShadesDead(world, e) {
    for (const o of world.floor.entities.values()) if (!o.dead && o !== e && (o.isShade || o.shadeOf != null) && o.hp > 0) return false;
    return true;
  }

  BD.sim.bossfight = { useGate, enterArena, system, onBossDead, placeExit, liveFight, allShadesDead, COUNTDOWN };
  BD.sim.world.addSystem('bossfight', system, 2);
})(globalThis.BD);
