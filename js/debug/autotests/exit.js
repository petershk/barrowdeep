// A finished floor: the seal is broken on floor ?floor=N (default 2) with the whole floor explored, the hero
// standing far from the stairs. Shows the light-up wave (?ms= how long after completion, default 2500), the
// trail of light toward the stairs, the light pillar on them and the edge arrow when they are off screen.
BD.debug.autotests.exit = (D) => {
  const fq = /[?&]floor=(\d+)/.exec(location.search);
  const mq = /[?&]ms=(\d+)/.exec(location.search);
  const w = D.newRun({ cls: 'valkyrie', seed: 'exit1', floor: fq ? Number(fq[1]) : 2 });
  const f = w.floor, p = w.player;
  for (let i = 0; i < f.explored.length; i++) f.explored[i] = 1;
  f.exploreDirty = true;
  // stand somewhere far from the stairs
  let best = null, bd = -1;
  for (let y = 0; y < f.h; y++) {
    for (let x = 0; x < f.w; x++) {
      if (!BD.sim.entities.isFree(f, x, y)) continue;
      const d = Math.hypot(x - f.downPos.x, y - f.downPos.y);
      if (d > bd && d < 22) {
        bd = d;
        best = { x, y };
      }
    }
  }
  if (best) BD.sim.run.placePlayer(w, best);
  for (const e of f.entities.values()) if (e.faction !== 'player') e.dead = true;
  for (let i = 0; i < 4; i++) {
    D.step(50);
    BD.view.render.draw(w, 0, 50);
  }
  BD.sim.run.openSeal(w, true);
  const ms = mq ? Number(mq[1]) : 2500;
  for (let t = 0; t < ms; t += 50) {
    D.step(50);
    BD.view.render.draw(w, 0, 50);
  }
  D.render(1);
  D.capture();
};
