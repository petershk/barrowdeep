// @ts-check
// Panel registry and stack (07 §6.1). Each panel is declared once:
// { id, modal, pausesWorld, closeOnEsc, hotkey, build(el, arg) , refresh?(el), onOpen?, onClose?, wide? }
(function (BD) {
  'use strict';

  /** @type {Record<string, any>} */
  const defs = {};
  /** @type {{id:string, el:HTMLElement, arg:any, shell?:HTMLElement}[]} */
  const stack = [];
  const dirty = new Set();

  function register(def) {
    defs[def.id] = Object.assign({ modal: true, pausesWorld: true, closeOnEsc: true }, def);
  }

  function open(id, arg) {
    const d = defs[id];
    if (!d) return;
    const existing = stack.find((s) => s.id === id);
    if (existing) { close(id); }
    const { h, root } = BD.ui.dom;
    let tag = 'div.panel.panel-' + id;
    if (d.wide) tag += '.wide';
    if (d.full) tag += '.full';
    const el = h(tag);
    const shadeTag = 'div.panel-shade' + (d.full ? '.menu-shade' : '');
    const shell = d.modal ? h(shadeTag, [el]) : el;
    root().appendChild(shell);
    const entry = { id, el, shell, arg };
    stack.push(entry);
    if (d.onOpen) d.onOpen(el, arg);
    d.build(el, arg);
    BD.app.bus.emit({ type: 'ui.panel', id, open: true });
    if (BD.ui.pad) BD.ui.pad.invalidate();
    return el;
  }
  function close(id) {
    const i = id ? stack.findIndex((s) => s.id === id) : stack.length - 1;
    if (i < 0) return false;
    const [entry] = stack.splice(i, 1);
    entry.shell.remove();
    const d = defs[entry.id];
    if (d.onClose) d.onClose(entry.el, entry.arg);
    BD.app.bus.emit({ type: 'ui.panel', id: entry.id, open: false });
    if (BD.ui.tooltip) BD.ui.tooltip.hide();
    if (BD.ui.pad) BD.ui.pad.invalidate();
    return true;
  }
  function closeAll() { while (stack.length) close(); }
  function toggle(id, arg) {
    if (isOpen(id)) close(id);
    else open(id, arg);
  }
  const isOpen = (id) => stack.some((s) => s.id === id);
  const top = () => stack[stack.length - 1] || null;
  function pausesWorld() { return stack.some((s) => defs[s.id].pausesWorld); }
  function anyModal() { return stack.some((s) => defs[s.id].modal); }

  /** rebuild a panel's contents in place (cheap panels) */
  function rebuild(id) {
    const s = stack.find((x) => x.id === id);
    if (!s) return;
    // a fresh element each rebuild, so listeners attached by build() never accumulate
    const fresh = /** @type {HTMLElement} */ (s.el.cloneNode(false));
    const scroll = s.el.scrollTop;
    s.el.replaceWith(fresh);
    if (s.shell === s.el) s.shell = fresh;
    s.el = fresh;
    defs[id].build(s.el, s.arg);
    s.el.scrollTop = scroll;
    if (BD.ui.tooltip) BD.ui.tooltip.hide();
    if (BD.ui.pad) BD.ui.pad.invalidate();
  }
  function markDirty(id) { dirty.add(id); }
  function frame() {
    for (const id of dirty) rebuild(id);
    dirty.clear();
    for (const s of stack) if (defs[s.id].tick) defs[s.id].tick(s.el, s.arg);
  }

  /** Panels get first refusal on keys. Returns true if consumed. */
  function onKey(ev, action) {
    const t = top();
    if (action === 'menu' || ev.code === 'Escape') {
      if (t && defs[t.id].closeOnEsc) {
        close();
        return true;
      }
      if (!t && BD.app.state === 'playing') {
        open('pause');
        return true;
      }
      return !!t;
    }
    if (t && defs[t.id].onKey && defs[t.id].onKey(ev, t.el, t.arg)) return true;
    return false;
  }
  const HOTKEYS = { inventory: 'inventory', character: 'character', skills: 'skills', journal: 'journal' };
  function hotkey(action) {
    if (BD.app.state !== 'playing') return;
    if (action === 'map') {
      if (BD.ui.minimap) BD.ui.minimap.toggle();
      return;
    }
    const id = HOTKEYS[action];
    if (id && defs[id]) {
      const t = top();
      if (t && t.id !== id && defs[t.id].modal && !defs[t.id].swappable) return;
      if (t && t.id !== id && defs[t.id].swappable) close(t.id);
      toggle(id);
    }
  }

  BD.ui.panels = {
    register, open, close, closeAll, toggle, isOpen, top, pausesWorld, anyModal,
    rebuild, markDirty, frame, onKey, hotkey, defs, stack,
  };
})(globalThis.BD);
