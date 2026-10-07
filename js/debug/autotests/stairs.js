// Walk to the down stairs (seal open in M1), descend, capture floor 2 with the minimap.
BD.debug.autotests.stairs = (D) => {
  const w = D.newRun({ cls: 'fighter', seed: 'shot2', floor: 1 });
  const f = w.floor;
  BD.sim.run.descend(w);
  D.step(300);
  BD.ui.minimap.setQuest('Slay the Keeper');
  D.render(40);
  D.capture();
};
