// @ts-check
// Legendary powers and item procs (03 §4.3, §5). Powers change how skills behave
// (modifyAbility), add stats, or hook hits/kills/blocks. Everything stays on the one pipeline.
(function (BD) {
  'use strict';

  const ST = () => BD.sim.stats;
  const E = BD.sim.entities;
  const H = () => BD.sim.hits;
  const { cheb, within } = BD.core.util;

  /** set of equipped legendary ids (allies use their owner's) */
  function active(p) {
    if (!p) return EMPTY;
    const src = p.ownerEquip || p.equip;
    if (!src) return EMPTY;
    // cheap key: legendary ids of the 8 slots (no allocation when unchanged)
    let key = '';
    for (const s in src) { const it = src[s]; if (it && it.legendary) key += it.legendary + ','; }
    if (p._powKey === key) return p._pow;
    const set = new Set();
    for (const s in src) { const it = src[s]; if (it && it.legendary) set.add(it.legendary); }
    Object.defineProperty(p, '_pow', { value: set, writable: true, configurable: true, enumerable: false });
    Object.defineProperty(p, '_powKey', { value: key, writable: true, configurable: true, enumerable: false });
    return set;
  }
  const EMPTY = new Set();
  const has = (p, id) => active(p).has(id);

  /** procs on equipped items */
  function procs(p) {
    const out = [];
    for (const s in p.equip) { const it = p.equip[s]; if (it) { const d = BD.sim.items.derive(it); if (d.proc) out.push(d.proc); } }
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
    if (a.has('holy_mace')) { add('dmg_vs_undead_pct', 50, 'The Holy Mace'); add('dmg_vs_demon_pct', 50, 'The Holy Mace'); }
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
    if (a.has('tempters_cloak') && tgt.ai && (tgt.ai.state === 'idle' || tgt.ai.state === 'dormant')) k *= 3;
    if (a.has('crown_of_embers') && BD.sim.status.has(tgt, 'burning') && within(src.x, src.y, tgt.x, tgt.y, 3)) k *= 1.3;
    if (a.has('lantern_of_the_lost') && within(src.x, src.y, tgt.x, tgt.y, ST().statsOf(world, src).light_radius)) k *= 1.1;
    if (a.has('rimeheart') && BD.sim.status.has(tgt, 'frozen')) k *= 1.25;
    return k;
  });

  // ---------------- hits, kills, blocks ----------------
  BD.sim.damage.onHitHooks.push((world, src, tgt, pk, res) => {
    // dealt by the player
    if (src && src.kind === 'player' && tgt.kind === 'monster') {
      const s = ST().statsOf(world, src);
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
        BD.sim.status.apply(world, tgt, 'stunned', { durMs: 400, sourceId: src.id });
      }
      const pr = procs(src);
      if (pr.indexOf('proc_chain_on_hit') >= 0 && world.rng.chance(0.05) && pk.abilityId !== 'proc') procChain(world, src, tgt);
      if (pr.indexOf('proc_heal_on_crit') >= 0 && res.crit && (!src._healCritT || world.time - src._healCritT >= 250)) {
        Object.defineProperty(src, '_healCritT', { value: world.time, writable: true, configurable: true, enumerable: false });
        BD.sim.status.heal(world, src, s.maxLife * 0.01);
      }
      if (has(src, 'choirbreaker') && !pk.isDot) {
        src.hitCount = (src.hitCount || 0) + 1;
        if (src.hitCount % 10 === 0) {
          world.events.push({ type: 'power', id: 'choirbreaker', x: src.x, y: src.y });
          for (const e of E.enemiesOf(world, src.faction)) {
            if (!within(e.x, e.y, src.x, src.y, 2) || e.rank === 'boss' || e.rank === 'malgoth') continue;
            BD.sim.status.apply(world, e, 'stunned', { durMs: 1000, sourceId: src.id });
          }
        }
      }
    }
    // taken by the player
    if (tgt.kind === 'player') {
      const s = ST().statsOf(world, tgt);
      if (res.blocked && has(tgt, 'bishops_bulwark') && (!tgt._novaT || world.time - tgt._novaT >= 1000)) {
        Object.defineProperty(tgt, '_novaT', { value: world.time, writable: true, configurable: true, enumerable: false });
        weaponNova(world, tgt, 1, 0.6, 'holy');
      }
      if (tgt.hp > 0 && tgt.hp < s.maxLife * 0.3) {
        if (has(tgt, 'aegis_of_the_fallen') && !(tgt.cooldowns.aegis > 0)) {
          BD.sim.status.apply(world, tgt, 'aegis', { durMs: 4000, magnitude: 50 });
          tgt.cooldowns.aegis = 30000;
          world.events.push({ type: 'power', id: 'aegis', x: tgt.x, y: tgt.y });
        }
        if (procs(tgt).indexOf('proc_shield_low') >= 0 && !(tgt.cooldowns.procShield > 0)) {
          BD.sim.status.apply(world, tgt, 'shielded', { durMs: 6000, magnitude: s.maxLife * 0.15 });
          tgt.cooldowns.procShield = 30000;
        }
      }
    }
  });

  BD.sim.damage.onKillHooks.push((world, victim, killer) => {
    const p = world.player;
    if (!killer || (killer.kind !== 'player' && killer.ownerId !== p.id) || victim.faction !== 'monster') return;
    const s = ST().statsOf(world, p);
    if (s.life_on_kill) BD.sim.status.heal(world, p, s.life_on_kill);
    if (has(p, 'holy_mace')) BD.sim.status.heal(world, p, s.maxLife * 0.02);
    if (has(p, 'heart_of_the_barrow') && p.flask.charges === 0 && world.rng.chance(0.15)) {
      p.flask.charges = 1;
      world.events.push({ type: 'flask.charge', charges: 1, x: p.x, y: p.y });
    }
    const pr = procs(p);
    if (pr.indexOf('proc_nova_on_kill') >= 0 && world.rng.chance(0.1)) weaponNova(world, p, 1, 0.5, 'fire', victim.x, victim.y);
    if (pr.indexOf('proc_haste_on_kill') >= 0) BD.sim.status.apply(world, p, 'hasted', { durMs: 3000 });
  });

  BD.sim.items.evadeHooks.push((world, p, fx, fy) => {
    if (procs(p).indexOf('proc_frost_on_evade') < 0) return;
    BD.sim.zones.ground(world, 'frost_patch', [[fx, fy]], { durMs: 3000, faction: 'player', srcId: p.id });
  });

  /** a weapon-scaled nova around (x,y) (procs, Bishop's Bulwark) */
  function weaponNova(world, p, radius, mult, element, x, y) {
    const cx = x != null ? x : p.x, cy = y != null ? y : p.y;
    const tiles = BD.core.grid.shapeOffsets('circle', radius).map(([dx, dy]) => [cx + dx, cy + dy]);
    const ab = { id: 'proc', tags: ['aoe'] };
    const eff = { type: 'damage', source: 'weapon', mult, element: element === 'holy' ? null : element };
    world.events.push({ type: 'power.nova', x: cx, y: cy, school: element });
    for (const e of BD.sim.targeting.entitiesOnTiles(world, tiles, p.faction)) {
      const h = H().computeHit(world, p, ab, eff, 1, { rng: world.rng });
      BD.sim.damage.dealDamage(world, {
        srcId: p.id, tgtId: e.id, amounts: h.amounts, tags: ['aoe', 'proc'],
        canCrit: false, canDodge: false, canBlock: false, mult: 1, abilityId: 'proc',
      });
    }
  }
  function procChain(world, p, first) {
    let cur = first, from = p;
    const hit = new Set();
    for (let i = 0; i < 4 && cur; i++) {
      world.events.push({ type: 'chain', srcId: p.id, fromX: from.x, fromY: from.y, x: cur.x, y: cur.y, abilityId: 'proc' });
      const h = H().computeHit(world, p, { tags: [] }, { source: 'weapon', mult: 0.3, element: 'light' }, 1, { rng: world.rng });
      BD.sim.damage.dealDamage(world, {
        srcId: p.id, tgtId: cur.id, amounts: h.amounts, tags: ['proc'],
        canCrit: false, canDodge: false, canBlock: false, mult: 1, abilityId: 'proc',
      });
      hit.add(cur.id); from = cur;
      cur = BD.sim.targeting.nearestEnemy(world, from.x, from.y, 3, p.faction, { exclude: hit });
    }
  }

  // ---------------- per-step powers (Ossuary Seal) ----------------
  function system(world, dt) {
    const p = world.player;
    if (!p || p.dead || !has(p, 'ossuary_seal')) return;
    let n = 0;
    for (const c of world.floor.corpses) if (within(c.x, c.y, p.x, p.y, 3)) n++;
    n = Math.min(3, n);
    if (n) BD.sim.status.heal(world, p, (ST().statsOf(world, p).maxLife * 0.01 * n * dt) / 1000);
  }

  // ---------------- fighter hooks from skills_fighter ----------------
  function onWarCry() {}
  function onEarthshaker(world, p, ab) {
    if (!has(p, 'thundermaul')) return;
    for (let i = 0; i < 3; i++) {
      const a = world.rng.range(0, Math.PI * 2), r = world.rng.int(1, 2);
      const x = Math.round(p.x + Math.cos(a) * r), y = Math.round(p.y + Math.sin(a) * r);
      if (!E.walkable(world.floor, x, y)) continue;
      const h = H().computeHit(world, p, ab, { source: 'weapon', mult: 0.5, element: 'light' }, 1, { roll: 0.5 });
      BD.sim.zones.ground(world, 'lightning_pillar', [[x, y]], { durMs: 3000, faction: 'player', srcId: p.id, amount: h.total });
    }
  }
  /** after a player's ability lands (Gorefeast, Ironbrand) */
  function afterHits(world, p, ab, rank, landed) {
    if (ab.id === 'whirlwind' && has(p, 'gorefeast') && landed.length) {
      BD.sim.status.heal(world, p, ST().statsOf(world, p).maxLife * 0.015 * landed.length);
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
