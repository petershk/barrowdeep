// @ts-check
// Quest tracker, top-left: where you are (place, floor, act) and what to do next. Replaces the quest line that
// used to sit under the minimap; BD.ui.minimap.setQuest still works and forwards here.
(function (BD) {
  'use strict';

  const { h, setText, root } = BD.ui.dom;
  const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII'];
  let el = null, place = null, title = null, act = null, quest = null;

  function mount() {
    place = h('div.trk-place');
    title = h('div.trk-title');
    act = h('div.trk-act');
    quest = h('div.trk-quest');
    el = h('div.tracker', [
      h('div.trk-corner.tl'), h('div.trk-corner.tr'), h('div.trk-corner.bl'), h('div.trk-corner.br'),
      place, h('div.trk-head', [h('span.trk-orn'), title, h('span.trk-orn.flip')]), act,
      h('div.trk-rule'), h('div.trk-row', [h('span.trk-seal'), quest]),
    ]);
    root().appendChild(el);
  }

  /** place, big title and act line for the current floor */
  function heading(world) {
    const f = world.floor;
    if (f.key === 'town') return { place: 'Town of', title: 'Brennor', act: '' };
    if (typeof f.key === 'string') return { place: 'The guardian’s lair', title: 'Lair', act: '' };
    const look = BD.data.lookFor(f.biome, f.n);
    const fl = BD.data.floors.byN(f.n);
    const actTxt = fl.act <= BD.data.floors.LAST_ACT ? 'Act ' + ROMAN[fl.act] : 'The Sanctum';
    return { place: look ? look.name : '', title: 'Floor ' + (ROMAN[f.n] || f.n), act: actTxt };
  }

  function frame(world) {
    if (!el) mount();
    if (!world.floor) return;
    const hd = heading(world);
    setText(place, hd.place);
    setText(title, hd.title);
    setText(act, hd.act);
    setQuest(BD.ui.log.questText(world));
  }

  function setQuest(text) {
    if (!el) mount();
    setText(quest, text);
  }

  BD.ui.hud.add({ frame });
  BD.ui.tracker = { frame, setQuest };
})(globalThis.BD);
