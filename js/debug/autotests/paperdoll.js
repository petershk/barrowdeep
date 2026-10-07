// A sheet of each class sprite with every weapon category and offhand composited (paper-doll lite).
BD.debug.autotests.paperdoll = (D) => {
  D.newRun({ cls: 'fighter' });
  const combos = ['', 'blade|-', 'blade2|-', 'axe|shield', 'mace|tower', 'dagger|buckler', 'claw|-', 'staff|-', 'wand|orb', 'bow|quiver', 'crossbow|-', 'javelin|buckler'];
  const arts = ['fighter', 'thief', 'magician', 'valkyrie'];
  const K = 5, CW = 22 * K, CH = 24 * K;
  const cv = document.createElement('canvas'); cv.width = combos.length * CW + 20; cv.height = arts.length * CH + 40;
  cv.style.cssText = 'position:fixed;left:0;top:0;z-index:98;background:#2a2420';
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  g.fillStyle = '#ddd'; g.font = '12px monospace';
  combos.forEach((c, i) => g.fillText(c || 'painted', 10 + i * CW, 14));
  arts.forEach((a, r) => combos.forEach((c, i) => {
    const s = BD.view.sprites.get(a, 'idle', 0, { doll: c });
    if (s) g.drawImage(s.canvas, 10 + i * CW + (CW - s.w * K) / 2, 24 + r * CH, s.w * K, s.h * K);
  }));
  document.body.appendChild(cv);
};
