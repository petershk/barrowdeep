// A pack in view on any floor: ?floor=N
BD.debug.autotests.biome = (D) => {
  const q = /[?&]floor=(\d+)/.exec(location.search);
  const n = q ? Number(q[1]) : 4;
  const w = D.newRun({ cls: 'valkyrie', seed: 'biome' + n, floor: n, firstSkill: 'multishot' });
  const p = w.player;
  p.level = 20;
  p.attrs.vit += 60;
  BD.sim.stats.bump(p);
  p.hp = BD.sim.stats.statsOf(w, p).maxLife;
  let best = null, bd = 1e9;
  for (const e of w.floor.entities.values()) {
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < bd && e.rank === 'normal') {
      bd = d;
      best = e;
    }
  }
  const standoff = (x, y) => Math.max(Math.abs(x - best.x), Math.abs(y - best.y)) >= 4 && BD.sim.targeting.hasLOS(w, x, y, best.x, best.y);
  const spot = BD.sim.entities.nearestFree(w.floor, best.x, best.y, 6, standoff);
  if (spot) BD.sim.run.placePlayer(w, spot);
  for (let i = 0; i < 12; i++) {
    D.step(50);
    BD.view.render.draw(w, 0, 50);
  }
  BD.sim.commands.issue(w, { type: 'Engage', entityId: best.id, hold: true });
  for (let i = 0; i < 16; i++) {
    D.step(50);
    BD.view.render.draw(w, 0, 50);
  }
  D.render(1);
  D.capture();
};
