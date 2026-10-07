// @ts-check
// Legendary powers and item procs (03 §4.3, §5). Powers change how skills behave
// (modifyAbility), add stats, or hook hits/kills/blocks. Everything stays on the one pipeline.
(function (BD) {
  'use strict';

  const Stats = () => BD.sim.stats;
  const Entities = BD.sim.entities;
  const Hits = () => BD.sim.hits;
  const { cheb, within } = BD.core.util;

  // item procs
  const GEAR_STUN_MS = 400;              // stun from gear stun_chance
  const CHAIN_PROC_CHANCE = 0.05;        // proc_chain_on_hit: chance per hit
  const CHAIN_JUMPS = 4;                 // ...targets hit by one chain
  const CHAIN_JUMP_RANGE = 3;            // ...tiles between links
  const CHAIN_WEAPON_MULT = 0.3;         // ...weapon damage per link
  const CRIT_HEAL_ICD_MS = 250;          // proc_heal_on_crit: internal cooldown
  const CRIT_HEAL_PCT = 0.01;            // ...max life healed
  const LOW_LIFE_FRACTION = 0.3;         // "low life" for Aegis and proc_shield_low
  const PROC_SHIELD_MS = 6000;           // proc_shield_low: shield duration
  const PROC_SHIELD_PCT = 0.15;          // ...shield size as max life
  const PROC_SHIELD_CD_MS = 30000;       // ...cooldown
  const KILL_NOVA_CHANCE = 0.1;          // proc_nova_on_kill: chance per kill
  const KILL_NOVA_MULT = 0.5;            // ...weapon damage
  const KILL_HASTE_MS = 3000;            // proc_haste_on_kill: haste duration
  const EVADE_FROST_MS = 3000;           // proc_frost_on_evade: frost patch duration
  // legendary powers
  const TEMPTERS_UNAWARE_MULT = 3;       // Tempter's Cloak: damage vs idle/dormant monsters
  const EMBERS_RANGE = 3;                // Crown of Embers: burning targets within this range...
  const EMBERS_MULT = 1.3;               // ...take this much more damage
  const LANTERN_MULT = 1.1;              // Lantern of the Lost: damage inside the light radius
  const RIMEHEART_MULT = 1.25;           // Rimeheart: damage vs frozen
  const CHOIRBREAKER_EVERY = 10;         // Choirbreaker: every Nth hit stuns around you
  const CHOIRBREAKER_RANGE = 2;
  const CHOIRBREAKER_STUN_MS = 1000;
  const BULWARK_ICD_MS = 1000;           // Bishop's Bulwark: nova on block, at most this often
  const BULWARK_NOVA_MULT = 0.6;
  const AEGIS_MS = 4000;                 // Aegis of the Fallen: duration, % reduction, cooldown
  const AEGIS_PCT = 50;
  const AEGIS_CD_MS = 30000;
  const HOLY_MACE_HEAL_PCT = 0.02;       // The Holy Mace: max life healed per kill
  const HEART_FLASK_CHANCE = 0.15;       // Heart of the Barrow: flask charge on kill when empty
  const OSSUARY_RANGE = 3;               // Ossuary Seal: corpses within range...
  const OSSUARY_MAX_CORPSES = 3;         // ...counted up to this many...
  const OSSUARY_HEAL_PCT = 0.01;         // ...each heals this much max life per second
  const THUNDERMAUL_PILLARS = 3;         // Thundermaul: lightning pillars per Earthshaker
  const THUNDERMAUL_MULT = 0.5;
  const THUNDERMAUL_MS = 3000;
  const GOREFEAST_HEAL_PCT = 0.015;      // Gorefeast: max life healed per whirlwind target

  /** set of equipped legendary ids (allies use their owner's) */
  function active(p) {
    if (!p) return EMPTY;
    const src = p.ownerEquip || p.equip;
    if (!src) return EMPTY;
    // cheap key: legendary ids of the 8 slots (no allocation when unchanged)
    let key = '';
    for (const s in src) {
      const it = src[s];
      if (it && it.legendary) key += it.legendary + ',';
    }
    if (p._powKey === key) return p._pow;
    const set = new Set();
    for (const s in src) {
      const it = src[s];
      if (it && it.legendary) set.add(it.legendary);
    }
    Object.defineProperty(p, '_pow', { value: set, writable: true, configurable: true, enumerable: false });
    Object.defineProperty(p, '_powKey', { value: key, writable: true, configurable: true, enumerable: false });
    return set;
  }
  const EMPTY = new Set();
  const has = (p, id) => active(p).has(id);

  /** procs on equipped items */
  function procs(p) {
    const out = [];
    for (const s in p.equip) {
      const it = p.equip[s];
      if (!it) continue;
      const d = BD.sim.items.derive(it);
      if (d.proc) out.push(d.proc);
    }
    return out;
  }

  // ---------------- ability modifications ----------------
  const MODS = {
    worldcleaver: (ab) => { if (ab.id === 'bash') ab.area = { shape: 'all8' }; },
    bloodhowl_helm: (ab) => {
      if (ab.id !== 'war_cry') return;
      const doubled = ab.effects.map((e) => (e.type === 'status' ? Object.assign({}, e, { durMs: e.durMs * 2 }) : e));
      ab.effects = doubled.concat([{ type: 'status', id: 'taunted', durMs: 6000 }]);
      ab.selfEffects = ab.selfEffects.map((e) => Object.assign({}, e, { durMs: e.durMs * 2 }));
    },
    ironbrand: (ab) => { if (ab.id === 'charge') ab.targeting = Object.assign({}, ab.targeting, { range: ab.targeting.range + 3 }); },
  };
  /** class powers register more modifications (skills_<class>.js) */
  function registerMod(id, fn) { MODS[id] = fn; }
  function modifyAbility(ab, rank, p) {
    for (const id of active(p)) if (MODS[id]) MODS[id](ab, rank, p);
  }
  function cooldown(world, p, ab, ms) {
    for (const id of active(p)) if (CDS[id]) ms = CDS[id](ab, ms, p);
    return ms;
  }
  function charges(world, p, ab, n) {
    for (const id of active(p)) if (CHG[id]) n = CHG[id](ab, n, p);
    return n;
  }
  const CDS = {};
  const CHG = {};
  function registerCooldown(id, fn) { CDS[id] = fn; }
  function registerCharges(id, fn) { CHG[id] = fn; }

  // ---------------- stats ----------------
  function statMods(world, p, add) {
    const a = active(p);
    if (a.has('holy_mace')) {
      add('dmg_vs_undead_pct', 50, 'The Holy Mace');
      add('dmg_vs_demon_pct', 50, 'The Holy Mace');
    }
    if (a.has('band_of_ages')) add('all_skills', 1, 'Band of Ages');
    if (a.has('mantle_of_souls')) add('souls_pct', 25, 'Mantle of Souls');
    if (a.has('ferrymans_coin')) add('bargain_chance', 20, "Ferryman's Coin");
    if (a.has('gravewalkers_shroud')) add('evade_charges', 1, "Gravewalker's Shroud");
    if (a.has('lantern_of_the_lost')) add('light_radius', 3, 'Lantern of the Lost');
  }
  function noticeRange(world, p, r) { return has(p, 'tempters_cloak') ? r / 2 : r; }

  // ---------------- situational damage multipliers ----------------
  BD.sim.damage.multHooks.push((world, src, tgt) => {
    if (!src || src.kind !== 'player' || tgt.kind !== 'monster') return 1;
    const a = active(src);
    if (!a.size) return 1;
    let k = 1;
    if (a.has('tempters_cloak') && tgt.ai && (tgt.ai.state === 'idle' || tgt.ai.state === 'dormant')) k *= TEMPTERS_UNAWARE_MULT;
    if (a.has('crown_of_embers') && BD.sim.status.has(tgt, 'burning') && within(src.x, src.y, tgt.x, tgt.y, EMBERS_RANGE)) k *= EMBERS_MULT;
    if (a.has('lantern_of_the_lost') && within(src.x, src.y, tgt.x, tgt.y, Stats().statsOf(world, src).light_radius)) k *= LANTERN_MULT;
    if (a.has('rimeheart') && BD.sim.status.has(tgt, 'frozen')) k *= RIMEHEART_MULT;
    return k;
  });

  // ---------------- hits, kills, blocks ----------------
  BD.sim.damage.onHitHooks.push((world, src, tgt, pk, res) => {
    // dealt by the player
    if (src && src.kind === 'player' && tgt.kind === 'monster') {
      const s = Stats().statsOf(world, src);
      if (s.life_on_hit) BD.sim.status.heal(world, src, s.life_on_hit);
      // status chances from gear / weapon implicits
      const mult = s.statusChanceMult;
      if (s.bleed_chance && world.rng.chance((s.bleed_chance / 100) * mult)) {
        BD.sim.status.apply(world, tgt, 'bleeding', { sourceId: src.id, hit: res.total });
      }
      if (s.poison_chance && world.rng.chance((s.poison_chance / 100) * mult)) {
        BD.sim.status.apply(world, tgt, 'poisoned', { sourceId: src.id, hit: res.total });
      }
      if (s.stun_chance && world.rng.chance((s.stun_chance / 100) * mult)) {
        BD.sim.status.apply(world, tgt, 'stunned', { durMs: GEAR_STUN_MS, sourceId: src.id });
      }
      const pr = procs(src);
      if (pr.indexOf('proc_chain_on_hit') >= 0 && world.rng.chance(CHAIN_PROC_CHANCE) && pk.abilityId !== 'proc') {
        procChain(world, src, tgt);
      }
      if (pr.indexOf('proc_heal_on_crit') >= 0 && res.crit && (!src._healCritT || world.time - src._healCritT >= CRIT_HEAL_ICD_MS)) {
        Object.defineProperty(src, '_healCritT', { value: world.time, writable: true, configurable: true, enumerable: false });
        BD.sim.status.heal(world, src, s.maxLife * CRIT_HEAL_PCT);
      }
      if (has(src, 'choirbreaker') && !pk.isDot) {
        src.hitCount = (src.hitCount || 0) + 1;
        if (src.hitCount % CHOIRBREAKER_EVERY === 0) {
          world.events.push({ type: 'power', id: 'choirbreaker', x: src.x, y: src.y });
          for (const e of Entities.enemiesOf(world, src.faction)) {
            if (!within(e.x, e.y, src.x, src.y, CHOIRBREAKER_RANGE) || e.rank === 'boss' || e.rank === 'malgoth') continue;
            BD.sim.status.apply(world, e, 'stunned', { durMs: CHOIRBREAKER_STUN_MS, sourceId: src.id });
          }
        }
      }
    }
    // taken by the player
    if (tgt.kind === 'player') {
      const s = Stats().statsOf(world, tgt);
      if (res.blocked && has(tgt, 'bishops_bulwark') && (!tgt._novaT || world.time - tgt._novaT >= BULWARK_ICD_MS)) {
        Object.defineProperty(tgt, '_novaT', { value: world.time, writable: true, configurable: true, enumerable: false });
        weaponNova(world, tgt, 1, BULWARK_NOVA_MULT, 'holy');
      }
      if (tgt.hp > 0 && tgt.hp < s.maxLife * LOW_LIFE_FRACTION) {
        if (has(tgt, 'aegis_of_the_fallen') && !(tgt.cooldowns.aegis > 0)) {
          BD.sim.status.apply(world, tgt, 'aegis', { durMs: AEGIS_MS, magnitude: AEGIS_PCT });
          tgt.cooldowns.aegis = AEGIS_CD_MS;
          world.events.push({ type: 'power', id: 'aegis', x: tgt.x, y: tgt.y });
        }
        if (procs(tgt).indexOf('proc_shield_low') >= 0 && !(tgt.cooldowns.procShield > 0)) {
          BD.sim.status.apply(world, tgt, 'shielded', { durMs: PROC_SHIELD_MS, magnitude: s.maxLife * PROC_SHIELD_PCT });
          tgt.cooldowns.procShield = PROC_SHIELD_CD_MS;
        }
      }
    }
  });

  BD.sim.damage.onKillHooks.push((world, victim, killer) => {
    const p = world.player;
    if (!killer || (killer.kind !== 'player' && killer.ownerId !== p.id) || victim.faction !== 'monster') return;
    const s = Stats().statsOf(world, p);
    if (s.life_on_kill) BD.sim.status.heal(world, p, s.life_on_kill);
    if (has(p, 'holy_mace')) BD.sim.status.heal(world, p, s.maxLife * HOLY_MACE_HEAL_PCT);
    if (has(p, 'heart_of_the_barrow') && p.flask.charges === 0 && world.rng.chance(HEART_FLASK_CHANCE)) {
      p.flask.charges = 1;
      world.events.push({ type: 'flask.charge', charges: 1, x: p.x, y: p.y });
    }
    const pr = procs(p);
    if (pr.indexOf('proc_nova_on_kill') >= 0 && world.rng.chance(KILL_NOVA_CHANCE)) {
      weaponNova(world, p, 1, KILL_NOVA_MULT, 'fire', victim.x, victim.y);
    }
    if (pr.indexOf('proc_haste_on_kill') >= 0) BD.sim.status.apply(world, p, 'hasted', { durMs: KILL_HASTE_MS });
  });

  BD.sim.items.evadeHooks.push((world, p, fx, fy) => {
    if (procs(p).indexOf('proc_frost_on_evade') < 0) return;
    BD.sim.zones.ground(world, 'frost_patch', [[fx, fy]], { durMs: EVADE_FROST_MS, faction: 'player', srcId: p.id });
  });

  /** a weapon-scaled nova around (x,y) (procs, Bishop's Bulwark) */
  function weaponNova(world, p, radius, mult, element, x, y) {
    const cx = x != null ? x : p.x;
    const cy = y != null ? y : p.y;
    const tiles = BD.core.grid.shapeOffsets('circle', radius).map(([dx, dy]) => [cx + dx, cy + dy]);
    const ab = { id: 'proc', tags: ['aoe'] };
    const eff = { type: 'damage', source: 'weapon', mult, element: element === 'holy' ? null : element };
    world.events.push({ type: 'power.nova', x: cx, y: cy, school: element });
    for (const e of BD.sim.targeting.entitiesOnTiles(world, tiles, p.faction)) {
      const h = Hits().computeHit(world, p, ab, eff, 1, { rng: world.rng });
      BD.sim.damage.dealDamage(world, {
        srcId: p.id, tgtId: e.id, amounts: h.amounts, tags: ['aoe', 'proc'],
        canCrit: false, canDodge: false, canBlock: false, mult: 1, abilityId: 'proc',
      });
    }
  }
  function procChain(world, p, first) {
    let cur = first, from = p;
    const hit = new Set();
    for (let i = 0; i < CHAIN_JUMPS && cur; i++) {
      world.events.push({ type: 'chain', srcId: p.id, fromX: from.x, fromY: from.y, x: cur.x, y: cur.y, abilityId: 'proc' });
      const eff = { source: 'weapon', mult: CHAIN_WEAPON_MULT, element: 'light' };
      const h = Hits().computeHit(world, p, { tags: [] }, eff, 1, { rng: world.rng });
      BD.sim.damage.dealDamage(world, {
        srcId: p.id, tgtId: cur.id, amounts: h.amounts, tags: ['proc'],
        canCrit: false, canDodge: false, canBlock: false, mult: 1, abilityId: 'proc',
      });
      hit.add(cur.id);
      from = cur;
      cur = BD.sim.targeting.nearestEnemy(world, from.x, from.y, CHAIN_JUMP_RANGE, p.faction, { exclude: hit });
    }
  }

  // ---------------- per-step powers (Ossuary Seal) ----------------
  function system(world, dt) {
    const p = world.player;
    if (!p || p.dead || !has(p, 'ossuary_seal')) return;
    let n = 0;
    for (const c of world.floor.corpses) if (within(c.x, c.y, p.x, p.y, OSSUARY_RANGE)) n++;
    n = Math.min(OSSUARY_MAX_CORPSES, n);
    if (n) BD.sim.status.heal(world, p, (Stats().statsOf(world, p).maxLife * OSSUARY_HEAL_PCT * n * dt) / 1000);
  }

  // ---------------- fighter hooks from skills_fighter ----------------
  function onWarCry() {}
  function onEarthshaker(world, p, ab) {
    if (!has(p, 'thundermaul')) return;
    for (let i = 0; i < THUNDERMAUL_PILLARS; i++) {
      const a = world.rng.range(0, Math.PI * 2), r = world.rng.int(1, 2);
      const x = Math.round(p.x + Math.cos(a) * r), y = Math.round(p.y + Math.sin(a) * r);
      if (!Entities.walkable(world.floor, x, y)) continue;
      const h = Hits().computeHit(world, p, ab, { source: 'weapon', mult: THUNDERMAUL_MULT, element: 'light' }, 1, { roll: 0.5 });
      BD.sim.zones.ground(world, 'lightning_pillar', [[x, y]], { durMs: THUNDERMAUL_MS, faction: 'player', srcId: p.id, amount: h.total });
    }
  }
  /** after a player's ability lands (Gorefeast, Ironbrand) */
  function afterHits(world, p, ab, rank, landed) {
    if (ab.id === 'whirlwind' && has(p, 'gorefeast') && landed.length) {
      BD.sim.status.heal(world, p, Stats().statsOf(world, p).maxLife * GOREFEAST_HEAL_PCT * landed.length);
    }
    if (ab.id === 'charge' && has(p, 'ironbrand') && landed.length && p.skills.bash) {
      const bash = BD.sim.abilities.resolved(BD.data.skills.bash, BD.sim.abilities.rankOf(world, p, 'bash'), p);
      const ctx = BD.sim.effects.baseCtx(world, p, bash, BD.sim.abilities.rankOf(world, p, 'bash'), null);
      BD.sim.effects.melee(world, ctx, bash, landed[0].tgt.x, landed[0].tgt.y, landed[0].tgt);
    }
    if (CLASS_AFTER.length) for (const fn of CLASS_AFTER) fn(world, p, ab, rank, landed);
  }
  const CLASS_AFTER = [];

  BD.sim.powers = {
    active, has, procs, modifyAbility, registerMod, registerCooldown, registerCharges, cooldown, charges, statMods,
    noticeRange, onWarCry, onEarthshaker, afterHits, weaponNova, system, CLASS_AFTER,
  };
  BD.sim.world.addSystem('powers', system, 45);
})(globalThis.BD);
