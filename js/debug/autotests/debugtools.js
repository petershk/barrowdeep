BD.debug.autotests.debugtools = (D) => {
  D.newRun({ cls: 'magician', floor: 4 });
  const Arena = BD.debug.arena;
  Arena.setLevel(12);
  Arena.spawn('skeleton', 'champion', 0, 3);
  Arena.dummy();
  BD.debug.overlay.setMode(2);
  D.step(1500);
  BD.ui.panels.open('arena');
  D.render(10);
};
