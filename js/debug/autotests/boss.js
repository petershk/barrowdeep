// Grulk mid-wind-up in his crypt.
BD.debug.autotests.boss = (D) => {
  const w = D.newRun({ cls: 'fighter', seed: 'bossshot', floor: 3, firstSkill: 'bash' });
  const p = w.player;
  p.level = 8;
  p.attrs.vit += 20;
  BD.sim.stats.bump(p);
  p.hp = BD.sim.stats.statsOf(w, p).maxLife;
  w.run.flags.key3 = true;
  BD.sim.bossfight.useGate(w);
  D.step(3200);
  const b = [...w.floor.entities.values()].find((e) => e.rank === 'boss');
  BD.sim.commands.issue(w, { type: 'Move', x: b.x, y: b.y + 3 });
  for (let i = 0; i < 60; i++) {
    D.step(50);
    const z = w.floor.zones.find((q) => !q.resolved && q.armMs < q.armTotal * 0.6 && q.armMs > 150);
    if (z && i > 10) break;
  }
  D.render(3);
  D.capture();
};
