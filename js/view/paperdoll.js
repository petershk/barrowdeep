// @ts-check
// Paper-doll lite (07 §2.2): each class sprite has its painted weapon/offhand erased, then overlay
// grids for the equipped weapon category and offhand are composited at bake time. The sprite cache
// keys on the doll string, so each equipment combination bakes once. Overlay grids use digit keys
// (never used by class palettes) so they can share the class palette.
(function (BD) {
  'use strict';

  const PAL = {
    1: '#c8ced8', 2: '#7a8290', 3: '#f4f6fa', 4: '#d2a73f', 5: '#7a5130',
    6: '#4a3015', 7: '#ffd75a', 8: '#fff3cf', 9: '#e8e0c8', 0: '#b23a2c',
  };

  /** per class art: rects to erase {x0,x1,y0,y1} for the painted weapon / offhand, and hand anchors */
  const CLASS = {
    fighter: { weapon: [[11, 13, 10, 16]], offhand: [[0, 4, 10, 15]], hand: [12, 12], off: [2, 12] },
    thief: { weapon: [[11, 12, 11, 13]], offhand: [], hand: [11, 12], off: [2, 11] },
    magician: { weapon: [[13, 15, 5, 19], [12, 12, 5, 5]], offhand: [], hand: [14, 14], off: [2, 15] },
    valkyrie: { weapon: [[12, 16, 3, 10]], offhand: [], hand: [13, 8], off: [1, 10] },
  };

  // weapon overlays, drawn upright; g = grip row
  const WEAPON = {
    blade: { g: 7, rows: ['..K..', '.K3K.', '.K1K.', '.K1K.', '.K1K.', '.K1K.', 'K444K', '.K5K.', '.K4K.', '..K..'] },
    blade2: {
      g: 9,
      rows: ['..K..', '.K3K.', '.K1K.', '.K1K.', '.K1K.', '.K1K.', '.K1K.', '.K1K.', 'K444K', '.K5K.', '.K5K.', '.K4K.', '..K..'],
    },
    axe: { g: 7, rows: ['KKK.', 'K11K', 'K15K', 'K11K', 'KK5K', '.K5K', '.K5K', '.K5K', '.K5K', '..K.'] },
    mace: { g: 6, rows: ['.KKK.', 'K212K', 'K121K', '.KKK.', '.K5K.', '.K5K.', '.K5K.', '.K5K.', '..K..'] },
    dagger: { g: 5, rows: ['..K..', '.K3K.', '.K1K.', '.K1K.', 'K444K', '.K5K.', '..K..'] },
    claw: { g: 4, rows: ['K.K.K', 'K3K3K', 'K1K1K', 'K444K', '.K5K.', '..K..'] },
    staff: { g: 8, rows: ['.KK.', 'K78K', 'K77K', '.KK.', '.K5K', '.K5K', '.K5K', '.K5K', '.K5K', '.K5K', '.K5K', '.K6K', '.K6K', '..K.'] },
    wand: { g: 5, rows: ['.K.', 'K8K', 'K7K', '.K.', 'K6K', 'K6K', 'K6K', '.K.'] },
    bow: { g: 5, rows: ['..K..', '.K5K.', 'K5K9.', 'K5K.9', 'K5K.9', 'K5K.9', 'K5K.9', 'K5K.9', 'K5K9.', '.K5K.', '..K..'] },
    crossbow: { g: 4, rows: ['KK...KK', 'K1KKK1K', '.K151K.', '..K5K..', '..K5K..', '..K5K..', '...K...'] },
    javelin: { g: 8, rows: ['.K.', 'K3K', 'K1K', '.K.', 'K5K', 'K5K', 'K5K', 'K5K', 'K5K', 'K5K', 'K5K', 'K5K', '.K.'] },
  };
  // offhand overlays; g = centre row
  const OFFHAND = {
    buckler: { g: 2, rows: ['.KKK.', 'K030K', 'K343K', 'K030K', '.KKK.'] },
    shield: { g: 3, rows: ['KKKKK', 'K000K', 'K030K', 'K434K', 'K030K', '.K0K.', '..K..'] },
    tower: { g: 4, rows: ['KKKKK', 'K000K', 'K030K', 'K030K', 'K434K', 'K030K', 'K030K', 'K000K', '.KKK.'] },
    orb: { g: 1, rows: ['.KK.', 'K87K', 'K77K', '.KK.'] },
    quiver: { g: 3, rows: ['K9.9', 'K5K.', 'K5K.', 'K5K.', 'K6K.', '.K..'] },
  };

  /** the doll key for an entity, or '' when it shows its default painted gear */
  function dollOf(e) {
    if (e.kind !== 'player' || !e.equip) return '';
    const B = BD.data.bases;
    const w = e.equip.weapon && B[e.equip.weapon.base], o = e.equip.offhand && B[e.equip.offhand.base];
    let wk = w ? (w.category === 'blade' && w.hands === 2 ? 'blade2' : w.category) : '-';
    if (!WEAPON[wk]) wk = '-';
    let ok = '-';
    if (o) ok = o.id === 'buckler' ? 'buckler' : o.id === 'tower' ? 'tower' : o.category === 'shield' ? 'shield' : o.category || '-';
    if (!OFFHAND[ok]) ok = '-';
    return wk + '|' + ok;
  }

  function stamp(rows, ov, ax, ay, cx) {
    const h = rows.length, w = rows[0].length;
    const top = ay - ov.g, left = ax - Math.floor(ov.rows[0].length / 2) + (cx || 0);
    for (let r = 0; r < ov.rows.length; r++) {
      const y = top + r;
      if (y < 0 || y >= h) continue;
      const src = ov.rows[r];
      for (let c = 0; c < src.length; c++) {
        const ch = src[c], x = left + c;
        if (ch === '.' || x < 0 || x >= w) continue;
        rows[y][x] = ch;
      }
    }
  }

  /** composite a class idle grid for a doll key; unknown classes pass through */
  function compose(artId, grid, key) {
    const cl = CLASS[artId];
    if (!cl || !key) return grid;
    const [wk, ok] = key.split('|');
    const rows = grid.map((r) => r.split(''));
    const erase = (rects) => {
      for (const [x0, x1, y0, y1] of rects) {
        for (let y = y0; y <= y1 && y < rows.length; y++) {
          for (let x = x0; x <= x1 && x < rows[y].length; x++) rows[y][x] = '.';
        }
      }
    };
    erase(cl.weapon);
    if (ok !== '-' || artId === 'fighter') erase(cl.offhand);
    if (ok !== '-') stamp(rows, OFFHAND[ok], cl.off[0], cl.off[1]);
    if (wk !== '-') stamp(rows, WEAPON[wk], cl.hand[0], cl.hand[1]);
    return rows.map((r) => r.join(''));
  }

  BD.view.paperdoll = { PAL, CLASS, WEAPON, OFFHAND, dollOf, compose };
})(globalThis.BD);
