BD.debug.autotests.shop = (D) => {
  const w = D.newRun({ cls: 'fighter', seed: 'shop', firstSkill: 'bash' });
  w.player.gold = 900;
  const rng = BD.core.rng.makeRng('shopx');
  for (const r of ['rare', 'magic', 'magic']) w.player.pack.push(BD.sim.loot.rollItem(w, rng, { ilvl: 3, rarity: r }));
  D.step(100); D.render(5); D.capture();
  const q = /[?&]panel=(\w+)/.exec(location.search);
  BD.ui.panels.open(q ? q[1] : 'smith');
  const c = document.querySelector('.shop-wares .it-cell');
  if (c) c.dispatchEvent(new MouseEvent('mouseenter'));
};
