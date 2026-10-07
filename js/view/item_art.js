// @ts-check
// 12×12 item icons by category (07 §2.2). Shared palette: S steel, s steel shadow, W wood, w wood
// shadow, G gold, g gold shadow, L leather, l leather shadow, C cloth, c cloth shadow, R gem, B blue.
(function (BD) {
  'use strict';
  const A = BD.view.art;
  const PAL = {
    S: '#d0d6de', s: '#7c8694', W: '#9a6a3a', w: '#5e3c1a', G: '#e8c050', g: '#9a7420', L: '#8a5a30', l: '#5a3818',
    C: '#6a5a8a', c: '#40345a', R: '#d03040', B: '#5aa0ff', P: '#c0a0ff', F: '#e02020', f: '#801010', X: '#e8e0c8'
  };
  const icon = (id, rows) => { A['item_' + id] = { pal: PAL, frames: { idle: [rows] }, prop: true }; };

  icon('blade', [
    '..........KS',
    '.........KSs',
    '........KSsK',
    '.......KSsK.',
    '......KSsK..',
    '.....KSsK...',
    '..K.KSsK....',
    '..KKSsK.....',
    '...KGK......',
    '..KgKG......',
    '.KWK.Kg.....',
    'KwK.........'
  ]);
  icon('axe', [
    '......KKKK..',
    '.....KSSSsK.',
    '....KWKSSssK',
    '...KWK.KSssK',
    '..KWK...KSK.',
    '.KWK.....K..',
    'KWK.........',
    'Kw..........',
    '............',
    '............',
    '............',
    '............'
  ]);
  icon('mace', [
    '.......KKK..',
    '......KSSSK.',
    '.....KSsSsSK',
    '......KSSsK.',
    '.....KWKKK..',
    '....KWK.....',
    '...KWK......',
    '..KWK.......',
    '.KWK........',
    'KwK.........',
    '............',
    '............'
  ]);
  icon('dagger', [
    '............',
    '.........KK.',
    '........KSK.',
    '.......KSsK.',
    '......KSsK..',
    '.....KSsK...',
    '...KKSsK....',
    '...KGsK.....',
    '..KgKG......',
    '.KLK.K......',
    '.KlK........',
    '..K.........'
  ]);
  icon('claw', [
    '............',
    '.K..K..K....',
    'KSK.KSK.KS..',
    '.KSK.KSK.KS.',
    '..KSKKSKKSK.',
    '...KGGGGGK..',
    '...KLLLLLK..',
    '...KlllllK..',
    '....KKKKK...',
    '............',
    '............',
    '............'
  ]);
  icon('staff', [
    '.........KK.',
    '........KBBK',
    '........KBBK',
    '.......KWKK.',
    '......KWK...',
    '.....KWK....',
    '....KWK.....',
    '...KWK......',
    '..KWK.......',
    '.KWK........',
    'KwK.........',
    'KK..........'
  ]);
  icon('wand', [
    '............',
    '........KK..',
    '.......KPPK.',
    '.......KPPK.',
    '......KXKK..',
    '.....KXK....',
    '....KXK.....',
    '...KwK......',
    '..KwK.......',
    '..KK........',
    '............',
    '............'
  ]);
  icon('bow', [
    '....KKK.....',
    '...KWwK.....',
    '..KWK.X.....',
    '.KWK..X.....',
    '.KWK...X....',
    'KWK....X....',
    'KWK....X....',
    '.KWK...X....',
    '.KWK..X.....',
    '..KWK.X.....',
    '...KWwK.....',
    '....KKK.....'
  ]);
  icon('crossbow', [
    '............',
    '.KK......KK.',
    'KWwK....KwWK',
    '.KXXXXXXXXK.',
    '.....KSK....',
    '.....KWK....',
    '.....KWK....',
    '.....KWK....',
    '....KWwK....',
    '....KKKK....',
    '............',
    '............'
  ]);
  icon('javelin', [
    '..........K.',
    '.........KSK',
    '........KSsK',
    '.......KWKK.',
    '......KWK...',
    '.....KWK....',
    '....KWK.....',
    '...KWK......',
    '..KWK.......',
    '.KWK........',
    'KWK.........',
    'KK..........'
  ]);
  icon('shield', [
    '..KKKKKKKK..',
    '.KSSSSSSssK.',
    '.KSGGGGGGsK.',
    '.KSGRRRRGsK.',
    '.KSGRRRRGsK.',
    '.KSGGGGGGsK.',
    '..KSSSSSsK..',
    '..KSSSSSsK..',
    '...KSSSsK...',
    '....KSsK....',
    '.....KK.....',
    '............'
  ]);
  icon('orb', [
    '............',
    '....KKKK....',
    '...KBBPPK...',
    '..KBXBBPPK..',
    '..KBBBBPPK..',
    '..KBBBPPPK..',
    '...KBPPPK...',
    '....KKKK....',
    '...KGGGGK...',
    '..KgGGGGgK..',
    '...KKKKKK...',
    '............'
  ]);
  icon('quiver', [
    '..K.K.K.....',
    '.KXKXKXK....',
    '..KSKSKS....',
    '..KLLLLK....',
    '..KLlLLK....',
    '..KLLLLK....',
    '..KLlLLK....',
    '..KLLLLK....',
    '..KLlLLK....',
    '..KLLLLK....',
    '...KKKK.....',
    '............'
  ]);
  icon('armour', [
    '..KK....KK..',
    '.KSSK..KSSK.',
    'KSSSSKKSSSSK',
    'KSsSSSSSSsSK',
    '.KKSSSSSSKK.',
    '..KSSGGSSK..',
    '..KSSSSSSK..',
    '..KSsSSsSK..',
    '..KSSSSSSK..',
    '..KSsSSsSK..',
    '..KKKKKKKK..',
    '............'
  ]);
  icon('helm', [
    '............',
    '....KKKK....',
    '...KSSSSK...',
    '..KSSSSSSK..',
    '..KSSSSSSK..',
    '..KSKKKKSK..',
    '..KSKssKSK..',
    '..KSSKKSSK..',
    '...KKSSKK...',
    '....KKKK....',
    '............',
    '............'
  ]);
  icon('cloak', [
    '....KKKK....',
    '...KCCCCK...',
    '..KCcGGcCK..',
    '..KCCCCCCK..',
    '.KCCcCCcCCK.',
    '.KCCCCCCCCK.',
    '.KCcCCCCcCK.',
    'KCCCCCCCCCCK',
    'KCcCCCCCCcCK',
    'KCCCCCCCCCCK',
    '.KKKKKKKKKK.',
    '............'
  ]);
  icon('amulet', [
    '..KK....KK..',
    '.KG.K..K.GK.',
    '.KG..KK..GK.',
    '..KG....GK..',
    '...KG..GK...',
    '....KGGK....',
    '...KGRRGK...',
    '...KRRRRK...',
    '...KGRRGK...',
    '....KKKK....',
    '............',
    '............'
  ]);
  icon('ring', [
    '............',
    '............',
    '.....KK.....',
    '....KRRK....',
    '...KGKKGK...',
    '..KGK..KGK..',
    '..KG....GK..',
    '..KG....GK..',
    '..KGK..KgK..',
    '...KGGggK...',
    '....KKKK....',
    '............'
  ]);
  icon('gold', [
    '............',
    '............',
    '............',
    '.....KK.....',
    '....KGGK....',
    '...KGgGGK...',
    '..KGGKKgGK..',
    '.KGgKGGKGGK.',
    'KGGGKGgKgGGK',
    'KKKKKKKKKKKK',
    '............',
    '............'
  ]);
  icon('scroll', [
    '............',
    '..KKKKKKKK..',
    '.KXXXXXXXXK.',
    '.KXwwwwwwXK.',
    '..KXXXXXXK..',
    '..KXwwwwXK..',
    '..KXXXXXXK..',
    '..KXwwwXXK..',
    '.KXXXXXXXXK.',
    '.KKKKKKKKKK.',
    '............',
    '............'
  ]);
  icon('orb_flask', [
    '............',
    '....KKKK....',
    '...KFFFFK...',
    '..KFXFFFfK..',
    '..KFFFFFfK..',
    '..KFFFfffK..',
    '...KFfffK...',
    '....KKKK....',
    '............',
    '............',
    '............',
    '............'
  ]);
  icon('seal', [
    '....KKKK....',
    '...KffffK...',
    '..KfFFFFfK..',
    '.KfFKFFKFfK.',
    '.KfFFKKFFfK.',
    '.KfFFKKFFfK.',
    '.KfFKFFKFfK.',
    '..KfFFFFfK..',
    '...KffffK...',
    '....KKKK....',
    '............',
    '............'
  ]);
  icon('key', [
    '............',
    '..KKKK......',
    '.KGggGK.....',
    '.KG..GKKKKKK',
    '.KG..GGGGGGK',
    '.KGggGKKKGKK',
    '..KKKK..KGK.',
    '........KK..',
    '............',
    '............',
    '............',
    '............'
  ]);

  const CAT_ICON = {
    blade: 'blade', axe: 'axe', mace: 'mace', dagger: 'dagger', claw: 'claw', staff: 'staff',
    wand: 'wand', bow: 'bow', crossbow: 'crossbow', javelin: 'javelin', shield: 'shield', orb: 'orb',
    quiver: 'quiver', armour: 'armour', helm: 'helm', cloak: 'cloak', amulet: 'amulet', ring: 'ring'
  };
  BD.view.itemArt = { CAT_ICON, artFor: (category) => 'item_' + (CAT_ICON[category] || 'blade') };
})(globalThis.BD);
