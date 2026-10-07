BD.debug.autotests.touch = (D) => {
  D.newRun({ cls: 'fighter', floor: 1 });
  BD.input.touch.enable();
  const v = BD.input.gamepad.virtual;
  v.axes[0] = 0.9;
  v.axes[1] = 0.3;
  for (let i = 0; i < 40; i++) {
    BD.input.gamepad.frame(16);
    D.step(16);
  }
  D.render(5);
};
