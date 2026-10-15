// @ts-check
// Panel buttons, bottom-left: Character, Inventory, Skills, Menu — each with its key, so the panels are
// discoverable without the controls screen. A gold badge shows unspent attribute / skill points.
(function (BD) {
  'use strict';

  const { h, setText, root } = BD.ui.dom;
  const BUTTONS = [
    { action: 'character', label: 'Character',
      icon: 'M12 4a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7M4.5 21c0-4.2 3.4-7.5 7.5-7.5s7.5 3.3 7.5 7.5' },
    { action: 'inventory', label: 'Inventory', icon: 'M5 9h14l-1.2 11H6.2zM9 9V7a3 3 0 0 1 6 0v2' },
    { action: 'skills', label: 'Skills', icon: 'M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z' },
    { action: 'menu', label: 'Menu', icon: 'M4 7h16M4 12h16M4 17h16' },
  ];
  let el = null;
  const parts = {};

  function press(action) {
    if (BD.app.state !== 'playing') return;
    if (action === 'menu') BD.ui.panels.open('pause');
    else BD.ui.panels.hotkey(action);
  }

  function mount() {
    el = h('div.hud-menu');
    for (const b of BUTTONS) {
      const key = h('span.hm-key');
      const badge = h('span.hm-badge.hidden');
      const btn = h('button.hm-btn', { type: 'button', 'aria-label': b.label, title: b.label }, [
        BD.ui.hudOrbs.icon(b.icon, 24), key, badge,
      ]);
      btn.addEventListener('mousedown', (ev) => {
        ev.stopPropagation();
        press(b.action);
      });
      parts[b.action] = { btn, key, badge };
      el.appendChild(btn);
    }
    root().appendChild(el);
  }

  function badge(part, n, what) {
    part.badge.classList.toggle('hidden', n <= 0);
    part.btn.classList.toggle('has-points', n > 0);
    setText(part.badge, String(n));
    const plural = n > 1 ? 's' : '';
    if (n > 0) part.btn.title = n + ' ' + what + ' point' + plural + ' to spend';
    else part.btn.title = part.btn.getAttribute('aria-label');
  }

  function frame(world) {
    if (!el) mount();
    for (const b of BUTTONS) setText(parts[b.action].key, BD.ui.hudOrbs.keyLabel(b.action).replace('Escape', 'Esc'));
    const u = world.player.unspent;
    badge(parts.character, u.attr, 'attribute');
    badge(parts.skills, u.skill, 'skill');
  }

  BD.ui.hud.add({ frame });
})(globalThis.BD);
