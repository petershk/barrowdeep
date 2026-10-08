// @ts-check
// Colour palettes for FX schools, rarity, statuses, champion auras and every UI/world meaning (07 §3).
// ART_DIRECTION.md is the rulebook: one meaning per colour, one colour per meaning. Nothing outside this
// file and the CSS tokens in css/ui.css (which mirror MEANING) should hard-code a meaning colour.
(function (BD) {
  'use strict';

  const SCHOOL = {
    general: { core: '#ece0ff', mid: '#b88aff', edge: '#7a4fd0' },
    fire: { core: '#fff2b0', mid: '#ff8a2a', edge: '#c8300f' },
    holy: { core: '#fffbe0', mid: '#ffd75a', edge: '#d09a20' },
    shadow: { core: '#e8a8c8', mid: '#a03070', edge: '#2a0a24' },
    storm: { core: '#f6f8ff', mid: '#9fb0ff', edge: '#4a50e0' },
    portal: { core: '#e8d0ff', mid: '#b06aff', edge: '#5a2a9a' },
    blood: { core: '#f0744a', mid: '#c0341c', edge: '#7a1208' },
    seal: { core: '#ff7a7a', mid: '#d01818', edge: '#700808' },
    dust: { core: '#d8d0bc', mid: '#9a917e', edge: '#5e5848' },
    ki: { core: '#fff0c0', mid: '#ffb030', edge: '#d06a10' },
    cold: { core: '#f4fdff', mid: '#7fe8ff', edge: '#1e90b8' },
    life: { core: '#d8ffd0', mid: '#6ad06a', edge: '#2e8a3e' },
    poison: { core: '#e8ffb0', mid: '#8ed24a', edge: '#3d7a1a' },
    gold: { core: '#fff3c0', mid: '#ffd23a', edge: '#b08410' },
    steel: { core: '#ffffff', mid: '#cfd6e0', edge: '#7a8494' },
    bone: { core: '#fffaf0', mid: '#d8d0c0', edge: '#8a8070' },
    lava: { core: '#ffd080', mid: '#ff6a1a', edge: '#7a1e08' },
  };
  /** schools drawn with normal (source-over) blending: dark or opaque matter that additive light can't show */
  const SCHOOL_NORMAL_BLEND = { shadow: true, dust: true, blood: true, poison: true };
  const ELEMENT_SCHOOL = { phys: 'steel', fire: 'fire', cold: 'cold', light: 'storm', pois: 'poison' };
  const RARITY = { common: '#d8d0c0', magic: '#7aa0e0', rare: '#e0c84a', legendary: '#ff8a2a' };
  const RARITY_TAG = { common: '', magic: '◆', rare: '★', legendary: '✦' };
  /** champion mod auras; elemental mods use their element's mid colour. cursed is dark: draw it source-over */
  const MOD_AURA = {
    extra_strong: '#e03030', extra_fast: '#fff07a', stone_skin: '#a0a0a8', fire_enchanted: '#ff8a2a',
    cold_enchanted: '#7fe8ff', lightning_enchanted: '#9fb0ff', poison_enchanted: '#8ed24a', teleporting: '#b06aff',
    fanatic: '#e0a020', cursed: '#1a0a18', vampiric: '#a8142a', mortar: '#c07a30', molten: '#ff5010', shielding: '#f0f0ff',
  };
  /** elemental statuses use their element's mid (frozen: cold core); the rest are spread so no two collide.
   *  Colour alone is not enough at pip size: every status also has its own glyph (07 §2.4). */
  const STATUS_COLOR = {
    burning: '#ff8a2a', chilled: '#7fe8ff', frozen: '#e8f8ff', shocked: '#9fb0ff', poisoned: '#8ed24a', bleeding: '#a8142a',
    stunned: '#f0e070', feared: '#a03070', weakened: '#a09080', vulnerable: '#ff5070', exposed: '#ffd23a', rooted: '#8a6a3a',
    slowed: '#6080a0', blinded: '#606070', taunted: '#ff7a5a', enraged: '#d01818', hidden: '#5a5070', hasted: '#3cc8b4',
    shielded: '#c8d8e8', braced: '#b0a890',
  };
  /** every non-school meaning in the game (ART_DIRECTION.md). css/ui.css mirrors these as custom properties. */
  const MEANING = {
    life: '#c41e1e', lifeLow: '#ff3b30', rage: '#c8461c', energy: '#3cc8b4', mana: '#3a6ee0', focus: '#f0e0a0',
    xp: '#c8a870', souls: '#b06aff', good: '#6ad06a', bad: '#e05050', text: '#d8d0c0', muted: '#9a9080', dim: '#5a5248',
    uiGold: '#c9a227', border: '#5a4a28', dmg: '#d8d0c0', dmgTaken: '#ff4a3a', crit: '#ffd23a', gold: '#e8c050',
    exposed: '#ffd23a', hostile: '#ff3a1a', hostileCB: '#ff3aa0', friendly: '#e8d8b0', lockon: '#ffffff',
    alert: '#ff3a1a', champion: '#7aa0e0', unique: '#e0c84a', boss: '#b0201a', outline: '#0a0806',
  };

  /** '#rrggbb' → [r,g,b] (cached) */
  const cache = new Map();
  function rgb(hex) {
    let v = cache.get(hex);
    if (!v) {
      const n = parseInt(hex.slice(1), 16);
      v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      cache.set(hex, v);
    }
    return v;
  }
  function rgba(hex, a) {
    const c = rgb(hex);
    return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  }
  function shade(hex, k) {
    const c = rgb(hex);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
    return '#' + ((1 << 24) | (f(c[0]) << 16) | (f(c[1]) << 8) | f(c[2])).toString(16).slice(1);
  }

  BD.view.palette = { SCHOOL, SCHOOL_NORMAL_BLEND, ELEMENT_SCHOOL, RARITY, RARITY_TAG, MOD_AURA, STATUS_COLOR, MEANING, rgb, rgba, shade };
})(globalThis.BD);
