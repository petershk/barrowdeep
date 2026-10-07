// Economy: prices, no gold-printing loops (buy/sell, enhance/sell, gamble/sell), services.
'use strict';
const { loadBD } = require('./harness');

module.exports = (T) => {
  const BD = loadBD();
  function town(seed) {
    const w = BD.sim.world.createWorld({ seed, cls: 'fighter', name: 'Eco' });
    BD.sim.run.begin(w, {});
    w.player.gold = 100000;
    return w;
  }
  const apply = (w, c) => BD.sim.commands.apply(w, c);

  T.test('Smith stock: 5 items, at least 1 magic, 2 usable, fixed until rerolled', () => {
    const w = town('eco1');
    const t = BD.sim.economy.townState(w);
    T.eq(t.stock.length, 5);
    T.ok(t.stock.some((i) => i.rarity !== 'common'));
    T.ok(t.stock.filter((i) => BD.sim.loot.usableBy('fighter', BD.data.bases[i.base])).length >= 2);
    const uids = t.stock.map((i) => i.uid).join();
    BD.sim.run.descend(w); BD.sim.run.ascend(w);
    T.eq(BD.sim.economy.townState(w).stock.map((i) => i.uid).join(), uids, 'stock survives a town visit');
    apply(w, { type: 'Reroll' });
    T.ok(BD.sim.economy.townState(w).stock.map((i) => i.uid).join() !== uids);
  });

  T.test('buy then sell loses gold', () => {
    const w = town('eco2');
    const g0 = w.player.gold;
    const it = BD.sim.economy.townState(w).stock[0];
    T.ok(apply(w, { type: 'Buy', idx: 0 }));
    T.ok(apply(w, { type: 'Sell', uid: it.uid }));
    T.ok(w.player.gold < g0);
  });

  T.test('enhance then sell never pays back', () => {
    const w = town('eco3');
    const it = BD.sim.loot.rollItem(w, w.lootRng, { ilvl: 10, rarity: 'rare' });
    w.player.pack.push(it);
    for (let k = 1; k <= 5; k++) {
      const before = BD.sim.economy.sellPrice(it), cost = BD.sim.economy.enhanceCost(w, it);
      T.ok(apply(w, { type: 'Enhance', uid: it.uid }));
      T.ok(BD.sim.economy.sellPrice(it) - before < cost, 'enhance step ' + k + ' prints gold');
    }
    T.eq(it.enhance, 5);
    T.ok(!apply(w, { type: 'Enhance', uid: it.uid }), 'cannot exceed +5');
  });

  T.test('gamble: expected sell value below its cost; odds roughly 60/32/8', () => {
    const w = town('eco4');
    const counts = { magic: 0, rare: 0, legendary: 0 };
    let sold = 0, spent = 0;
    for (let i = 0; i < 600; i++) {
      w.player.pack.length = 0;
      const cost = BD.sim.economy.costs(w).gamble;
      const uid = apply(w, { type: 'Gamble', slot: ['weapon', 'chest', 'ring', 'amulet'][i % 4] });
      spent += cost;
      const it = w.player.pack.find((x) => x.uid === uid);
      counts[it.rarity]++;
      sold += BD.sim.economy.sellPrice(it);
    }
    T.ok(sold < spent * 0.5);
    T.between(counts.magic / 600, 0.5, 0.7); T.between(counts.rare / 600, 0.24, 0.4); T.between(counts.legendary / 600, 0.03, 0.14);
  });

  T.test('prices follow 05 §6.3', () => {
    const w = town('eco5');
    const al = w.run.townAl;
    const c = BD.sim.economy.costs(w);
    T.eq(c.gamble, 60 * al); T.eq(c.reforge, 120 * al); T.eq(c.blessing, 30 * al);
    T.eq(c.respec, 50 * w.player.level * 1);
    const it = BD.sim.items.make(w, 'long_sword', 10, 'rare');
    T.eq(BD.sim.economy.price(it), Math.round(20 * Math.pow(1.1, 9) * 6));
  });

  T.test('blessing lasts until the next town visit', () => {
    const w = town('eco6');
    const id = BD.sim.economy.townState(w).blessOffer[0];
    T.ok(apply(w, { type: 'Bless', id }));
    T.eq(w.run.blessing, id);
    BD.sim.run.descend(w);
    T.eq(w.run.blessing, id);
    BD.sim.run.ascend(w);
    T.eq(w.run.blessing, null);
  });

  T.test('respec refunds every point; flask upgrade once per act', () => {
    const w = town('eco7');
    const p = w.player;
    BD.sim.progression.gainXp(w, p, 5000);
    const L = p.level;
    apply(w, { type: 'SpendAttr', key: 'str', n: 5 });
    p.skills.bash = 2; p.unspent.skill = 0;
    T.ok(apply(w, { type: 'Respec' }));
    T.eq(p.attrs.str, BD.data.balance.player.attrBase.fighter.str);
    T.eq(p.unspent.skill, 2);
    T.ok(L > 1);
    const m0 = p.flask.max;
    T.ok(apply(w, { type: 'FlaskUpgrade' }));
    T.eq(p.flask.max, m0 + 1);
    T.ok(!apply(w, { type: 'FlaskUpgrade' }), 'second upgrade in the same act refused');
  });

  T.test('souls formula', () => {
    const w = town('eco8');
    w.player.level = 10; w.run.keepersSlain = 3; w.run.bossesKilled = ['grulk'];
    T.eq(BD.sim.death.souls(w), Math.round((9 * 13 + 30 + 40) * 1.0));
    T.eq(BD.sim.death.souls(w, true), Math.round(BD.sim.death.souls(w) * 0.5));
  });
};
