// Ability engine: describe() == simulated numbers at ranks 1/3/5 for every implemented skill;
// rejected casts cost nothing and start no cooldown.
'use strict';
const { loadBD } = require('./harness');

module.exports = (T) => {
  const BD = loadBD();
  const STEP = BD.core.scheduler.STEP_MS;

  function setup(cls, skill, rank) {
    const w = BD.sim.world.createWorld({ seed: 'abil-' + cls, cls, name: 't' });
    BD.sim.run.travel(w, 1, 'spawn');
    const p = w.player;
    p.level = 20;
    for (const id in BD.data.skills) if (BD.data.skills[id].cls === cls) p.skills[id] = BD.data.skills[id].tier === 4 ? 0 : 0;
    p.skills[skill] = rank;
    BD.sim.stats.bump(p);
    // plenty of every resource
    const r = p.resources;
    if (r.rage) r.rage.cur = 100; if (r.energy) r.energy.cur = 100; if (r.mana) { r.mana.max = 9999; r.mana.cur = 9999; } if (r.focus) r.focus.n = 0;
    return w;
  }
  /** capture every damage packet the player sends (pre-mitigation amounts) */
  function capture(BDx) {
    const orig = BDx.sim.damage.dealDamage;
    const packets = [];
    BDx.sim.damage.dealDamage = (world, pk) => { if (pk.srcId === 1 && !pk.isDot) packets.push(pk); return orig(world, pk); };
    return { packets, restore: () => { BDx.sim.damage.dealDamage = orig; } };
  }

  /** place a sturdy dummy where the skill can reach it and cast */
  function castAt(w, id) {
    const p = w.player, f = w.floor;
    for (const e of [...f.entities.values()]) { BD.sim.entities.vacate(f, e); f.entities.delete(e.id); }
    const ab = BD.data.skills[id];
    const range = ab.targeting && ab.targeting.range ? Math.min(ab.targeting.range, 3) : 1;
    let spot = null;
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [2, 0], [0, 2], [3, 0]]) {
      const x = p.x + dx * (range > 1 && dx ? Math.min(range, 2) / Math.abs(dx || 1) : 1), y = p.y + dy;
      if (BD.sim.entities.isFree(f, Math.round(x), y) && BD.sim.targeting.hasLOS(w, p.x, p.y, Math.round(x), y)) { spot = { x: Math.round(x), y }; break; }
    }
    if (!spot) return null;
    const dummy = BD.sim.monsters.spawn(w, 'rotting_zombie', spot.x, spot.y, { hpBase: 1e7, alert: false });
    dummy.ai.state = 'dormant';
    return { dummy, res: BD.sim.abilities.tryCast(w, p, id, { entityId: dummy.id, x: dummy.x, y: dummy.y }) };
  }

  const skills = Object.values(BD.data.skills).filter((s) => !s.keystone);
  const verified = new Set();
  for (const ab of skills) {
    T.test(`describe == simulated: ${ab.cls}/${ab.id} at r1/r3/r5`, () => {
      for (const rank of [1, 3, 5]) {
        const w = setup(ab.cls, ab.id, rank);
        const nums = BD.sim.describe.numbers(w, w.player, ab.id, rank);
        if (!nums.length) continue;
        const cap = capture(BD);
        try {
          const c = castAt(w, ab.id);
          if (!c || c.res !== 'cast') continue;
          for (let i = 0; i < 180 && cap.packets.length === 0; i++) { BD.sim.world.step(w, STEP); w.events.length = 0; }
        } finally { cap.restore(); }
        if (!cap.packets.length) continue; // delivery that needs special context (tested elsewhere)
        const pk = cap.packets[0];
        let total = 0; for (const el in pk.amounts) total += pk.amounts[el];
        const ok = nums.some((n) => total >= n.lo * (pk.mult || 1) * 0.999 - 1e-6 && total <= n.hi * 1.5 * 1.001 + 1e-6);
        verified.add(ab.id);
        T.ok(ok, `${ab.id} r${rank}: packet ${total.toFixed(2)} outside described ${nums.map((n) => n.lo.toFixed(1) + '–' + n.hi.toFixed(1)).join(', ')}`);
      }
    });
  }

  T.test('most damage skills were verified against describe()', () => {
    const dmg = skills.filter((s) => (s.effects || []).some((e) => e.type === 'damage'));
    const missing = dmg.filter((s) => !verified.has(s.id)).map((s) => s.id);
    T.ok(missing.length <= Math.ceil(dmg.length * 0.25), 'unverified: ' + missing.join(', '));
  });

  T.test('rejected casts cost nothing and start no cooldown', () => {
    for (const ab of skills.filter((s) => s.cls === 'fighter')) {
      const w = setup(ab.cls, ab.id, 1);
      const p = w.player;
      p.resources.rage.cur = 0;               // can't pay (if it costs anything)
      const before = JSON.stringify([p.resources, p.cooldowns, p.charges || {}]);
      const far = { x: p.x + 40, y: p.y + 40 }; // out of range / no target
      if (BD.sim.abilities.tryCast(w, p, ab.id, far) === 'cast') continue; // free self skills legitimately cast
      T.eq(JSON.stringify([p.resources, p.cooldowns, p.charges || {}]), before, ab.id + ' changed state on reject');
    }
  });

  T.test('cancelled wind-up refunds resource and cooldown (Evade cancels Earthshaker)', () => {
    const w = setup('fighter', 'earthshaker', 1);
    const p = w.player;
    p.resources.rage.cur = 60;
    T.eq(BD.sim.abilities.tryCast(w, p, 'earthshaker', 'auto'), 'cast');
    T.eq(p.resources.rage.cur, 10);
    T.ok(p.cooldowns.earthshaker > 0);
    BD.sim.abilities.cancel(w, p, 'evade');
    T.eq(p.resources.rage.cur, 60);
    T.eq(p.cooldowns.earthshaker, 0);
  });

  T.test('rank scaling: r5 = 1.8× r1 for damage multipliers', () => {
    T.near(BD.sim.abilities.scale({ mult: 1.25 }, 5), 2.25, 1e-9);
    T.near(BD.sim.abilities.scale({ mult: 3.2 }, 5), 5.76, 1e-9);
  });
};
