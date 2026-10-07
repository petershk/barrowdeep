// Inventory with a comparison tooltip; ground loot around the player.
BD.debug.autotests.inventory = (D) => {
  const w = D.newRun({ cls: 'fighter', seed: 'inv', floor: 1, firstSkill: 'bash' });
  const p = w.player;
  w.run.flags.ledger = 3;
  const rng = BD.core.rng.makeRng('invshot');
  for (const r of ['magic', 'rare', 'legendary', 'magic', 'rare', 'common', 'magic', 'rare']) p.pack.push(BD.sim.loot.rollItem(w, rng, { ilvl: 6, rarity: r, usable: true }));
  p.pack.push(BD.sim.loot.makeLegendary(w, rng, 6, 'fighter', 'worldcleaver'));
  p.gold = 312;
  for (const r of ['legendary', 'rare', 'magic', 'common']) BD.sim.loot.dropAt(w, p.x + 2, p.y, { kind: 'item', item: BD.sim.loot.rollItem(w, rng, { ilvl: 3, rarity: r }) });
  BD.sim.loot.dropAt(w, p.x, p.y + 2, { kind: 'gold', amount: 40 });
  BD.app.showLabels = true;
  D.step(600);
  D.render(5);
  D.capture();
  const q = /[?&]open=(\w+)/.exec(location.search);
  if (q) {
    BD.ui.panels.open('inventory');
    const cells = document.querySelectorAll('.pack-list .it-cell[data-uid]');
    cells[0].dispatchEvent(new MouseEvent('mouseenter'));
  }
};
