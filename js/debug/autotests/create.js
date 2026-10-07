BD.debug.autotests.create = (D) => {
  BD.ui.panels.closeAll();
  BD.ui.panels.open('create');
  const q = /[?&]step=(\d)/.exec(location.search);
  const n = q ? Number(q[1]) : 0;
  for (let i = 0; i < n; i++) {
    const pick = /** @type {HTMLElement} */ (document.querySelector('[data-action="skill"]'));
    if (n >= 2 && i === 1) pick.click();
    const nb = /** @type {HTMLElement|null} */ (document.querySelector('[data-action="next"]'));
    if (nb) nb.click();
  }
};
