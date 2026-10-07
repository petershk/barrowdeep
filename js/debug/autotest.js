// @ts-check
// Debug-only autotest hook: ?debug=1&autotest=<name> loads js/debug/autotests/<name>.js.
// Autotests drive the sim deterministically with BD.debug.step and render directly (headless
// browsers starve requestAnimationFrame), then copy the canvas into an <img> for capture.
(function (BD) {
  'use strict';
  BD.debug = BD.debug || {};
  const Debug = BD.debug;
  Debug.autotests = Debug.autotests || {};

  Debug.step = (ms) => BD.app.stepSim(ms);
  Debug.newRun = (o) => {
    if (BD.ui.panels) BD.ui.panels.closeAll();
    const w = BD.app.startRun(Object.assign({ cls: 'fighter', name: 'Tester', seed: 'autotest' }, o));
    if (o && o.floor && w.floor.n !== o.floor && BD.sim.run) BD.sim.run.travel(w, o.floor);
    return w;
  };
  Debug.render = (frames) => {
    for (let i = 0; i < (frames || 30); i++) BD.view.render.draw(BD.app.world, 0, 16);
    if (BD.ui.hud) BD.ui.hud.frame(BD.app.world, 16);
    if (BD.ui.panels) BD.ui.panels.frame(16);
  };
  Debug.capture = () => {
    const c = /** @type {HTMLCanvasElement} */ (document.getElementById('world'));
    const img = document.createElement('img');
    img.src = c.toDataURL();
    img.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:0;pointer-events:none;image-rendering:pixelated';
    document.body.insertBefore(img, document.getElementById('ui-root'));
  };

  const m = /[?&]autotest=([a-z0-9_]+)/.exec(location.search);
  // scenes are for screenshots: first-run hints stay out of them (except the hints scene itself)
  if (m && m[1] !== 'hints' && BD.ui.options) BD.ui.options.all.hints = false;
  if (m) {
    const name = m[1];
    const s = document.createElement('script');
    s.src = 'js/debug/autotests/' + name + '.js';
    s.onload = () => setTimeout(() => {
      try { Debug.autotests[name](Debug); }
      catch (e) {
        const d = document.createElement('pre');
        d.style.cssText = 'position:fixed;top:0;left:0;color:#f55;z-index:99;background:#000';
        d.textContent = 'AUTOTEST ERROR: ' + (e && e.stack || e);
        document.body.appendChild(d);
      }
    }, 50);
    document.body.appendChild(s);
  }
  window.addEventListener('error', (ev) => {
    const d = document.createElement('pre');
    d.style.cssText = 'position:fixed;bottom:0;left:0;color:#f55;z-index:99;background:#000;font-size:12px;'
      + 'max-width:100vw;white-space:pre-wrap';
    d.textContent = 'ERROR: ' + ev.message + ' @ ' + ev.filename + ':' + ev.lineno;
    document.body.appendChild(d);
  });
})(globalThis.BD);
