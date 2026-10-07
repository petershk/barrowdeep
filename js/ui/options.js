// @ts-check
// Options: accessibility, audio volumes, zoom, bindings. Saved under bd2_opts.
(function (BD) {
  'use strict';

  const KEY = 'bd2_opts';
  const DEFAULTS = {
    zoom: 1.5, shake: 100, flash: 100, particles: 'full', colorblind: false, uiScale: 1, slowmo: false,
    master: 80, effects: 80, music: 60, ambience: 60, alwaysBars: false, damageNumbers: 'full', wasd: false,
    hints: true, bindings: null, rumble: true,
  };
  let opts = Object.assign({}, DEFAULTS);
  const listeners = [];

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) opts = Object.assign({}, DEFAULTS, JSON.parse(raw));
    } catch (e) { BD.core.util.warnOnce('options load failed', e); }
    BD.input.bindings.load(opts.bindings);
    apply();
  }
  function save() {
    opts.bindings = BD.input.bindings.map;
    try { localStorage.setItem(KEY, JSON.stringify(opts)); } catch (e) { BD.core.util.warnOnce('options save failed', e); }
  }
  function get(k) { return opts[k]; }
  function set(k, v) {
    opts[k] = v;
    save();
    apply();
    for (const fn of listeners) fn(k, v);
  }
  function onChange(fn) { listeners.push(fn); }
  function apply() {
    if (typeof document !== 'undefined') {
      document.documentElement.style.fontSize = 16 * opts.uiScale + 'px';
      document.body && document.body.classList.toggle('cb', !!opts.colorblind);
    }
  }

  BD.ui.options = { DEFAULTS, load, save, get, set, onChange, get all() { return opts; } };
})(globalThis.BD);
