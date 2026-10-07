// @ts-check
// Interactions with tiles and floor objects (stairs, waypoints, gates, chests, shrines, levers…).
(function (BD) {
  'use strict';

  const { T } = BD.data.tiles;
  const Strings = () => BD.data.strings;
  const Grid = BD.core.grid;

  /** Object (chest, shrine, lever, pile…) at a tile, if any and still interactable. */
  function objectAt(world, x, y) {
    const f = world.floor;
    // something usable wins over decoration sharing the tile (corpse props, used chests…)
    for (const o of f.objects) if (o.x === x && o.y === y && !o.used && o.kind !== 'trap' && objectHandlers[o.kind]) return o;
    for (const o of f.objects) if (o.x === x && o.y === y && !o.used && o.kind !== 'trap') return o;
    for (const o of f.objects) if (o.kind === 'trap' && o.x === x && o.y === y && o.visible && !o.disarmed) return o;
    return null;
  }

  const objectHandlers = {};
  function registerObject(kind, fn) { objectHandlers[kind] = fn; }

  function announce(world, key, extra) {
    world.events.push(Object.assign({ type: 'announce', key, text: Strings() ? Strings().t(key) : key }, extra || {}));
  }
  function deny(world, key) {
    world.events.push({ type: 'ability.reject', id: world.player.id, abilityId: 'interact', reason: Strings() ? Strings().t(key) : key });
  }

  /** Interact with whatever is at (x,y). The player is adjacent (or on it). */
  function at(world, x, y) {
    const f = world.floor;
    const obj = objectAt(world, x, y);
    if (obj && objectHandlers[obj.kind]) {
      objectHandlers[obj.kind](world, obj);
      return true;
    }
    const t = f.tiles[Grid.idx(f, x, y)];
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
      case T.TOWN_DOOR: {
        const d = f.town && f.town.doors.find((q) => Math.abs(q.x - x) <= 1 && q.y === y);
        const n = d && Object.values(BD.data.town.npcs).find((q) => q.role === d.role);
        if (n) world.events.push({ type: 'npc.talk', role: n.role, panel: n.panel, name: n.name, x, y });
        return true;
      }
      default:
        return false;
    }
  }

  BD.sim.interact = { objectAt, at, registerObject, objectHandlers, announce, deny };
})(globalThis.BD);
