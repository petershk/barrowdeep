BD.debug.autotests.town = (D) => {
  const w = D.newRun({ cls: 'fighter', seed: 'town', firstSkill: 'bash' });
  D.step(400); D.render(30); D.capture();
};
