// Audio data: every sim event is cued or explicitly silent, and every cue names a real sound.
'use strict';
const fs = require('fs');
const path = require('path');
const { loadBD, ROOT } = require('./harness');

module.exports = (T) => {
  const BD = loadBD({ extra: ['js/audio/sounds.js', 'js/audio/cues.js'] });
  const { CUES, SILENT, resolve } = BD.audio.cues;
  const S = BD.audio.sounds;

  function simEventTypes() {
    const out = new Set(['dodge']);   // damage.js picks 'dodge' or 'miss' at runtime
    const dir = path.join(ROOT, 'js/sim');
    const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (f.endsWith('.js')) { const s = fs.readFileSync(p, 'utf8'); const re = /events\.push\(\{ ?type: '([a-z_.]+)'/g; let m; while ((m = re.exec(s))) out.add(m[1]); } } };
    walk(dir);
    return out;
  }

  T.test('every sim event type has a cue or is explicitly silent', () => {
    for (const t of simEventTypes()) T.ok(t in CUES || SILENT.includes(t), 'event ' + t + ' has no cue and is not listed silent');
    for (const t of SILENT) T.ok(!(t in CUES), t + ' is both cued and silent');
  });

  T.test('sound specs are well-formed', () => {
    for (const id in S) {
      const s = S[id];
      T.ok(Array.isArray(s.layers) && s.layers.length, id + ' has layers');
      for (const L of s.layers) {
        T.ok(!!L.osc !== !!L.noise, id + ' layer is exactly one of osc/noise');
        T.ok(L.f.length === 2 && L.f[0] > 0 && L.f[1] > 0, id + ' frequencies');
        T.ok(L.dur > 0 && L.vol > 0 && L.vol <= 0.2 && L.t >= 0, id + ' timing/volume');
      }
    }
  });

  T.test('cues fired by real play name existing sounds', () => {
    const used = new Set();
    for (const cls of ['fighter', 'assassin', 'magician', 'valkyrie']) {
      const w = BD.sim.world.createWorld({ seed: 'aud-' + cls, cls, name: 't' });
      BD.sim.run.travel(w, 3, 'spawn');
      BD.app = { world: w, state: 'playing' };
      const bar = Object.values(BD.data.skills).filter((s) => s.cls === cls && !s.keystone && !s.passive).map((s) => s.id);
      for (const id of bar) w.player.skills[id] = 1;
      for (let i = 0; i < 3000; i++) {
        if (i % 20 === 0 && !w.player.dead) {
          let best = null, bd = 1e9;
          for (const e of w.floor.entities.values()) { if (e.dead) continue; const d = Math.hypot(e.x - w.player.x, e.y - w.player.y); if (d < bd) { bd = d; best = e; } }
          if (best) {
            const ab = bar[(i / 20) % bar.length];
            w.player.bar.rmb = ab;
            BD.sim.commands.issue(w, i % 40 ? { type: 'UseSkill', slot: 'rmb', aim: { entityId: best.id, x: best.x, y: best.y } } : { type: 'Engage', entityId: best.id, hold: true });
          }
        }
        BD.sim.world.step(w, BD.core.scheduler.STEP_MS);
        for (const ev of w.events) for (const [id] of resolve(ev)) { T.ok(!!S[id], ev.type + ' → unknown sound ' + id); used.add(id); }
        w.events.length = 0;
      }
    }
    if (process.env.AUD_LOG) console.log([...used].join(' '));
    T.ok(used.size >= 12, 'real play exercised ' + used.size + ' sounds');
  });

  T.test('cues tolerate sparse payloads', () => {
    const w = BD.sim.world.createWorld({ seed: 'aud', cls: 'fighter', name: 't' });
    BD.sim.run.travel(w, 1, 'spawn');
    BD.app = { world: w, state: 'playing' };
    const p = w.player;
    for (const type in CUES) {
      for (const ev of [{ type }, { type, id: p.id, x: 3, y: 4, tgtId: p.id, total: 5 }, { type, srcId: p.id, tgtId: -1, total: 3, tags: ['melee'], rarity: 'rare', heavy: true, kind: 'monster', family: 'undead', n: 2, abilityId: 'attack', weapon: 'arrow' }]) {
        for (const [id] of resolve(ev)) T.ok(!!S[id], type + ' → unknown sound ' + id);
      }
    }
  });
};
