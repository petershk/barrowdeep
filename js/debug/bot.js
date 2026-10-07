// @ts-check
// The bot (08 §3): a controller that issues the same commands as a player against the real sim.
// DOM-free; used by tools/bot.js in Node and by the debug "bot watch" in the browser.
(function (BD) {
  'use strict';

  BD.debug = BD.debug || {};
  const U = BD.core.util;
  const CMD = (w, c) => BD.sim.commands.issue(w, c);
  const { cheb, within } = U;

  const ATTR_PLAN = { fighter: { str: 3, vit: 2 }, assassin: { dex: 3, vit: 2 }, magician: { mag: 3, vit: 2 }, valkyrie: { dex: 3, vit: 2 } };
  const SKILL_PLAN = {
    fighter: ['bash', 'bash', 'charge', 'bash', 'bash', 'war_cry', 'bash', 'war_cry', 'charge', 'berserk_strike', 'berserk_strike', 'earthshaker', 'berserk_strike', 'earthshaker', 'berserk_strike', 'earthshaker', 'warlord', 'bloodlust', 'earthshaker', 'berserk_strike', 'war_cry', 'charge', 'brace', 'brace', 'second_wind', 'second_wind', 'war_cry', 'earthshaker', 'avalanche_leap', 'juggernaut'],
    assassin: ['tiger_strike', 'tiger_strike', 'fire_blast', 'tiger_strike', 'tiger_strike', 'dragon_talon', 'dragon_talon', 'dragon_talon', 'shadowstep', 'phoenix_strike', 'phoenix_strike', 'phoenix_strike', 'dragon_talon', 'phoenix_strike', 'phoenix_strike', 'endless_flurry', 'dragon_talon', 'lightning_sentry', 'lightning_sentry', 'fire_blast', 'fire_blast', 'smoke_bomb', 'shadowstep', 'lightning_sentry', 'death_sentry', 'shadow_master', 'shadow_master', 'fire_blast', 'smoke_bomb', 'unseen'],
    magician: ['firebolt', 'firebolt', 'firebolt', 'frost_nova', 'firebolt', 'fireball', 'fireball', 'fireball', 'frost_nova', 'fireball', 'fireball', 'meteor', 'meteor', 'meteor', 'meteor', 'meteor', 'pyre', 'teleport', 'teleport', 'frost_nova', 'frost_nova', 'ice_shard', 'blizzard', 'blizzard', 'spark', 'chain_lightning', 'chain_lightning', 'blizzard', 'chain_lightning', 'energy_shield'],
    valkyrie: ['multishot', 'aimed_shot', 'multishot', 'multishot', 'multishot', 'vault', 'aimed_shot', 'aimed_shot', 'multishot', 'aimed_shot', 'aimed_shot', 'rain_of_arrows', 'rain_of_arrows', 'rain_of_arrows', 'pinning_shot', 'rain_of_arrows', 'rain_of_arrows', 'deadeye', 'javelin', 'vault', 'pinning_shot', 'pinning_shot', 'piercing_shot', 'piercing_shot', 'sky_spear', 'sky_spear', 'valkyries_call', 'valkyries_call', 'javelin', 'wind_dancer'],
  };
  const BAR = {
    fighter: { rmb: 'bash', s1: 'berserk_strike', s2: 'earthshaker', s3: 'war_cry', s4: 'charge' },
    assassin: { rmb: 'tiger_strike', s1: 'dragon_talon', s2: 'phoenix_strike', s3: 'fire_blast', s4: 'shadowstep' },
    magician: { rmb: 'firebolt', s1: 'fireball', s2: 'meteor', s3: 'frost_nova', s4: 'teleport' },
    valkyrie: { rmb: 'multishot', s1: 'aimed_shot', s2: 'rain_of_arrows', s3: 'vault', s4: 'pinning_shot' },
  };

  function make(world, opts) {
    return { world, opts: opts || {}, tick: 0, lastProgress: 0, lastPos: '', stuckMs: 0, stats: newStats(), floorStart: 0, floorTimes: {}, mode: 'explore', target: null, bossTimer: 0, deathCauses: [], skillUse: {}, lastFloor: null, done: false };
  }
  function newStats() { return { kills: {}, ttk: {}, dmgTakenBySrc: {}, goldEarned: 0, goldSpent: 0, items: { common: 0, magic: 0, rare: 0, legendary: 0 }, levelAtFloor: {}, deaths: 0, bossTimes: {}, swaps: 0, usable: 0, drops: 0 }; }

  // ---------------- progression ----------------
  function spendPoints(bot) {
    const w = bot.world, p = w.player;
    const plan = ATTR_PLAN[p.cls];
    let guard = 0;
    while (p.unspent.attr > 0 && guard++ < 50) {
      for (const k in plan) { if (p.unspent.attr <= 0) break; BD.sim.commands.apply(w, { type: 'SpendAttr', key: k, n: Math.min(plan[k], p.unspent.attr) }); }
    }
    // the plan is an ordered list of picks: the k-th mention of a skill means "raise it to rank k"
    const want = {};
    for (const id of SKILL_PLAN[p.cls]) {
      if (p.unspent.skill <= 0) break;
      want[id] = (want[id] || 0) + 1;
      if ((p.skills[id] || 0) < want[id] && BD.sim.progression.canLearn(w, p, id).ok) BD.sim.commands.apply(w, { type: 'SpendSkill', id });
    }
    for (const slot in BAR[p.cls]) { const id = BAR[p.cls][slot]; if (p.skills[id] && p.bar[slot] !== id) BD.sim.commands.apply(w, { type: 'SetBar', slot, id }); }
  }

  /** score an item swap by DPS and effective-life deltas from statsOf */
  function improves(w, p, item) {
    if (!BD.sim.inventory.canEquip(w, p, item).ok) return null;
    const cmp = BD.sim.itemsDescribe.compare(w, p, item);
    const cur = BD.sim.stats.statsOf(w, p);
    const d0 = BD.sim.itemsDescribe.dps(cur), e0 = BD.sim.itemsDescribe.ehp(w, cur);
    // casters are scored by spell power (Magic, spell% and their main element), not weapon DPS
    const sp = (s) => (1 + 0.03 * (s.mag || 0)) * (1 + ((s.spell_pct || 0) + (s.fire_pct || 0)) / 100) * (1 + (Math.min(60, s.critChance || 0) / 100) * ((s.critMult || 1.75) - 1));
    const caster = p.cls === 'magician', sp0 = caster ? sp(cur) : 0;
    let best = null;
    for (const c of cmp) {
      const off = caster ? sp(BD.sim.itemsDescribe.wearing(w, p, item, c.slot)) / sp0 - 1 : c.dps / Math.max(1, d0);
      const score = off + 0.8 * (c.ehp / Math.max(1, e0)) + (c.rows.find((r) => r.label === 'Magic Find') ? 0.002 : 0);
      if (score > 0.02 && (!best || score > best.score)) best = { slot: c.slot, score };
    }
    return best;
  }
  function manageGear(bot) {
    const w = bot.world, p = w.player;
    for (const it of p.pack.slice()) {
      const b = improves(w, p, it);
      if (b) { BD.sim.commands.apply(w, { type: 'Equip', uid: it.uid, slot: b.slot }); bot.stats.swaps++; }
    }
  }

  // ---------------- perception ----------------
  function dangerAt(w, x, y) {
    for (const z of w.floor.zones) if (!z.resolved && z.faction !== 'player' && z.armMs < 900 && z.tiles.some(([a, b]) => a === x && b === y)) return z;
    return null;
  }
  function visibleEnemies(w, r) {
    const p = w.player, f = w.floor, out = [];
    for (const e of f.entities.values()) {
      if (e.dead || e.faction === 'player' || e.untargetable) continue;
      if (!f.visible[e.y * f.w + e.x]) continue;
      if (!within(p.x, p.y, e.x, e.y, r)) continue;
      out.push(e);
    }
    return out.sort((a, b) => U.dist2(a.x, a.y, p.x, p.y) - U.dist2(b.x, b.y, p.x, p.y));
  }
  /** nearest explored walkable tile next to unexplored space */
  function frontier(w) {
    const f = w.floor, p = w.player;
    const walk = (x, y) => BD.sim.entities.walkable(f, x, y);
    const d = BD.core.grid.bfs(f.w, f.h, [[p.x, p.y]], walk, 120);
    let best = -1, bd = 1e9;
    for (let i = 0; i < d.length; i++) {
      if (d[i] < 2 || d[i] >= bd) continue;
      const x = i % f.w, y = (i / f.w) | 0;
      let open = false;
      for (const [dx, dy] of U.DIRS) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < f.w && ny < f.h && !f.explored[ny * f.w + nx]) { open = true; break; } }
      if (open) { bd = d[i]; best = i; }
    }
    return best < 0 ? null : { x: best % f.w, y: (best / f.w) | 0 };
  }

  // ---------------- combat ----------------
  function useSkill(bot, slot, t, aim) {
    const w = bot.world, p = w.player;
    const id = p.bar[slot];
    if (!id || !p.skills[id]) return false;
    const ab = BD.data.skills[id];
    if (BD.sim.abilities.cooldownLeft(p, ab) > 0) return false;
    const res = ab.resource || {};
    if (res.type && res.type !== 'none' && typeof res.cost === 'number' && res.cost > 0 && !BD.sim.resources.canPay(p, res.type, res.cost, res.minStart)) return false;
    // a cast that was just tried and didn't start (rejected: no room, out of sight…) waits, so the rotation falls through
    bot.tries = bot.tries || {};
    if (!p.attack && bot.tries[id] != null && w.time - bot.tries[id] < 1500) return false;
    bot.tries[id] = w.time;
    CMD(w, { type: 'UseSkill', slot, aim: aim || (t ? { entityId: t.id, x: t.x, y: t.y } : 'auto') });
    bot.skillUse[id] = (bot.skillUse[id] || 0) + 1;
    return true;
  }
  const ROTATION = {
    fighter(bot, t, near) {
      const p = bot.world.player, rage = p.resources.rage.cur, adj = near.filter((e) => cheb(e.x, e.y, p.x, p.y) <= 1).length;
      if (rage >= 50 && adj >= 2 && useSkill(bot, 's2', t)) return true;
      if (rage >= 25 && near.length >= 3 && useSkill(bot, 's3', t)) return true;
      if (rage >= 40 && cheb(t.x, t.y, p.x, p.y) <= 1 && useSkill(bot, 's1', t)) return true;
      if (rage >= 20 && cheb(t.x, t.y, p.x, p.y) >= 3 && useSkill(bot, 's4', t)) return true;
      if (cheb(t.x, t.y, p.x, p.y) <= 1 && useSkill(bot, 'rmb', t)) return true;
      return false;
    },
    assassin(bot, t, near) {
      const p = bot.world.player, c = BD.sim.resources.combo(p), en = p.resources.energy.cur;
      // Shadowstep flanks shield-bearers, closes on kiters, and sets up a guaranteed crit
      const guarded = BD.sim.monsters.blockFront(t) > 0 && BD.sim.targeting.inFront(t, p.x, p.y);
      if (en >= 15 && (guarded || cheb(t.x, t.y, p.x, p.y) >= 2) && useSkill(bot, 's4', t)) return true;
      if (c >= 3 && en >= 40 && near.filter((e) => cheb(e.x, e.y, p.x, p.y) <= 2).length >= 2 && useSkill(bot, 's2', t)) return true;
      if (c >= 2 && en >= 30 && cheb(t.x, t.y, p.x, p.y) <= 1 && useSkill(bot, 's1', t)) return true;
      if (cheb(t.x, t.y, p.x, p.y) >= 3 && en >= 20 && useSkill(bot, 's3', t, { x: t.x, y: t.y })) return true;
      if (cheb(t.x, t.y, p.x, p.y) <= 1 && en >= 8 && useSkill(bot, 'rmb', t)) return true;
      return false;
    },
    magician(bot, t, near) {
      const p = bot.world.player, m = p.resources.mana.cur;
      const close = near.filter((e) => cheb(e.x, e.y, p.x, p.y) <= 2).length;
      if (close >= 2 && m >= 18 && useSkill(bot, 's3', t)) return true;
      // a caster doesn't trade blows: when something reaches melee range, back off a few tiles
      const awake = t.ai && t.ai.state !== 'idle' && t.ai.state !== 'dormant';
      const pressed = p.hp < BD.sim.stats.statsOf(bot.world, p).maxLife * 0.7 || near.filter((e) => cheb(e.x, e.y, p.x, p.y) <= 1).length >= 2;
      if (awake && pressed && cheb(t.x, t.y, p.x, p.y) <= 1 && !(p.cooldowns.evade > 0) && !(bot.kitedAt > bot.world.time - 3000) && kiteFrom(bot, t)) { bot.kitedAt = bot.world.time; return true; }
      if (near.length >= 3 && m >= 30 && useSkill(bot, 's2', t, { x: t.x, y: t.y })) return true;
      if (m >= 14 + 10 && useSkill(bot, 's1', t, { x: t.x, y: t.y })) return true;
      if (useSkill(bot, 'rmb', t, { x: t.x, y: t.y })) return true;
      return false;
    },
    valkyrie(bot, t, near) {
      const p = bot.world.player, f = p.resources.focus.n;
      // Vault out when crowded or hurt; a single melee foe isn't worth the lost shots
      const adj = near.filter((e) => cheb(e.x, e.y, p.x, p.y) <= 1).length, hurt = p.hp < BD.sim.stats.statsOf(bot.world, p).maxLife * 0.5;
      if (cheb(t.x, t.y, p.x, p.y) <= 1 && (adj >= 2 || hurt) && useSkill(bot, 's3', t, { x: t.x, y: t.y })) return true;
      if (f >= 4 && near.length >= 3 && useSkill(bot, 's2', t, { x: t.x, y: t.y })) return true;
      if (f >= 2 && useSkill(bot, 's1', t, { x: t.x, y: t.y })) return true;
      if (useSkill(bot, 's4', t, { x: t.x, y: t.y })) return true;
      if (useSkill(bot, 'rmb', t, { x: t.x, y: t.y })) return true;
      return false;
    },
  };

  /** step (or Evade) to a free tile ~3 away from t, preferring the direction away from it */
  function kiteFrom(bot, t) {
    const w = bot.world, p = w.player, f = w.floor;
    const dx = Math.sign(p.x - t.x), dy = Math.sign(p.y - t.y);
    for (const [ax, ay] of [[dx, dy], [dx, 0], [0, dy], [dx || 1, -dy || 1], [-dy || 1, dx || 1]]) {
      if (!ax && !ay) continue;
      const x = p.x + ax * 3, y = p.y + ay * 3;
      if (BD.sim.entities.isFree(f, x, y) && !dangerAt(w, x, y)) { CMD(w, { type: 'Evade', dirX: ax, dirY: ay }); return true; }
    }
    return false;
  }

  function fight(bot, near) {
    const w = bot.world, p = w.player;
    bot.unreach = bot.unreach || new Map();
    near = near.filter((e) => !(bot.unreach.get(e.id) > w.time));
    if (!near.length) return progress(bot);
    // spawners (egg clutches, bone piles) first: they turn one fight into an endless one
    const spawner = near.find((e) => { const d = BD.sim.monsters.defOf(e); return d && d.role === 'spawner'; });
    const t = spawner || near[0];
    // give up on a target whose life hasn't dropped in 8 s (across lava, kiting out of reach…)
    const isBoss = t.rank === 'boss' || t.rank === 'malgoth';   // never write off a boss (phases, wings, burrows)
    const arena = !!w.floor.arena || w.floor.n === 13;
    if (arena) {
      // in an arena: drop an add we can't hurt for 8 s (blinking casters) and get back to the boss
      if (isBoss || !bot.prog1 || bot.prog1.id !== t.id || t.hp < bot.prog1.hp) bot.prog1 = { id: t.id, hp: t.hp, at: w.time };
      else if (w.time - bot.prog1.at > 8000) { bot.unreach.set(t.id, w.time + 30000); bot.prog1 = null; return progress(bot); }
    } else {
      // per-target progress: alternating between two unreachable targets must not reset the clock
      bot.prog = bot.prog instanceof Map ? bot.prog : new Map();
      const pr = bot.prog.get(t.id);
      if (isBoss || !pr || t.hp < pr.hp) bot.prog.set(t.id, { hp: t.hp, at: pr && !isBoss && t.hp >= pr.hp ? pr.at : w.time });
      else if (w.time - pr.at > 8000) { bot.unreach.set(t.id, w.time + 30000); bot.prog.delete(t.id); return progress(bot); }
    }
    // give up on targets we can't reach after 4 s without progress
    const key = t.id + ':' + p.x + ',' + p.y;
    if (p.attack) bot.fightSince = w.time;   // swinging counts as progress
    if (!isBoss && bot.fightKey === key && !p.attack && w.time - bot.fightSince > 4000) { bot.unreach.set(t.id, w.time + 20000); bot.fightKey = null; return progress(bot); }
    if (bot.fightKey !== key) { bot.fightKey = key; bot.fightSince = w.time; }
    if (p.attack && p.attack.phase === 'windup') return;
    if (!ROTATION[p.cls](bot, t, near)) CMD(w, { type: 'Engage', entityId: t.id, hold: true });
  }

  // ---------------- one decision ----------------
  function decide(bot) {
    const w = bot.world, p = w.player, f = w.floor;
    if (p.dead) return deathChoice(bot);
    if (p.unspent.attr || p.unspent.skill) spendPoints(bot);
    const s = BD.sim.stats.statsOf(w, p);
    if (p.hp < s.maxLife * 0.5 && p.flask.charges > 0 && !(p.cooldowns.flask > 0)) CMD(w, { type: 'DrinkFlask' });
    // out of flasks and hurting, away from a boss: portal home, rest, come back (what a player would do)
    if (!f.arena && f.n !== 13 && f.key !== 'town' && p.flask.charges === 0 && p.hp < s.maxLife * 0.35 && (p.pouch.portal || 0) > 0 && !(bot.portalAt > w.time - 20000)) {
      bot.portalAt = w.time;
      if (BD.sim.commands.apply(w, { type: 'ReadScroll', kind: 'portal' })) { bot.goHome = true; return; }
    }
    if (bot.goHome && f.key !== 'town') {
      const pt = f.objects.find((o) => o.kind === 'portal');
      if (pt) { CMD(w, { type: 'Interact', x: pt.x, y: pt.y }); return; }
      bot.goHome = false;
    }
    // low and nothing to drink: break off — evade away from the nearest enemy
    if (p.hp < s.maxLife * 0.3 && (p.flask.charges === 0 || p.cooldowns.flask > 0) && !(p.cooldowns.evade > 0)) {
      const foe = visibleEnemies(w, 3)[0];
      if (foe && !(foe.rank === 'boss' || foe.rank === 'malgoth') && kiteFrom(bot, foe)) return;
    }
    // telegraphs: step or Evade out of marked tiles
    const z = dangerAt(w, p.x, p.y);
    if (z) {
      const away = escapeTile(w, z);
      if (away && !(p.cooldowns.evade > 0) && z.armMs < 400) CMD(w, { type: 'Evade', dirX: Math.sign(away.x - p.x), dirY: Math.sign(away.y - p.y) });
      else if (away) CMD(w, { type: 'Move', x: away.x, y: away.y });
      return;
    }
    if (f.key === 'town') { bot.goHome = false; return townRoutine(bot); }
    // enemies we've given up on (unreachable) don't count: loot, chests and exploring carry on
    const near = visibleEnemies(w, 9).filter((e) => !(bot.unreach && bot.unreach.get(e.id) > w.time));
    if (near.length) { fight(bot, near); return; }
    // loot
    bot.ignore = bot.ignore || new Set();
    // the nearest wanted item, committed to until picked up (8 s, then ignored) so the bot never oscillates
    const quest = (it) => it.kind === 'seal' || it.kind === 'key';   // always wanted, at any distance, never written off
    const wanted = (it) => quest(it) || !bot.ignore.has(it.uid) && !(it.kind === 'item' && it.item.rarity === 'common' && p.pack.length >= 15) && (it.kind === 'item' || it.kind === 'scroll' || it.kind === 'seal' || it.kind === 'key' || it.kind === 'gold' || (it.kind === 'orb' && p.flask.charges < p.flask.max)) && within(it.x, it.y, p.x, p.y, 12);
    // quest items first
    let g = f.items.find(quest) || (bot.lootUid != null ? f.items.find((it) => it.uid === bot.lootUid && wanted(it)) : null);
    if (!g) {
      let bd = 1e9;
      for (const it of f.items) if (wanted(it)) { const d = U.dist2(it.x, it.y, p.x, p.y); if (d < bd) { bd = d; g = it; } }
      if (g) { bot.lootUid = g.uid; bot.lootSince = w.time; }
    } else if (!quest(g) && w.time - bot.lootSince > 8000) { bot.ignore.add(g.uid); bot.lootUid = null; g = null; }
    if (g && (g.kind !== 'item' || p.pack.length < 29)) {
      if (g.kind === 'item') CMD(w, { type: 'Pickup', itemUid: g.uid });
      else CMD(w, { type: 'Move', x: g.x, y: g.y });
      return;
    }
    if (p.pack.length) manageGear(bot);
    if (p.pack.length >= 26) sellJunkOrDrop(bot);
    // chests
    // chests: commit to the nearest until opened (8 s, then skip it) so two chests can't tug-of-war
    const openable = (o) => (o.kind === 'chest' || o.kind === 'pile') && !o.used && !bot.ignore.has('o' + o.x + ',' + o.y) && f.explored[o.y * f.w + o.x] && within(o.x, o.y, p.x, p.y, 10);
    let ch = bot.chestAt ? f.objects.find((o) => o.x === bot.chestAt.x && o.y === bot.chestAt.y && openable(o)) : null;
    if (!ch) {
      let bd = 1e9;
      for (const o of f.objects) if (openable(o)) { const d = U.dist2(o.x, o.y, p.x, p.y); if (d < bd) { bd = d; ch = o; } }
      if (ch) bot.chestAt = { x: ch.x, y: ch.y, since: w.time };
    } else if (w.time - bot.chestAt.since > 8000) { bot.ignore.add('o' + ch.x + ',' + ch.y); bot.chestAt = null; ch = null; }
    if (ch) { CMD(w, { type: 'Interact', x: ch.x, y: ch.y }); return; }
    return progress(bot);
  }

  function escapeTile(w, z) {
    const f = w.floor, p = w.player, bad = new Set(z.tiles.map(([x, y]) => y * f.w + x));
    for (const r of [1, 2, 3]) for (const [dx, dy] of U.DIRS) {
      const x = p.x + dx * r, y = p.y + dy * r;
      if (BD.sim.entities.isFree(f, x, y) && !bad.has(y * f.w + x) && !dangerAt(w, x, y)) return { x, y };
    }
    return null;
  }

  function progress(bot) {
    const w = bot.world, p = w.player, f = w.floor, r = w.run;
    // arena: wait for the countdown, then walk at the boss; after the kill take the portal
    if (f.arena) {
      const exit = f.objects.find((o) => o.kind === 'exit_portal');
      if (exit) { CMD(w, { type: 'Interact', x: exit.x, y: exit.y }); return; }
      const boss = Array.from(f.entities.values()).find((e) => e.rank === 'boss');
      if (boss) CMD(w, { type: 'Move', x: boss.x, y: boss.y });
      return;
    }
    if (f.n === 13) {
      const boss = Array.from(f.entities.values()).find((e) => e.rank === 'malgoth' && !e.dead) || Array.from(f.entities.values()).find((e) => e.kind === 'monster' && !e.dead);
      if (boss) CMD(w, { type: 'Engage', entityId: boss.id, hold: true });
      return;
    }
    const explored = f.reachableCount ? f.seenCount / f.reachableCount : 1;
    const fl = BD.data.floors.byN(f.n);
    const goalReady = fl.actEnd ? !!r.flags['key' + f.n] : f.sealBroken;
    const tooLong = f.timeOnFloor > (bot.opts.floorMs || 8 * 60000);
    if (goalReady && (explored > (bot.opts.explore || 0.9) || tooLong)) {
      if (fl.actEnd) { const g = f.gatePos; CMD(w, { type: 'Interact', x: g.at.x, y: g.at.y }); return; }
      CMD(w, { type: 'Interact', x: f.downPos.x, y: f.downPos.y });
      return;
    }
    // go for the Keeper once pinged / seen, otherwise explore
    const k = f.keeperId != null ? f.entities.get(f.keeperId) : null;
    if (k && (f.keeperRevealed || f.keeperPing || explored > 0.7 || tooLong)) { CMD(w, { type: 'Move', x: k.x, y: k.y }); return; }
    const fr = frontier(w);
    if (fr) { CMD(w, { type: 'Move', x: fr.x, y: fr.y }); return; }
    if (k) { CMD(w, { type: 'Move', x: k.x, y: k.y }); return; }
  }

  function sellJunkOrDrop(bot) {
    const w = bot.world, p = w.player;
    const junk = p.pack.filter((it) => !improves(w, p, it)).sort((a, b) => BD.sim.items.derive(a).value - BD.sim.items.derive(b).value);
    bot.ignore = bot.ignore || new Set();
    for (const it of junk.slice(0, Math.max(0, p.pack.length - 20))) if (it.rarity === 'common' || it.rarity === 'magic') { bot.ignore.add(it.uid); BD.sim.commands.apply(w, { type: 'Drop', uid: it.uid }); }
  }

  // ---------------- town ----------------
  function townRoutine(bot) {
    const w = bot.world, p = w.player, r = w.run;
    if (!bot.townDone) {
      const g0 = p.gold;
      for (const it of p.pack.slice()) if (!improves(w, p, it)) BD.sim.commands.apply(w, { type: 'Sell', uid: it.uid });
      bot.stats.goldEarned += Math.max(0, p.gold - g0);
      const t = BD.sim.economy.townState(w);
      const g1 = p.gold;
      for (let i = t.stock.length - 1; i >= 0; i--) { const it = t.stock[i]; if (BD.sim.economy.price(it) <= p.gold * 0.5 && improves(w, p, it)) { BD.sim.commands.apply(w, { type: 'Buy', idx: i }); BD.sim.commands.apply(w, { type: 'Equip', uid: it.uid }); } }
      if (p.equip.weapon && (p.equip.weapon.enhance || 0) < 5 && BD.sim.economy.enhanceCost(w, p.equip.weapon) <= p.gold * 0.4) BD.sim.commands.apply(w, { type: 'Enhance', uid: p.equip.weapon.uid });
      if (!r.blessing && BD.sim.economy.costs(w).blessing <= p.gold * 0.3) BD.sim.commands.apply(w, { type: 'Bless', id: t.blessOffer[0] });
      if (BD.sim.economy.costs(w).flask <= p.gold * 0.5) BD.sim.commands.apply(w, { type: 'FlaskUpgrade' });
      if ((p.pouch.portal || 0) < 2) BD.sim.commands.apply(w, { type: 'BuyScroll', kind: 'portal' });
      BD.sim.commands.apply(w, { type: 'Rest' });
      bot.stats.goldSpent += Math.max(0, g1 - p.gold);
      bot.townDone = true;
    }
    // leave: next act's waypoint, or the church stairs, or the open portal
    const next = nextDestination(w);
    bot.townDone = false;
    if (typeof next === 'number' && bot.opts.maxFloor && next > bot.opts.maxFloor) { bot.done = true; return; }
    if (next === 'portal') { BD.sim.portal.useStone(w); return; }
    if (next === 1 && !r.waypoints.includes(1)) { CMD(w, { type: 'Interact', x: w.floor.downPos.x, y: w.floor.downPos.y }); return; }
    BD.sim.commands.apply(w, { type: 'TravelWaypoint', floor: next });
  }
  function nextDestination(w) {
    const r = w.run;
    if (r.flags.sanctum) return 13;
    const wp = r.waypoints.filter((n) => n > 0);
    const furthest = wp.length ? Math.max(...wp) : 1;
    // an open portal back to a floor we've already moved past is stale: take the waypoint instead
    if (r.portal && r.portal.x >= 0 && !(typeof r.portal.key === 'number' && r.portal.key < furthest)) return 'portal';
    return furthest;
  }

  function deathChoice(bot) {
    const w = bot.world;
    if (w.run.harvested) { bot.done = true; return; }
    bot.stats.deaths++;
    bot.deathCauses.push({ floor: w.floor.key, cause: w.run.deathCause, level: w.player.level });
    if (bot.opts.bargain !== false && BD.sim.death.bargainChance(w) > 0) {
      const ok = BD.sim.commands.apply(w, { type: 'Bargain' });
      if (!ok) bot.done = true;
    } else { BD.sim.commands.apply(w, { type: 'Harvest' }); bot.done = true; }
  }

  // ---------------- stepping & bookkeeping ----------------
  function observe(bot) {
    const w = bot.world, p = w.player;
    for (const ev of w.events) {
      if (ev.type === 'death' && ev.kind === 'monster') {
        bot.stats.kills[ev.rank] = (bot.stats.kills[ev.rank] || 0) + 1;
        const born = bot.fightStart.get(ev.id);
        if (born != null) { (bot.stats.ttk[ev.rank] = bot.stats.ttk[ev.rank] || []).push((w.time - born) / 1000); bot.fightStart.delete(ev.id); }
      } else if (ev.type === 'damage' && ev.tgtId === p.id) {
        const src = BD.sim.entities.get(w, ev.srcId);
        const key = src ? src.def + (ev.tags && ev.tags.includes('zone') ? ':zone' : '') : 'other';
        bot.stats.dmgTakenBySrc[key] = (bot.stats.dmgTakenBySrc[key] || 0) + ev.total;
      } else if (ev.type === 'damage' && ev.srcId === p.id && !bot.fightStart.has(ev.tgtId)) bot.fightStart.set(ev.tgtId, w.time);
      else if (ev.type === 'loot.drop' && ev.rarity) { bot.stats.items[ev.rarity]++; bot.stats.drops++; }
      else if (ev.type === 'gold') bot.stats.goldEarned += ev.amount;
      else if (ev.type === 'boss.defeat') bot.stats.bossTimes[ev.def] = (w.time - (bot.bossStart || w.time)) / 1000;
      else if (ev.type === 'boss.wake') bot.bossStart = w.time;
    }
    const key = w.floor.key;
    if (key !== bot.lastFloor) {
      if (bot.lastFloor != null && typeof bot.lastFloor === 'number') bot.floorTimes[bot.lastFloor] = (bot.floorTimes[bot.lastFloor] || 0) + (w.time - bot.floorStart) / 1000;
      bot.floorStart = w.time; bot.lastFloor = key;
      if (typeof key === 'number' && bot.stats.levelAtFloor[key] == null) bot.stats.levelAtFloor[key] = w.player.level;
    }
  }

  /** run the bot for ms of world time (or until done) */
  function run(bot, ms, opts) {
    const w = bot.world, STEP = BD.core.scheduler.STEP_MS;
    bot.fightStart = bot.fightStart || new Map();
    const end = w.time + ms;
    while (w.time < end && !bot.done) {
      if (bot.tick++ % 8 === 0) decide(bot);
      BD.sim.world.step(w, STEP);
      observe(bot);
      if (opts && opts.onEvents) opts.onEvents(w.events);
      w.events.length = 0;
      if (opts && opts.until && opts.until(w)) break;
      // stuck detection
      const pos = w.floor.key + ':' + w.player.x + ',' + w.player.y;
      if (pos === bot.lastPos) bot.stuckMs += STEP; else { bot.stuckMs = 0; bot.lastPos = pos; }
      if (bot.stuckMs > 20000) { bot.stuckMs = 0; const f = w.floor; const t = BD.sim.entities.nearestFree(f, w.player.x + w.rng.int(-6, 6), w.player.y + w.rng.int(-6, 6), 6); if (t) CMD(w, { type: 'Move', x: t.x, y: t.y }); }
    }
    return bot;
  }

  BD.debug.bot = { make, run, decide, spendPoints, improves, ATTR_PLAN, SKILL_PLAN, BAR, ROTATION };
})(globalThis.BD);
