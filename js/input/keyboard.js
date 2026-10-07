// @ts-check
// Keyboard → actions via bindings. Panels get first refusal on keys (Esc, hotkeys).
(function (BD) {
  'use strict';

  const Bindings = BD.input.bindings;
  const SKILL_SLOTS = { skill1: 's1', skill2: 's2', skill3: 's3', skill4: 's4' };
  const down = new Set();

  function attach() {
    window.addEventListener('keydown', (ev) => {
      if (ev.target && /** @type {any} */ (ev.target).tagName === 'INPUT') return;
      if (ev.code === 'AltLeft' || ev.code === 'AltRight' || ev.code === 'Tab' || ev.code === 'Space') ev.preventDefault();
      BD.app.userGesture();
      const action = Bindings.actionFor(ev.code);
      if (BD.ui.panels && BD.ui.panels.onKey(ev, action)) {
        ev.preventDefault();
        return;
      }
      if (!action) return;
      const repeat = down.has(ev.code);
      down.add(ev.code);
      handle(action, repeat);
    });
    window.addEventListener('keyup', (ev) => {
      down.delete(ev.code);
      const action = Bindings.actionFor(ev.code);
      if (action && SKILL_SLOTS[action]) BD.input.intent.hold.keys[SKILL_SLOTS[action]] = false;
      if (action === 'labels') BD.app.showLabels = false;
    });
    window.addEventListener('blur', () => {
      down.clear();
      BD.input.intent.hold.keys = {};
      BD.app.showLabels = false;
    });
  }

  function handle(action, repeat) {
    const app = BD.app, w = app.world;
    if (!w) return;
    const m = BD.input.mouse;
    if (SKILL_SLOTS[action]) {
      if (repeat) return;
      BD.input.intent.hold.keys[SKILL_SLOTS[action]] = true;
      BD.input.intent.skill(SKILL_SLOTS[action], m.hoverTile, m.screen, false);
      return;
    }
    if (repeat && action !== 'labels') return;
    const p = w.player;
    switch (action) {
      case 'evade': {
        if (app.paused()) return;
        let dx = 0, dy = 0;
        const it = p.intent;
        if (p.move) {
          dx = p.move.toX - p.move.fromX;
          dy = p.move.toY - p.move.fromY;
        } else if (it && it.path && it.path.length) {
          dx = it.path[0][0] - p.x;
          dy = it.path[0][1] - p.y;
        } else if (m.hoverTile) {
          dx = m.hoverTile.x - p.x;
          dy = m.hoverTile.y - p.y;
        }
        const l = Math.max(Math.abs(dx), Math.abs(dy)) || 1;
        BD.input.intent.issue({ type: 'Evade', dirX: Math.round(dx / l), dirY: Math.round(dy / l) });
        break;
      }
      case 'flask':
        if (!app.paused()) BD.input.intent.issue({ type: 'DrinkFlask' });
        break;
      case 'portal':
        if (!app.paused()) BD.input.intent.issue({ type: 'ReadScroll', kind: 'portal' });
        break;
      case 'labels':
        app.showLabels = true;
        break;
      case 'bars':
        app.showBars = !app.showBars;
        break;
      case 'pause':
        app.togglePause();
        break;
      default:
        if (BD.ui.panels) BD.ui.panels.hotkey(action);
    }
  }

  BD.input.keyboard = { attach, down };
})(globalThis.BD);
