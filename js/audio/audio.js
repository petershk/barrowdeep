// @ts-check
// The audio graph (07 §5.1): sfx / music / ambience buses → master → limiter → out. The context is
// created on the first user gesture (browsers refuse earlier), suspended while the tab is hidden.
(function (BD) {
  'use strict';

  const A = {
    ctx: /** @type {AudioContext|null} */ (null),
    master: null, sfx: null, music: null, amb: null, reverb: null, noiseBuf: null,
    ready: false,
  };
  const OPT = () => BD.ui.options;
  const lvl = (k) => { const v = OPT() ? OPT().get(k) : 80; return Math.max(0, Math.min(100, v == null ? 80 : v)) / 100; };
  // perceptual curve: sliders feel linear when gain follows the square
  const curve = (v) => v * v;

  function ensure() {
    if (A.ctx) return A.ctx;
    const Ctor = globalThis.AudioContext || /** @type {any} */ (globalThis).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    A.ctx = ctx;
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -9; lim.knee.value = 8; lim.ratio.value = 14; lim.attack.value = 0.003; lim.release.value = 0.2;
    lim.connect(ctx.destination);
    A.master = ctx.createGain(); A.master.connect(lim);
    for (const k of ['sfx', 'music', 'amb']) { A[k] = ctx.createGain(); A[k].connect(A.master); }
    // one shared white-noise buffer feeds every noise layer
    const len = Math.floor(ctx.sampleRate * 0.4);
    A.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = A.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // a 2.8 s decaying-noise chamber shared by ambience and big moments
    const rl = Math.floor(ctx.sampleRate * 2.8), ir = ctx.createBuffer(2, rl, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const c = ir.getChannelData(ch); for (let i = 0; i < rl; i++) c[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / rl, 2.6); }
    A.reverb = ctx.createConvolver(); A.reverb.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = 0.8; A.reverb.connect(wet); wet.connect(A.amb);
    if (OPT()) OPT().onChange((k) => { if (k === 'master' || k === 'effects' || k === 'music' || k === 'ambience') applyVolumes(); });
    applyVolumes();
    A.ready = true;
    return ctx;
  }

  function applyVolumes() {
    if (!A.ctx) return;
    const t = A.ctx.currentTime;
    A.master.gain.setTargetAtTime(curve(lvl('master')), t, 0.05);
    A.sfx.gain.setTargetAtTime(curve(lvl('effects')), t, 0.05);
    A.amb.gain.setTargetAtTime(curve(lvl('ambience')), t, 0.05);
    A.music.gain.setTargetAtTime(1, t, 0.05);   // music is <audio> elements; this bus is for synth stingers
    if (BD.audio.music) BD.audio.music.applyVolume();
  }

  function resume() {
    const ctx = ensure();
    if (ctx && ctx.state === 'suspended' && !hidden) ctx.resume();
    if (BD.audio.music) BD.audio.music.unlock();
  }
  let hidden = false;
  function visibility(h) {
    hidden = h;
    if (A.ctx) { if (h) A.ctx.suspend(); else A.ctx.resume(); }
    if (BD.audio.music) BD.audio.music.pause(h);
  }
  const now = () => (A.ctx ? A.ctx.currentTime : 0);
  const live = () => !!(A.ctx && A.ctx.state === 'running' && !hidden);

  BD.audio.audio = Object.assign(A, { ensure, resume, visibility, applyVolumes, now, live, level: lvl, curve });
})(globalThis.BD);
