// Balance measurements (05 §4) shared by tools/balance_report.js and test/balance.test.js.
// "On-curve" character: level = AL + 1, attributes and skills spent by the bot's fixed plan, each slot
// filled with the median-value item of N simulated usable drops at that ilvl, Penitent difficulty.
'use strict';
const { loadBD } = require('../test/harness');

const BANDS = {
  trashTTK: [1.5, 3.0], championTTK: [5, 9], keeperTTK: [15, 25],
  bossFight: [60, 100], malgothFight: [150, 240],
  packKill: [10, 15], bossHeavy: [0.25, 0.40], bossJab: [0.04, 0.08],
  classSpread: 0.20,
};

/** BAL_PATCH='{"monsters.hpGrowth":1.1}' overrides balance constants for what-if sweeps */
function makeBD() {
  const BD = loadBD({ extra: ['js/debug/bot.js'] });
  const patch = process.env.BAL_PATCH ? JSON.parse(process.env.BAL_PATCH) : {};
  for (const k in patch) { const path = k.split('.'); let o = BD.data.balance; while (path.length > 1) o = o[path.shift()]; o[path[0]] = patch[k]; }
  return BD;
}
const med = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

// bot-curve snapshots (tools/curve_snapshot.js): the hero the bot actually is at each floor's entry
let CURVE = null;
try { if (process.env.BAL_CURVE !== 'synthetic') CURVE = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'curve.json'), 'utf8')); } catch (e) { CURVE = null; }

