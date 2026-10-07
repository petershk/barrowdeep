// @ts-check
// Pack (30), equipment slots, pickups (gold within 1 tile automatically, flask orbs on walk-over,
// seal/key automatically), requirements and class permissions (03 §1).
(function (BD) {
  'use strict';

  const Commands = BD.sim.commands;
  const PACK = 30;
  const { cheb } = BD.core.util;

  /** can the player equip this item? → {ok} | {ok:false, why} */
  function canEquip(world, p, item) {
    const d = BD.sim.items.derive(item);
    const b = BD.data.bases[item.base];
    if (!BD.sim.loot.usableBy(p.cls, b)) return { ok: false, why: BD.data.classes[p.cls].name + 's cannot use this' };
    if (d.req) {
      const s = BD.sim.stats.statsOf(world, p);
      if (s[d.req.attr] < d.req.value) return { ok: false, why: 'Requires ' + d.req.value + ' ' + BD.data.stats.defs[d.req.attr].label };
    }
    return { ok: true };
  }
  function slotFor(p, item, want) {
    const b = BD.data.bases[item.base];
    if (b.slot === 'ring') {
      if (want === 'ring1' || want === 'ring2') return want;
      // the first empty ring slot; with both full, replace ring1
      if (p.equip.ring1 && !p.equip.ring2) return 'ring2';
      return 'ring1';
    }
    return b.slot;
  }

  function equip(world, uid, want) {
    const p = world.player;
    const i = p.pack.findIndex((it) => it.uid === uid);
    if (i < 0) return false;
    const item = p.pack[i];
    const ok = canEquip(world, p, item);
    if (!ok.ok) {
      world.events.push({ type: 'ability.reject', id: p.id, abilityId: 'equip', reason: ok.why });
      return false;
    }
    const slot = slotFor(p, item, want);
    p.pack.splice(i, 1);
    const out = [];
    if (p.equip[slot]) out.push(p.equip[slot]);
    p.equip[slot] = item;
    const b = BD.data.bases[item.base];
    // two-handed weapons lock the offhand; an offhand displaces a two-hander
    if (slot === 'weapon' && b.hands === 2 && p.equip.offhand) {
      out.push(p.equip.offhand);
      p.equip.offhand = null;
    }
    if (slot === 'offhand' && p.equip.weapon && BD.data.bases[p.equip.weapon.base].hands === 2) {
      out.push(p.equip.weapon);
      p.equip.weapon = null;
    }
    for (const o of out) p.pack.splice(i, 0, o);
    BD.sim.stats.bump(p);
    clampResources(world, p);
    world.events.push({ type: 'item.equip', uid, slot, material: material(b) });
    return true;
  }
  /** pack is full: tell the player why the action failed */
  function rejectPackFull(world, p, abilityId) {
    world.events.push({ type: 'ability.reject', id: p.id, abilityId, reason: BD.data.strings.t('pack_full') });
    return false;
  }
  function unequip(world, slot) {
    const p = world.player;
    const it = p.equip[slot];
    if (!it) return false;
    if (p.pack.length >= PACK) return rejectPackFull(world, p, 'unequip');
    p.equip[slot] = null;
    p.pack.push(it);
    BD.sim.stats.bump(p);
    clampResources(world, p);
    world.events.push({ type: 'item.unequip', uid: it.uid, slot });
    return true;
  }
  function clampResources(world, p) {
    const s = BD.sim.stats.statsOf(world, p);
    if (p.hp > s.maxLife) p.hp = s.maxLife;
    if (p.resources.mana) {
      p.resources.mana.max = s.maxMana;
      p.resources.mana.cur = Math.min(p.resources.mana.cur, s.maxMana);
    }
    // evade charges follow the stat
    if ((s.evade_charges || 0) > 0 && p.evadeCharges === undefined) p.evadeCharges = 1 + s.evade_charges;
  }
  function material(b) {
    if (b.slot === 'amulet' || b.slot === 'ring') return 'jewel';
    if (b.weight === 'heavy' || b.slot === 'weapon' && b.wield === 'str' || b.category === 'shield') return 'metal';
    if (b.weight === 'medium' || b.slot === 'cloak') return 'leather';
    return 'cloth';
  }

  /** pick up a ground item (adjacent or under the player) */
  function pickup(world, uid) {
    const f = world.floor, p = world.player;
    const i = f.items.findIndex((g) => g.uid === uid);
    if (i < 0) return false;
    const g = f.items[i];
    if (cheb(p.x, p.y, g.x, g.y) > 1) return false;
    if (g.kind === 'item') {
      if (p.pack.length >= PACK) return rejectPackFull(world, p, 'pickup');
      p.pack.push(g.item);
    } else if (g.kind === 'scroll') p.pouch[g.scroll] = (p.pouch[g.scroll] || 0) + 1;
    else return false;
    f.items.splice(i, 1);
    world.events.push({
      type: 'loot.pickup', uid, kind: g.kind, rarity: g.item ? g.item.rarity : null,
      x: g.x, y: g.y, scroll: g.scroll || null,
    });
    return true;
  }

  /** automatic pickups each step: gold (≤1 tile), orbs (walk over), seal / key */
  function system(world) {
    const p = world.player, f = world.floor;
    if (!p || p.dead || !f.items.length) return;
    for (let i = 0; i < f.items.length; i++) {
      const g = f.items[i];
      const d = cheb(p.x, p.y, g.x, g.y);
      if (g.kind === 'gold' && d <= 1) {
        p.gold += g.amount;
        f.items.splice(i--, 1);
        world.events.push({ type: 'gold', amount: g.amount, x: g.x, y: g.y });
      } else if (g.kind === 'orb' && d === 0 && p.flask.charges < p.flask.max) {
        p.flask.charges++;
        f.items.splice(i--, 1);
        world.events.push({ type: 'flask.charge', charges: p.flask.charges, x: g.x, y: g.y });
      } else if ((g.kind === 'seal' || g.kind === 'key') && d <= 1) {
        f.items.splice(i--, 1);
        if (BD.sim.floors) BD.sim.floors.onSealPickup(world, g);
      } else if (g.kind === 'scroll' && d === 0) {
        p.pouch[g.scroll] = (p.pouch[g.scroll] || 0) + 1;
        f.items.splice(i--, 1);
        world.events.push({ type: 'loot.pickup', uid: g.uid, kind: 'scroll', scroll: g.scroll, x: g.x, y: g.y });
      }
    }
  }

  // ---- commands ----
  Commands.register('Pickup', (world, c) => {
    const p = world.player, g = world.floor.items.find((it) => it.uid === c.itemUid);
    if (!g) return false;
    if (cheb(p.x, p.y, g.x, g.y) <= 1) return pickup(world, c.itemUid);
    const path = BD.sim.player.pathTo(world, p, g.x, g.y, true);
    p.intent = { kind: 'pickup', uid: c.itemUid, path: path || [] };
    return true;
  });
  Commands.register('Equip', (world, c) => equip(world, c.uid, c.slot), { ui: true });
  Commands.register('Unequip', (world, c) => unequip(world, c.slot), { ui: true });
  Commands.register('Drop', (world, c) => {
    const p = world.player;
    const i = p.pack.findIndex((it) => it.uid === c.uid);
    if (i < 0) return false;
    const [it] = p.pack.splice(i, 1);
    BD.sim.loot.dropAt(world, p.x, p.y, { kind: 'item', item: it });
    return true;
  }, { ui: true });
  Commands.register('Lock', (world, c) => {
    const it = world.player.pack.find((x) => x.uid === c.uid);
    if (it) it.locked = !it.locked;
    return true;
  }, { ui: true });
  Commands.register('ReadScroll', (world, c) => (BD.sim.portal ? BD.sim.portal.read(world, c.kind) : false), { ui: true });

  BD.sim.inventory = { PACK, canEquip, slotFor, equip, unequip, pickup, system, material, clampResources };
  BD.sim.world.addSystem('pickups', system, 12);
})(globalThis.BD);
