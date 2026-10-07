// @ts-check
// HUD frame driver. Sub-widgets (orbs, skill bar, boss bar, nameplate…) register here.
(function (BD) {
  'use strict';

  const widgets = [];
  function add(w) { widgets.push(w); }

  function frame(world, realMs) {
    if (BD.app.state !== 'playing' || !world.floor) { document.body.classList.add('no-hud'); return; }
    document.body.classList.remove('no-hud');
    if (BD.ui.minimap) BD.ui.minimap.frame(world);
    for (const w of widgets) w.frame(world, realMs);
  }

  BD.ui.hud = { add, frame, widgets };
})(globalThis.BD);
