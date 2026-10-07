// @ts-check
// Minimap: a corner map by default, Tab toggles a large overlay. Drawn in iso orientation from
// the floor's explored mask; markers for stairs, waypoint, portal, gate, Keeper ping, events.
(function (BD) {
  'use strict';

  const Grid = BD.core.grid;
  const { T, WALK } = BD.data.tiles;
  let el = null, cv = null, big = false, buf = null, bufKey = '', lastVersion = -1;

  function mount() {
    const { h, root } = BD.ui.dom;
    cv = /** @type {HTMLCanvasElement} */ (h('canvas'));
    el = h('div.minimap', [cv, h('div.quest')]);
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
    // markers
    const dot = (x, y, col, r) => {
      g.setTransform(1, 0, 0, 1, 0, 0);
      const sx = ox + (x + 0.5 - (y + 0.5)) * k, sy = oy + (x + 0.5 + (y + 0.5)) * k / 2;
      g.fillStyle = col;
      g.beginPath();
      g.arc(sx, sy, r, 0, Math.PI * 2);
      g.fill();
    };
    if (f.waypointPos && f.explored[Grid.idx(f, f.waypointPos.x, f.waypointPos.y)]) dot(f.waypointPos.x, f.waypointPos.y, '#6aa8ff', 3);
    if (f.portalPos) dot(f.portalPos.x, f.portalPos.y, '#b06aff', 3);
    if (f.gatePos && f.explored[Grid.idx(f, f.gatePos.x, f.gatePos.y)]) dot(f.gatePos.x + 0.5, f.gatePos.y + 0.5, '#d02020', 4);
    if (f.keeperPing) dot(f.keeperPing.x, f.keeperPing.y, '#ffd23a', 4 + Math.sin(performance.now() / 160));
    for (const e of f.entities.values()) {
      if (e.dead || !f.visible[Grid.idx(f, e.x, e.y)] || e.faction === 'player') continue;
      const normal = e.rank === 'normal';
      const color = normal ? '#c03030' : '#ffd23a';
      const radius = normal ? 1.6 : 2.4;
      dot(e.x, e.y, color, radius);
    }
    dot(p.x, p.y, '#ffffff', 2.5);
  }

  function paintBuf(f) {
    const g = buf.getContext('2d');
    const img = g.createImageData(f.w, f.h);
    const pal = BD.data.biomes[f.biome].pal;
    const Palette = BD.view.palette;
    const wall = Palette.rgb(Palette.shade(pal.wallTop, 1.5)), floor = Palette.rgb(Palette.shade(pal.floorA, 1.3));
    for (let i = 0; i < f.w * f.h; i++) {
      if (!f.explored[i]) continue;
      const t = f.tiles[i];
      let c = null;
      if (t === T.STAIRS_DOWN || t === T.STAIRS_UP) c = [230, 210, 120];
      else if (t === T.STAIRS_SEALED) c = [200, 40, 40];
      else if (t === T.WATER) c = [40, 80, 110];
      else if (t === T.LAVA) c = [220, 90, 20];
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

  function setQuest(text) {
    if (!el) mount();
    BD.ui.dom.setText(el.querySelector('.quest'), text);
  }

  BD.ui.minimap = { frame, toggle, setQuest, get big() { return big; } };
})(globalThis.BD);
