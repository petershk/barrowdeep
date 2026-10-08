// @ts-check
// Options (accessibility, audio, display) and Controls (rebinding) panels (01 §11, 07 §6.6).
(function (BD) {
  'use strict';

  const { h } = BD.ui.dom;
  const Options = () => BD.ui.options;

  function slider(key, label, min, max, step, suffix) {
    const val = h('span.opt-val', String(Options().get(key)) + (suffix || ''));
    const inp = /** @type {HTMLInputElement} */ (h('input', { type: 'range', min, max, step, value: Options().get(key) }));
    inp.addEventListener('input', () => {
      Options().set(key, Number(inp.value));
      val.textContent = inp.value + (suffix || '');
    });
    return h('div.opt-row', [h('span.opt-label', label), inp, val]);
  }
  function toggle(key, label) {
    const inp = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox' }));
    inp.checked = !!Options().get(key);
    inp.addEventListener('change', () => Options().set(key, inp.checked));
    return h('label.opt-row', [h('span.opt-label', label), inp]);
  }
  function choice(key, label, opts) {
    const sel = /** @type {HTMLSelectElement} */ (h('select', opts.map(([v, t]) => h('option', { value: v }, t))));
    sel.value = String(Options().get(key));
    sel.addEventListener('change', () => Options().set(key, isNaN(Number(sel.value)) ? sel.value : Number(sel.value)));
    return h('div.opt-row', [h('span.opt-label', label), sel]);
  }

  function build(el) {
    el.appendChild(h('h2', 'Options'));
    el.appendChild(h('div.opt-cols', [
      h('div.col', [
        h('h3', 'Audio'),
        slider('master', 'Master volume', 0, 100, 1, '%'),
        slider('effects', 'Effects', 0, 100, 1, '%'),
        slider('music', 'Music', 0, 100, 1, '%'),
        slider('ambience', 'Ambience', 0, 100, 1, '%'),
        h('h3', 'Display'),
        choice('zoom', 'Zoom', [['auto', 'Auto'], [1, '1.0×'], [1.5, '1.5×'], [2, '2.0×'], [2.5, '2.5×']]),
        slider('uiScale', 'UI scale', 0.8, 1.4, 0.05, '×'),
        choice('damageNumbers', 'Floating text', [['full', 'Full'], ['numbers', 'Numbers only'], ['off', 'Off']]),
        toggle('alwaysBars', 'Always show enemy health bars'),
      ]),
      h('div.col', [
        h('h3', 'Accessibility'),
        slider('shake', 'Screenshake', 0, 100, 5, '%'),
        slider('flash', 'Flash intensity', 0, 100, 5, '%'),
        choice('particles', 'Particles', [['full', 'Full'], ['reduced', 'Reduced']]),
        toggle('colorblind', 'Colour-blind palette (shape tags, hatching)'),
        toggle('slowmo', 'Slow-motion mode (70% speed)'), toggle('wasd', 'WASD movement'), toggle('hints', 'Show hints'),
        h('button.btn', { data: { action: 'resetHints' } }, 'Reset hints'),
      ]),
    ]));
    el.appendChild(h('div.row', { style: 'justify-content:center;margin-top:12px' }, [
      h('button.btn', { data: { action: 'close' } }, 'Close'),
    ]));
    BD.ui.dom.delegate(el, {
      close: () => BD.ui.panels.close('options'),
      resetHints: () => { if (BD.ui.hints) BD.ui.hints.reset(); },
    });
  }

  let waiting = null;
  function buildControls(el) {
    const Bindings = BD.input.bindings;
    el.appendChild(h('h2', 'Controls'));
    el.appendChild(h('div.muted',
      'Mouse: left click to move, attack and interact (hold to keep moving; hold on an enemy to keep attacking). '
      + 'A skill on the left-mouse slot replaces the basic attack. '
      + 'Right click: the right-mouse skill. Shift + left click: attack in place. Wheel: zoom.'));
    const grid = h('div.bind-grid');
    for (const k in Bindings.DEFAULTS) {
      grid.appendChild(h('span', Bindings.LABELS[k]));
      const label = waiting === k ? 'Press a key…' : Bindings.pretty(Bindings.keyOf(k));
      grid.appendChild(h('button.btn.tiny' + (waiting === k ? '.primary' : ''), { data: { action: 'rebind', key: k } }, label));
    }
    el.appendChild(grid);
    el.appendChild(h('div.muted',
      'Gamepad: left stick moves; A attacks; X / Y / B / RB skills 1–4; RT the right-mouse skill; '
      + 'LB Evade; LT flask; D-pad up interacts; Start inventory; Back pause.'));
    el.appendChild(h('div.row', { style: 'justify-content:center;margin-top:12px' }, [
      h('button.btn', { data: { action: 'defaults' } }, 'Defaults'),
      h('button.btn', { data: { action: 'close' } }, 'Close'),
    ]));
    BD.ui.dom.delegate(el, {
      rebind: (t) => {
        waiting = t.dataset.key;
        BD.ui.panels.rebuild('controls');
      },
      defaults: () => {
        BD.input.bindings.load(null);
        Options().save();
        BD.ui.panels.rebuild('controls');
      },
      close: () => {
        waiting = null;
        BD.ui.panels.close('controls');
      },
    });
  }
  function controlsKey(ev) {
    if (!waiting) return false;
    if (ev.code !== 'Escape') {
      BD.input.bindings.set(waiting, ev.code);
      Options().save();
    }
    waiting = null;
    BD.ui.panels.rebuild('controls');
    return true;
  }

  BD.ui.panels.register({ id: 'options', build });
  BD.ui.panels.register({ id: 'controls', build: buildControls, onKey: controlsKey });
})(globalThis.BD);
