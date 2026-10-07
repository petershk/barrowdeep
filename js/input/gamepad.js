// @ts-check
// Gamepad, standard mapping (07 §6.6). Left stick moves in 8 directions (inverse-iso) and auto-locks
// the best-aligned enemy within a 70° cone; A attacks, X/Y/B/RB skills 1–4, RT the RMB skill, LB
// evade, LT flask, D-pad up interact (with a prompt), Start inventory, Back pause. In menus: spatial
// focus navigation with 360 ms initial / 140 ms repeat; A clicks, B backs out. Optional rumble.
(function (BD) {
  'use strict';

  const BTN = {
    A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7,
    BACK: 8, START: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15,
  };
  const SLOT = { [BTN.X]: 's1', [BTN.Y]: 's2', [BTN.B]: 's3', [BTN.RB]: 's4', [BTN.RT]: 'rmb' };
  const Grid = BD.core.grid;
  const DEAD = 0.28, CONE = (35 * Math.PI) / 180, LOCK_RANGE = 9, MOVE_REPEAT = 120;
  const INTERACT_LABEL = {
    STAIRS_DOWN: 'Descend', STAIRS_UP: 'Ascend', STAIRS_SEALED: 'Sealed stairs', WAYPOINT: 'Use waypoint',
    PORTAL_STONE: 'Enter portal', GATE: 'Open gate', TOWN_DOOR: 'Enter',
  };
  const OBJ_LABEL = {
    chest: 'Open chest', shrine: 'Pray at shrine', altar: 'Offer blood', lever: 'Pull lever', door: 'Open door',
    trap: 'Disarm trap', portal: 'Enter portal', npc: 'Talk', seal: 'Take the seal', key: 'Take the key',
  };

  const pad = {
    active: false, index: -1, prev: [], target: null, face: { x: 1, y: 0 },
    moveT: 0, navT: 0, navDir: null, focus: null, prompt: null, lastStick: false,
  };

  function attach() {
    window.addEventListener('gamepadconnected', (e) => {
      pad.index = /** @type {any} */ (e).gamepad.index;
    });
    window.addEventListener('gamepaddisconnected', () => {
      pad.index = -1;
      setActive(false);
    });
    window.addEventListener('mousemove', () => {
      if (pad.active && !virtual.active) setActive(false);
    });
  }
  function setActive(on) {
    if (pad.active === on) return;
    pad.active = on;
    document.body.classList.toggle('pad', on);
    if (!on) {
      pad.target = null;
      showPrompt(null);
      clearFocus();
    }
  }
  // touch drives a virtual pad through the same code path
  const virtual = {
    active: false, index: -1, connected: true, axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  };
  function getPad() {
    if (virtual.active) return virtual;
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    const list = navigator.getGamepads();
    if (pad.index >= 0 && list[pad.index]) return list[pad.index];
    for (const g of list) {
      if (g && g.connected) {
        pad.index = g.index;
        return g;
      }
    }
    return null;
  }

  /** screen-space stick → world direction via the inverse iso transform */
  function stickToWorld(sx, sy) {
    const a = sx / 16, b = sy / 8;          // (wx − wy), (wx + wy) in tile units
    const wx = (a + b) / 2, wy = (b - a) / 2;
    const l = Math.hypot(wx, wy) || 1;
    return { x: wx / l, y: wy / l };
  }
  const snap = (v) => {
    const ang = Math.round(Math.atan2(v.y, v.x) / (Math.PI / 4)) * (Math.PI / 4);
    return { x: Math.round(Math.cos(ang)), y: Math.round(Math.sin(ang)) };
  };

  function bestTarget(w, dir) {
    const p = w.player, f = w.floor;
    let best = null, bestScore = Infinity;
    for (const e of f.entities.values()) {
      if (e.dead || e.faction === 'player' || e.untargetable || !f.visible[Grid.idx(f, e.x, e.y)]) continue;
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
      if (d > LOCK_RANGE || d === 0) continue;
      const off = Math.abs(Math.atan2(dx * dir.y - dy * dir.x, dx * dir.x + dy * dir.y));
      if (off > CONE) continue;
      const score = d + off * 4;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  /** ' <item name>' / ' gold' for the pick-up prompt */
  function pickupSuffix(it) {
    if (it.item) return ' ' + BD.sim.items.derive(it.item).name;
    return it.kind === 'gold' ? ' gold' : '';
  }

  function nearbyInteract(w) {
    const p = w.player, f = w.floor, Interact = BD.sim.interact;
    const T = BD.data.tiles.T, PROPS = BD.data.tiles.PROPS;
    let best = null, bd = Infinity;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const x = p.x + dx, y = p.y + dy;
      if (x < 0 || y < 0 || x >= f.w || y >= f.h) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy)) + (dx || dy ? 0 : -0.5);
      if (d >= bd) continue;
      const o = Interact.objectAt(w, x, y);
      if (o) {
        best = { x, y, label: OBJ_LABEL[o.kind] || 'Use' };
        bd = d;
        continue;
      }
      const it = (f.items || []).find((q) => q.x === x && q.y === y);
      if (it) {
        const what = pickupSuffix(it);
        best = { x, y, item: it.uid, label: 'Pick up' + what };
        bd = d;
        continue;
      }
      const t = f.tiles[Grid.idx(f, x, y)];
      if (PROPS[t] && PROPS[t].interact) {
        const name = Object.keys(T).find((k) => T[k] === t);
        best = { x, y, label: INTERACT_LABEL[name] || 'Use' };
        bd = d;
      }
    }
    return best;
  }

  let promptEl = null;
  function showPrompt(it) {
    const txt = it ? '⬆ ' + it.label : null;
    if (txt === pad.prompt) return;
    pad.prompt = txt;
    if (!promptEl) {
      promptEl = BD.ui.dom.h('div.pad-prompt');
      BD.ui.dom.root().appendChild(promptEl);
    }
    promptEl.textContent = txt || '';
    promptEl.classList.toggle('show', !!txt);
  }

  function rumble(strong, weak, ms) {
    if (!pad.active || (BD.ui.options && !BD.ui.options.get('rumble'))) return;
    const g = getPad(), act = g && /** @type {any} */ (g).vibrationActuator;
    if (act && act.playEffect) {
      act.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {});
    }
  }

  // ---------------- menus ----------------
  function focusables() {
    const t = BD.ui.panels.top();
    const scope = t ? t.el : document.querySelector('.panel');
    if (!scope) return [];
    const els = Array.from(scope.querySelectorAll('button, [data-action], .slot, .item-row, input, select, .focusable'));
    return els.filter((el) => /** @type {HTMLElement} */ (el).offsetParent !== null && !/** @type {any} */ (el).disabled);
  }
  function clearFocus() {
    if (pad.focus) pad.focus.classList.remove('focus', 'pad-focus');
    pad.focus = null;
  }
  function setFocus(el) {
    clearFocus();
    pad.focus = el;
    el.classList.add('focus', 'pad-focus');
    el.scrollIntoView({ block: 'nearest' });
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    for (const type of ['mouseover', 'mouseenter']) {
      el.dispatchEvent(new MouseEvent(type, { bubbles: type === 'mouseover', clientX: cx, clientY: cy }));
    }
  }
  function nav(dx, dy) {
    const els = focusables();
    if (!els.length) return;
    if (!pad.focus || !els.includes(pad.focus)) {
      setFocus(els[0]);
      return;
    }
    const a = pad.focus.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bs = Infinity;
    for (const el of els) {
      if (el === pad.focus) continue;
      const b = el.getBoundingClientRect(), bx = b.left + b.width / 2, by = b.top + b.height / 2;
      const along = (bx - ax) * dx + (by - ay) * dy;
      if (along <= 1) continue;
      const perp = Math.abs((bx - ax) * dy - (by - ay) * dx);
      const s = along + 2 * perp;
      if (s < bs) {
        bs = s;
        best = el;
      }
    }
    if (best) setFocus(best);
  }

  // ---------------- per frame ----------------
  /** stick axis with the dead zone cut out */
  const deadZone = (v) => (Math.abs(v) > DEAD ? v : 0);

  function frame(realMs) {
    const g = getPad();
    if (!g) return;
    const btn = g.buttons.map((b) => b.pressed || b.value > 0.5);
    const pressed = (i) => btn[i] && !pad.prev[i];
    const sx = deadZone(g.axes[0]), sy = deadZone(g.axes[1]);
    if (btn.some(Boolean) || sx || sy) setActive(true);
    if (!pad.active) {
      pad.prev = btn;
      return;
    }
    const app = BD.app, w = app.world;
    const menu = BD.ui.panels.top() || app.state !== 'playing';
    const input = { btn, pressed, sx, sy, realMs };

    if (menu) {
      menuFrame(app, input);
      pad.prev = btn;
      return;
    }
    clearFocus();
    if (!w || app.paused()) {
      if (pressed(BTN.BACK)) app.togglePause();
      pad.prev = btn;
      return;
    }
    playFrame(app, w, input);
    pad.prev = btn;
  }

  /** the menu-navigation direction from the d-pad or stick, or null */
  function menuDir(btn, sx, sy) {
    if (btn[BTN.UP] || sy < -0.5) return [0, -1];
    if (btn[BTN.DOWN] || sy > 0.5) return [0, 1];
    if (btn[BTN.LEFT] || sx < -0.5) return [-1, 0];
    if (btn[BTN.RIGHT] || sx > 0.5) return [1, 0];
    return null;
  }

  /** a panel is open: spatial focus navigation (360 ms initial / 140 ms repeat), A clicks, B / Start back out */
  function menuFrame(app, { btn, pressed, sx, sy, realMs }) {
    showPrompt(null);
    const dir = menuDir(btn, sx, sy);
    const key = dir ? dir.join() : null;
    if (key !== pad.navDir) {
      pad.navDir = key;
      pad.navT = 0;
      if (dir) nav(dir[0], dir[1]);
    } else if (dir) {
      pad.navT += realMs;
      if (pad.navT >= 360) {
        pad.navT = 360 - 140;
        nav(dir[0], dir[1]);
      }
    }
    if (pressed(BTN.A) && pad.focus) {
      app.userGesture();
      pad.focus.click();
    }
    if (pressed(BTN.B) || (pressed(BTN.START) && BD.ui.panels.top() && BD.ui.panels.top().id === 'inventory')) {
      const t = BD.ui.panels.top();
      if (t && BD.ui.panels.defs[t.id].closeOnEsc) BD.ui.panels.close();
    }
    if (pressed(BTN.BACK) && app.tactical) app.togglePause();
    if (!virtual.active && !pad.focus && dir === null && focusables().length) setFocus(focusables()[0]);
  }

  /** in the world: move + lock, aim, attack, skills, evade / flask, interact, hotkeys */
  function playFrame(app, w, input) {
    const { pressed } = input;
    const p = w.player, Intent = BD.input.intent;
    moveAndLock(w, input);
    // aim point: the target, else a few tiles ahead
    const tgt = pad.target;
    const aimTile = tgt ? { x: tgt.x, y: tgt.y } : { x: Math.round(p.x + pad.face.x * 3), y: Math.round(p.y + pad.face.y * 3) };
    const m = BD.input.mouse;
    m.hoverTile = aimTile;
    m.hoverEntity = tgt;
    attackAndSkills(Intent, input, tgt, aimTile);
    if (pressed(BTN.LB)) {
      const s = snap(pad.face);
      Intent.issue({ type: 'Evade', dirX: s.x, dirY: s.y });
    }
    if (pressed(BTN.LT)) Intent.issue({ type: 'DrinkFlask' });
    const near = nearbyInteract(w);
    showPrompt(near);
    if (pressed(BTN.UP) && near) {
      if (near.item) Intent.issue({ type: 'Pickup', itemUid: near.item, x: near.x, y: near.y });
      else Intent.issue({ type: 'Interact', x: near.x, y: near.y });
    }
    if (pressed(BTN.DOWN)) Intent.issue({ type: 'ReadScroll', kind: 'portal' });
    if (pressed(BTN.START)) BD.ui.panels.hotkey('inventory');
    if (pressed(BTN.BACK)) app.togglePause();
    if (pressed(BTN.LEFT)) BD.ui.panels.hotkey('skills');
    if (pressed(BTN.RIGHT)) BD.ui.panels.hotkey('character');
    if (pressed(BTN.RS)) BD.ui.panels.hotkey('map');
  }

  /** left stick: walk in 8 directions and keep the best-aligned enemy locked */
  function moveAndLock(w, { btn, sx, sy, realMs }) {
    const p = w.player, Intent = BD.input.intent;
    if (sx || sy) {
      const d = stickToWorld(sx, sy);
      pad.face = d;
      pad.target = bestTarget(w, d);
      const s = snap(d);
      if ((pad.moveT -= realMs) <= 0 && !btn[BTN.A]) {
        pad.moveT = MOVE_REPEAT;
        const f = w.floor, Entities = BD.sim.entities;
        let tx = p.x + s.x * 2, ty = p.y + s.y * 2;
        if (!Entities.walkable(f, tx, ty)) {
          tx = p.x + s.x;
          ty = p.y + s.y;
        }
        if (Entities.walkable(f, tx, ty)) Intent.issue({ type: 'Move', x: tx, y: ty });
      }
      pad.lastStick = true;
    } else {
      if (pad.lastStick) {
        Intent.issue({ type: 'Stop' });
        pad.lastStick = false;
      }
      pad.moveT = 0;
      const tg = pad.target;
      if (tg && (tg.dead || Math.hypot(tg.x - p.x, tg.y - p.y) > LOCK_RANGE + 2)) pad.target = bestTarget(w, pad.face);
      if (!pad.target) pad.target = bestTarget(w, pad.face);
    }
  }

  /** A attacks (held = locked engage); skill buttons cast, held ones recast through intent's hold loop */
  function attackAndSkills(Intent, { btn, pressed }, tgt, aimTile) {
    if (pressed(BTN.A)) {
      if (tgt) {
        Intent.hold.lockId = tgt.id;
        Intent.issue({ type: 'Engage', entityId: tgt.id, hold: true });
      } else Intent.issue({ type: 'ForceAttack', x: aimTile.x, y: aimTile.y });
    }
    if (!btn[BTN.A] && pad.prev[BTN.A] && Intent.hold.lockId) {
      Intent.issue({ type: 'HoldEnd' });
      Intent.hold.lockId = null;
    }
    for (const b in SLOT) {
      const slot = SLOT[b];
      if (pressed(+b)) {
        Intent.hold.keys[slot] = true;
        const aim = tgt ? { entityId: tgt.id, x: tgt.x, y: tgt.y } : { x: aimTile.x, y: aimTile.y };
        Intent.issue({ type: 'UseSkill', slot, aim, hold: false });
      } else if (!btn[+b] && pad.prev[+b]) Intent.hold.keys[slot] = false;
    }
  }

  function wire(bus) {
    bus.on('damage', (ev) => {
      const w = BD.app.world;
      if (w && ev.tgtId === w.player.id && ev.total > 0) rumble(0.35, 0.5, 90);
      else if (w && ev.srcId === w.player.id && ev.crit) rumble(0, 0.4, 60);
    });
    bus.on('boss.land', () => rumble(0.9, 0.6, 260));
    bus.on('slam', () => rumble(0.6, 0.4, 160));
  }

  BD.input.gamepad = { attach, frame, wire, stickToWorld, bestTarget, pad, BTN, virtual };
})(globalThis.BD);
