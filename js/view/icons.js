// @ts-check
// Procedural skill/status icons (32×32), cached as data URLs for the DOM. Each icon = a school-tinted
// plate + a pictograph from a small glyph vocabulary. No emoji anywhere in the game world.
(function (BD) {
  'use strict';

  const P = BD.view.palette;
  const cache = new Map();

  // icon id → [glyph, school]
  const ICONS = {
    attack: ['sword', 'steel'], bash: ['hammer', 'steel'], whirlwind: ['spin', 'steel'], berserk: ['claws', 'blood'],
    bloodlust: ['drop', 'blood'], charge: ['arrowR', 'steel'], warcry: ['shout', 'blood'], earthshaker: ['quake', 'dust'],
    warlord: ['crown', 'gold'],
    brace: ['shield', 'steel'], secondwind: ['heart', 'poison'], leap: ['leap', 'dust'], juggernaut: ['anchor', 'steel'],
    tiger_strike: ['fist', 'ki'], dragon_talon: ['kick', 'ki'], phoenix_strike: ['phoenix', 'fire'], endless_flurry: ['flurry', 'ki'],
    fire_blast: ['bomb', 'fire'], lightning_sentry: ['tower', 'storm'], death_sentry: ['skull', 'shadow'], clockwork_mind: ['gear', 'gold'],
    shadowstep: ['step', 'shadow'], smoke_bomb: ['cloud', 'shadow'], shadow_master: ['twin', 'shadow'], unseen: ['eye', 'shadow'],
    firebolt: ['bolt', 'fire'], fireball: ['orb', 'fire'], meteor: ['meteor', 'fire'], pyre: ['flame', 'fire'],
    ice_shard: ['shards', 'cold'], frost_nova: ['nova', 'cold'], blizzard: ['snow', 'cold'], shatter: ['crack', 'cold'],
    spark: ['spark', 'storm'], teleport: ['blink', 'storm'], chain_lightning: ['zig', 'storm'], energy_shield: ['shield', 'storm'],
    aimed_shot: ['arrow', 'holy'], piercing_shot: ['arrowR', 'steel'], rain_of_arrows: ['rain', 'steel'], deadeye: ['eye', 'holy'],
    multishot: ['fan', 'steel'], vault: ['leap', 'dust'], pinning_shot: ['pin', 'poison'], wind_dancer: ['wing', 'storm'],
    javelin: ['spear', 'holy'], valkyries_call: ['wing', 'holy'], sky_spear: ['spearDown', 'storm'], shieldmaidens_oath: ['shield', 'holy'],
    evade: ['dash', 'dust'], flask: ['flask', 'blood'],
  };

  function draw(g, glyph, core) {
    g.strokeStyle = core; g.fillStyle = core; g.lineWidth = 2.5; g.lineCap = 'round'; g.lineJoin = 'round';
    const L = (pts) => {
      g.beginPath(); g.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
      g.stroke();
    };
    const C = (x, y, r, fill) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); fill ? g.fill() : g.stroke(); };
    switch (glyph) {
      case 'sword': L([8, 24, 22, 10]); L([18, 8, 24, 14]); L([7, 21, 11, 25]); break;
      case 'hammer': L([9, 24, 19, 14]); g.fillRect(15, 6, 11, 8); break;
      case 'spin': for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(16, 16, 4 + i * 4, i, i + 3.6); g.stroke(); } break;
      case 'claws': L([9, 8, 15, 24]); L([14, 7, 19, 24]); L([19, 7, 24, 23]); break;
      case 'drop': g.beginPath(); g.moveTo(16, 6); g.quadraticCurveTo(25, 18, 16, 25); g.quadraticCurveTo(7, 18, 16, 6); g.fill(); break;
      case 'arrowR': L([6, 16, 25, 16]); L([19, 10, 25, 16, 19, 22]); break;
      case 'shout': L([8, 13, 12, 13, 18, 8, 18, 24, 12, 19, 8, 19, 8, 13]); g.beginPath(); g.arc(18, 16, 7, -0.7, 0.7); g.stroke(); break;
      case 'quake': L([5, 20, 10, 14, 14, 20, 18, 12, 22, 20, 27, 15]); L([6, 25, 26, 25]); break;
      case 'crown': L([7, 23, 7, 11, 12, 17, 16, 9, 20, 17, 25, 11, 25, 23, 7, 23]); break;
      case 'shield':
        g.beginPath(); g.moveTo(16, 6); g.lineTo(25, 10);
        g.quadraticCurveTo(24, 22, 16, 26); g.quadraticCurveTo(8, 22, 7, 10);
        g.closePath(); g.stroke();
        break;
      case 'heart':
        g.beginPath(); g.moveTo(16, 25);
        g.bezierCurveTo(2, 15, 9, 4, 16, 11); g.bezierCurveTo(23, 4, 30, 15, 16, 25);
        g.fill();
        break;
      case 'leap': g.beginPath(); g.moveTo(6, 24); g.quadraticCurveTo(16, 0, 26, 24); g.stroke(); L([22, 20, 26, 24, 27, 19]); break;
      case 'anchor': L([16, 7, 16, 25]); L([11, 11, 21, 11]); g.beginPath(); g.arc(16, 18, 8, 0.3, Math.PI - 0.3); g.stroke(); break;
      case 'fist': g.fillRect(10, 11, 12, 11); L([10, 15, 22, 15]); L([13, 22, 13, 26]); break;
      case 'kick': L([8, 8, 14, 16, 24, 14]); L([22, 10, 26, 14, 22, 18]); break;
      case 'phoenix':
        L([16, 25, 16, 12]);
        g.beginPath();
        g.moveTo(16, 14); g.quadraticCurveTo(5, 4, 6, 16);
        g.moveTo(16, 14); g.quadraticCurveTo(27, 4, 26, 16);
        g.stroke();
        break;
      case 'flurry': for (let i = 0; i < 3; i++) L([8 + i * 5, 24, 14 + i * 5, 8]); break;
      case 'bomb': C(15, 18, 7, true); L([19, 11, 23, 7]); C(24, 6, 1.5, true); break;
      case 'tower': L([16, 26, 16, 12]); L([11, 26, 21, 26]); C(16, 9, 4); break;
      case 'skull': C(16, 14, 8); C(13, 14, 1.8, true); C(19, 14, 1.8, true); L([12, 23, 20, 23]); break;
      case 'gear':
        C(16, 16, 6);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          L([16 + Math.cos(a) * 7, 16 + Math.sin(a) * 7, 16 + Math.cos(a) * 10, 16 + Math.sin(a) * 10]);
        }
        break;
      case 'step': for (let i = 0; i < 3; i++) C(9 + i * 7, 22 - i * 6, 2.5, true); break;
      case 'cloud': C(11, 18, 5, true); C(17, 14, 6, true); C(22, 18, 5, true); break;
      case 'twin':
        C(11, 11, 3, true); L([11, 14, 11, 24]);
        g.globalAlpha = 0.5; C(21, 11, 3, true); L([21, 14, 21, 24]); g.globalAlpha = 1;
        break;
      case 'eye':
        g.beginPath(); g.moveTo(5, 16); g.quadraticCurveTo(16, 4, 27, 16); g.quadraticCurveTo(16, 28, 5, 16); g.stroke();
        C(16, 16, 3.5, true);
        break;
      case 'bolt': L([7, 24, 22, 9]); C(23, 8, 3.5, true); break;
      case 'orb': C(16, 16, 8, true); break;
      case 'meteor': C(20, 20, 6, true); L([6, 6, 16, 16]); L([10, 4, 18, 13]); break;
      case 'flame':
        g.beginPath(); g.moveTo(16, 5);
        g.quadraticCurveTo(26, 16, 21, 24); g.quadraticCurveTo(16, 28, 11, 24); g.quadraticCurveTo(6, 16, 16, 5);
        g.fill();
        break;
      case 'shards': L([6, 16, 24, 10]); L([6, 16, 25, 16]); L([6, 16, 24, 22]); break;
      case 'nova':
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          L([16 + Math.cos(a) * 4, 16 + Math.sin(a) * 4, 16 + Math.cos(a) * 11, 16 + Math.sin(a) * 11]);
        }
        break;
      case 'snow':
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI;
          L([16 - Math.cos(a) * 10, 16 - Math.sin(a) * 10, 16 + Math.cos(a) * 10, 16 + Math.sin(a) * 10]);
        }
        break;
      case 'crack': L([16, 5, 13, 13, 19, 17, 14, 27]); L([19, 17, 25, 19]); break;
      case 'spark': L([8, 20, 13, 14, 17, 19, 23, 10]); break;
      case 'blink': C(10, 16, 4); g.setLineDash([2, 3]); L([14, 16, 20, 16]); g.setLineDash([]); C(23, 16, 4, true); break;
      case 'zig': L([6, 8, 13, 15, 10, 18, 18, 24, 15, 26, 26, 27]); break;
      case 'arrow': L([6, 26, 24, 8]); L([16, 8, 24, 8, 24, 16]); L([6, 26, 9, 21]); break;
      case 'rain':
        for (let i = 0; i < 4; i++) L([7 + i * 6, 6, 5 + i * 6, 15]);
        for (let i = 0; i < 3; i++) L([10 + i * 6, 15, 8 + i * 6, 25]);
        break;
      case 'fan': L([16, 26, 6, 8]); L([16, 26, 16, 6]); L([16, 26, 26, 8]); break;
      case 'pin': L([6, 16, 22, 16]); L([22, 8, 22, 24]); break;
      case 'wing':
        g.beginPath(); g.moveTo(8, 24);
        g.quadraticCurveTo(10, 6, 26, 6); g.quadraticCurveTo(18, 14, 22, 14);
        g.quadraticCurveTo(14, 18, 18, 20); g.quadraticCurveTo(12, 22, 8, 24);
        g.fill();
        break;
      case 'spear': L([6, 26, 24, 8]); L([20, 7, 25, 7, 25, 12]); break;
      case 'spearDown': L([16, 4, 16, 22]); L([12, 18, 16, 26, 20, 18]); L([8, 27, 24, 27]); break;
      case 'dash': L([6, 12, 20, 12]); L([4, 17, 22, 17]); L([8, 22, 20, 22]); L([22, 9, 27, 17, 22, 25]); break;
      case 'flask': g.fillRect(12, 6, 8, 5); g.beginPath(); g.arc(16, 19, 8, 0, Math.PI * 2); g.fill(); break;
      default: C(16, 16, 6);
    }
  }

  /** @returns {string} data URL */
  function url(id) {
    if (cache.has(id)) return cache.get(id);
    const [glyph, school] = ICONS[id] || ['', 'general'];
    const sch = P.SCHOOL[school] || P.SCHOOL.general;
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(12, 10, 2, 16, 16, 24);
    gr.addColorStop(0, P.shade(sch.edge, 0.9)); gr.addColorStop(1, '#0d0907');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    g.shadowColor = sch.mid; g.shadowBlur = 6;
    draw(g, glyph, sch.core);
    g.shadowBlur = 0;
    g.strokeStyle = 'rgba(0,0,0,0.8)'; g.lineWidth = 2; g.strokeRect(1, 1, 30, 30);
    const u = c.toDataURL();
    cache.set(id, u);
    return u;
  }

  BD.view.icons = { url, ICONS };
})(globalThis.BD);
