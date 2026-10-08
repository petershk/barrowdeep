// @ts-check
// Skill bar: LMB + RMB + 1–4 + Evade (an empty LMB slot shows the basic attack). Recharge mask recedes upward
// with a bright edge; a 320 ms "ready" flash; combo/focus pips on the bar. Clicking a slot casts with smart aim ('auto').
(function (BD) {
  'use strict';

  const { h, setText } = BD.ui.dom;
  const SLOTS = ['lmb', 'rmb', 's1', 's2', 's3', 's4'];
  const KEYS = { lmb: 'LMB', rmb: 'RMB', s1: '1', s2: '2', s3: '3', s4: '4' };
  let el = null;
  const slots = {};
  const flashes = {};

  function mount() {
    el = h('div.skillbar');
    for (const s of SLOTS.concat(['evade'])) {
      const icon = h('img.sk-icon', { alt: '' });
      const mask = h('div.sk-mask');
      const edge = h('div.sk-edge');
      const key = h('div.sk-key', s === 'evade' ? 'Space' : KEYS[s]);
      const cnt = h('div.sk-count');
      const box = h('div.sk-slot' + (s === 'evade' ? '.evade' : ''), { data: { slot: s } }, [icon, mask, edge, key, cnt]);
      slots[s] = { box, icon, mask, edge, key, cnt, id: undefined };
      el.appendChild(box);
      box.addEventListener('mousedown', (ev) => {
        ev.stopPropagation();
        const w = BD.app.world;
        if (!w || BD.app.paused()) return;
        if (s === 'evade') {
          BD.input.intent.issue({ type: 'Evade', dirX: 0, dirY: 0 });
          return;
        }
        if (ev.button === 2 || ev.shiftKey) {
          BD.ui.panels.open('skills');
          return;
        }
        BD.input.intent.issue({ type: 'UseSkill', slot: s, aim: 'auto' });
      });
      box.addEventListener('contextmenu', (ev) => ev.preventDefault());
      BD.ui.tooltip.bind(box, (c, shift) => {
        const w = BD.app.world;
        const id = s === 'evade' ? null : w.player.bar[s];
        if (!id && s === 'lmb') {
          BD.ui.dom.append(c, [
            h('div.tt-title', 'Attack'),
            h('div.tt-desc', 'Left click on an enemy: your basic attack. '
              + 'Place a skill here in the Skills panel (K) to cast it instead; without the resource for it, you attack.'),
          ]);
          return;
        }
        if (!id) {
          BD.ui.dom.append(c, s === 'evade'
            ? [
              h('div.tt-title', 'Evade'),
              h('div.tt-desc', 'Dash 2 tiles. Invulnerable for the first 0.12 s. Free; 3 s cooldown. The answer to every telegraph.'),
            ]
            : [h('div.tt-title', 'Empty slot'), h('div.tt-desc', 'Assign skills in the Skills panel (K).')]);
          return;
        }
        BD.ui.dom.append(c, BD.ui.tooltip.skillBody(w, w.player, id, shift));
      });
    }
    document.querySelector('.hud .bar-slot').appendChild(el);
  }

  function frame(world, ms) {
    if (!el) {
      if (!document.querySelector('.hud .bar-slot')) return;
      mount();
    }
    const p = world.player;
    for (const s of SLOTS.concat(['evade'])) {
      const sl = slots[s];
      const id = s === 'evade' ? 'evade' : p.bar[s];
      if (sl.id !== id) {
        sl.id = id;
        const ab = id && id !== 'evade' ? BD.data.skills[id] : null;
        let iconId = id === 'evade' ? 'evade' : ab && ab.icon;
        if (!id && s === 'lmb') iconId = BD.data.basicAttack.icon;
        sl.icon.src = iconId ? BD.view.icons.url(iconId) : '';
        sl.icon.style.visibility = iconId ? 'visible' : 'hidden';
      }
      let frac = 0, label = '';
      if (id === 'evade') {
        const max = 3000;
        frac = Math.min(1, (p.cooldowns.evade || 0) / max);
        if (p.evadeCharges !== undefined) label = String(p.evadeCharges);
      } else if (id) {
        const ab = BD.data.skills[id];
        if (ab.charges) {
          const c = p.charges && p.charges[id];
          const n = c ? c.n : ab.charges;
          label = String(n);
          frac = c && n <= 0 ? Math.min(1, c.ms / BD.sim.abilities.cdTime(world, p, ab)) : 0;
        } else {
          const cd = p.cooldowns[id] || 0;
          frac = cd > 0 ? Math.min(1, cd / Math.max(1, BD.sim.abilities.cdTime(world, p, ab))) : 0;
        }
        const res = ab.resource || {};
        const hasCost = res.type && res.type !== 'none' && typeof res.cost === 'number' && res.cost > 0;
        const unaffordable = hasCost && !BD.sim.resources.canPay(p, res.type, res.cost, res.minStart);
        sl.box.classList.toggle('poor', !!unaffordable);
        sl.box.classList.toggle('active', !!(p.attack && p.attack.abilityId === id));
      }
      // recharge mask receding upward with a bright edge
      const pct = (frac * 100).toFixed(1) + '%';
      sl.mask.style.height = pct;
      sl.edge.style.bottom = pct;
      sl.edge.style.display = frac > 0 && frac < 1 ? '' : 'none';
      if (sl.wasCd && frac === 0) flashes[s] = 320;
      sl.wasCd = frac > 0;
      if (flashes[s] > 0) {
        flashes[s] -= ms;
        sl.box.classList.add('ready');
      } else sl.box.classList.remove('ready');
      setText(sl.cnt, label);
    }
  }

  BD.ui.hud.add({ frame });
  BD.ui.skillbar = { frame };
})(globalThis.BD);
