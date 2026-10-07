// @ts-check
// Contextual one-time hints (07 §6.5). Each fires once per profile (stored in meta.hints) and can be
// reset from Options. One card at a time, queued, above the skill bar; click or a timer dismisses it.
(function (BD) {
  'use strict';

  const { h, root } = BD.ui.dom;
  const key = (a) => BD.input.bindings.pretty(BD.input.bindings.keyOf(a));
  const RESOURCE = {
    rage: () => 'Rage builds as you hit and get hit, and drains out of combat. '
      + 'Above 50 you gain Momentum: more damage and attack speed.',
    energy: () => 'Energy refills on its own. Builders add combo points (the pips); finishers spend them all for a bigger hit.',
    mana: () => 'Mana refills slowly; Magic raises it. '
      + 'Mix elements: fire on frozen, cold on shocked and lightning on burning trigger Reactions.',
    focus: () => 'Each hit without moving adds a focus stack (+crit). Moving or evading drops stacks, so pick your spot.',
  };
  /** id → { title, text() } */
  const HINTS = {
    enemy: {
      title: 'Fight',
      text: () => 'Click an enemy to attack. Hold Shift to attack in place. Right-click and '
        + key('skill1') + '–' + key('skill4') + ' use skills.',
    },
    loot: {
      title: 'Loot',
      text: () => 'Hover an item to compare it with what you wear. Hold ' + key('labels') + ' to show every label; click to pick up.',
    },
    level: {
      title: 'Level up',
      text: () => 'You have points to spend: ' + key('character') + ' for attributes, ' + key('skills') + ' for skills.',
    },
    resource: {
      title: 'Your resource',
      text: () => {
        const w = BD.app.world;
        const r = BD.data.classes[w.player.def].resource;
        return (RESOURCE[r] || (() => ''))();
      },
    },
    telegraph: { title: 'Danger', text: () => 'Move out of the red! ' + key('evade') + ' evades through attacks.' },
    flask: { title: 'Flask', text: () => key('flask') + ' drinks your flask. Kills and waypoints refill its charges.' },
    keeper: { title: 'The Keeper', text: () => 'Each floor has a Keeper. Slay it for the seal or key, then take the stairs down.' },
    seal: {
      title: 'Seal',
      text: () => 'The seal is broken; the way down is open. ' + key('portal') + ' reads a Town Portal if you need to restock.',
    },
    town: {
      title: 'Brennor',
      text: () => 'Garran the Smith trades and enhances gear. '
        + 'Mother Alys at the temple sells scrolls, blessings and flask upgrades. Vesk gambles on unknown items. '
        + 'Rest and stash at your hearth; the waypoint takes you back down.',
    },
    death: {
      title: 'Death',
      text: () => 'Souls from a fallen hero persist. Spend them at the Soul Shrine on the main menu for permanent unlocks.',
    },
  };

  let card = null, shownT = 0, queue = [], current = null;
  /** the hint ids already shown, kept in meta so they survive across characters */
  function seen() {
    const m = BD.ui.meta.get();
    m.hints = m.hints || {};
    return m.hints;
  }
  function enabled() {
    const o = BD.ui.options;
    return !o || o.get('hints') !== false;
  }

  function show(id) {
    if (!enabled() || seen()[id] || current === id || queue.includes(id)) return;
    queue.push(id);
    if (!current) next();
  }
  function next() {
    current = queue.shift() || null;
    if (!current) {
      if (card) card.classList.remove('show');
      return;
    }
    const hn = HINTS[current];
    seen()[current] = 1;
    BD.ui.meta.save();
    if (!card) {
      card = h('div.hint');
      card.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        dismiss();
      });
      root().appendChild(card);
    }
    card.textContent = '';
    card.appendChild(h('div.hint-title', hn.title));
    card.appendChild(h('div.hint-text', hn.text()));
    card.appendChild(h('div.hint-close', 'click to dismiss'));
    card.classList.add('show');
    shownT = 9000;
  }
  function dismiss() {
    if (card) card.classList.remove('show');
    current = null;
    setTimeout(next, 350);
  }
  function frame(ms) {
    if (!current || !card) return;
    // panels own the screen: hide the card (and hold its timer) while one is open
    const covered = BD.ui.panels.top() || BD.app.state !== 'playing';
    card.classList.toggle('show', !covered);
    if (!covered && (shownT -= ms) <= 0) dismiss();
  }
  function reset() {
    BD.ui.meta.get().hints = {};
    BD.ui.meta.save();
  }

  function wire(bus) {
    const currentPlayer = () => BD.app.world && BD.app.world.player;
    bus.on('monster.alert', () => show('enemy'));
    bus.on('loot.drop', (ev) => {
      if (ev.kind === 'item') show('loot');
    });
    bus.on('levelup', () => show('level'));
    bus.on('ability.cast', (ev) => {
      const p = currentPlayer();
      if (p && ev.id === p.id && ev.abilityId !== 'attack') show('resource');
    });
    bus.on('telegraph.start', (ev) => {
      if (!ev.friendly) show('telegraph');
    });
    bus.on('damage', (ev) => {
      const p = currentPlayer();
      if (p && ev.tgtId === p.id && p.hp < BD.sim.stats.statsOf(BD.app.world, p).maxLife * 0.5) show('flask');
    });
    bus.on('keeper.reveal', () => show('keeper'));
    bus.on('monster.alert', (ev) => {
      if (ev.keeper) show('keeper');
    });
    bus.on('seal.break', () => show('seal'));
    bus.on('town.arrive', () => show('town'));
    bus.on('run.death', () => show('death'));
    bus.on('app.world', () => {
      queue = [];
      if (current) dismiss();
    });
  }

  BD.ui.hints = { HINTS, show, reset, frame, wire, get current() { return current; } };
})(globalThis.BD);
