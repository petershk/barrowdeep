// Exercise the real Web Audio graph: every sound, every ambience profile, then report on screen.
BD.debug.autotests.audio = (D) => {
  D.newRun({ cls: 'fighter', floor: 3 });
  const A = BD.audio.audio, out = [];
  A.ensure();
  A.live = () => true;   // headless has no gesture; schedule anyway, the graph is what we test
  let ok = 0, bad = 0;
  const pl = BD.app.world.player;
  for (const id in BD.audio.sounds) {
    try {
      if (BD.audio.synth.play(id, { x: pl.x + 2, y: pl.y, priority: true, stack: 3 })) ok++;
      else out.push('skipped ' + id);
    }
    catch (e) { bad++; out.push(id + ': ' + e.message); }
  }
  for (const k in BD.audio.music.AMB) {
    try { BD.audio.music.ambience(k); BD.audio.music.frame(16); } catch (e) { bad++; out.push('amb ' + k + ': ' + e.message); }
  }
  try { BD.audio.music.play('dungeon'); BD.audio.music.frame(16); } catch (e) { bad++; out.push('music: ' + e.message); }
  const d = document.createElement('pre');
  d.style.cssText = 'position:fixed;top:40px;left:20px;color:#fd8;z-index:99;background:#000c;font-size:14px;padding:8px';
  d.textContent = 'AUDIO: ' + ok + ' sounds scheduled, ' + bad + ' errors, ctx=' + (A.ctx && A.ctx.state)
    + ', voices=' + BD.audio.synth.voiceCount + '\n' + out.slice(0, 20).join('\n');
  document.body.appendChild(d);
};
