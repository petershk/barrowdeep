// The hero in a full kit, in the world: plate (legendary), a rare great helm, a heavy cloak and a fiery
// legendary sword, so the doll colours, helm crown, cloak and gear effects can all be checked at once.
// ?cls=fighter|assassin|magician|valkyrie  ?elem=fire_add|cold_add|light_add|pois_add  ?kit=legend (signature legendaries)
BD.debug.autotests.gear = (D) => {
  const cq = /[?&]cls=(\w+)/.exec(location.search);
  const eq = /[?&]elem=(\w+)/.exec(location.search);
  const cls = cq ? cq[1] : 'fighter';
  const w = D.newRun({ cls, seed: 'gear1', floor: 4 });
  const p = w.player;
  const make = (base, rarity, affixes) => BD.sim.items.make(w, base, 20, rarity, affixes || []);
  const elem = eq ? eq[1] : 'fire_add';
  const leg = (id, rarity) => {
    const L = BD.data.legendaries[id];
    return BD.sim.items.make(w, L.base, 20, rarity || 'legendary', [], { legendary: id, name: L.name });
  };
  const kit = /[?&]kit=legend/.test(location.search);
  p.equip.weapon = kit ? leg('ironbrand') : make('long_sword', 'legendary', [{ id: elem, roll: 0.8 }]);
  p.equip.chest = kit ? leg('aegis_of_the_fallen') : make('plate', 'legendary');
  p.equip.helm = kit ? leg('crown_of_embers') : make('great_helm', 'rare');
  p.equip.cloak = kit ? leg('mantle_of_souls') : make('heavy_cloak', 'magic');
  p.equip.amulet = kit ? leg('lantern_of_the_lost') : make('amulet', 'rare');
  p.equip.ring1 = make('ring', 'rare');
  BD.sim.stats.bump(p);
  const spot = BD.sim.entities.nearestFree(w.floor, p.x + 3, p.y + 1, 5);
  if (spot) BD.sim.run.placePlayer(w, spot);
  for (let i = 0; i < 40; i++) {
    D.step(50);
    BD.view.render.draw(w, 0, 50);
  }
  D.render(1);
  D.capture();
};
