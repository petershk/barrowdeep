// A gallery of the hero's gear by rarity: rows are the four classes, columns common / magic / rare / legendary
// kits, each drawn large with its doll colours, shapes and gear effects (gear_fx.js) at one moment in time.
// Cells are CELL_W × CELL_H from the top-left, so tools can cut the sheet into single portraits.
BD.debug.galleryKits = (w) => {
  const make = (base, rarity, affixes) => BD.sim.items.make(w, base, 20, rarity, affixes || []);
  const leg = (id) => {
    const L = BD.data.legendaries[id];
    return BD.sim.items.make(w, L.base, 20, 'legendary', [], { legendary: id, name: L.name });
  };
  const el = (id) => [{ id, roll: 0.8 }];
  const KITS = {
    fighter: [
      { weapon: make('short_sword', 'common'), offhand: make('buckler', 'common'), chest: make('leather', 'common') },
      { weapon: make('long_sword', 'magic'), offhand: make('kite', 'magic'), chest: make('studded', 'magic'),
        helm: make('cap', 'magic'), cloak: make('cloak', 'magic'), amulet: make('amulet', 'magic') },
      { weapon: make('long_sword', 'rare', el('fire_add')), offhand: make('kite', 'rare'), chest: make('chain', 'rare'),
        helm: make('helm', 'rare'), cloak: make('heavy_cloak', 'rare'), amulet: make('amulet', 'rare'), ring1: make('ring', 'rare') },
      { weapon: leg('worldcleaver'), chest: leg('aegis_of_the_fallen'), helm: leg('bloodhowl_helm'), cloak: leg('mantle_of_souls'),
        amulet: leg('heart_of_the_barrow'), ring1: leg('band_of_ages') },
    ],
    assassin: [
      { weapon: make('katar', 'common'), chest: make('leather', 'common') },
      { weapon: make('wrist_blade', 'magic'), chest: make('studded', 'magic'), helm: make('cap', 'magic'), cloak: make('cloak', 'magic') },
      { weapon: make('wrist_blade', 'rare', el('pois_add')), chest: make('chain', 'rare'), helm: make('helm', 'rare'),
        cloak: make('heavy_cloak', 'rare'), ring1: make('ring', 'rare') },
      { weapon: leg('nightspur'), chest: leg('ashen_wraps'), helm: leg('crown_of_embers'), cloak: leg('veilweave'),
        amulet: leg('gearheart') },
    ],
    magician: [
      { weapon: make('quarterstaff', 'common'), chest: make('robe', 'common') },
      { weapon: make('wand', 'magic'), offhand: make('orb', 'magic'), chest: make('robe', 'magic'), cloak: make('cloak', 'magic'),
        amulet: make('amulet', 'magic') },
      { weapon: make('battle_staff', 'rare', el('light_add')), chest: make('robe', 'rare'), helm: make('cap', 'rare'),
        cloak: make('heavy_cloak', 'rare'), amulet: make('amulet', 'rare'), ring1: make('ring', 'rare') },
      { weapon: leg('phoenix_quill'), offhand: leg('frostbinder'), chest: leg('cinderveil'), cloak: leg('tempters_cloak'),
        amulet: leg('lantern_of_the_lost') },
    ],
    valkyrie: [
      { weapon: make('short_bow', 'common'), offhand: make('quiver', 'common'), chest: make('leather', 'common') },
      { weapon: make('hunting_bow', 'magic'), offhand: make('quiver', 'magic'), chest: make('studded', 'magic'),
        helm: make('cap', 'magic'), cloak: make('cloak', 'magic') },
      { weapon: make('war_bow', 'rare', el('cold_add')), offhand: make('quiver', 'rare'), chest: make('chain', 'rare'),
        helm: make('helm', 'rare'), cloak: make('heavy_cloak', 'rare'), ring1: make('ring', 'rare') },
      { weapon: leg('featherfall'), offhand: leg('eagles_talon'), chest: make('plate', 'legendary'),
        helm: make('great_helm', 'legendary'), cloak: leg('galewing_mantle'), amulet: leg('ferrymans_coin') },
    ],
  };
  return KITS;
};

BD.debug.autotests.gallery = (D) => {
  const w = D.newRun({ cls: 'fighter', seed: 'gallery' });
  const CELL_W = 300, CELL_H = 320, K = 11;
  const KITS = BD.debug.galleryKits(w);
  const tq = /[?&]t=(\d+)/.exec(location.search);
  const t0 = tq ? Number(tq[1]) : 700;      // ?t=<ms>: the moment the gear effects are frozen at
  const classes = Object.keys(KITS);
  const cv = document.createElement('canvas');
  cv.width = CELL_W * 4;
  cv.height = CELL_H * classes.length;
  cv.style.cssText = 'position:fixed;left:0;top:0;z-index:98;background:#14100d';
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#14100d';
  g.fillRect(0, 0, cv.width, cv.height);
  classes.forEach((cls, r) => KITS[cls].forEach((kit, c) => {
    const e = { id: 90000 + r * 10 + c, kind: 'player', cls, dead: false, equip: Object.assign({}, kit) };
    const art = BD.view.entities.artOf(e);
    const spr = BD.view.sprites.get(art, 'idle', 0, { doll: BD.view.paperdoll.dollOf(e), rim: true });
    if (!spr) return;
    const cx = c * CELL_W + CELL_W / 2, floorY = r * CELL_H + CELL_H - 40;
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.beginPath();
    g.ellipse(cx, floorY, 70, 18, 0, 0, Math.PI * 2);
    g.fill();
    const box = { x: Math.round(cx - (spr.w * K) / 2), y: floorY - spr.h * K + 6, w: spr.w * K, h: spr.h * K };
    g.drawImage(spr.canvas, box.x, box.y, box.w, box.h);
    BD.view.gearFx.draw(g, w, e, null, null, t0 + r * 97 + c * 31, box);
  }));
  document.body.appendChild(cv);
};
