// Per-skill DPS / efficiency report (08 M7): each damaging skill cast on repeat for 20 s against a
// cluster of sturdy dummies, by an on-curve character. Flags skills dominated by another in the same
// class (≥20% worse in both DPS and damage-per-resource at every rank). node tools/skill_report.js
'use strict';
const { loadBD } = require('../test/harness');
const BD = loadBD();
const STEP = BD.core.scheduler.STEP_MS;

const BUILDER = { fighter: 'bash', assassin: 'tiger_strike', magician: 'firebolt', valkyrie: 'multishot' };
const CLOSE = (ab) => !ab.targeting || ab.targeting.mode === 'self' || (ab.targeting.range || 1) <= 1.5;

function setup(cls, id, rank, targets) {
  const w = BD.sim.world.createWorld({ seed: 'skill-' + cls + id, cls, name: 'S' });
  BD.sim.run.travel(w, 2, 'spawn');
  const p = w.player;
  const lvl = 14;   // same character for every skill so tiers compare fairly
  p.level = lvl;
  const main = BD.data.classes[cls].mainAttr;
  p.attrs[main] += 3 * (lvl - 1); p.attrs.vit += 2 * (lvl - 1);
  const b = BUILDER[cls];
  p.skills = {}; p.skills[b] = 3; p.skills[id] = rank;
  p.bar.rmb = id; p.bar.s1 = b;
  const rng = BD.core.rng.makeRng('gear' + cls);
  p.equip.weapon = BD.sim.loot.rollItem(w, rng, { ilvl: lvl, rarity: 'magic', slot: 'weapon', cls, usable: true });
  BD.sim.stats.bump(p); p.hp = 1e9;
  const f = w.floor;
  for (const e of [...f.entities.values()]) { BD.sim.entities.vacate(f, e); f.entities.delete(e.id); }
  const close = CLOSE(BD.data.skills[id]);
  const dist = close ? 1 : 3;
  const dummies = [];
  const cx = p.x + dist, cy = p.y;
  for (const [dx, dy] of [[0, 0], [0, 1], [1, 0], [0, -1]].slice(0, targets)) {
    const d = BD.sim.monsters.spawn(w, 'rotting_zombie', cx + dx, cy + dy, { hpBase: 1e9, alert: false, al: lvl });
    if (d) { d.ai.state = 'dormant'; d.immobile = true; dummies.push(d); }
  }
  for (let i = 0; i < 30; i++) BD.sim.world.step(w, STEP); // let resources settle
  w.events.length = 0;
  return { w, p, dummies };
}

/** sustained loop: cast the skill when castable, otherwise the class builder. Natural resources. */
function measure(cls, id, rank, targets) {
  const { w, p, dummies } = setup(cls, id, rank, targets);
  if (!dummies.length) return null;
  let dealt = 0, mine = 0;
  const ms = 30000, b = BUILDER[cls];
  const isOwn = (sid) => sid === p.id || ((BD.sim.entities.get(w, sid) || {}).ownerId === p.id);
  for (let t = 0; t < ms; t += STEP) {
    const tgt = dummies[0];
    const aim = { entityId: tgt.id, x: tgt.x, y: tgt.y };
    if (!p.attack) {
      const ab = BD.data.skills[id], res = ab.resource || {};
      const finisherWait = ab.resource && ab.resource.combo === 'finish' && ab.id !== 'phoenix_strike' && BD.sim.resources.combo(p) < 3;
      const can = !finisherWait && BD.sim.abilities.cooldownLeft(p, BD.sim.abilities.resolved(ab, rank, p)) <= 0 && BD.sim.resources.canPay(p, res.type, res.cost, res.minStart) && !(res.cost === 'all' && BD.sim.resources.amount(p, res.type) < 3);
      if (can) BD.sim.abilities.tryCast(w, p, id, aim);
      else if (id !== b) BD.sim.abilities.tryCast(w, p, b, aim);
    }
    if (p.attack && p.attack.phase === 'channel') p.attack.heldMs = 0;
    BD.sim.world.step(w, STEP);
    for (const ev of w.events) if (ev.type === 'damage' && isOwn(ev.srcId) && dummies.some((d) => d.id === ev.tgtId)) { dealt += ev.total; if (ev.abilityId === id || (ev.abilityId == null && id !== b)) mine += ev.total; }
    w.events.length = 0;
    for (const d of dummies) d.hp = 1e9;
  }
  return { dps: dealt / (ms / 1000), own: mine / (ms / 1000) };
}

const out = {};
for (const cls of Object.keys(BD.data.classes)) {
  const skills = Object.values(BD.data.skills).filter((s) => s.cls === cls && !s.keystone && (s.effects || []).concat(s.selfEffects || []).some((e) => e.type === 'damage') || (s.cls === cls && (s.delivery || {}).kind === 'deploy') || (s.cls === cls && (s.delivery || {}).kind === 'summon'));
  out[cls] = {};
  console.log('\n== ' + cls);
  for (const s of skills) {
    const rows = [];
    for (const rank of [1, 3, 5]) {
      const one = measure(cls, s.id, rank, 1), three = measure(cls, s.id, rank, 4);
      rows.push({ rank, dps1: one ? Math.round(one.dps) : 0, dps4: three ? Math.round(three.dps) : 0, own1: one ? Math.round(one.own) : 0 });
    }
    out[cls][s.id] = rows;
    console.log(s.id.padEnd(18), 'T' + s.tier, rows.map((r) => `r${r.rank}: ${r.dps1}/${r.dps4}`).join(' | '));
  }
  // dominance: same class, ≥20% worse in both single-target and 4-target sustained DPS at every rank
  const ids = Object.keys(out[cls]);
  for (const a of ids) for (const b of ids) {
    if (a === b) continue;
    const A = out[cls][a], Bv = out[cls][b];
    const dom = [0, 1, 2].every((i) => A[i].dps1 < Bv[i].dps1 * 0.8 && A[i].dps4 < Bv[i].dps4 * 0.8);
    if (dom) console.log('  DOMINATED: ' + a + ' by ' + b);
  }
}
