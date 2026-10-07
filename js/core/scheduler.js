// @ts-check
// World-time scheduler. Scheduled events are plain serialisable records sorted by `at`;
// handlers are looked up by `kind` in a registry (no closures in state).
//
// Every event has a scope, set when its kind is registered:
//   'floor' (default): belongs to the floor it was scheduled on (a trap dart, a boss telegraph, a bone
//                      wall closing). Dropped when the hero leaves that floor; never saved.
//   'run':             belongs to the hero (rage over time, a stealth flag). Survives travel and saves.
(function (BD) {
  'use strict';

  const STEP_MS = 1000 / 60;
  /** @type {Record<string, (world:any, payload:any)=>void>} */
  const handlers = {};
  /** @type {Record<string, 'floor'|'run'>} */
  const scopes = {};

  /** @param {{scope?: 'floor'|'run'}} [opts] */
  function register(kind, fn, opts) {
    handlers[kind] = fn;
    scopes[kind] = (opts && opts.scope) || 'floor';
  }
  const scopeOf = (kind) => scopes[kind] || 'floor';

  /** Insert keeping the array sorted by time (stable for equal times). */
  function schedule(world, atTime, kind, payload) {
    const ev = { at: atTime, kind, payload: payload || null, seq: world.nextSeq = (world.nextSeq || 0) + 1 };
    if (scopeOf(kind) === 'floor') ev.floor = world.floor ? world.floor.key : null;
    const list = world.scheduled;
    let i = list.length;
    while (i > 0 && list[i - 1].at > atTime) i--;
    list.splice(i, 0, ev);
    return ev;
  }
  const after = (world, ms, kind, payload) => schedule(world, world.time + ms, kind, payload);

  /** Run every scheduled event due at or before world.time. Handlers may schedule or cancel. */
  function runDue(world) {
    const here = world.floor ? world.floor.key : null;
    // re-read world.scheduled each pass: cancel() replaces the array
    while (world.scheduled.length && world.scheduled[0].at <= world.time) {
      const ev = world.scheduled.shift();
      if ('floor' in ev && ev.floor !== here) continue;
      const fn = handlers[ev.kind];
      if (fn) fn(world, ev.payload);
      else BD.core.util.warnOnce('no scheduler handler: ' + ev.kind);
    }
  }

  /** Drop scheduled events matching a predicate. */
  function cancel(world, pred) {
    world.scheduled = world.scheduled.filter((e) => !pred(e));
  }
  /** Leaving a floor: its events go with it. */
  const dropFloorEvents = (world) => cancel(world, (e) => scopeOf(e.kind) === 'floor');
  const pendingFloorEvents = (world) => world.scheduled.some((e) => scopeOf(e.kind) === 'floor');
  /** The run-scoped events, as save data. */
  const runEvents = (world) => world.scheduled
    .filter((e) => scopeOf(e.kind) === 'run')
    .map((e) => ({ at: e.at, kind: e.kind, payload: e.payload, seq: e.seq }));

  BD.core.scheduler = {
    STEP_MS, register, schedule, after, runDue, cancel, dropFloorEvents, pendingFloorEvents, runEvents, scopeOf, handlers,
  };
})(globalThis.BD);
