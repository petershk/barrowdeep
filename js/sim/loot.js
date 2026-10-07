// @ts-check
// Item generation (rarity, smart loot, affixes, names, legendaries) and drop tables (05 §6).
(function (BD) {
  'use strict';

  const Balance = BD.data.balance;
  const Affixes = () => BD.data.affixes;
  const Bases = () => BD.data.bases;
  const { dropCount } = BD.core.rng;
  const Grid = BD.core.grid;

  // rarity: base chances, raised by diminished magic find (eff = mf·K / (mf + K))
  const MF_DIMINISH_K = 250;
  const LEGENDARY_BASE = 0.015, RARE_BASE = 0.12, MAGIC_BASE = 0.4;
  const MAGIC_MF_DIV = 200;            // magic find counts half for magic items
  const RARITY_ORDER = ['common', 'magic', 'rare', 'legendary'];
  const SMART_LOOT_TARGET = 0.65;      // share of drops a class should be able to use
  // affixes
  const AFFIX_ROLL_GUARD = 24;         // max attempts while rolling an item's affixes
  const RARE_HOOK_CHANCE = 0.25;       // a rare's next affix is its class hook this often…
  const RARE_PROC_CHANCE = 0.15;       // …or its proc this often
  const LEGENDARY_OWN_CLASS_CHANCE = 0.5;
  // gold and magic find
  const MF_PER_ASCENSION = 10;
  const GOLD_BASE = 6, GOLD_GROWTH = 1.1;   // gold = base × growth^(al−1) × roll × k × gold find
  const GOLD_ROLL_LO = 0.6, GOLD_ROLL_HI = 1.4;
  const DROP_SEARCH_RADIUS = 4;
  // drop tables (05 §6.1)
  const LORE_DROP_MULT = 1.2;          // champions with a lore mod drop more
  const TRASH_DROPS = { item: 0.10, gold: 0.25, orb: 0.30, scroll: 0.05, portalScroll: 0.75 };
  const CHAMPION_DROPS = { gold: 2, orb: 0.5 };
  const ELITE_DROPS = { items: 2, gold: 6 };
  const BOSS_DROPS = {
    ilvlBonus: 2, items: 4, malgothItems: 6, legendaryChance: 0.25, rares: 1, malgothRares: 2,
    goldPiles: 4, gold: 40, malgothGold: 80, orbs: 2,
  };
  const CHEST_DROPS = { rare: 0.15, gold: 0.6, goldK: 4, orb: 0.3 };

  /** slot words a base satisfies for affix eligibility */
  function slotTags(b) {
    const t = [b.slot];
    if (b.slot === 'weapon' && b.wield === 'mag') t.push('magWeapon');
    if (b.slot === 'offhand') t.push(b.category === 'orb' || b.category === 'quiver' ? b.category : 'shield');
    return t;
  }
  function usableBy(cls, base) {
    const c = BD.data.classes[cls];
    return !!(c && c.uses.indexOf(base.perm) >= 0);
  }
  /** classes that can use a base (for class hooks and skill_plus) */
  function classesFor(base) { return Object.keys(BD.data.classes).filter((c) => usableBy(c, base)); }

  // ---- rarity ----
  function rollRarity(rng, mf, min) {
    const eff = (mf * MF_DIMINISH_K) / (mf + MF_DIMINISH_K);
    const leg = LEGENDARY_BASE * (1 + eff / 100);
    const rare = RARE_BASE * (1 + eff / 100);
    const magic = MAGIC_BASE * (1 + eff / MAGIC_MF_DIV);
    const r = rng.next();
    let rar = 'common';
    if (r < leg) rar = 'legendary';
    else if (r < leg + rare) rar = 'rare';
    else if (r < leg + rare + magic) rar = 'magic';
    if (min && RARITY_ORDER.indexOf(rar) < RARITY_ORDER.indexOf(min)) rar = min;
    return rar;
  }

  // ---- smart loot (05 §6.2): p = (0.65 − u) / (1 − u) ----
  const usableShare = new Map();
  function smartP(cls) {
    if (!usableShare.has(cls)) {
      const all = Object.values(Bases());
      const u = all.filter((b) => usableBy(cls, b)).length / all.length;
      usableShare.set(cls, Math.max(0, (SMART_LOOT_TARGET - u) / (1 - u)));
    }
    return usableShare.get(cls);
  }
  function pickBase(rng, cls, o) {
    let list = Object.values(Bases());
    if (o && o.slot) list = list.filter((b) => b.slot === o.slot || (o.slot === 'ring' && b.slot === 'ring'));
    if (cls && (o && o.usable || rng.chance(smartP(cls)))) {
      const u = list.filter((b) => usableBy(cls, b));
      if (u.length) list = u;
    }
    return rng.pick(list);
  }

  // ---- affixes ----
  function eligible(base, band, cls, taken) {
    const tags = slotTags(base);
    const can = classesFor(base);
    return Object.values(Affixes()).filter((a) => {
      if (a.band !== band || a.legendaryOnly) return false;
      if (taken.has(a.stat || a.id)) return false;
      if (band === 'core') return a.slots.some((s) => tags.indexOf(s) >= 0) && (!a.cls || can.indexOf(a.cls) >= 0);
      if (band === 'hook') return a.id === 'skill_plus' ? can.length > 0 : can.indexOf(a.cls) >= 0;
      return true;
    });
  }
  /** magic 1–2 affixes, rare 3–4; amulets get one more */
  function affixCount(rng, base, rarity) {
    const amulet = base.slot === 'amulet' ? 1 : 0;
    if (rarity === 'magic') return rng.int(1, 2 + amulet);
    if (rarity === 'rare') return rng.int(3 + amulet, 4 + amulet);
    return 0;
  }
  function rollAffixes(rng, base, rarity, cls) {
    const n = affixCount(rng, base, rarity);
    const out = [], taken = new Set();
    let hook = false, proc = false;
    for (let guard = 0; out.length < n && guard < AFFIX_ROLL_GUARD; guard++) {
      let band = 'core';
      if (rarity === 'rare' && !hook && rng.chance(RARE_HOOK_CHANCE)) band = 'hook';
      else if (rarity === 'rare' && !proc && rng.chance(RARE_PROC_CHANCE)) band = 'proc';
      let pool = eligible(base, band, cls, taken);
      if (!pool.length) {
        band = 'core';
        pool = eligible(base, 'core', cls, taken);
      }
      if (!pool.length) break;
      const a = rng.pick(pool);
      const entry = { id: a.id, roll: Math.round(rng.next() * 1000) / 1000 };
      if (a.id === 'skill_plus') {
        const can = classesFor(base);
        const pick = rng.pick(can);
        const skills = Object.values(BD.data.skills || {}).filter((s) => s.cls === pick && !s.keystone);
        if (!skills.length) continue;
        entry.skill = rng.pick(skills).id;
        entry.n = 1;
      }
      out.push(entry);
      taken.add(a.stat || a.id);
      if (band === 'hook') hook = true;
      if (band === 'proc') proc = true;
    }
    return out;
  }

  function magicName(base, affixes) {
    let pre = null, suf = null;
    for (const a of affixes) {
      const d = Affixes()[a.id];
      if (!d || !d.name) continue;
      if (d.name[0] === 'prefix' && !pre) pre = d.name[1];
      if (d.name[0] === 'suffix' && !suf) suf = d.name[1];
    }
    return [pre, base.name, suf].filter((w) => w).join(' ');
  }
  function rareName(rng, base) {
    const RareNames = BD.data.rareNames;
    return rng.pick(RareNames.PRE) + rng.pick(RareNames.SUF) + ' ' + base.name;
  }

  /** legendary pool unlocked for this account */
  function legendaryPool(world) {
    const lvl = (world.run.flags && world.run.flags.ledger) || 0;
    const pools = BD.data.legendaryPools[lvl === 0 ? 'base' : 'ledger' + lvl];
    return Object.values(BD.data.legendaries).filter((l) => pools.indexOf(l.pool) >= 0);
  }
  function makeLegendary(world, rng, ilvl, cls, forcedId) {
    let L = forcedId ? BD.data.legendaries[forcedId] : null;
    if (!L) {
      const pool = legendaryPool(world);
      const mine = pool.filter((l) => l.cls === cls);
      const rest = pool.filter((l) => l.cls !== cls);
      const fromMine = rng.chance(LEGENDARY_OWN_CLASS_CHANCE) && mine.length;
      const others = rest.length ? rest : pool;
      L = fromMine ? rng.pick(mine) : rng.pick(others);
    }
    const affixes = L.affixes.map((id) => ({ id, roll: Math.round(rng.next() * 1000) / 1000 }));
    const item = BD.sim.items.make(world, L.base, ilvl, 'legendary', affixes, { legendary: L.id, name: L.name });
    return item;
  }

  /**
   * Roll one equipment item.
   * @param {{ilvl:number, cls?:string, min?:string, rarity?:string, slot?:string, usable?:boolean, mf?:number}} o
   */
  function rollItem(world, rng, o) {
    const cls = o.cls || world.player.cls;
    const rarity = o.rarity || rollRarity(rng, o.mf != null ? o.mf : mfOf(world), o.min);
    if (rarity === 'legendary' && !o.slot) return makeLegendary(world, rng, o.ilvl, cls);
    if (rarity === 'legendary' && o.slot) {
      const pool = legendaryPool(world).filter((l) => Bases()[l.base].slot === o.slot);
      if (pool.length) return makeLegendary(world, rng, o.ilvl, cls, rng.pick(pool).id);
    }
    const base = pickBase(rng, cls, o);
    const rar = rarity === 'legendary' ? 'rare' : rarity;
    const affixes = rollAffixes(rng, base, rar, cls);
    const item = BD.sim.items.make(world, base.id, o.ilvl, rar, affixes);
    if (rar === 'magic') item.name = magicName(base, affixes);
    else if (rar === 'rare') item.name = rareName(rng, base);
    return item;
  }

  function mfOf(world) {
    const s = BD.sim.stats.statsOf(world, world.player);
    const diff = BD.data.difficulties[world.run.difficulty];
    return s.magic_find + diff.mf + MF_PER_ASCENSION * (world.run.ascension || 0);
  }
  function goldOf(world, al, k) {
    const s = BD.sim.stats.statsOf(world, world.player);
    const roll = world.lootRng.range(GOLD_ROLL_LO, GOLD_ROLL_HI);
    return Math.max(1, Math.round(GOLD_BASE * Math.pow(GOLD_GROWTH, al - 1) * roll * k * (1 + s.gold_find / 100)));
  }

  // ---- drops ----
  /** place a ground drop near (x,y) on a free walkable tile (spreads piles) */
  function dropAt(world, x, y, g) {
    const f = world.floor;
    const used = new Set(f.items.map((i) => Grid.idx(f, i.x, i.y)));
    const Entities = BD.sim.entities;
    const spot = Entities.nearestFree(f, x, y, DROP_SEARCH_RADIUS, (tx, ty) => !used.has(Grid.idx(f, tx, ty)))
      || Entities.nearestFree(f, x, y, DROP_SEARCH_RADIUS) || { x, y };
    const gi = Object.assign({ uid: g.item ? g.item.uid : BD.sim.items.newUid(world), x: spot.x, y: spot.y }, g);
    f.items.push(gi);
    world.events.push({
      type: 'loot.drop', uid: gi.uid, kind: gi.kind, rarity: gi.item ? gi.item.rarity : null,
      x: gi.x, y: gi.y, fromX: x, fromY: y, name: gi.item ? BD.sim.items.derive(gi.item).name : null,
    });
    return gi;
  }

  /** drop table per source (05 §6.1) */
  function onKill(world, e) {
    if (e.noLoot || e.faction !== 'monster') return;
    const rng = world.lootRng;
    const al = e.al || world.floor.al;
    const rank = e.rank;
    const elite = rank === 'unique' || rank === 'keeper';
    const loreMult = (e.mods && e.mods.some((m) => BD.data.championMods[m] && BD.data.championMods[m].lore)) ? LORE_DROP_MULT : 1;
    const ilvl = al + (rank === 'champion' || elite ? 1 : 0);
    const orbK = 1 + (BD.sim.stats.statsOf(world, world.player).orb_drop_pct || 0) / 100;
    if (rank === 'normal' || rank === 'minion') {
      if (rng.chance(TRASH_DROPS.item)) dropAt(world, e.x, e.y, { kind: 'item', item: rollItem(world, rng, { ilvl }) });
      if (rng.chance(TRASH_DROPS.gold)) dropAt(world, e.x, e.y, { kind: 'gold', amount: goldOf(world, al, 1) });
      if (rng.chance(TRASH_DROPS.orb * orbK)) dropAt(world, e.x, e.y, { kind: 'orb' });
      if (rng.chance(TRASH_DROPS.scroll)) {
        dropAt(world, e.x, e.y, { kind: 'scroll', scroll: rng.chance(TRASH_DROPS.portalScroll) ? 'portal' : 'reveal' });
      }
    } else if (rank === 'champion') {
      for (let i = 0; i < dropCount(rng, loreMult); i++) {
        dropAt(world, e.x, e.y, { kind: 'item', item: rollItem(world, rng, { ilvl, min: 'magic' }) });
      }
      dropAt(world, e.x, e.y, { kind: 'gold', amount: goldOf(world, al, CHAMPION_DROPS.gold) });
      if (rng.chance(CHAMPION_DROPS.orb * orbK)) dropAt(world, e.x, e.y, { kind: 'orb' });
    } else if (elite) {
      const n = dropCount(rng, ELITE_DROPS.items * loreMult);
      for (let i = 0; i < n; i++) {
        dropAt(world, e.x, e.y, { kind: 'item', item: rollItem(world, rng, { ilvl, min: i === 0 ? 'rare' : 'magic' }) });
      }
      dropAt(world, e.x, e.y, { kind: 'gold', amount: goldOf(world, al, ELITE_DROPS.gold) });
      dropAt(world, e.x, e.y, { kind: 'orb' });
    }
  }

  /** boss loot fountain (act boss / Malgoth) */
  function bossDrop(world, e, isMalgoth) {
    const drops = BOSS_DROPS;
    const rng = world.lootRng, al = e.al || world.floor.al, ilvl = al + drops.ilvlBonus;
    const r = world.run;
    const n = isMalgoth ? drops.malgothItems : drops.items;
    const rares = isMalgoth ? drops.malgothRares : drops.rares;   // the first non-legendary items are at least rare
    const first = !r.bossesKilled.includes(e.def);
    let legendary = isMalgoth || first || rng.chance(drops.legendaryChance);
    for (let i = 0; i < n; i++) {
      let item;
      if (legendary) {
        item = rollItem(world, rng, { ilvl, rarity: 'legendary' });
        legendary = false;
      } else item = rollItem(world, rng, { ilvl, min: i < rares ? 'rare' : 'magic' });
      dropAt(world, e.x, e.y, { kind: 'item', item });
    }
    const goldK = isMalgoth ? drops.malgothGold : drops.gold;
    for (let i = 0; i < drops.goldPiles; i++) {
      dropAt(world, e.x, e.y, { kind: 'gold', amount: Math.round(goldOf(world, al, goldK) / drops.goldPiles) });
    }
    if (!isMalgoth) for (let i = 0; i < drops.orbs; i++) dropAt(world, e.x, e.y, { kind: 'orb' });
    world.events.push({ type: 'loot.fountain', x: e.x, y: e.y });
  }

  function chestDrop(world, o) {
    const rng = world.lootRng, al = world.floor.al;
    const n = rng.int(1, 2);
    const rareIdx = rng.chance(CHEST_DROPS.rare) ? 0 : -1;
    for (let i = 0; i < n; i++) {
      dropAt(world, o.x, o.y, { kind: 'item', item: rollItem(world, rng, { ilvl: al, min: i === rareIdx ? 'rare' : null }) });
    }
    if (rng.chance(CHEST_DROPS.gold)) dropAt(world, o.x, o.y, { kind: 'gold', amount: goldOf(world, al, CHEST_DROPS.goldK) });
    if (rng.chance(CHEST_DROPS.orb)) dropAt(world, o.x, o.y, { kind: 'orb' });
  }

  BD.sim.damage.onKillHooks.push((world, e) => {
    if (!BD.sim.entities.isBoss(e)) onKill(world, e);
  });

  BD.sim.loot = {
    slotTags, usableBy, classesFor, rollRarity, smartP, pickBase, rollAffixes, rollItem, makeLegendary, legendaryPool,
    dropAt, onKill, bossDrop, chestDrop, goldOf, mfOf, magicName,
  };
})(globalThis.BD);
