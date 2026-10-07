// @ts-check
// UI subscriptions: sim events → banner, feed, reject reasons, panel refreshes.
(function (BD) {
  'use strict';

  function wire(bus) {
    BD.ui.tooltip.init();
    const L = BD.ui.log;
    bus.on('announce', (ev) => L.announce(ev.text, ev.style));
    bus.on('ability.reject', (ev) => L.denied(ev.reason));
    bus.on('levelup', (ev) => { L.line('You reached level ' + ev.level + '. Spend your points: C attributes, K skills.', 'gold'); BD.ui.panels.markDirty('character'); BD.ui.panels.markDirty('skills'); });
    bus.on('monster.alert', (ev) => { if (ev.keeper) L.line('A Keeper stirs.', 'gold'); });
    bus.on('waypoint.activate', () => L.line('Waypoint attuned. The flask is refilled.'));
    bus.on('floor.enter', (ev) => {
      const f = BD.app.world.floor;
      const name = ev.key === 'town' ? 'Town of Brennor' : typeof ev.key === 'string' ? 'The guardian\'s lair' : BD.data.biomes[f.biome].name + ' — floor ' + ev.n;
      L.announce(name, 'place');
    });
    bus.on('ui.panel', () => { if (BD.ui.tooltip) BD.ui.tooltip.hide(); });
    bus.on('skill.learn', () => BD.ui.panels.markDirty('skills'));
    bus.on('ui.open', (ev) => BD.ui.panels.open(ev.panel, ev.arg));
  }

  BD.ui.wire = wire;
})(globalThis.BD);
