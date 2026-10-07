// @ts-check
// Commands: the only way input devices, UI and the bot change the world (06 §10).
// Two doors in:
//   issue(world, cmd)  queue any command; it runs at the start of the next step (moving, fighting).
//   apply(world, cmd)  run a menu command right now, also while the world is paused (equip, buy,
//                      spend points). Only commands registered with { ui: true } pass this door.
// A dead hero can only use commands registered with { whileDead: true } (the Bargain, Harvest).
(function (BD) {
  'use strict';

  const Entities = BD.sim.entities;
  const Grid = BD.core.grid;

  /** @type {Record<string, (world:any, cmd:any)=>any>} */
  const handlers = {};
  /** menu commands: may run immediately through apply() */
  const UI_CMDS = new Set();
  /** commands a dead hero may still use */
  const DEAD_CMDS = new Set();

  /** @param {{ui?: boolean, whileDead?: boolean}} [opts] */
  function register(type, fn, opts) {
    handlers[type] = fn;
    if (opts && opts.ui) UI_CMDS.add(type);
    if (opts && opts.whileDead) DEAD_CMDS.add(type);
  }

  function issue(world, cmd) { world.commandQueue.push(cmd); }

  function run(world, cmd) {
    const fn = handlers[cmd.type];
    if (!fn) {
      BD.core.util.warnOnce('unknown command ' + cmd.type);
      return null;
    }
    if (world.player && world.player.dead && !DEAD_CMDS.has(cmd.type)) return null;
    return fn(world, cmd);
  }

  /** Run a menu command now (panels, also while paused). Returns the handler's result. */
  function apply(world, cmd) {
    if (!UI_CMDS.has(cmd.type)) {
      BD.core.util.warnOnce('not a menu command (use issue): ' + cmd.type);
      return null;
    }
    return run(world, cmd);
  }

  function applyQueue(world) {
    const q = world.commandQueue;
    if (!q.length) return;
    world.commandQueue = [];
    for (const cmd of q) run(world, cmd);
  }

  // ---- movement & basic interaction ----
  register('Move', (world, c) => {
    const p = world.player;
    if (p.attack && p.attack.phase === 'windup' && p.attack.cancellable && BD.sim.abilities) BD.sim.abilities.cancel(world, p, 'move');
    const path = BD.sim.player.pathTo(world, p, c.x, c.y, true);
    if (!path || !path.length) {
      p.intent = { kind: 'idle' };
      return;
    }
    p.intent = { kind: 'move', path };
  });
  register('Stop', (world) => { world.player.intent = { kind: 'idle' }; });
  register('Engage', (world, c) => {
    const t = Entities.get(world, c.entityId);
    if (!t || t.faction === 'player') return;
    world.player.intent = { kind: 'engage', targetId: c.entityId, hold: !!c.hold };
    world.player.lockId = c.entityId;
  });
  register('ForceAttack', (world, c) => { if (BD.sim.combat) BD.sim.combat.forceAttack(world, world.player, c.x, c.y); });
  register('Evade', (world, c) => BD.sim.player.evade(world, world.player, c.dirX, c.dirY));
  register('Interact', (world, c) => {
    const f = world.floor;
    let x = c.x, y = c.y;
    // any tile of the 2×2 boss gate interacts through the tile that faces the front
    if (f.gatePos && f.gatePos.at && f.tiles[Grid.idx(f, x, y)] === BD.data.tiles.T.GATE) {
      x = f.gatePos.at.x;
      y = f.gatePos.at.y;
    }
    world.player.intent = { kind: 'interact', x, y };
  });
  register('HoldEnd', (world) => {
    const it = world.player.intent;
    if (it) it.hold = false;
  });

  BD.sim.commands = { register, issue, apply, applyQueue, handlers, UI_CMDS };
})(globalThis.BD);
