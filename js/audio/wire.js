// @ts-check
// Audio's single subscription point: the cue table, music/ambience following the world, and UI clicks.
(function (BD) {
  'use strict';
  BD.audio.wire = function wire(bus) {
    BD.audio.cues.wire(bus);
    BD.audio.music.wire(bus);
    bus.on('ui.click', () => BD.audio.synth.play('ui_click', {}));
    bus.on('ui.confirm', () => BD.audio.synth.play('ui_confirm', {}));
    bus.on('ui.cancel', () => BD.audio.synth.play('ui_cancel', {}));
  };
})(globalThis.BD);
