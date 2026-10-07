// @ts-check
// Champion / unique mods (04 §3.5). Every effect is telegraphed and visible as an aura colour.
// lore: only in the pool with the Champion Lore Soul Shrine perk.
(function (BD) {
  'use strict';

  BD.data.championMods = {
    extra_strong: { name: 'Extra Strong', dmgMult: 1.5 },
    extra_fast: { name: 'Extra Fast', speedMult: 1.4 },
    stone_skin: { name: 'Stone Skin', dr: 40, knockImmune: true },
    fire_enchanted: { name: 'Fire Enchanted', addElement: 'fire', addPct: 0.5, deathZone: { radius: 1, armMs: 600, element: 'fire', mult: 2.0, school: 'fire' } },
    cold_enchanted: {
      name: 'Cold Enchanted', onHit: { status: 'chilled', durMs: 2000 },
      deathZone: { radius: 1, armMs: 600, element: 'cold', mult: 1.2, status: 'frozen', statusMs: 1200, school: 'cold' },
    },
    lightning_enchanted: { name: 'Lightning Enchanted', sparksOnHit: 3, sparkCdMs: 400 },
    poison_enchanted: {
      name: 'Poison Enchanted',
      periodic: { everyMs: 6000, radius: 1, armMs: 700, element: 'pois', mult: 0.8, status: 'poisoned', statusMs: 4000, school: 'poison' },
    },
    teleporting: { name: 'Teleporting', teleportEveryMs: 6000, shimmerMs: 300 },
    fanatic: { name: 'Fanatic', packIas: 1.3 },
    cursed: { name: 'Cursed', onHit: { status: 'weakened', durMs: 4000 } },
    vampiric: { name: 'Vampiric', leech: 0.2 },
    mortar: { name: 'Mortar', lore: true, mortar: { everyMs: 7000, armMs: 1000, radius: 1, element: 'fire', mult: 1.6, school: 'fire' } },
    molten: { name: 'Molten', lore: true, trail: { kind: 'molten_trail', durMs: 3000 } },
    shielding: { name: 'Shielding', lore: true, shield: { everyMs: 8000, pct: 0.25, radius: 5 } },
  };
})(globalThis.BD);
