// @ts-check
// Boss bar (07 §6.2): 62% width, quarter notches, phase markers, "— <PHASE>" after enrage,
// and the target nameplate (name, level, HP, mods, status icons) for hovered/locked enemies.
(function (BD) {
  'use strict';

  const { h, setText, root } = BD.ui.dom;
  let bar = null, plate = null;

  function mount() {
    bar = h('div.bossbar.hidden', [h('div.bb-name'), h('div.bb-track', [h('div.bb-fill'), h('div.bb-notches')])]);
    const track = h('div.np-track', [h('div.np-trail'), h('div.np-fill')]);
    plate = h('div.nameplate.hidden', [h('div.np-name'), h('div.np-sub'), track, h('div.np-mods')]);
    root().appendChild(bar);
    root().appendChild(plate);
  }

  function frame(world) {
    if (!bar) mount();
    const f = world.floor;
    let boss = null;
    const shades = [];
    for (const e of f.entities.values()) {
      if (e.dead || !(e.rank === 'boss' || e.rank === 'malgoth')) continue;
      if (e.isShade || e.shadeOf != null) shades.push(e);
      if (!boss && e.ai && e.ai.woke) boss = e;
    }
    if (!boss) bar.classList.add('hidden');
    else {
      bar.classList.remove('hidden');
      const d = BD.sim.monsters.defOf(boss);
      const st = boss.ai.boss || { phase: 0 };
      let hp = boss.hp, max = BD.sim.stats.statsOf(world, boss).maxLife;
      if (shades.length > 1) {
        hp = 0;
        for (const s of shades) hp += Math.max(0, s.hp);
        max = boss.shadeMax || max;
      }
      const phName = st.phase > 0 && d.phases ? ' — ' + d.phases[st.phase - 1].name.toUpperCase() : '';
      setText(bar.querySelector('.bb-name'), d.name + ' · level ' + ((boss.al || f.al) + 2) + phName);
      bar.querySelector('.bb-fill').style.width = Math.max(0, (hp / max) * 100).toFixed(2) + '%';
      const notches = bar.querySelector('.bb-notches');
      if (!notches.childElementCount) {
        for (const q of [25, 50, 75]) notches.appendChild(h('span.bb-q', { style: { left: q + '%' } }));
        for (const ph of d.phases || []) notches.appendChild(h('span.bb-phase', { style: { left: ph.atPct + '%' } }));
      }
      bar.dataset.boss = d.id;
    }
    // nameplate for hover or lock
    const m = BD.input.mouse;
    const t = m.hoverEntity || (world.player.lockId != null ? BD.sim.entities.get(world, world.player.lockId) : null);
    if (!t || t.dead || t.faction === 'player' || t === boss) {
      plate.classList.add('hidden');
      return;
    }
    plate.classList.remove('hidden');
    const d = BD.sim.monsters.defOf(t);
    const max = BD.sim.stats.statsOf(world, t).maxLife;
    const rankTxt = { normal: '', minion: 'Minion', champion: 'Champion', unique: 'Unique', keeper: 'Keeper' }[t.rank] || '';
    setText(plate.querySelector('.np-name'), t.name || (t.rank === 'champion' ? d.name + ' Champion' : d.name));
    plate.querySelector('.np-name').className = 'np-name rank-' + t.rank;
    setText(plate.querySelector('.np-sub'), [rankTxt, 'level ' + (t.al || f.al), d.family].filter(Boolean).join(' · '));
    const w = Math.max(0, (t.hp / max) * 100).toFixed(1) + '%';
    plate.querySelector('.np-fill').style.width = w;
    // the pale trail lags behind the fill, so the chunk you just took off stays visible a moment
    const trail = /** @type {HTMLElement} */ (plate.querySelector('.np-trail'));
    if (plate.dataset.target !== String(t.id)) trail.style.transition = 'none';
    else trail.style.transition = '';
    trail.style.width = w;
    plate.dataset.target = String(t.id);
    const mods = (t.mods || []).map((id) => BD.data.championMods[id].name);
    const sts = t.statuses.filter((s) => !BD.data.statuses[s.id].hiddenChip).map((s) => BD.data.statuses[s.id].name);
    setText(plate.querySelector('.np-mods'), mods.concat(sts).join(' · '));
  }

  BD.ui.hud.add({ frame });
})(globalThis.BD);
