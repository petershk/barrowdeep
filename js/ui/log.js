// @ts-check
// Announce banner (48 px gold small caps, 3.6 s), event feed (few large fading lines, top-left),
// reject reasons near the cursor, and the quest tracker line under the minimap.
(function (BD) {
  'use strict';

  const { h, root, setText } = BD.ui.dom;
  let banner = null, feed = null, reject = null;
  let bannerT = 0, rejectT = 0;

  function mount() {
    banner = h('div.announce');
    feed = h('div.feed');
    reject = h('div.reject');
    root().appendChild(banner); root().appendChild(feed); root().appendChild(reject);
  }
  function announce(text, style) {
    if (!banner) mount();
    setText(banner, text);
    banner.className = 'announce show' + (style ? ' ' + style : '');
    bannerT = 3600;
  }
  function line(text, cls) {
    if (!feed) mount();
    const el = h('div.feed-line' + (cls ? '.' + cls : ''), text);
    feed.appendChild(el);
    while (feed.children.length > 6) feed.removeChild(feed.firstChild);
    setTimeout(() => el.classList.add('fade'), 4500);
    setTimeout(() => el.remove(), 6000);
  }
  function denied(text) {
    if (!reject) mount();
    setText(reject, text);
    const m = BD.input.mouse;
    reject.style.left = (m.screen.x / BD.view.iso.view.dpr + 14) + 'px';
    reject.style.top = (m.screen.y / BD.view.iso.view.dpr - 10) + 'px';
    reject.classList.add('show');
    rejectT = 900;
    document.body.classList.add('deny-flash');
    setTimeout(() => document.body.classList.remove('deny-flash'), 120);
  }
  function frame(world, ms) {
    if (!banner) mount();
    if (bannerT > 0) { bannerT -= ms; if (bannerT <= 0) banner.classList.remove('show'); }
    if (rejectT > 0) { rejectT -= ms; if (rejectT <= 0) reject.classList.remove('show'); }
    if (BD.ui.minimap && world.floor) BD.ui.minimap.setQuest(questText(world));
  }

  function questText(world) {
    const f = world.floor, r = world.run;
    if (f.key === 'town') return r.floor === 0 && r.deepestFloor === 0 ? 'Enter the church' : 'Brennor';
    if (typeof f.key === 'string' && f.key[0] === 'a') return f.bossDead ? 'Take the portal to town' : 'Slay the guardian';
    if (f.n === 13) return 'Face Malgoth';
    const fl = BD.data.floors.byN(f.n);
    if (fl.actEnd) return r.flags['key' + f.n] ? (f.gateOpen ? 'Enter the gate' : 'Open the boss gate') : 'Slay the Keeper for the Gate Key';
    return f.sealBroken ? 'The seal is broken — descend' : 'Slay the Keeper';
  }

  BD.ui.hud.add({ frame });
  BD.ui.log = { announce, line, denied, questText };
})(globalThis.BD);
