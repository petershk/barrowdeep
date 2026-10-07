BD.debug.autotests.create = (D) => {
  BD.ui.panels.closeAll();
  BD.ui.panels.open('create');
  const q = /[?&]step=(\d)/.exec(location.search);
  const n = q ? Number(q[1]) : 0;
  for (let i = 0; i < n; i++) {
    if (n >= 2 && i === 1) document.querySelector('[data-action="skill"]').click();
    const nb = document.querySelector('[data-action="next"]');
    if (nb) nb.click();
  }
};
