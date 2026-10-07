// @ts-check
// Legendary powers and item procs (03 §4.3, §5). Powers change how skills behave
// (modifyAbility), add stats, or hook hits/kills/blocks. Everything stays on the one pipeline.
(function (BD) {
  'use strict';

  const Stats = () => BD.sim.stats;
  const Entities = BD.sim.entities;
  const Hits = () => BD.sim.hits;
  const { cheb, within } = BD.core.util;

  const Combat = BD.data.balance.combat;
  // the numbers each power / proc uses live on its data entry (data/legendaries.js, data/affixes.js)
  const legParams = (id) => BD.data.legendaries[id].params;
  const procParams = (id) => BD.data.affixes[id].params;

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
    const unaware = tgt.ai && (tgt.ai.state === 'idle' || tgt.ai.state === 'dormant');
    if (a.has('tempters_cloak') && unaware) k *= legParams('tempters_cloak').unawareMult;
    const embers = legParams('crown_of_embers');
    if (a.has('crown_of_embers') && BD.sim.status.has(tgt, 'burning') && within(src.x, src.y, tgt.x, tgt.y, embers.range)) k *= embers.mult;
    const inLight = () => within(src.x, src.y, tgt.x, tgt.y, Stats().statsOf(world, src).light_radius);
    if (a.has('lantern_of_the_lost') && inLight()) k *= legParams('lantern_of_the_lost').mult;
    if (a.has('rimeheart') && BD.sim.status.has(tgt, 'frozen')) k *= legParams('rimeheart').mult;
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
        BD.sim.status.apply(world, tgt, 'stunned', { durMs: Combat.gearStunMs, sourceId: src.id });
      }
      const pr = procs(src);
      if (pr.indexOf('proc_chain_on_hit') >= 0 && world.rng.chance(procParams('proc_chain_on_hit').chance) && pk.abilityId !== 'proc') {
        procChain(world, src, tgt);
      }
      const critHeal = procParams('proc_heal_on_crit');
      if (pr.indexOf('proc_heal_on_crit') >= 0 && res.crit && (!src._healCritT || world.time - src._healCritT >= critHeal.icdMs)) {
        Object.defineProperty(src, '_healCritT', { value: world.time, writable: true, configurable: true, enumerable: false });
        BD.sim.status.heal(world, src, s.maxLife * critHeal.healPct);
      }
      if (has(src, 'choirbreaker') && !pk.isDot) {
        const choir = legParams('choirbreaker');
        src.hitCount = (src.hitCount || 0) + 1;
        if (src.hitCount % choir.every === 0) {
          world.events.push({ type: 'power', id: 'choirbreaker', x: src.x, y: src.y });
          for (const e of Entities.enemiesOf(world, src.faction)) {
            if (!within(e.x, e.y, src.x, src.y, choir.range) || e.rank === 'boss' || e.rank === 'malgoth') continue;
            BD.sim.status.apply(world, e, 'stunned', { durMs: choir.stunMs, sourceId: src.id });
          }
        }
      }
    }
    // taken by the player
    if (tgt.kind === 'player') {
      const s = Stats().statsOf(world, tgt);
      const bulwark = legParams('bishops_bulwark');
      if (res.blocked && has(tgt, 'bishops_bulwark') && (!tgt._novaT || world.time - tgt._novaT >= bulwark.icdMs)) {
        Object.defineProperty(tgt, '_novaT', { value: world.time, writable: true, configurable: true, enumerable: false });
        weaponNova(world, tgt, 1, bulwark.novaMult, 'holy');
      }
      if (tgt.hp > 0 && tgt.hp < s.maxLife * Combat.lowLifeFrac) {
        if (has(tgt, 'aegis_of_the_fallen') && !(tgt.cooldowns.aegis > 0)) {
          const aegis = legParams('aegis_of_the_fallen');
          BD.sim.status.apply(world, tgt, 'aegis', { durMs: aegis.durMs, magnitude: aegis.drPct });
          tgt.cooldowns.aegis = aegis.cdMs;
          world.events.push({ type: 'power', id: 'aegis', x: tgt.x, y: tgt.y });
        }
        if (procs(tgt).indexOf('proc_shield_low') >= 0 && !(tgt.cooldowns.procShield > 0)) {
          const shield = procParams('proc_shield_low');
          BD.sim.status.apply(world, tgt, 'shielded', { durMs: shield.durMs, magnitude: s.maxLife * shield.shieldPct });
          tgt.cooldowns.procShield = shield.cdMs;
        }
      }
    }
  });

  BD.sim.damage.onKillHooks.push((world, victim, killer) => {
    const p = world.player;
    if (!killer || (killer.kind !== 'player' && killer.ownerId !== p.id) || victim.faction !== 'monster') return;
    const s = Stats().statsOf(world, p);
    if (s.life_on_kill) BD.sim.status.heal(world, p, s.life_on_kill);
    if (has(p, 'holy_mace')) BD.sim.status.heal(world, p, s.maxLife * legParams('holy_mace').healPct);
    if (has(p, 'heart_of_the_barrow') && p.flask.charges === 0 && world.rng.chance(legParams('heart_of_the_barrow').chance)) {
      p.flask.charges = 1;
      world.events.push({ type: 'flask.charge', charges: 1, x: p.x, y: p.y });
    }
    const pr = procs(p);
    const nova = procParams('proc_nova_on_kill');
    if (pr.indexOf('proc_nova_on_kill') >= 0 && world.rng.chance(nova.chance)) {
      weaponNova(world, p, 1, nova.weaponMult, 'fire', victim.x, victim.y);
    }
    if (pr.indexOf('proc_haste_on_kill') >= 0) BD.sim.status.apply(world, p, 'hasted', { durMs: procParams('proc_haste_on_kill').durMs });
  });

  BD.sim.items.evadeHooks.push((world, p, fx, fy) => {
    if (procs(p).indexOf('proc_frost_on_evade') < 0) return;
    const durMs = procParams('proc_frost_on_evade').durMs;
    BD.sim.zones.ground(world, 'frost_patch', [[fx, fy]], { durMs, faction: 'player', srcId: p.id });
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
    const chain = procParams('proc_chain_on_hit');
    for (let i = 0; i < chain.jumps && cur; i++) {
      world.events.push({ type: 'chain', srcId: p.id, fromX: from.x, fromY: from.y, x: cur.x, y: cur.y, abilityId: 'proc' });
      const eff = { source: 'weapon', mult: chain.weaponMult, element: 'light' };
      const h = Hits().computeHit(world, p, { tags: [] }, eff, 1, { rng: world.rng });
      BD.sim.damage.dealDamage(world, {
        srcId: p.id, tgtId: cur.id, amounts: h.amounts, tags: ['proc'],
        canCrit: false, canDodge: false, canBlock: false, mult: 1, abilityId: 'proc',
      });
      hit.add(cur.id);
      from = cur;
      cur = BD.sim.targeting.nearestEnemy(world, from.x, from.y, chain.jumpRange, p.faction, { exclude: hit });
    }
  }

  // ---------------- per-step powers (Ossuary Seal) ----------------
  function system(world, dt) {
    const p = world.player;
    if (!p || p.dead || !has(p, 'ossuary_seal')) return;
    const seal = legParams('ossuary_seal');
    let n = 0;
    for (const c of world.floor.corpses) if (within(c.x, c.y, p.x, p.y, seal.range)) n++;
    n = Math.min(seal.maxCorpses, n);
    if (n) BD.sim.status.heal(world, p, (Stats().statsOf(world, p).maxLife * seal.healPct * n * dt) / 1000);
  }

  // ---------------- fighter hooks from skills_fighter ----------------
  function onWarCry() {}
  function onEarthshaker(world, p, ab) {
    if (!has(p, 'thundermaul')) return;
    const maul = legParams('thundermaul');
    for (let i = 0; i < maul.pillars; i++) {
      const a = world.rng.range(0, Math.PI * 2), r = world.rng.int(1, 2);
      const x = Math.round(p.x + Math.cos(a) * r), y = Math.round(p.y + Math.sin(a) * r);
      if (!Entities.walkable(world.floor, x, y)) continue;
      const h = Hits().computeHit(world, p, ab, { source: 'weapon', mult: maul.mult, element: 'light' }, 1, { roll: 0.5 });
      BD.sim.zones.ground(world, 'lightning_pillar', [[x, y]], { durMs: maul.durMs, faction: 'player', srcId: p.id, amount: h.total });
    }
  }
  /** after a player's ability lands (Gorefeast, Ironbrand) */
  function afterHits(world, p, ab, rank, landed) {
    if (ab.id === 'whirlwind' && has(p, 'gorefeast') && landed.length) {
      BD.sim.status.heal(world, p, Stats().statsOf(world, p).maxLife * legParams('gorefeast').healPct * landed.length);
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
