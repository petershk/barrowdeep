// @ts-check
// Paper-doll (07 §2.2): the hero shows what they wear. Each class sprite has its painted weapon/offhand erased,
// then overlay grids for the equipped weapon category, offhand, helm and cloak are composited at bake time,
// and the class palette is recoloured by the body armour's material and each item's rarity. The sprite
// cache keys on the doll string, so each equipment combination bakes once.
// Overlay grids use keys no class palette uses: digits, and the letters below.
//   V blade · U guard (weapon)       E e helm metal light / dark     C c cloak cloth light / dark
//   T rarity trim (helm crown, cloak hem)  M shoulder plate  J amulet
(function (BD) {
  'use strict';

  const PAL = {
    1: '#c8ced8', 2: '#7a8290', 3: '#f4f6fa', 4: '#d2a73f', 5: '#7a5130',
    6: '#4a3015', 7: '#ffd75a', 8: '#fff3cf', 9: '#e8e0c8', 0: '#b23a2c',
    V: '#c8ced8', U: '#d2a73f', E: '#9aa2ae', e: '#5e646e', C: '#4a5640', c: '#2e3628', T: '#d2a73f',
    M: '#c4cad4', J: '#d2a73f',
  };

  /** per class art: rects to erase {x0,x1,y0,y1} for the painted weapon / offhand, hand anchors, where a helm
   *  sits (top-left of an 8-wide overlay, plus painted headgear to clear first), where a cloak hangs from
   *  (its top-left and length), and which palette keys are the body armour (light, dark, darker) and trim */
  const CLASS = {
    fighter: {
      weapon: [[11, 13, 10, 16]], offhand: [[0, 4, 10, 15]], hand: [12, 12], off: [2, 12],
      helm: [4, 2], hat: [[4, 11, 0, 1]], cloak: [1, 9, 10], body: ['s', 'd'], trim: ['G', 'g'],
      shoulders: [[5, 9], [11, 9]], neck: [7, 8],
    },
    thief: {
      weapon: [[11, 12, 11, 13]], offhand: [], hand: [11, 12], off: [2, 11],
      helm: [3, 0], hat: [], cloak: [0, 8, 9], body: ['H', 'h'], trim: ['G'],
      shoulders: [[2, 8], [10, 8]], neck: [6, 7],
    },
    magician: {
      weapon: [[13, 15, 5, 19], [12, 12, 5, 5]], offhand: [], hand: [14, 14], off: [2, 15],
      helm: [3, 4], hat: [[2, 11, 0, 7]], cloak: [0, 7, 12], body: ['P', 'p', 'q'], trim: ['Y'],
      shoulders: [[4, 13], [9, 13]], neck: [6, 13],
    },
    valkyrie: {
      weapon: [[12, 16, 3, 10]], offhand: [], hand: [13, 8], off: [1, 10],
      helm: [3, 0], hat: [[5, 7, 0, 2]], cloak: [0, 7, 10], body: ['A', 'a'], trim: ['G', 'g'],
      shoulders: [[3, 7], [9, 7]], neck: [6, 7],
    },
  };

  // weapon overlays, drawn upright; g = grip row
  const WEAPON = {
    blade: { g: 7, rows: ['..K..', '.K3K.', '.KVK.', '.KVK.', '.KVK.', '.KVK.', 'KUUUK', '.K5K.', '.KUK.', '..K..'] },
    blade2: {
      g: 9,
      rows: ['..K..', '.K3K.', '.KVK.', '.KVK.', '.KVK.', '.KVK.', '.KVK.', '.KVK.', 'KUUUK', '.K5K.', '.K5K.', '.KUK.', '..K..'],
    },
    axe: { g: 7, rows: ['KKK.', 'KVVK', 'KV5K', 'KVVK', 'KK5K', '.K5K', '.K5K', '.K5K', '.K5K', '..K.'] },
    mace: { g: 6, rows: ['.KKK.', 'K2V2K', 'KV2VK', '.KKK.', '.K5K.', '.K5K.', '.KUK.', '.K5K.', '..K..'] },
    dagger: { g: 5, rows: ['..K..', '.K3K.', '.KVK.', '.KVK.', 'KUUUK', '.K5K.', '..K..'] },
    claw: { g: 4, rows: ['K.K.K', 'K3K3K', 'KVKVK', 'KUUUK', '.K5K.', '..K..'] },
    staff: { g: 8, rows: ['.KK.', 'K78K', 'K77K', '.KK.', '.KUK', '.K5K', '.K5K', '.K5K', '.K5K', '.K5K', '.K5K', '.K6K', '.K6K', '..K.'] },
    wand: { g: 5, rows: ['.K.', 'K8K', 'K7K', '.K.', 'KUK', 'K6K', 'K6K', '.K.'] },
    bow: { g: 5, rows: ['..K..', '.K5K.', 'K5K9.', 'KUK.9', 'K5K.9', 'K5K.9', 'K5K.9', 'KUK.9', 'K5K9.', '.K5K.', '..K..'] },
    crossbow: { g: 4, rows: ['KK...KK', 'KVKKKVK', '.K5U5K.', '..K5K..', '..K5K..', '..K5K..', '...K...'] },
    javelin: { g: 8, rows: ['.K.', 'K3K', 'KVK', '.K.', 'KUK', 'K5K', 'K5K', 'K5K', 'K5K', 'K5K', 'K5K', 'K5K', '.K.'] },
  };
  // offhand overlays; g = centre row
  const OFFHAND = {
    buckler: { g: 2, rows: ['.KKK.', 'K030K', 'K343K', 'K030K', '.KKK.'] },
    shield: { g: 3, rows: ['KKKKK', 'K000K', 'K030K', 'K434K', 'K030K', '.K0K.', '..K..'] },
    tower: { g: 4, rows: ['KKKKK', 'K000K', 'K030K', 'K030K', 'K434K', 'K030K', 'K030K', 'K000K', '.KKK.'] },
    orb: { g: 1, rows: ['.KK.', 'K87K', 'K77K', '.KK.'] },
    quiver: { g: 3, rows: ['K9.9', 'K5K.', 'K5K.', 'K5K.', 'K6K.', '.K..'] },
  };
  // helms, 8 wide, over the head ('.' lets the face show through)
  const HELM = {
    cap: ['..KKKK..', '.KeEEeK.', 'KeEEEEeK', 'KKKKKKKK'],
    helm: ['..KKKK..', '.KEEEEK.', 'KEEEEEEK', 'KEKEEKEK', 'KE.ee.EK', '.K....K.'],
    great_helm: ['.KKKKKK.', 'KEEEEEEK', 'KEEEEEEK', 'KKKKKKKK', 'KEeEEeEK', 'KEEEEEEK', '.KeeeeK.'],
  };
  const CROWN = '.KTTTTK.';      // a rare or better helm's top row: a band of its rarity colour

  /** body armour by base: [light, dark] cloth or metal; a robe keeps the class's own colours */
  const CHEST = {
    leather: ['#7a5432', '#4e3420'], studded: ['#6a4c32', '#40301e'], chain: ['#8e949c', '#585e66'],
    splint: ['#9aa0aa', '#5c626c'], plate: ['#c4cad4', '#7a808c'],
  };
  const HELM_METAL = { cap: ['#6e5a44', '#46382a'], helm: ['#9aa2ae', '#5e646e'], great_helm: ['#c0c6d0', '#767c88'] };
  const CLOAK = { cloak: ['#4a5640', '#2e3628'], heavy_cloak: ['#5c2c20', '#381a12'] };
  const RARITY = BD.view.palette.RARITY;
  const RANK = { common: 0, magic: 1, rare: 2, legendary: 3 };
  /** elemental "adds" on a weapon tint its blade; the strongest one wins */
  const ELEMENT_AFFIX = { fire_add: 'fire', cold_add: 'cold', light_add: 'storm', pois_add: 'poison' };
  const BLADE_TINT = { fire: '#ffb27a', cold: '#c4f6ff', storm: '#c8d2ff', poison: '#c4ee98' };

  /** body armour texture by material: chain rings, studs, splint bands; heavy armour also has shoulder plates */
  const TEXTURE = {
    studded: (x, y) => ((x + y * 2) % 4 === 0 ? '2' : null),
    chain: (x, y) => ((x + y) % 2 === 0 ? 'dark' : null),
    splint: (x, y) => (y % 2 === 0 ? 'dark' : null),
  };
  const PAULDRON = ['KMK', 'MMM'];
  const HEAVY = { splint: true, plate: true };

  /** Every legendary has its own look: palette keys for its slot's overlay (or a body armour colour pair) and
   *  the school its effect sheds (gear_fx.js). Its signature replaces its rarity colour. */
  const LEGEND = {
    holy_mace: { pal: { V: '#fff4c8', U: '#ffd75a' }, fx: 'holy' },
    worldcleaver: { pal: { V: '#e4e8f0', U: '#7a1208' }, fx: 'blood' },
    gorefeast: { pal: { V: '#d05040', U: '#5a1008' }, fx: 'blood' },
    thundermaul: { pal: { V: '#c8d2ff', U: '#4a50e0' }, fx: 'storm' },
    ironbrand: { pal: { V: '#ffb070', U: '#c8300f' }, fx: 'fire' },
    wormtongue: { pal: { V: '#b0e070', U: '#3d7a1a' }, fx: 'poison' },
    marrowfang: { pal: { V: '#f0e8d4', U: '#8a8070' }, fx: 'bone' },
    nightspur: { pal: { V: '#c070a0', U: '#2a0a24' }, fx: 'shadow' },
    stormcaller: { pal: { 7: '#9fb0ff', 8: '#f6f8ff', U: '#4a50e0' }, fx: 'storm' },
    voice_of_the_storm: { pal: { 7: '#9fb0ff', 8: '#f6f8ff', U: '#4a50e0' }, fx: 'storm' },
    frostbinder: { pal: { 7: '#7fe8ff', 8: '#f4fdff' }, fx: 'cold' },
    rimeheart: { pal: { 7: '#4ac0e8', 8: '#f4fdff' }, fx: 'cold' },
    phoenix_quill: { pal: { 7: '#ff8a2a', 8: '#fff2b0', U: '#c8300f' }, fx: 'fire' },
    featherfall: { pal: { 9: '#fffaf0', U: '#ffd75a' }, fx: 'holy' },
    skyrender: { pal: { 9: '#d8f0ff', U: '#7fe8ff' }, fx: 'steel' },
    eagles_talon: { pal: { 9: '#ffd75a', 5: '#8a5a20' }, fx: 'holy' },
    wingbreaker: { pal: { V: '#cfd6e0', U: '#2a2a3a' }, fx: 'steel' },
    oathspear: { pal: { V: '#fffbe0', U: '#ffd75a' }, fx: 'holy' },
    bishops_bulwark: { pal: { 0: '#e8e0c8', 3: '#ffd75a', 4: '#ffd75a' }, fx: 'holy' },
    aegis_of_the_fallen: { chest: ['#d8c88a', '#8a7440'], fx: 'holy' },
    ashen_wraps: { chest: ['#5a5450', '#36322e'], fx: 'fire' },
    cinderveil: { chest: ['#5a1c12', '#341008'], fx: 'fire' },
    crown_of_embers: { pal: { E: '#e8a040', e: '#a04818', T: '#ff8a2a' }, fx: 'fire' },
    bloodhowl_helm: { pal: { E: '#8a2a20', e: '#4a120c', T: '#c0341c' }, fx: 'blood' },
    tempters_cloak: { pal: { C: '#4a1a40', c: '#2a0a24' }, fx: 'shadow' },
    mantle_of_souls: { pal: { C: '#3e2a66', c: '#24163e' }, fx: 'portal' },
    gravewalkers_shroud: { pal: { C: '#6a7078', c: '#40464e' }, fx: 'dust' },
    veilweave: { pal: { C: '#22222c', c: '#121218' }, fx: 'shadow' },
    galewing_mantle: { pal: { C: '#d8e0ea', c: '#9aa8b8' }, fx: 'steel' },
    ferrymans_coin: { pal: { J: '#e8c050' }, fx: 'gold' },
    lantern_of_the_lost: { pal: { J: '#fff2b0' }, fx: 'holy' },
    choirbreaker: { pal: { J: '#cfd6e0' }, fx: 'steel' },
    heart_of_the_barrow: { pal: { J: '#c0341c' }, fx: 'blood' },
    gearheart: { pal: { J: '#ffd23a' }, fx: 'gold' },
    band_of_ages: { fx: 'gold' },
    ossuary_seal: { fx: 'bone' },
  };

  /** offhand art key: bucklers and tower shields have their own art, other shields share one */
  function offhandKind(o) {
    if (o.id === 'buckler' || o.id === 'tower') return o.id;
    if (o.category === 'shield') return 'shield';
    return o.category || '-';
  }

  /** the weapon's strongest elemental add, or '-' */
  function elementOf(item) {
    let best = '-', bv = 0;
    for (const a of (item && item.affixes) || []) {
      const el = ELEMENT_AFFIX[a.id];
      const v = a.roll || 1;
      if (el && v > bv) {
        best = el;
        bv = v;
      }
    }
    return best;
  }

  const SLOTS = ['weapon', 'offhand', 'chest', 'helm', 'cloak', 'amulet', 'ring1', 'ring2'];
  /** a legendary's id when it has a signature look, else '-' */
  const legOf = (item) => (item && item.legendary && LEGEND[item.legendary] ? item.legendary : '-');
  /** the first legendary ring with a signature, else '-' */
  function ringLeg(eq) {
    const a = legOf(eq.ring1);
    return a !== '-' ? a : legOf(eq.ring2);
  }
  /** the better ring's rarity, or '-' with no ring */
  function bestRing(eq) {
    const rs = [eq.ring1, eq.ring2].filter(Boolean);
    if (!rs.length) return '-';
    return rs.map(rarityOf).sort((a, b) => RANK[b] - RANK[a])[0];
  }
  /** an id the doll has art for, else '-' */
  const known = (table, id) => (table[id] ? id : '-');
  const rarityOf = (item) => (item && RANK[item.rarity] !== undefined ? item.rarity : 'common');

  /** view-side cache per entity (never on the sim object: saves serialise the player) */
  const gearCache = new WeakMap();
  /** what a hero wears, read once per equipment change (the doll key and gear_fx.js both use it) */
  function gearOf(e) {
    const eq = e.equip, Bases = BD.data.bases;
    const sig = SLOTS.map((s) => (eq[s] ? eq[s].uid : '')).join(',');
    const had = gearCache.get(e);
    if (had && had.sig === sig) return had;
    const w = eq.weapon && Bases[eq.weapon.base], o = eq.offhand && Bases[eq.offhand.base];
    let wk = '-';
    if (w) wk = w.category === 'blade' && w.hands === 2 ? 'blade2' : w.category;
    if (!WEAPON[wk]) wk = '-';
    let ok = '-';
    if (o) ok = offhandKind(o);
    if (!OFFHAND[ok]) ok = '-';
    const base = (s) => (eq[s] ? eq[s].base : '-');
    const g = {
      sig, wk, ok, chest: base('chest'), helm: known(HELM, base('helm')), cloak: known(CLOAK, base('cloak')),
      wRar: rarityOf(eq.weapon), oRar: rarityOf(eq.offhand), cRar: rarityOf(eq.chest), hRar: rarityOf(eq.helm),
      kRar: rarityOf(eq.cloak), elem: elementOf(eq.weapon), aRar: eq.amulet ? rarityOf(eq.amulet) : '-',
      rRar: bestRing(eq), wLeg: legOf(eq.weapon), oLeg: legOf(eq.offhand), cLeg: legOf(eq.chest), hLeg: legOf(eq.helm),
      kLeg: legOf(eq.cloak), aLeg: legOf(eq.amulet), rLeg: ringLeg(eq),
    };
    g.key = FIELDS.map((f) => g[f]).join('|');
    gearCache.set(e, g);
    return g;
  }

  /** the doll key for an entity, or '' when it shows its default painted gear */
  function dollOf(e) {
    if (e.kind !== 'player' || !e.equip) return '';
    return gearOf(e).key;
  }

  const FIELDS = ['wk', 'ok', 'chest', 'helm', 'cloak', 'wRar', 'oRar', 'cRar', 'hRar', 'kRar', 'elem',
    'aRar', 'rRar', 'wLeg', 'oLeg', 'cLeg', 'hLeg', 'kLeg', 'aLeg', 'rLeg'];
  /** item rarity fields default to common; an absent amulet or ring, and every other field, to '-' */
  const COMMON_BY_DEFAULT = { wRar: true, oRar: true, cRar: true, hRar: true, kRar: true };
  /** a doll key back into its parts; short keys ('blade|shield') leave the rest bare and common */
  function parse(key) {
    const parts = key.split('|'), d = {};
    FIELDS.forEach((f, i) => { d[f] = parts[i] || (COMMON_BY_DEFAULT[f] ? 'common' : '-'); });
    return d;
  }

  /** stamp an overlay; `under` only fills transparent cells (a cloak hangs behind the body) */
  function stamp(rows, ov, ax, ay, cx, under) {
    const h = rows.length, w = rows[0].length;
    const top = ay - ov.g, left = ax - Math.floor(ov.rows[0].length / 2) + (cx || 0);
    for (let r = 0; r < ov.rows.length; r++) {
      const y = top + r;
      if (y < 0 || y >= h) continue;
      const src = ov.rows[r];
      for (let c = 0; c < src.length; c++) {
        const ch = src[c], x = left + c;
        if (ch === '.' || x < 0 || x >= w) continue;
        if (under && rows[y][x] !== '.') continue;
        rows[y][x] = ch;
      }
    }
  }

  /** a cloak `len` rows long, widening toward the hem, its hem in the rarity trim */
  function cloakRows(len) {
    const rows = ['..KCC', '.KCCc'];
    for (let i = 2; i < len - 2; i++) rows.push(i % 3 === 0 ? 'KCCcc' : '.KCcc');
    rows.push('KTTTT', 'KKKKK');
    return rows;
  }

  /** the body armour's surface: only cells painted in the class's main body colour change */
  function texture(rows, cl, chest) {
    const fn = TEXTURE[chest];
    if (!fn) return;
    const dark = cl.body[1] || cl.body[0];
    for (let y = 0; y < rows.length; y++) {
      for (let x = 0; x < rows[y].length; x++) {
        if (rows[y][x] !== cl.body[0]) continue;
        const t = fn(x, y);
        if (t) rows[y][x] = t === 'dark' ? dark : t;
      }
    }
  }

  /** composite a class idle grid for a doll key; unknown classes pass through */
  function compose(artId, grid, key) {
    const cl = CLASS[artId];
    if (!cl || !key) return grid;
    const d = parse(key);
    const rows = grid.map((r) => r.split(''));
    const erase = (rects) => {
      for (const [x0, x1, y0, y1] of rects) {
        for (let y = y0; y <= y1 && y < rows.length; y++) {
          for (let x = x0; x <= x1 && x < rows[y].length; x++) rows[y][x] = '.';
        }
      }
    };
    erase(cl.weapon);
    if (d.ok !== '-' || artId === 'fighter') erase(cl.offhand);
    if (d.helm !== '-') {
      erase(cl.hat);
      const helm = HELM[d.helm].slice();
      if (RANK[d.hRar] >= RANK.rare) helm[0] = CROWN;
      stamp(rows, { g: 0, rows: helm }, cl.helm[0] + 4, cl.helm[1]);
    }
    texture(rows, cl, d.chest);
    if (HEAVY[d.chest]) for (const [sx, sy] of cl.shoulders) stamp(rows, { g: 0, rows: PAULDRON }, sx, sy);
    if (d.aRar !== '-') rows[cl.neck[1]][cl.neck[0]] = 'J';
    if (d.ok !== '-') stamp(rows, OFFHAND[d.ok], cl.off[0], cl.off[1]);
    if (d.wk !== '-') stamp(rows, WEAPON[d.wk], cl.hand[0], cl.hand[1]);
    if (d.cloak !== '-') {
      const [cx, cy, len] = cl.cloak;
      stamp(rows, { g: 0, rows: cloakRows(len) }, cx + 2, cy, 0, true);
    }
    return rows.map((r) => r.join(''));
  }

  /** a darker step of a colour, for the third body shade */
  const darker = (hex) => BD.view.palette.shade(hex, 0.7);

  /** palette overrides for a doll key: body armour material, rarity trims, helm metal, cloak cloth, blade */
  function palFor(artId, key) {
    const cl = CLASS[artId];
    if (!cl || !key) return null;
    const d = parse(key), p = {};
    const legChest = d.cLeg !== '-' && LEGEND[d.cLeg].chest;
    const chest = legChest || CHEST[d.chest];
    if (chest && !(d.chest === 'leather' && d.cRar === 'common')) {
      p[cl.body[0]] = chest[0];
      if (cl.body[1]) p[cl.body[1]] = chest[1];
      if (cl.body[2]) p[cl.body[2]] = darker(chest[1]);
    }
    if (RANK[d.cRar] >= RANK.magic) {
      p[cl.trim[0]] = RARITY[d.cRar];
      if (cl.trim[1]) p[cl.trim[1]] = darker(RARITY[d.cRar]);
    }
    const hm = HELM_METAL[d.helm];
    if (hm) Object.assign(p, { E: hm[0], e: hm[1] });
    if (d.hRar === 'legendary') Object.assign(p, { E: '#e8c060', e: '#a07828' });
    p.T = RANK[d.hRar] >= RANK.rare ? RARITY[d.hRar] : PAL.T;
    const ck = CLOAK[d.cloak];
    if (ck) Object.assign(p, { C: ck[0], c: ck[1] });
    if (RANK[d.kRar] >= RANK.magic && d.helm === '-') p.T = RARITY[d.kRar];
    if (RANK[d.wRar] >= RANK.magic) p.U = RARITY[d.wRar];
    if (BLADE_TINT[d.elem]) p.V = BLADE_TINT[d.elem];
    if (RANK[d.oRar] >= RANK.magic) p[4] = RARITY[d.oRar];
    p.M = chest ? BD.view.palette.shade(chest[0], 1.1) : PAL.M;
    if (d.aRar !== '-') p.J = RARITY[d.aRar];
    for (const f of ['wLeg', 'oLeg', 'hLeg', 'kLeg', 'aLeg']) {
      const L = d[f] !== '-' && LEGEND[d[f]];
      if (L && L.pal) Object.assign(p, L.pal);
    }
    return p;
  }

  BD.view.paperdoll = { PAL, CLASS, WEAPON, OFFHAND, HELM, LEGEND, dollOf, gearOf, compose, palFor, parse, RANK };
})(globalThis.BD);
