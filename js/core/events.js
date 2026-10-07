// @ts-check
// Event bus. The sim appends plain event objects to world.events; app.js drains them after each
// step and dispatches here. Subscribers (view/audio/ui) never mutate the world.
(function (BD) {
  'use strict';

  function makeBus() {
    /** @type {Map<string, Function[]>} */
    const subs = new Map();
    return {
      subs,
      /** @param {string} type @param {(ev:any)=>void} fn */
      on(type, fn) {
        let list = subs.get(type);
        if (!list) subs.set(type, (list = []));
        list.push(fn);
        return () => {
          const l = subs.get(type);
          if (l) l.splice(l.indexOf(fn), 1);
        };
      },
      /** @param {{type:string}} ev */
      emit(ev) {
        const l = subs.get(ev.type);
        if (l) for (let i = 0; i < l.length; i++) l[i](ev);
        const w = subs.get('*');
        if (w) for (let i = 0; i < w.length; i++) w[i](ev);
      },
      clear() { subs.clear(); },
    };
  }

  /** Sim-side helper: append to the world's event list. */
  function emit(world, ev) { world.events.push(ev); }

  BD.core.events = { makeBus, emit };
})(globalThis.BD);
