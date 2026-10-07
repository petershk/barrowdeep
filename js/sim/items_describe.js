// @ts-check
// Item tooltip view models and comparisons (07 §6.4). Numbers come from derive() and statsOf()
// on a hypothetical player wearing the item — the UI contains no formulas.
(function (BD) {
  'use strict';

  const REG = BD.data.stats.defs;
  const fmtVal = (key, v) => {
    const d = REG[key];
    const n = Math.abs(v) >= 100 || Number.isInteger(v) ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
    if (!d) return n;
    if (key === 'momentum_thresh') return n;
    return (v > 0 ? '+' : '') + n + (d.fmt === 'pct' ? '%' : d.fmt === 'ms' ? ' ms' : '');
  };
  const CAT = { blade: 'Blade', axe: 'Axe', mace: 'Mace', dagger: 'Dagger', claw: 'Claw', staff: 'Staff', wand: 'Wand', bow: 'Bow', crossbow: 'Crossbow', javelin: 'Javelin', shield: 'Shield', orb: 'Orb', quiver: 'Quiver', armour: 'Body armour', helm: 'Helm', cloak: 'Cloak', amulet: 'Amulet', ring: 'Ring' };

  function lineFor(l) {
    if (l.special === 'skill_plus') { const ab = BD.data.skills[l.skill]; return { text: '+' + (l.value || 1) + ' to ' + (ab ? ab.name : l.skill), kind: 'hook' }; }
    if (l.proc) return { text: BD.data.affixes[l.affix].text, kind: 'proc' };
    const af = l.affix ? BD.data.affixes[l.affix] : null;
    const label = af && af.band === 'hook' ? af.text : REG[l.key] ? REG[l.key].label : l.key;
    if (l.key === 'all_attr') return { text: fmtVal('str', l.value) + ' to all attributes', kind: 'core' };
    return { text: fmtVal(l.key, l.value) + ' ' + label, kind: af && af.band === 'hook' ? 'hook' : l.implicit ? 'implicit' : 'core' };
  }

  /** @returns {any} tooltip view model */
  function view(world, p, item) {
    const d = BD.sim.items.derive(item);
    const b = BD.data.bases[item.base];
    const v = { name: d.name, rarity: item.rarity, type: '', base: [], lines: [], power: d.powerText || null, req: null, perm: null, value: d.value, ilvl: item.ilvl, enhance: item.enhance || 0 };
    v.type = (CAT[d.category] || b.slot) + (b.slot === 'weapon' ? (b.hands === 2 ? ', two-handed' : ', one-handed') + ' · ' + REG[b.wield].label : b.weight ? ' · ' + b.weight : '');
    if (d.dmg) v.base.push(d.dmg[0] + '–' + d.dmg[1] + ' damage · ' + (1000 / d.speedMs).toFixed(2) + ' attacks/s' + (d.range > 1 ? ' · range ' + d.range : ''));
    if (d.armor) v.base.push(d.armor + ' armour');
    if (d.block) v.base.push(d.block + '% block');
    for (const l of d.lines) v.lines.push(lineFor(l));
    if (d.req) {
      const s = BD.sim.stats.statsOf(world, p);
      v.req = { text: 'Requires ' + d.req.value + ' ' + REG[d.req.attr].label, met: s[d.req.attr] >= d.req.value };
    }
    if (!BD.sim.loot.usableBy(p.cls, b)) v.perm = BD.data.classes[p.cls].name + 's cannot use this';
    else if (d.cls && d.cls !== p.cls) v.perm = 'Its power belongs to the ' + BD.data.classes[d.cls].name;
    return v;
  }

  /** hypothetical player wearing `item` in `slot` */
  function wearing(world, p, item, slot) {
    const clone = Object.assign({}, p, { equip: Object.assign({}, p.equip), statsVersion: -1 - (p.statsVersion || 0) });
    clone.equip[slot] = item;
    const b = BD.data.bases[item.base];
    if (slot === 'weapon' && b.hands === 2) clone.equip.offhand = null;
    if (slot === 'offhand' && clone.equip.weapon && BD.data.bases[clone.equip.weapon.base].hands === 2) clone.equip.weapon = null;
    return BD.sim.stats.statsOf(world, clone);
  }
  function dps(s) {
    const w = s.weapon;
    const avg = ((w.dmg[0] + w.dmg[1]) / 2) * (1 + 0.03 * s.wieldValue) * (1 + s.dmg_pct / 100) + s.fire_add + s.cold_add + s.light_add + s.pois_add;
    return (avg * (1 + (s.critChance / 100) * (s.critMult - 1)) * 1000) / s.attackCycleMs;
  }
  function ehp(world, s) {
    const al = world.floor ? world.floor.al : 1;
    const A = s.armorTotal;
    const mit = Math.min(0.7, A / (A + 50 + 15 * al));
    const res = (s.res.fire + s.res.cold + s.res.light + s.res.pois) / 400;
    return s.maxLife / (1 - (mit * 0.6 + Math.max(0, res) * 0.4));
  }

  const COMPARE_KEYS = ['life', 'armorTotal', 'dmg_pct', 'crit', 'ias', 'res_fire', 'res_cold', 'res_light', 'res_pois', 'str', 'dex', 'mag', 'vit', 'move_pct', 'magic_find', 'gold_find', 'spell_pct', 'maxMana', 'blockChance', 'evasionTotal'];
  const LABELS = { armorTotal: 'Armour', maxMana: 'Mana', blockChance: 'Block chance', evasionTotal: 'Evasion' };
  /**
   * Compare against what's equipped in the target slot (both rings for rings).
   * @returns {{slot:string, rows:{label:string, delta:number}[], dps:number, ehp:number}[]}
   */
  function compare(world, p, item) {
    const b = BD.data.bases[item.base];
    const slots = b.slot === 'ring' ? ['ring1', 'ring2'] : [b.slot];
    const cur = BD.sim.stats.statsOf(world, p);
    const out = [];
    for (const slot of slots) {
      const s = wearing(world, p, item, slot);
      const rows = [];
      for (const k of COMPARE_KEYS) {
        const a = k === 'res_fire' || k === 'res_cold' || k === 'res_light' || k === 'res_pois' ? s.res[k.slice(4)] - cur.res[k.slice(4)] : (s[k] || 0) - (cur[k] || 0);
        if (Math.abs(a) >= 0.05) rows.push({ label: LABELS[k] || (REG[k] ? REG[k].label : k), delta: Math.round(a * 10) / 10 });
      }
      if (s.maxLife !== cur.maxLife) rows.unshift({ label: 'Maximum life', delta: s.maxLife - cur.maxLife });
      out.push({ slot, rows, dps: dps(s) - dps(cur), ehp: ehp(world, s) - ehp(world, cur), equipped: p.equip[slot] || null });
    }
    return out;
  }

  BD.sim.itemsDescribe = { view, compare, wearing, dps, ehp, fmtVal };
})(globalThis.BD);
