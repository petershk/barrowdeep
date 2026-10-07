BD.debug.autotests.hints = (D) => {
  const arg = (k, d) => { const m = new RegExp('[?&]' + k + '=([a-z0-9_]+)').exec(location.search); return m ? m[1] : d; };
  D.newRun({ cls: arg('cls', 'assassin') });
  BD.ui.hints.reset();
  BD.ui.hints.show(arg('hint', 'resource'));
  D.render(10);
};
