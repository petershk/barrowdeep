// @ts-check
// Character creation (01 §5): class → first skill (three tier-1 skills, deeper skills visible but
// locked) → background → name → difficulty (in plain words).
(function (BD) {
  'use strict';

  const { h } = BD.ui.dom;
  let st = null;
  const NAMES = [
    'Aldric', 'Brannoc', 'Cwen', 'Edda', 'Hollis', 'Isolde', 'Maren', 'Osric',
    'Rowan', 'Sabine', 'Tamsin', 'Wulfric', 'Ysolde', 'Gareth', 'Mira', 'Corvin',
  ];

  function onOpen() {
    st = {
      step: 0, cls: 'fighter', skill: null, background: 'wanderer',
      name: NAMES[Math.floor(Math.random() * NAMES.length)], difficulty: 'penitent',
    };
  }
  /** a selector suffix such as '.sel' when the condition holds, else nothing */
  const flag = (on, cls) => (on ? cls : '');
  const ready = (cls) => Object.values(BD.data.skills).some((s) => s.cls === cls);

  function stepClass(i) {
    if (i === st.step) return '.on';
    if (i < st.step) return '.done';
    return '';
  }

  function build(el) {
    const steps = ['Class', 'First skill', 'Background', 'Name', 'Difficulty'];
    el.appendChild(h('h2', 'A New Descent'));
    el.appendChild(h('div.steps', steps.map((s, i) => h('span.step' + stepClass(i), (i + 1) + '. ' + s))));
    const body = h('div.create-body');
    el.appendChild(body);
    const meta = BD.ui.meta ? BD.ui.meta.get() : { unlocks: {} };
    if (st.step === 0) buildClassStep(body);
    else if (st.step === 1) buildSkillStep(body);
    else if (st.step === 2) buildBackgroundStep(body, meta);
    else if (st.step === 3) buildNameStep(body);
    else if (st.step === 4) buildDifficultyStep(body, meta);
    buildNavRow(el);
    wireActions(el);
  }

  function buildClassStep(body) {
    const grid = h('div.class-grid');
    for (const c of Object.values(BD.data.classes)) {
      const ok = ready(c.id);
      const cardSel = 'div.class-card' + flag(st.cls === c.id, '.sel') + flag(!ok, '.locked');
      grid.appendChild(h(cardSel, { data: { action: ok ? 'cls' : '', id: c.id } }, [
        h('img.class-art', { src: BD.view.sprites.dataURL(c.art, 4), alt: '' }),
        h('div.class-name', c.name), h('div.class-res', 'Resource: ' + c.resource),
        h('div.class-fantasy', c.fantasy), h('div.class-verb.muted', c.verb),
        h('div.class-trait', [h('b', c.trait.name + ': '), c.trait.desc]),
      ]));
    }
    body.appendChild(grid);
  }

  /** the line under a skill card's name: tier, plus the level that unlocks it */
  function skillSubtitle(ab, pick) {
    if (ab.keystone) return 'Keystone · level 18';
    return 'Tier ' + ab.tier + (pick ? '' : ' · level ' + { 2: 6, 3: 12 }[ab.tier]);
  }

  function buildSkillCard(ab, fake) {
    const pick = ab.tier === 1;
    const cardSel = 'div.skill-card' + flag(!pick, '.locked') + flag(st.skill === ab.id, '.sel');
    const sub = skillSubtitle(ab, pick);
    const card = h(cardSel, { data: { action: pick ? 'skill' : '', id: ab.id } }, [
      h('img.sk-icon', { src: BD.view.icons.url(ab.icon), alt: '' }),
      h('div.skill-meta', [h('div.skill-name', ab.name), h('div.skill-sub.muted', sub)]),
    ]);
    BD.ui.tooltip.bind(card, (c, shift) => {
      BD.ui.dom.append(c, BD.ui.tooltip.skillBody(fake.world, fake.p, ab.id, shift, 1));
    });
    return card;
  }

  function buildSkillStep(body) {
    const cls = BD.data.classes[st.cls];
    const cols = h('div.skill-cols');
    const fake = previewPlayer();
    for (const br of cls.branches) {
      const list = Object.values(BD.data.skills)
        .filter((s) => s.cls === st.cls && s.branch === br.id)
        .sort((a, b) => a.tier - b.tier);
      const col = h('div.skill-col', [h('h3', br.name)]);
      for (const ab of list) col.appendChild(buildSkillCard(ab, fake));
      cols.appendChild(col);
    }
    body.appendChild(h('div.muted',
      'Choose your first skill. It starts at rank 1 on the right mouse button. Every branch stays open to you.'));
    body.appendChild(cols);
  }

  function buildBackgroundStep(body, meta) {
    const list = h('div.choice-list');
    for (const b of Object.values(BD.data.backgrounds)) {
      const unlocked = b.free || (meta.unlocks && meta.unlocks[b.perk]);
      const sel = 'div.choice' + flag(st.background === b.id, '.sel') + flag(!unlocked, '.locked');
      list.appendChild(h(sel, { data: { action: unlocked ? 'bg' : '', id: b.id } }, [
        h('b', b.name),
        h('span.muted', ' — ' + b.desc + (unlocked ? '' : ' (unlock at the Soul Shrine)')),
      ]));
    }
    body.appendChild(list);
  }

  function buildNameStep(body) {
    const inp = /** @type {HTMLInputElement} */ (h('input.name-input', { type: 'text', maxlength: 18, value: st.name }));
    inp.addEventListener('input', () => {
      st.name = inp.value.replace(/[^\p{L}\p{N} '\-]/gu, '').slice(0, 18);
    });
    body.appendChild(h('div.col', [h('label.muted', 'Name your wanderer'), inp]));
    setTimeout(() => inp.focus(), 0);
  }

  function buildDifficultyStep(body, meta) {
    const list = h('div.choice-list');
    for (const d of Object.values(BD.data.difficulties)) {
      const unlocked = d.id !== 'martyr' || (meta.unlocks && meta.unlocks.martyrs_path);
      const sel = 'div.choice' + flag(st.difficulty === d.id, '.sel') + flag(!unlocked, '.locked');
      list.appendChild(h(sel, { data: { action: unlocked ? 'diff' : '', id: d.id } }, [
        h('b', d.name + (d.id === 'penitent' ? ' (default)' : '')),
        h('div.muted', d.desc + (unlocked ? '' : ' Unlock with Martyr\'s Path at the Soul Shrine.')),
      ]));
    }
    body.appendChild(list);
    buildAscensionPicker(body, meta);
  }

  function buildAscensionPicker(body, meta) {
    const maxAsc = Math.min(10, (meta.ascension || {})[st.difficulty] || 0);
    if (maxAsc <= 0) return;
    const sel = h('div.row', [h('span', 'Ascension: ')]);
    for (let a = 0; a <= maxAsc; a++) {
      const btnSel = 'button.btn.tiny' + ((st.ascension || 0) === a ? '.primary' : '');
      sel.appendChild(h(btnSel, { data: { action: 'asc', n: a } }, String(a)));
    }
    body.appendChild(sel);
    if (st.ascension) {
      const mods = BD.data.ascensionMods.slice(0, st.ascension).map((t, i) => (i + 1) + '. ' + t);
      body.appendChild(h('div.muted.small', mods.join('  ')));
    }
  }

  function buildNavRow(el) {
    const canNext = st.step !== 1 || !!st.skill;
    el.appendChild(h('div.row', { style: 'justify-content:space-between;margin-top:16px' }, [
      h('button.btn', { data: { action: 'back' } }, st.step === 0 ? 'Cancel' : 'Back'),
      st.step < 4
        ? h('button.btn.primary', { data: { action: 'next' }, disabled: !canNext }, 'Next')
        : h('button.btn.primary', { data: { action: 'begin' } }, 'Begin the Descent'),
    ]));
  }

  const rebuild = () => BD.ui.panels.rebuild('create');

  function wireActions(el) {
    BD.ui.dom.delegate(el, {
      cls: (t) => {
        if (st.cls !== t.dataset.id) st.skill = null;
        st.cls = t.dataset.id;
        rebuild();
      },
      skill: (t) => {
        st.skill = t.dataset.id;
        rebuild();
      },
      bg: (t) => {
        st.background = t.dataset.id;
        rebuild();
      },
      diff: (t) => {
        st.difficulty = t.dataset.id;
        st.ascension = 0;
        rebuild();
      },
      asc: (t) => {
        st.ascension = Number(t.dataset.n);
        rebuild();
      },
      next: () => {
        st.step++;
        rebuild();
      },
      back: () => {
        if (st.step === 0) {
          BD.ui.panels.close('create');
          BD.ui.menu.open();
        } else {
          st.step--;
          rebuild();
        }
      },
      begin: () => {
        BD.ui.panels.closeAll();
        BD.app.startRun({
          cls: st.cls, firstSkill: st.skill, background: st.background,
          name: (st.name || 'Wanderer').trim() || 'Wanderer',
          difficulty: st.difficulty, ascension: st.ascension || 0,
        });
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
