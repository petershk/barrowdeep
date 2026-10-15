// Skill Forms (Magician): each Form does what its text says, Forms open at the form rank and are free
// to switch, respec and save reconcile clear them, and the Magician's keystones are an either-or Attunement.
'use strict';
const { loadBD } = require('./harness');

module.exports = (T) => {
  const BD = loadBD();
  const STEP = BD.core.scheduler.STEP_MS;
  const Status = BD.sim.status;

  /** a hero at level 20 standing in the middle of an open 9×9 patch, with no monsters around */
  function setup(skill, form, rank) {
    const cls = (BD.data.skills[skill] && BD.data.skills[skill].cls) || 'magician';
    const w = BD.sim.world.createWorld({ seed: 'forms', cls, name: 't' });
    BD.sim.run.travel(w, 1, 'spawn');
    const p = w.player, f = w.floor;
    for (const e of [...f.entities.values()]) {
      if (e === p) continue;
      BD.sim.entities.vacate(f, e);
      f.entities.delete(e.id);
    }
    const spot = openSpot(f, 3) || openSpot(f, 2);
    BD.sim.entities.relocate(f, p, spot.x, spot.y);
    BD.sim.fov.refresh(w);
    p.level = 20;
    p.skills[skill] = rank || 2;
    if (form) T.ok(BD.sim.commands.apply(w, { type: 'SetForm', id: skill, form }), 'SetForm ' + form);
    BD.sim.stats.bump(p);
    const rk = BD.sim.resources.kind(p);
    if (p.resources[rk].max != null) p.resources[rk].max = 9999;
    BD.sim.resources.gain(w, p, rk, 9999, true);
    return w;
  }
  function openSpot(f, r) {
    for (let y = r; y < f.h - r; y++) {
      for (let x = r; x < f.w - r; x++) {
        let ok = true;
        for (let dy = -r; dy <= r && ok; dy++) for (let dx = -r; dx <= r && ok; dx++) ok = BD.sim.entities.isFree(f, x + dx, y + dy);
        if (ok) return { x, y };
      }
    }
    return null;
  }
  function dummy(w, dx, dy) {
    const p = w.player;
    const d = BD.sim.monsters.spawn(w, 'rotting_zombie', p.x + dx, p.y + dy, { hpBase: 1e7, alert: false });
    d.ai.state = 'dormant';
    return d;
  }
  function cast(w, id, tgt, at) {
    const p = w.player;
    const pt = at || { x: tgt.x, y: tgt.y };
    return BD.sim.abilities.tryCast(w, p, id, { entityId: tgt ? tgt.id : null, x: pt.x, y: pt.y });
  }
  /** step the sim; returns every event seen */
  function run(w, ms, onStep) {
    const seen = [];
    for (let t = 0; t < ms; t += STEP) {
      BD.sim.world.step(w, STEP);
      seen.push(...w.events);
      w.events.length = 0;
      if (onStep) onStep();
    }
    return seen;
  }
  const hurt = (d) => d.hp < BD.sim.stats.statsOf(d._w || null, d).maxLife;

  T.test('Forms open at the form rank, are free to switch and clear on respec', () => {
    const w = setup('firebolt', null, 1);
    const p = w.player;
    T.ok(!BD.sim.commands.apply(w, { type: 'SetForm', id: 'firebolt', form: 'kindling' }), 'no Form at rank 1');
    p.skills.firebolt = 2;
    T.ok(BD.sim.commands.apply(w, { type: 'SetForm', id: 'firebolt', form: 'kindling' }));
    T.ok(BD.sim.commands.apply(w, { type: 'SetForm', id: 'firebolt', form: 'searing' }), 'switching is free');
    T.ok(!BD.sim.commands.apply(w, { type: 'SetForm', id: 'firebolt', form: 'napalm' }), 'only the skill\'s own Forms');
    T.eq(BD.sim.abilities.resolved(BD.data.skills.firebolt, 2, p).form, 'searing');
    p.gold = 1e6;
    BD.sim.commands.apply(w, { type: 'Respec' });
    T.eq(Object.keys(p.forms).length, 0, 'respec clears Forms');
  });

  T.test('the Magician\'s keystones are an either-or Attunement', () => {
    const w = setup('meteor', null, 1);
    const p = w.player;
    Object.assign(p.skills, { blizzard: 1, chain_lightning: 1 });
    p.unspent.skill = 5;
    T.ok(BD.sim.commands.apply(w, { type: 'SpendSkill', id: 'pyre' }), 'first keystone');
    T.ok(!BD.sim.progression.canLearn(w, p, 'shatter').ok, 'a second keystone is refused');
    T.ok(/Attuned to Pyre/.test(BD.sim.progression.canLearn(w, p, 'energy_shield').why));
  });

  T.test('describe() lists the Forms and marks the chosen one', () => {
    const w = setup('meteor', 'comet');
    const d = BD.sim.describe.describe(w, w.player, 'meteor');
    T.eq(d.forms.length, 2);
    T.ok(d.forms.find((f) => f.id === 'comet').on);
  });

  T.test('Kindling always ignites; Searing cashes in the burn', () => {
    let w = setup('firebolt', 'kindling');
    let d = dummy(w, 3, 0);
    cast(w, 'firebolt', d);
    run(w, 1500);
    T.ok(Status.has(d, 'burning'), 'Kindling sets Burning');
    w = setup('firebolt', 'searing');
    d = dummy(w, 3, 0);
    Status.apply(w, d, 'burning', { durMs: 3000, hit: 500, sourceId: w.player.id });
    const ev = (() => { cast(w, 'firebolt', d); return run(w, 1500); })();
    T.ok(ev.some((e) => e.type === 'reaction' && e.name === 'Searing'), 'Searing fires');
    T.ok(!Status.has(d, 'burning'), 'the burn is consumed');
  });

  T.test('Napalm leaves 4 s of burning ground; Implosion drags enemies in', () => {
    let w = setup('fireball', 'napalm');
    let d = dummy(w, 3, 0);
    cast(w, 'fireball', d);
    run(w, 1000);
    const g = w.floor.zones.find((z) => z.kind === 'burning_ground');
    T.ok(g && g.durMs > 2500, 'burning ground lingers');
    w = setup('fireball', 'implosion');
    d = dummy(w, 3, 0);
    const side = dummy(w, 3, 3);
    cast(w, 'fireball', d);
    run(w, 1200);
    T.ok(Math.abs(side.y - d.y) < 3, 'the side enemy was pulled toward the blast (' + side.y + ' vs ' + d.y + ')');
    T.ok(Status.has(d, 'chilled'), 'Implosion Chills');
  });

  T.test('Comet freezes with cold; Meteor Shower drops five meteors', () => {
    let w = setup('meteor', 'comet');
    let d = dummy(w, 3, 0);
    cast(w, 'meteor', d);
    const ev = run(w, 1500);
    T.ok(ev.some((e) => e.type === 'damage' && e.tgtId === d.id && e.parts && e.parts.cold > 0) || Status.has(d, 'frozen'), 'cold hit');
    T.ok(Status.has(d, 'frozen'), 'Comet Freezes');
    w = setup('meteor', 'meteor_shower');
    d = dummy(w, 3, 0);
    cast(w, 'meteor', d);
    run(w, 600);
    T.eq(w.floor.zones.filter((z) => z.kind === 'meteor').length, 5, 'five meteors');
  });

  T.test('Glacial Lance freezes the Chilled; Hailstorm fires seven shards', () => {
    let w = setup('ice_shard', 'glacial_lance');
    let d = dummy(w, 3, 0);
    Status.apply(w, d, 'chilled', { durMs: 3000, sourceId: w.player.id });
    cast(w, 'ice_shard', d);
    run(w, 1200);
    T.ok(Status.has(d, 'frozen'), 'a Chilled enemy is Frozen by the lance');
    w = setup('ice_shard', 'hailstorm');
    d = dummy(w, 2, 0);
    cast(w, 'ice_shard', d);
    let most = 0;
    run(w, 700, () => { most = Math.max(most, w.floor.projectiles.filter((x) => x.kind === 'ice_shard').length); });
    T.ok(most >= 7, 'seven shards (' + most + ')');
  });

  T.test('Deep Freeze freezes long and exposes; Ice Armour shields per enemy hit', () => {
    let w = setup('frost_nova', 'deep_freeze');
    let d = dummy(w, 1, 0);
    cast(w, 'frost_nova', null, w.player);
    run(w, 600);
    T.ok(Status.has(d, 'frozen') && Status.has(d, 'vulnerable'), 'Frozen and Vulnerable');
    T.ok(Status.has(d, 'frozen').remainingMs > 1500, 'longer freeze');
    w = setup('frost_nova', 'ice_armour');
    d = dummy(w, 1, 0);
    dummy(w, -1, 0);
    cast(w, 'frost_nova', null, w.player);
    run(w, 600);
    const sh = Status.has(w.player, 'shielded');
    T.ok(sh && sh.pool > 0, 'a barrier');
    T.ok(!Status.has(d, 'frozen') && Status.has(d, 'chilled'), 'Chills instead of freezing');
  });

  T.test('Frozen Orb rolls and sprays shards; Storm Cloak rides with you', () => {
    let w = setup('blizzard', 'frozen_orb');
    const p = w.player;
    let d = dummy(w, 4, 0);
    cast(w, 'blizzard', d);
    let shards = 0;
    run(w, 900);
    const orb = w.floor.zones.find((z) => z.kind === 'blizzard');
    T.ok(orb, 'an orb zone');
    const x0 = orb.cx;
    run(w, 1200, () => { shards = Math.max(shards, w.floor.projectiles.filter((x) => x.kind === 'shard_burst').length); });
    T.ok(orb.cx !== x0 || orb.cy !== p.y, 'the orb moved');
    T.ok(shards > 0, 'shards sprayed');
    w = setup('blizzard', 'storm_cloak');
    d = dummy(w, 2, 0);
    cast(w, 'blizzard', null, w.player);
    run(w, 900);
    const z = w.floor.zones.find((q) => q.kind === 'blizzard');
    T.eq(z && z.follow, w.player.id, 'the storm follows the caster');
  });

  T.test('Arc Lash strikes in front; Conduit refunds mana', () => {
    let w = setup('spark', 'arc_lash');
    let d = dummy(w, 2, 0);
    const before = d.hp;
    cast(w, 'spark', d);
    run(w, 800);
    T.ok(d.hp < before, 'the lash hits');
    T.eq(w.floor.projectiles.filter((x) => x.kind === 'spark').length, 0, 'no sparks fly');
    w = setup('spark', 'conduit');
    d = dummy(w, 2, 0);
    const p = w.player;
    let gained = 0;
    cast(w, 'spark', d);
    const m0 = p.resources.mana.cur;
    const origGain = BD.sim.resources.gain;
    BD.sim.resources.gain = (world, who, type, n, raw) => { if (type === 'mana') gained += n; return origGain(world, who, type, n, raw); };
    try { run(w, 2500); } finally { BD.sim.resources.gain = origGain; }
    T.ok(gained > 0, 'mana from sparks (' + gained + ', ' + m0 + ')');
  });

  T.test('Flicker has 4 charges and hastes; Thunderstep shocks on arrival', () => {
    let w = setup('teleport', 'flicker');
    const p = w.player;
    run(w, 6000);
    T.eq(BD.sim.abilities.maxCharges(w, p, BD.sim.abilities.resolved(BD.data.skills.teleport, 2, p)), 4);
    T.ok(cast(w, 'teleport', null, { x: p.x + 2, y: p.y }) === 'cast');
    run(w, 400);
    T.ok(Status.has(p, 'hasted'), 'Hasted after a Flicker');
    w = setup('teleport', 'thunderstep');
    const q = w.player;
    const d = dummy(w, 3, 1);
    cast(w, 'teleport', null, { x: q.x + 2, y: q.y });
    run(w, 500);
    T.ok(Status.has(d, 'shocked'), 'Thunderstep Shocks');
  });

  T.test('Prismatic Arc spreads three statuses; Thunderhead haunts its target', () => {
    let w = setup('chain_lightning', 'prismatic_arc');
    const ds = [dummy(w, 2, 0), dummy(w, 3, 1), dummy(w, 4, 0)];
    cast(w, 'chain_lightning', ds[0]);
    run(w, 800);
    const has = (id) => ds.some((d) => Status.has(d, id));
    T.ok(has('burning') && has('chilled') && has('shocked'), 'burn, chill and shock in one cast');
    w = setup('chain_lightning', 'thunderhead');
    const d = dummy(w, 3, 0);
    const before = d.hp;
    cast(w, 'chain_lightning', d);
    run(w, 2500);
    const z = w.floor.zones.find((q) => q.kind === 'chain_lightning');
    T.ok(z && z.follow === d.id, 'the cloud follows the target');
    T.ok(d.hp < before, 'the cloud strikes');
  });

  T.test('Fighter, Assassin and Valkyrie Forms transform their skills', () => {
    // Fighter: Guillotine forces crits below 50% life; Vanguard grants a barrier on Charge
    let w = setup('berserk_strike', 'guillotine');
    let d = dummy(w, 1, 0);
    d.hp = BD.sim.stats.statsOf(w, d).maxLife * 0.4;
    cast(w, 'berserk_strike', d);
    const evs = run(w, 600);
    T.ok(evs.some((e) => e.type === 'damage' && e.crit), 'Guillotine guaranteed crit below 50% life');

    w = setup('charge', 'vanguard');
    d = dummy(w, 3, 0);
    cast(w, 'charge', d);
    run(w, 600);
    T.ok(Status.has(w.player, 'shielded'), 'Vanguard grants a barrier on impact');

    // Assassin: Triad Unleashed triggers fire, lightning and cold; Dragon Flight blinks to distant target
    w = setup('phoenix_strike', 'triad_unleashed');
    BD.sim.resources.addCombo(w, w.player, 2);
    d = dummy(w, 1, 0);
    cast(w, 'phoenix_strike', w.player);
    run(w, 600);
    T.ok(Status.has(d, 'burning') && Status.has(d, 'shocked') && Status.has(d, 'frozen'), 'Triad Unleashed applies all three elements');

    w = setup('dragon_talon', 'dragon_flight');
    d = dummy(w, 3, 0);
    cast(w, 'dragon_talon', d);
    run(w, 600);
    T.ok(Math.hypot(w.player.x - d.x, w.player.y - d.y) <= 1.5, 'Dragon Flight blinks to the target');

    // Valkyrie: Lightning Fury splits into lightning bolts; Valkyrie Dive leaps toward the cursor and stuns
    w = setup('javelin', 'lightning_fury');
    d = dummy(w, 2, 0);
    const d2 = dummy(w, 3, 1);
    cast(w, 'javelin', d);
    run(w, 800);
    T.ok(Status.has(d, 'shocked') && Status.has(d2, 'shocked'), 'Lightning Fury shocks primary and split targets');

    w = setup('vault', 'valkyrie_dive');
    d = dummy(w, 3, 0);
    cast(w, 'vault', null, { x: d.x, y: d.y });
    run(w, 500);
    T.ok(Status.has(d, 'stunned'), 'Valkyrie Dive leaps forward and stuns on landing');
  });

  T.test('every Form across all 4 classes (72 Forms) resolves and changes the skill', () => {
    const withForms = Object.values(BD.data.skills).filter((s) => s.forms);
    T.eq(withForms.length, 36, 'all 36 active skills have Forms');
    for (const ab of withForms) {
      T.eq(ab.forms.length, 2, ab.id + ' has 2 Forms');
      const plain = JSON.stringify(BD.sim.abilities.resolved(ab, 2, setup(ab.id, null).player), (k, v) => (typeof v === 'function' ? 0 : v));
      for (const f of ab.forms) {
        const w = setup(ab.id, f.id);
        const r = BD.sim.abilities.resolved(ab, 2, w.player);
        T.eq(r.form, f.id);
        T.ok(JSON.stringify(r, (k, v) => (typeof v === 'function' ? 0 : v)) !== plain, f.id + ' changes nothing');
      }
    }
  });
  void hurt;
};
