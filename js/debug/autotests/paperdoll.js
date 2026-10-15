// A sheet of each class sprite with every weapon category and offhand composited, then five full outfits
// (body armour material, helm, cloak, rarity trims, elemental blade).
BD.debug.autotests.paperdoll = (D) => {
  D.newRun({ cls: 'fighter' });
  const combos = ['', 'blade|-', 'blade2|-', 'axe|shield', 'mace|tower', 'dagger|buckler', 'claw|-',
    'staff|-', 'wand|orb', 'bow|quiver', 'crossbow|-', 'javelin|buckler',
    // full outfits: weapon|offhand|chest|helm|cloak|weapon rarity|offhand|chest|helm|cloak rarity|element
    'blade|-|leather|cap|cloak|magic|common|magic|common|common|-',
    'axe|shield|chain|helm|-|rare|rare|rare|common|common|cold',
    'blade2|-|plate|great_helm|heavy_cloak|legendary|common|legendary|rare|rare|fire',
    'bow|quiver|studded|helm|cloak|rare|common|common|legendary|magic|storm',
    'staff|-|robe|-|heavy_cloak|legendary|common|rare|common|legendary|poison',
    // armour textures (studs, chain, splint bands + shoulder plates), then four legendary kits
    'blade|-|studded|-|-', 'blade|-|chain|-|-|common|common|common|common|common|-|rare', 'blade|-|splint|helm|-',
    'mace|shield|plate|great_helm|heavy_cloak|legendary|legendary|legendary|legendary|legendary|-|legendary|-|'
      + 'holy_mace|bishops_bulwark|aegis_of_the_fallen|crown_of_embers|mantle_of_souls|lantern_of_the_lost',
    'claw|-|leather|cap|cloak|legendary|common|legendary|common|legendary|-|rare|-|nightspur|-|ashen_wraps|-|veilweave',
    'staff|orb|robe|-|cloak|legendary|legendary|legendary|common|legendary|-|-|-|stormcaller|frostbinder|cinderveil|-|tempters_cloak',
    'bow|quiver|chain|helm|cloak|legendary|legendary|rare|legendary|legendary|-|magic|-|featherfall|eagles_talon|-|'
      + 'bloodhowl_helm|galewing_mantle'];
  const arts = ['fighter', 'thief', 'magician', 'valkyrie'];
  const K = 5, CW = 22 * K, CH = 24 * K;
  const cv = document.createElement('canvas');
  cv.width = combos.length * CW + 20;
  cv.height = arts.length * CH + 40;
  cv.style.cssText = 'position:fixed;left:0;top:0;z-index:98;background:#2a2420';
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#ddd';
  g.font = '12px monospace';
  combos.forEach((c, i) => g.fillText((c || 'painted').split('|').slice(0, 3).join('|'), 10 + i * CW, 14));
  arts.forEach((a, r) => combos.forEach((c, i) => {
    const s = BD.view.sprites.get(a, 'idle', 0, { doll: c });
    if (s) g.drawImage(s.canvas, 10 + i * CW + (CW - s.w * K) / 2, 24 + r * CH, s.w * K, s.h * K);
  }));
  document.body.appendChild(cv);
};
