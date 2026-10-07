// Walk a few steps on a generated floor and capture.
BD.debug.autotests.floor = (D) => {
  const q = /[?&]floor=(\d+)/.exec(location.search);
  const w = D.newRun({ cls: 'fighter', seed: 'shot1', floor: q ? Number(q[1]) : 1 });
  D.step(500);
  D.render(40);
  D.capture();
};
