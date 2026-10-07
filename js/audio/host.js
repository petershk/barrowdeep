// @ts-check
// What the audio layer needs from its host, declared here so audio never reaches into the app or
// the UI. The app fills it in at boot: volume sliders (0–100) and the live world for positional cues.
(function (BD) {
  'use strict';

  BD.audio.host = {
    volume: () => 80,
    /** call fn whenever a volume slider moves */
    onVolumeChange: () => {},
    world: () => null,
    /** true while a run is being played (not on menus): footsteps and heartbeat only then */
    playing: () => false,
  };
})(globalThis.BD);
