// Drive the game with a synthetic standard-mapping pad: walk with the stick, attack with A, open the
// inventory with Start and move focus with the D-pad.
BD.debug.autotests.gamepad = (D) => {
  const arg = (k, d) => { const m = new RegExp('[?&]' + k + '=([a-z0-9_]+)').exec(location.search); return m ? m[1] : d; };
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
  const fake = { index: 0, connected: true, axes: [0, 0, 0, 0], buttons };
  Object.defineProperty(navigator, 'getGamepads', { value: () => [fake], configurable: true });
  const G = BD.input.gamepad;
  const press = (b, on) => { fake.buttons[b].pressed = on; fake.buttons[b].value = on ? 1 : 0; };
  const tick = (n) => { for (let i = 0; i < n; i++) { BD.input.mouse.frame(); G.frame(16); D.step(16); } };
  D.newRun({ cls: 'valkyrie', floor: 2 });
  const p = BD.app.world.player, x0 = p.x, y0 = p.y;
  fake.axes[0] = 1; tick(60); fake.axes[0] = 0; tick(5);           // stick right = screen right
  const moved = { dx: p.x - x0, dy: p.y - y0 };
  press(G.BTN.A, true); tick(2); press(G.BTN.A, false); tick(30);
  const out = [
    'search: ' + location.search,
    'stick right moved player by (' + moved.dx + ',' + moved.dy + ')',
    'target: ' + (G.pad.target ? G.pad.target.def : 'none'),
    'prompt: ' + G.pad.prompt,
  ];
  if (arg('menu', '0') === '1') {
    press(G.BTN.START, true); tick(1); press(G.BTN.START, false); tick(1);
    for (let i = 0; i < 3; i++) { press(G.BTN.RIGHT, true); tick(1); press(G.BTN.RIGHT, false); tick(1); }
    const top = BD.ui.panels.top();
    const focus = G.pad.focus && (G.pad.focus.className + ' ' + (G.pad.focus.textContent || '').slice(0, 30));
    out.push('panel: ' + (top && top.id) + ', focus: ' + focus);
  }
  D.render(5);
  const d = document.createElement('pre');
  d.style.cssText = 'position:fixed;top:40px;left:20px;color:#fd8;z-index:99;background:#000c;font-size:14px;padding:8px';
  d.textContent = 'PAD: ' + out.join('\n');
  document.body.appendChild(d);
};
