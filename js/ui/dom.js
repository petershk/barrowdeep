// @ts-check
// DOM helper: h(tag, props, children) escapes text automatically (text nodes only).
// Event delegation via data-action attributes; no inline handlers, no innerHTML with player text.
(function (BD) {
  'use strict';

  /**
   * @param {string} tag  e.g. 'div.panel#inv'
   * @param {any} [props]  attrs; `class`, `style` (object|string), `data` (object), `on` (object of listeners), `text`
   * @param {any} [children]
   * @returns {HTMLElement}
   */
  function h(tag, props, children) {
    const m = /^([a-z0-9]*)((?:[.#][\w-]+)*)$/i.exec(tag);
    const el = document.createElement((m && m[1]) || 'div');
    if (m && m[2]) {
      for (const part of m[2].match(/[.#][\w-]+/g) || []) {
        if (part[0] === '.') el.classList.add(part.slice(1));
        else el.id = part.slice(1);
      }
    }
    if (props && (typeof props === 'string' || Array.isArray(props) || props instanceof Node)) {
      children = props;
      props = null;
    }
    if (props) {
      for (const k in props) {
        const v = props[k];
        if (v == null || v === false) continue;
        if (k === 'class') String(v).split(/\s+/).filter(Boolean).forEach((c) => el.classList.add(c));
        else if (k === 'style') {
          if (typeof v === 'string') el.style.cssText = v;
          else Object.assign(el.style, v);
        }
        else if (k === 'data') for (const d in v) el.dataset[d] = String(v[d]);
        else if (k === 'on') for (const ev in v) el.addEventListener(ev, v[ev]);
        else if (k === 'text') el.textContent = String(v);
        else if (k === 'html') throw new Error('use h() children, not html');
        else el.setAttribute(k, v === true ? '' : String(v));
      }
    }
    append(el, children);
    return el;
  }
  function append(el, children) {
    if (children == null || children === false) return;
    if (Array.isArray(children)) {
      for (const c of children) append(el, c);
      return;
    }
    if (children instanceof Node) el.appendChild(children);
    else el.appendChild(document.createTextNode(String(children)));
  }
  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
    return el;
  }
  function root() { return /** @type {HTMLElement} */ (document.getElementById('ui-root')); }

  /** delegate clicks on [data-action] inside el to handlers[action](target, ev) */
  function delegate(el, handlers, evType = 'click') {
    el.addEventListener(evType, (ev) => {
      const t = closest(ev.target, '[data-action]');
      if (!t || !el.contains(t)) return;
      const fn = handlers[/** @type {HTMLElement} */ (t).dataset.action];
      if (fn) {
        fn(t, ev);
        ev.stopPropagation();
      }
    });
  }
  /** update text only when changed (dirty-region friendliness) */
  function setText(el, s) {
    s = String(s);
    if (el.textContent !== s) el.textContent = s;
  }

  /**
   * The nearest element (from an event's target up) matching a selector.
   * @param {EventTarget} target @param {string} selector
   * @returns {HTMLElement|null}
   */
  function closest(target, selector) {
    return /** @type {Element} */ (target).closest(selector);
  }

  BD.ui.dom = { h, append, clear, root, delegate, setText, closest };
})(globalThis.BD);
