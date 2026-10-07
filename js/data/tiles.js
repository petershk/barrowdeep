// @ts-check
// Tile types. Ids are stored in Uint8Array grids and in saves, so they never change.
(function (BD) {
  'use strict';

  const T = {
    VOID: 0, WALL: 1, FLOOR: 2, PILLAR: 3, STAIRS_UP: 4, STAIRS_DOWN: 5, STAIRS_SEALED: 6,
    DOOR_OPEN: 7, DOOR_CLOSED: 8, WATER: 9, LAVA: 10, CHASM: 11, GATE: 12, WAYPOINT: 13,
    PORTAL_STONE: 14, TOWN_DOOR: 15, WELL: 16, DECOR: 17, BRIDGE: 18,
  };

  // walk: actors can stand on it; see: light/LOS passes; light: emits light; tall: drawn as a prism
  const PROPS = [];
  const def = (id, p) => { PROPS[id] = Object.assign({ walk: false, see: true, light: null, tall: false, interact: false }, p); };
  def(T.VOID, { see: false });
  def(T.WALL, { see: false, tall: true });
  def(T.FLOOR, { walk: true });
  def(T.PILLAR, { see: false, tall: true });
  def(T.STAIRS_UP, { walk: true, interact: true });
  def(T.STAIRS_DOWN, { walk: true, interact: true });
  def(T.STAIRS_SEALED, { walk: true, interact: true, light: { color: '#c02020', radius: 2.5, intensity: 0.6 } });
  def(T.DOOR_OPEN, { walk: true });
  def(T.DOOR_CLOSED, { see: false, tall: true, interact: true });
  def(T.WATER, {});
  def(T.LAVA, { light: { color: '#ff6a1a', radius: 2.2, intensity: 0.55 } });
  def(T.CHASM, {});
  def(T.GATE, { see: false, tall: true, interact: true, light: { color: '#a01818', radius: 3, intensity: 0.5 } });
  def(T.WAYPOINT, { walk: true, interact: true, light: { color: '#6aa8ff', radius: 3, intensity: 0.6 } });
  def(T.PORTAL_STONE, { walk: true, interact: true, light: { color: '#b06aff', radius: 2.5, intensity: 0.5 } });
  def(T.TOWN_DOOR, { see: false, tall: true, interact: true });
  def(T.WELL, { interact: false });
  def(T.DECOR, {});
  def(T.BRIDGE, { walk: true });

  const WALK = new Uint8Array(32), SEE = new Uint8Array(32);
  PROPS.forEach((p, i) => {
    WALK[i] = p.walk ? 1 : 0;
    SEE[i] = p.see ? 1 : 0;
  });

  BD.data.tiles = { T, PROPS, WALK, SEE };
})(globalThis.BD);
