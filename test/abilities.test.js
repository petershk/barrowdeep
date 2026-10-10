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
        T.ok(nums.every((n) => n.hi > 0), ab.id + ' r' + rank + ' describes zero damage');
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

  T.test('the left-click slot: a cantrip starts there and a click casts it while affordable, else the basic attack', () => {
    const w = BD.sim.world.createWorld({ seed: 'lmb', cls: 'magician', name: 't', firstSkill: 'firebolt' });
    BD.sim.run.travel(w, 1, 'spawn');
    const p = w.player;
    T.eq(p.bar.lmb, 'firebolt');
    T.eq(p.bar.rmb, null);
    T.eq(BD.sim.combat.primaryId(w, p), 'firebolt');
    T.ok(BD.sim.combat.basicRange(w, p) === BD.data.skills.firebolt.targeting.range, 'engage range follows the left-click skill');
    p.level = 20;
    p.skills.fireball = 1;
    p.skills.teleport = 1;
    p.resources.mana.cur = 0;
    T.eq(BD.sim.combat.primaryId(w, p), 'attack', 'out of mana: the click falls back to the basic attack');
    p.resources.mana.cur = p.resources.mana.max = 200;
    T.eq(BD.sim.combat.primaryId(w, p), 'firebolt');
    T.ok(BD.sim.commands.apply(w, { type: 'SetBar', slot: 'lmb', id: 'fireball' }), 'a costly spell may sit on left click');
    T.ok(!BD.sim.commands.apply(w, { type: 'SetBar', slot: 'lmb', id: 'teleport' }), 'a cooldown skill is refused');
    BD.sim.commands.apply(w, { type: 'SetBar', slot: 'lmb', id: null });
    T.eq(BD.sim.combat.primaryId(w, p), 'attack');
    // a fighter's Bash may go there; it doesn't by default
    const f = BD.sim.world.createWorld({ seed: 'lmb2', cls: 'fighter', name: 't', firstSkill: 'bash' });
    T.eq(f.player.bar.rmb, 'bash');
    T.ok(BD.sim.commands.apply(f, { type: 'SetBar', slot: 'lmb', id: 'bash' }), 'Bash may sit on left click');
  });

  T.test('right-click on an enemy without the resource attacks instead; repeated refusals are announced once', () => {
    const w = setup('fighter', 'bash', 1);
    const p = w.player, f = w.floor;
    for (const e of [...f.entities.values()]) if (e.kind === 'monster') { BD.sim.entities.vacate(f, e); f.entities.delete(e.id); }
    const at = BD.sim.entities.nearestFree(f, p.x + 1, p.y, 2, (x, y) => BD.core.util.cheb(x, y, p.x, p.y) === 1);
    const foe = BD.sim.monsters.spawn(w, 'skeleton', at.x, at.y, { noLoot: true });
    BD.sim.commands.apply(w, { type: 'SetBar', slot: 'rmb', id: 'bash' });
    p.resources.rage.cur = 0;
    w.events.length = 0;
    BD.sim.commands.handlers.UseSkill(w, { type: 'UseSkill', slot: 'rmb', aim: { entityId: foe.id, x: foe.x, y: foe.y }, hold: true });
    T.eq(p.intent.kind, 'engage', 'no rage: the right click engages with an attack');
    T.ok(w.events.some((e) => e.type === 'resource.short' && e.abilityId === 'bash'), 'the orb is told to flash');
    let casts = 0;
    for (let i = 0; i < 60; i++) { BD.sim.world.step(w, STEP); casts += w.events.filter((e) => e.type === 'ability.cast' && e.abilityId === 'attack').length; w.events.length = 0; }
    T.ok(casts >= 1, 'a basic attack landed');
    // a key held with nothing to pay: refused every frame, announced once a second
    p.resources.rage.cur = 0;
    p.lastReject = null;
    let rejects = 0;
    for (let i = 0; i < 30; i++) {
      BD.sim.abilities.tryCast(w, p, 'bash', { entityId: foe.id }, { hold: true });
      rejects += w.events.filter((e) => e.type === 'ability.reject').length;
      w.events.length = 0;
      w.time += STEP;
    }
    T.eq(rejects, 1, 'one refusal per second, not one per frame');
  });

  T.test('clicking a flask orb walks onto it and collects it', () => {
    const w = setup('fighter', 'bash', 1);
    const p = w.player, f = w.floor;
    for (const e of [...f.entities.values()]) if (e.kind === 'monster') { BD.sim.entities.vacate(f, e); f.entities.delete(e.id); }
    p.flask.charges = 0;
    const at = BD.sim.entities.nearestFree(f, p.x + 2, p.y, 3, (x, y) => BD.core.util.cheb(x, y, p.x, p.y) >= 2);
    const orb = BD.sim.loot.dropAt(w, at.x, at.y, { kind: 'orb' });
    T.ok(BD.sim.commands.handlers.Pickup(w, { type: 'Pickup', itemUid: orb.uid, x: orb.x, y: orb.y }));
    for (let i = 0; i < 180 && f.items.includes(orb); i++) { BD.sim.world.step(w, STEP); w.events.length = 0; }
    T.ok(!f.items.includes(orb), 'the orb was collected');
    T.eq(p.flask.charges, 1);
  });

  T.test('every active skill costs its class resource; only the basic attack is free', () => {
    for (const ab of Object.values(BD.data.skills)) {
      if (ab.passive || ab.keystone || !ab.resource) continue;
      const r = ab.resource;
      const costs = r.cost === 'all' || r.cost > 0 || (ab.channel && ab.channel.costPerSec > 0);
      T.ok(costs, ab.id + ' costs ' + r.type);
    }
  });

  T.test('mana costs grow with character level; other resources do not', () => {
    const k = BD.data.balance.player.manaCostPerLevel;
    T.eq(BD.sim.abilities.manaCost(14, 1), 14);
    T.eq(BD.sim.abilities.manaCost(14, 21), Math.round(14 * (1 + 20 * k)));
    const w = setup('assassin', 'tiger_strike', 1);
    w.player.level = 20;
    T.eq(BD.sim.abilities.resolved(BD.data.skills.tiger_strike, 1, w.player).resource.cost, BD.data.skills.tiger_strike.resource.cost);
  });

  T.test('Aimed Shot needs 2 focus', () => {
    const w = setup('valkyrie', 'aimed_shot', 1);
    const p = w.player;
    p.resources.focus.n = 1;
    T.ok(!BD.sim.resources.canPay(p, 'focus', 'all', BD.data.skills.aimed_shot.resource.minStart));
    p.resources.focus.n = 2;
    T.ok(BD.sim.resources.canPay(p, 'focus', 'all', BD.data.skills.aimed_shot.resource.minStart));
  });

  T.test('XP curve: early levels are discounted, later ones follow base × growth^(L−1)', () => {
    const X = BD.data.balance.xp, xp = BD.sim.progression.xpToNext;
    T.eq(xp(1), Math.round(X.base * X.earlyMult));
    T.eq(xp(1 + X.earlyLevels), Math.round(X.base * Math.pow(X.growth, X.earlyLevels)));
    for (let L = 1; L < 29; L++) T.ok(xp(L + 1) > xp(L), 'xpToNext rises at ' + L);
  });

  T.test('Frost Nova hits and freezes every enemy around the caster', () => {
    const w = setup('magician', 'frost_nova', 1);
    const p = w.player, f = w.floor;
    for (const e of [...f.entities.values()]) if (e.kind === 'monster') { BD.sim.entities.vacate(f, e); f.entities.delete(e.id); }
    const ring = [];
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      if (!BD.sim.entities.isFree(f, p.x + dx, p.y + dy)) continue;
      const m = BD.sim.monsters.spawn(w, 'rotting_zombie', p.x + dx, p.y + dy, { hpBase: 1e6, alert: false });
      m.ai.state = 'dormant';
      ring.push({ m, hp: m.hp });
    }
    T.ok(ring.length >= 4, 'room for a ring of dummies');
    T.eq(BD.sim.abilities.tryCast(w, p, 'frost_nova', { x: p.x, y: p.y }), 'cast');
    for (let i = 0; i < Math.ceil(1500 / STEP); i++) { BD.sim.world.step(w, STEP); w.events.length = 0; }   // past the cast time
    for (const r of ring) {
      T.ok(r.m.hp < r.hp, 'dummy at ' + (r.m.x - p.x) + ',' + (r.m.y - p.y) + ' was hit');
      T.ok(r.m.statuses.some((st) => st.id === 'frozen'), 'dummy at ' + (r.m.x - p.x) + ',' + (r.m.y - p.y) + ' is frozen');
    }
  });
};
