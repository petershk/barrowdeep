// @ts-check
// Interactions with tiles and floor objects (stairs, waypoints, gates, chests, shrines, levers…).
(function (BD) {
  'use strict';

  const { T } = BD.data.tiles;
  const S = () => BD.data.strings;

  /** Object (chest, shrine, lever, pile…) at a tile, if any and still interactable. */
  function objectAt(world, x, y) {
    const f = world.floor;
    for (const o of f.objects) if (o.x === x && o.y === y && !o.used && o.kind !== 'trap') return o;
    for (const o of f.objects) if (o.kind === 'trap' && o.x === x && o.y === y && o.visible && !o.disarmed) return o;
    return null;
  }

  const objectHandlers = {};
  function registerObject(kind, fn) { objectHandlers[kind] = fn; }

  function announce(world, key, extra) { world.events.push(Object.assign({ type: 'announce', key, text: S() ? S().t(key) : key }, extra || {})); }
  function deny(world, key) { world.events.push({ type: 'ability.reject', id: world.player.id, abilityId: 'interact', reason: S() ? S().t(key) : key }); }

  /** Interact with whatever is at (x,y). The player is adjacent (or on it). */
  function at(world, x, y) {
    const f = world.floor;
    const obj = objectAt(world, x, y);
    if (obj && objectHandlers[obj.kind]) { objectHandlers[obj.kind](world, obj); return true; }
    const t = f.tiles[y * f.w + x];
    const run = BD.sim.run;
    switch (t) {
      case T.STAIRS_DOWN:
        if (run) run.descend(world);
        return true;
      case T.STAIRS_SEALED:
        deny(world, 'stairs_sealed');
        return false;
      case T.STAIRS_UP:
        if (run) run.ascend(world);
        return true;
      case T.WAYPOINT:
        if (run) run.touchWaypoint(world);
        return true;
      case T.PORTAL_STONE:
        if (run) run.usePortalStone(world);
        return true;
      case T.GATE:
        if (run) run.useGate(world);
        return true;
      case T.TOWN_DOOR:
        if (BD.sim.town) BD.sim.town.door(world, x, y);
        return true;
      default:
        return false;
    }
  }

  BD.sim.interact = { objectAt, at, registerObject, objectHandlers, announce, deny };
})(globalThis.BD);
