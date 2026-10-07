// @ts-check
// Colour palettes for FX schools, rarity, statuses and champion auras (07 §3).
(function (BD) {
  'use strict';

  const SCHOOL = {
    general: { core: '#ece0ff', mid: '#b88aff', edge: '#7a4fd0' },
    fire: { core: '#ffe9a0', mid: '#ff9b3f', edge: '#e0421b' },
    holy: { core: '#fffbe0', mid: '#ffd75a', edge: '#d09a20' },
    shadow: { core: '#e8a8c8', mid: '#a03070', edge: '#58154a' },
    storm: { core: '#eaf6ff', mid: '#9fc3ff', edge: '#4a6ae0' },
    portal: { core: '#e8d0ff', mid: '#b06aff', edge: '#5a2a9a' },
    blood: { core: '#f0744a', mid: '#c0341c', edge: '#7a1208' },
    seal: { core: '#ff7a7a', mid: '#d01818', edge: '#700808' },
    dust: { core: '#d8d0bc', mid: '#9a917e', edge: '#5e5848' },
    ki: { core: '#fff0c0', mid: '#ffb030', edge: '#d06a10' },
    cold: { core: '#f0fbff', mid: '#9ee4ff', edge: '#3a8fd0' },
    poison: { core: '#e8ffb0', mid: '#8ed24a', edge: '#3d7a1a' },
    gold: { core: '#fff3c0', mid: '#ffd23a', edge: '#b08410' },
    steel: { core: '#ffffff', mid: '#cfd6e0', edge: '#7a8494' },
    bone: { core: '#fffaf0', mid: '#d8d0c0', edge: '#8a8070' },
    lava: { core: '#fff0a0', mid: '#ff6a1a', edge: '#a02008' },
  };
  const ELEMENT_SCHOOL = { phys: 'steel', fire: 'fire', cold: 'cold', light: 'storm', pois: 'poison' };
  const RARITY = { common: '#d8d0c0', magic: '#7aa0e0', rare: '#e0c84a', legendary: '#ff8a2a' };
  const RARITY_TAG = { common: '', magic: '◆', rare: '★', legendary: '✦' };
  const MOD_AURA = {
    extra_strong: '#e03030', extra_fast: '#f0d040', stone_skin: '#a0a0a8', fire_enchanted: '#ff8a2a',
    cold_enchanted: '#8fd8ff', lightning_enchanted: '#b070ff', poison_enchanted: '#70d040', teleporting: '#a050e0',
    fanatic: '#e0b030', cursed: '#303030', vampiric: '#b01030', mortar: '#c09040', molten: '#ff5010', shielding: '#f0f0ff',
  };
  const STATUS_COLOR = {
    burning: '#ff8a2a', chilled: '#8fd8ff', frozen: '#c8f0ff', shocked: '#c0a0ff', poisoned: '#8ed24a', bleeding: '#d03030',
    stunned: '#f0e070', feared: '#b080ff', weakened: '#a09080', vulnerable: '#ff5070', exposed: '#ffd23a', rooted: '#90a050',
    slowed: '#80a0c0', blinded: '#606070', taunted: '#ff4030', enraged: '#ff3020', hidden: '#8070a0', hasted: '#f0f080',
    shielded: '#a0d0ff', braced: '#c0c0c0',
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

  BD.view.palette = { SCHOOL, ELEMENT_SCHOOL, RARITY, RARITY_TAG, MOD_AURA, STATUS_COLOR, rgb, rgba, shade };
})(globalThis.BD);
