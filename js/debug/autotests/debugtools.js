BD.debug.autotests.debugtools = (D) => {
  D.newRun({ cls: 'magician', floor: 4 });
  const A = BD.debug.arena;
  A.setLevel(12);
  A.spawn('skeleton', 'champion', 0, 3);
  A.dummy();
  BD.debug.overlay.setMode(2);
  D.step(1500);
  BD.ui.panels.open('arena');
  D.render(10);
};
