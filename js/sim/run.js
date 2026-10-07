// @ts-check
// Run flow: begin, stairs, waypoints, portals, gates, act transitions.
(function (BD) {
  'use strict';

  const { T } = BD.data.tiles;
  const FL = BD.data.floors;
  const I = () => BD.sim.interact;

  function begin(world, opts) {
    const start = opts && opts.floor ? opts.floor : BD.sim.gen.town ? 'town' : 1;
    travel(world, start, 'spawn');
  }

  /**
   * Go to a floor. arrive: 'spawn' (generator spawn), 'up' (next to up stairs), 'down' (next to
   * down stairs), 'waypoint', 'portal', 'gate', or a {x,y}.
   */
  function travel(world, key, arrive) {
    const prevKey = world.floor ? world.floor.key : null;
    BD.sim.world.enterFloor(world, key, null);
    const f = world.floor;
    const pos = arrivalPos(world, f, arrive);
    if (pos) placePlayer(world, pos);
    onEnter(world, f, prevKey);
    return f;
  }

  function arrivalPos(world, f, arrive) {
    if (!arrive || arrive === 'spawn') return null;
    if (typeof arrive === 'object') return arrive;
    if (arrive === 'up' && f.key === 'town' && f.downPos) return { x: f.downPos.x, y: f.downPos.y + 2 };
    if (arrive === 'up' && f.upPos) return f.upPos;
    if (arrive === 'down' && f.downPos) return f.downPos;
    if (arrive === 'waypoint' && f.waypointPos) return f.waypointPos;
    if (arrive === 'portal' && f.portalPos) return f.portalPos;
    if (arrive === 'gate' && f.gatePos) return { x: f.gatePos.front[0][0], y: f.gatePos.front[0][1] };
    return null;
  }

  function placePlayer(world, pos) {
    const f = world.floor, p = world.player, E = BD.sim.entities;
    E.vacate(f, p);
    const spot = (pos.exact && E.isFree(f, pos.x, pos.y) ? pos : null) || E.nearestFree(f, pos.x, pos.y, 8, (x, y) => x !== pos.x || y !== pos.y) || E.nearestFree(f, pos.x, pos.y, 8);
    p.x = spot.x; p.y = spot.y; p.move = null;
    E.occupy(f, p);
    BD.sim.fov.refresh(world);
  }

  function onEnter(world, f, prevKey) {
    const r = world.run;
    if (typeof f.n === 'number' && f.key === f.n) {
      r.floor = f.n;
      r.act = FL.byN(f.n).act;
      if (f.n > r.deepestFloor) r.deepestFloor = f.n;
    } else if (f.key === 'town') r.floor = 0;
    // without a Keeper the seal has nothing to guard
    if (f.downPos && !f.keeperId && !f.sealBroken) openSeal(world, false);
    if (f.sealBroken && f.downPos && f.key !== 'town') f.tiles[f.downPos.y * f.w + f.downPos.x] = T.STAIRS_DOWN;
    if (BD.sim.portal) BD.sim.portal.onEnter(world);
    if (f.key === 'town') {
      if (!r.waypoints.includes(0)) r.waypoints.unshift(0);
      // town stock tracks the deepest floor of the current act (05 §1)
      r.townAl = townAl(r);
      if (BD.sim.economy) BD.sim.economy.onTownArrive(world);
      world.events.push({ type: 'town.arrive', first: !r.flags.visitedTown });
      r.flags.visitedTown = true;
    }
    world.events.push({ type: 'save.request', why: 'travel' });
    void prevKey;
  }

  /** AL for town stock: deepest floor reached in the current act; after an act boss, the next act's first floor */
  function townAl(r) {
    const FLd = BD.data.floors;
    const act = Math.min(4, r.act);
    if (r.flags['act' + act + 'Done'] && act < 4) return FLd.al(FLd.firstOfAct(act + 1));
    let deepest = FLd.firstOfAct(act);
    for (let n = FLd.firstOfAct(act); n < FLd.firstOfAct(act) + 3; n++) if (n <= r.deepestFloor) deepest = n;
    return FLd.al(deepest);
  }

  function openSeal(world, announce) {
    const f = world.floor;
    f.sealBroken = true;
    if (f.downPos) f.tiles[f.downPos.y * f.w + f.downPos.x] = T.STAIRS_DOWN;
    if (announce) {
      world.events.push({ type: 'seal.break', x: f.downPos ? f.downPos.x : 0, y: f.downPos ? f.downPos.y : 0 });
      I().announce(world, 'seal_broken');
    }
  }

  function descend(world) {
    const f = world.floor;
    if (f.key === 'town') { travel(world, 1, 'up'); return; }
    if (typeof f.n !== 'number' || !f.sealBroken) return;
    const next = f.n + 1;
    if (next > 12) return;
    travel(world, next, 'up');
    world.events.push({ type: 'floor.descend', n: next });
  }

  function ascend(world) {
    const f = world.floor;
    if (f.key === 1 || f.key === FL.firstOfAct(world.run.act)) {
      if (BD.sim.gen.town) { travel(world, 'town', 'up'); return; }
      I().deny(world, 'no_town_yet');
      return;
    }
    if (typeof f.key === 'number') travel(world, f.key - 1, 'down');
  }

  function touchWaypoint(world) {
    const f = world.floor, r = world.run;
    const key = f.key === 'town' ? 0 : f.n;
    if (!r.waypoints.includes(key)) {
      r.waypoints.push(key);
      r.waypoints.sort((a, b) => a - b);
      world.events.push({ type: 'waypoint.activate', floor: key, x: f.waypointPos.x, y: f.waypointPos.y });
      I().announce(world, 'waypoint_on');
      const p = world.player;
      p.flask.charges = Math.max(p.flask.charges, p.flask.max);
    }
    world.events.push({ type: 'waypoint.touch' });
  }

  function usePortalStone(world) { if (BD.sim.portal) BD.sim.portal.useStone(world); }
  function useGate(world) { if (BD.sim.bossfight) BD.sim.bossfight.useGate(world); else I().deny(world, 'gate_locked'); }

  BD.sim.run = { townAl, begin, travel, placePlayer, onEnter, openSeal, descend, ascend, touchWaypoint, usePortalStone, useGate };
})(globalThis.BD);