/** on-curve hero on floor n (cleared of monsters unless keep): the bot-curve snapshot, else synthetic */
function onCurve(BD, cls, n, seed, o) {
  o = o || {};
  const fl = BD.data.floors.byN(n);
  const al = fl.al;
  const w = BD.sim.world.createWorld({ seed: seed || 'bal', cls, name: 'B', difficulty: 'penitent', firstSkill: BD.debug.bot.SKILL_PLAN[cls][0] });
  w.run.charId = 'bal'; w.stash = [[], [], []];
  BD.sim.run.travel(w, n, 'spawn');
  const p = w.player;
  // several snapshot runs per class: the measurement seed picks one, so gear luck averages out
  const runs = CURVE && CURVE[cls] ? (Array.isArray(CURVE[cls]) ? CURVE[cls] : [CURVE[cls]]) : null;
  let h = 0; for (const ch of String(seed || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const run = runs && runs.length ? runs[(o.run != null ? o.run : h) % runs.length] : null;
  const snap = run && (run[n] || run[n - 1]);
  if (snap) {
    p.level = snap.level; p.attrs = Object.assign({}, snap.attrs); p.skills = Object.assign({}, snap.skills); p.bar = Object.assign({}, snap.bar);
    p.unspent.attr = 0; p.unspent.skill = 0;
    for (const k in p.equip) p.equip[k] = snap.equip[k] ? JSON.parse(JSON.stringify(snap.equip[k])) : null;
    if (snap.flaskMax) { p.flask.max = snap.flaskMax; p.flask.charges = snap.flaskMax; }
    BD.sim.stats.bump(p);
    const s0 = BD.sim.stats.statsOf(w, p);
    p.hp = s0.maxLife;
    if (p.resources.mana) p.resources.mana.cur = s0.maxMana;
    if (!o.keep) clearFloor(BD, w);
    return { w, p, bot: BD.debug.bot.make(w, {}), al };
  }
  const B = BD.data.balance.player;
  const L = Math.min(B.levelCap, al + 1);
  p.unspent.attr += (L - p.level) * B.attrPerLevel;
  p.unspent.skill += (L - p.level) * B.skillPerLevel;
  p.level = L;
  const bot = BD.debug.bot.make(w, {});
  BD.debug.bot.spendPoints(bot);
  gear(BD, w, p, al, o.samples || 31, seed);
  BD.sim.stats.bump(p);
  const s = BD.sim.stats.statsOf(w, p);
  p.hp = s.maxLife;
  if (p.resources.mana) p.resources.mana.cur = s.maxMana;
  if (!o.keep) clearFloor(BD, w);
  return { w, p, bot, al };
}

// the weapon families each class's skill plan is built around
const WEAPON_PREF = { fighter: ['blade', 'axe', 'mace'], assassin: ['dagger', 'claw'], magician: ['staff', 'wand'], valkyrie: ['bow', 'crossbow'] };

function gear(BD, w, p, ilvl, samples, seed) {
  const rng = BD.core.rng.makeRng('gear:' + p.cls + ':' + ilvl + ':' + (seed || ''));
  const value = (it) => BD.sim.items.derive(it).value;
  // weapons rank by a DPS proxy (base damage, speed, damage% and flat adds), not price
  const wdps = (it) => { const d = BD.sim.items.derive(it), m = d.mods; const avg = (d.dmg[0] + d.dmg[1]) / 2 * (1 + (m.dmg_pct || 0) / 100) + (m.fire_add || 0) + (m.cold_add || 0) + (m.light_add || 0) + (m.pois_add || 0); return avg / d.speedMs * (1 + (m.ias || 0) / 100) * (1 + ((m.crit || 0) / 100) * 0.75); };
  for (const slot of ['weapon', 'chest', 'helm', 'cloak', 'amulet', 'ring', 'ring', 'offhand']) {
    if (slot === 'offhand') { const wb = p.equip.weapon && BD.data.bases[p.equip.weapon.base]; if (wb && wb.hands === 2) continue; }
    const pool = [];
    for (let i = 0; i < samples * 12 && pool.length < samples; i++) {
      const it = BD.sim.loot.rollItem(w, rng, { ilvl, slot, cls: p.cls, usable: true });
      if (slot === 'weapon' && !WEAPON_PREF[p.cls].includes(BD.data.bases[it.base].category)) continue;
      if (BD.sim.inventory.canEquip(w, p, it).ok) pool.push(it);
    }
    if (!pool.length) continue;
    const score = slot === 'weapon' ? wdps : value;
    pool.sort((a, b) => score(a) - score(b));
    const it = pool[Math.min(pool.length - 1, Math.floor(pool.length * (+(process.env.BAL_PCT || 0.5))))];
    p.pack.push(it);
    BD.sim.commands.apply(w, { type: 'Equip', uid: it.uid, slot: slot === 'ring' ? (p.equip.ring1 ? 'ring2' : 'ring1') : undefined });
  }
}

function clearFloor(BD, w) {
  const f = w.floor;
  for (const e of [...f.entities.values()]) if (e.kind === 'monster') { BD.sim.entities.vacate(f, e); f.entities.delete(e.id); }
  f.zones.length = 0; f.projectiles.length = 0;
}

function actRoster(BD, act, role) {
  return Object.values(BD.data.monsters).filter((m) => m.act === Math.min(4, act) && !m.spawner && !m.spawnOnly && m.role !== 'bomber' && m.role !== 'spawner' && (!role || role(m)));
}
function spotNear(BD, w, d) {
  const p = w.player, f = w.floor;
  for (const [dx, dy] of [[d, 0], [0, d], [-d, 0], [0, -d], [d, d], [-d, -d], [d, -d], [-d, d]]) {
    const s = BD.sim.entities.nearestFree(f, p.x + dx, p.y + dy, 3, f.reach ? (x, y) => f.reach[y * f.w + x] >= 0 : null);
    if (s && BD.sim.targeting.hasLOS(w, p.x, p.y, s.x, s.y)) return s;
  }
  return BD.sim.entities.nearestFree(f, p.x + d, p.y, 6);
}

/** time for the bot to kill one target of the given rank, from its first swing/cast; the hero is kept alive (offense only) */
function ttkOne(BD, cls, n, seed, def, rank, run) {
  const { w, p, bot } = onCurve(BD, cls, n, seed, { run });
  const STEP = BD.core.scheduler.STEP_MS;
  const at = spotNear(BD, w, 4);
  const mods = rank === 'champion' ? w.rng.shuffle(Object.keys(BD.data.championMods).filter((k) => !BD.data.championMods[k].lore)).slice(0, 1) : [];
  const e = BD.sim.monsters.spawn(w, def, at.x, at.y, { rank, mods, noLoot: true, keeper: rank === 'keeper', name: rank === 'keeper' ? 'Keeper' : null });
  if (!e) return null;
  BD.sim.ai.alert && BD.sim.ai.alert(w, e, p, false);
  let first = null;
  const maxLife = BD.sim.stats.statsOf(w, p).maxLife;
  for (let i = 0; i < (120000 / STEP) && !e.dead; i++) {
    if (i % 8 === 0) BD.debug.bot.decide(bot);
    BD.sim.world.step(w, STEP);
    // the clock starts with the hero's first swing / cast once engaged (walking up doesn't count)
    for (const ev of w.events) if (first == null && ev.type === 'ability.cast' && ev.id === p.id) first = w.time - STEP;
    w.events.length = 0;
    p.hp = maxLife;   // isolate offense
    if (p.dead) return null;
  }
  return e.dead && first != null ? (w.time - first) / 1000 : null;
}

/** an idle hero (no actions, no flask) surrounded by four melee trash: seconds until death */
function packKill(BD, cls, n, seed, run) {
  const { w, p } = onCurve(BD, cls, n, seed, { run });
  const STEP = BD.core.scheduler.STEP_MS;
  const roster = actRoster(BD, BD.data.floors.byN(n).act, (m) => m.behaviours.some((b) => b.id === 'melee') && !m.behaviours.some((b) => /ranged|shoot|caster|coward/.test(b.id)));
  for (let i = 0; i < 4; i++) {
    const def = roster[i % roster.length].id;
    const e = BD.sim.monsters.spawn(w, def, p.x + [1, -1, 0, 0][i], p.y + [0, 0, 1, -1][i], { noLoot: true });
    if (e) BD.sim.ai.alert && BD.sim.ai.alert(w, e, p, false);
  }
  p.flask.charges = 0;
  for (let i = 0; i < 120000 / STEP && !p.dead; i++) { BD.sim.world.step(w, STEP); w.events.length = 0; }
  return p.dead ? w.time / 1000 : null;
}

/** bot vs the act boss of floor n (gate opened directly) */
function bossFight(BD, cls, n, seed, run) {
  const { w, p, bot } = onCurve(BD, cls, n, seed, { keep: true, run });
  const STEP = BD.core.scheduler.STEP_MS;
  if (n === 13) BD.sim.run.travel(w, 13, 'spawn');
  else { w.run.flags['key' + n] = true; BD.sim.bossfight.useGate(w); }
  const res = { len: null, dead: false, heavy: [], jab: [], flasks: 0, taken: {} };
  let woke = null;
  const maxLife = () => BD.sim.stats.statsOf(w, p).maxLife;
  for (let i = 0; i < 600000 / STEP; i++) {
    if (i % 8 === 0) BD.debug.bot.decide(bot);
    BD.sim.world.step(w, STEP);
    for (const ev of w.events) {
      if (ev.type === 'boss.wake' && woke == null) woke = w.time;
      if (ev.type === 'flask.drink') res.flasks++;
      if (ev.type === 'damage' && ev.tgtId === p.id) {
        const src = BD.sim.entities.get(w, ev.srcId);
        const key = (src ? (src.rank === 'boss' || src.rank === 'malgoth' ? 'boss' : 'adds') : 'other') + (ev.isDot ? ':dot' : (ev.tags || []).includes('heavy') ? ':heavy' : (ev.tags || []).includes('zone') ? ':zone' : ':hit');
        res.taken[key] = (res.taken[key] || 0) + ev.total / maxLife();
      }
      if (ev.type === 'damage' && ev.tgtId === p.id && !ev.isDot) {
        const src = BD.sim.entities.get(w, ev.srcId);
        const tg = ev.tags || [];
        // heavy = the telegraphed big moves (tagged heavy); jab = plain melee; other zone damage is neither
        if (src && (src.rank === 'boss' || src.rank === 'malgoth')) { if (tg.includes('heavy')) res.heavy.push(ev.total / maxLife()); else if (!tg.includes('zone')) res.jab.push(ev.total / maxLife()); }
      }
      if ((ev.type === 'boss.defeat' && n !== 13) || ev.type === 'run.victory') res.len = (w.time - (woke || 0)) / 1000;
    }
    w.events.length = 0;
    if (res.len != null) break;
    if (p.dead) { res.dead = true; res.diedAt = woke != null ? (w.time - woke) / 1000 : null; break; }
  }
  res.heavyMed = med(res.heavy); res.jabMed = med(res.jab);
  return res;
}

/** how many bot-curve runs a class has (0 = synthetic) */
function curveRuns(cls) { const r = CURVE && CURVE[cls]; return r ? (Array.isArray(r) ? r.length : 1) : 0; }

module.exports = { curveRuns, BANDS, makeBD, onCurve, ttkOne, packKill, bossFight, actRoster, med, mean };
