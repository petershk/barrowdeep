// @ts-check
// Town Portal scrolls (01 §4): reading one opens a linked pair (here ↔ the town's portal stone).
// The pair survives round trips until another scroll is read, and is saved. Revelation reveals the
// map (doesn't count toward explored %). Waypoint travel.
(function (BD) {
  'use strict';

  const I = () => BD.sim.interact;
  const CMD = BD.sim.commands;

  function read(world, kind) {
    const p = world.player, f = world.floor;
    if (kind === 'reveal') {
      if (!p.pouch.reveal) return false;
      if (f.key === 'town') return false;
      p.pouch.reveal--;
      for (let i = 0; i < f.explored.length; i++) if (f.tiles[i] !== BD.data.tiles.T.VOID) f.explored[i] = 1;
      f.exploreDirty = true;
      world.events.push({ type: 'reveal', x: p.x, y: p.y });
      return true;
    }
    if (!p.pouch.portal) { I().deny(world, 'no_portal'); return false; }
    if (f.key === 'town') return false;
    if (BD.sim.bossfight && BD.sim.bossfight.liveFight(world)) { I().deny(world, 'cant_unsafe'); return false; }
    p.pouch.portal--;
    const spot = BD.sim.entities.nearestFree(f, p.x + 1, p.y, 3, (x, y) => x !== p.x || y !== p.y) || { x: p.x, y: p.y };
    world.run.portal = { key: f.key, x: spot.x, y: spot.y };
    f.objects = f.objects.filter((o) => o.kind !== 'portal');
    f.objects.push({ kind: 'portal', x: spot.x, y: spot.y, runtime: true });
    world.events.push({ type: 'portal.open', x: spot.x, y: spot.y });
    I().announce(world, 'portal_open');
    return true;
  }

  /** dungeon side: step through to town */
  I().registerObject('portal', (world) => { BD.sim.run.travel(world, 'town', 'portal'); });

  /** town side: the portal stone returns you through an open pair */
  function useStone(world) {
    const pt = world.run.portal;
    if (!pt) { I().deny(world, 'no_portal'); return; }
    if (pt.x < 0) {
      // the Ferryman's portal: back to the up stairs, or beside the boss gate
      BD.sim.run.travel(world, pt.key, pt.to || 'up');
      const p = world.player;
      world.run.portal = { key: pt.key, x: p.x, y: p.y };
      onEnter(world);
      return;
    }
    BD.sim.run.travel(world, pt.key, { x: pt.x, y: pt.y });
  }

  /** after entering a floor, re-create the portal object if the pair ends here */
  function onEnter(world) {
    const f = world.floor, pt = world.run.portal;
    if (!pt || pt.key !== f.key || pt.x < 0) return;
    if (!f.objects.some((o) => o.kind === 'portal')) f.objects.push({ kind: 'portal', x: pt.x, y: pt.y, runtime: true });
  }

  /** waypoint travel (01 §4): town = 0, floors 1/4/7/10, Malgoth's Sanctum (13) after Hakthul */
  function travelTo(world, floor) {
    const r = world.run;
    if (floor === 13) { if (!r.flags.sanctum) return false; BD.sim.run.travel(world, 13, 'spawn'); return true; }
    if (floor !== 0 && !r.waypoints.includes(floor)) return false;
    if (floor === 0) BD.sim.run.travel(world, 'town', 'waypoint');
    else BD.sim.run.travel(world, floor, 'waypoint');
    world.events.push({ type: 'waypoint.travel', floor });
    return true;
  }
  CMD.register('TravelWaypoint', (world, c) => travelTo(world, c.floor), { ui: true });

  BD.sim.portal = { read, useStone, onEnter, travelTo };
})(globalThis.BD);
