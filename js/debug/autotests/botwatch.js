BD.debug.autotests.botwatch = (D) => {
  D.newRun({ cls: 'fighter', floor: 1 });
  BD.debug.arena.bot(true, 8);
  BD.debug.overlay.setMode(1);
  // the live loop runs the bot; the screenshot lands after ~5 s of virtual time
};
