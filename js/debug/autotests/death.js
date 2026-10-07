// The death panel after a Keeper kills the hero on floor 5.
BD.debug.autotests.death = (D) => {
  const w = D.newRun({ cls: 'assassin', seed: 'death', floor: 5 });
  const p = w.player;
  p.level = 9;
  p.gold = 640;
  w.run.timeMs = 31 * 60000;
  w.run.kills = 212;
  const killer = [...w.floor.entities.values()].find((e) => e.keeper) || [...w.floor.entities.values()][0];
  BD.sim.damage.kill(w, p, killer, { tags: ['melee'], amounts: { phys: 99 } });
  D.step(200);
  D.render(5);
  D.capture();
  BD.ui.panels.open('death');
};
