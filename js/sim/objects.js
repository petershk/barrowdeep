// @ts-check
// Floor objects: chests, loot piles, shrines, levers + hidden walls, traps (04 §1.1, §4, §6).
(function (BD) {
  'use strict';

  const { T } = BD.data.tiles;
  const Interact = BD.sim.interact;
  const reg = Interact.registerObject;

  const PileDrops = BD.data.balance.loot.pile;
  const SHRINE_DAMAGE_PCT = 25;      // fallback shrine (no events module): +% damage while it lasts

  reg('chest', (world, o) => {
    if (o.opened) return;
    o.opened = true;
    o.used = true;
    world.events.push({ type: 'chest.open', x: o.x, y: o.y, cursed: !!o.cursed });
    if (o.cursed && BD.sim.events) {
      BD.sim.events.cursedChest(world, o);
      return;
    }
    if (o.vault) {
      const item = BD.sim.loot.rollItem(world, world.lootRng, { ilvl: world.floor.al, min: 'rare' });
      BD.sim.loot.dropAt(world, o.x, o.y, { kind: 'item', item });
    }
    BD.sim.loot.chestDrop(world, o);
  });
  reg('pile', (world, o) => {
    o.used = true;
    const rng = world.lootRng, n = rng.int(2, 3);
    for (let i = 0; i < n; i++) {
      const r = rng.next();
      if (r < PileDrops.gold) {
        BD.sim.loot.dropAt(world, o.x, o.y, { kind: 'gold', amount: BD.sim.loot.goldOf(world, world.floor.al, PileDrops.goldK) });
      } else if (r < PileDrops.orb) {
        BD.sim.loot.dropAt(world, o.x, o.y, { kind: 'orb' });
      } else {
        BD.sim.loot.dropAt(world, o.x, o.y, { kind: 'scroll', scroll: rng.chance(PileDrops.portalScroll) ? 'portal' : 'reveal' });
      }
    }
    world.events.push({ type: 'chest.open', x: o.x, y: o.y, pile: true });
  });
  reg('lever', (world, o) => {
    o.used = true;
    const f = world.floor;
    for (const k of f.hidden) f.tiles[k] = T.FLOOR;
    f.hidden = [];
    f.exploreDirty = true;
    f.blockVer = (f.blockVer || 0) + 1;
    f.tilesVer = (f.tilesVer || 0) + 1;
    world.events.push({ type: 'lever', x: o.x, y: o.y });
    BD.sim.fov.refresh(world);
  });
  reg('shrine', (world, o) => {
    if (BD.sim.events && BD.sim.events.shrine) {
      BD.sim.events.shrine(world, o);
    } else {
      o.used = true;
      BD.sim.status.apply(world, world.player, 'shrine_damage', { durMs: 0, magnitude: SHRINE_DAMAGE_PCT });
    }
  });
  reg('trap', (world, o) => { if (BD.sim.traps) BD.sim.traps.startDisarm(world, o); });
  reg('npc', (world, o) => {
    const n = Object.values(BD.data.town.npcs).find((x) => x.role === o.role);
    const panel = n ? n.panel : o.role;
    const name = n ? n.name : o.role;
    world.events.push({ type: 'npc.talk', role: o.role, panel, name, x: o.x, y: o.y });
  });

  BD.sim.objects = {};
})(globalThis.BD);
