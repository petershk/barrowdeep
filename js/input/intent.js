// @ts-check
// Maps raw input to commands: click priority (enemy → interactable → item → move),
// hold-to-move (re-issue every 160 ms), hold lock on enemies, shift force-attack, smart aim.
(function (BD) {
  'use strict';

  const { T, PROPS } = BD.data.tiles;
  const Commands = () => BD.sim.commands;
  const Grid = BD.core.grid;
  const app = () => BD.app;

  const RELOCK_RADIUS = 1.5;            // tiles around the cursor a held attack looks for its next target
  const SPENT_LOCK = -1;                 // the locked enemy died and nothing is under the cursor yet
  const hold = { left: false, right: false, keys: {}, sinceMs: 0, lockId: null, lastIssue: 0 };

  /** What is under the cursor? enemy > interactable > item > tile */
  function pick(world, tile, screen) {
    const f = world.floor;
    const enemy = BD.input.mouse.entityAt(world, screen, tile);
    if (enemy) return { kind: 'enemy', id: enemy.id, x: enemy.x, y: enemy.y };
    if (tile.x >= 0 && tile.y >= 0 && tile.x < f.w && tile.y < f.h && f.explored[Grid.idx(f, tile.x, tile.y)]) {
      const obj = BD.sim.interact && BD.sim.interact.objectAt(world, tile.x, tile.y);
      if (obj) return { kind: 'object', x: tile.x, y: tile.y, obj };
      const t = f.tiles[Grid.idx(f, tile.x, tile.y)];
      if (PROPS[t].interact) return { kind: 'object', x: tile.x, y: tile.y };
      const item = (f.items || []).find((it) => it.x === tile.x && it.y === tile.y);
      if (item) return { kind: 'item', uid: item.uid, x: tile.x, y: tile.y };
    }
    return { kind: 'tile', x: tile.x, y: tile.y };
  }

  function issue(cmd) {
    const w = app().world;
    if (w) Commands().issue(w, cmd);
  }

  function leftDown(tile, screen, shift) {
    const w = app().world;
    if (!w || app().paused()) return;
    hold.left = true;
    hold.sinceMs = 0;
    hold.lockId = null;
    if (shift) {
      issue({ type: 'ForceAttack', x: tile.x, y: tile.y });
      hold.force = true;
      return;
    }
    hold.force = false;
    const t = pick(w, tile, screen);
    if (t.kind === 'enemy') {
      hold.lockId = t.id;
      issue({ type: 'Engage', entityId: t.id, hold: true });
    }
    else if (t.kind === 'object') issue({ type: 'Interact', x: t.x, y: t.y });
    else if (t.kind === 'item') issue({ type: 'Pickup', itemUid: t.uid, x: t.x, y: t.y });
    else issue({ type: 'Move', x: t.x, y: t.y });
  }
  function leftUp() {
    hold.left = false;
    if (hold.lockId) issue({ type: 'HoldEnd' });
    hold.lockId = null;
  }

  /** skill aim: the enemy under the cursor, else the cursor tile, else let the sim pick */
  function skillAim(enemy, tile) {
    if (enemy) return { entityId: enemy.id, x: enemy.x, y: enemy.y };
    return tile ? { x: tile.x, y: tile.y, cursor: true } : 'auto';
  }

  /** skill use: slot = 'rmb' | 's1'..'s4' */
  function skill(slot, tile, screen, isHold) {
    const w = app().world;
    if (!w || app().paused()) return;
    const enemy = screen ? BD.input.mouse.entityAt(w, screen, tile, 1.5) : null;
    const aim = skillAim(enemy, tile);
    issue({ type: 'UseSkill', slot, aim, hold: !!isHold });
  }

  /**
   * A held attack outlives its target: when the locked enemy dies, lock onto the enemy under the cursor (or
   * next to it). With none there the hero stands ready rather than walking off (lockId stays set, 'spent').
   */
  function relock(w, m) {
    const t = BD.sim.entities.get(w, hold.lockId);
    if (t && !t.dead && t.hp > 0) return;
    const next = m.hoverTile ? m.entityAt(w, m.screen, m.hoverTile, RELOCK_RADIUS) : null;
    if (!next) {
      hold.lockId = SPENT_LOCK;
      return;
    }
    hold.lockId = next.id;
    issue({ type: 'Engage', entityId: next.id, hold: true });
  }

  /** per-frame: repeat holds */
  function frame(realMs) {
    const w = app().world;
    if (!w || app().paused()) return;
    const m = BD.input.mouse;
    hold.sinceMs += realMs;
    if (hold.left && hold.lockId) relock(w, m);
    if (hold.left && !hold.lockId && m.hoverTile) {
      if (hold.sinceMs - hold.lastIssue >= BD.data.balance.player.holdRepeatMs) {
        hold.lastIssue = hold.sinceMs;
        if (hold.force) issue({ type: 'ForceAttack', x: m.hoverTile.x, y: m.hoverTile.y });
        else {
          const p = w.player, last = p.intent && p.intent.path && p.intent.path[p.intent.path.length - 1];
          if (!last || last[0] !== m.hoverTile.x || last[1] !== m.hoverTile.y) issue({ type: 'Move', x: m.hoverTile.x, y: m.hoverTile.y });
        }
      }
    } else if (!hold.left) hold.lastIssue = 0;
    // held skill keys / RMB recast whenever ready
    for (const slot in hold.keys) {
      if (!hold.keys[slot]) continue;
      const p = w.player;
      const channeling = p.attack && p.attack.phase === 'channel' && p.attack.abilityId === p.bar[slot];
      const stepDone = !p.move || p.move.elapsed >= p.move.dur * 0.45;
      const idle = !p.attack && stepDone && m.hoverTile && (!p.intent || p.intent.kind === 'idle');
      if (channeling || idle) skill(slot, m.hoverTile, m.screen, true);
    }
  }

  BD.input.intent = { hold, pick, leftDown, leftUp, skill, frame, issue };
})(globalThis.BD);
