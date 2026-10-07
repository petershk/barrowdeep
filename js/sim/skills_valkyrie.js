// @ts-check
// Valkyrie special rules (02 §5): Aimed Shot at 5 focus (pierce, extra arrows, Deadeye), Piercing
// Shot focus spend, Multishot focus, Vault, Pinning Shot fear/chains, Wind Dancer, Javelin focus,
// the Valkyrie spirit, Sky Spear lines, and the Valkyrie legendaries.
(function (BD) {
  'use strict';

  const Effects = BD.sim.effects;
  const Hits = BD.sim.hits;
  const Resources = BD.sim.resources;
  const Powers = BD.sim.powers;
  const Allies = BD.sim.allies;
  const Entities = BD.sim.entities;
  const { within } = BD.core.util;
  const reg = Effects.register;
  const ks = (p, id) => !!(p.skills && p.skills[id]);
  const isValk = (p) => p && p.kind === 'player' && p.cls === 'valkyrie';
  const Grid = BD.core.grid;

  const PlayerBalance = BD.data.balance.player;   // Aimed Shot / Deadeye bonuses need full focus (focusMax)
  const EXTRA_ARROW_SEEK = 6;          // extra Aimed Shot arrows seek enemies this close to the aim point...
  const EXTRA_ARROW_FAN = 0.25;        // ...else fan out by this many radians per pair...
  const EXTRA_ARROW_MISS_DIST = 8;     // ...toward a point this far away

  // ---------------- Aimed Shot ----------------
  reg('aimed_shot.commit', (world, p, ab, rank, a) => {
    if (BD.sim.status.has(p, 'vault_ready')) {
      a.focusHeld = PlayerBalance.focusMax;
      BD.sim.status.remove(world, p, 'vault_ready');
    }
    if (a.focusHeld >= PlayerBalance.focusMax && ks(p, 'deadeye')) {
      Resources.refund(world, p, 'focus', Math.min(2, a.spent));
      a.spent = Math.max(0, a.spent - 2);
      a.deadeye = true;
    }
  });
  reg('aimed_shot.before', (world, p, ab, rank, { a, ctx }) => {
    if (a && a.deadeye) ctx.forceCrit = true;
    if (ctx.focus >= PlayerBalance.focusMax && ab.pierceAt5) ab.delivery = Object.assign({}, ab.delivery, { pierce: 'all' });
  });
  reg('aimed_shot.impact', (world, p, ab, rank, { a, ctx, tx, ty }) => {
    if (ctx.focus < PlayerBalance.focusMax) return;
    let extra = ab.extraAt5 || 0;
    if (Powers.has(p, 'eagles_talon')) extra += 2;
    if (!extra) return;
    const hit = new Set();
    for (let i = 0; i < extra; i++) {
      const t = BD.sim.targeting.nearestEnemy(world, tx, ty, EXTRA_ARROW_SEEK, p.faction, { exclude: hit, los: false });
      // alternate sides, widening every second arrow
      const side = i % 2 ? EXTRA_ARROW_FAN : -EXTRA_ARROW_FAN;
      const ang = Math.atan2(ty - p.y, tx - p.x) + side * Math.ceil((i + 1) / 2);
      const gx = t ? t.x : p.x + Math.cos(ang) * EXTRA_ARROW_MISS_DIST;
      const gy = t ? t.y : p.y + Math.sin(ang) * EXTRA_ARROW_MISS_DIST;
      if (t) hit.add(t.id);
      const ab2 = Object.assign({}, ab, { delivery: Object.assign({}, ab.delivery, { count: 1 }) });
      BD.sim.projectiles.fireAbility(world, p, ab2, rank, a, Math.round(gx), Math.round(gy), ctx);
    }
  });

  // ---------------- Piercing Shot ----------------
  reg('piercing_shot.before', (world, p, ab, rank, { ctx }) => {
    const n = Math.min(2, Resources.amount(p, 'focus'));
    if (n > 0) {
      Resources.spend(world, p, 'focus', n);
      ctx.packetMult *= 1 + 0.25 * n;
    }
  });
  reg('piercing_shot.impact', (world, p, ab, rank, { a, ctx, tx, ty }) => {
    if (!ab.twin) return;
    const dx = tx - p.x, dy = ty - p.y, l = Math.hypot(dx, dy) || 1;
    const ox = Math.round(-dy / l), oy = Math.round(dx / l);
    const src = { x: p.x + ox, y: p.y + oy, faction: p.faction, dir: p.dir, kind: 'origin', id: p.id };
    BD.sim.projectiles.fireAbility(world, src, ab, rank, a, tx + ox, ty + oy, ctx);
  });

  // ---------------- Multishot: +1 focus if 3+ arrows hit ----------------
  reg('multishot.before', (world, p, ab) => {
    let d = Object.assign({}, ab.delivery);
    if (ab.ricochet || Powers.has(p, 'featherfall')) d.ricochet = 1;
    if (Powers.has(p, 'featherfall')) d.count = (d.count || 5) + 3;
    ab.delivery = d;
  });
  reg('multishot.projectileHit', (world, p, ab, rank, { pr }) => {
    const g = pr.payload.group;
    if (!g) return;
    g.hits++;
    if (g.hits === 3) Resources.gain(world, p, 'focus', 1);
  });

  // ---------------- Vault ----------------
  reg('vault.before', (world, p, ab, rank, { a }) => {
    const ax = a.tx - p.x, ay = a.ty - p.y;
    let dx = -Math.sign(ax), dy = -Math.sign(ay);
    if (!dx && !dy) {
      const d = BD.core.util.DIRS[(p.dir + 4) % 8];   // straight back from the facing
      dx = d[0];
      dy = d[1];
    }
    const land = BD.sim.movement.dashLanding(world, p, p.x + dx * 4, p.y + dy * 4, 4);
    if (!land) return false;
    const fx = p.x, fy = p.y;
    BD.sim.movement.displace(world, p, land.x, land.y, 220, 'leap');
    BD.sim.player.onStep(world, p);
    world.events.push({ type: 'leap', id: p.id, fromX: fx, fromY: fy, x: land.x, y: land.y, ms: 220, abilityId: 'vault' });
    const hit = Hits.computeHit(world, p, ab, { source: 'weapon', mult: 0.2 }, 1, { roll: 0.5 }).total;
    const caltrops = Grid.shapeOffsets('circle', 1).map(([x, y]) => [fx + x, fy + y]);
    BD.sim.zones.ground(world, 'caltrops', caltrops, { durMs: 3000, faction: 'player', srcId: p.id, amount: hit });
    Resources.gain(world, p, 'focus', Powers.has(p, 'galewing_mantle') ? 3 : 2);
    if (ab.primeAimed) BD.sim.status.apply(world, p, 'vault_ready', { durMs: 3000 });
    return false;
  });
  reg('vault.precheck', () => null);
  Powers.registerCharges('galewing_mantle', (ab, n) => (ab.id === 'vault' ? 2 : n));

  // ---------------- Pinning Shot ----------------
  reg('pinning_shot.projectileHit', (world, p, ab, rank, { tgt, ctx, res }) => {
    if (!res || !res.length || !res[0].res) return;
    for (const e of Entities.enemiesOf(world, p.faction)) {
      if (e !== tgt && within(e.x, e.y, tgt.x, tgt.y, 2)) BD.sim.status.apply(world, e, 'feared', { durMs: 1500, sourceId: p.id });
    }
    if (ab.pinVuln) BD.sim.status.apply(world, tgt, 'vulnerable', { durMs: 2500, sourceId: p.id });
    let chains = (ab.pinChain || 0) + (Powers.has(p, 'wingbreaker') ? 2 : 0);
    if (!chains || ctx.chained) return;
    const hit = new Set([tgt.id]);
    let from = tgt;
    while (chains-- > 0) {
      const next = BD.sim.targeting.nearestEnemy(world, from.x, from.y, 4, p.faction, { exclude: hit });
      if (!next) break;
      hit.add(next.id);
      world.events.push({ type: 'chain', srcId: p.id, fromX: from.x, fromY: from.y, x: next.x, y: next.y, abilityId: 'pinning_shot' });
      const c2 = Object.assign({}, ctx, { chained: true, centerId: next.id });
      Hits.applyEffects(world, c2, ab.effects, [next]);
      if (ab.pinVuln) BD.sim.status.apply(world, next, 'vulnerable', { durMs: 2500, sourceId: p.id });
      from = next;
    }
  });

  // ---------------- Wind Dancer: Evade grants 3 focus and resets Vault ----------------
  BD.sim.items.evadeHooks.push((world, p) => {
    if (!isValk(p) || !ks(p, 'wind_dancer')) return;
    Resources.gain(world, p, 'focus', 3);
    p.cooldowns.vault = 0;
    if (p.charges && p.charges.vault) p.charges.vault.n = BD.sim.abilities.maxCharges(world, p, BD.data.skills.vault);
  });

  // ---------------- Javelin: +1 focus per enemy hit (max 2); returns ----------------
  reg('javelin.before', (world, p, ab) => {
    if (ab.returns || Powers.has(p, 'oathspear')) ab.delivery = Object.assign({}, ab.delivery, { returns: true });
  });
  reg('javelin.projectileHit', (world, p, ab, rank, { pr }) => {
    const g = pr.payload.group;
    if (!g || pr.srcId !== p.id) return;
    if (g.hits++ < 2) Resources.gain(world, p, 'focus', 1);
  });

  // ---------------- Valkyrie's Call ----------------
  reg('valkyries_call.summon', (world, p, ab, rank) => {
    for (const v of Allies.alliesOf(world, 'valkyrie')) Allies.despawn(world, v);
    const n = Powers.has(p, 'oathspear') ? 2 : 1;
    for (let i = 0; i < n; i++) {
      Allies.spawnAlly(world, p, {
        kind: 'valkyrie', x: p.x + (i ? -1 : 1), y: p.y, art: 'valkyrie',
        pal: { A: '#b0d8ff', a: '#6a98d0', H: '#f0f8ff', h: '#a0c0e0', B: '#8ab0e0', W: '#ffffff' },
        lifeMs: ab.spiritMs, mult: BD.sim.abilities.scale({ mult: ab.spiritMult }, rank), decoy: 0.5, rank,
        throws: !!ab.spiritThrows, lifePct: 0.8,
      });
    }
  });
  reg('valkyries_call.cooldown', (world, p, ab, ms) => (ks(p, 'shieldmaidens_oath') ? 20000 : ms));

  // ---------------- Sky Spear: three spears in a line (r5) ----------------
  reg('sky_spear.zoneCentres', (world, p, ab, rank, { tx, ty }) => {
    if (!ab.spears) return null;
    const dx = Math.sign(tx - p.x), dy = Math.sign(ty - p.y);
    return [[tx, ty, 1], [tx - dx * 2, ty - dy * 2, 0.7], [tx + dx * 2, ty + dy * 2, 0.7]];
  });

  // ---------------- legendaries ----------------
  Powers.registerMod('skyrender', (ab) => { if (ab.id === 'rain_of_arrows') ab.follow = 'target'; });
  // featherfall, eagles_talon, wingbreaker, oathspear and galewing_mantle are handled above by name

})(globalThis.BD);
