// @ts-check
// Run flow: begin, stairs, waypoints, portals, gates, act transitions.
(function (BD) {
  'use strict';

  const Grid = BD.core.grid;
  const { T } = BD.data.tiles;
  const FloorData = BD.data.floors;
  const Interact = () => BD.sim.interact;

  const TOWN_ARRIVAL_DROP = 2;            // arriving in town from below: this many tiles south of the stairs
  const ARRIVAL_SEARCH_RADIUS = BD.sim.world.ARRIVAL_SEARCH_RADIUS;
  const LAST_ACT = FloorData.LAST_ACT;    // town stock never goes past act 4
  const LAST_STAIRS_FLOOR = FloorData.LAST - 1;  // no stairs down from here: the Sanctum is reached by waypoint

  function begin(world, opts) {
    let start = 1;
    if (opts && opts.floor) start = opts.floor;
    else if (BD.sim.gen.town) start = 'town';
    travel(world, start, 'spawn');
  }

  /**
   * Go to a floor. arrive: 'spawn' (generator spawn), 'up' (next to up stairs), 'down' (next to
   * down stairs), 'waypoint', 'portal', 'gate', or a {x,y}.
   */
  function travel(world, key, arrive) {
    BD.sim.world.enterFloor(world, key, null);
    const f = world.floor;
    const pos = arrivalPos(world, f, arrive);
    if (pos) placePlayer(world, pos);
    onEnter(world, f);
    return f;
  }

  function arrivalPos(world, f, arrive) {
    if (!arrive || arrive === 'spawn') return null;
    if (typeof arrive === 'object') return arrive;
    if (arrive === 'up' && f.key === 'town' && f.downPos) return { x: f.downPos.x, y: f.downPos.y + TOWN_ARRIVAL_DROP };
    if (arrive === 'up' && f.upPos) return f.upPos;
    if (arrive === 'down' && f.downPos) return f.downPos;
    if (arrive === 'waypoint' && f.waypointPos) return f.waypointPos;
    if (arrive === 'portal' && f.portalPos) return f.portalPos;
    if (arrive === 'gate' && f.gatePos) return { x: f.gatePos.front[0][0], y: f.gatePos.front[0][1] };
    return null;
  }

  function placePlayer(world, pos) {
    const f = world.floor, p = world.player, Entities = BD.sim.entities;
    Entities.vacate(f, p);
    const exact = pos.exact && Entities.isFree(f, pos.x, pos.y) ? pos : null;
    const spot = exact
      || Entities.nearestFree(f, pos.x, pos.y, ARRIVAL_SEARCH_RADIUS, (x, y) => x !== pos.x || y !== pos.y)
      || Entities.nearestFree(f, pos.x, pos.y, ARRIVAL_SEARCH_RADIUS);
    p.x = spot.x;
    p.y = spot.y;
    p.move = null;
    Entities.occupy(f, p);
    BD.sim.fov.refresh(world);
  }

  function onEnter(world, f) {
    const r = world.run;
    if (typeof f.n === 'number' && f.key === f.n) {
      r.floor = f.n;
      r.act = FloorData.byN(f.n).act;
      if (f.n > r.deepestFloor) r.deepestFloor = f.n;
    } else if (f.key === 'town') {
      r.floor = 0;
    }
    // without a Keeper the seal has nothing to guard
    if (f.downPos && !f.hadKeeper && !f.sealBroken) openSeal(world, false);
    if (f.sealBroken && f.downPos && f.key !== 'town') f.tiles[Grid.idx(f, f.downPos.x, f.downPos.y)] = T.STAIRS_DOWN;
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
  }

  /** AL for town stock: deepest floor reached in the current act; after an act boss, the next act's first floor */
  function townAl(r) {
    const act = Math.min(LAST_ACT, r.act);
    if (r.flags['act' + act + 'Done'] && act < LAST_ACT) return FloorData.al(FloorData.firstOfAct(act + 1));
    let deepest = FloorData.firstOfAct(act);
    const nextAct = FloorData.firstOfAct(act) + FloorData.FLOORS_PER_ACT;
    for (let n = FloorData.firstOfAct(act); n < nextAct; n++) if (n <= r.deepestFloor) deepest = n;
    return FloorData.al(deepest);
  }

  function openSeal(world, announce) {
    const f = world.floor;
    f.sealBroken = true;
    if (f.downPos) f.tiles[Grid.idx(f, f.downPos.x, f.downPos.y)] = T.STAIRS_DOWN;
    if (announce) {
      const at = f.downPos || { x: 0, y: 0 };
      world.events.push({ type: 'seal.break', x: at.x, y: at.y });
      Interact().announce(world, 'seal_broken');
    }
  }

  function descend(world) {
    const f = world.floor;
    if (f.key === 'town') {
      travel(world, 1, 'up');
      return;
    }
    if (typeof f.n !== 'number' || !f.sealBroken) return;
    const next = f.n + 1;
    if (next > LAST_STAIRS_FLOOR) return;
    travel(world, next, 'up');
    world.events.push({ type: 'floor.descend', n: next });
  }

  function ascend(world) {
    const f = world.floor;
    if (f.key === 1 || f.key === FloorData.firstOfAct(world.run.act)) {
      if (BD.sim.gen.town) {
        travel(world, 'town', 'up');
        return;
      }
      Interact().deny(world, 'no_town_yet');
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
      Interact().announce(world, 'waypoint_on');
      const p = world.player;
      p.flask.charges = Math.max(p.flask.charges, p.flask.max);
    }
    world.events.push({ type: 'waypoint.touch' });
  }

  function usePortalStone(world) { if (BD.sim.portal) BD.sim.portal.useStone(world); }
  function useGate(world) {
    if (BD.sim.bossfight) BD.sim.bossfight.useGate(world);
    else Interact().deny(world, 'gate_locked');
  }

  BD.sim.run = { townAl, begin, travel, placePlayer, onEnter, openSeal, descend, ascend, touchWaypoint, usePortalStone, useGate };
})(globalThis.BD);
