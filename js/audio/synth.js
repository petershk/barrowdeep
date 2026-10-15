// @ts-check
// The one sound interpreter (07 §5.2): plays a BD.audio.sounds entry, positioned relative to the
// player (pan from screen-x, distance falloff), with a per-cue limiter and a global voice budget.
// The limiter keeps a crowd from machine-gunning one sound: at most LIMIT_N starts of a sound inside
// LIMIT_MS, and a sound may ask for a longer minimum gap of its own (spec.minGap, ms).
(function (BD) {
  'use strict';

  const Audio = () => BD.audio.audio;
  const VOICES = 32, LIMIT_N = 2, LIMIT_MS = 70, FALL = 18;
  let voices = [];                 // end times of live sounds
  const recent = new Map();        // sound id → recent start times (ms, audio clock)

  // ts stretches a sound in time (a wind-up riser lasting as long as the wind-up it voices)
  function tone(ctx, out, L, t0, pitch, vol, ts) {
    const reps = L.repeat ? L.repeat.n : 1;
    const dt = (L.repeat ? L.repeat.dt : 0) * ts, dur = L.dur * ts;
    for (let r = 0; r < reps; r++) {
      const t = t0 + L.t * ts + r * dt;
      const k = pitch * (L.rand ? 1 + (Math.random() - 0.5) * (L.rand / L.f[0]) * 0.5 : 1);
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = L.osc;
      o.frequency.setValueAtTime(Math.max(20, L.f[0] * k), t);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, L.f[1] * k), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, L.vol * vol), t + Math.min(0.01, dur * 0.2));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(out);
      o.start(t);
      o.stop(t + dur + 0.02);
    }
  }
  function noise(ctx, out, L, t0, pitch, vol, ts) {
    const reps = L.repeat ? L.repeat.n : 1;
    const dt = (L.repeat ? L.repeat.dt : 0) * ts, dur = L.dur * ts;
    for (let r = 0; r < reps; r++) {
      const t = t0 + L.t * ts + r * dt;
      const src = ctx.createBufferSource();
      src.buffer = Audio().noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = L.noise;
      f.Q.value = L.q || 1;
      const k = pitch * (L.rand ? 1 + (Math.random() - 0.5) * 0.4 : 1);
      f.frequency.setValueAtTime(L.f[0] * k, t);
      f.frequency.exponentialRampToValueAtTime(Math.max(20, L.f[1] * k), t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(L.vol * vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f);
      f.connect(g);
      g.connect(out);
      // the noise buffer is 0.4 s: a stretched layer loops it rather than running off the end
      if (dur > 0.18) src.loop = true;
      src.start(t, Math.random() * 0.2);
      src.stop(t + dur + 0.02);
    }
  }

  /** where a world position sits for the listener: pan −1..1 and gain 0.1..1 */
  function placement(x, y) {
    const w = BD.audio.host.world(), p = w && w.player;
    if (x == null || !p) return { pan: 0, gain: 1 };
    const dx = x - p.x, dy = y - p.y;
    const dist = Math.hypot(dx, dy);
    return { pan: Math.max(-1, Math.min(1, (dx - dy) / 12)), gain: Math.max(0.1, Math.min(1, 1 - dist / FALL)) };
  }

  /**
   * play(id, {x, y, vol, pitch, stack, bus, at, stretch})
   * stack: 1-based repeat index for escalating sounds (ki charges climb in pitch)
   * stretch: time scale for the whole sound (1 = as written)
   */
  function play(id, o) {
    const a = Audio();
    if (!a || !a.live()) return false;
    const spec = BD.audio.sounds[id];
    if (!spec) return false;
    o = o || {};
    const ctx = a.ctx, now = ctx.currentTime, ms = now * 1000;
    // per-cue limiter: at most LIMIT_N starts within LIMIT_MS
    let r = recent.get(id);
    if (!r) recent.set(id, (r = []));
    while (r.length && ms - r[0] > Math.max(LIMIT_MS, spec.minGap || 0)) r.shift();
    if (r.length >= LIMIT_N || (spec.minGap && r.length && ms - r[r.length - 1] < spec.minGap)) return false;
    // voice budget: drop new low-priority sounds rather than cutting old ones
    voices = voices.filter((e) => e > now);
    if (voices.length >= VOICES && !o.priority) return false;
    r.push(ms);
    const pl = placement(o.x, o.y);
    const j = spec.jitter || { pitch: 0, vol: 0 };
    const stack = spec.stackPitch && o.stack ? 1 + spec.stackPitch * (o.stack - 1) : 1;   // rising pitch per combo stack
    const pitch = (o.pitch || 1) * (1 + (Math.random() * 2 - 1) * (j.pitch || 0)) * stack;
    const vol = (o.vol == null ? 1 : o.vol) * pl.gain * (1 + (Math.random() * 2 - 1) * (j.vol || 0));
    const pan = ctx.createStereoPanner();
    pan.pan.value = pl.pan;
    pan.connect(o.bus === 'music' ? a.music : a.sfx);
    const verb = o.bus === 'music' ? a.reverb : a.sfxVerb;
    if (o.reverb && verb) {
      const s = ctx.createGain();
      s.gain.value = o.reverb;
      pan.connect(s);
      s.connect(verb);
    }
    const t0 = now + (o.at || 0) + 0.005, ts = o.stretch || 1;
    let end = t0;
    for (const L of spec.layers) {
      (L.osc ? tone : noise)(ctx, pan, L, t0, pitch, vol, ts);
      end = Math.max(end, t0 + (L.t + L.dur + (L.repeat ? L.repeat.n * L.repeat.dt : 0)) * ts);
    }
    voices.push(end);
    return true;
  }

  BD.audio.synth = { play, placement, get voiceCount() { return voices.length; } };
})(globalThis.BD);
