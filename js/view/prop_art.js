// @ts-check
// Pixel-art props (no emoji in the world). Same format as sprite_art: palette keys, K = ink.
(function (BD) {
  'use strict';
  const A = BD.view.art;
  const prop = (id, pal, rows) => { A[id] = { pal, frames: { idle: [rows] }, prop: true }; };

  prop('prop_chest', { B: '#8a5a2a', b: '#5e3c1a', d: '#3a2410', G: '#d2a73f', g: '#8f6f26' }, [
    '..KKKKKKKKKK..',
    '.KBBBBBBBBBBK.',
    'KBbBBBBBBBBbBK',
    'KGGGGGKKGGGGGK',
    'KbBBBBKGKBBBbK',
    'KbBBBBBKBBBBbK',
    'KbBBBBBBBBBBbK',
    'KdbbbbbbbbbbdK',
    '.KKKKKKKKKKKK.',
  ]);
  prop('prop_chest_open', { B: '#8a5a2a', b: '#5e3c1a', d: '#3a2410', G: '#d2a73f', g: '#8f6f26', x: '#1a1008' }, [
    '.KKKKKKKKKKKK.',
    'KbBBBBBBBBBBbK',
    'KGGGGGGGGGGGGK',
    'KxxxxxxxxxxxxK',
    'KbBBBBBBBBBBbK',
    'KbBBBBBBBBBBbK',
    'KbBBBBBBBBBBbK',
    'KdbbbbbbbbbbdK',
    '.KKKKKKKKKKKK.',
  ]);
  prop('prop_coffin', { W: '#6a4a30', w: '#4a3220', d: '#2e1e12', S: '#b0a890' }, [
    '....KKKKKK....',
    '...KWWWWWWK...',
    '..KWWwWWwWWK..',
    '.KWWWWSSWWWWK.',
    'KwWWWWSSWWWWwK',
    'KwWWSSSSSSWWwK',
    '.KwWWWSSWWWwK.',
    '..KwWWWWWWwK..',
    '...KddddddK...',
    '....KKKKKK....',
  ]);
  prop('prop_altar', { S: '#8a8a94', s: '#5e5e68', d: '#3a3a44', R: '#a02020', C: '#f0e0c0', Y: '#ffd070' }, [
    '...Y......Y...',
    '..KCK....KCK..',
    'KKKKKKKKKKKKKK',
    'KSSSSRRRRSSSSK',
    'KsSSSSSSSSSSsK',
    '.KsSSSSSSSSsK.',
    '.KssKssssKssK.',
    '.KddK....KddK.',
    '.KKKK....KKKK.',
  ]);
  prop('prop_candles', { C: '#f0e0c0', c: '#b0a080', Y: '#ffd070', O: '#ff8a2a' }, [
    '..Y....Y..',
    '..O.Y..O..',
    '.KCKOKKCK.',
    '.KCKCKKCK.',
    '.KcKCKKcK.',
    'KKKKcKKKKK',
    'KccccccccK',
    '.KKKKKKKK.',
  ]);
  prop('prop_pews', { W: '#5a3e26', w: '#3e2a18' }, [
    'KKKKKKKKKKKKKK',
    'KWWWWWWWWWWWWK',
    'KwwwwwwwwwwwwK',
    'KKKKKKKKKKKKKK',
    'KwK........KwK',
    'KKK........KKK',
  ]);
  prop('prop_urn', { U: '#9a7a5a', u: '#6a5038', d: '#3e2e1e', G: '#c0a050' }, [
    '...KKKK...',
    '..KUUUUK..',
    '...KUUK...',
    '..KUUUUK..',
    '.KUGGGGuK.',
    '.KUUUUUuK.',
    '.KuUUUuuK.',
    '..KuuuuK..',
    '...KddK...',
    '...KKKK...',
  ]);
  prop('prop_bones', { W: '#d8d0c0', w: '#a09880' }, [
    '..........KK..',
    '.KK..KKK.KWWK.',
    'KWWKKWWWKKwWK.',
    '.KwWWwWwWWKK..',
    '..KKKWWKKwK...',
    '....KwwK.KK...',
    '.....KK.......',
  ]);
  prop('prop_mushroom', { R: '#c04a6a', r: '#8a2a4a', W: '#f0e0d0', S: '#d0c8b0', G: '#7aff9a' }, [
    '...KKKKKK...',
    '..KRRWRRRK..',
    '.KRWRRRRWRK.',
    'KrrrrrrrrrrK',
    '.KKKSSSSKKK.',
    '....KSSK....',
    '....KSSK.G..',
    '...KKSSKK...',
  ]);
  prop('prop_crystal', { C: '#a0f0ff', c: '#4ab0e0', d: '#2a6a9a', W: '#ffffff' }, [
    '.....K......',
    '....KCK.....',
    '...KCWcK..K.',
    '...KCCcK.KCK',
    '.K.KCCcKKCcK',
    'KCKKCCcKKCcK',
    'KCcKCCcdKCdK',
    'KCcdKCcdKddK',
    '.KKKKKKKKKK.',
  ]);
  prop('prop_stalagmite', { S: '#6a7a5e', s: '#4a5a40', d: '#2e3a28' }, [
    '....K.....',
    '...KSK....',
    '...KSsK...',
    '..KSSsK...',
    '..KSSssK..',
    '.KSSSssK..',
    '.KSSSsssK.',
    'KSSSSsssdK',
    'KKKKKKKKKK',
  ]);
  prop('prop_brazier', { I: '#4a4048', i: '#2e282e', Y: '#ffe070', O: '#ff8a2a', R: '#d03a10' }, [
    '....Y..Y....',
    '...YOY.OY...',
    '..OOROYOROO.',
    '.KRRORROORRK',
    '.KIIIIIIIIIK',
    '..KiIIIIIiK.',
    '....KiiK....',
    '....KIIK....',
    '...KIIIIK...',
    '..KKKKKKKK..',
  ]);
  prop('prop_spikes', { S: '#a0a0a8', s: '#606068', R: '#8a1a1a' }, [
    '.K...K...K..',
    'KSK.KSK.KSK.',
    'KSKKKRKKKSK.',
    'KsSKSsSKSsK.',
    'KKKKKKKKKKK.',
  ]);
  prop('prop_skull_pile', { W: '#d8d0c0', w: '#a09880', x: '#2a2018' }, [
    '....KKKK....',
    '...KWWWWK...',
    '..KWxWWxWK..',
    '.KKWWKKWWKK.',
    'KWWKwKKwKWWK',
    'KWxWxKKWxWxK',
    'KwWWWKKwWWwK',
    '.KKKKKKKKKK.',
  ]);
  prop('prop_barrel', { W: '#8a5a2a', w: '#5e3c1a', I: '#4a4a52' }, [
    '..KKKKKK..',
    '.KWWWWWWK.',
    'KIIIIIIIIK',
    'KWWWwWWWwK',
    'KWWWwWWWwK',
    'KIIIIIIIIK',
    'KwWWwWWwwK',
    '.KKKKKKKK.',
  ]);
  prop('prop_crate', { W: '#9a6a3a', w: '#6a4422' }, [
    'KKKKKKKKKK',
    'KWwWWWWwWK',
    'KwWwWWwWwK',
    'KWWwWwWWWK',
    'KWWWwWWWWK',
    'KWwWwWwWWK',
    'KwWWWWWwWK',
    'KKKKKKKKKK',
  ]);
  prop('prop_gravestone', { S: '#8a8a90', s: '#5a5a62', M: '#4a6a3a' }, [
    '...KKKK...',
    '..KSSSSK..',
    '.KSSSSSsK.',
    '.KSsSSSsK.',
    '.KSSSSSsK.',
    '.KSsSSSsK.',
    '.KSSSSSsK.',
    'KMMKKKKMMK',
  ]);
  prop('prop_tree', { G: '#3e5a2a', g: '#2a4020', d: '#1a2a14', B: '#4a3420' }, [
    '.....KKKKK.....',
    '...KKGGGGgKK...',
    '..KGGGgGGGGgK..',
    '.KGGgGGGGgGGgK.',
    'KGGGGGgGGGGGggK',
    'KgGGgGGGGgGGggK',
    '.KggGGGgGGGggK.',
    '..KKgggggggKK..',
    '....KKBBBKK....',
    '......KBK......',
    '......KBK......',
    '.....KBBBK.....',
  ]);
  prop('prop_well', { S: '#7a7a80', s: '#4e4e56', W: '#1d3a4a', B: '#5a3e26' }, [
    '.KK.......KK.',
    '.KBK.....KBK.',
    '.KBKKKKKKKBK.',
    '.KBK.....KBK.',
    '.KSSSSSSSSSK.',
    'KSsSsSsSsSsSK',
    'KsWWWWWWWWWsK',
    'KSsSsSsSsSsSK',
    '.KKKKKKKKKKK.',
  ]);
  prop('prop_shrine', { S: '#9a9aa4', s: '#5e5e68', G: '#ffd75a', g: '#b08a2a' }, [
    '....KGGK....',
    '...KGggGK...',
    '....KGGK....',
    '....KSSK....',
    '...KSSsSK...',
    '...KSssSK...',
    '..KSSSsSSK..',
    '.KSSSSSSSsK.',
    'KKKKKKKKKKKK',
  ]);
  prop('prop_lever', { I: '#6a6a72', i: '#3a3a42', R: '#c03030', B: '#5a3e26' }, [
    '.......KK.',
    '......KRRK',
    '.....KIKK.',
    '....KIK...',
    '...KIK....',
    '.KKKKKKK..',
    'KBBBBBBBK.',
    'KKKKKKKKK.',
  ]);
  prop('prop_pile', { G: '#ffd23a', g: '#b08410', W: '#e8e0d0', B: '#7a5030' }, [
    '....KK......',
    '...KWWK.KK..',
    '..KGGKKKBBK.',
    '.KGgGGKBBBK.',
    'KGgGgGGKKK..',
    'KKKKKKKK....',
  ]);
  prop('prop_bone_wall', { W: '#d8d0c0', w: '#a09880', d: '#6a6050' }, [
    '..KK..KK..KK.',
    '.KWWKKWWKKWWK',
    '.KWwKKWwKKWwK',
    'KWWwWWWwWWWwK',
    'KwWWwWwWWwWWK',
    'KWWwWWWwWWwWK',
    'KwWdwWdWwdWWK',
    'KKKKKKKKKKKKK',
  ]);
  prop('prop_sentry', { I: '#8a8a94', i: '#4a4a54', C: '#9fc3ff', W: '#eaf6ff' }, [
    '...KWWK...',
    '..KCWWCK..',
    '...KCCK...',
    '....KK....',
    '...KIIK...',
    '..KIiiIK..',
    '.KIiKKiIK.',
    'KKK....KKK',
  ]);
  prop('prop_portal_stone', { S: '#6a6a74', s: '#44444e', P: '#b06aff', p: '#7a3ac0' }, [
    '....KKKK....',
    '...KSSSsK...',
    '..KSPPPPsK..',
    '..KSPppPsK..',
    '..KSPppPsK..',
    '..KSPPPPsK..',
    '.KSSSSSSssK.',
    'KKKKKKKKKKKK',
  ]);
  prop('prop_waypoint', { S: '#7a7a84', s: '#4a4a54', B: '#6aa8ff', b: '#3a68c0', W: '#e0f0ff' }, [
    '......KK......',
    '.....KWWK.....',
    '....KBWWBK....',
    '.....KBBK.....',
    '......KK......',
    '..KKKKKKKKKK..',
    '.KSBbBbBbBbsK.',
    'KSSSSSSSSSSssK',
    'KKKKKKKKKKKKKK',
  ]);
  prop('prop_gate', { I: '#4a4048', i: '#2a2228', R: '#a01818', r: '#600808', G: '#c9a227' }, [
    '....KKKKKKKKKK....',
    '..KKIIIIIIIIIIKK..',
    '.KIIiKiKiKiKiIIIK.',
    'KIIiKRKRKRKRKiIIIK',
    'KIiKRrKRrKRrKKiIIK',
    'KIiKRrKRrKRrKKiIIK',
    'KIiKRrKGGKRrKKiIIK',
    'KIiKRrKGGKRrKKiIIK',
    'KIiKRrKRrKRrKKiIIK',
    'KIiKRrKRrKRrKKiIIK',
    'KIiKRrKRrKRrKKiIIK',
    'KIiKRrKRrKRrKKiIIK',
    'KIiKKKKKKKKKKKiIIK',
    'KKKKKKKKKKKKKKKKKK',
  ]);
  prop('prop_gate_open', { I: '#4a4048', i: '#2a2228', x: '#0a0408', R: '#ff4020' }, [
    '....KKKKKKKKKK....',
    '..KKIIIIIIIIIIKK..',
    '.KIIixxxxxxxxIIIK.',
    'KIIixxxxxxxxxxiIIK',
    'KIixxxxxRxxxxxxiIK',
    'KIixxxxxxxxxxxxiIK',
    'KIixxxxxxxRxxxxiIK',
    'KIixxxxxxxxxxxxiIK',
    'KIixxxRxxxxxxxxiIK',
    'KIixxxxxxxxxxxxiIK',
    'KIixxxxxxxxxRxxiIK',
    'KIixxxxxxxxxxxxiIK',
    'KIixxxxxxxxxxxxiIK',
    'KKKKKKKKKKKKKKKKKK',
  ]);
})(globalThis.BD);
