// @ts-check
// Music and ambience (07 §5.4). Tracks are <audio> elements crossfaded over 1.5 s; a track that
// fails to load (or never reports ready within 3 s) leaves silence plus ambience. The ambience bed
// is synthesised per biome: a detuned drone + filtered wind, with drips and distant moans in the
// dungeon and a fingerpicked guitar in town. Also owns the per-frame sounds: footsteps, heartbeat.
(function (BD) {
  'use strict';

  const A = () => BD.audio.audio;
  const TRACKS = {
    menu: { src: 'assets/audio/menu.ogg', vol: 0.7 },
    town: { src: 'assets/audio/town.mp3', vol: 0.5 },
    dungeon: { src: 'assets/audio/dungeon.ogg', vol: 1 },
    boss: { src: 'assets/audio/boss.mp3', vol: 0.95 },
  };
  const FADE_MS = 1500;
  // ambience profiles by biome
  const AMB = {
    town: { kind: 'guitar', drones: [110, 165, 220], cutoff: 1500, wind: [600, 0.3, 0.008], droneVol: 0.018 },
    church: { drones: [73, 98, 147], cutoff: 520, wind: [340, 0.6, 0.02], droneVol: 0.055, moanHz: 150, drip: [4.5, 6], moan: [16, 12] },
    catacombs: { drones: [62, 87, 131], cutoff: 430, wind: [260, 0.8, 0.026], droneVol: 0.06, moanHz: 132, drip: [3, 4], moan: [12, 10] },
    caves: { drones: [55, 78, 117], cutoff: 360, wind: [200, 1, 0.032], droneVol: 0.06, moanHz: 120, drip: [1.8, 3], moan: [9, 9] },
    hell: { drones: [49, 69, 104], cutoff: 320, wind: [160, 1, 0.03], droneVol: 0.075, moanHz: 104, drip: [3, 5], moan: [7, 7] },
    sanctum: { drones: [44, 62, 93], cutoff: 300, wind: [150, 1.1, 0.036], droneVol: 0.09, moanHz: 96, drip: [3, 5], moan: [6, 6] },
    menu: { drones: [62, 93, 124], cutoff: 380, wind: [240, 0.7, 0.02], droneVol: 0.04, drip: [5, 6] },
  };

  const els = {};
  let want = null, unlocked = false, paused = false;

  function el(name) {
    if (els[name] !== undefined) return els[name];
    if (typeof Audio === 'undefined') return (els[name] = null);
    const t = TRACKS[name];
    const a = new Audio();
    a.loop = true; a.preload = 'auto'; a.volume = 0;
    const rec = { a, ok: null, cur: 0, target: 0, base: t.vol };
    a.addEventListener('canplaythrough', () => { rec.ok = true; });
    a.addEventListener('error', () => { rec.ok = false; });
    setTimeout(() => { if (rec.ok === null) rec.ok = a.readyState >= 3; }, 3000);
    a.src = t.src;
    return (els[name] = rec);
  }
  const musicLevel = () => A().curve(A().level('music')) * A().curve(A().level('master'));

  /** choose the track; null fades everything out */
  function play(name) {
    if (name && !TRACKS[name]) name = 'dungeon';
    want = name;
    for (const k in TRACKS) { const r = els[k] || (k === name ? el(k) : null); if (r) r.target = k === name ? 1 : 0; }
    if (unlocked && name) start(els[name]);
    const amb = name === 'menu' ? 'menu' : name === 'town' ? 'town' : null;
    if (amb) ambience(amb);
  }
  function start(r) { if (r && r.ok !== false && r.a.paused && !paused) { const pr = r.a.play(); if (pr && pr.catch) pr.catch(() => {}); } }
  function unlock() { unlocked = true; if (want) start(els[want]); if (bed && A().ctx) bed.g.gain.setTargetAtTime(0.9, A().ctx.currentTime, 1.2); }
  function pause(h) { paused = h; for (const k in els) { const r = els[k]; if (!r) continue; if (h) r.a.pause(); else if (r.target > 0) start(r); } }
  function applyVolume() { for (const k in els) { const r = els[k]; if (r) r.a.volume = Math.max(0, Math.min(1, r.cur * r.base * musicLevel())); } }

  // ---------------- ambience bed ----------------
  let bed = null, prof = null, sched = null;
  function buildBed(ctx) {
    const g = ctx.createGain(); g.gain.value = 0.0001; g.connect(A().amb);
    const rs = ctx.createGain(); rs.gain.value = 0.25; g.connect(rs); rs.connect(A().reverb);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.Q.value = 0.7; lp.connect(g);
    const oscs = [], gains = [];
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator(); o.type = i === 2 ? 'triangle' : 'sine'; o.detune.value = (i - 1) * 6;
      const og = ctx.createGain(); og.gain.value = 0.0001; o.connect(og); og.connect(lp); o.start();
      oscs.push(o); gains.push(og);
    }
    const ws = ctx.createBufferSource(); ws.buffer = A().noiseBuf; ws.loop = true;
    const wbp = ctx.createBiquadFilter(); wbp.type = 'bandpass'; wbp.frequency.value = 360; wbp.Q.value = 0.6;
    const wg = ctx.createGain(); wg.gain.value = 0.0001; ws.connect(wbp); wbp.connect(wg); wg.connect(g); ws.start();
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.045; const lg = ctx.createGain(); lg.gain.value = 120;
    lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
    return { g, lp, oscs, gains, wbp, wg };
  }
  let ambWant = null;
  function ambience(name) {
    ambWant = name;
    const a = A();
    if (!a || !a.ctx) return;
    const ctx = a.ctx, t = ctx.currentTime, R = 4;
    if (!bed) { bed = buildBed(ctx); bed.g.gain.setTargetAtTime(0.9, t, 1.2); }
    prof = AMB[name] || AMB.catacombs;
    bed.lp.frequency.setTargetAtTime(prof.cutoff, t, R);
    bed.oscs.forEach((o, i) => { o.frequency.setTargetAtTime(prof.drones[i], t, R); bed.gains[i].gain.setTargetAtTime(prof.droneVol * (i === 2 ? 0.5 : 1), t, R); });
    bed.wbp.frequency.setTargetAtTime(prof.wind[0], t, R); bed.wbp.Q.value = prof.wind[1];
    bed.wg.gain.setTargetAtTime(prof.wind[2], t, R);
    if (!sched) sched = { next: t + 0.4, nextMoan: t + 3, step: 0, chord: -1 };
  }

  function drip(ctx, when, pan) {
    const o = ctx.createOscillator(), g = ctx.createGain(), f = 900 + Math.random() * 1500;
    o.frequency.setValueAtTime(f, when); o.frequency.exponentialRampToValueAtTime(f * 0.45, when + 0.05);
    g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(0.05, when + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.13);
    const pn = ctx.createStereoPanner(); pn.pan.value = pan;
    o.connect(g); g.connect(pn); pn.connect(A().amb); pn.connect(A().reverb);
    o.start(when); o.stop(when + 0.16);
  }
  function moan(ctx, when, pan, hz) {
    const dur = 2.2 + Math.random() * 1.8, base = hz * (0.92 + Math.random() * 0.18);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 480; lp.Q.value = 5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(0.045, when + dur * 0.4); g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    for (let i = 0; i < 2; i++) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(base * (i ? 1.012 : 1), when);
      o.frequency.linearRampToValueAtTime(base * (1 + (Math.random() * 0.08 - 0.03)), when + dur * 0.6);
      o.frequency.linearRampToValueAtTime(base * 0.94, when + dur);
      o.connect(lp); o.start(when); o.stop(when + dur + 0.1);
    }
    const pn = ctx.createStereoPanner(); pn.pan.value = pan;
    lp.connect(g); g.connect(pn); pn.connect(A().amb); pn.connect(A().reverb);
  }
  function pluck(ctx, when, freq, vol, pan) {
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
    o1.type = o2.type = 'triangle'; o2.detune.value = 6; o1.frequency.value = o2.frequency.value = freq;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.5;
    lp.frequency.setValueAtTime(Math.min(3200, freq * 4), when); lp.frequency.exponentialRampToValueAtTime(Math.max(360, freq * 1.4), when + 0.4);
    g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(vol, when + 0.022); g.gain.exponentialRampToValueAtTime(0.0001, when + 2.4);
    o1.connect(lp); o2.connect(lp); lp.connect(g);
    const pn = ctx.createStereoPanner(); pn.pan.value = pan; g.connect(pn); pn.connect(A().amb);
    const rs = ctx.createGain(); rs.gain.value = 0.35; pn.connect(rs); rs.connect(A().reverb);
    o1.start(when); o2.start(when); o1.stop(when + 2.45); o2.stop(when + 2.45);
  }
  // town guitar: a slow minor progression, Travis-ish fingerpicking with grace notes
  const GUITAR = { bpm: 74, root: 110, prog: [[0, 1], [-2, 0], [-4, 0], [0, 1], [-2, 0], [3, 0], [-4, 0], [-5, 1]], pat: [0, 2, 3, 1, 0, 3, 2, 1] };
  function schedule(ctx) {
    const t = ctx.currentTime, ahead = t + 0.6;
    if (sched.next < t) sched.next = t + 0.1;           // never burst-catch-up after a pause
    if (sched.nextMoan < t) sched.nextMoan = t + 1;
    if (prof.kind === 'guitar') {
      if (els.town && els.town.ok && els.town.cur > 0.5) { sched.next = ahead; return; }   // the real track plays instead
      const beat = 60 / GUITAR.bpm / 2;
      while (sched.next < ahead) {
        const bar = sched.step % 8;
        if (bar === 0) sched.chord = (sched.chord + 1) % GUITAR.prog.length;
        const [r, minor] = GUITAR.prog[sched.chord], base = GUITAR.root * Math.pow(2, r / 12);
        const voice = [base, base * Math.pow(2, 19 / 12), base * Math.pow(2, ((minor ? 3 : 4) + 12) / 12), base * 4];
        const idx = GUITAR.pat[bar];
        pluck(ctx, sched.next, voice[idx], idx === 0 ? 0.06 : 0.04, (idx - 1.5) * 0.16);
        if (idx && Math.random() < 0.24) pluck(ctx, sched.next + beat * 0.5, base * Math.pow(2, ([0, 3, 7, 10, 12][Math.floor(Math.random() * 5)] + 24) / 12), 0.03, 0.35);
        sched.next += beat; sched.step++;
      }
      return;
    }
    while (sched.next < ahead) { drip(ctx, sched.next, (Math.random() * 2 - 1) * 0.85); sched.next += prof.drip[0] + Math.random() * prof.drip[1]; }
    if (prof.moanHz) while (sched.nextMoan < ahead) { moan(ctx, sched.nextMoan, (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.4), prof.moanHz); sched.nextMoan += prof.moan[0] + Math.random() * prof.moan[1]; }
  }

  // ---------------- per frame ----------------
  let lastStep = null, stepN = 0, nextBeat = 0;
  function frame(realMs) {
    const dt = Math.min(100, realMs || 16);
    for (const k in els) {
      const r = els[k];
      if (!r) continue;
      const step = dt / FADE_MS;
      r.cur = r.cur < r.target ? Math.min(r.target, r.cur + step) : Math.max(r.target, r.cur - step);
      if (r.cur <= 0 && !r.a.paused) r.a.pause();
      else if (r.target > 0 && unlocked) start(r);
    }
    applyVolume();
    const a = A();
    if (!a || !a.live()) return;
    if (ambWant && (!prof || prof !== AMB[ambWant])) ambience(ambWant);
    if (sched && prof) schedule(a.ctx);
    const w = BD.app && BD.app.world, p = w && w.player;
    if (!p || BD.app.state !== 'playing') return;
    // footsteps every other tile
    const key = p.x * 4096 + p.y;
    if (lastStep !== null && key !== lastStep && ++stepN % 2 === 0) BD.audio.synth.play(w.floor.n ? 'step_stone' : 'step_dirt', {});
    lastStep = key;
    // low-life heartbeat below 30 %
    const max = BD.sim.stats.statsOf(w, p).maxLife;
    if (!p.dead && p.hp > 0 && p.hp < max * 0.3 && a.now() >= nextBeat) {
      BD.audio.synth.play('heartbeat', { priority: true, vol: 1.6 - p.hp / max * 2 });
      nextBeat = a.now() + (p.hp < max * 0.15 ? 0.7 : 1);
    }
  }

  /** follow the world: biome ambience and the track for where we are */
  function wire(bus) {
    const sync = () => {
      const w = BD.app.world;
      if (!w || !w.floor) return;
      const f = w.floor;
      ambience(f.biome === 'town' ? 'town' : AMB[f.biome] ? f.biome : 'catacombs');
      const bossAwake = Array.from(f.entities.values()).some((e) => (e.rank === 'boss' || e.rank === 'malgoth') && !e.dead && e.ai && e.ai.woke);
      play(f.biome === 'town' ? 'town' : bossAwake ? 'boss' : 'dungeon');
    };
    bus.on('app.world', sync);
    bus.on('floor.enter', sync);
    bus.on('town.arrive', sync);
    bus.on('boss.wake', () => play('boss'));
    bus.on('boss.defeat', () => play('dungeon'));
    bus.on('run.death', () => play(null));
    bus.on('run.victory', () => play('town'));
  }

  BD.audio.music = { TRACKS, AMB, play, unlock, pause, applyVolume, frame, wire, ambience };
})(globalThis.BD);
