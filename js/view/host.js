// @ts-check
// What the view needs from whoever hosts it, declared here so the view never reaches up into the
// app or the UI. The app fills this in at boot (display preferences, pause state, the live world,
// hitstop); until then the defaults keep headless tools and tests drawing normally.
(function (BD) {
  'use strict';

  BD.view.host = {
    /** display preferences the renderer honours (mirrors the options panel) */
    prefs: { shake: 100, flash: 100, particles: 'full', colorblind: false, alwaysBars: false, damageNumbers: 'full' },
    /** where the pointer is: { inside, hoverTile: {x,y}|null, hoverEntity: id|null } */
    pointer: { inside: false, hoverTile: null, hoverEntity: null },
    /** label / health bar toggles held by the input layer */
    showLabels: false,
    showBars: false,
    paused: () => false,
    world: () => null,
    hitstop: () => {},
  };
})(globalThis.BD);
