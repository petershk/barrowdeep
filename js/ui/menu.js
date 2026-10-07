// @ts-check
// Main menu (New, Continue/Load, Soul Shrine, Options, Controls, Credits) and the pause menu.
(function (BD) {
  'use strict';

  const { h } = BD.ui.dom;

  function buildMain(el) {
    BD.app.state = 'menu';
    el.appendChild(h('div.title', [h('div.title-main', 'BARROWDEEP'), h('div.title-sub', 'Beneath the church of Brennor, the dead do not rest.')]));
    const has = BD.ui.saves ? BD.ui.saves.list().some((c) => c.alive) : false;
    const meta = BD.ui.meta ? BD.ui.meta.get() : null;
    const btns = [
      h('button.btn.primary.big', { data: { action: 'new' } }, 'New Character'),
      h('button.btn.big', { data: { action: 'load' }, disabled: !has }, 'Continue'),
      h('button.btn.big', { data: { action: 'shrine' }, disabled: !BD.ui.panels.defs.shrine }, 'Soul Shrine' + (meta ? ' (' + meta.souls + ' souls)' : '')),
      h('button.btn.big', { data: { action: 'options' } }, 'Options'),
      h('button.btn.big', { data: { action: 'controls' } }, 'Controls'),
      h('button.btn.big', { data: { action: 'credits' } }, 'Credits'),
    ];
    el.appendChild(h('div.menu-btns', btns));
    BD.ui.dom.delegate(el, {
      new: () => { BD.ui.panels.close('menu'); BD.ui.panels.open('create'); },
      load: () => { BD.ui.panels.close('menu'); BD.ui.panels.open('load'); },
      shrine: () => { BD.ui.panels.close('menu'); BD.ui.panels.open('shrine'); },
      options: () => BD.ui.panels.open('options'),
      controls: () => BD.ui.panels.open('controls'),
      credits: () => BD.ui.panels.open('credits'),
    });
    if (BD.audio.music) BD.audio.music.play('menu');
  }

  function buildPause(el) {
    const w = BD.app.world;
    el.appendChild(h('h2', 'Paused'));
    el.appendChild(h('div.menu-btns', [
      h('button.btn.big.primary', { data: { action: 'resume' } }, 'Resume'),
      h('button.btn.big', { data: { action: 'journal' } }, 'Journal'),
      h('button.btn.big', { data: { action: 'options' } }, 'Options'),
      h('button.btn.big', { data: { action: 'controls' } }, 'Controls'),
      h('button.btn.big', { data: { action: 'quit' } }, 'Save & Quit'),
    ]));
    const seed = h('input.seed', { type: 'text', readonly: true, value: w ? w.run.seed : '' });
    el.appendChild(h('div.row', { style: 'margin-top:12px;justify-content:center' }, [h('span.muted', 'Seed'), seed]));
    BD.ui.dom.delegate(el, {
      resume: () => BD.ui.panels.close('pause'),
      journal: () => { BD.ui.panels.close('pause'); BD.ui.panels.open('journal'); },
      options: () => BD.ui.panels.open('options'),
      controls: () => BD.ui.panels.open('controls'),
      quit: () => { if (BD.app.saveNow) BD.app.saveNow('quit'); BD.app.toMenu(); },
    });
  }

  function buildCredits(el) {
    el.appendChild(h('h2', 'Credits'));
    el.appendChild(h('div.col', [
      h('p', 'Barrowdeep — a gothic action-RPG for the browser.'),
      h('p.muted', 'Design, code, pixel art and procedural audio: the Barrowdeep project.'),
      h('p.muted', 'Music: the original Barrowdeep soundtrack (menu, town, dungeon, boss).'),
      h('p.muted', 'Built with plain JavaScript and Canvas. No dependencies.'),
      h('button.btn', { data: { action: 'close' } }, 'Close'),
    ]));
    BD.ui.dom.delegate(el, { close: () => BD.ui.panels.close('credits') });
  }

  BD.ui.panels.register({ id: 'menu', build: buildMain, closeOnEsc: false, full: true });
  BD.ui.panels.register({ id: 'pause', build: buildPause });
  BD.ui.panels.register({ id: 'credits', build: buildCredits });

  BD.ui.menu = { open: () => { BD.ui.panels.closeAll(); BD.ui.panels.open('menu'); } };
})(globalThis.BD);
