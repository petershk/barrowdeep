// @ts-check
// Gamepad, standard mapping (07 §6.6). Left stick moves in 8 directions (inverse-iso) and auto-locks
// the best-aligned enemy within a 70° cone; A attacks, X/Y/B/RB skills 1–4, RT the RMB skill, LB
// evade, LT flask, D-pad up interact (with a prompt), Start inventory, Back pause. In menus: spatial
// focus navigation with 360 ms initial / 140 ms repeat; A clicks, B backs out. Optional rumble.
(function (BD) {
  'use strict';

  const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
  const SLOT = { [BTN.X]: 's1', [BTN.Y]: 's2', [BTN.B]: 's3', [BTN.RB]: 's4', [BTN.RT]: 'rmb' };
  const DEAD = 0.28, CONE = (35 * Math.PI) / 180, LOCK_RANGE = 9, MOVE_REPEAT = 120;
  const INTERACT_LABEL = { STAIRS_DOWN: 'Descend', STAIRS_UP: 'Ascend', STAIRS_SEALED: 'Sealed stairs', WAYPOINT: 'Use waypoint', PORTAL_STONE: 'Enter portal', GATE: 'Open gate', TOWN_DOOR: 'Enter' };
  const OBJ_LABEL = { chest: 'Open chest', shrine: 'Pray at shrine', altar: 'Offer blood', lever: 'Pull lever', door: 'Open door', trap: 'Disarm trap', portal: 'Enter portal', npc: 'Talk', seal: 'Take the seal', key: 'Take the key' };

  const pad = { active: false, index: -1, prev: [], target: null, face: { x: 1, y: 0 }, moveT: 0, navT: 0, navDir: null, focus: null, prompt: null, lastStick: false };

  function attach() {
    window.addEventListener('gamepadconnected', (e) => { pad.index = /** @type {any} */ (e).gamepad.index; });
    window.addEventListener('gamepaddisconnected', () => { pad.index = -1; setActive(false); });
    window.addEventListener('mousemove', () => { if (pad.active) setActive(false); });
  }
  function setActive(on) {
    if (pad.active === on) return;
    pad.active = on;
    document.body.classList.toggle('pad', on);
    if (!on) { pad.target = null; showPrompt(null); clearFocus(); }
  }
  function getPad() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    const list = navigator.getGamepads();
    if (pad.index >= 0 && list[pad.index]) return list[pad.index];
    for (const g of list) if (g && g.connected) { pad.index = g.index; return g; }
    return null;
  }

  /** screen-space stick → world direction via the inverse iso transform */
  function stickToWorld(sx, sy) {
    const a = sx / 16, b = sy / 8;          // (wx − wy), (wx + wy) in tile units
    const wx = (a + b) / 2, wy = (b - a) / 2;
    const l = Math.hypot(wx, wy) || 1;
    return { x: wx / l, y: wy / l };
  }
  const snap = (v) => { const ang = Math.round(Math.atan2(v.y, v.x) / (Math.PI / 4)) * (Math.PI / 4); return { x: Math.round(Math.cos(ang)), y: Math.round(Math.sin(ang)) }; };

  function bestTarget(w, dir) {
    const p = w.player, f = w.floor;
    let best = null, bestScore = Infinity;
    for (const e of f.entities.values()) {
      if (e.dead || e.faction === 'player' || e.untargetable || !f.visible[e.y * f.w + e.x]) continue;
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
      if (d > LOCK_RANGE || d === 0) continue;
      const off = Math.abs(Math.atan2(dx * dir.y - dy * dir.x, dx * dir.x + dy * dir.y));
      if (off > CONE) continue;
      const score = d + off * 4;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  function nearbyInteract(w) {
    const p = w.player, f = w.floor, I = BD.sim.interact;
    const T = BD.data.tiles.T, PROPS = BD.data.tiles.PROPS;
    let best = null, bd = Infinity;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const x = p.x + dx, y = p.y + dy;
      if (x < 0 || y < 0 || x >= f.w || y >= f.h) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy)) + (dx || dy ? 0 : -0.5);
      if (d >= bd) continue;
      const o = I.objectAt(w, x, y);
      if (o) { best = { x, y, label: OBJ_LABEL[o.kind] || 'Use' }; bd = d; continue; }
      const it = (f.items || []).find((q) => q.x === x && q.y === y);
      if (it) { best = { x, y, item: it.uid, label: 'Pick up' + (it.item ? ' ' + BD.sim.items.derive(it.item).name : it.kind === 'gold' ? ' gold' : '') }; bd = d; continue; }
      const t = f.tiles[y * f.w + x];
      if (PROPS[t] && PROPS[t].interact) { const name = Object.keys(T).find((k) => T[k] === t); best = { x, y, label: INTERACT_LABEL[name] || 'Use' }; bd = d; }
    }
    return best;
  }

  let promptEl = null;
  function showPrompt(it) {
    const txt = it ? '⬆ ' + it.label : null;
    if (txt === pad.prompt) return;
    pad.prompt = txt;
    if (!promptEl) { promptEl = BD.ui.dom.h('div.pad-prompt'); BD.ui.dom.root().appendChild(promptEl); }
    promptEl.textContent = txt || '';
    promptEl.classList.toggle('show', !!txt);
  }

  function rumble(strong, weak, ms) {
    if (!pad.active || (BD.ui.options && !BD.ui.options.get('rumble'))) return;
    const g = getPad(), act = g && /** @type {any} */ (g).vibrationActuator;
    if (act && act.playEffect) act.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {});
  }

  // ---------------- menus ----------------
  function focusables() {
    const t = BD.ui.panels.top();
    const scope = t ? t.el : document.querySelector('.panel');
    if (!scope) return [];
    return Array.from(scope.querySelectorAll('button, [data-action], .slot, .item-row, input, select, .focusable')).filter((el) => /** @type {HTMLElement} */ (el).offsetParent !== null && !/** @type {any} */ (el).disabled);
  }
  function clearFocus() { if (pad.focus) pad.focus.classList.remove('focus', 'pad-focus'); pad.focus = null; }
  function setFocus(el) {
    clearFocus();
    pad.focus = el;
    el.classList.add('focus', 'pad-focus');
    el.scrollIntoView({ block: 'nearest' });
    const r = el.getBoundingClientRect();
    for (const type of ['mouseover', 'mouseenter']) el.dispatchEvent(new MouseEvent(type, { bubbles: type === 'mouseover', clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
  }
  function nav(dx, dy) {
    const els = focusables();
    if (!els.length) return;
    if (!pad.focus || !els.includes(pad.focus)) { setFocus(els[0]); return; }
    const a = pad.focus.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bs = Infinity;
    for (const el of els) {
      if (el === pad.focus) continue;
      const b = el.getBoundingClientRect(), bx = b.left + b.width / 2, by = b.top + b.height / 2;
      const along = (bx - ax) * dx + (by - ay) * dy;
      if (along <= 1) continue;
      const perp = Math.abs((bx - ax) * dy - (by - ay) * dx);
      const s = along + 2 * perp;
      if (s < bs) { bs = s; best = el; }
    }
    if (best) setFocus(best);
  }

  // ---------------- per frame ----------------
  function frame(realMs) {
    const g = getPad();
    if (!g) return;
    const btn = g.buttons.map((b) => b.pressed || b.value > 0.5);
    const pressed = (i) => btn[i] && !pad.prev[i];
    const sx = Math.abs(g.axes[0]) > DEAD ? g.axes[0] : 0, sy = Math.abs(g.axes[1]) > DEAD ? g.axes[1] : 0;
    if (btn.some(Boolean) || sx || sy) setActive(true);
    if (!pad.active) { pad.prev = btn; return; }
    const app = BD.app, w = app.world;
    const menu = BD.ui.panels.top() || app.state !== 'playing';

    if (menu) {
      showPrompt(null);
      let dir = null;
      if (btn[BTN.UP] || sy < -0.5) dir = [0, -1]; else if (btn[BTN.DOWN] || sy > 0.5) dir = [0, 1];
      else if (btn[BTN.LEFT] || sx < -0.5) dir = [-1, 0]; else if (btn[BTN.RIGHT] || sx > 0.5) dir = [1, 0];
      const key = dir ? dir.join() : null;
      if (key !== pad.navDir) { pad.navDir = key; pad.navT = 0; if (dir) nav(dir[0], dir[1]); }
      else if (dir && (pad.navT += realMs) >= 360) { pad.navT = 360 - 140; nav(dir[0], dir[1]); }
      if (pressed(BTN.A) && pad.focus) { app.userGesture(); pad.focus.click(); }
      if (pressed(BTN.B) || (pressed(BTN.START) && BD.ui.panels.top() && BD.ui.panels.top().id === 'inventory')) {
        const t = BD.ui.panels.top();
        if (t && BD.ui.panels.defs[t.id].closeOnEsc) BD.ui.panels.close();
      }
      if (pressed(BTN.BACK) && app.tactical) app.togglePause();
      if (!pad.focus && dir === null && focusables().length) setFocus(focusables()[0]);
      pad.prev = btn;
      return;
    }
    clearFocus();
    if (!w || app.paused()) { if (pressed(BTN.BACK)) app.togglePause(); pad.prev = btn; return; }
    const p = w.player, I = BD.input.intent;

    // movement + lock
    if (sx || sy) {
      const d = stickToWorld(sx, sy);
      pad.face = d;
      pad.target = bestTarget(w, d);
      const s = snap(d);
      if ((pad.moveT -= realMs) <= 0 && !btn[BTN.A]) {
        pad.moveT = MOVE_REPEAT;
        const f = w.floor, E = BD.sim.entities;
        let tx = p.x + s.x * 2, ty = p.y + s.y * 2;
        if (!E.walkable(f, tx, ty)) { tx = p.x + s.x; ty = p.y + s.y; }
        if (E.walkable(f, tx, ty)) I.issue({ type: 'Move', x: tx, y: ty });
      }
      pad.lastStick = true;
    } else {
      if (pad.lastStick) { I.issue({ type: 'Stop' }); pad.lastStick = false; }
      pad.moveT = 0;
      if (pad.target && (pad.target.dead || Math.hypot(pad.target.x - p.x, pad.target.y - p.y) > LOCK_RANGE + 2)) pad.target = bestTarget(w, pad.face);
      if (!pad.target) pad.target = bestTarget(w, pad.face);
    }
    // aim point: the target, else a few tiles ahead
    const tgt = pad.target;
    const aimTile = tgt ? { x: tgt.x, y: tgt.y } : { x: Math.round(p.x + pad.face.x * 3), y: Math.round(p.y + pad.face.y * 3) };
    const m = BD.input.mouse;
    m.hoverTile = aimTile; m.hoverEntity = tgt;

    // attack
    if (pressed(BTN.A)) {
      if (tgt) { I.hold.lockId = tgt.id; I.issue({ type: 'Engage', entityId: tgt.id, hold: true }); }
      else I.issue({ type: 'ForceAttack', x: aimTile.x, y: aimTile.y });
    }
    if (!btn[BTN.A] && pad.prev[BTN.A] && I.hold.lockId) { I.issue({ type: 'HoldEnd' }); I.hold.lockId = null; }
    // skills (held buttons recast through intent's hold loop)
    for (const b in SLOT) {
      const slot = SLOT[b];
      if (pressed(+b)) { I.hold.keys[slot] = true; I.issue({ type: 'UseSkill', slot, aim: tgt ? { entityId: tgt.id, x: tgt.x, y: tgt.y } : { x: aimTile.x, y: aimTile.y }, hold: false }); }
      else if (!btn[+b] && pad.prev[+b]) I.hold.keys[slot] = false;
    }
    if (pressed(BTN.LB)) { const s = snap(pad.face); I.issue({ type: 'Evade', dirX: s.x, dirY: s.y }); }
    if (pressed(BTN.LT)) I.issue({ type: 'DrinkFlask' });
    const near = nearbyInteract(w);
    showPrompt(near);
    if (pressed(BTN.UP) && near) {
      if (near.item) I.issue({ type: 'Pickup', itemUid: near.item, x: near.x, y: near.y });
      else I.issue({ type: 'Interact', x: near.x, y: near.y });
    }
    if (pressed(BTN.DOWN)) I.issue({ type: 'ReadScroll', kind: 'portal' });
    if (pressed(BTN.START)) BD.ui.panels.hotkey('inventory');
    if (pressed(BTN.BACK)) app.togglePause();
    if (pressed(BTN.LEFT)) BD.ui.panels.hotkey('skills');
    if (pressed(BTN.RIGHT)) BD.ui.panels.hotkey('character');
    if (pressed(BTN.RS)) BD.ui.panels.hotkey('map');
    pad.prev = btn;
  }

  function wire(bus) {
    bus.on('damage', (ev) => { const w = BD.app.world; if (w && ev.tgtId === w.player.id && ev.total > 0) rumble(0.35, 0.5, 90); else if (w && ev.srcId === w.player.id && ev.crit) rumble(0, 0.4, 60); });
    bus.on('boss.land', () => rumble(0.9, 0.6, 260));
    bus.on('slam', () => rumble(0.6, 0.4, 160));
  }

  BD.input.gamepad = { attach, frame, wire, stickToWorld, pad, BTN };
})(globalThis.BD);
