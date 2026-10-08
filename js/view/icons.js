// @ts-check
// Procedural skill icons, cached as data URLs for the DOM. Each icon is pixel art at 24×24 (shown at 2×,
// image-rendering: pixelated): one bronze plate for every skill, and a pictograph from a small glyph
// vocabulary in its school's colours (core highlight / mid body / dark shade) with a 1 px ink outline.
// Glyphs are authored as vector strokes on a 32-unit grid, then rasterised and thresholded so no
// anti-aliased edge survives. No emoji anywhere in the game world.
(function (BD) {
  'use strict';

  const Palette = BD.view.palette;
  const cache = new Map();

  // icon id → [glyph, school]
  const ICONS = {
    attack: ['sword', 'steel'], bash: ['hammer', 'steel'], whirlwind: ['spin', 'steel'], berserk: ['claws', 'blood'],
    bloodlust: ['drop', 'blood'], charge: ['arrowR', 'steel'], warcry: ['shout', 'blood'], earthshaker: ['quake', 'dust'],
    warlord: ['crown', 'gold'],
    brace: ['shield', 'steel'], secondwind: ['heart', 'life'], leap: ['leap', 'dust'], juggernaut: ['anchor', 'steel'],
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

  // glyph → draws the pictograph on the 32-unit authoring grid. Pen helpers:
  //   line(pts)              strokes a polyline through [x0, y0, x1, y1, ...]
  //   circle(x, y, r, fill)  strokes a circle, or fills it when fill is set
  const GLYPHS = {
    sword({ line }) {
      line([8, 24, 22, 10]);
      line([18, 8, 24, 14]);
      line([7, 21, 11, 25]);
    },
    hammer({ g, line }) {
      line([9, 24, 19, 14]);
      g.fillRect(15, 6, 11, 8);
    },
    spin({ g }) {
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.arc(16, 16, 4 + i * 4, i, i + 3.6);
        g.stroke();
      }
    },
    claws({ line }) {
      line([9, 8, 15, 24]);
      line([14, 7, 19, 24]);
      line([19, 7, 24, 23]);
    },
    drop({ g }) {
      g.beginPath();
      g.moveTo(16, 6);
      g.quadraticCurveTo(25, 18, 16, 25);
      g.quadraticCurveTo(7, 18, 16, 6);
      g.fill();
    },
    arrowR({ line }) {
      line([6, 16, 25, 16]);
      line([19, 10, 25, 16, 19, 22]);
    },
    shout({ g, line }) {
      line([8, 13, 12, 13, 18, 8, 18, 24, 12, 19, 8, 19, 8, 13]);
      g.beginPath();
      g.arc(18, 16, 7, -0.7, 0.7);
      g.stroke();
    },
    quake({ line }) {
      line([5, 20, 10, 14, 14, 20, 18, 12, 22, 20, 27, 15]);
      line([6, 25, 26, 25]);
    },
    crown({ line }) {
      line([7, 23, 7, 11, 12, 17, 16, 9, 20, 17, 25, 11, 25, 23, 7, 23]);
    },
    shield({ g }) {
      g.beginPath();
      g.moveTo(16, 6);
      g.lineTo(25, 10);
      g.quadraticCurveTo(24, 22, 16, 26);
      g.quadraticCurveTo(8, 22, 7, 10);
      g.closePath();
      g.stroke();
    },
    heart({ g }) {
      g.beginPath();
      g.moveTo(16, 25);
      g.bezierCurveTo(2, 15, 9, 4, 16, 11);
      g.bezierCurveTo(23, 4, 30, 15, 16, 25);
      g.fill();
    },
    leap({ g, line }) {
      g.beginPath();
      g.moveTo(6, 24);
      g.quadraticCurveTo(16, 0, 26, 24);
      g.stroke();
      line([22, 20, 26, 24, 27, 19]);
    },
    anchor({ g, line }) {
      line([16, 7, 16, 25]);
      line([11, 11, 21, 11]);
      g.beginPath();
      g.arc(16, 18, 8, 0.3, Math.PI - 0.3);
      g.stroke();
    },
    fist({ g, line }) {
      g.fillRect(10, 11, 12, 11);
      line([10, 15, 22, 15]);
      line([13, 22, 13, 26]);
    },
    kick({ line }) {
      line([8, 8, 14, 16, 24, 14]);
      line([22, 10, 26, 14, 22, 18]);
    },
    phoenix({ g, line }) {
      line([16, 25, 16, 12]);
      g.beginPath();
      g.moveTo(16, 14);
      g.quadraticCurveTo(5, 4, 6, 16);
      g.moveTo(16, 14);
      g.quadraticCurveTo(27, 4, 26, 16);
      g.stroke();
    },
    flurry({ line }) {
      for (let i = 0; i < 3; i++) line([8 + i * 5, 24, 14 + i * 5, 8]);
    },
    bomb({ line, circle }) {
      circle(15, 18, 7, true);
      line([19, 11, 23, 7]);
      circle(24, 6, 1.5, true);
    },
    tower({ line, circle }) {
      line([16, 26, 16, 12]);
      line([11, 26, 21, 26]);
      circle(16, 9, 4);
    },
    skull({ line, circle }) {
      circle(16, 14, 8);
      circle(13, 14, 1.8, true);
      circle(19, 14, 1.8, true);
      line([12, 23, 20, 23]);
    },
    gear({ line, circle }) {
      circle(16, 16, 6);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        line([16 + Math.cos(a) * 7, 16 + Math.sin(a) * 7, 16 + Math.cos(a) * 10, 16 + Math.sin(a) * 10]);
      }
    },
    step({ circle }) {
      for (let i = 0; i < 3; i++) circle(9 + i * 7, 22 - i * 6, 2.5, true);
    },
    cloud({ circle }) {
      circle(11, 18, 5, true);
      circle(17, 14, 6, true);
      circle(22, 18, 5, true);
    },
    twin({ g, line, circle }) {
      circle(11, 11, 3, true);
      line([11, 14, 11, 24]);
      g.globalAlpha = 0.5;
      circle(21, 11, 3, true);
      line([21, 14, 21, 24]);
      g.globalAlpha = 1;
    },
    eye({ g, circle }) {
      g.beginPath();
      g.moveTo(5, 16);
      g.quadraticCurveTo(16, 4, 27, 16);
      g.quadraticCurveTo(16, 28, 5, 16);
      g.stroke();
      circle(16, 16, 3.5, true);
    },
    bolt({ line, circle }) {
      line([7, 24, 22, 9]);
      circle(23, 8, 3.5, true);
    },
    orb({ circle }) {
      circle(16, 16, 8, true);
    },
    meteor({ line, circle }) {
      circle(20, 20, 6, true);
      line([6, 6, 16, 16]);
      line([10, 4, 18, 13]);
    },
    flame({ g }) {
      g.beginPath();
      g.moveTo(16, 5);
      g.quadraticCurveTo(26, 16, 21, 24);
      g.quadraticCurveTo(16, 28, 11, 24);
      g.quadraticCurveTo(6, 16, 16, 5);
      g.fill();
    },
    shards({ line }) {
      line([6, 16, 24, 10]);
      line([6, 16, 25, 16]);
      line([6, 16, 24, 22]);
    },
    nova({ line }) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        line([16 + Math.cos(a) * 4, 16 + Math.sin(a) * 4, 16 + Math.cos(a) * 11, 16 + Math.sin(a) * 11]);
      }
    },
    snow({ line }) {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI;
        line([16 - Math.cos(a) * 10, 16 - Math.sin(a) * 10, 16 + Math.cos(a) * 10, 16 + Math.sin(a) * 10]);
      }
    },
    crack({ line }) {
      line([16, 5, 13, 13, 19, 17, 14, 27]);
      line([19, 17, 25, 19]);
    },
    spark({ line }) {
      line([8, 20, 13, 14, 17, 19, 23, 10]);
    },
    blink({ g, line, circle }) {
      circle(10, 16, 4);
      g.setLineDash([2, 3]);
      line([14, 16, 20, 16]);
      g.setLineDash([]);
      circle(23, 16, 4, true);
    },
    zig({ line }) {
      line([6, 8, 13, 15, 10, 18, 18, 24, 15, 26, 26, 27]);
    },
    arrow({ line }) {
      line([6, 26, 24, 8]);
      line([16, 8, 24, 8, 24, 16]);
      line([6, 26, 9, 21]);
    },
    rain({ line }) {
      for (let i = 0; i < 4; i++) line([7 + i * 6, 6, 5 + i * 6, 15]);
      for (let i = 0; i < 3; i++) line([10 + i * 6, 15, 8 + i * 6, 25]);
    },
    fan({ line }) {
      line([16, 26, 6, 8]);
      line([16, 26, 16, 6]);
      line([16, 26, 26, 8]);
    },
    pin({ line }) {
      line([6, 16, 22, 16]);
      line([22, 8, 22, 24]);
    },
    wing({ g }) {
      g.beginPath();
      g.moveTo(8, 24);
      g.quadraticCurveTo(10, 6, 26, 6);
      g.quadraticCurveTo(18, 14, 22, 14);
      g.quadraticCurveTo(14, 18, 18, 20);
      g.quadraticCurveTo(12, 22, 8, 24);
      g.fill();
    },
    spear({ line }) {
      line([6, 26, 24, 8]);
      line([20, 7, 25, 7, 25, 12]);
    },
    spearDown({ line }) {
      line([16, 4, 16, 22]);
      line([12, 18, 16, 26, 20, 18]);
      line([8, 27, 24, 27]);
    },
    dash({ line }) {
      line([6, 12, 20, 12]);
      line([4, 17, 22, 17]);
      line([8, 22, 20, 22]);
      line([22, 9, 27, 17, 22, 25]);
    },
    flask({ g }) {
      g.fillRect(12, 6, 8, 5);
      g.beginPath();
      g.arc(16, 19, 8, 0, Math.PI * 2);
      g.fill();
    },
  };
  /** an unknown glyph draws a plain ring */
  const fallbackGlyph = ({ circle }) => circle(16, 16, 6);

  const SIZE = 24;
  const M = Palette.MEANING;
  /** the bronze plate (css --plate) with a one-pixel bevel; the ink outline is MEANING.outline */
  const PLATE = '#2a2016';
  const PLATE_HI = Palette.shade(PLATE, 1.45), PLATE_LO = Palette.shade(PLATE, 0.6);

  /** rasterise a glyph to a SIZE×SIZE ink mask (1 = ink), thresholded: no soft edges */
  function glyphMask(glyph) {
    const c = document.createElement('canvas');
    c.width = c.height = SIZE;
    const g = c.getContext('2d');
    g.scale(SIZE / 32, SIZE / 32);
    g.strokeStyle = '#fff';
    g.fillStyle = '#fff';
    g.lineWidth = 2.7;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const line = (pts) => {
      g.beginPath();
      g.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
      g.stroke();
    };
    const circle = (x, y, r, fill) => {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      if (fill) g.fill();
      else g.stroke();
    };
    const drawGlyph = Object.prototype.hasOwnProperty.call(GLYPHS, glyph) ? GLYPHS[glyph] : fallbackGlyph;
    drawGlyph({ g, line, circle });
    const a = g.getImageData(0, 0, SIZE, SIZE).data;
    const mask = new Uint8Array(SIZE * SIZE);
    for (let i = 0; i < mask.length; i++) mask[i] = a[i * 4 + 3] >= 96 ? 1 : 0;
    return mask;
  }

  /** the colour of one plate pixel: ink outline on the rim, a light top-left bevel, a dark bottom-right one */
  function plateAt(x, y) {
    const last = SIZE - 1;
    if (x === 0 || y === 0 || x === last || y === last) return M.outline;
    if (x === 1 || y === 1) return PLATE_HI;
    if (x === last - 1 || y === last - 1) return PLATE_LO;
    return PLATE;
  }

  /** @returns {string} data URL of a 24×24 pixel-art icon */
  function url(id) {
    if (cache.has(id)) return cache.get(id);
    const [glyph, school] = ICONS[id] || ['', 'general'];
    const sch = Palette.SCHOOL[school] || Palette.SCHOOL.general;
    const shadow = Palette.shade(sch.mid, 0.62);
    const mask = glyphMask(glyph);
    const ink = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE && mask[y * SIZE + x] === 1;
    const c = document.createElement('canvas');
    c.width = c.height = SIZE;
    const g = c.getContext('2d');
    const img = g.createImageData(SIZE, SIZE);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        let col = plateAt(x, y);
        if (ink(x, y)) {
          col = sch.mid;
          if (!ink(x, y - 1) || !ink(x - 1, y)) col = sch.core;
          else if (!ink(x, y + 1) || !ink(x + 1, y)) col = shadow;
        } else if (ink(x - 1, y) || ink(x + 1, y) || ink(x, y - 1) || ink(x, y + 1)) col = M.outline;
        const rgb = Palette.rgb(col), i = (y * SIZE + x) * 4;
        img.data[i] = rgb[0];
        img.data[i + 1] = rgb[1];
        img.data[i + 2] = rgb[2];
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const u = c.toDataURL();
    cache.set(id, u);
    return u;
  }

  BD.view.icons = { url, ICONS };
})(globalThis.BD);
