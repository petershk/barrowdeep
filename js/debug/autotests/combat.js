// Fight an Act I pack mid-swing and capture.
BD.debug.autotests.combat = (D) => {
  const q = /[?&]cls=(\w+)/.exec(location.search);
  const w = D.newRun({ cls: q ? q[1] : 'fighter', seed: 'combat3', floor: 1 });
  const p = w.player;
  let best = null, bd = 1e9;
  for (const e of w.floor.entities.values()) {
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < bd && e.rank === 'normal') { bd = d; best = e; }
  }
  const standoff = (x, y) => Math.max(Math.abs(x - best.x), Math.abs(y - best.y)) >= 2 && BD.sim.targeting.hasLOS(w, x, y, best.x, best.y);
  const spot = BD.sim.entities.nearestFree(w.floor, best.x, best.y, 4, standoff);
  BD.sim.run.placePlayer(w, spot);
  BD.sim.commands.issue(w, { type: 'Engage', entityId: best.id, hold: true });
  for (let i = 0; i < 30; i++) { D.step(50); BD.view.render.draw(w, 0, 50); }
  D.render(1);
  D.capture();
};
