// @ts-check
// World-time scheduler. Scheduled events are plain serialisable records sorted by `at`;
// handlers are looked up by `kind` in a registry (no closures in state).
(function (BD) {
  'use strict';

  const STEP_MS = 1000 / 60;
  /** @type {Record<string, (world:any, payload:any)=>void>} */
  const handlers = {};

  function register(kind, fn) { handlers[kind] = fn; }

  /** Insert keeping the array sorted by time (stable for equal times). */
  function schedule(world, atTime, kind, payload) {
    const ev = { at: atTime, kind, payload: payload || null, seq: world.nextSeq = (world.nextSeq || 0) + 1 };
    const list = world.scheduled;
    let i = list.length;
    while (i > 0 && list[i - 1].at > atTime) i--;
    list.splice(i, 0, ev);
    return ev;
  }
  const after = (world, ms, kind, payload) => schedule(world, world.time + ms, kind, payload);

  /** Run every scheduled event due at or before world.time. */
  function runDue(world) {
    const list = world.scheduled;
    let guard = 0;
    while (list.length && list[0].at <= world.time && guard++ < 10000) {
      const ev = list.shift();
      const fn = handlers[ev.kind];
      if (fn) fn(world, ev.payload);
      else BD.core.util.warnOnce('no scheduler handler: ' + ev.kind);
    }
  }

  /** Drop scheduled events matching a predicate (e.g. on floor change). */
  function cancel(world, pred) {
    world.scheduled = world.scheduled.filter((e) => !pred(e));
  }

  BD.core.scheduler = { STEP_MS, register, schedule, after, runDue, cancel, handlers };
})(globalThis.BD);
