// @ts-check
// Touch (07 §6.6 — works, not primary). A virtual stick bottom-left and buttons bottom-right feed the
// gamepad's virtual pad, so movement, auto-lock, smart aim and the interact prompt are shared. Taps on
// the world still arrive as mouse clicks (engage / interact); long-press shows tooltips.
(function (BD) {
  'use strict';

  const Gamepad = () => BD.input.gamepad;
  let ui = null, stick = null, knob = null, stickId = null, origin = null;
  const R = 56;

  function attach() {
    window.addEventListener('touchstart', enable, { once: true, passive: true });
    longPress();
  }
  function enable() {
    if (ui) return;
    const { h, root } = BD.ui.dom;
    const BTN = Gamepad().BTN;
    const btn = (label, b, cls) => touchButton(h, label, b, cls);
    stick = h('div.touch-stick');
    knob = h('div.touch-knob');
    stick.appendChild(knob);
    ui = h('div.touch-ui', [
      stick,
      h('div.touch-btns', [
        btn('Attack', BTN.A, 'big'), btn('RMB', BTN.RT), btn('1', BTN.X), btn('2', BTN.Y), btn('3', BTN.B), btn('4', BTN.RB),
        btn('Evade', BTN.LB), btn('Flask', BTN.LT), btn('Use', BTN.UP),
      ]),
      h('div.touch-top', [btn('Pause', BTN.BACK, 'small'), btn('Bag', BTN.START, 'small'), btn('Map', BTN.RS, 'small')]),
    ]);
    root().appendChild(ui);
    document.body.classList.add('touch');
    Gamepad().virtual.active = true;
    listenStick();
  }

  /** a button that holds virtual-pad button b down while touched */
  function touchButton(h, label, b, cls) {
    const el = h('div.touch-btn' + (cls ? '.' + cls : ''), label);
    const set = (on) => {
      const v = Gamepad().virtual.buttons[b];
      v.pressed = on;
      v.value = on ? 1 : 0;
      el.classList.toggle('down', on);
    };
    el.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      BD.app.userGesture();
      set(true);
    }, { passive: false });
    el.addEventListener('touchend', (e) => {
      e.preventDefault();
      set(false);
    }, { passive: false });
    el.addEventListener('touchcancel', () => set(false));
    return el;
  }

  /** the stick follows one touch from touchstart on it until that touch ends */
  function listenStick() {
    stick.addEventListener('touchstart', (e) => {
      e.preventDefault();
      BD.app.userGesture();
      const t = e.changedTouches[0];
      stickId = t.identifier;
      const r = stick.getBoundingClientRect();
      origin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      move(t);
    }, { passive: false });
    window.addEventListener('touchmove', (e) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === stickId) {
          e.preventDefault();
          move(t);
        }
      }
    }, { passive: false });
    const end = (e) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier !== stickId) continue;
        stickId = null;
        Gamepad().virtual.axes[0] = Gamepad().virtual.axes[1] = 0;
        knob.style.transform = '';
      }
    };
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);
  }
  function move(t) {
    let dx = t.clientX - origin.x, dy = t.clientY - origin.y;
    const l = Math.hypot(dx, dy);
    if (l > R) {
      dx = (dx / l) * R;
      dy = (dy / l) * R;
    }
    knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    Gamepad().virtual.axes[0] = dx / R;
    Gamepad().virtual.axes[1] = dy / R;
  }

  /** long-press anything with a hover tooltip: show it and swallow the click that follows */
  function longPress() {
    let timer = 0, fired = false;
    window.addEventListener('touchstart', (e) => {
      const el = /** @type {HTMLElement} */ (e.target);
      if (!el || !el.closest || !el.closest('.panel, .hud')) return;
      fired = false;
      clearTimeout(timer);
      timer = setTimeout(() => {
        fired = true;
        const t = e.touches[0];
        for (const type of ['mouseover', 'mouseenter']) {
          el.dispatchEvent(new MouseEvent(type, { bubbles: type === 'mouseover', clientX: t.clientX, clientY: t.clientY }));
        }
      }, 450);
    }, { passive: true });
    const cancel = () => clearTimeout(timer);
    window.addEventListener('touchmove', cancel, { passive: true });
    window.addEventListener('touchend', (e) => {
      cancel();
      if (fired) {
        e.preventDefault();
        fired = false;
      }
    }, { passive: false });
  }

  BD.input.touch = { attach, enable };
})(globalThis.BD);
