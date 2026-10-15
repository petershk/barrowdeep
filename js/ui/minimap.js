// @ts-check
// Minimap: a corner map by default, Tab toggles a large overlay. Drawn in iso orientation from
// the floor's explored mask; markers for stairs, waypoint, portal, gate, Keeper ping, events.
(function (BD) {
  'use strict';

  const Grid = BD.core.grid;
  const { T, WALK } = BD.data.tiles;
  let el = null, cv = null, gold = null, hint = null, big = false, buf = null, bufKey = '', lastVersion = -1;
  const Palette = BD.view.palette;
  const M = Palette.MEANING;
  /** enemy dot colour by rank (ART_DIRECTION.md: champion = magic blue, keeper/unique = rare gold, boss red) */
  const RANK_COL = { champion: M.champion, unique: M.unique, keeper: M.unique, boss: M.boss, malgoth: M.boss };

  function mount() {
    const { h, root } = BD.ui.dom;
    cv = /** @type {HTMLCanvasElement} */ (h('canvas'));
    hint = h('div.mm-hint');
    gold = h('div.mm-gold');
    el = h('div.minimap', [cv, hint, gold]);
    root().appendChild(el);
  }
  function toggle() {
    big = !big;
    el.classList.toggle('big', big);
    lastVersion = -1;
  }

  function frame(world) {
    if (!el) mount();
    const f = world.floor;
    if (!f) return;
    BD.ui.dom.setText(gold, world.player.gold.toLocaleString('en-US') + ' gold');
    BD.ui.dom.setText(hint, big ? '' : BD.ui.hudOrbs.keyLabel('map') + ' · full map');
    const size = big ? Math.min(window.innerWidth, window.innerHeight) * 0.8 : 200;
    if (cv.width !== Math.round(size)) {
      cv.width = Math.round(size);
      cv.height = Math.round(size * 0.55);
      lastVersion = -1;
    }
    const key = f.key + ':' + f.seed;
    if (key !== bufKey) {
      buf = document.createElement('canvas');
      buf.width = f.w;
      buf.height = f.h;
      bufKey = key;
      lastVersion = -1;
    }
    if (f.fovVersion !== lastVersion) {
      paintBuf(f);
      lastVersion = f.fovVersion;
    }
    const g = cv.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    const k = Math.min(cv.width / (f.w + f.h) , (cv.height * 2) / (f.w + f.h)) * (big ? 1 : 2.2);
    const p = world.player;
    const cx = big ? (f.w - f.h) * k / 2 : (p.x - p.y) * k;
    const cy = big ? (f.w + f.h) * k / 4 : (p.x + p.y) * k / 2;
    const ox = cv.width / 2 - cx, oy = cv.height / 2 - cy;
    g.imageSmoothingEnabled = false;
    g.globalAlpha = big ? 0.85 : 0.9;
    g.setTransform(k, k / 2, -k, k / 2, ox, oy);
    g.drawImage(buf, 0, 0);
    g.globalAlpha = 1;
    drawMarkers(g, f, p, ox, oy, k);
  }

  /** markers over the map: waypoint, portal, gate, Keeper ping, enemies, the player */
  function drawMarkers(g, f, p, ox, oy, k) {
    /** a marker: filled dot, or a ring when `ring` is set (shape as well as colour) */
    const dot = (x, y, col, r, ring) => {
      g.setTransform(1, 0, 0, 1, 0, 0);
      const sx = ox + (x + 0.5 - (y + 0.5)) * k, sy = oy + (x + 0.5 + (y + 0.5)) * k / 2;
      g.beginPath();
      g.arc(sx, sy, r, 0, Math.PI * 2);
      g.fillStyle = ring ? M.outline : col;
      g.fill();
      if (!ring) return;
      g.strokeStyle = col;
      g.lineWidth = 1.5;
      g.stroke();
    };
    const seen = (pos) => pos && f.explored[Grid.idx(f, pos.x, pos.y)];
    // waypoint and portal both teleport (souls purple): the waypoint is a ring, the portal a dot
    if (seen(f.waypointPos)) dot(f.waypointPos.x, f.waypointPos.y, M.souls, 3.5, true);
    if (f.portalPos) dot(f.portalPos.x, f.portalPos.y, M.souls, 3);
    if (seen(f.gatePos)) dot(f.gatePos.x + 0.5, f.gatePos.y + 0.5, M.boss, 4.5, true);
    if (f.keeperPing) dot(f.keeperPing.x, f.keeperPing.y, M.unique, 4 + Math.sin(performance.now() / 160), true);
    for (const e of f.entities.values()) {
      if (e.dead || !f.visible[Grid.idx(f, e.x, e.y)] || e.faction === 'player') continue;
      const elite = RANK_COL[e.rank];
      dot(e.x, e.y, elite || M.hostile, elite ? 2.4 : 1.6);
    }
    dot(p.x, p.y, M.friendly, 2.5);
  }

  const STAIRS = Palette.rgb(M.friendly), SEALED = Palette.rgb(M.boss);
  const WATER = Palette.rgb(Palette.shade(Palette.SCHOOL.cold.edge, 0.6)), LAVA = Palette.rgb(Palette.SCHOOL.lava.mid);

  function paintBuf(f) {
    const g = buf.getContext('2d');
    const img = g.createImageData(f.w, f.h);
    const pal = BD.data.lookOf(f).pal;
    const wall = Palette.rgb(Palette.shade(pal.wallTop, 1.5)), floor = Palette.rgb(Palette.shade(pal.floorA, 1.3));
    for (let i = 0; i < f.w * f.h; i++) {
      if (!f.explored[i]) continue;
      const t = f.tiles[i];
      let c = null;
      if (t === T.STAIRS_DOWN || t === T.STAIRS_UP) c = STAIRS;
      else if (t === T.STAIRS_SEALED) c = SEALED;
      else if (t === T.WATER) c = WATER;
      else if (t === T.LAVA) c = LAVA;
      else if (WALK[t] || t === T.DECOR) c = floor;
      else if (t === T.WALL || t === T.PILLAR || t === T.TOWN_DOOR) c = wall;
      if (!c) continue;
      img.data[i * 4] = c[0];
      img.data[i * 4 + 1] = c[1];
      img.data[i * 4 + 2] = c[2];
      img.data[i * 4 + 3] = t === T.WALL ? 200 : 150;
    }
    g.putImageData(img, 0, 0);
  }

  /** kept for scripts and autotests: the quest line now lives in the tracker (js/ui/tracker.js) */
  function setQuest(text) {
    if (BD.ui.tracker) BD.ui.tracker.setQuest(text);
  }

  BD.ui.minimap = { frame, toggle, setQuest, get big() { return big; } };
})(globalThis.BD);
