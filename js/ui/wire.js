// @ts-check
// UI subscriptions: sim events → banner, feed, reject reasons, panel refreshes.
(function (BD) {
  'use strict';

  function wire(bus) {
    BD.ui.tooltip.init();
    const Log = BD.ui.log;
    if (BD.ui.hints) BD.ui.hints.wire(bus);
    bus.on('announce', (ev) => Log.announce(ev.text, ev.style));
    bus.on('ability.reject', (ev) => Log.denied(ev.reason));
    bus.on('resource.short', (ev) => {
      if (BD.ui.hudOrbs) BD.ui.hudOrbs.short();
      Log.denied(BD.data.strings.t('no_resource', { res: ev.res }));
    });
    bus.on('levelup', (ev) => {
      Log.line('You reached level ' + ev.level + '. Spend your points: C attributes, K skills.', 'gold');
      BD.ui.panels.markDirty('character');
      BD.ui.panels.markDirty('skills');
    });
    bus.on('monster.alert', (ev) => {
      if (ev.keeper) Log.line('A Keeper stirs.', 'gold');
    });
    bus.on('waypoint.activate', () => Log.line('Waypoint attuned. The flask is refilled.'));
    bus.on('floor.enter', (ev) => {
      const f = BD.app.world.floor;
      let name;
      if (ev.key === 'town') name = 'Town of Brennor';
      else if (typeof ev.key === 'string') name = 'The guardian\'s lair';
      else name = BD.data.biomes[f.biome].name + ' — floor ' + ev.n;
      Log.announce(name, 'place');
    });
    bus.on('ui.panel', () => {
      if (BD.ui.tooltip) BD.ui.tooltip.hide();
    });
    bus.on('skill.learn', () => BD.ui.panels.markDirty('skills'));
    bus.on('ui.open', (ev) => BD.ui.panels.open(ev.panel, ev.arg));
    bus.on('waypoint.touch', () => BD.ui.panels.open('waypoints'));
    bus.on('npc.talk', (ev) => {
      if (BD.ui.panels.defs[ev.panel]) BD.ui.panels.open(ev.panel);
      else Log.line(ev.name + ' has nothing for you yet.');
    });
    bus.on('save.fail', () => {
      Log.line('Saving failed: storage is full. Export your characters from the Continue screen.', 'bad');
      document.body.classList.add('save-failed');
    });
    bus.on('seal.break', () => Log.line('The seal breaks. The way down is open.', 'gold'));
    bus.on('key.pickup', () => Log.line('You take the Gate Key. The guardian waits beyond the gate.', 'gold'));
    bus.on('act.complete', (ev) => Log.announce('Act ' + ['I', 'II', 'III', 'IV'][ev.act - 1] + ' complete', 'boss'));
    bus.on('keeper.ping', () => Log.line('You sense the Keeper. (Map)', 'gold'));
    bus.on('shrine.offer', (ev) => BD.ui.panels.open('shrinechoice', { options: ev.options }));
    const eventDone = {
      cursed_chest: 'The curse lifts.',
      shrine: 'The shrine\'s power settles on you.',
      hoarder: 'The Hoarder falls. Its hoard spills out.',
      blood_altar: 'The altar drinks, and gives.',
      restless_dead: 'The dead lie still at last.',
    };
    bus.on('event.complete', (ev) => Log.line(eventDone[ev.id] || 'Done.', 'gold'));
    bus.on('event.wave', (ev) => Log.line('Wave ' + ev.n + '.'));
    bus.on('trap.disarm', (ev) => Log.line('Trap disarmed (+' + ev.gold + ' gold).'));
    bus.on('trap.disarm.start', () => Log.line('Disarming… hold still.'));
    bus.on('sanctum.seal', () => Log.announce('The Sanctum seals behind you', 'boss'));
  }

  BD.ui.wire = wire;
})(globalThis.BD);
