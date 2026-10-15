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
    if (ab.quickdraw) a.focusHeld = Math.max(1, a.spent || 1);
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
  reg('aimed_shot.landed', (world, p, ab, rank, { landed }) => {
    if (ab.quickdraw && landed.some((r) => r.res && r.res.crit)) Resources.gain(world, p, 'focus', 1);
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

  // ---------------- Piercing Shot & Rain of Arrows ----------------
  reg('piercing_shot.before', (world, p, ab, rank, { ctx }) => {
    if (ab.noFocusConsume) return;
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
  reg('rain_of_arrows.zoneTick', (world, p, ab, rank, { z, res }) => {
    if (ab.rainGround && !z._groundLaid) {
      z._groundLaid = true;
      const hit = Hits.computeHit(world, p, ab, ab.effects[0], rank, { roll: 0.5 }).total;
      BD.sim.zones.ground(world, 'burning_ground', z.tiles, { durMs: 3000, faction: 'player', srcId: p.id, amount: hit * 0.25 });
    }
    if (!ab.hailFreezeHits) return;
    z.hailHits = z.hailHits || {};
    for (const r of res) {
      if (!r.res || !(r.res.total > 0) || r.tgt.hp <= 0) continue;
      const id = r.tgt.id;
      z.hailHits[id] = (z.hailHits[id] || 0) + 1;
      if (z.hailHits[id] >= ab.hailFreezeHits) {
        BD.sim.status.apply(world, r.tgt, 'frozen', { durMs: 1500, sourceId: p.id });
        z.hailHits[id] = 0;
      }
    }
  });

  // ---------------- Multishot ----------------
  reg('multishot.before', (world, p, ab) => {
    let d = Object.assign({}, ab.delivery);
    if (ab.ricochet || Powers.has(p, 'featherfall')) d.ricochet = 1;
    if (Powers.has(p, 'featherfall')) d.count = (d.count || 5) + 3;
    ab.delivery = d;
  });
  reg('multishot.projectileHit', (world, p, ab, rank, { tgt, res }) => {
    if (!ab.closeKnock || !res || !res.length || !res[0].res) return;
    if (within(tgt.x, tgt.y, p.x, p.y, ab.closeKnock)) Hits.knockback(world, tgt, p.x, p.y, 1);
  });

  // ---------------- Vault ----------------
  function vaultExtras(world, p, ab, rank, a, fx, fy, lx, ly) {
    if (ab.partingShot) {
      const hit = Hits.computeHit(world, p, ab, { source: 'weapon', mult: ab.partingShot }, rank, { roll: 0.5 }).total;
      const base = Math.atan2(a.ty - fy, a.tx - fx);
      for (const off of [-0.3, 0, 0.3]) {
        BD.sim.projectiles.spawn(world, {
          kind: 'arrow', srcId: p.id, faction: p.faction, x: fx, y: fy, dx: Math.cos(base + off), dy: Math.sin(base + off),
          maxDist: 7, payload: { type: 'packet', amounts: { phys: hit }, onHit: [{ status: 'slowed', durMs: 2000 }] },
        });
      }
    }
    if (ab.diveMult) {
      const ctx = Effects.baseCtx(world, p, ab, rank, null);
      ctx.aoe = true;
      const tiles = Grid.shapeOffsets('circle', 1).map(([x, y]) => [lx + x, ly + y]);
      const targets = BD.sim.targeting.entitiesOnTiles(world, tiles, p.faction);
      const effs = [{ type: 'damage', source: 'weapon', mult: ab.diveMult, canCrit: true }, { type: 'status', id: 'stunned', durMs: 1000 }];
      Hits.applyEffects(world, ctx, effs, targets);
    }
  }
  reg('vault.before', (world, p, ab, rank, { a }) => {
    const ax = a.tx - p.x, ay = a.ty - p.y;
    const sgn = ab.vaultForward ? 1 : -1;
    let dx = sgn * Math.sign(ax), dy = sgn * Math.sign(ay);
    if (!dx && !dy) {
      const d = BD.core.util.DIRS[(p.dir + (ab.vaultForward ? 0 : 4)) % 8];
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
    vaultExtras(world, p, ab, rank, a, fx, fy, land.x, land.y);
    const gain = ab.vaultFocus || (Powers.has(p, 'galewing_mantle') ? 3 : 2);
    Resources.gain(world, p, 'focus', gain);
    if (ab.primeAimed) BD.sim.status.apply(world, p, 'vault_ready', { durMs: 3000 });
    return false;
  });
  reg('vault.precheck', () => null);
  Powers.registerCharges('galewing_mantle', (ab, n) => (ab.id === 'vault' ? 2 : n));

  // ---------------- Pinning Shot ----------------
  reg('pinning_shot.projectileHit', (world, p, ab, rank, { tgt, ctx, res }) => {
    if (!res || !res.length || !res[0].res) return;
    if (ab.pinFocus && !ctx.chained) Resources.gain(world, p, 'focus', ab.pinFocus);
    for (const e of Entities.enemiesOf(world, p.faction)) {
      if (e === tgt) continue;
      if (ab.bolaPull && within(e.x, e.y, tgt.x, tgt.y, ab.bolaPull)) {
        Hits.pull(world, e, tgt.x, tgt.y, 1);
        Hits.pull(world, e, tgt.x, tgt.y, 1);
        BD.sim.status.apply(world, e, 'rooted', { durMs: 2500, sourceId: p.id });
        if (ab.pinVuln) BD.sim.status.apply(world, e, 'vulnerable', { durMs: 2500, sourceId: p.id });
      } else if (!ab.bolaPull && within(e.x, e.y, tgt.x, tgt.y, 2)) {
        BD.sim.status.apply(world, e, 'feared', { durMs: 1500, sourceId: p.id });
      }
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

  // ---------------- Javelin: +1 focus per enemy hit (max 2); returns; Lightning Fury ----------------
  reg('javelin.before', (world, p, ab) => {
    if (ab.returns || Powers.has(p, 'oathspear')) ab.delivery = Object.assign({}, ab.delivery, { returns: true });
  });
  reg('javelin.projectileHit', (world, p, ab, rank, { pr, tgt }) => {
    const g = pr.payload.group;
    if (!g || pr.srcId !== p.id) return;
    if (g.hits++ < 2) Resources.gain(world, p, 'focus', 1);
    if (ab.furyBolts && g.hits === 1) {
      const hit = Hits.computeHit(world, p, ab, { source: 'weapon', mult: 0.9, element: 'light' }, rank, { roll: 0.5 }).total;
      for (let i = 0; i < ab.furyBolts; i++) {
        const ang = Math.PI / 4 + (i * Math.PI * 2) / ab.furyBolts;
        const b = BD.sim.projectiles.spawn(world, {
          kind: 'sentry_bolt', srcId: p.id, faction: p.faction, x: tgt.x, y: tgt.y, dx: Math.cos(ang), dy: Math.sin(ang),
          maxDist: 5, payload: { type: 'packet', amounts: { light: hit }, onHit: [{ status: 'shocked' }] },
        });
        b.hitIds.push(tgt.id);
      }
    }
  });

  // ---------------- Valkyrie's Call ----------------
  reg('valkyries_call.summon', (world, p, ab, rank) => {
    for (const v of Allies.alliesOf(world, 'valkyrie')) Allies.despawn(world, v);
    const n = (ab.spiritCount || 1) + (Powers.has(p, 'oathspear') ? 1 : 0);
    for (let i = 0; i < n; i++) {
      Allies.spawnAlly(world, p, {
        kind: 'valkyrie', x: p.x + (i ? -1 : 1), y: p.y, art: 'valkyrie',
        pal: { A: '#b0d8ff', a: '#6a98d0', H: '#f0f8ff', h: '#a0c0e0', B: '#8ab0e0', W: '#ffffff' },
        lifeMs: ab.spiritMs, mult: BD.sim.abilities.scale({ mult: ab.spiritMult }, rank), decoy: 0.5, rank,
        throws: !!ab.spiritThrows, lifePct: 0.8,
      });
    }
    if (ab.summonFocus) Resources.gain(world, p, 'focus', ab.summonFocus);
    if (ab.summonSlam) {
      const ctx = Effects.baseCtx(world, p, ab, rank, null);
      ctx.aoe = true;
      const tiles = Grid.shapeOffsets('circle', 2).map(([dx, dy]) => [p.x + dx, p.y + dy]);
      const targets = BD.sim.targeting.entitiesOnTiles(world, tiles, p.faction);
      const effs = [
        { type: 'damage', source: 'weapon', mult: ab.summonSlam, canCrit: true },
        { type: 'status', id: 'stunned', durMs: 1200 },
      ];
      Hits.applyEffects(world, ctx, effs, targets);
    }
  });
  reg('valkyries_call.cooldown', (world, p, ab, ms) => (ks(p, 'shieldmaidens_oath') ? 20000 : ms));

  // ---------------- Sky Spear: three spears in a line (r5) or Judgement Barrage ----------------
  reg('sky_spear.zoneCentres', (world, p, ab, rank, { tx, ty }) => {
    if (ab.refundFocus) Resources.gain(world, p, 'focus', ab.refundFocus);
    if (ab.crossSpears) {
      const k = ab.crossSpears;
      return [[tx, ty, k, 0], [tx + 2, ty, k, 100], [tx - 2, ty, k, 100], [tx, ty + 2, k, 200], [tx, ty - 2, k, 200]];
    }
    if (!ab.spears) return null;
    const dx = Math.sign(tx - p.x), dy = Math.sign(ty - p.y);
    return [[tx, ty, 1], [tx - dx * 2, ty - dy * 2, 0.7], [tx + dx * 2, ty + dy * 2, 0.7]];
  });

  // ---------------- legendaries ----------------
  Powers.registerMod('skyrender', (ab) => { if (ab.id === 'rain_of_arrows') ab.follow = 'target'; });
  // featherfall, eagles_talon, wingbreaker, oathspear and galewing_mantle are handled above by name

})(globalThis.BD);
