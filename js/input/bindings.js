// @ts-check
// Default key bindings (07 §6.6). Rebindable; saved in options.
(function (BD) {
  'use strict';

  const DEFAULTS = {
    skill1: 'Digit1', skill2: 'Digit2', skill3: 'Digit3', skill4: 'Digit4',
    evade: 'Space', flask: 'KeyQ', portal: 'KeyR', inventory: 'KeyI', character: 'KeyC', skills: 'KeyK',
    journal: 'KeyJ', map: 'Tab', labels: 'AltLeft', bars: 'KeyV', pause: 'KeyP', menu: 'Escape',
    up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD',
  };
  const LABELS = {
    skill1: 'Skill slot 1', skill2: 'Skill slot 2', skill3: 'Skill slot 3', skill4: 'Skill slot 4', evade: 'Evade',
    flask: 'Drink flask', portal: 'Read Town Portal', inventory: 'Inventory', character: 'Character sheet', skills: 'Skills',
    journal: 'Journal', map: 'Map overlay', labels: 'Show item labels (hold)', bars: 'Toggle health bars', pause: 'Tactical pause',
    menu: 'Menu / close', up: 'Move up (WASD mode)', down: 'Move down (WASD mode)',
    left: 'Move left (WASD mode)', right: 'Move right (WASD mode)',
  };

  let map = Object.assign({}, DEFAULTS);
  function load(saved) { map = Object.assign({}, DEFAULTS, saved || {}); }
  function actionFor(code) {
    for (const k in map) if (map[k] === code) return k;
    if (code === 'AltRight' && map.labels === 'AltLeft') return 'labels';
    if (code === 'ShiftLeft' || code === 'ShiftRight') return null;
    return null;
  }
  function keyOf(action) { return map[action]; }
  function set(action, code) {
    for (const k in map) if (map[k] === code) map[k] = '';
    map[action] = code;
  }
  function pretty(code) {
    if (!code) return '—';
    return code.replace(/^Key/, '').replace(/^Digit/, '').replace(/Left$|Right$/, '');
  }

  BD.input.bindings = { DEFAULTS, LABELS, load, actionFor, keyOf, set, pretty, get map() { return map; } };
})(globalThis.BD);
