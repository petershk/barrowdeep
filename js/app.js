// @ts-check
// Boot, main loop and wiring. The only file that owns real time.
(function (BD) {
  'use strict';

  const STEP_MS = BD.core.scheduler.STEP_MS;
  const bus = BD.core.events.makeBus();

  const app = {
    world: null, state: 'boot', bus, showLabels: false, showBars: false, tactical: false,
    hitstopMs: 0, lastHitstopAt: -1e9, realNow: 0, debug: /[?&]debug=1/.test(location.search),
    paused() {
      if (app.state !== 'playing' || app.tactical) return true;
      if (BD.ui.panels && BD.ui.panels.pausesWorld()) return true;
      return !!(app.world && app.world.run.paused);
    },
    togglePause() {
      app.tactical = !app.tactical;
      bus.emit({ type: 'ui.pause', on: app.tactical });
    },
    userGesture() { if (BD.audio.audio) BD.audio.audio.resume(); },
    /** request a presentation-level freeze (≤70 ms, at most once per 240 ms) */
    hitstop(ms) {
      const CombatBalance = BD.data.balance.combat;
      if (app.realNow - app.lastHitstopAt < CombatBalance.hitstopMinGapMs) return;
      app.lastHitstopAt = app.realNow;
      app.hitstopMs = Math.min(CombatBalance.hitstopMaxMs, ms);
    },
  };
  BD.app = app;

  /** Drain sim events to subscribers. */
  function dispatch(world) {
    const evs = world.events;
    if (!evs.length) return;
    world.events = [];
    for (let i = 0; i < evs.length; i++) bus.emit(evs[i]);
  }

  /** Advance the sim by ms (fixed steps), dispatching events after each step. */
  function stepSim(ms) {
    const w = app.world;
    let n = Math.round(ms / STEP_MS);
    while (n-- > 0) {
      BD.sim.world.step(w, STEP_MS);
      dispatch(w);
    }
  }

  /** the 'slowmo' option plays the world at 70% speed */
  function slowmoFactor() {
    if (!BD.ui.options) return 1;
    return BD.ui.options.get('slowmo') ? 0.7 : 1;
  }

  let acc = 0, last = 0;
  function frame(now) {
    const real = Math.min(250, now - last || 16);
    last = now;
    app.realNow = now;
    const w = app.world;
    if (app.state === 'menu') drawMenuBackdrop(real);
    if (w && app.state === 'playing') {
      BD.input.mouse.frame();
      BD.input.intent.frame(real);
      if (BD.input.gamepad) BD.input.gamepad.frame(real);
      if (!app.paused()) {
        if (app.hitstopMs > 0) app.hitstopMs -= real;
        else acc += real * slowmoFactor() * (app.timeScale || 1);
        let guard = 0;
        while (acc >= STEP_MS && guard++ < 20 * (app.timeScale || 1)) {
          BD.sim.world.step(w, STEP_MS);
          if (app.postStep) app.postStep(w);
          dispatch(w);
          acc -= STEP_MS;
        }
        if (guard >= 20 * (app.timeScale || 1)) acc = 0;
      } else dispatch(w);
      tickSaves();
      BD.view.render.draw(w, Math.min(1, acc / STEP_MS), real);
    }
    else if (BD.input.gamepad) BD.input.gamepad.frame(real);
    if (BD.ui.hud && w) BD.ui.hud.frame(w, real);
    else if (!w) document.body.classList.add('no-hud');
    if (BD.ui.hints) BD.ui.hints.frame(real);
    if (BD.ui.panels) BD.ui.panels.frame(real);
    if (BD.audio.music) BD.audio.music.frame(real);
    requestAnimationFrame(frame);
  }

  /** a slow, candle-lit backdrop behind the main menu */
  let menuT = 0;
  function drawMenuBackdrop(real) {
    menuT += real;
    const c = /** @type {HTMLCanvasElement} */ (document.getElementById('world'));
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    const gr = g.createRadialGradient(c.width / 2, c.height * 0.62, 10, c.width / 2, c.height * 0.6, c.height * 0.8);
    const fl = 0.85 + 0.15 * Math.sin(menuT / 180) * Math.sin(menuT / 67);
    gr.addColorStop(0, 'rgb(' + Math.round(70 * fl) + ',' + Math.round(34 * fl) + ',14)');
    gr.addColorStop(0.5, '#120a07');
    gr.addColorStop(1, '#030202');
    g.fillStyle = gr;
    g.fillRect(0, 0, c.width, c.height);
  }

  function newSeed() {
    const a = new Uint32Array(2);
    crypto.getRandomValues(a);
    return a[0].toString(36) + a[1].toString(36).slice(0, 4);
  }

  /** the gold-ledger tier unlocked in the meta progression (0 = none) */
  function ledgerLevel(u) {
    if (u.ledger3) return 3;
    if (u.ledger2) return 2;
    return u.ledger1 ? 1 : 0;
  }

  /** Start a run (from character creation or debug). */
  function startRun(opts) {
    const seed = opts.seed || newSeed();
    const world = BD.sim.world.createWorld(Object.assign({}, opts, { seed }));
    world.run.charId = opts.charId || newSeed();
    const meta = BD.ui.meta ? BD.ui.meta.get() : null;
    if (meta) {
      const u = meta.unlocks || {};
      world.run.flags.ledger = ledgerLevel(u);
      world.run.flags.wayfinder = !!u.wayfinder;
      world.run.flags.championLore = !!u.champion_lore;
      world.run.flags.merchantsFavor = !!u.merchants_favor;
      if (u.deep_flask) {
        world.player.flask.permMax = 5;
        world.player.flask.max += 1;
        world.player.flask.charges += 1;
      }
      let stashTabs = 1;
      if (u.stash2) stashTabs++;
      if (u.stash3) stashTabs++;
      world.run.flags.stashTabs = stashTabs;
    }
    if (BD.sim.economy && BD.sim.economy.onRunStart) BD.sim.economy.onRunStart(world, opts);
    if (BD.sim.run) BD.sim.run.begin(world, opts);
    else BD.sim.world.enterFloor(world, opts.floor || 1);
    setWorld(world);
    return world;
  }
  function setWorld(world) {
    app.world = world;
    app.state = 'playing';
    app.lastSaveAt = world.time;
    app.lastSafe = null;
    if (BD.ui.meta) {
      const m = BD.ui.meta.get();
      if (!Array.isArray(m.stash) || !Array.isArray(m.stash[0])) m.stash = [[]];
      while (m.stash.length < 3) m.stash.push([]);
      world.stash = m.stash;
    }
    acc = 0;
    bus.emit({ type: 'app.world', world });
    dispatch(world);
  }

  /** The view and audio layers declare what they need from their host; the app provides it. */
  function hostLayers() {
    const live = (obj, key, get) => Object.defineProperty(obj, key, { get, configurable: true });
    const ViewHost = BD.view.host;
    if (BD.ui.options) live(ViewHost, 'prefs', () => BD.ui.options.all);
    if (BD.input.mouse) live(ViewHost, 'pointer', () => BD.input.mouse);
    live(ViewHost, 'showLabels', () => app.showLabels);
    live(ViewHost, 'showBars', () => app.showBars);
    ViewHost.paused = () => app.paused();
    ViewHost.world = () => app.world;
    ViewHost.hitstop = (ms) => app.hitstop(ms);
    const AudioHost = BD.audio.host;
    if (BD.ui.options) {
      const VOLUMES = ['master', 'effects', 'music', 'ambience'];
      AudioHost.volume = (k) => BD.ui.options.get(k);
      AudioHost.onVolumeChange = (fn) => BD.ui.options.onChange((k) => { if (VOLUMES.includes(k)) fn(); });
    }
    AudioHost.world = () => app.world;
    AudioHost.playing = () => app.state === 'playing';
  }

  function boot() {
    if (BD.ui.options) BD.ui.options.load();
    hostLayers();
    const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('world'));
    BD.view.render.init(canvas);
    if (BD.ui.options) {
      BD.view.render.setZoom(BD.ui.options.get('zoom'));
      BD.ui.options.onChange((k, v) => { if (k === 'zoom') BD.view.render.setZoom(v); });
    }
    window.addEventListener('resize', () => BD.view.render.resize());
    if (BD.view.wire) BD.view.wire(bus);
    if (BD.audio.wire) BD.audio.wire(bus);
    if (BD.ui.wire) BD.ui.wire(bus);
    if (BD.input.gamepad) BD.input.gamepad.wire(bus);
    bus.on('save.request', (ev) => saveNow(ev.why || 'travel'));
    bus.on('stash', () => {
      if (BD.ui.meta) BD.ui.meta.save();
      saveNow('stash');
    });
    bus.on('run.death', () => {
      saveNow('death');
      setTimeout(() => BD.ui.panels.open('death'), 1200);
    });
    bus.on('run.harvest', (ev) => {
      if (BD.ui.meta) BD.ui.meta.addSouls(ev.souls);
      if (app.world && BD.ui.saves) BD.ui.saves.markDead(app.world.run.charId);
    });
    bus.on('run.victory', (ev) => {
      const w = app.world;
      if (BD.ui.meta) {
        const m = BD.ui.meta.get();
        const diff = w.run.difficulty;
        m.victories++;
        m.ascension[diff] = Math.max(m.ascension[diff] || 0, (w.run.ascension || 0) + 1);
        BD.ui.meta.addSouls(ev.souls);
      }
      saveNow('victory');
      if (BD.ui.saves) BD.ui.saves.markDead(w.run.charId);
      app.slowmoMs = 1000;
      setTimeout(() => BD.ui.panels.open('victory', { souls: ev.souls }), 2500);
    });
    BD.input.mouse.attach(canvas);
    BD.input.keyboard.attach();
    if (BD.input.gamepad) BD.input.gamepad.attach();
    if (BD.input.touch) BD.input.touch.attach();
    document.addEventListener('visibilitychange', () => { if (BD.audio.audio) BD.audio.audio.visibility(document.hidden); });
    window.addEventListener('beforeunload', () => { if (BD.app.saveNow) BD.app.saveNow('quit'); });
    if (app.debug) loadDebug();
    if (BD.ui.menu) BD.ui.menu.open();
    else startRun({ cls: 'fighter', name: 'Wanderer' });
    requestAnimationFrame((t) => {
      last = t;
      frame(t);
    });
  }

  function loadDebug() {
    const files = ['overlay', 'bot', 'arena', 'autotest'];
    for (const f of files) {
      const s = document.createElement('script');
      s.src = 'js/debug/' + f + '.js';
      s.async = false;
      document.body.appendChild(s);
    }
  }

  /** Save if the world is in a safe state; on quit fall back to the last safe snapshot. */
  function saveNow(why) {
    const w = app.world;
    if (!w || !w.run.charId || !BD.ui.saves) return false;
    if (w.run.dead && why !== 'death') return false;
    if (why === 'death' || BD.sim.save.isSafe(w)) {
      app.lastSaveAt = w.time;
      return BD.ui.saves.saveChar(w, why);
    }
    if (why === 'quit' && app.lastSafe) return BD.ui.saves.write('char_' + w.run.charId, app.lastSafe);
    return false;
  }
  /** keep an in-memory safe snapshot every ~2 s of world time (for quitting mid-fight) */
  function tickSaves() {
    const w = app.world;
    if (!w || w.run.dead || !w.run.charId) return;
    if (w.time - (app.lastSnapAt || 0) >= 2000 && BD.sim.save.isSafe(w)) {
      app.lastSnapAt = w.time;
      app.lastSafe = BD.sim.save.serialize(w, Date.now());
    }
    if (w.time - app.lastSaveAt >= BD.data.balance.player.autosaveMs) saveNow('auto');
  }

  function toMenu() {
    app.world = null;
    app.state = 'menu';
    app.tactical = false;
    if (BD.ui.menu) BD.ui.menu.open();
  }

  Object.assign(app, { boot, startRun, setWorld, stepSim, dispatch, newSeed, toMenu, saveNow });
  BD.boot = boot;
})(globalThis.BD);
