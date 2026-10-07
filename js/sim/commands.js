// @ts-check
// Commands: the only way input devices, UI and the bot change the world (06 §10).
// Queued commands are applied at the start of the next step; UI commands may be applied
// immediately through the same handlers while the world is paused.
(function (BD) {
  'use strict';

  const E = BD.sim.entities;

  /** @type {Record<string, (world:any, cmd:any)=>any>} */
  const handlers = {};
  /** UI commands allowed while paused. */
  const UI_CMDS = new Set();

  function register(type, fn, opts) {
    handlers[type] = fn;
    if (opts && opts.ui) UI_CMDS.add(type);
  }

  function issue(world, cmd) { world.commandQueue.push(cmd); }

  /** Apply immediately (UI panels while paused). Returns the handler's result. */
  function apply(world, cmd) {
    const fn = handlers[cmd.type];
    if (!fn) { BD.core.util.warnOnce('unknown command ' + cmd.type); return null; }
    if (world.player && world.player.dead && cmd.type !== 'Bargain' && cmd.type !== 'Harvest') return null;
    return fn(world, cmd);
  }

  function applyQueue(world) {
    const q = world.commandQueue;
    if (!q.length) return;
    world.commandQueue = [];
    for (const cmd of q) apply(world, cmd);
  }

  // ---- movement & basic interaction ----
  register('Move', (world, c) => {
    const p = world.player;
    if (p.attack && p.attack.phase === 'windup' && p.attack.cancellable && BD.sim.abilities) BD.sim.abilities.cancel(world, p, 'move');
    const path = BD.sim.player.pathTo(world, p, c.x, c.y, true);
    if (!path || !path.length) { p.intent = { kind: 'idle' }; return; }
    p.intent = { kind: 'move', path };
  });
  register('Stop', (world) => { world.player.intent = { kind: 'idle' }; });
  register('Engage', (world, c) => {
    const t = E.get(world, c.entityId);
    if (!t || t.faction === 'player') return;
    world.player.intent = { kind: 'engage', targetId: c.entityId, hold: !!c.hold };
    world.player.lockId = c.entityId;
  });
  register('ForceAttack', (world, c) => { if (BD.sim.combat) BD.sim.combat.forceAttack(world, world.player, c.x, c.y); });
  register('Evade', (world, c) => BD.sim.player.evade(world, world.player, c.dirX, c.dirY));
  register('Interact', (world, c) => { world.player.intent = { kind: 'interact', x: c.x, y: c.y }; });
  register('HoldEnd', (world) => { const it = world.player.intent; if (it) it.hold = false; });

  BD.sim.commands = { register, issue, apply, applyQueue, handlers, UI_CMDS };
})(globalThis.BD);
