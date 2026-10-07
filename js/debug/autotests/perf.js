// Render budget (06 §15): draw time with ~80 monsters in view, combat FX and lighting.
BD.debug.autotests.perf = (D) => {
  const w = D.newRun({ cls: 'magician', seed: 'perf', floor: 11 });
  const p = w.player;
  const roster = Object.values(BD.data.monsters).filter((m) => m.act === 4 && !m.spawner && !m.spawnOnly);
  for (let i = 0; i < 160; i++) BD.sim.monsters.spawn(w, roster[i % roster.length].id, p.x + ((i * 7) % 17) - 8, p.y + ((i * 11) % 17) - 8, { noLoot: true });
  // harmless crowd: the scene measures drawing, not survival
  for (const e of w.floor.entities.values()) if (e.kind === 'monster') { e.ai.held = true; e.ai.state = 'idle'; }
  const times = [];
  for (let i = 0; i < 150; i++) {
    D.step(16);
    if (i % 10 === 0) BD.view.fx.play('impact_magic', p.x + 2, p.y, { school: 'fire', scale: 1.6 });
    if (i % 4 === 0) BD.view.fx.play('impact_sword', p.x - 1 + (i % 3), p.y + 1, { scale: 1.2 });
    const t0 = performance.now();
    BD.view.render.draw(w, 0.5, 16);
    if (i >= 30) times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const mons = [...w.floor.entities.values()].filter((e) => e.kind === 'monster' && !e.dead && w.floor.visible[e.y * w.floor.w + e.x]).length;
  const d = document.createElement('pre');
  d.style.cssText = 'position:fixed;top:40px;left:20px;color:#9f9;z-index:99;background:#000c;font-size:16px;padding:8px';
  d.textContent = 'RENDER: visible monsters ' + mons + ', particles ' + BD.view.fx.live + '\nmedian ' + times[times.length >> 1].toFixed(2) + ' ms  p95 ' + times[Math.floor(times.length * 0.95)].toFixed(2) + ' ms  (budget 8 ms)';
  document.body.appendChild(d);
};
