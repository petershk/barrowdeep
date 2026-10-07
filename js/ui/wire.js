// @ts-check
// UI subscriptions: sim events → banner, feed, reject reasons, panel refreshes.
(function (BD) {
  'use strict';

  function wire(bus) {
    BD.ui.tooltip.init();
    const L = BD.ui.log;
    if (BD.ui.hints) BD.ui.hints.wire(bus);
    bus.on('announce', (ev) => L.announce(ev.text, ev.style));
    bus.on('ability.reject', (ev) => L.denied(ev.reason));
    bus.on('levelup', (ev) => {
      L.line('You reached level ' + ev.level + '. Spend your points: C attributes, K skills.', 'gold');
      BD.ui.panels.markDirty('character');
      BD.ui.panels.markDirty('skills');
    });
    bus.on('monster.alert', (ev) => { if (ev.keeper) L.line('A Keeper stirs.', 'gold'); });
    bus.on('waypoint.activate', () => L.line('Waypoint attuned. The flask is refilled.'));
    bus.on('floor.enter', (ev) => {
      const f = BD.app.world.floor;
      let name;
      if (ev.key === 'town') name = 'Town of Brennor';
      else if (typeof ev.key === 'string') name = 'The guardian\'s lair';
      else name = BD.data.biomes[f.biome].name + ' — floor ' + ev.n;
      L.announce(name, 'place');
    });
    bus.on('ui.panel', () => { if (BD.ui.tooltip) BD.ui.tooltip.hide(); });
    bus.on('skill.learn', () => BD.ui.panels.markDirty('skills'));
    bus.on('ui.open', (ev) => BD.ui.panels.open(ev.panel, ev.arg));
    bus.on('waypoint.touch', () => BD.ui.panels.open('waypoints'));
    bus.on('npc.talk', (ev) => {
      if (BD.ui.panels.defs[ev.panel]) BD.ui.panels.open(ev.panel);
      else L.line(ev.name + ' has nothing for you yet.');
    });
    bus.on('save.fail', () => {
      L.line('Saving failed: storage is full. Export your characters from the Continue screen.', 'bad');
      document.body.classList.add('save-failed');
    });
    bus.on('seal.break', () => L.line('The seal breaks. The way down is open.', 'gold'));
    bus.on('key.pickup', () => L.line('You take the Gate Key. The guardian waits beyond the gate.', 'gold'));
    bus.on('act.complete', (ev) => L.announce('Act ' + ['I', 'II', 'III', 'IV'][ev.act - 1] + ' complete', 'boss'));
    bus.on('keeper.ping', () => L.line('You sense the Keeper. (Map)', 'gold'));
    bus.on('shrine.offer', (ev) => BD.ui.panels.open('shrinechoice', { options: ev.options }));
    const eventDone = {
      cursed_chest: 'The curse lifts.',
      shrine: 'The shrine\'s power settles on you.',
      hoarder: 'The Hoarder falls. Its hoard spills out.',
      blood_altar: 'The altar drinks, and gives.',
      restless_dead: 'The dead lie still at last.',
    };
    bus.on('event.complete', (ev) => L.line(eventDone[ev.id] || 'Done.', 'gold'));
    bus.on('event.wave', (ev) => L.line('Wave ' + ev.n + '.'));
    bus.on('trap.disarm', (ev) => L.line('Trap disarmed (+' + ev.gold + ' gold).'));
    bus.on('trap.disarm.start', () => L.line('Disarming… hold still.'));
    bus.on('sanctum.seal', () => L.announce('The Sanctum seals behind you', 'boss'));
  }

  BD.ui.wire = wire;
})(globalThis.BD);
