// @ts-check
// Town economy (03 §8, 05 §6.3): Smith stock / reroll / buy / sell / buyback / enhance / reforge,
// Curio gamble, Temple scrolls / blessings / respec / flask upgrade, Home rest and the stash.
(function (BD) {
  'use strict';

  const EconomyData = () => BD.data.economy;
  const Commands = BD.sim.commands;
  const Interact = () => BD.sim.interact;

  const EconomyBalance = BD.data.balance.economy;
  const LAST_ACT = BD.data.floors.LAST_ACT;   // act-scaled prices stop rising after the last act

  function townState(world) {
    const r = world.run;
    if (!r.town) {
      r.town = {
        stock: [], stockAct: 0, rerolls: 0, freeReroll: false,
        buyback: [], blessOffer: [], flaskUpgradedAct: 0, respecs: 0,
      };
    }
    return r.town;
  }
  const al = (world) => world.run.townAl || 1;

  function price(item) { return BD.sim.items.derive(item).value; }
  function sellPrice(item) { return Math.max(1, Math.floor(price(item) / EconomyData().sellDiv)); }

  /** costs (view models read these through describe-style helpers, never re-derive them) */
  function costs(world) {
    const r = world.run, t = townState(world);
    return {
      reroll: t.freeReroll ? 0 : EconomyData().reroll(al(world), t.rerolls),
      reforge: EconomyData().reforge(al(world)),
      gamble: EconomyData().gamble(al(world)),
      blessing: EconomyData().blessing(al(world)),
      flask: EconomyData().flaskUpgrade(Math.min(LAST_ACT, r.act)),
      respec: EconomyData().respec(world.player.level, t.respecs),
      portal: EconomyData().portalScroll(Math.min(LAST_ACT, r.act)),
    };
  }
  function enhanceCost(world, item) { return EconomyData().enhance(al(world), (item.enhance || 0) + 1); }

  function pay(world, n) {
    const p = world.player;
    if (p.gold < n) {
      Interact().deny(world, 'not_enough_gold');
      return false;
    }
    p.gold -= n;
    return true;
  }

  // ---------------- town arrival ----------------
  function onTownArrive(world) {
    const r = world.run, t = townState(world);
    r.blessing = null;
    BD.sim.stats.bump(world.player);
    t.rerolls = 0;
    t.buyback = [];
    t.freeReroll = !!r.flags.merchantsFavor;
    t.blessOffer = world.lootRng.shuffle(Object.keys(BD.data.blessings)).slice(0, EconomyBalance.blessingsOffered);
    if (t.stockAct !== r.act || !t.stock.length) rollStock(world);
  }

  function rollStock(world) {
    const t = townState(world), rng = world.lootRng, p = world.player;
    const stock = [];
    const n = EconomyData().smithStock;
    let rareDone = !rng.chance(EconomyData().smithRareChance);
    for (let i = 0; i < n; i++) {
      const usable = i < EconomyData().smithUsable;
      // the first slot is always magic; the last is rare if the rare roll came up
      let rarity = 'magic';
      if (i > 0 && !rng.chance(EconomyBalance.smithMagicChance)) rarity = 'common';
      if (!rareDone && i === n - 1) {
        rarity = 'rare';
        rareDone = true;
      }
      stock.push(BD.sim.loot.rollItem(world, rng, { ilvl: al(world), rarity, cls: p.cls, usable }));
    }
    t.stock = stock;
    t.stockAct = world.run.act;
  }

  // ---------------- commands ----------------
  Commands.register('Buy', (world, c) => {
    const t = townState(world), p = world.player;
    const list = c.from === 'buyback' ? t.buyback : t.stock;
    const it = list[c.idx];
    if (!it) return false;
    const cost = c.from === 'buyback' ? sellPrice(it) : price(it);
    if (packFull(world)) return false;
    if (!pay(world, cost)) return false;
    list.splice(c.idx, 1);
    p.pack.push(it);
    world.events.push({ type: 'shop.buy', uid: it.uid, cost });
    return true;
  }, { ui: true });
  Commands.register('Sell', (world, c) => {
    const t = townState(world), p = world.player;
    const i = p.pack.findIndex((x) => x.uid === c.uid);
    if (i < 0 || p.pack[i].locked) return false;
    const [it] = p.pack.splice(i, 1);
    const gain = sellPrice(it);
    p.gold += gain;
    t.buyback.unshift(it);
    if (t.buyback.length > EconomyData().buyback) t.buyback.pop();
    world.events.push({ type: 'shop.sell', uid: it.uid, gain });
    return true;
  }, { ui: true });
  Commands.register('Reroll', (world) => {
    const t = townState(world);
    const cost = costs(world).reroll;
    if (!pay(world, cost)) return false;
    if (t.freeReroll) t.freeReroll = false;
    else t.rerolls++;
    rollStock(world);
    world.events.push({ type: 'reroll', cost });
    return true;
  }, { ui: true });
  Commands.register('Enhance', (world, c) => {
    const it = findItem(world, c.uid);
    if (!it || (it.enhance || 0) >= EconomyData().enhanceMax) return false;
    if (!pay(world, enhanceCost(world, it))) return false;
    it.enhance = (it.enhance || 0) + 1;
    BD.sim.stats.bump(world.player);
    world.events.push({ type: 'enhance', uid: it.uid, level: it.enhance });
    return true;
  }, { ui: true });
  Commands.register('Reforge', (world, c) => {
    const it = findItem(world, c.uid);
    if (!it || it.rarity !== 'rare' || !it.affixes[c.affixIdx]) return false;
    if (!pay(world, costs(world).reforge)) return false;
    const old = it.affixes[c.affixIdx];
    const band = BD.data.affixes[old.id].band;
    const base = BD.data.bases[it.base];
    const others = it.affixes.filter((_, j) => j !== c.affixIdx);
    const taken = new Set(others.map((a) => BD.data.affixes[a.id].stat || a.id));
    taken.add(BD.data.affixes[old.id].stat || old.id);
    let next = null;
    for (let k = 0; k < EconomyBalance.reforgeTries && !next; k++) {
      const rolled = BD.sim.loot.rollAffixes(world.lootRng, base, 'rare', world.player.cls);
      const roll = rolled.find((a) => BD.data.affixes[a.id].band === band && !taken.has(BD.data.affixes[a.id].stat || a.id));
      if (roll) next = roll;
    }
    if (!next) next = { id: old.id, roll: Math.round(world.lootRng.next() * 1000) / 1000, skill: old.skill, n: old.n };
    it.affixes[c.affixIdx] = next;
    BD.sim.items.invalidate();
    BD.sim.stats.bump(world.player);
    world.events.push({ type: 'reforge', uid: it.uid });
    return true;
  }, { ui: true });
  Commands.register('Gamble', (world, c) => {
    const p = world.player;
    if (packFull(world)) return false;
    if (!pay(world, costs(world).gamble)) return false;
    const rarity = gambleRarity(world.lootRng.next(), EconomyData().gambleOdds);
    const it = BD.sim.loot.rollItem(world, world.lootRng, { ilvl: al(world), rarity, slot: c.slot, cls: p.cls });
    p.pack.push(it);
    world.events.push({ type: 'gamble', uid: it.uid, rarity: it.rarity });
    return it.uid;
  }, { ui: true });
  Commands.register('BuyScroll', (world, c) => {
    const p = world.player;
    if (!pay(world, costs(world).portal)) return false;
    p.pouch[c.kind || 'portal'] = (p.pouch[c.kind || 'portal'] || 0) + 1;
    world.events.push({ type: 'shop.buy', scroll: c.kind || 'portal' });
    return true;
  }, { ui: true });
  Commands.register('Bless', (world, c) => {
    const t = townState(world);
    if (!t.blessOffer.includes(c.id) || world.run.blessing) return false;
    if (!pay(world, costs(world).blessing)) return false;
    world.run.blessing = c.id;
    BD.sim.stats.bump(world.player);
    world.events.push({ type: 'blessing', id: c.id });
    return true;
  }, { ui: true });
  Commands.register('FlaskUpgrade', (world) => {
    const t = townState(world), p = world.player;
    if (t.flaskUpgradedAct >= world.run.act || p.flask.permMax >= BD.data.balance.player.flaskPermMax) return false;
    if (!pay(world, costs(world).flask)) return false;
    t.flaskUpgradedAct = world.run.act;
    p.flask.permMax++;
    p.flask.max++;
    p.flask.charges = p.flask.max;
    world.events.push({ type: 'flask.upgrade', max: p.flask.max });
    return true;
  }, { ui: true });
  Commands.register('Respec', (world) => {
    const t = townState(world), p = world.player;
    if (!pay(world, costs(world).respec)) return false;
    t.respecs++;
    const base = BD.data.balance.player.attrBase[p.cls];
    let spentAttr = 0;
    for (const k of ['str', 'dex', 'mag', 'vit']) {
      spentAttr += p.attrs[k] - base[k];
      p.attrs[k] = base[k];
    }
    p.unspent.attr += spentAttr;
    let pts = 0;
    for (const id in p.skills) pts += p.skills[id];
    p.skills = {};
    p.unspent.skill += pts;
    p.charges = {};
    p.bar = { rmb: null, s1: null, s2: null, s3: null, s4: null };
    BD.sim.stats.bump(p);
    BD.sim.inventory.clampResources(world, p);
    world.events.push({ type: 'respec' });
    return true;
  }, { ui: true });
  Commands.register('Rest', (world) => {
    const p = world.player;
    const s = BD.sim.stats.statsOf(world, p);
    p.hp = s.maxLife;
    p.flask.charges = p.flask.max;
    if (p.resources.mana) p.resources.mana.cur = s.maxMana;
    if (p.resources.energy) p.resources.energy.cur = p.resources.energy.max;
    p.statuses = p.statuses.filter((x) => !BD.data.statuses[x.id].debuff);
    world.events.push({ type: 'rest' });
    world.events.push({ type: 'save.request', why: 'rest' });
    return true;
  }, { ui: true });
  // account-wide stash: the app attaches meta.stash as world.stash (tabs of 20)
  Commands.register('Stash', (world, c) => {
    const p = world.player, tabs = world.stash;
    if (!tabs) return false;
    const tab = tabs[c.tab || 0];
    if (!tab || tab.length >= EconomyBalance.stashTabSize) return false;
    const i = p.pack.findIndex((x) => x.uid === c.uid);
    if (i < 0) return false;
    tab.push(p.pack.splice(i, 1)[0]);
    world.events.push({ type: 'stash' });
    return true;
  }, { ui: true });
  Commands.register('Unstash', (world, c) => {
    const p = world.player, tabs = world.stash;
    if (!tabs) return false;
    const tab = tabs[c.tab || 0];
    const i = tab ? tab.findIndex((x) => x.uid === c.uid) : -1;
    if (i < 0 || p.pack.length >= BD.sim.inventory.PACK) return false;
    p.pack.push(tab.splice(i, 1)[0]);
    world.events.push({ type: 'stash' });
    return true;
  }, { ui: true });

  /** a full pack refuses the purchase (with the usual message) */
  function packFull(world) {
    if (world.player.pack.length < BD.sim.inventory.PACK) return false;
    Interact().deny(world, 'pack_full');
    return true;
  }

  /** r in [0,1) → legendary / rare / magic by the gamble odds */
  function gambleRarity(r, odds) {
    if (r < odds.legendary) return 'legendary';
    if (r < odds.legendary + odds.rare) return 'rare';
    return 'magic';
  }

  function findItem(world, uid) {
    const p = world.player;
    return p.pack.find((x) => x.uid === uid) || Object.values(p.equip).find((x) => x && x.uid === uid) || null;
  }

  // ---------------- run-level stat contributions ----------------
  function runMods(world, p, add) {
    const r = world.run;
    const b = r.blessing && BD.data.blessings[r.blessing];
    if (b) for (const k in b.mods) add(k, b.mods[k], 'Blessing: ' + b.name);
    const bg = BD.data.backgrounds[p.background];
    if (bg && bg.mods) for (const k in bg.mods) add(k, bg.mods[k], bg.name);
  }

  function onRunStart(world, opts) {
    const p = world.player;
    const bg = BD.data.backgrounds[opts.background];
    const start = bg && bg.startItem;
    if (start) {
      const rng = world.lootRng;
      // the offhand is only an option for classes that carry a shield
      const slots = start.slots.filter((s) => s !== 'offhand' || BD.data.classes[p.cls].uses.includes('buckler'));
      const slot = slots.length > 1 && rng.chance(0.5) ? slots[0] : slots[slots.length - 1];
      const it = BD.sim.loot.rollItem(world, rng, { ilvl: 1, rarity: start.rarity, slot, cls: p.cls, usable: true });
      p.pack.push(it);
      BD.sim.inventory.equip(world, it.uid);
    }
  }

  BD.sim.economy = { townState, price, sellPrice, costs, enhanceCost, onTownArrive, rollStock, runMods, onRunStart, findItem };
})(globalThis.BD);
