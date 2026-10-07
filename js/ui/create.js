// @ts-check
// Character creation (01 §5): class → first skill (three tier-1 skills, deeper skills visible but
// locked) → background → name → difficulty (in plain words).
(function (BD) {
  'use strict';

  const { h } = BD.ui.dom;
  let st = null;
  const NAMES = ['Aldric', 'Brannoc', 'Cwen', 'Edda', 'Hollis', 'Isolde', 'Maren', 'Osric', 'Rowan', 'Sabine', 'Tamsin', 'Wulfric', 'Ysolde', 'Gareth', 'Mira', 'Corvin'];

  function onOpen() {
    st = { step: 0, cls: 'fighter', skill: null, background: 'wanderer', name: NAMES[Math.floor(Math.random() * NAMES.length)], difficulty: 'penitent' };
  }
  const ready = (cls) => Object.values(BD.data.skills).some((s) => s.cls === cls);

  function build(el) {
    const steps = ['Class', 'First skill', 'Background', 'Name', 'Difficulty'];
    el.appendChild(h('h2', 'A New Descent'));
    el.appendChild(h('div.steps', steps.map((s, i) => h('span.step' + (i === st.step ? '.on' : i < st.step ? '.done' : ''), (i + 1) + '. ' + s))));
    const body = h('div.create-body');
    el.appendChild(body);
    const meta = BD.ui.meta ? BD.ui.meta.get() : { unlocks: {} };
    if (st.step === 0) {
      const grid = h('div.class-grid');
      for (const c of Object.values(BD.data.classes)) {
        const ok = ready(c.id);
        grid.appendChild(h('div.class-card' + (st.cls === c.id ? '.sel' : '') + (ok ? '' : '.locked'), { data: { action: ok ? 'cls' : '', id: c.id } }, [
          h('img.class-art', { src: BD.view.sprites.dataURL(c.art, 4), alt: '' }),
          h('div.class-name', c.name), h('div.class-res', 'Resource: ' + c.resource),
          h('div.class-fantasy', c.fantasy), h('div.class-verb.muted', c.verb),
          h('div.class-trait', [h('b', c.trait.name + ': '), c.trait.desc]),
        ]));
      }
      body.appendChild(grid);
    } else if (st.step === 1) {
      const cls = BD.data.classes[st.cls];
      const cols = h('div.skill-cols');
      const fake = previewPlayer();
      for (const br of cls.branches) {
        const list = Object.values(BD.data.skills).filter((s) => s.cls === st.cls && s.branch === br.id).sort((a, b) => a.tier - b.tier);
        const col = h('div.skill-col', [h('h3', br.name)]);
        for (const ab of list) {
          const pick = ab.tier === 1;
          const card = h('div.skill-card' + (pick ? '' : '.locked') + (st.skill === ab.id ? '.sel' : ''), { data: { action: pick ? 'skill' : '', id: ab.id } }, [
            h('img.sk-icon', { src: BD.view.icons.url(ab.icon), alt: '' }),
            h('div.skill-meta', [h('div.skill-name', ab.name), h('div.skill-sub.muted', ab.keystone ? 'Keystone · level 18' : 'Tier ' + ab.tier + (pick ? '' : ' · level ' + { 2: 6, 3: 12 }[ab.tier]))]),
          ]);
          BD.ui.tooltip.bind(card, (c, shift) => BD.ui.dom.append(c, BD.ui.tooltip.skillBody(fake.world, fake.p, ab.id, shift, 1)));
          col.appendChild(card);
        }
        cols.appendChild(col);
      }
      body.appendChild(h('div.muted', 'Choose your first skill. It starts at rank 1 on the right mouse button. Every branch stays open to you.'));
      body.appendChild(cols);
    } else if (st.step === 2) {
      const list = h('div.choice-list');
      for (const b of Object.values(BD.data.backgrounds)) {
        const unlocked = b.free || (meta.unlocks && meta.unlocks[b.perk]);
        list.appendChild(h('div.choice' + (st.background === b.id ? '.sel' : '') + (unlocked ? '' : '.locked'), { data: { action: unlocked ? 'bg' : '', id: b.id } }, [h('b', b.name), h('span.muted', ' — ' + b.desc + (unlocked ? '' : ' (unlock at the Soul Shrine)'))]));
      }
      body.appendChild(list);
    } else if (st.step === 3) {
      const inp = /** @type {HTMLInputElement} */ (h('input.name-input', { type: 'text', maxlength: 18, value: st.name }));
      inp.addEventListener('input', () => { st.name = inp.value.replace(/[^\p{L}\p{N} '\-]/gu, '').slice(0, 18); });
      body.appendChild(h('div.col', [h('label.muted', 'Name your wanderer'), inp]));
      setTimeout(() => inp.focus(), 0);
    } else if (st.step === 4) {
      const list = h('div.choice-list');
      for (const d of Object.values(BD.data.difficulties)) {
        const unlocked = d.id !== 'martyr' || (meta.unlocks && meta.unlocks.martyrs_path);
        list.appendChild(h('div.choice' + (st.difficulty === d.id ? '.sel' : '') + (unlocked ? '' : '.locked'), { data: { action: unlocked ? 'diff' : '', id: d.id } }, [h('b', d.name + (d.id === 'penitent' ? ' (default)' : '')), h('div.muted', d.desc + (unlocked ? '' : ' Unlock with Martyr\'s Path at the Soul Shrine.'))]));
      }
      body.appendChild(list);
      const maxAsc = Math.min(10, (meta.ascension || {})[st.difficulty] || 0);
      if (maxAsc > 0) {
        const sel = h('div.row', [h('span', 'Ascension: ')]);
        for (let a = 0; a <= maxAsc; a++) sel.appendChild(h('button.btn.tiny' + ((st.ascension || 0) === a ? '.primary' : ''), { data: { action: 'asc', n: a } }, String(a)));
        body.appendChild(sel);
        if (st.ascension) body.appendChild(h('div.muted.small', BD.data.ascensionMods.slice(0, st.ascension).map((t, i) => (i + 1) + '. ' + t).join('  ')));
      }
    }
    const canNext = st.step !== 1 || !!st.skill;
    el.appendChild(h('div.row', { style: 'justify-content:space-between;margin-top:16px' }, [
      h('button.btn', { data: { action: 'back' } }, st.step === 0 ? 'Cancel' : 'Back'),
      st.step < 4 ? h('button.btn.primary', { data: { action: 'next' }, disabled: !canNext }, 'Next') : h('button.btn.primary', { data: { action: 'begin' } }, 'Begin the Descent'),
    ]));
    BD.ui.dom.delegate(el, {
      cls: (t) => { if (st.cls !== t.dataset.id) st.skill = null; st.cls = t.dataset.id; BD.ui.panels.rebuild('create'); },
      skill: (t) => { st.skill = t.dataset.id; BD.ui.panels.rebuild('create'); },
      bg: (t) => { st.background = t.dataset.id; BD.ui.panels.rebuild('create'); },
      diff: (t) => { st.difficulty = t.dataset.id; st.ascension = 0; BD.ui.panels.rebuild('create'); },
      asc: (t) => { st.ascension = Number(t.dataset.n); BD.ui.panels.rebuild('create'); },
      next: () => { st.step++; BD.ui.panels.rebuild('create'); },
      back: () => { if (st.step === 0) { BD.ui.panels.close('create'); BD.ui.menu.open(); } else { st.step--; BD.ui.panels.rebuild('create'); } },
      begin: () => {
        BD.ui.panels.closeAll();
        BD.app.startRun({ cls: st.cls, firstSkill: st.skill, background: st.background, name: (st.name || 'Wanderer').trim() || 'Wanderer', difficulty: st.difficulty, ascension: st.ascension || 0 });
      },
    });
  }

  /** a throwaway world so creation tooltips can show real numbers */
  function previewPlayer() {
    const world = BD.sim.world.createWorld({ seed: 'preview', cls: st.cls, name: 'p' });
    world.floor = { al: 1, entities: new Map(), w: 1, h: 1 };
    return { world, p: world.player };
  }

  BD.ui.panels.register({ id: 'create', build, onOpen, wide: true, closeOnEsc: false, pausesWorld: true });
})(globalThis.BD);
