// @ts-check
// XP, levels, attribute and skill points (01 §7, 05 §5).
(function (BD) {
  'use strict';

  const Balance = BD.data.balance;
  const Commands = BD.sim.commands;

  const SkillBalance = Balance.skills;

  const DEFAULT_MONSTER_XP = 10;               // XP weight of a monster def that names none

  const xpToNext = (L) => Math.round(Balance.xp.base * Math.pow(Balance.xp.growth, L - 1));

  /** XP of a monster kill (05 §3): def.xpW × 1.12^(AL−1) × rank.xp × diff.xp */
  function xpFor(world, e) {
    const d = BD.sim.monsters.defOf(e);
    if (!d || e.noXp) return 0;
    const rank = Balance.monsters.ranks[e.rank] || Balance.monsters.ranks.normal;
    const diff = BD.data.difficulties[world.run.difficulty];
    const base = d.xpW != null ? d.xpW : d.xp || DEFAULT_MONSTER_XP;
    return base * Math.pow(Balance.monsters.xpGrowth, (e.al || 1) - 1) * rank.xp * diff.xp;
  }

  function gainXp(world, p, amount, why) {
    if (p.level >= Balance.player.levelCap || amount <= 0) return;
    p.xp += amount;
    world.events.push({ type: 'xp', id: p.id, amount: Math.round(amount), why: why || 'kill' });
    while (p.level < Balance.player.levelCap && p.xp >= xpToNext(p.level)) {
      p.xp -= xpToNext(p.level);
      p.level++;
      p.unspent.attr += Balance.player.attrPerLevel;
      p.unspent.skill += Balance.player.skillPerLevel;
      BD.sim.stats.bump(p);
      const s = BD.sim.stats.statsOf(world, p);
      p.hp = s.maxLife;
      if (p.resources.mana) p.resources.mana.cur = s.maxMana;
      world.events.push({ type: 'levelup', id: p.id, level: p.level, x: p.x, y: p.y });
      world.events.push({ type: 'announce', key: 'level_up', text: BD.data.strings.t('level_up', { level: p.level }), style: 'level' });
    }
    if (p.level >= Balance.player.levelCap) p.xp = 0;
  }

  BD.sim.damage.onKillHooks.push((world, e, killer) => {
    if (e.faction !== 'monster') return;
    world.run.kills++;
    const xp = xpFor(world, e);
    if (xp > 0) gainXp(world, world.player, xp, 'kill');
    void killer;
  });

  /** spend attribute points; n may be negative only for undo-until-close (UI tracks the session) */
  Commands.register('SpendAttr', (world, c) => {
    const p = world.player;
    const n = Math.max(1, Math.min(c.n || 1, p.unspent.attr));
    if (!p.unspent.attr || !['str', 'dex', 'mag', 'vit'].includes(c.key)) return false;
    p.attrs[c.key] += n;
    p.unspent.attr -= n;
    BD.sim.stats.bump(p);
    world.events.push({ type: 'attr.spend', key: c.key, n });
    return true;
  }, { ui: true });
  Commands.register('UnspendAttr', (world, c) => {
    const p = world.player;
    const base = Balance.player.attrBase[p.cls][c.key];
    const n = Math.min(c.n || 1, p.attrs[c.key] - base, c.max || 0);
    if (n <= 0) return false;
    p.attrs[c.key] -= n;
    p.unspent.attr += n;
    BD.sim.stats.bump(p);
    world.events.push({ type: 'attr.spend', key: c.key, n: -n });
    return true;
  }, { ui: true });

  /** can the player put a point into this skill? (tier level gates, keystone prerequisite) */
  function canLearn(world, p, id) {
    const ab = BD.data.skills[id];
    if (!ab || ab.cls !== p.cls) return { ok: false, why: 'Not your class' };
    const cur = p.skills[id] || 0;
    const max = ab.tier === SkillBalance.keystoneTier ? 1 : SkillBalance.maxRank;
    if (cur >= max) return { ok: false, why: 'Maximum rank' };
    const lvl = SkillBalance.tierLevel[ab.tier];
    if (p.level < lvl) return { ok: false, why: 'Requires level ' + lvl };
    if (ab.tier === SkillBalance.keystoneTier) {
      const t3 = Object.values(BD.data.skills).find((s) => s.cls === p.cls && s.branch === ab.branch && s.tier === 3);
      if (!t3 || !p.skills[t3.id]) return { ok: false, why: 'Requires a point in ' + (t3 ? t3.name : 'tier 3') };
    }
    if (!p.unspent.skill) return { ok: false, why: 'No skill points' };
    return { ok: true };
  }
  Commands.register('SpendSkill', (world, c) => {
    const p = world.player;
    const ok = canLearn(world, p, c.id);
    if (!ok.ok) return false;
    p.skills[c.id] = (p.skills[c.id] || 0) + 1;
    p.unspent.skill--;
    BD.sim.stats.bump(p);
    // auto-slot a newly learned active skill into the first free slot
    const ab = BD.data.skills[c.id];
    if (p.skills[c.id] === 1 && !ab.passive && !Object.values(p.bar).includes(c.id)) {
      for (const k of ['rmb', 's1', 's2', 's3', 's4']) {
        if (!p.bar[k]) {
          p.bar[k] = c.id;
          break;
        }
      }
    }
    if (ab.charges) {
      p.charges = p.charges || {};
      p.charges[c.id] = { n: BD.sim.abilities.maxCharges(world, p, ab), ms: 0 };
    }
    world.events.push({ type: 'skill.learn', id: c.id, rank: p.skills[c.id] });
    return true;
  }, { ui: true });
  Commands.register('SetBar', (world, c) => {
    const p = world.player;
    if (c.id && !p.skills[c.id]) return false;
    if (c.id && BD.data.skills[c.id] && BD.data.skills[c.id].passive) return false;
    for (const k in p.bar) if (p.bar[k] === c.id) p.bar[k] = null;
    p.bar[c.slot] = c.id || null;
    world.events.push({ type: 'bar.change' });
    return true;
  }, { ui: true });

  BD.sim.progression = { xpToNext, xpFor, gainXp, canLearn };
})(globalThis.BD);
