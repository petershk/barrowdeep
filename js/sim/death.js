// @ts-check
// Death, the Ferryman's Bargain, souls and victory (01 §8). Death is saved BEFORE the panel
// appears (the app writes the save when it sees run.death), so closing the tab can't undo it.
(function (BD) {
  'use strict';

  const CMD = BD.sim.commands;

  /** souls = round((base + bonus) × difficultyMult × (1 + 0.15 × ascension)) × gear bonus */
  function souls(world, sacrifice) {
    const p = world.player, r = world.run;
    const L = p.level;
    const base = (L - 1) * (L + 3);
    const bonus = 10 * r.keepersSlain + 40 * r.bossesKilled.filter((b) => b !== 'malgoth').length + (r.bossesKilled.includes('malgoth') ? 150 : 0);
    const diff = BD.data.difficulties[r.difficulty];
    const gear = 1 + (BD.sim.stats.statsOf(world, p).souls_pct || 0) / 100;
    const v = Math.round((base + bonus) * diff.souls * (1 + 0.15 * (r.ascension || 0)) * gear);
    return sacrifice ? Math.round(v * 0.5) : v;
  }

  /** Bargain success chance: 80 / 55 / 30% for the 1st / 2nd / 3rd (cap 95% with bonuses) */
  function bargainChance(world) {
    const used = world.run.bargainsUsed;
    if (used >= 3) return 0;
    const base = [80, 55, 30][used];
    const bonus = BD.sim.stats.statsOf(world, world.player).bargain_chance || 0;
    return Math.min(95, base + bonus);
  }

  function onPlayerDeath(world, d) {
    const r = world.run, p = world.player;
    r.dead = true;
    r.deathCause = d.killerId != null ? describeKiller(world, d) : (d.tags && d.tags.indexOf('dot') >= 0 ? 'Bled out' : 'Slain');
    r.deathFloor = world.floor.key;
    p.intent = { kind: 'idle' }; p.attack = null; p.move = null;
    world.events.push({ type: 'run.death', cause: r.deathCause, souls: souls(world), bargain: bargainChance(world), x: p.x, y: p.y });
  }
  function describeKiller(world, d) {
    const k = BD.sim.entities.get(world, d.killerId);
    if (!k) return 'Slain';
    const def = BD.sim.monsters.defOf(k);
    return 'Slain by ' + (k.name || (def ? def.name : 'the dark'));
  }

  /** Bargain: roll; success → revive in town at full life, lose 50% gold, portal back */
  CMD.register('Bargain', (world) => {
    const r = world.run, p = world.player;
    if (!r.dead || r.bargainsUsed >= 3 || r.harvested) return null;
    const chance = bargainChance(world);
    r.bargainsUsed++;
    const ok = world.lootRng.next() * 100 < chance;
    world.events.push({ type: 'bargain', ok, chance });
    if (!ok) { harvest(world); return false; }
    const back = r.deathFloor;
    r.dead = false;
    p.dead = false;
    p.dying = false;   // the kill flag too, or no later death could ever be processed
    if (world.pendingDeaths) world.pendingDeaths = world.pendingDeaths.filter((d) => d.id !== p.id);
    p.gold = Math.floor(p.gold / 2);
    p.statuses = [];
    // a portal back to the floor's up stairs (or beside the boss gate after an arena death)
    const isArena = typeof back === 'string' && back[0] === 'a';
    const key = isArena ? Number(back.slice(1)) : back;
    BD.sim.run.travel(world, 'town', 'portal');
    const s = BD.sim.stats.statsOf(world, p);
    p.hp = s.maxLife;
    if (p.resources.mana) p.resources.mana.cur = s.maxMana;
    if (isArena) { delete world.floorDeltas[back]; }
    const plan = key === 'town' ? null : { key };
    if (plan) world.run.portal = { key, x: -1, y: -1, to: isArena ? 'gate' : 'up' };
    world.events.push({ type: 'revive', id: p.id, x: p.x, y: p.y });
    return true;
  });
  CMD.register('Harvest', (world) => harvest(world));

  function harvest(world) {
    const r = world.run;
    if (r.harvested) return null;
    r.harvested = true;
    const s = souls(world);
    world.events.push({ type: 'run.harvest', souls: s });
    return s;
  }

  function onVictory(world) {
    const r = world.run;
    r.victory = true;
    world.events.push({ type: 'run.victory', souls: souls(world), timeMs: r.timeMs });
  }

  BD.sim.death = { souls, bargainChance, onPlayerDeath, harvest, onVictory };
})(globalThis.BD);
