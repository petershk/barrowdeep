BD.debug.autotests.soulshrine = (D) => {
  const m = BD.ui.meta.get(); m.souls = 420; m.soulsTotal = 980; m.runs = 4; m.unlocks = { ledger: true };
  BD.ui.menu.open(); BD.ui.panels.close('menu');
  BD.ui.panels.open('shrine');
};
