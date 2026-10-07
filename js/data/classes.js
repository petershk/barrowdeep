// @ts-check
// Classes (01 §5, 02). Resource, trait, starting kit, permissions, art.
(function (BD) {
  'use strict';

  BD.data.classes = {
    fighter: {
      id: 'fighter', name: 'Fighter', resource: 'rage', mainAttr: 'str', art: 'fighter',
      fantasy: 'An armoured brawler who grows stronger the longer the fight lasts.',
      verb: 'Build rage with every blow; spend it on crushing moves.',
      trait: { name: 'Momentum', desc: 'While above 50 rage: +10% damage and +10% attack speed.' },
      branches: [{ id: 'brawn', name: 'Brawn' }, { id: 'onslaught', name: 'Onslaught' }, { id: 'iron', name: 'Iron' }],
      startKit: [{ base: 'short_sword' }, { base: 'buckler' }, { base: 'leather' }],
      uses: ['blade', 'blade2', 'axe', 'mace', 'crossbow', 'buckler', 'shield', 'light', 'medium', 'heavy', 'cloak', 'amulet', 'ring'],
    },
    assassin: {
      id: 'assassin', name: 'Assassin', resource: 'energy', mainAttr: 'dex', art: 'thief',
      fantasy: 'A martial artist and trapper who stacks power and releases it.',
      verb: 'Strike to build combo charges; finish to release them.',
      trait: { name: 'Ambush', desc: '+30% damage against enemies that are unaware, feared or fleeing.' },
      branches: [{ id: 'martial', name: 'Martial Arts' }, { id: 'traps', name: 'Traps' }, { id: 'shadow', name: 'Shadow' }],
      startKit: [{ base: 'katar' }, { base: 'leather' }],
      uses: ['blade', 'dagger', 'claw', 'buckler', 'light', 'medium', 'cloak', 'amulet', 'ring'],
    },
    magician: {
      id: 'magician', name: 'Magician', resource: 'mana', mainAttr: 'mag', art: 'magician',
      fantasy: 'An elementalist who sets up one status and detonates it with another.',
      verb: 'Apply burn, chill or shock — then react.',
      trait: { name: 'Elemental Reactions', desc: 'Fire on Frozen: Thermal Shock. Cold on Shocked: Flash Freeze. Lightning on Burning: Overload.' },
      branches: [{ id: 'pyro', name: 'Pyromancy' }, { id: 'frost', name: 'Frost' }, { id: 'storm', name: 'Storm' }],
      startKit: [{ base: 'wand' }, { base: 'robe' }],
      uses: ['dagger', 'staff', 'wand', 'orb', 'light', 'cloak', 'amulet', 'ring'],
    },
    valkyrie: {
      id: 'valkyrie', name: 'Valkyrie', resource: 'focus', mainAttr: 'dex', art: 'valkyrie',
      fantasy: 'A patient archer-skirmisher: position, build focus, release a devastating shot.',
      verb: 'Hold your ground to build focus; release it in one shot.',
      trait: { name: 'Steady Hand', desc: '+4% critical strike chance per focus stack.' },
      branches: [{ id: 'marksman', name: 'Marksman' }, { id: 'skirmish', name: 'Skirmish' }, { id: 'valor', name: 'Valor' }],
      startKit: [{ base: 'short_bow' }, { base: 'quiver' }, { base: 'leather' }],
      uses: ['blade', 'bow', 'crossbow', 'javelin', 'buckler', 'quiver', 'light', 'medium', 'cloak', 'amulet', 'ring'],
    },
  };

  /** Basic attack as an ability, specialised by weapon delivery at cast time. */
  BD.data.basicAttack = {
    id: 'attack', cls: null, name: 'Attack', icon: 'attack', tags: ['attack', 'basic'], tier: 0,
    resource: { type: 'none', cost: 0 }, cooldownMs: 0, usesAttackSpeed: true,
    targeting: { mode: 'unit', range: 1, requiresLOS: true, outOfRange: 'approach' },
    delivery: { kind: 'melee' }, area: { shape: 'single' },
    effects: [{ type: 'damage', source: 'weapon', mult: 1, canCrit: true, canDodge: true }],
    cues: { cast: 'attack.cast', impact: 'attack.impact' },
    desc: 'Strike with your weapon.',
  };
})(globalThis.BD);
