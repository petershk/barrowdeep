// @ts-check
// Item derivation: an item is stored as a reference plus rolls; every displayed number is
// derived here (03 §1), so balance patches reach existing items. Memoised by uid + enhance.
(function (BD) {
  'use strict';

  let dataVersion = 0;
  function invalidate() { dataVersion++; }

  const ItemBalance = BD.data.balance.items;   // item level scaling, enhancing, requirements, gold value

  const AFFIX_TABLE_TOP = 28;          // affix ranges are given at ilvl 1 and 28 (data/affixes.js `at28`)
  const FNV_OFFSET = 2166136261, FNV_PRIME = 16777619;   // FNV-1a hash
  const UID_FRAC_BUCKETS = 10007;
  const UID_RANDOM_RANGE = 2176782336; // 36^6: six base-36 digits

  const ilvlScale = (i) => 1 + ItemBalance.ilvlScaleStep * (i - 1);
  /** deterministic 0..1 from a uid (base armour roll without storing it) */
  function uidFrac(uid) {
    let h = FNV_OFFSET;
    for (let i = 0; i < uid.length; i++) {
      h ^= uid.charCodeAt(i);
      h = Math.imul(h, FNV_PRIME);
    }
    return ((h >>> 0) % UID_FRAC_BUCKETS) / (UID_FRAC_BUCKETS - 1);
  }

  /** affix value for roll r at ilvl i (03 §4) */
  function affixValue(affix, roll, ilvl, enhance) {
    const r1 = affix.range.at1, r28 = affix.range.at28;
    const t = Math.min(1, Math.max(0, (ilvl - 1) / (AFFIX_TABLE_TOP - 1)));
    let lo = r1[0] + (r28[0] - r1[0]) * t, hi = r1[1] + (r28[1] - r1[1]) * t;
    if (ilvl > AFFIX_TABLE_TOP) {
      const k = 1 + ItemBalance.affixGrowthPastTop * (ilvl - AFFIX_TABLE_TOP);
      lo *= k;
      hi *= k;
    }
    let v = lo + roll * (hi - lo);
    v *= 1 + ItemBalance.enhanceStep * (enhance || 0);
    const fmt = affix.fmt || (BD.data.stats.defs[affix.stat] ? BD.data.stats.defs[affix.stat].fmt : 'int');
    return fmt === 'dec' ? Math.round(v * 10) / 10 : Math.round(v);
  }

  function derive(item) {
    // memo lives on the item (non-enumerable, so saves never see it): uids are only unique per world
    const key = (item.enhance || 0) + ':' + dataVersion;
    if (item._dk === key) return item._d;
    /** @type {Record<string, any>} the derived item: base stats, rolled mods, tooltip lines */
    let d;
    const b = BD.data.bases[item.base];
    if (!b) throw new Error('unknown base ' + item.base);
    const enh = item.enhance || 0, ek = 1 + ItemBalance.enhanceStep * enh;
    const sc = ilvlScale(item.ilvl);
    d = {
      uid: item.uid, base: b.id, baseName: b.name, slot: b.slot, category: b.category, perm: b.perm,
      hands: b.hands || 0, weight: b.weight || null,
      wieldStat: b.wield || null, speedMs: b.speedMs || 0, range: b.range || 1, projectile: b.projectile || null, pierce: b.pierce || 0,
      knockback: b.knockback || 0, reachLine: b.reachLine || 0, fx: b.fx || null, rarity: item.rarity, ilvl: item.ilvl, enhance: enh,
      dmg: null, armor: 0, block: b.block || 0, mods: {}, lines: [], power: null, legendary: item.legendary || null,
      name: item.name || b.name, req: null,
    };
    if (b.dmg) d.dmg = [Math.max(1, Math.round(b.dmg[0] * sc * ek)), Math.max(1, Math.round(b.dmg[1] * sc * ek))];
    if (b.armor && b.armor[1] > 0) d.armor = Math.round((b.armor[0] + uidFrac(item.uid) * (b.armor[1] - b.armor[0])) * sc * ek);
    for (const k in b.implicit) {
      d.mods[k] = (d.mods[k] || 0) + b.implicit[k];
      d.lines.push({ key: k, value: b.implicit[k], implicit: true });
    }
    const Affixes = BD.data.affixes;
    for (const a of item.affixes || []) {
      const af = Affixes && Affixes[a.id];
      if (!af) continue;
      if (af.stat === 'skill_plus' || af.special) {
        const value = a.skill ? (a.n || 1) : 0;
        d.lines.push({ affix: a.id, special: af.special || 'skill_plus', value, skill: a.skill, band: af.band });
        if (a.skill) addMod(d, 'skill_plus_' + a.skill, a.n || 1);
        continue;
      }
      if (af.proc) {
        d.lines.push({ affix: a.id, proc: af.proc, band: af.band });
        d.proc = af.proc;
        continue;
      }
      const v = af.fixed != null ? af.fixed : affixValue(af, a.roll, item.ilvl, enh);
      addMod(d, af.stat, v);
      d.lines.push({ affix: a.id, key: af.stat, value: v, band: af.band, proc: af.proc || null });
      if (af.proc) d.proc = af.proc;
    }
    if (item.legendary && BD.data.legendaries && BD.data.legendaries[item.legendary]) {
      const L = BD.data.legendaries[item.legendary];
      d.power = L.power;
      d.powerText = L.powerText;
      d.name = L.name;
      d.cls = L.cls;
    }
    if (b.reqAttr && b.heft) d.req = { attr: b.reqAttr, value: Math.round(b.heft * (1 + ItemBalance.reqGrowth * item.ilvl)) };
    const rm = ItemBalance.valueRarityMult[item.rarity] || 1;
    const value = ItemBalance.valueBase * Math.pow(ItemBalance.valueGrowth, item.ilvl - 1) * rm;
    d.value = Math.round(value * (1 + ItemBalance.valuePerEnhance * enh));
    Object.defineProperty(item, '_d', { value: d, writable: true, configurable: true, enumerable: false });
    Object.defineProperty(item, '_dk', { value: key, writable: true, configurable: true, enumerable: false });
    return d;
  }
  function addMod(d, k, v) { d.mods[k] = (d.mods[k] || 0) + v; }

  /** onEvade hooks for item procs (frost on evade, etc.) */
  const evadeHooks = [];
  function onEvade(world, p, fromX, fromY) { for (const fn of evadeHooks) fn(world, p, fromX, fromY); }

  /** new uid: run-rng base36 + counter (unique across sessions) */
  function newUid(world) {
    world.run.uidCounter = (world.run.uidCounter || 0) + 1;
    return (Math.floor(world.lootRng.next() * UID_RANDOM_RANGE)).toString(36) + world.run.uidCounter.toString(36);
  }
  /** plain item record (no rolls) */
  function make(world, base, ilvl, rarity, affixes, extra) {
    return Object.assign({
      uid: newUid(world), base, ilvl: Math.max(1, ilvl || 1), rarity: rarity || 'common', affixes: affixes || [],
      legendary: null, enhance: 0, name: null,
    }, extra || {});
  }

  BD.sim.items = { derive, newUid, make, affixValue, ilvlScale, uidFrac, invalidate, onEvade, evadeHooks };
})(globalThis.BD);
