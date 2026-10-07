// @ts-check
// Item generation (rarity, smart loot, affixes, names, legendaries) and drop tables (05 §6).
(function (BD) {
  'use strict';

  const Balance = BD.data.balance;
  const Affixes = () => BD.data.affixes;
  const Bases = () => BD.data.bases;
  const { dropCount } = BD.core.rng;

  /** slot words a base satisfies for affix eligibility */
  function slotTags(b) {
    const t = [b.slot];
    if (b.slot === 'weapon' && b.wield === 'mag') t.push('magWeapon');
    if (b.slot === 'offhand') t.push(b.category === 'orb' ? 'orb' : b.category === 'quiver' ? 'quiver' : 'shield');
    return t;
  }
  function usableBy(cls, base) { const c = BD.data.classes[cls]; return !!(c && c.uses.indexOf(base.perm) >= 0); }
  /** classes that can use a base (for class hooks and skill_plus) */
  function classesFor(base) { return Object.keys(BD.data.classes).filter((c) => usableBy(c, base)); }

  // ---- rarity ----
  function rollRarity(rng, mf, min) {
    const eff = (mf * 250) / (mf + 250);
    const L = 0.015 * (1 + eff / 100), R = 0.12 * (1 + eff / 100), M = 0.4 * (1 + eff / 200);
    const r = rng.next();
    let rar = r < L ? 'legendary' : r < L + R ? 'rare' : r < L + R + M ? 'magic' : 'common';
    const order = ['common', 'magic', 'rare', 'legendary'];
    if (min && order.indexOf(rar) < order.indexOf(min)) rar = min;
    return rar;
  }

  // ---- smart loot (05 §6.2): p = (0.65 − u) / (1 − u) ----
  const usableShare = new Map();
  function smartP(cls) {
    if (!usableShare.has(cls)) {
      const all = Object.values(Bases());
      const u = all.filter((b) => usableBy(cls, b)).length / all.length;
      usableShare.set(cls, Math.max(0, (0.65 - u) / (1 - u)));
    }
    return usableShare.get(cls);
  }
  function pickBase(rng, cls, o) {
    let list = Object.values(Bases());
    if (o && o.slot) list = list.filter((b) => b.slot === o.slot || (o.slot === 'ring' && b.slot === 'ring'));
    if (cls && (o && o.usable || rng.chance(smartP(cls)))) { const u = list.filter((b) => usableBy(cls, b)); if (u.length) list = u; }
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
  function rollAffixes(rng, base, rarity, cls) {
    const amulet = base.slot === 'amulet' ? 1 : 0;
    const n = rarity === 'magic' ? rng.int(1, 2 + amulet) : rarity === 'rare' ? rng.int(3 + amulet, 4 + amulet) : 0;
    const out = [], taken = new Set();
    let hook = false, proc = false;
    for (let guard = 0; out.length < n && guard < 24; guard++) {
      let band = 'core';
      if (rarity === 'rare' && !hook && rng.chance(0.25)) band = 'hook';
      else if (rarity === 'rare' && !proc && rng.chance(0.15)) band = 'proc';
      let pool = eligible(base, band, cls, taken);
      if (!pool.length) { band = 'core'; pool = eligible(base, 'core', cls, taken); }
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
    return (pre ? pre + ' ' : '') + base.name + (suf ? ' ' + suf : '');
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
      L = rng.chance(0.5) && mine.length ? rng.pick(mine) : rng.pick(rest.length ? rest : pool);
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
    return s.magic_find + diff.mf + 10 * (world.run.ascension || 0);
  }
  function goldOf(world, al, k) {
    const s = BD.sim.stats.statsOf(world, world.player);
    return Math.max(1, Math.round(6 * Math.pow(1.1, al - 1) * world.lootRng.range(0.6, 1.4) * k * (1 + s.gold_find / 100)));
  }

  // ---- drops ----
  /** place a ground drop near (x,y) on a free walkable tile (spreads piles) */
  function dropAt(world, x, y, g) {
    const f = world.floor;
    const used = new Set(f.items.map((i) => i.y * f.w + i.x));
    const Entities = BD.sim.entities;
    const spot = Entities.nearestFree(f, x, y, 4, (tx, ty) => !used.has(ty * f.w + tx)) || Entities.nearestFree(f, x, y, 4) || { x, y };
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
    const loreMult = (e.mods && e.mods.some((m) => BD.data.championMods[m] && BD.data.championMods[m].lore)) ? 1.2 : 1;
    const ilvl = al + (rank === 'champion' || elite ? 1 : 0);
    const orbK = 1 + (BD.sim.stats.statsOf(world, world.player).orb_drop_pct || 0) / 100;
    if (rank === 'normal' || rank === 'minion') {
      if (rng.chance(0.10)) dropAt(world, e.x, e.y, { kind: 'item', item: rollItem(world, rng, { ilvl }) });
      if (rng.chance(0.25)) dropAt(world, e.x, e.y, { kind: 'gold', amount: goldOf(world, al, 1) });
      if (rng.chance(0.30 * orbK)) dropAt(world, e.x, e.y, { kind: 'orb' });
      if (rng.chance(0.05)) dropAt(world, e.x, e.y, { kind: 'scroll', scroll: rng.chance(0.75) ? 'portal' : 'reveal' });
    } else if (rank === 'champion') {
      for (let i = 0; i < dropCount(rng, loreMult); i++) {
        dropAt(world, e.x, e.y, { kind: 'item', item: rollItem(world, rng, { ilvl, min: 'magic' }) });
      }
      dropAt(world, e.x, e.y, { kind: 'gold', amount: goldOf(world, al, 2) });
      if (rng.chance(0.5 * orbK)) dropAt(world, e.x, e.y, { kind: 'orb' });
    } else if (elite) {
      const n = dropCount(rng, 2 * loreMult);
      for (let i = 0; i < n; i++) {
        dropAt(world, e.x, e.y, { kind: 'item', item: rollItem(world, rng, { ilvl, min: i === 0 ? 'rare' : 'magic' }) });
      }
      dropAt(world, e.x, e.y, { kind: 'gold', amount: goldOf(world, al, 6) });
      dropAt(world, e.x, e.y, { kind: 'orb' });
    }
  }

  /** boss loot fountain (act boss / Malgoth) */
  function bossDrop(world, e, isMalgoth) {
    const rng = world.lootRng, al = e.al || world.floor.al, ilvl = al + 2;
    const r = world.run;
    const n = isMalgoth ? 6 : 4;
    const first = !r.bossesKilled.includes(e.def);
    let legendary = isMalgoth || first || rng.chance(0.25);
    for (let i = 0; i < n; i++) {
      let item;
      if (legendary) { item = rollItem(world, rng, { ilvl, rarity: 'legendary' }); legendary = false; }
      else item = rollItem(world, rng, { ilvl, min: i < (isMalgoth ? 2 : 1) ? 'rare' : 'magic' });
      dropAt(world, e.x, e.y, { kind: 'item', item });
    }
    for (let i = 0; i < 4; i++) dropAt(world, e.x, e.y, { kind: 'gold', amount: Math.round(goldOf(world, al, isMalgoth ? 80 : 40) / 4) });
    if (!isMalgoth) { dropAt(world, e.x, e.y, { kind: 'orb' }); dropAt(world, e.x, e.y, { kind: 'orb' }); }
    world.events.push({ type: 'loot.fountain', x: e.x, y: e.y });
  }

  function chestDrop(world, o) {
    const rng = world.lootRng, al = world.floor.al;
    const n = rng.int(1, 2);
    const rareIdx = rng.chance(0.15) ? 0 : -1;
    for (let i = 0; i < n; i++) {
      dropAt(world, o.x, o.y, { kind: 'item', item: rollItem(world, rng, { ilvl: al, min: i === rareIdx ? 'rare' : null }) });
    }
    if (rng.chance(0.6)) dropAt(world, o.x, o.y, { kind: 'gold', amount: goldOf(world, al, 4) });
    if (rng.chance(0.3)) dropAt(world, o.x, o.y, { kind: 'orb' });
  }

  BD.sim.damage.onKillHooks.push((world, e) => { if (!BD.sim.entities.isBoss(e)) onKill(world, e); });

  BD.sim.loot = {
    slotTags, usableBy, classesFor, rollRarity, smartP, pickBase, rollAffixes, rollItem, makeLegendary, legendaryPool,
    dropAt, onKill, bossDrop, chestDrop, goldOf, mfOf, magicName,
  };
})(globalThis.BD);
