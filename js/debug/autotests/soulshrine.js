BD.debug.autotests.soulshrine = (D) => {
  const m = BD.ui.meta.get();
  Object.assign(m, { souls: 420, soulsTotal: 980, runs: 4, unlocks: { ledger: true } });
  BD.ui.menu.open();
  BD.ui.panels.close('menu');
  BD.ui.panels.open('shrine');
};
